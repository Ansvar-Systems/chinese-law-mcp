#!/usr/bin/env tsx
/**
 * Chinese Law MCP — Ingestion Pipeline
 *
 * Census-first full corpus ingestion from flk.npc.gov.cn (National Law Database).
 *
 * Pipeline:
 *   1. Read census.json (run census.ts first)
 *   2. Download DOCX for each ingestable law via FLK download API
 *   3. Convert DOCX → HTML via mammoth
 *   4. Parse articles from HTML
 *   5. Write seed JSON to data/seed/
 *
 * Usage:
 *   npm run ingest                    # Full ingestion (all ingestable from census)
 *   npm run ingest -- --limit 10      # Test with 10 laws
 *   npm run ingest -- --force         # Re-download existing seed files
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import { fetchFlkDocx } from './lib/fetcher.js';
import { parseDocxHtml } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');

// FLK status codes → our status codes
const STATUS_MAP: Record<string, 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force'> = {
  in_force: 'in_force',
  amended: 'amended',
  repealed: 'repealed',
  not_yet_in_force: 'not_yet_in_force',
  unknown: 'in_force',
};

// FLK category codes → document type mapping
const ADMIN_REG_CODES = new Set([210, 215, 220]);
const LOCAL_REG_CODES = new Set([230, 260, 270, 290, 295, 300]);
const JUDICIAL_INTERP_CODES = new Set([320, 330, 340]);
const REGULATORY_DECISION_CODES = new Set([305]);

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

function resolveDocType(categoryCode: number): string {
  if (ADMIN_REG_CODES.has(categoryCode)) return 'administrative_regulation';
  if (LOCAL_REG_CODES.has(categoryCode)) return 'local_regulation';
  if (JUDICIAL_INTERP_CODES.has(categoryCode)) return 'judicial_interpretation';
  if (REGULATORY_DECISION_CODES.has(categoryCode)) return 'regulatory_decision';
  return 'statute';
}

function resolveCategory(categoryCode: number): string {
  if (ADMIN_REG_CODES.has(categoryCode)) return 'admin_reg';
  if (LOCAL_REG_CODES.has(categoryCode)) return 'local_reg';
  if (JUDICIAL_INTERP_CODES.has(categoryCode)) return 'judicial_interp';
  if (REGULATORY_DECISION_CODES.has(categoryCode)) return 'regulatory_decision';
  return 'national_law';
}

interface Census {
  generated: string;
  source: string;
  total: number;
  ingestable: number;
  excluded: number;
  entries: CensusEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { limit: number | null; force: boolean; censusFile: string } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let force = false;
  let censusFile = CENSUS_PATH;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--force') {
      force = true;
    }
    if (args[i] === '--census' && args[i + 1]) {
      censusFile = path.resolve(args[i + 1]);
      i++;
    }
    if (args[i] === '--full-corpus') {
      censusFile = path.resolve(__dirname, '../data/census-full.json');
    }
  }
  return { limit, force, censusFile };
}

/**
 * Generate a filesystem-safe ID from a bbbs UUID.
 */
