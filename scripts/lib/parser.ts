/**
 * Parser for Chinese legislation.
 *
 * Supports two input formats:
 *   1. DOCX → HTML (via mammoth) from flk.npc.gov.cn downloads
 *   2. Raw HTML from npc.gov.cn (legacy)
 *
 * Uses cheerio to extract structured article data.
 * Handles Chinese numeral article references (第一条, 第二条, etc.)
 * and full-width punctuation (。，；：).
 */

import * as cheerio from 'cheerio';
import { chineseToArabic } from '../../src/utils/chinese-numerals.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedProvision {
  provision_ref: string;
  chapter: string;
  section: string;
  title: string;
  content: string;
  language: string;
}

export interface ParsedLaw {
  id: string;
  type: 'statute' | 'administrative_regulation';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  provisions: ParsedProvision[];
  language: string;
}

export interface LawIndexEntry {
  title: string;
  title_en: string;
  url: string;
  adopted_date: string;
  effective_date: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chinese numeral article pattern
// ─────────────────────────────────────────────────────────────────────────────

// Match 第X条 where X can be Chinese numerals or Arabic digits
const ARTICLE_PATTERN = /^[\s\u3000]*第([一二三四五六七八九十百千零〇\d]+)条[\s\u3000]*/;

// Match chapter headings: 第X编, 第X章
const PART_PATTERN = /^[\s\u3000]*第([一二三四五六七八九十百千零〇\d]+)编[\s\u3000]*(.*)/;
const CHAPTER_PATTERN = /^[\s\u3000]*第([一二三四五六七八九十百千零〇\d]+)章[\s\u3000]*(.*)/;
const SECTION_PATTERN = /^[\s\u3000]*第([一二三四五六七八九十百千零〇\d]+)节[\s\u3000]*(.*)/;

// Match structural headings that should be skipped (not article content)
const HEADING_PATTERN = /^[\s\u3000]*第([一二三四五六七八九十百千零〇\d]+)[编章节分]/;

// Table of contents marker
const TOC_END_MARKERS = ['附则', '总则'];

/**
 * Parse mammoth-generated HTML from a DOCX file to extract articles.
 *
 * Mammoth produces simple HTML with <p> tags. The DOCX content includes:
 * 1. Title
 * 2. Adoption notice
 * 3. Table of contents (articles listed without content)
 * 4. Body text with full article content
 *
 * We need to skip the TOC and parse only the body.
 */
export function parseDocxHtml(html: string, lawId: string, meta: {
  title: string;
  type: 'statute' | 'administrative_regulation';
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
}): ParsedLaw {
  const $ = cheerio.load(html);
  const provisions: ParsedProvision[] = [];

  // Extract all paragraphs
  const paragraphs: string[] = [];
  $('p').each((_i, el) => {
    const text = $(el).text().trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  });

  // DOCX files typically have a table of contents followed by the body.
  // The TOC lists articles like "第一条" without content.
  // The body starts after the TOC and has articles WITH content.
  //
  // Strategy: Find the LAST occurrence of "第一条" — that's the body start.
  // The TOC references "第一条" as a short line; the body "第一条" is followed by content.
  let bodyStartIndex = 0;
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    if (ARTICLE_PATTERN.test(paragraphs[i])) {
      // Found an article reference — check if this is article 1
      const match = paragraphs[i].match(ARTICLE_PATTERN);
      if (match) {
        const numStr = match[1];
        const num = /^\d+$/.test(numStr) ? parseInt(numStr, 10) : chineseToArabic(numStr);
        if (num === 1) {
          bodyStartIndex = i;
          break;
        }
      }
    }
  }

  // Track current structural context
  let currentPart = '';
  let currentChapter = '';
  let currentSection = '';
  let currentArticleNum = '';
  let currentArticleContent: string[] = [];

  function saveCurrentArticle(): void {
    if (currentArticleNum && currentArticleContent.length > 0) {
      provisions.push({
        provision_ref: currentArticleNum,
        chapter: [currentPart, currentChapter, currentSection].filter(Boolean).join(' > '),
        section: currentArticleNum,
        title: '',
        content: currentArticleContent.join('\n').trim(),
        language: 'zh',
      });
    }
  }

