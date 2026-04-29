const express = require('express');
const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../common/database');
const { authMiddleware } = require('../middleware/auth');
const { getImageConfig, getSizeForAspect, cleanPromptViaAI, sanitizePrompt, generateImageWithRetry, IMAGE_MODELS, DASHSCOPE_URL, getTestSize: getImageTestSize } = require('../services/imageService');
const {
  DEEPSEEK_PRESET, getAIConfig, gatherNovelSample,
  buildAnalysisPrompt, buildCoverPrompt, COVER_PROMPT_SYSTEM, AI_SYSTEM_PROMPT,
  parseAnalysisResponse, saveAnalysisResult,
} = require('../services/aiService');

const router = express.Router();
const uploadsDir = process.env.UPLOAD_PATH || path.join(__dirname, '..', '..', 'uploads');

// Fetch available models
router.post('/fetch-models', authMiddleware, async (req, res) => {
  const { base_url, api_key } = req.body;
  if (!base_url || !api_key) {
    return res.status(400).json({ error: '请提供 base_url 和 api_key' });
  }

  try {
    const response = await fetch(`${base_url.replace(/\/$/, '')}/models`, {
      headers: { 'Authorization': `Bearer ${api_key}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.json({ success: false, message: `获取模型列表失败 (${response.status}): ${errText.substring(0, 200)}` });
    }

    const data = await response.json();
    const models = (data.data || [])
      .map((m) => ({ id: m.id, owned_by: m.owned_by || '' }))
      .filter((m) => {
        const id = m.id.toLowerCase();
        return !id.includes('tts') && !id.includes('embedding')
          && !id.includes('moderation') && !id.includes('dall-e')
          && !id.includes('whisper') && !id.includes('audio');
      })
      .sort((a, b) => {
        const aIsChat = a.id.includes('chat') || a.id.includes('reasoner');
        const bIsChat = b.id.includes('chat') || b.id.includes('reasoner');
        if (aIsChat && !bIsChat) return -1;
        if (!aIsChat && bIsChat) return 1;
        return a.id.localeCompare(b.id);
      });

    res.json({ success: true, models });
  } catch (error) {
    res.json({ success: false, message: `连接失败: ${error.message}` });
  }
});

// Get AI configs
router.get('/configs', (req, res) => {
  const configs = db.prepare('SELECT * FROM ai_configs').all();
  res.json(configs.map(c => ({
    ...c,
    api_key: c.api_key ? '••••' + c.api_key.slice(-4) : '',
  })));
});

// DeepSeek one-click preset
router.post('/deepseek-preset', authMiddleware, (req, res) => {
  const { api_key, model } = req.body;
  if (!api_key) return res.status(400).json({ error: '请提供 DeepSeek API Key' });

  const selectedModel = model || DEEPSEEK_PRESET.model;

  db.prepare('UPDATE ai_configs SET is_default = 0').run();

  const id = uuidv4();
  db.prepare(`INSERT INTO ai_configs (id, name, base_url, api_key, model, temperature, max_tokens, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(id, DEEPSEEK_PRESET.name, DEEPSEEK_PRESET.base_url, api_key, selectedModel, DEEPSEEK_PRESET.temperature, DEEPSEEK_PRESET.max_tokens);

  res.json({
    id, name: DEEPSEEK_PRESET.name, base_url: DEEPSEEK_PRESET.base_url,
    model: selectedModel, api_key: '••••' + api_key.slice(-4),
    message: `DeepSeek 已配置，使用模型: ${selectedModel}`,
  });
});

// Available image models (imported from imageService)
router.get('/image-models', (req, res) => {
  res.json(IMAGE_MODELS);
});

// ---- Image configs (separate from text AI configs) ----

function getTestSize(model) {
  return getImageTestSize(model);
}

router.get('/image-configs', (req, res) => {
  const configs = db.prepare('SELECT * FROM image_configs ORDER BY created_at DESC').all();
  res.json(configs.map(c => ({
    ...c,
    api_key: c.api_key ? '••••' + c.api_key.slice(-4) : '',
  })));
});

router.post('/image-configs', authMiddleware, (req, res) => {
  const { id, name, api_key, model, size, is_default } = req.body;
  const configId = id || uuidv4();

  if (is_default) {
    db.prepare('UPDATE image_configs SET is_default = 0').run();
  }

  const existing = db.prepare('SELECT * FROM image_configs WHERE id = ?').get(configId);
  if (existing) {
    db.prepare('UPDATE image_configs SET name=?, api_key=?, model=?, size=?, is_default=? WHERE id=?')
      .run(name || existing.name, api_key || existing.api_key, model || existing.model,
        size || existing.size, is_default ?? existing.is_default, configId);
    res.json({ id: configId, message: '图片配置更新成功' });
  } else {
    db.prepare('INSERT INTO image_configs (id, name, api_key, model, size, is_default) VALUES (?, ?, ?, ?, ?, ?)')
      .run(configId, name || '默认图片配置', api_key || '', model || 'wan2.7-image', size || '2K', is_default ? 1 : 0);
    res.json({ id: configId, message: '图片配置创建成功' });
  }
});

router.delete('/image-configs/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM image_configs WHERE id = ?').run(req.params.id);
  res.json({ message: '图片配置删除成功' });
});

router.post('/image-configs/:id/test', authMiddleware, async (req, res) => {
  const config = db.prepare('SELECT * FROM image_configs WHERE id = ?').get(req.params.id);
  if (!config) return res.status(404).json({ error: '配置不存在' });

  try {
    const response = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        input: { messages: [{ role: 'user', content: [{ text: 'test connection, generate a tiny white square' }] }] },
        parameters: { size: getTestSize(config.model), n: 1, watermark: false },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.code) {
        res.json({ success: false, message: `${data.code}: ${data.message}` });
      } else {
        res.json({ success: true, message: `连接成功 — ${config.model}` });
      }
    } else {
      const error = await response.text();
      res.json({ success: false, message: `连接失败 (${response.status}): ${error.substring(0, 200)}` });
    }
  } catch (error) {
    res.json({ success: false, message: `连接失败: ${error.message}` });
  }
});

// Create/Update AI config
router.post('/configs', authMiddleware, (req, res) => {
  const { id, name, base_url, api_key, model, temperature, max_tokens, is_default, image_enabled, image_api_key, image_model, image_size } = req.body;
  const configId = id || uuidv4();

  if (is_default) {
    db.prepare('UPDATE ai_configs SET is_default = 0').run();
  }

  const existing = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(configId);
  if (existing) {
    db.prepare(`UPDATE ai_configs SET name=?, base_url=?, api_key=?, model=?, temperature=?, max_tokens=?, is_default=?, image_enabled=?, image_api_key=?, image_model=?, image_size=? WHERE id=?`)
      .run(
        name || existing.name, base_url || existing.base_url, api_key || existing.api_key,
        model || existing.model, temperature ?? existing.temperature, max_tokens ?? existing.max_tokens,
        is_default ?? existing.is_default, image_enabled ?? existing.image_enabled ?? 0,
        image_api_key || existing.image_api_key || '', image_model || existing.image_model || 'z-image-turbo',
        image_size || existing.image_size || '600*800', configId
      );
    res.json({ id: configId, message: '配置更新成功' });
  } else {
    db.prepare('INSERT INTO ai_configs (id, name, base_url, api_key, model, temperature, max_tokens, is_default, image_enabled, image_api_key, image_model, image_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      configId, name || 'AI', base_url || 'https://api.openai.com/v1', api_key || '',
      model || 'gpt-3.5-turbo', temperature ?? 0.7, max_tokens ?? 2000, is_default ? 1 : 0,
      image_enabled ? 1 : 0, image_api_key || '', image_model || 'z-image-turbo', image_size || '600*800'
    );
    res.json({ id: configId, message: '配置创建成功' });
  }
});

// Delete AI config
router.delete('/configs/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM ai_configs WHERE id = ?').run(req.params.id);
  res.json({ message: '配置删除成功' });
});

