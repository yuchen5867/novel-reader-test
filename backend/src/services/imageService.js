const { db } = require('../common/database');

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

const IMAGE_MODELS = [
  { id: 'wan2.7-image-pro', name: '万相 2.7 Pro', desc: '最新旗舰，4K高清，组图', sizes: ['1K', '2K', '4K'], type: 'wan' },
  { id: 'wan2.7-image', name: '万相 2.7', desc: '速度更快', sizes: ['1K', '2K'], type: 'wan' },
  { id: 'qwen-image-2.0-pro', name: '千问 2.0 Pro', desc: '文字渲染强，真实质感', sizes: ['1024*1024', '1536*1536', '2048*2048'], type: 'qwen' },
  { id: 'qwen-image-2.0', name: '千问 2.0', desc: '加速版，兼顾效果速度', sizes: ['1024*1024', '1536*1536', '2048*2048'], type: 'qwen' },
  { id: 'z-image-turbo', name: 'z-image-turbo', desc: '轻量快速', sizes: ['600*800', '1024*1024'], type: 'other' },
];

function getImageConfig(configId) {
  if (configId) return db.prepare('SELECT * FROM image_configs WHERE id = ?').get(configId);
  let config = db.prepare('SELECT * FROM image_configs WHERE is_default = 1').get();
  if (!config) config = db.prepare('SELECT * FROM image_configs ORDER BY created_at DESC LIMIT 1').get();
  return config;
}

function getSizeForAspect(model, aspect) {
  const m = IMAGE_MODELS.find(m => m.id === model) || {};
  if (m.type === 'wan') {
    if (aspect === 'portrait') return '1728*2368';
    if (aspect === 'landscape') return '2688*1536';
    return '2048*2048';
  }
  if (m.type === 'qwen') {
    if (aspect === 'portrait') return '1080*1440';
    if (aspect === 'landscape') return '1920*1080';
    return '1024*1024';
  }
  if (aspect === 'portrait') return '600*800';
  if (aspect === 'landscape') return '1024*576';
  return '1024*1024';
}

function getTestSize(model) {
  const m = IMAGE_MODELS.find(m => m.id === model);
  if (!m) return '1024*1024';
  return m.type === 'wan' ? '1K' : '1024*1024';
}

const PROMPT_CLEANER_SYSTEM = `You are a professional creative prompt rewriter for Chinese web novel illustrations.

Your task: rewrite an image generation prompt so it passes AI content safety filters while PRESERVING the core artistic vision, mood, and narrative essence.

Rules:
- Remove ONLY words that could trigger adult/NSFW content filters
- Replace sensitive terms with artistic, poetic, or atmospheric alternatives
- Preserve: art style, color palette, composition, lighting, character poses, costumes, setting, emotional tone
- Keep genre-appropriate atmosphere (dark, mysterious, romantic, dramatic, intense, passionate are ALL fine)
- If a scene involves romance, describe it as "intimate moment" "tender embrace" "romantic atmosphere"
- If a scene is dark/gothic, use "dramatic shadows" "mysterious ambiance" "brooding atmosphere"
- NEVER use: naked, nude, explicit, porn, nsfw, sexual, erotic, bondage, bdsm, hentai
- Output ONLY the cleaned prompt text, no explanation, no markdown`;

async function cleanPromptViaAI(textConfig, rejectedPrompt, rejectionReason) {
  const response = await fetch(`${textConfig.base_url.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${textConfig.api_key}` },
    body: JSON.stringify({
      model: textConfig.model,
      messages: [
        { role: 'system', content: PROMPT_CLEANER_SYSTEM },
        { role: 'user', content: `The following image prompt was rejected: "${rejectionReason}"\n\nOriginal prompt: "${rejectedPrompt}"\n\nRewrite it to pass safety filters while keeping the artistic vision:` }
      ],
      temperature: 0.3, max_tokens: 500,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`提示词清洗失败 (${response.status}): ${errText.substring(0, 200)}`);
  }
  const data = await response.json();
  let cleaned = (data.choices?.[0]?.message?.content || rejectedPrompt).trim();
  cleaned = cleaned.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').trim();
  return cleaned || rejectedPrompt;
}

