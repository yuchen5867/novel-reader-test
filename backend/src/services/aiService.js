const fs = require('fs');
const { db } = require('../common/database');
const { safeDecode, validateDecodedText, chineseTextScoreExtended } = require('../common/chapterRecognition');

const DEEPSEEK_PRESET = {
  name: 'DeepSeek',
  base_url: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.7,
  max_tokens: 4096,
};

const AI_SYSTEM_PROMPT = `你是一位资深的中文网络小说编辑，精通海棠文学城和晋江文学城的风格标签体系。你的任务是分析小说内容并提取关键信息。

## 分析要求
1. **标题识别**：从文件名或正文开头准确提取小说标题，去除无关前缀后缀（如网站名、序号）
2. **概要生成**：200-500字剧情概要，概括核心设定、主线冲突和主角特点，避免剧透关键转折
3. **标签分类**：从以下标签体系中选择匹配标签

## 海棠风格标签
性向：BL、GL、BG、GB、无CP
题材：现代、古代、玄幻、科幻、末世、ABO、虫族、星际
风格：正剧、轻松、暗黑、虐文、甜文、爽文
特殊：NP、万人迷、强受、生子、骨科、年下、包养

## 晋江风格标签
性向：纯爱、言情、百合、无CP
题材：近代现代、古色古香、幻想未来、游戏网游、悬疑
风格：轻松、正剧、悲剧、暗黑
主角：美强惨、万人迷、升级流、基建、种田
配角：忠犬、病娇、白月光、替身`;

const COVER_PROMPT_SYSTEM = `你是一位专业的小说封面设计提示词撰写专家。根据小说的标题、概要和标签，生成一个用于 AI 文生图模型的英文提示词。

## 约束
- 描述场景氛围、人物气质、色彩搭配、构图风格和装饰元素
- 如果小说含有成人向标签，用"intimate romance" "dark atmospheric" "mysterious allure" "forbidden passion"等文艺化表达替代直白描述
- 不要使用 explicit、porn、nsfw、hentai 等明显违规词汇

## 风格要求
- 使用英文撰写以提高生图质量
- 描述小说的氛围、风格、关键视觉元素和色彩基调
- 字数控制在 200 字以内
- 风格偏向中国网络小说封面风格，构图要有视觉冲击力
- 仅返回提示词文本，不要任何额外说明或代码块标记`;

function getAIConfig(configId) {
  if (configId) {
    return db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(configId);
  }
  return db.prepare('SELECT * FROM ai_configs WHERE is_default = 1').get();
}

function gatherNovelSample(novelId) {
  const chapters = db.prepare(
    'SELECT title, content FROM chapters WHERE novel_id = ? AND content IS NOT NULL AND content != \'\' ORDER BY chapter_number ASC LIMIT 20'
  ).all(novelId);

  if (chapters.length === 0) return '';

  const parts = [];
  let total = 0;
  for (const ch of chapters) {
    if (total >= 15000) break;
    const snippet = ch.content.substring(0, 2000).trim();
    if (snippet.length > 10) {
      const quality = chineseTextScoreExtended(snippet);
      if (quality.score === 0) continue;
      parts.push(`【${ch.title}】\n${snippet}`);
      total += snippet.length;
    }
  }

  if (parts.length === 0) {
    const novel = db.prepare('SELECT source_file_path FROM novels WHERE id = ?').get(novelId);
    if (novel && novel.source_file_path && fs.existsSync(novel.source_file_path)) {
      try {
        const fileBuffer = fs.readFileSync(novel.source_file_path);
        const { text } = safeDecode(fileBuffer);
        const recovered = text.substring(0, 15000);
        if (recovered.length > 50 && validateDecodedText(recovered) !== null) {
          return recovered;
        }
      } catch (e) { /* source file unavailable */ }
    }
  }

  return parts.join('\n\n');
}

function buildAnalysisPrompt(sampleText) {
  return `请分析以下小说内容，严格按JSON格式返回结果（不要包含markdown代码块标记）：

{
  "title": "准确的小说标题",
  "summary": "200-500字剧情概要（禁止剧透关键转折）",
  "tags": ["标签1", "标签2", ...]
}

小说内容：
${sampleText}`;
}

function buildCoverPrompt(novel) {
  return `请为以下小说生成封面设计提示词：
标题：${novel.ai_title || novel.title}
概要：${novel.ai_summary || novel.summary || '暂无'}
标签：${(novel.ai_tags ? JSON.parse(novel.ai_tags) : []).join('、')}
作者：${novel.author || '未知'}

要求：生成一个英文的AI文生图提示词，直接返回提示词文本。`;
}

function parseAnalysisResponse(fullContent, fallbackTitle) {
  try {
    const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : fullContent);
  } catch {
    return { title: fallbackTitle, summary: fullContent.substring(0, 500), tags: [] };
  }
}

function saveAnalysisResult(novelId, analysis) {
  db.prepare("UPDATE novels SET ai_title = ?, ai_summary = ?, ai_tags = ?, updated_at = datetime('now') WHERE id = ?")
    .run(analysis.title || '', analysis.summary || '', JSON.stringify(analysis.tags || []), novelId);
}

module.exports = {
  DEEPSEEK_PRESET, AI_SYSTEM_PROMPT, COVER_PROMPT_SYSTEM,
  getAIConfig, gatherNovelSample, buildAnalysisPrompt, buildCoverPrompt,
  parseAnalysisResponse, saveAnalysisResult,
};