  // Process paragraphs from body start
  for (let i = bodyStartIndex; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // Check for structural headings
    const partMatch = para.match(PART_PATTERN);
    if (partMatch) {
      currentPart = para.replace(/[\s\u3000]+/g, ' ').trim();
      continue;
    }

    const chapterMatch = para.match(CHAPTER_PATTERN);
    if (chapterMatch) {
      currentChapter = para.replace(/[\s\u3000]+/g, ' ').trim();
      currentSection = '';  // Reset section when new chapter starts
      continue;
    }

    const sectionMatch = para.match(SECTION_PATTERN);
    if (sectionMatch) {
      currentSection = para.replace(/[\s\u3000]+/g, ' ').trim();
      continue;
    }

    // Check for article start
    const articleMatch = para.match(ARTICLE_PATTERN);
    if (articleMatch) {
      // Save previous article
      saveCurrentArticle();

      // Start new article
      const numStr = articleMatch[1];
      const arabicNum = /^\d+$/.test(numStr) ? parseInt(numStr, 10) : chineseToArabic(numStr);
      currentArticleNum = String(arabicNum);

      // Content is the rest after 第X条
      const content = para.replace(ARTICLE_PATTERN, '').trim();
      currentArticleContent = content ? [content] : [];
      continue;
    }

    // Skip other structural headings within article context
    if (HEADING_PATTERN.test(para)) {
      continue;
    }

    // Continuation of current article
    if (currentArticleNum) {
      // Skip very short lines that look like sub-headings (e.g., "第X分编 XXX")
      if (para.match(/^第[一二三四五六七八九十百千零〇\d]+分编/)) {
        currentPart = para.replace(/[\s\u3000]+/g, ' ').trim();
        continue;
      }
      currentArticleContent.push(para);
    }
  }

  // Save last article
  saveCurrentArticle();

  return {
    id: lawId,
    type: meta.type,
    title: meta.title,
    title_en: '',
    short_name: '',
    status: meta.status,
    issued_date: meta.issued_date,
    in_force_date: meta.in_force_date,
    url: `https://flk.npc.gov.cn/detail?bbbs=${lawId}`,
    provisions,
    language: 'zh',
  };
}

/**
 * Parse an NPC law HTML page to extract articles (legacy — for npc.gov.cn).
 */
export function parseNpcHtml(html: string, lawId: string, lawTitle: string, lawTitleEn: string, language: string = 'zh'): ParsedLaw {
  const $ = cheerio.load(html);

  const provisions: ParsedProvision[] = [];
  let currentArticleNum = '';
  let currentArticleContent: string[] = [];

  // NPC pages typically have the law text in a main content div
  const contentSelectors = [
    '.article_content',
    '.law_content',
    '.content',
    '#UCAP-CONTENT',
    '.p_content',
    'article',
    '.main_content',
    'body',
  ];

  let contentEl: cheerio.Cheerio<cheerio.Element> | null = null;
  for (const selector of contentSelectors) {
    const el = $(selector);
    if (el.length > 0 && el.text().trim().length > 100) {
      contentEl = el;
      break;
    }
  }

  if (!contentEl) {
    return buildLaw(lawId, lawTitle, lawTitleEn, provisions, language);
  }

  // Extract all paragraphs
  const paragraphs: string[] = [];
  contentEl.find('p, div.p, span.p').each((_i, el) => {
    const text = $(el).text().trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  });

  if (paragraphs.length === 0) {
    const fullText = contentEl.text();
    const lines = fullText.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
    paragraphs.push(...lines);
  }

  for (const para of paragraphs) {
    const articleMatch = para.match(ARTICLE_PATTERN);

    if (articleMatch) {
      if (currentArticleNum && currentArticleContent.length > 0) {
        provisions.push({
          provision_ref: currentArticleNum,
          chapter: '',
          section: currentArticleNum,
          title: '',
          content: currentArticleContent.join('\n').trim(),
          language,
        });
      }

      const numStr = articleMatch[1];
      const arabicNum = /^\d+$/.test(numStr)
        ? parseInt(numStr, 10)
        : chineseToArabic(numStr);
      currentArticleNum = String(arabicNum);

      const content = para.replace(ARTICLE_PATTERN, '').trim();
      currentArticleContent = content ? [content] : [];
    } else if (currentArticleNum) {
      if (!HEADING_PATTERN.test(para)) {
        currentArticleContent.push(para);
      }
    }
  }

  if (currentArticleNum && currentArticleContent.length > 0) {
    provisions.push({
      provision_ref: currentArticleNum,
      chapter: '',
      section: currentArticleNum,
      title: '',
      content: currentArticleContent.join('\n').trim(),
      language,
    });
  }

  return buildLaw(lawId, lawTitle, lawTitleEn, provisions, language);
}

function buildLaw(
  id: string,
  title: string,
  titleEn: string,
  provisions: ParsedProvision[],
  language: string
): ParsedLaw {
  return {
    id,
    type: 'statute',
    title,
    title_en: titleEn,
    short_name: '',
    status: 'in_force',
    issued_date: '',
    in_force_date: '',
    url: '',
    provisions,
    language,
  };
}

/**
 * Normalize Chinese text: trim whitespace, normalize full-width chars.
 */
export function normalizeChineseText(text: string): string {
  return text
    .replace(/\u3000/g, ' ')  // Ideographic space -> regular space
    .replace(/\s+/g, ' ')
    .trim();
}
