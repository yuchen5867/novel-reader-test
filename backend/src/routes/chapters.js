const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../common/database');
const { authMiddleware } = require('../middleware/auth');
const { accessMiddleware } = require('../middleware/access');
const { getAIConfig } = require('../services/aiService');
const { getImageConfig, generateImageWithRetry, sanitizePrompt } = require('../services/imageService');

const router = express.Router();
const uploadsDir = process.env.UPLOAD_PATH || path.join(__dirname, '..', '..', 'uploads');

const CHAPTER_SUMMARY_SYSTEM = `你是一位专业的小说编辑。根据提供的章节内容，写一段100-200字的中文摘要。

要求：
- 概括本章的主要情节、人物互动和关键事件
- 不要剧透本章结尾的悬念或转折
- 语言简洁流畅
- 直接返回摘要文本，不要任何前缀或标记`;

// Get chapters for a novel
router.get('/novels/:id/chapters', accessMiddleware, (req, res) => {
  const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(req.params.id);
  if (!novel) return res.status(404).json({ error: '小说不存在' });

  const chapters = db.prepare('SELECT id, chapter_number, title, word_count, is_extra FROM chapters WHERE novel_id = ? ORDER BY chapter_number ASC').all(req.params.id);
  res.json(chapters);
});

// Get chapter content
router.get('/novels/:id/chapters/:chapterId', accessMiddleware, (req, res) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ? AND novel_id = ?').get(req.params.chapterId, req.params.id);
  if (!chapter) return res.status(404).json({ error: '章节不存在' });

  const prev = db.prepare('SELECT id, title FROM chapters WHERE novel_id = ? AND chapter_number < ? ORDER BY chapter_number DESC LIMIT 1')
    .get(req.params.id, chapter.chapter_number);
  const next = db.prepare('SELECT id, title FROM chapters WHERE novel_id = ? AND chapter_number > ? ORDER BY chapter_number ASC LIMIT 1')
    .get(req.params.id, chapter.chapter_number);

  res.json({ ...chapter, prev: prev || null, next: next || null });
});

// Update chapter
router.put('/novels/:id/chapters/:chapterId', authMiddleware, (req, res) => {
  const { title, content } = req.body;
  db.prepare('UPDATE chapters SET title = ?, content = ?, word_count = ? WHERE id = ? AND novel_id = ?')
    .run(title || '', content || '', (content || '').length, req.params.chapterId, req.params.id);
  res.json({ message: '章节更新成功' });
});

// Reorder chapters
router.put('/novels/:id/chapters/reorder', authMiddleware, (req, res) => {
  const { orders } = req.body;
  const updateStmt = db.prepare('UPDATE chapters SET chapter_number = ? WHERE id = ? AND novel_id = ?');
  const reorderMany = db.transaction((orders) => {
    for (const order of orders) {
      updateStmt.run(order.chapter_number, order.id, req.params.id);
    }
  });
  reorderMany(orders);

  const count = db.prepare('SELECT COUNT(*) as count FROM chapters WHERE novel_id = ?').get(req.params.id);
  db.prepare("UPDATE novels SET total_chapters = ?, updated_at = datetime('now') WHERE id = ?").run(count.count, req.params.id);

  res.json({ message: '排序更新成功' });
});

// Delete chapter
router.delete('/novels/:id/chapters/:chapterId', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM chapters WHERE id = ? AND novel_id = ?').run(req.params.chapterId, req.params.id);
  res.json({ message: '章节删除成功' });
});

// Merge chapters
router.post('/novels/:id/chapters/merge', authMiddleware, (req, res) => {
  const { chapterIds } = req.body;
  if (!Array.isArray(chapterIds) || chapterIds.length < 2) {
    return res.status(400).json({ error: '请选择至少2个章节进行合并' });
  }

  const chapters = db.prepare(
    'SELECT * FROM chapters WHERE id IN (' + chapterIds.map(() => '?').join(',') + ') AND novel_id = ?'
  ).all(...chapterIds, req.params.id);
  chapters.sort((a, b) => a.chapter_number - b.chapter_number);

  const mergedTitle = chapters.map(c => c.title).join(' + ');
  const mergedContent = chapters.map(c => c.content).join('\n\n');
  const firstChapter = chapters[0];

  db.prepare('UPDATE chapters SET title = ?, content = ?, word_count = ? WHERE id = ?')
    .run(mergedTitle, mergedContent, mergedContent.length, firstChapter.id);

  const deleteStmt = db.prepare('DELETE FROM chapters WHERE id = ?');
  for (let i = 1; i < chapters.length; i++) {
    deleteStmt.run(chapters[i].id);
  }

  res.json({ message: '章节合并成功' });
});