// Also apply keyword-level sanitization as a safety net
function sanitizePrompt(prompt) {
  const replacements = [
    ['naked', 'clothed'], ['nude', 'draped'], ['nsfw', ''], ['explicit', 'dramatic'],
    ['erotic', 'romantic'], ['porn', ''], ['bondage', ''], ['bdsm', ''],
    ['lingerie', 'flowing robes'], ['underwear', 'attire'], ['seductive', 'alluring'],
    ['provocative', 'captivating'], ['gore', 'crimson'], ['blood', 'crimson'],
    ['violence', 'conflict'], ['sexual', 'intimate'],
  ];
  for (const [from, to] of replacements) {
    if (to) prompt = prompt.replace(new RegExp(`\\b${from}\\b`, 'gi'), to);
    else prompt = prompt.replace(new RegExp(`\\b${from}\\b,?`, 'gi'), '');
  }
  return prompt;
}

/**
 * Try to generate an image with retry and AI-powered prompt cleaning.
 *
 * @param {object} imageConfig - { api_key, model }
 * @param {object} textConfig   - { base_url, api_key, model } for prompt cleaning
 * @param {string} prompt       - initial image prompt
 * @param {string} aspect       - 'portrait' | 'landscape' | 'square'
 * @param {function} onStatus   - optional callback(statusMessage)
 * @param {number} maxRetries   - max retries (default 3)
 * @returns {{ imageUrl: string, finalPrompt: string }}
 */
async function generateImageWithRetry(imageConfig, textConfig, prompt, aspect, onStatus, maxRetries = 3) {
  if (!prompt || prompt.trim().length < 10) {
    throw new Error('提示词过短或为空，无法生成图片');
  }

  let currentPrompt = sanitizePrompt(prompt.trim());
  // Ensure prompt is never empty after sanitization
  if (!currentPrompt || currentPrompt.trim().length < 10) {
    currentPrompt = prompt.trim(); // use original if sanitization cleared too much
  }

  let lastError = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (onStatus && attempt > 0) {
      onStatus(`AI 正在优化提示词并重试 (第${attempt}次)...`);
    }

    // Call image API
    let imgResp;
    try {
      imgResp = await fetch(DASHSCOPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${imageConfig.api_key}` },
        body: JSON.stringify({
          model: imageConfig.model || 'wan2.7-image',
          input: { messages: [{ role: 'user', content: [{ text: currentPrompt }] }] },
          parameters: { size: getSizeForAspect(imageConfig.model, aspect), n: 1, watermark: false, prompt_extend: true },
        }),
        signal: AbortSignal.timeout(120000),
      });
    } catch (e) {
      throw new Error(`图片 API 网络错误: ${e.message}`);
    }

    if (!imgResp.ok) {
      const errText = await imgResp.text();
      let errData; try { errData = JSON.parse(errText); } catch { errData = {}; }
      lastError = errData.message || `HTTP ${imgResp.status}`;

      // Retry on content safety failures
      if ((errData.code === 'DataInspectionFailed' || errData.code === 'InvalidParameter') && attempt < maxRetries - 1) {
        currentPrompt = await cleanPromptViaAI(textConfig, currentPrompt, lastError);
        continue;
      }
      throw new Error(`图片生成失败 (${imgResp.status}): ${errText.substring(0, 500)}`);
    }

    const imgData = await imgResp.json();

    if (imgData.code) {
      lastError = `${imgData.code}: ${imgData.message}`;
      if ((imgData.code === 'DataInspectionFailed' || imgData.code === 'InvalidParameter') && attempt < maxRetries - 1) {
        currentPrompt = await cleanPromptViaAI(textConfig, currentPrompt, lastError);
        continue;
      }
      throw new Error(`图片生成失败: ${imgData.message} (${imgData.code})`);
    }

    const imageUrl = imgData.output?.choices?.[0]?.message?.content?.find(c => c.image)?.image;
    if (!imageUrl) {
      const rawOutput = JSON.stringify(imgData).substring(0, 500);
      throw new Error(`未获取到图片URL，API 返回: ${rawOutput}`);
    }

    return { imageUrl, finalPrompt: currentPrompt };
  }

  throw new Error(`图片生成失败：已尝试 ${maxRetries} 次优化\n最后错误: ${lastError}`);
}

module.exports = {
  IMAGE_MODELS, DASHSCOPE_URL,
  getImageConfig, getSizeForAspect, getTestSize,
  cleanPromptViaAI, sanitizePrompt, generateImageWithRetry,
};
