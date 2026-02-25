#!/usr/bin/env tsx
/**
 * Chinese Law MCP — CAC Departmental Rules Ingestion
 *
 * Fetches and parses key departmental rules (部门规章) from cac.gov.cn
 * (Cyberspace Administration of China / 国家互联网信息办公室).
 *
 * These regulations are NOT available on flk.npc.gov.cn — they are
 * published directly by the CAC as the issuing ministry.
 *
 * Pipeline:
 *   1. Fetch HTML page from cac.gov.cn
 *   2. Parse articles from <p><strong>第X条</strong> ... </p> structure
 *   3. Write seed JSON to data/seed/
 *
 * Usage:
 *   npx tsx scripts/ingest-cac.ts              # Ingest all CAC rules
 *   npx tsx scripts/ingest-cac.ts --force      # Re-download existing seeds
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit } from './lib/fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');

// ─────────────────────────────────────────────────────────────────────────────
// CAC regulation registry
// ─────────────────────────────────────────────────────────────────────────────

interface CacRegulation {
  /** Stable ID for the seed file */
  id: string;
  /** Full Chinese title */
  title: string;
  /** English reference name */
  title_en: string;
  /** Short abbreviation */
  short_name: string;
  /** URL on cac.gov.cn */
  url: string;
  /** Publication date (YYYY-MM-DD) */
  issued_date: string;
  /** Effective date (YYYY-MM-DD) */
  in_force_date: string;
  /** Issuing body */
  issuing_body: string;
  /** Current status */
  status: 'in_force' | 'amended' | 'repealed';
}