function bbbs2id(bbbs: string): string {
  // Use the bbbs directly — it's already a unique identifier
  return bbbs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { limit, force, censusFile } = parseArgs();

  console.log('Chinese Law MCP — Ingestion Pipeline');
  console.log('====================================\n');

  // Load census
  if (!fs.existsSync(censusFile)) {
    console.error(`ERROR: Census file not found: ${censusFile}`);
    console.error('  Run census.ts first:');
    console.error('  npx tsx scripts/census.ts --full-corpus    # Full corpus');
    console.error('  npx tsx scripts/census.ts --include-admin  # National + admin only');
    process.exit(1);
  }

  console.log(`Census file: ${censusFile}\n`);
  const census: Census = JSON.parse(fs.readFileSync(censusFile, 'utf-8'));
  console.log(`Census: ${census.total} total, ${census.ingestable} ingestable (from ${census.source})`);
  console.log(`Generated: ${census.generated}\n`);

  // Filter to ingestable entries
  let entries = census.entries.filter(e => e.classification === 'ingestable');
  if (limit) {
    entries = entries.slice(0, limit);
    console.log(`Limiting to first ${limit} entries.\n`);
  }

  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let skipped = 0;
  let succeeded = 0;
  let failed = 0;
  let totalProvisions = 0;
  let emptyDocs = 0;

  for (const entry of entries) {
    const seedId = bbbs2id(entry.bbbs);
    const seedFile = path.join(SEED_DIR, `${seedId}.json`);

    // Incremental: skip if seed already exists (unless --force)
    if (!force && fs.existsSync(seedFile)) {
      skipped++;
      processed++;
      continue;
    }

    const progress = `[${processed + 1}/${entries.length}]`;
    process.stdout.write(`  ${progress} ${entry.title}...`);

    try {
      // Download DOCX
      const result = await fetchFlkDocx(entry.bbbs);

      if (result.status !== 200 || result.buffer.length === 0) {
        console.log(` FAIL (HTTP ${result.status})`);
        writeMinimalSeed(seedFile, entry);
        failed++;
        emptyDocs++;
        processed++;
        continue;
      }

      // Convert DOCX → HTML via mammoth
      const mammothResult = await mammoth.convertToHtml({ buffer: result.buffer });
      const html = mammothResult.value;

      if (!html || html.length < 50) {
        console.log(` EMPTY DOCX`);
        writeMinimalSeed(seedFile, entry);
        failed++;
        emptyDocs++;
        processed++;
        continue;
      }

      // Parse articles from HTML
      const docType = resolveDocType(entry.category_code);
      const status = STATUS_MAP[entry.status] ?? 'in_force';

      const parsed = parseDocxHtml(html, entry.bbbs, {
        title: entry.title,
        type: docType as 'statute' | 'administrative_regulation',
        status,
        issued_date: entry.publish_date,
        in_force_date: entry.effective_date,
      });

      // Build seed
      const seed: Record<string, unknown> = {
        id: entry.bbbs,
        type: docType,
        category: resolveCategory(entry.category_code),
        title: entry.title,
        title_en: '',
        short_name: '',
        status: parsed.status,
        issued_date: entry.publish_date,
        in_force_date: entry.effective_date,
        url: `https://flk.npc.gov.cn/detail?bbbs=${entry.bbbs}`,
        category_code: entry.category_code,
        category_name: entry.category_name,
        issuing_body: entry.issuing_body,
        provisions: parsed.provisions,
        definitions: [],
      };

      // Add province info for local regulations
      if (entry.province_code) {
        seed.province = entry.province;
        seed.province_code = entry.province_code;
      }

      fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
      totalProvisions += parsed.provisions.length;

      if (parsed.provisions.length === 0) {
        console.log(` 0 articles (metadata only)`);
        emptyDocs++;
      } else {
        console.log(` ${parsed.provisions.length} articles`);
      }

      succeeded++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` ERROR: ${msg}`);
      writeMinimalSeed(seedFile, entry);
      failed++;
      emptyDocs++;
    }

    processed++;
  }

  console.log(`\nIngestion complete:`);
  console.log(`  Total entries: ${entries.length}`);
  console.log(`  Skipped (existing): ${skipped}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Empty (metadata only): ${emptyDocs}`);
  console.log(`  Total provisions: ${totalProvisions}`);
}

function writeMinimalSeed(seedFile: string, entry: CensusEntry): void {
  const seed: Record<string, unknown> = {
    id: entry.bbbs,
    type: resolveDocType(entry.category_code),
    category: resolveCategory(entry.category_code),
    title: entry.title,
    title_en: '',
    short_name: '',
    status: STATUS_MAP[entry.status] ?? 'in_force',
    issued_date: entry.publish_date,
    in_force_date: entry.effective_date,
    url: `https://flk.npc.gov.cn/detail?bbbs=${entry.bbbs}`,
    category_code: entry.category_code,
    category_name: entry.category_name,
    issuing_body: entry.issuing_body,
    provisions: [],
    definitions: [],
  };
  if (entry.province_code) {
    seed.province = entry.province;
    seed.province_code = entry.province_code;
  }
  fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
