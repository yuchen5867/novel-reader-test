/**
 * Chinese Novel Chapter Recognition Engine
 * Supports multiple chapter title formats commonly found in Chinese web novels.
 *
 * Key improvements over naive regex matching:
 *  - Context validation: a real chapter heading is almost always surrounded by blank lines
 *  - Density filter: too many candidates in close proximity → false positives
 *  - Weak-pattern gating: low-priority patterns are only used when strong ones are absent
 *  - Punctuation guard: lines ending in 。！？… are body text, not headings
 */

// ---- Chapter title patterns ordered by priority ----

const CHAPTER_PATTERNS = [
  // === Strong patterns (priority >= 8): highly reliable ===

  // 数字型: "第1章", "第01章", "第一章", "第壹章"
  {
    regex: /^第[0-9０-９零一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟\d]+[章節回卷集部篇].*/,
    priority: 10,
    type: 'numbered'
  },
  // 卷/集型: "第X卷 xxx", "第一卷 xxx"
  {
    regex: /^第[零一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟\d]+[卷集部册].*/,
    priority: 10,
    type: 'volume'
  },
  {
    regex: /^[卷集部册][\s]*[零一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟\d]+.*/,
    priority: 9,
    type: 'volume'
  },
  // 特殊括号标记: "【第一章】"
  {
    regex: /^【.*[第章回卷].*】.*/,
    priority: 9,
    type: 'bracket'
  },
  // 括号型: "(1)", "（1）"
  {
    regex: /^[（(]\s*(?:第\s*)?[0-9０-９零一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟\d]+\s*[）)]\s*.*/,
    priority: 9,
    type: 'numbered'
  },
  // 番外/序言/楔子等特殊章节 (strong – standalone markers)
  {
    regex: /^(?:番外[^\n]{0,20}|楔子|序[章言篇]|前言|引[子言]|后记|尾声|终章|大结局|完结感言|上架感言)\s*$/,
    priority: 11,
    type: 'special'
  },
  // 英文标记: "Chapter 1", "Ch.1", "CH1"
  {
    regex: /^(?:Chapter|Ch\.?|CH|Episode|Act)\s*\d+.*/i,
    priority: 8,
    type: 'english'
  },
  // 上中下册
  {
    regex: /^[上下中][册集卷部篇]\s*$/,
    priority: 8,
    type: 'volume'
  },

  // === Medium patterns (priority 5-7): need context confirmation ===

  // 数字+标点: "1." "1、" "1 "  – 仅当后面跟的文本很短(标题级别)且不在正文中间
  {
    regex: /^[0-9０-９]+\s*[\.、．]\s*\S.{0,40}$/,
    priority: 6,
    type: 'numbered',
    needContext: true,
  },
  // 纯数字行首: "1 标题文字"
  {
    regex: /^[0-9０-９]+\s+\S.{1,40}$/,
    priority: 5,
    type: 'numbered',
    needContext: true,
  },

  // === Weak patterns (priority < 5): last resort ===

  // 带关键词的短行
  {
    regex: /^.{0,6}(?:前言|楔子|引子|序言|后记|尾声|番外|结局|附录).{0,10}$/,
    priority: 4,
    type: 'special',
    needContext: true,
  },
  // 标题型短行: 纯粹作为最后的fallback，需要极严格的上下文条件
  {
    regex: /^[^\s　\p{P}]{3,25}$/u,
    priority: 2,
    type: 'content',
    needContext: true,
  },
];

// ---- Constants ----

const MIN_CHAPTER_LENGTH = 100;       // chars – smaller → merge with neighbour
const MAX_CHAPTER_LENGTH = 20000;     // chars – larger → warn about missed split

// ---- Helpers ----

function isBlankLine(line) {
  return !line || /^[\s\r\n]*$/.test(line);
}