// Split chapter
router.post('/novels/:id/chapters/:chapterId/split', authMiddleware, (req, res) => {
  const { splitIndex } = req.body;
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ? AND novel_id = ?').get(req.params.chapterId, req.params.id);
  if (!chapter) return res.status(404).json({ error: '章节不存在' });

  const part1 = chapter.content.substring(0, splitIndex);
  const part2 = chapter.content.substring(splitIndex);

  db.prepare('UPDATE chapters SET title = ?, content = ?, word_count = ? WHERE id = ?')
    .run(chapter.title + '(上)', part1, part1.length, chapter.id);

  db.prepare('INSERT INTO chapters (id, novel_id, chapter_number, title, content, word_count) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), req.params.id, chapter.chapter_number + 0.5, chapter.title + '(下)', part2, part2.length);

  const allChapters = db.prepare('SELECT id FROM chapters WHERE novel_id = ? ORDER BY chapter_number ASC').all(req.params.id);
  const updateStmt = db.prepare('UPDATE chapters SET chapter_number = ? WHERE id = ?');
  const renumber = db.transaction(() => {
    allChapters.forEach((ch, i) => { updateStmt.run(i + 1, ch.id); });
  });
  renumber();

  res.json({ message: '章节拆分成功' });
});

// Reading progress
router.get('/novels/:id/progress', accessMiddleware, (req, res) => {
  const progress = db.prepare('SELECT * FROM reading_progress WHERE novel_id = ?').get(req.params.id);
  res.json(progress || null);
});

router.put('/novels/:id/progress', accessMiddleware, (req, res) => {
  const { chapter_id, scroll_position, paragraph_index, device_info } = req.body;
  const existing = db.prepare('SELECT * FROM reading_progress WHERE novel_id = ?').get(req.params.id);

  if (existing) {
    db.prepare(`UPDATE reading_progress SET chapter_id = ?, scroll_position = ?, paragraph_index = ?, device_info = ?, updated_at = datetime('now') WHERE novel_id = ?`)
      .run(chapter_id || existing.chapter_id, scroll_position || 0, paragraph_index || 0, device_info || '', req.params.id);
  } else {
    db.prepare('INSERT INTO reading_progress (id, novel_id, chapter_id, scroll_position, paragraph_index, device_info) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), req.params.id, chapter_id, scroll_position || 0, paragraph_index || 0, device_info || '');
  }

  db.prepare("UPDATE novels SET last_read_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ message: '进度保存成功' });
});

// Bookmarks
router.get('/novels/:id/bookmarks', accessMiddleware, (req, res) => {
  const bookmarks = db.prepare(`
    SELECT b.*, c.title as chapter_title FROM bookmarks b
    JOIN chapters c ON b.chapter_id = c.id
    WHERE b.novel_id = ?
    ORDER BY b.created_at DESC
  `).all(req.params.id);
  res.json(bookmarks);
});

router.post('/novels/:id/bookmarks', accessMiddleware, (req, res) => {
  const { chapter_id, paragraph_index, note } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO bookmarks (id, novel_id, chapter_id, paragraph_index, note) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, chapter_id, paragraph_index || 0, note || '');
  res.json({ id, message: '书签添加成功' });
});

router.delete('/novels/:id/bookmarks/:bookmarkId', (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE id = ? AND novel_id = ?').run(req.params.bookmarkId, req.params.id);
  res.json({ message: '书签删除成功' });
});

// Get cached chapter summary
router.get('/novels/:id/chapters/:chapterId/summary', accessMiddleware, (req, res) => {
  const row = db.prepare(
    'SELECT * FROM chapter_summaries WHERE chapter_id = ?'
  ).get(req.params.chapterId);
  res.json(row ? { summary: row.summary, cached: true, created_at: row.created_at } : null);
});

// Generate chapter summary via AI (SSE streaming)
router.get('/novels/:id/chapters/:chapterId/summarize', accessMiddleware, async (req, res) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ? AND novel_id = ?')
    .get(req.params.chapterId, req.params.id);
  if (!chapter) return res.status(404).json({ error: '章节不存在' });

  const config = getAIConfig();

  // Set SSE headers first, before any response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // If already summarized, return cached via SSE
  const existing = db.prepare('SELECT * FROM chapter_summaries WHERE chapter_id = ?').get(req.params.chapterId);
  if (existing) {
    send('done', { summary: existing.summary, cached: true, created_at: existing.created_at, message: '使用缓存的摘要' });
    res.end();
    return;
  }

  if (!config || !config.api_key) {
    send('error', { message: '请先配置 AI 服务' });
    res.end();
    return;
  }

  try {
    // Take first ~3000 chars of the chapter as sample
    const sampleText = chapter.content.substring(0, 3000).trim();
    if (!sampleText || sampleText.length < 50) {
      send('error', { message: '章节内容不足，无法总结' });
      res.end();
      return;
    }

    send('status', { phase: 'summarizing', message: '正在生成章节摘要...' });

    const apiResponse = await fetch(`${config.base_url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: CHAPTER_SUMMARY_SYSTEM },
          { role: 'user', content: `请为以下章节写一段100-200字的中文摘要：\n\n${sampleText}` }
        ],
        temperature: 0.5, max_tokens: 400, stream: true,
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      throw new Error(`AI 请求失败 (${apiResponse.status}): ${errText.substring(0, 200)}`);
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
            send('token', { token: delta });
          }
        } catch {}
      }
    }

    const summary = fullContent.trim();

    // Cache the result
    if (summary) {
      db.prepare('INSERT OR REPLACE INTO chapter_summaries (id, chapter_id, novel_id, summary) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), req.params.chapterId, req.params.id, summary);
    }

    send('done', { summary, cached: false, message: '摘要生成完成' });
  } catch (error) {
    send('error', { message: error.message });
  }
  res.end();
});

// ---- Chapter image generation ----

const CHAPTER_IMAGE_SYSTEM = `You write image prompts for Chinese web novel chapter illustrations.

## Critical Genre Rules (MUST follow)
- The novel's category and tags are provided. RESPECT the genre relationships:
  - BL/纯爱: depict TWO MALE characters in romantic/intimate scenes. NEVER use opposite-gender pairs.
  - GL/百合: depict TWO FEMALE characters
  - BG/言情: depict one male + one female
  - 无CP: depict single character or non-romantic group scenes
- If genre is unclear, default to atmospheric solo character or landscape without clear romance

## Output Requirements
- Output ONLY an English prompt, 80-200 words
- Directly describe the specific scene from the chapter content
- Include: characters (number, gender per genre rules), action, setting, lighting, color palette, artistic style
- Use SFW language for all audiences
- Style: Chinese web novel cover art, semi-realistic anime or painterly style`;

function buildChapterImagePrompt(content, chapterTitle, novelTitle, tags) {
  const tagStr = tags.length > 0 ? tags.join('、') : '未分类';
  return `Novel: "${novelTitle}"
Category/Tags: ${tagStr}
Chapter: "${chapterTitle}"
Chapter content:
${content.substring(0, 2500)}

Write a scene illustration prompt (80-200 words English):`;
}

// Get chapter images
router.get('/novels/:id/chapters/:chapterId/images', accessMiddleware, (req, res) => {
  const images = db.prepare(
    'SELECT id, image_path, prompt, model, created_at FROM chapter_images WHERE chapter_id = ? ORDER BY created_at DESC'
  ).all(req.params.chapterId);
  res.json(images);
});

// Generate chapter image (SSE streaming)
router.get('/novels/:id/chapters/:chapterId/generate-image', accessMiddleware, async (req, res) => {
  const { model: imageModel } = req.query;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ? AND novel_id = ?')
    .get(req.params.chapterId, req.params.id);
  if (!chapter) {
    send('error', { message: '章节不存在' });
    res.end();
    return;
  }

  const config = getAIConfig();
  if (!config || !config.api_key) {
    send('error', { message: '请先配置 AI 服务' });
    res.end();
    return;
  }

  // Use separate image config (fallback to text config image fields)
  let imageConfig = db.prepare('SELECT * FROM image_configs WHERE is_default = 1').get();
  if (!imageConfig || !imageConfig.api_key) {
    if (!config.image_enabled || !config.image_api_key) {
      send('error', { message: '请先在 AI 配置 → 图片生成中配置 API Key 和模型' });
      res.end();
      return;
    }
    imageConfig = { api_key: config.image_api_key, model: config.image_model || 'wan2.7-image', size: config.image_size || '2K' };
  }

  // Check existing image count, enforce max 3
  const existingCount = db.prepare(
    'SELECT COUNT(*) as count FROM chapter_images WHERE chapter_id = ?'
  ).get(req.params.chapterId).count;

  const MAX_IMAGES = 3;
  if (existingCount >= MAX_IMAGES) {
    const oldest = db.prepare(
      'SELECT id, image_path FROM chapter_images WHERE chapter_id = ? ORDER BY created_at ASC LIMIT 1'
    ).get(req.params.chapterId);
    if (oldest) {
      try { fs.unlinkSync(oldest.image_path); } catch {}
      db.prepare('DELETE FROM chapter_images WHERE id = ?').run(oldest.id);
    }
  }

  try {
    const novel = db.prepare('SELECT n.title, n.ai_title, n.ai_tags, GROUP_CONCAT(t.name) as tag_names FROM novels n LEFT JOIN novel_tags nt ON n.id = nt.novel_id LEFT JOIN tags t ON nt.tag_id = t.id WHERE n.id = ? GROUP BY n.id').get(req.params.id);
    const novelTitle = novel.ai_title || novel.title;
    // Gather all tags: AI tags + manual tags
    const aiTags = novel.ai_tags ? (typeof novel.ai_tags === 'string' ? JSON.parse(novel.ai_tags) : novel.ai_tags) : [];
    const manualTags = novel.tag_names ? novel.tag_names.split(',') : [];
    const allTags = [...new Set([...aiTags, ...manualTags])];

    // Use chapter content directly (not summary) to generate rich prompt
    const chapterContent = (chapter.content || '').trim();
    if (!chapterContent || chapterContent.length < 50) {
      send('error', { message: '章节内容不足，无法生成插图' });
      res.end();
      return;
    }

    send('status', { phase: 'generating-prompt', message: '正在生成插图提示词...' });

    // Try AI prompt generation, fallback to content-based prompt on any failure
    let imagePrompt = '';
    try {
      const promptResponse = await fetch(`${config.base_url.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: CHAPTER_IMAGE_SYSTEM },
            { role: 'user', content: buildChapterImagePrompt(chapterContent, chapter.title, novelTitle, allTags) }
          ],
          temperature: 0.8, max_tokens: 400,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (promptResponse.ok) {
        const promptData = await promptResponse.json();
        const aiText = (promptData.choices?.[0]?.message?.content || '').trim();
        imagePrompt = aiText.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').replace(/```/g, '').trim();
      }
    } catch (e) {
      // AI prompt generation failed — will use fallback below
    }

    // If AI prompt is too short/empty, build directly from chapter content
    if (!imagePrompt || imagePrompt.length < 30) {
      const genreHint = allTags.length > 0 ? `Genre: ${allTags.join(', ')}. ` : '';
      const titleHint = novelTitle ? `From "${novelTitle}". ` : '';
      const sceneSample = chapterContent.substring(0, 800).replace(/\n/g, ' ').trim();
      imagePrompt = `${genreHint}${titleHint}Chinese web novel illustration, key scene: ${sceneSample}. Atmospheric lighting, detailed background, dramatic composition, semi-realistic anime style.`.substring(0, 500);
      send('status', { phase: 'using-fallback', message: '使用章节内容直接生成插图...' });
    } else {
      send('status', { phase: 'prompt-ready', message: '提示词已生成，正在生成插图...' });
    }

    // Sanitize prompt
    imagePrompt = sanitizePrompt(imagePrompt);

    // Use shared retry logic with AI-powered prompt cleaning
    const { imageUrl, finalPrompt } = await generateImageWithRetry(
      imageConfig, config, imagePrompt, 'landscape',
      (msg) => send('status', { phase: 'retrying', message: msg })
    );

    send('status', { phase: 'downloading', message: '正在保存图片...' });

    const imageBuffer = await fetch(imageUrl).then(r => {
      if (!r.ok) throw new Error(`下载失败: ${r.status}`);
      return r.arrayBuffer();
    });

    const imageId = uuidv4();
    const chapterImageDir = path.join(uploadsDir, 'novels', req.params.id, 'chapter-images');
    await fsp.mkdir(chapterImageDir, { recursive: true });
    const imagePath = path.join(chapterImageDir, `${imageId}.png`);
    await fsp.writeFile(imagePath, Buffer.from(imageBuffer));

    const localImageUrl = `/uploads/novels/${req.params.id}/chapter-images/${imageId}.png`;

    db.prepare('INSERT INTO chapter_images (id, chapter_id, novel_id, image_path, prompt, model) VALUES (?, ?, ?, ?, ?, ?)')
      .run(imageId, req.params.chapterId, req.params.id, localImageUrl, finalPrompt, imageModel || 'wan2.7-image');
    send('done', { image_url: localImageUrl, prompt: finalPrompt, id: imageId, message: '插图生成完成' });
  } catch (error) {
    send('error', { message: error.message });
  }
  res.end();
});

module.exports = router;