// Test AI connection
router.post('/configs/:id/test', authMiddleware, async (req, res) => {
  const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(req.params.id);
  if (!config) return res.status(404).json({ error: '配置不存在' });

  try {
    const response = await fetch(`${config.base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: '回复"连接成功"' }],
        max_tokens: 20, stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '';
      res.json({ success: true, message: `连接成功 — ${reply}` });
    } else {
      const error = await response.text();
      res.json({ success: false, message: `连接失败: ${response.status} - ${error.substring(0, 200)}` });
    }
  } catch (error) {
    res.json({ success: false, message: `连接失败: ${error.message}` });
  }
});

// SSE helper
function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// SSE streaming analysis (single novel)
router.get('/analyze-stream', authMiddleware, async (req, res) => {
  const { novel_id, config_id } = req.query;
  if (!novel_id) return res.status(400).json({ error: '请指定小说ID' });

  const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novel_id);
  if (!novel) return res.status(404).json({ error: '小说不存在' });

  const config = getAIConfig(config_id);
  if (!config || !config.api_key) {
    return res.status(400).json({ error: '请先配置 AI 服务（可点击"一键配置 DeepSeek"快速设置）' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    sseSend(res, 'status', { novel_id, phase: 'preparing', message: '正在准备分析...' });

    const sampleText = gatherNovelSample(novel_id);
    if (!sampleText || sampleText.length < 50) {
      sseSend(res, 'error', { novel_id, message: '小说内容不足，无法进行分析。请检查小说文件是否已正确导入（非乱码）。' });
      res.end();
      return;
    }

    sseSend(res, 'status', { novel_id, phase: 'requesting', message: '已发送请求，等待 AI 响应...' });

    const apiResponse = await fetch(`${config.base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: buildAnalysisPrompt(sampleText) }
        ],
        temperature: config.temperature, max_tokens: config.max_tokens, stream: true,
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      throw new Error(`API 请求失败 (${apiResponse.status}): ${errText.substring(0, 300)}`);
    }

    sseSend(res, 'status', { novel_id, phase: 'streaming', message: '正在接收 AI 分析结果...' });

    const reader = apiResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            sseSend(res, 'token', { novel_id, token: delta });
          }
        } catch {}
      }
    }

    sseSend(res, 'status', { novel_id, phase: 'parsing', message: '正在解析分析结果...' });
    const analysis = parseAnalysisResponse(fullContent, novel.title);
    saveAnalysisResult(novel_id, analysis);

    sseSend(res, 'result', {
      novel_id, title: analysis.title || novel.title,
      summary: analysis.summary || '', tags: analysis.tags || [],
    });
    sseSend(res, 'done', { novel_id, message: '分析完成' });
  } catch (error) {
    sseSend(res, 'error', { novel_id, message: error.message });
  }
  res.end();
});