function isPunctuationEnding(line) {
  // Lines ending with sentence-final punctuation are almost certainly body text
  return /[。！？…—」』”"\.,，；;：:]$/.test(line.trim());
}

function countLeadingSpaces(line) {
  const m = line.match(/^[ 　\t]+/);
  return m ? m[0].length : 0;
}

/**
 * Check if a text string looks like valid Chinese content.
 * Returns a score: higher = more likely to be correct Chinese text.
 */
function chineseTextScore(text) {
  const sample = text.substring(0, 5000);
  let chineseChars = 0;
  let replacementChars = 0;
  let totalChars = 0;

  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    totalChars++;
    // Unicode ranges for Chinese characters
    if ((code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified
        (code >= 0x3400 && code <= 0x4DBF) ||  // CJK Ext-A
        (code >= 0x20000 && code <= 0x2A6DF) || // CJK Ext-B
        (code >= 0xF900 && code <= 0xFAFF) ||  // CJK Compat
        (code >= 0x3000 && code <= 0x303F)) {  // CJK Punctuation
      chineseChars++;
    }
    // Common garbled text indicators
    if (code === 0xFFFD || code === 0xFFFE || code === 0xFFFF) {
      replacementChars++;
    }
    // Extreme latin-1 mojibake range
    if (code >= 0x0080 && code <= 0x00FF && chineseChars === 0) {
      replacementChars++;
    }
  }

  if (totalChars === 0) return 0;
  const chineseRatio = chineseChars / Math.max(totalChars, 1);
  const replacementRatio = replacementChars / Math.max(totalChars, 1);

  // High Chinese ratio + low replacement ratio = good encoding
  if (chineseRatio > 0.3 && replacementRatio < 0.05) return 3;
  if (chineseRatio > 0.1 && replacementRatio < 0.1) return 2;
  if (replacementRatio > 0.1) return 0; // likely garbled
  return 1;
}

/**
 * Detect the best encoding for a buffer.
 * Strategy:
 *   1. Check BOM first (authoritative).
 *   2. Sample from up to 5 positions spread across the file.
 *   3. Score each candidate encoding at each position, aggregate scores.
 *   4. Tie-breaking: prefer the encoding with higher total Chinese character count.
 *   5. Fallback to jschardet if all scores are zero.
 */
function detectEncoding(buffer) {
  const iconv = require('iconv-lite');

  // BOM check (authoritative)
  if (buffer.length >= 3) {
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return 'utf-8';
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf-16le';
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf-16be';
  }

  // Sample multiple positions to avoid a metadata-heavy beginning
  const SAMPLE_SIZE = 64 * 1024; // 64KB per position
  const positions = [];
  const totalLen = buffer.length;

  // Always include the beginning
  positions.push(0);
  // Add positions at 15%, 35%, 55%, 75% of the file (skip if file is small)
  if (totalLen > SAMPLE_SIZE * 2) {
    positions.push(Math.floor(totalLen * 0.15));
    positions.push(Math.floor(totalLen * 0.35));
    if (totalLen > SAMPLE_SIZE * 3) {
      positions.push(Math.floor(totalLen * 0.55));
      positions.push(Math.floor(totalLen * 0.75));
    }
  }

  // Collect samples
  const samples = positions.map(pos => {
    const start = Math.max(0, pos - SAMPLE_SIZE / 2);
    const end = Math.min(totalLen, start + SAMPLE_SIZE);
    return buffer.subarray(start, end);
  });

  const candidates = ['utf-8', 'gbk', 'gb2312', 'gb18030'];

  // Aggregate scores across all samples
  const totalScores = {};   // sum of scores
  const totalChinese = {};  // tie-breaker: total Chinese chars found
  for (const enc of candidates) {
    totalScores[enc] = 0;
    totalChinese[enc] = 0;
  }

  for (const sample of samples) {
    for (const enc of candidates) {
      try {
        const decoded = iconv.decode(sample, enc);
        const { score, chineseCount } = chineseTextScoreExtended(decoded);
        totalScores[enc] += score;
        totalChinese[enc] += chineseCount;
      } catch (e) {
        // encoding not supported
      }
    }
  }

  // Pick best: highest total score, tie-break by Chinese char count
  let bestEncoding = 'utf-8';
  let bestScore = -1;
  let bestChinese = 0;

  for (const enc of candidates) {
    if (totalScores[enc] > bestScore ||
        (totalScores[enc] === bestScore && totalChinese[enc] > bestChinese)) {
      bestScore = totalScores[enc];
      bestEncoding = enc;
      bestChinese = totalChinese[enc];
    }
  }

  // If all encodings scored zero, fall back to jschardet
  if (bestScore <= 0) {
    try {
      const jschardet = require('jschardet');
      const sample = buffer.length > 256 * 1024 ? buffer.subarray(0, 256 * 1024) : buffer;
      const result = jschardet.detect(sample);
      if (result && result.encoding && result.confidence > 0.7) {
        return mapDetectedEncoding(result.encoding);
      }
    } catch (e) { /* ignore */ }
  }

  return bestEncoding;
}

// Maps jschardet encoding names to iconv-lite names
function mapDetectedEncoding(enc) {
  const m = {
    'gb2312': 'gbk',
    'gb18030': 'gb18030',
    'big5': 'big5',
    'shift_jis': 'shiftjis',
    'euc-jp': 'eucjp',
    'euc-kr': 'euckr',
  };
  return m[enc.toLowerCase()] || enc.toLowerCase();
}

/**
 * Extended version of chineseTextScore that also returns the raw Chinese character count
 * (used as a tie-breaker in multi-position detection).
 */
function chineseTextScoreExtended(text) {
  const sample = text.substring(0, 5000);
  let chineseChars = 0;
  let replacementChars = 0;
  let totalChars = 0;

  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    totalChars++;
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0x3000 && code <= 0x303F)) {
      chineseChars++;
    }
    // Surrogate pair: peek at the full code point
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < sample.length) {
      const next = sample.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        const full = ((code - 0xD800) * 0x400) + (next - 0xDC00) + 0x10000;
        i++; // consume low surrogate
        totalChars--; // don't double-count
        if (full >= 0x20000 && full <= 0x2A6DF) {
          chineseChars++;
        }
      }
    }
    if (code === 0xFFFD || code === 0xFFFE || code === 0xFFFF) {
      replacementChars++;
    }
    if (code >= 0x0080 && code <= 0x00FF && chineseChars === 0) {
      replacementChars++;
    }
  }

  if (totalChars === 0) return { score: 0, chineseCount: 0 };
  const chineseRatio = chineseChars / totalChars;
  const replacementRatio = replacementChars / totalChars;

  let score;
  if (chineseRatio > 0.3 && replacementRatio < 0.05) score = 3;
  else if (chineseRatio > 0.1 && replacementRatio < 0.1) score = 2;
  else if (replacementRatio > 0.1) score = 0;
  else score = 1;

  return { score, chineseCount: chineseChars };
}

