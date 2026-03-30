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

// Extended categories for full-corpus ingestion
const EXTENDED_CODES = [
  200,  // Amendment/repeal decisions (national)
  215,  // Amendment/repeal decisions (admin regs)
  220,  // Supervisory regulations (监察法规)
  230,  // Local regulations — main bucket (~22K)
  260,  // Local regulations — autonomous regions
  270,  // Local regulations — SEZ/special
  290,  // Local regulations — municipal
  295,  // Local regulations — supplementary
  300,  // Local regulations — other
  305,  // Regulatory decisions (法规性决定)
  310,  // Amendment/repeal decisions (local)
  320,  // Judicial interpretations — main
  330,  // Judicial interpretations — supplementary
  340,  // Judicial interpretations — SPC opinions
  350,  // Amendment/repeal decisions (judicial)
];

const CATEGORY_NAMES: Record<number, string> = {
  100: '宪法 (Constitution)',
  110: '宪法相关法 (Constitutional-related)',
  120: '民法商法 (Civil & Commercial)',
  130: '行政法 (Administrative)',
  140: '经济法 (Economic)',
  150: '社会法 (Social)',
  160: '刑法 (Criminal)',
  170: '诉讼与非诉讼程序法 (Procedure)',
  200: '修改废止决定-国家 (National Amendment/Repeal Decisions)',
  210: '行政法规 (Administrative Regulations)',
  215: '修改废止决定-行政法规 (Admin Reg Amendment/Repeal Decisions)',
  220: '监察法规 (Supervisory Regulations)',
  230: '地方性法规 (Local Regulations)',
  260: '自治条例/单行条例 (Autonomous Region Regulations)',
  270: '经济特区法规 (SEZ Regulations)',
  290: '设区的市地方性法规 (Municipal Regulations)',
  295: '地方性法规-补充 (Local Regulations — supplementary)',
  300: '地方性法规-其他 (Local Regulations — other)',
  305: '法规性决定 (Regulatory Decisions)',
  310: '修改废止决定-地方 (Local Amendment/Repeal Decisions)',
  320: '司法解释 (Judicial Interpretations)',
  330: '司法解释-补充 (Judicial Interpretations — supplementary)',
  340: '司法解释-意见 (Judicial Interpretations — opinions)',
  350: '修改废止决定-司法 (Judicial Amendment/Repeal Decisions)',
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
  province?: string;
  province_code?: string;
}

// Province extraction from issuing body (zdjgName)
const PROVINCE_MAP: Record<string, { name: string; code: string }> = {
  '北京': { name: '北京市', code: 'BJ' },
  '天津': { name: '天津市', code: 'TJ' },
  '河北': { name: '河北省', code: 'HE' },
  '山西': { name: '山西省', code: 'SX' },
  '内蒙古': { name: '内蒙古自治区', code: 'NM' },
  '辽宁': { name: '辽宁省', code: 'LN' },
  '吉林': { name: '吉林省', code: 'JL' },
  '黑龙江': { name: '黑龙江省', code: 'HL' },
  '上海': { name: '上海市', code: 'SH' },
  '江苏': { name: '江苏省', code: 'JS' },
  '浙江': { name: '浙江省', code: 'ZJ' },
  '安徽': { name: '安徽省', code: 'AH' },
  '福建': { name: '福建省', code: 'FJ' },
  '江西': { name: '江西省', code: 'JX' },
  '山东': { name: '山东省', code: 'SD' },
  '河南': { name: '河南省', code: 'HN' },
  '湖北': { name: '湖北省', code: 'HB' },
  '湖南': { name: '湖南省', code: 'HuN' },
  '广东': { name: '广东省', code: 'GD' },
  '广西': { name: '广西壮族自治区', code: 'GX' },
  '海南': { name: '海南省', code: 'HI' },
  '重庆': { name: '重庆市', code: 'CQ' },
  '四川': { name: '四川省', code: 'SC' },
  '贵州': { name: '贵州省', code: 'GZ' },
  '云南': { name: '云南省', code: 'YN' },
  '西藏': { name: '西藏自治区', code: 'XZ' },
  '陕西': { name: '陕西省', code: 'SN' },
  '甘肃': { name: '甘肃省', code: 'GS' },
  '青海': { name: '青海省', code: 'QH' },
  '宁夏': { name: '宁夏回族自治区', code: 'NX' },
  '新疆': { name: '新疆维吾尔自治区', code: 'XJ' },
};

