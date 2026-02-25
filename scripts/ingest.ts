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

// FLK category codes → document type
const ADMIN_REG_CODES = new Set([210, 215, 220]);

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
  total: number;
  ingestable: number;
  excluded: number;
  entries: CensusEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { limit: number | null; force: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--force') {
      force = true;
    }
  }
  return { limit, force };
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
  const { limit, force } = parseArgs();

  console.log('Chinese Law MCP — Ingestion Pipeline');
  console.log('====================================\n');

  // Load census
  if (!fs.existsSync(CENSUS_PATH)) {
    console.error('ERROR: Census file not found. Run census.ts first:');
    console.error('  npx tsx scripts/census.ts --include-admin');
    process.exit(1);
  }

  const census: Census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));
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
      const docType = ADMIN_REG_CODES.has(entry.category_code) ? 'administrative_regulation' : 'statute';
      const status = STATUS_MAP[entry.status] ?? 'in_force';

      const parsed = parseDocxHtml(html, entry.bbbs, {
        title: entry.title,
        type: docType as 'statute' | 'administrative_regulation',
        status,
        issued_date: entry.publish_date,
        in_force_date: entry.effective_date,
      });

      // Build seed
      const seed = {
        id: entry.bbbs,
        type: parsed.type,
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
  const docType = ADMIN_REG_CODES.has(entry.category_code) ? 'administrative_regulation' : 'statute';
  const seed = {
    id: entry.bbbs,
    type: docType,
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
  fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