const CAC_REGULATIONS: CacRegulation[] = [
  {
    id: 'cac-algo-rec-2022',
    title: '互联网信息服务算法推荐管理规定',
    title_en: 'Provisions on the Management of Algorithmic Recommendations in Internet Information Services',
    short_name: 'Algorithm Recommendation Provisions',
    url: 'https://www.cac.gov.cn/2022-01/04/c_1642894606364259.htm',
    issued_date: '2021-12-31',
    in_force_date: '2022-03-01',
    issuing_body: '国家互联网信息办公室、工业和信息化部、公安部、国家市场监督管理总局',
    status: 'in_force',
  },
  {
    id: 'cac-deep-synthesis-2023',
    title: '互联网信息服务深度合成管理规定',
    title_en: 'Provisions on the Management of Deep Synthesis in Internet Information Services',
    short_name: 'Deep Synthesis Provisions',
    url: 'https://www.cac.gov.cn/2022-12/11/c_1672221949354811.htm',
    issued_date: '2022-11-25',
    in_force_date: '2023-01-10',
    issuing_body: '国家互联网信息办公室、工业和信息化部、公安部',
    status: 'in_force',
  },
  {
    id: 'cac-genai-2023',
    title: '生成式人工智能服务管理暂行办法',
    title_en: 'Interim Measures for the Management of Generative Artificial Intelligence Services',
    short_name: 'Generative AI Measures',
    url: 'https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm',
    issued_date: '2023-07-10',
    in_force_date: '2023-08-15',
    issuing_body: '国家互联网信息办公室、国家发展和改革委员会、教育部、科学技术部、工业和信息化部、公安部、国家广播电视总局',
    status: 'in_force',
  },
  {
    id: 'cac-cybersec-review-2022',
    title: '网络安全审查办法',
    title_en: 'Cybersecurity Review Measures',
    short_name: 'Cybersecurity Review Measures',
    url: 'https://www.cac.gov.cn/2022-01/04/c_1642894602182845.htm',
    issued_date: '2021-12-28',
    in_force_date: '2022-02-15',
    issuing_body: '国家互联网信息办公室、国家发展和改革委员会、工业和信息化部、公安部、国家安全部、财政部、商务部、中国人民银行、国家市场监督管理总局、国家广播电视总局、中国证券监督管理委员会、国家保密局、国家密码管理局',
    status: 'in_force',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Chinese numeral → Arabic conversion (subset for article parsing)
// ─────────────────────────────────────────────────────────────────────────────

const NUMERAL_MAP: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '百': 100,
};

function chineseToArabic(cn: string): number {
  if (cn.length === 1 && NUMERAL_MAP[cn] !== undefined) {
    return NUMERAL_MAP[cn];
  }

  let result = 0;
  let current = 0;

  for (const char of cn) {
    const val = NUMERAL_MAP[char];
    if (val === undefined) continue;

    if (val >= 10) {
      result += (current || 1) * val;
      current = 0;
    } else {
      current = val;
    }
  }

  return result + current;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML → article parser for cac.gov.cn pages
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedProvision {
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\u3000/g, ' ')  // ideographic space
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCacHtml(html: string): ParsedProvision[] {
  const provisions: ParsedProvision[] = [];

  // Extract content from main-content div
  const contentMatch = html.match(/class="main-content"[^>]*>([\s\S]*?)(?:<\/div>\s*<div|$)/);
  const content = contentMatch ? contentMatch[1] : html;

  // Extract chapter headings: <strong>第X章 ...</strong>
  const chapterPattern = /第([一二三四五六七八九十百]+)章\s*([^<\n]*)/g;
  const chapters: Array<{ num: number; title: string; position: number }> = [];
  let chapterMatch;
  while ((chapterMatch = chapterPattern.exec(content)) !== null) {
    chapters.push({
      num: chineseToArabic(chapterMatch[1]),
      title: `第${chapterMatch[1]}章 ${chapterMatch[2].trim()}`.replace(/\s+/g, ' '),
      position: chapterMatch.index,
    });
  }

  // Extract articles: <p ...><strong>第X条</strong> text</p>
  // Some articles span multiple <p> tags
  const articlePattern = /<p[^>]*>\s*(?:<strong>)?\s*第([一二三四五六七八九十百]+)条\s*(?:<\/strong>)?\s*([\s\S]*?)(?=<p[^>]*>\s*(?:<strong>)?\s*第[一二三四五六七八九十百]+条|<p[^>]*>\s*(?:<strong>)?\s*第[一二三四五六七八九十百]+章|$)/g;

  let match;
  while ((match = articlePattern.exec(content)) !== null) {
    const articleNumCn = match[1];
    const articleNum = chineseToArabic(articleNumCn);
    const rawContent = match[2];

    // Clean up the content: strip HTML tags, normalize whitespace
    const cleanContent = stripHtml(rawContent)
      .replace(/^\s*/, '');

    // Full content including the article number prefix
    const fullContent = `第${articleNumCn}条 ${cleanContent}`;

    // Determine which chapter this article belongs to
    let chapter: string | null = null;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (match.index > chapters[i].position) {
        chapter = chapters[i].title;
        break;
      }
    }

    provisions.push({
      provision_ref: String(articleNum),
      chapter,
      section: String(articleNum),
      title: null,
      content: fullContent,
    });
  }

  return provisions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const force = process.argv.includes('--force');

  console.log('Chinese Law MCP — CAC Departmental Rules Ingestion');
  console.log('===================================================\n');
  console.log(`Source: cac.gov.cn (Cyberspace Administration of China)`);
  console.log(`Regulations: ${CAC_REGULATIONS.length}\n`);

  fs.mkdirSync(SEED_DIR, { recursive: true });

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;

  for (const reg of CAC_REGULATIONS) {
    const seedFile = path.join(SEED_DIR, `${reg.id}.json`);

    if (!force && fs.existsSync(seedFile)) {
      console.log(`  [SKIP] ${reg.title} (seed exists)`);
      skipped++;
      continue;
    }

    process.stdout.write(`  ${reg.title}...`);

    try {
      const result = await fetchWithRateLimit(reg.url);

      if (result.status !== 200) {
        console.log(` FAIL (HTTP ${result.status})`);
        failed++;
        continue;
      }

      const provisions = parseCacHtml(result.body);

      if (provisions.length === 0) {
        console.log(` 0 articles (parse failed)`);
        failed++;
        continue;
      }

      const seed = {
        id: reg.id,
        type: 'departmental_rule' as const,
        title: reg.title,
        title_en: reg.title_en,
        short_name: reg.short_name,
        status: reg.status,
        issued_date: reg.issued_date,
        in_force_date: reg.in_force_date,
        url: reg.url,
        issuing_body: reg.issuing_body,
        provisions,
        definitions: [],
      };

      fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
      totalProvisions += provisions.length;
      console.log(` ${provisions.length} articles`);
      succeeded++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` ERROR: ${msg}`);
      failed++;
    }
  }

  console.log(`\nIngestion complete:`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total provisions: ${totalProvisions}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