function extractProvince(issuingBody: string): { name: string; code: string } | null {
  for (const [prefix, info] of Object.entries(PROVINCE_MAP)) {
    if (issuingBody.startsWith(prefix) || issuingBody.includes(prefix + '省') || issuingBody.includes(prefix + '市')) {
      return info;
    }
  }
  // Check for autonomous region patterns
  for (const [prefix, info] of Object.entries(PROVINCE_MAP)) {
    if (issuingBody.includes(prefix)) {
      return info;
    }
  }
  return null;
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

async function fetchPage(code: number, page: number, pageSize: number, maxRetries = 3): Promise<{ total: number; rows: FlkRow[] } | null> {
  const body = JSON.stringify({
    searchRange: 1,
    searchType: 2,
    flfgCodeId: [code],
    zdjgCodeId: [],
    searchContent: '',
    pageNum: page,
    pageSize,
  });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rateLimit();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(FLK_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChineseLawMCP/1.0 (https://github.com/Ansvar-Systems/chinese-law-mcp)',
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await response.json() as { total: number; rows: FlkRow[]; code: number };

      if (data.code !== 200 || !data.rows) {
        console.error(`\n  API error for code ${code} page ${page}:`, data);
        return null;
      }

      return { total: data.total, rows: data.rows };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        process.stdout.write(`\n    Retry ${attempt + 1}/${maxRetries} for code ${code} page ${page} (${msg}), waiting ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      console.error(`\n  Failed to fetch code ${code} page ${page} after ${maxRetries} retries: ${msg}`);
      return null;
    }
  }
  return null;
}

async function fetchCategory(code: number): Promise<FlkRow[]> {
  const rows: FlkRow[] = [];
  let page = 1;
  const pageSize = 100;
  let consecutiveFailures = 0;

  while (true) {
    const result = await fetchPage(code, page, pageSize);
    if (!result) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        console.error(`\n  Giving up on code ${code} after 3 consecutive page failures (got ${rows.length} rows so far)`);
        break;
      }
      // Skip this page and try the next
      page++;
      continue;
    }

    consecutiveFailures = 0;
    rows.push(...result.rows);

    // Progress indicator for large categories
    if (result.total > 500 && page % 10 === 0) {
      process.stdout.write(` ${rows.length}/${result.total}`);
    }

    if (rows.length >= result.total || result.rows.length < pageSize) {
      break;
    }

    page++;
  }

  return rows;
}

// Amendment/repeal decision codes — these are procedural documents, not substantive law
const AMENDMENT_REPEAL_CODES = new Set([200, 215, 310, 350]);

function classifyEntry(row: FlkRow): CensusEntry {
  const status = row.sxx != null ? (STATUS_MAP[row.sxx] ?? 'unknown') : 'unknown';

  // Classify: repealed laws are excluded, everything else is ingestable
  let classification: 'ingestable' | 'excluded' = 'ingestable';
  let exclusion_reason: string | undefined;

  if (status === 'repealed') {
    classification = 'excluded';
    exclusion_reason = 'Repealed (已废止)';
  }

  // Amendment/repeal decisions are procedural — exclude unless they contain substantive text
  if (AMENDMENT_REPEAL_CODES.has(row.flfgCodeId)) {
    classification = 'excluded';
    exclusion_reason = 'Amendment/repeal decision (procedural)';
  }

  // Extract province for local regulations
  const province = extractProvince(row.zdjgName);

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
    ...(province ? { province: province.name, province_code: province.code } : {}),
  };
}

async function main(): Promise<void> {
  const includeAdmin = process.argv.includes('--include-admin');
  const fullCorpus = process.argv.includes('--full-corpus');
  let codes: number[];

  if (fullCorpus) {
    codes = [...NATIONAL_LAW_CODES, ADMIN_REG_CODE, ...EXTENDED_CODES];
  } else if (includeAdmin) {
    codes = [...NATIONAL_LAW_CODES, ADMIN_REG_CODE];
  } else {
    codes = NATIONAL_LAW_CODES;
  }

  console.log('Chinese Law MCP — Census');
  console.log('========================\n');
  console.log(`Source: flk.npc.gov.cn (National Law Database)`);
  console.log(`Mode: ${fullCorpus ? 'FULL CORPUS (all categories)' : includeAdmin ? 'national + admin regulations' : 'national laws only'}`);
  console.log(`Categories: ${codes.join(', ')}\n`);

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
    return (b.publish_date ?? '').localeCompare(a.publish_date ?? '');
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
