#!/usr/bin/env tsx
/**
 * Chinese Law MCP — Ingestion Pipeline
 *
 * Multi-source ingestion of Chinese legislation:
 *   Source 1: npc.gov.cn — NPC laws (Chinese text)
 *   Source 2: en.npc.gov.cn — NPC English translations
 *   Source 3: gov.cn — State Council regulations
 *
 * Usage:
 *   npm run ingest                    # Full ingestion
 *   npm run ingest -- --limit 10      # Test with 10 laws
 *
 * Data is sourced from official Chinese government portals (public data).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchNpcLaw } from './lib/fetcher.js';
import { parseNpcHtml } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');

// ─────────────────────────────────────────────────────────────────────────────
// Key law definitions (free tier)
// ─────────────────────────────────────────────────────────────────────────────

interface LawDefinition {
  id: string;
  title: string;
  title_en: string;
  short_name: string;
  url: string;
  url_en?: string;
  issued_date: string;
  in_force_date: string;
  status: 'in_force' | 'amended';
  type: 'statute' | 'administrative_regulation';
  eu_references?: Array<{
    eu_document_id: string;
    eu_type: 'directive' | 'regulation';
    eu_year: number;
    eu_number: number;
    eu_title: string;
    eu_short_name: string;
    reference_type: string;
    is_primary: boolean;
    description: string;
  }>;
}

const KEY_LAWS: LawDefinition[] = [
  {
    id: 'csl-2016',
    title: '中华人民共和国网络安全法',
    title_en: 'Cybersecurity Law of the People\'s Republic of China',
    short_name: 'CSL',
    url: 'https://www.npc.gov.cn/npc/c2/c30834/202411/t20241101_441026.html',
    issued_date: '2016-11-07',
    in_force_date: '2017-06-01',
    status: 'amended',
    type: 'statute',
    eu_references: [
      {
        eu_document_id: 'directive:2022/2555',
        eu_type: 'directive', eu_year: 2022, eu_number: 2555,
        eu_title: 'Directive (EU) 2022/2555 on measures for a high common level of cybersecurity (NIS2)',
        eu_short_name: 'NIS2 Directive',
        reference_type: 'references', is_primary: true,
        description: 'CSL addresses similar cybersecurity requirements as the EU NIS2 Directive',
      },
    ],
  },
  {
    id: 'pipl-2021',
    title: '中华人民共和国个人信息保护法',
    title_en: 'Personal Information Protection Law of the People\'s Republic of China',
    short_name: 'PIPL',
    url: 'https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313095.html',
    issued_date: '2021-08-20',
    in_force_date: '2021-11-01',
    status: 'in_force',
    type: 'statute',
    eu_references: [
      {
        eu_document_id: 'regulation:2016/679',
        eu_type: 'regulation', eu_year: 2016, eu_number: 679,
        eu_title: 'Regulation (EU) 2016/679 General Data Protection Regulation',
        eu_short_name: 'GDPR',
        reference_type: 'references', is_primary: true,
        description: 'PIPL is China\'s comprehensive personal data protection law, often compared to the EU GDPR',
      },
    ],
  },
  {
    id: 'dsl-2021',
    title: '中华人民共和国数据安全法',
    title_en: 'Data Security Law of the People\'s Republic of China',
    short_name: 'DSL',
    url: 'https://www.npc.gov.cn/npc/c2/c30834/202106/t20210610_312280.html',
    issued_date: '2021-06-10',
    in_force_date: '2021-09-01',
    status: 'in_force',
    type: 'statute',
    eu_references: [
      {
        eu_document_id: 'regulation:2022/868',
        eu_type: 'regulation', eu_year: 2022, eu_number: 868,
        eu_title: 'Regulation (EU) 2022/868 on European data governance (Data Governance Act)',
        eu_short_name: 'Data Governance Act',
        reference_type: 'references', is_primary: true,
        description: 'DSL addresses data classification and security governance, paralleling EU Data Governance Act',
      },
    ],
  },
  {
    id: 'company-law-2023',
    title: '中华人民共和国公司法',
    title_en: 'Company Law of the People\'s Republic of China',
    short_name: 'Company Law',
    url: 'https://www.npc.gov.cn/npc/c2/c30834/202312/t20231229_433798.html',
    issued_date: '2023-12-29',
    in_force_date: '2024-07-01',
    status: 'in_force',
    type: 'statute',
  },
  {
    id: 'civil-code-2020',
    title: '中华人民共和国民法典',
    title_en: 'Civil Code of the People\'s Republic of China',
    short_name: 'Civil Code',
    url: 'https://www.npc.gov.cn/npc/c2/c30834/202006/t20200602_306419.html',
    issued_date: '2020-05-28',
    in_force_date: '2021-01-01',
    status: 'in_force',
    type: 'statute',
  },
  {
    id: 'ecommerce-law-2018',
    title: '中华人民共和国电子商务法',
    title_en: 'E-Commerce Law of the People\'s Republic of China',
    short_name: 'E-Commerce Law',
    url: 'https://www.npc.gov.cn/npc/c2/c30834/201808/t20180831_223726.html',
    issued_date: '2018-08-31',
    in_force_date: '2019-01-01',
    status: 'in_force',
    type: 'statute',
  },
  {
    id: 'aml-2022',
    title: '中华人民共和国反垄断法',
    title_en: 'Anti-Monopoly Law of the People\'s Republic of China',
    short_name: 'AML',
    url: 'https://www.npc.gov.cn/npc/c2/c30834/202206/t20220624_318367.html',
    issued_date: '2022-06-24',
    in_force_date: '2022-08-01',
    status: 'in_force',
    type: 'statute',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { limit: number | null } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
  }
  return { limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { limit } = parseArgs();

  console.log('Chinese Law MCP — Ingestion Pipeline');
  console.log('====================================\n');

  fs.mkdirSync(SEED_DIR, { recursive: true });

  const laws = limit ? KEY_LAWS.slice(0, limit) : KEY_LAWS;
  let processed = 0;
  let failed = 0;
  let totalProvisions = 0;

  for (const law of laws) {
    const seedFile = path.join(SEED_DIR, `${law.id}.json`);

    // Incremental: skip if seed already exists
    if (fs.existsSync(seedFile)) {
      console.log(`  SKIP ${law.id}: seed file already exists`);
      processed++;
      continue;
    }

    console.log(`  Fetching ${law.id}: ${law.title}...`);

    try {
      const result = await fetchNpcLaw(law.url);

      if (result.status !== 200) {
        console.log(`    ERROR: HTTP ${result.status}`);
        // Write minimal seed
        const minimalSeed = {
          id: law.id,
          type: law.type,
          title: law.title,
          title_en: law.title_en,
          short_name: law.short_name,
          status: law.status,
          issued_date: law.issued_date,
          in_force_date: law.in_force_date,
          url: law.url,
          provisions: [],
          eu_references: law.eu_references ?? [],
        };
        fs.writeFileSync(seedFile, JSON.stringify(minimalSeed, null, 2));
        failed++;
      } else {
        const parsed = parseNpcHtml(result.body, law.id, law.title, law.title_en, 'zh');
        const seed = {
          ...parsed,
          short_name: law.short_name,
          status: law.status,
          issued_date: law.issued_date,
          in_force_date: law.in_force_date,
          url: law.url,
          eu_references: law.eu_references ?? [],
        };
        fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
        totalProvisions += parsed.provisions.length;
        console.log(`    OK: ${parsed.provisions.length} articles extracted`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`    ERROR: ${msg}`);
      // Write minimal seed on network error so build:db has metadata
      if (!fs.existsSync(seedFile)) {
        const minimalSeed = {
          id: law.id,
          type: law.type,
          title: law.title,
          title_en: law.title_en,
          short_name: law.short_name,
          status: law.status,
          issued_date: law.issued_date,
          in_force_date: law.in_force_date,
          url: law.url,
          provisions: [],
          eu_references: law.eu_references ?? [],
        };
        fs.writeFileSync(seedFile, JSON.stringify(minimalSeed, null, 2));
        console.log(`    Wrote minimal seed for ${law.id}`);
      }
      failed++;
    }

    processed++;
  }

  console.log(`\nIngestion complete:`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total provisions: ${totalProvisions}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