// Batch SSE streaming analysis
router.post('/batch-analyze-stream', authMiddleware, async (req, res) => {
  const { novel_ids, config_id } = req.body;
  if (!Array.isArray(novel_ids) || novel_ids.length === 0) {
    return res.status(400).json({ error: '请选择至少一本小说' });
  }

  const config = getAIConfig(config_id);
  if (!config || !config.api_key) {
    return res.status(400).json({ error: '请先配置 AI 服务' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
  });

  sseSend(res, 'batch-start', { total: novel_ids.length, novel_ids });

  for (let idx = 0; idx < novel_ids.length; idx++) {
    const novelId = novel_ids[idx];
    const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
    if (!novel) {
      sseSend(res, 'novel-error', { novel_id: novelId, message: '小说不存在' });
      continue;
    }

    sseSend(res, 'novel-start', { novel_id: novelId, title: novel.title, index: idx + 1, total: novel_ids.length });

    try {
      const sampleText = gatherNovelSample(novelId);
      if (!sampleText || sampleText.length < 50) {
        sseSend(res, 'novel-error', { novel_id: novelId, message: '小说内容不足或为乱码，请重新导入' });
        continue;
      }

      const apiResponse = await fetch(`${config.base_url}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: buildAnalysisPrompt(sampleText) }
          ],
          temperature: config.temperature, max_tokens: config.max_tokens, stream: true,
        }),
      });

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        throw new Error(`API 错误 (${apiResponse.status}): ${errText.substring(0, 200)}`);
      }

      const reader = apiResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              sseSend(res, 'novel-token', { novel_id: novelId, token: delta });
            }
          } catch {}
        }
      }

      const analysis = parseAnalysisResponse(fullContent, novel.title);
      saveAnalysisResult(novelId, analysis);

      sseSend(res, 'novel-done', {
        novel_id: novelId, title: analysis.title || novel.title,
        summary: analysis.summary || '', tags: analysis.tags || [],
      });
    } catch (error) {
      sseSend(res, 'novel-error', { novel_id: novelId, message: error.message });
    }
  }

  sseSend(res, 'batch-done', { message: '批量分析完成' });
  res.end();
});

// Non-streaming analyze (backward compatible)
router.post('/analyze', authMiddleware, async (req, res) => {
  const { novel_id, config_id } = req.body;
  const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novel_id);
  if (!novel) return res.status(404).json({ error: '小说不存在' });

  const config = getAIConfig(config_id);
  if (!config || !config.api_key) return res.status(400).json({ error: '请先配置 AI 服务' });

  const taskId = uuidv4();
  db.prepare('INSERT INTO ai_tasks (id, novel_id, status) VALUES (?, ?, ?)').run(taskId, novel_id, 'processing');

  setImmediate(async () => {
    try {
      const sampleText = gatherNovelSample(novel_id);
      if (!sampleText || sampleText.length < 50) {
        db.prepare("UPDATE ai_tasks SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?")
          .run('小说内容不足或为乱码，请重新导入', taskId);
        return;
      }

      const response = await fetch(`${config.base_url}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: buildAnalysisPrompt(sampleText) }
          ],
          temperature: config.temperature, max_tokens: config.max_tokens,
        }),
      });

      if (!response.ok) throw new Error(`AI API 请求失败: ${response.status}`);

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      const analysis = parseAnalysisResponse(aiResponse, novel.title);

      saveAnalysisResult(novel_id, analysis);

      db.prepare("UPDATE ai_tasks SET status = 'completed', progress = 100, result = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(analysis), taskId);
    } catch (error) {
      db.prepare("UPDATE ai_tasks SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?")
        .run(error.message, taskId);
    }
  });

  res.json({ taskId, status: 'processing' });
});