function decodeBuffer(buffer, encoding) {
  const iconv = require('iconv-lite');
  try {
    return iconv.decode(buffer, encoding || 'utf-8');
  } catch (e) {
    return iconv.decode(buffer, 'utf-8');
  }
}

/**
 * Validate that decoded text contains readable Chinese content.
 * If the text appears garbled, returns null; otherwise returns quality score 0-3.
 */
function validateDecodedText(text) {
  // Use a larger sample for validation (10KB of meaningful content)
  const sample = text.substring(0, 10000);
  const { score, chineseCount } = chineseTextScoreExtended(sample);

  // Score 3 = definitely valid, score 2 = likely valid
  if (score >= 2) return score;

  // Score 1 = ambiguous — check by looking deeper into the text
  if (score === 1) {
    const deeperSample = text.substring(Math.min(text.length / 2, 50000), Math.min(text.length / 2 + 10000, text.length));
    const deeper = chineseTextScoreExtended(deeperSample);
    if (deeper.score >= 2) return deeper.score;
    if (deeper.score === 1 && deeper.chineseCount > 10) return 1;
    return null; // ambiguous even in the middle — treat as garbled
  }

  // Score 0 = garbled
  return null;
}

/**
 * Safely decode a buffer with encoding fallback.
 * Validates the result: if the primary encoding produces garbled text,
 * automatically tries alternatives.
 *
 * Returns { text, encoding } where encoding is the one that produced valid output.
 */
function safeDecode(buffer) {
  const iconv = require('iconv-lite');

  const detected = detectEncoding(buffer);
  const text = iconv.decode(buffer, detected);
  const validation = validateDecodedText(text);

  if (validation !== null) {
    return { text: normalizeText(text), encoding: detected };
  }

  // Primary encoding failed validation — try alternatives
  const alternatives = ['utf-8', 'gbk', 'gb2312', 'gb18030']
    .filter(e => e !== detected);

  for (const alt of alternatives) {
    try {
      const altText = iconv.decode(buffer, alt);
      const altValidation = validateDecodedText(altText);
      if (altValidation !== null) {
        return { text: normalizeText(altText), encoding: alt };
      }
    } catch (e) { /* skip */ }
  }

  // All failed — return the original with a flag
  return { text: normalizeText(text), encoding: detected, warning: 'content_may_be_garbled' };
}

function normalizeText(text) {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/﻿/g, '');
}

// ---- Core recognition ----

