/**
 * Chinese legal citation parser.
 *
 * Parses citations in multiple formats:
 *   1. Chinese: "第三条 中华人民共和国网络安全法"
 *   2. English: "Article 3, Cybersecurity Law of the People's Republic of China"
 *   3. Short:   "Art. 3, CSL 2016"
 *   4. ID-based: "csl-2016, art. 3"
 *   5. With paragraph: "Article 3, Paragraph 1" / "第三条第一款"
 */

import type { ParsedCitation } from '../types/index.js';
import { extractArticleNumber, extractParagraphNumber } from '../utils/chinese-numerals.js';

// Chinese citation: 第三条 中华人民共和国网络安全法
// Also handles: 第三条第一款 网络安全法
const CHINESE_CITATION = /^第(.+?)条(?:第(.+?)款)?\s*[,，]?\s*(?:中华人民共和国)?(.+?)(?:法|典|条例)$/;

// Chinese citation with trailing law name first: 网络安全法 第三条
const CHINESE_LAW_FIRST = /^(?:中华人民共和国)?(.+?(?:法|典|条例))\s*[,，]?\s*第(.+?)条(?:第(.+?)款)?$/;

// English citation: "Article 3, Cybersecurity Law of the People's Republic of China"
const ENGLISH_CITATION = /^Article\s+(\d+)(?:\s*,?\s*Paragraph\s+(\d+))?\s*,?\s+(.+?)$/i;

// Short citation: "Art. 3, CSL 2016" or "Art. 3 CSL"
const SHORT_CITATION = /^Art\.?\s*(\d+)(?:\s*,?\s*(?:Para?\.?\s*)?(\d+))?\s*,?\s+(.+?)(?:\s+(\d{4}))?$/i;

// ID-based citation: "csl-2016, art. 3" or "csl-2016 art 3"
const ID_CITATION = /^([a-z][\w-]+(?:-\d{4})?)\s*,?\s*(?:art\.?|article)\s*(\d+)(?:\s*,?\s*(?:para?\.?|paragraph)\s*(\d+))?$/i;

// Bare article: "Article 3" or "第三条"
const BARE_CHINESE_ARTICLE = /^第(.+?)条(?:第(.+?)款)?$/;
const BARE_ENGLISH_ARTICLE = /^Article\s+(\d+)(?:\s*,?\s*Paragraph\s+(\d+))?$/i;

export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();

  // ID-based citation
  let match = trimmed.match(ID_CITATION);
  if (match) {
    return {
      valid: true,
      type: 'statute',
      title: match[1],
      article: match[2],
      paragraph: match[3] || undefined,
    };
  }

  // Chinese citation with article first
  match = trimmed.match(CHINESE_CITATION);
  if (match) {
    const article = parseChineseNumber(match[1]);
    const paragraph = match[2] ? parseChineseNumber(match[2]) : undefined;
    const lawName = match[3].trim() + trimmed.match(/(?:法|典|条例)$/)?.[0];
    return {
      valid: true,
      type: 'statute',
      title: lawName,
      article: article != null ? String(article) : match[1],
      paragraph: paragraph != null ? String(paragraph) : undefined,
    };
  }

  // Chinese citation with law name first
  match = trimmed.match(CHINESE_LAW_FIRST);
  if (match) {
    const article = parseChineseNumber(match[2]);
    const paragraph = match[3] ? parseChineseNumber(match[3]) : undefined;
    return {
      valid: true,
      type: 'statute',
      title: match[1].trim(),
      article: article != null ? String(article) : match[2],
      paragraph: paragraph != null ? String(paragraph) : undefined,
    };
  }

  // English citation
  match = trimmed.match(ENGLISH_CITATION);
  if (match) {
    return {
      valid: true,
      type: 'statute',
      title_en: match[3].trim(),
      article: match[1],
      paragraph: match[2] || undefined,
    };
  }

  // Short citation
  match = trimmed.match(SHORT_CITATION);
  if (match) {
    return {
      valid: true,
      type: 'statute',
      title: match[3].trim(),
      article: match[1],
      paragraph: match[2] || undefined,
    };
  }

  // Bare Chinese article
  match = trimmed.match(BARE_CHINESE_ARTICLE);
  if (match) {
    const article = parseChineseNumber(match[1]);
    const paragraph = match[2] ? parseChineseNumber(match[2]) : undefined;
    return {
      valid: true,
      type: 'statute',
      article: article != null ? String(article) : match[1],
      paragraph: paragraph != null ? String(paragraph) : undefined,
    };
  }

  // Bare English article
  match = trimmed.match(BARE_ENGLISH_ARTICLE);
  if (match) {
    return {
      valid: true,
      type: 'statute',
      article: match[1],
      paragraph: match[2] || undefined,
    };
  }

  return {
    valid: false,
    type: 'unknown',
    error: `Could not parse Chinese law citation: "${trimmed}"`,
  };
}

function parseChineseNumber(numStr: string): number | null {
  // Try Arabic first
  const arabic = parseInt(numStr, 10);
  if (!isNaN(arabic)) return arabic;

  // Try Chinese numeral conversion using the utility
  const ref = `第${numStr}条`;
  return extractArticleNumber(ref);
}