// Get AI task status
router.get('/tasks/:taskId', (req, res) => {
  const task = db.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json(task);
});


// Cover generation (non-streaming)
router.post('/generate-cover', authMiddleware, async (req, res) => {
  try {
    const { novel_id, config_id } = req.body;
    const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novel_id);
    if (!novel) return res.status(404).json({ error: '小说不存在' });

    const config = getAIConfig(config_id);
    if (!config || !config.api_key) return res.status(400).json({ error: '请先配置文字分析 AI 服务' });

    const imageConfig = getImageConfig();
    if (!imageConfig || !imageConfig.api_key) {
      return res.status(400).json({ error: '请先在 AI 配置 → 图片生成中配置 API Key 和模型' });
    }

    const aiTags = novel.ai_tags ? (typeof novel.ai_tags === 'string' ? JSON.parse(novel.ai_tags) : novel.ai_tags) : [];

    const textResponse = await fetch(`${config.base_url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: COVER_PROMPT_SYSTEM },
          { role: 'user', content: buildCoverPrompt({ ai_title: novel.ai_title || novel.title, ai_summary: novel.ai_summary || novel.summary || '', ai_tags: JSON.stringify(aiTags), title: novel.title, summary: novel.summary, author: novel.author }) }
        ],
        temperature: 0.8, max_tokens: 500,
      }),
    });

    if (!textResponse.ok) {
      const errText = await textResponse.text();
      throw new Error(`提示词生成失败 (${textResponse.status}): ${errText.substring(0, 200)}`);
    }

    const textData = await textResponse.json();
    let imagePrompt = (textData.choices?.[0]?.message?.content || '').trim();
    imagePrompt = imagePrompt.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').trim();

    // Sanitize prompt: only hard-filter truly explicit terms; others get smart replacements
    const replacements = [
      // Hard filters — replace with neutral terms
      ['naked', 'clothed'],
      ['nude', 'draped'],
      ['nsfw', ''],
      ['explicit', 'dramatic'],
      ['erotic', 'romantic'],
      ['porn', ''],
      ['bondage', ''],
      ['bdsm', ''],
      ['lingerie', 'flowing robes'],
      ['underwear', 'attire'],
      // Soft filters — preserve the spirit
      ['seductive', 'alluring'],
      ['provocative', 'captivating'],
      ['gore', 'crimson'],
      ['blood', 'crimson'],
      ['violence', 'conflict'],
      ['sexual', 'intimate'],
    ];
    for (const [from, to] of replacements) {
      if (to) {
        imagePrompt = imagePrompt.replace(new RegExp(`\\b${from}\\b`, 'gi'), to);
      } else {
        imagePrompt = imagePrompt.replace(new RegExp(`\\b${from}\\b,?`, 'gi'), '');
      }
    }

    if (!imagePrompt || imagePrompt.length < 10) {
      throw new Error('生成的提示词过短，请重试');
    }

    // Generate image with retry + AI cleaning
    const { imageUrl, finalPrompt } = await generateImageWithRetry(
      imageConfig, config, imagePrompt, 'portrait'
    );

    const imageBuffer = await fetch(imageUrl).then(r => {
      if (!r.ok) throw new Error(`下载图片失败: ${r.status}`);
      return r.arrayBuffer();
    });

    const novelUploadDir = path.join(uploadsDir, 'novels', novel_id);
    await fsp.mkdir(novelUploadDir, { recursive: true });
    await fsp.writeFile(path.join(novelUploadDir, 'cover.png'), Buffer.from(imageBuffer));

    const coverUrl = `/uploads/novels/${novel_id}/cover.png`;
    db.prepare("UPDATE novels SET cover_url = ?, updated_at = datetime('now') WHERE id = ?").run(coverUrl, novel_id);

    res.json({ cover_url: coverUrl, prompt: finalPrompt });
  } catch (error) {
    console.error('[CoverGenerate]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// SSE streaming cover generation
router.get('/generate-cover-stream', authMiddleware, async (req, res) => {
  const { novel_id, config_id } = req.query;

  // Always set SSE headers first so errors reach the client
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
  });

  try {
    const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novel_id);
    if (!novel) { sseSend(res, 'error', { message: '小说不存在' }); res.end(); return; }

    const config = getAIConfig(config_id);
    if (!config || !config.api_key) { sseSend(res, 'error', { message: '请先配置文字分析 AI 服务' }); res.end(); return; }

    const imageConfig = getImageConfig();
    if (!imageConfig || !imageConfig.api_key) { sseSend(res, 'error', { message: '请先在 AI 配置 → 图片生成中配置 API Key 和模型' }); res.end(); return; }
    const aiTags = novel.ai_tags ? (typeof novel.ai_tags === 'string' ? JSON.parse(novel.ai_tags) : novel.ai_tags) : [];

    sseSend(res, 'status', { phase: 'generating-prompt', message: '正在生成封面提示词...' });

    const textResponse = await fetch(`${config.base_url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: COVER_PROMPT_SYSTEM },
          { role: 'user', content: buildCoverPrompt({ ai_title: novel.ai_title || novel.title, ai_summary: novel.ai_summary || novel.summary || '', ai_tags: JSON.stringify(aiTags), title: novel.title, summary: novel.summary, author: novel.author }) }
        ],
        temperature: 0.8, max_tokens: 500,
      }),
    });

    if (!textResponse.ok) throw new Error(`提示词生成失败 (${textResponse.status})`);

    const textData = await textResponse.json();
    let imagePrompt = (textData.choices?.[0]?.message?.content || '').trim();
    imagePrompt = imagePrompt.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').trim();

    // Sanitize prompt: only hard-filter truly explicit terms; others get smart replacements
    const replacements = [
      // Hard filters — replace with neutral terms
      ['naked', 'clothed'],
      ['nude', 'draped'],
      ['nsfw', ''],
      ['explicit', 'dramatic'],
      ['erotic', 'romantic'],
      ['porn', ''],
      ['bondage', ''],
      ['bdsm', ''],
      ['lingerie', 'flowing robes'],
      ['underwear', 'attire'],
      // Soft filters — preserve the spirit
      ['seductive', 'alluring'],
      ['provocative', 'captivating'],
      ['gore', 'crimson'],
      ['blood', 'crimson'],
      ['violence', 'conflict'],
      ['sexual', 'intimate'],
    ];
    for (const [from, to] of replacements) {
      if (to) {
        imagePrompt = imagePrompt.replace(new RegExp(`\\b${from}\\b`, 'gi'), to);
      } else {
        imagePrompt = imagePrompt.replace(new RegExp(`\\b${from}\\b,?`, 'gi'), '');
      }
    }

    sseSend(res, 'status', { phase: 'prompt-ready', prompt: imagePrompt, message: '提示词已生成，正在生成封面图...' });

    const { imageUrl, finalPrompt } = await generateImageWithRetry(
      imageConfig, config, imagePrompt, 'portrait',
      (msg) => sseSend(res, 'status', { phase: 'retrying', message: msg })
    );

    sseSend(res, 'status', { phase: 'downloading', message: '正在下载封面图片...' });

    const imageBuffer = await fetch(imageUrl).then(r => {
      if (!r.ok) throw new Error(`下载图片失败: ${r.status}`);
      return r.arrayBuffer();
    });

    const novelUploadDir = path.join(uploadsDir, 'novels', novel_id);
    await fsp.mkdir(novelUploadDir, { recursive: true });
    await fsp.writeFile(path.join(novelUploadDir, 'cover.png'), Buffer.from(imageBuffer));

    const coverUrl = `/uploads/novels/${novel_id}/cover.png`;
    db.prepare("UPDATE novels SET cover_url = ?, updated_at = datetime('now') WHERE id = ?").run(coverUrl, novel_id);

    sseSend(res, 'done', { cover_url: coverUrl, prompt: finalPrompt, message: '封面生成完成' });
  } catch (error) {
    console.error('[CoverGenerateStream]', error.message);
    sseSend(res, 'error', { message: error.message });
  }
  res.end();
});

module.exports = router;