/**
 * Check whether a line at `lineIndex` sits in a context that looks like a real chapter heading.
 *
 * Real chapter headings:
 *  - Are preceded by a blank line (or are the first non-blank line of the file)
 *  - Are NOT followed by contiguous body text on the same line
 *  - Do NOT end in sentence-final punctuation
 *  - The line AFTER the heading is typically indented body text or blank
 *
 * @returns {boolean}
 */
function hasHeadingContext(lines, lineIndex) {
  const totalLines = lines.length;

  // 1. Preceding line should be blank (or this is the very first content line)
  if (lineIndex > 0) {
    const prevLine = lines[lineIndex - 1];
    if (!isBlankLine(prevLine)) {
      // Allow exception: previous line could be another heading (e.g. "卷X" then "第X章")
      const prevTrimmed = prevLine.trim();
      const isPrevHeading = CHAPTER_PATTERNS.some(p =>
        p.priority >= 8 && p.regex.test(prevTrimmed)
      );
      if (!isPrevHeading) {
        return false;
      }
    }
  }

  // 2. Next non-blank line should exist (i.e. this isn't the last line of a section
  //    with no body text following)
  let nextNonBlankIdx = lineIndex + 1;
  while (nextNonBlankIdx < totalLines && isBlankLine(lines[nextNonBlankIdx])) {
    nextNonBlankIdx++;
  }
  if (nextNonBlankIdx >= totalLines) {
    // Last heading in file – accept as long as there's ANY content after it
    const textAfter = lines.slice(lineIndex + 1).join('\n').trim();
    if (textAfter.length < 10) return false;
  }

  return true;
}

/**
 * Check whether a candidate is too close to other candidates.
 * Real chapters are spaced apart; too many candidates in a short span indicates
 * the pattern is firing on body text.
 */
function isTooDense(candidates, currentIdx, windowSize = 5, maxInWindow = 3) {
  const curr = candidates[currentIdx];
  let count = 0;
  for (let i = Math.max(0, currentIdx - windowSize); i < Math.min(candidates.length, currentIdx + windowSize); i++) {
    if (Math.abs(candidates[i].lineIndex - curr.lineIndex) < 200) {
      count++;
    }
  }
  return count > maxInWindow;
}

