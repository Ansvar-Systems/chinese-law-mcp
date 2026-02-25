#!/usr/bin/env tsx
/**
 * Chinese Law MCP — Census Script
 *
 * Enumerates ALL national laws and administrative regulations from the
 * National People's Congress official database (flk.npc.gov.cn).
 *
 * Writes data/census.json with every law classified as ingestable/excluded.
 *
 * Categories:
 *   100 = Constitution (宪法)
 *   110 = Constitutional-related laws (宪法相关法)
 *   120 = Civil & Commercial (民法商法)
 *   130 = Administrative Law (行政法)
 *   140 = Economic Law (经济法)
 *   150 = Social Law (社会法)
 *   160 = Criminal Law (刑法)
 *   170 = Procedure Law (诉讼与非诉讼程序法)
 *   210 = Administrative regulations (行政法规)
 *
 * Usage:
 *   npx tsx scripts/census.ts
 *   npx tsx scripts/census.ts --include-admin   # Include administrative regulations (code 210)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');
const FLK_API = 'https://flk.npc.gov.cn/law-search/search/list';

// National law categories (100-170)
const NATIONAL_LAW_CODES = [100, 110, 120, 130, 140, 150, 160, 170];
// Administrative regulation code
const ADMIN_REG_CODE = 210;

const CATEGORY_NAMES: Record<number, string> = {
  100: '宪法 (Constitution)',
  110: '宪法相关法 (Constitutional-related)',
  120: '民法商法 (Civil & Commercial)',
  130: '行政法 (Administrative)',
  140: '经济法 (Economic)',
  150: '社会法 (Social)',
  160: '刑法 (Criminal)',
  170: '诉讼与非诉讼程序法 (Procedure)',
  210: '行政法规 (Administrative Regulations)',
};

// FLK status codes
const STATUS_MAP: Record<number, string> = {
  1: 'repealed',
  2: 'amended',
  3: 'in_force',
  4: 'not_yet_in_force',
};

interface FlkRow {
  bbbs: string;
  title: string;
  gbrq: string;       // publish date
  sxrq: string;       // effective date
  sxx: number | null;  // status code
  zdjgName: string;    // issuing body
  flxz: string;        // law type text
  flfgCodeId: number;  // category code
}

interface CensusEntry {
  bbbs: string;
  title: string;
  category_code: number;
  category_name: string;
  law_type: string;
  issuing_body: string;
  publish_date: string;
  effective_date: string;
  status: string;
  classification: 'ingestable' | 'excluded';
  exclusion_reason?: string;
}

interface Census {
  generated: string;
  source: string;
  categories: number[];
  total: number;
  ingestable: number;
  excluded: number;
  entries: CensusEntry[];
}

// Rate limiting
const MIN_DELAY_MS = 500;
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchCategory(code: number): Promise<FlkRow[]> {
  const rows: FlkRow[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    await rateLimit();

    const body = JSON.stringify({
      searchRange: 1,
      searchType: 2,
      flfgCodeId: [code],
      zdjgCodeId: [],
      searchContent: '',
      pageNum: page,
      pageSize,
    });

    const response = await fetch(FLK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = await response.json() as { total: number; rows: FlkRow[]; code: number };

    if (data.code !== 200 || !data.rows) {
      console.error(`  API error for code ${code} page ${page}:`, data);
      break;
    }

    rows.push(...data.rows);

    if (rows.length >= data.total || data.rows.length < pageSize) {
      break;
    }

    page++;
  }

  return rows;
}

function classifyEntry(row: FlkRow): CensusEntry {
  const status = row.sxx != null ? (STATUS_MAP[row.sxx] ?? 'unknown') : 'unknown';

  // Classify: repealed laws are excluded, everything else is ingestable
  let classification: 'ingestable' | 'excluded' = 'ingestable';
  let exclusion_reason: string | undefined;

  if (status === 'repealed') {
    classification = 'excluded';
    exclusion_reason = 'Repealed (已废止)';
  }

  return {
    bbbs: row.bbbs,
    title: row.title,
    category_code: row.flfgCodeId,
    category_name: CATEGORY_NAMES[row.flfgCodeId] ?? `Unknown (${row.flfgCodeId})`,
    law_type: row.flxz,
    issuing_body: row.zdjgName,
    publish_date: row.gbrq,
    effective_date: row.sxrq,
    status,
    classification,
    exclusion_reason,
  };
}

async function main(): Promise<void> {
  const includeAdmin = process.argv.includes('--include-admin');
  const codes = includeAdmin
    ? [...NATIONAL_LAW_CODES, ADMIN_REG_CODE]
    : NATIONAL_LAW_CODES;

  console.log('Chinese Law MCP — Census');
  console.log('========================\n');
  console.log(`Source: flk.npc.gov.cn (National Law Database)`);
  console.log(`Categories: ${codes.join(', ')}${includeAdmin ? ' (including admin regulations)' : ''}\n`);

  const allEntries: CensusEntry[] = [];

  for (const code of codes) {
    const name = CATEGORY_NAMES[code] ?? `Code ${code}`;
    process.stdout.write(`  Fetching ${name}...`);

    const rows = await fetchCategory(code);
    const entries = rows.map(classifyEntry);
    allEntries.push(...entries);

    const ingestable = entries.filter(e => e.classification === 'ingestable').length;
    console.log(` ${rows.length} found (${ingestable} ingestable)`);
  }

  // Sort by category code, then by publish date (newest first)
  allEntries.sort((a, b) => {
    if (a.category_code !== b.category_code) return a.category_code - b.category_code;
    return b.publish_date.localeCompare(a.publish_date);
  });

  const ingestable = allEntries.filter(e => e.classification === 'ingestable').length;
  const excluded = allEntries.filter(e => e.classification === 'excluded').length;

  const census: Census = {
    generated: new Date().toISOString(),
    source: 'flk.npc.gov.cn',
    categories: codes,
    total: allEntries.length,
    ingestable,
    excluded,
    entries: allEntries,
  };

  fs.mkdirSync(path.dirname(CENSUS_PATH), { recursive: true });
  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));

  console.log(`\nCensus complete:`);
  console.log(`  Total laws: ${allEntries.length}`);
  console.log(`  Ingestable: ${ingestable}`);
  console.log(`  Excluded: ${excluded}`);
  console.log(`  Output: ${CENSUS_PATH}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
