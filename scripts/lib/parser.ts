/**
 * HTML parser for Chinese legislation from npc.gov.cn and gov.cn.
 *
 * Uses cheerio to extract structured article data from Chinese law HTML pages.
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
  status: 'in_force' | 'amended';
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

// Match chapter/section headings like 第一章, 第二节
const CHAPTER_PATTERN = /^[\s\u3000]*第([一二三四五六七八九十百千零〇\d]+)[章节编]/;

/**
 * Parse an NPC law HTML page to extract articles.
 */
export function parseNpcHtml(html: string, lawId: string, lawTitle: string, lawTitleEn: string, language: string = 'zh'): ParsedLaw {
  const $ = cheerio.load(html);

  const provisions: ParsedProvision[] = [];
  let currentArticleNum = '';
  let currentArticleContent: string[] = [];

  // NPC pages typically have the law text in a main content div
  // Try various selectors used by npc.gov.cn
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

  // If no paragraphs found, try splitting the full text by newlines
  if (paragraphs.length === 0) {
    const fullText = contentEl.text();
    const lines = fullText.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
    paragraphs.push(...lines);
  }

  // Process paragraphs to extract articles
  for (const para of paragraphs) {
    const articleMatch = para.match(ARTICLE_PATTERN);

    if (articleMatch) {
      // Save previous article
      if (currentArticleNum && currentArticleContent.length > 0) {
        provisions.push({
          provision_ref: currentArticleNum,
          section: currentArticleNum,
          title: '',
          content: currentArticleContent.join('\n').trim(),
          language,
        });
      }

      // Start new article
      const numStr = articleMatch[1];
      const arabicNum = /^\d+$/.test(numStr)
        ? parseInt(numStr, 10)
        : chineseToArabic(numStr);
      currentArticleNum = String(arabicNum);

      // Content is the rest after 第X条
      const content = para.replace(ARTICLE_PATTERN, '').trim();
      currentArticleContent = content ? [content] : [];
    } else if (currentArticleNum) {
      // Skip chapter/section headings within current article context
      if (!CHAPTER_PATTERN.test(para)) {
        currentArticleContent.push(para);
      }
    }
  }

  // Save last article
  if (currentArticleNum && currentArticleContent.length > 0) {
    provisions.push({
      provision_ref: currentArticleNum,
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
 * Parse an NPC law index page to extract links to individual laws.
 */
export function parseNpcIndex(html: string): LawIndexEntry[] {
  const $ = cheerio.load(html);
  const entries: LawIndexEntry[] = [];

  $('a').each((_i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();

    if (href && text && (text.includes('法') || text.includes('条例') || text.includes('典'))) {
      entries.push({
        title: text,
        title_en: '',
        url: href.startsWith('http') ? href : `https://www.npc.gov.cn${href}`,
        adopted_date: '',
        effective_date: '',
      });
    }
  });

  return entries;
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