function recognizeChapters(rawText) {
  const text = normalizeText(rawText);
  const lines = text.split('\n');
  const totalLines = lines.length;

  // ---- Pass 1: collect ALL candidates ----
  const allCandidates = [];

  for (let i = 0; i < totalLines; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (isBlankLine(trimmed)) continue;

    for (const pattern of CHAPTER_PATTERNS) {
      if (pattern.regex.test(trimmed)) {
        // Context filter for patterns that need it AND for weak patterns
        const needsCtx = pattern.needContext || pattern.priority <= 5;
        if (needsCtx && !hasHeadingContext(lines, i)) {
          continue;
        }

        // Punctuation guard: headings don't end with sentence markers
        if (pattern.priority < 8 && isPunctuationEnding(trimmed)) {
          continue;
        }

        // Leading whitespace guard: real headings rarely have much indentation
        if (pattern.priority < 7 && countLeadingSpaces(line) >= 4) {
          continue;
        }

        allCandidates.push({
          lineIndex: i,
          title: trimmed.substring(0, 80),
          type: pattern.type,
          priority: pattern.priority,
        });
        break; // first matching pattern wins
      }
    }
  }

  // ---- Pass 2: density filter ----
  // Remove weak candidates in overly dense regions (false positive clusters)
  const filteredCandidates = [];
  for (let i = 0; i < allCandidates.length; i++) {
    const cand = allCandidates[i];
    if (cand.priority < 7 && isTooDense(allCandidates, i)) {
      continue;
    }
    filteredCandidates.push(cand);
  }

  // ---- Pass 3: deduplicate nearby candidates ----
  const deduped = [];
  for (let i = 0; i < filteredCandidates.length; i++) {
    const curr = filteredCandidates[i];
    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1];
      // If within 3 lines of previous, keep higher priority
      if (curr.lineIndex - prev.lineIndex <= 3 && curr.priority <= prev.priority) {
        // If they're basically the same detection, skip; otherwise keep both
        if (curr.lineIndex - prev.lineIndex <= 1) continue;
      }
    }
    deduped.push(curr);
  }

  // ---- Pass 4: re-validate with spacing ----
  // Real chapters have roughly consistent spacing. Calculate median gap.
  if (deduped.length >= 3) {
    const gaps = [];
    for (let i = 1; i < deduped.length; i++) {
      gaps.push(deduped[i].lineIndex - deduped[i - 1].lineIndex);
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)];

    // Remove outliers: chapters that are way too close to neighbors
    // (less than 20% of median gap) and have low priority
    const validated = [deduped[0]]; // keep first
    for (let i = 1; i < deduped.length; i++) {
      const gap = deduped[i].lineIndex - deduped[i - 1].lineIndex;
      if (gap < medianGap * 0.15 && deduped[i].priority < 7) {
        // Too close to previous, and not a strong marker → likely false positive
        // Merge into previous chapter's content instead
        continue;
      }
      validated.push(deduped[i]);
    }
    // Replace deduped with validated
    deduped.length = 0;
    deduped.push(...validated);
  }

  // ---- Pass 5: extract chapter content ----
  const chapters = [];

  if (deduped.length === 0) {
    const content = text.trim();
    if (content.length > 0) {
      chapters.push({ title: '正文', content, type: 'auto', priority: 0 });
    }
    return chapters;
  }

  // Text before first recognized heading
  if (deduped[0].lineIndex > 0) {
    const preText = lines.slice(0, deduped[0].lineIndex).join('\n').trim();
    if (preText.length > 0) {
      if (preText.length < MIN_CHAPTER_LENGTH * 5) {
        chapters.push({ title: '前言/简介', content: preText, type: 'preface', priority: 8 });
      } else {
        chapters.push({ title: '第1章', content: preText, type: 'auto', priority: 8 });
      }
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const startLine = deduped[i].lineIndex;
    const endLine = i < deduped.length - 1 ? deduped[i + 1].lineIndex : totalLines;
    const content = lines.slice(startLine + 1, endLine).join('\n').trim();

    chapters.push({
      title: deduped[i].title,
      content,
      type: deduped[i].type,
      priority: deduped[i].priority,
    });
  }

  // ---- Pass 6: merge only spurious splits ----
  // Strong patterns (priority >= 8) are trusted – never merged.
  // Weak patterns with tiny content are candidates for merging.
  const merged = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];

    // Strong pattern: trust it, keep as-is (even if content is short)
    if (ch.priority >= 8) {
      if (ch.content.length > MAX_CHAPTER_LENGTH) {
        ch.warningLarge = true;
      }
      merged.push(ch);
      continue;
    }

    // Weak pattern with almost no content → absorb into next chapter
    if (ch.content.length < MIN_CHAPTER_LENGTH && i < chapters.length - 1) {
      chapters[i + 1].title = ch.title;
      chapters[i + 1].content = ch.content + '\n\n' + chapters[i + 1].content;
      chapters[i + 1].type = 'merged';
      continue;
    }

    if (ch.content.length > MAX_CHAPTER_LENGTH) {
      ch.warningLarge = true;
    }

    merged.push(ch);
  }

  // ---- Pass 7: assign chapter numbers ----
  let chapterNum = 0;
  for (const ch of merged) {
    if (ch.type === 'preface' || ch.type === 'special') {
      if (['楔子', '前言', '序言', '引子'].some(k => ch.title.includes(k))) {
        ch.chapterNumber = 0;
        ch.isExtra = false;
      } else if (['番外', '后记', '尾声'].some(k => ch.title.includes(k))) {
        ch.chapterNumber = 0; // temporary, renumbered below
        ch.isExtra = true;
      } else {
        ch.chapterNumber = ++chapterNum;
        ch.isExtra = false;
      }
    } else {
      ch.chapterNumber = ++chapterNum;
      ch.isExtra = false;
    }
  }

  // Renumber extras after normal chapters
  const normal = merged.filter(c => !c.isExtra);
  const extras = merged.filter(c => c.isExtra);
  extras.forEach((ch, i) => {
    ch.chapterNumber = normal.length + i + 1;
  });

  // Final safety: ensure every chapter has chapterNumber (prevents NOT NULL constraint)
  for (const ch of merged) {
    if (ch.chapterNumber == null) {
      ch.chapterNumber = ++chapterNum;
      ch.isExtra = false;
    }
  }

  return merged;
}

module.exports = {
  recognizeChapters,
  detectEncoding,
  decodeBuffer,
  safeDecode,
  validateDecodedText,
  chineseTextScoreExtended,
  normalizeText,
  MIN_CHAPTER_LENGTH,
  MAX_CHAPTER_LENGTH,
};
