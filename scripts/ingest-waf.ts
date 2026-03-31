#!/usr/bin/env tsx
/**
 * Chinese Law MCP — WAF-Protected Content Ingestion
 *
 * Downloads content for local regulations, judicial interpretations, and other
 * categories that are blocked by the flk.npc.gov.cn JavaScript challenge WAF.
 *
 * Uses Playwright (headless Chromium) to:
 *   1. Navigate to the detail page for each law
 *   2. Wait for the JavaScript challenge to resolve
 *   3. Click the DOCX download link (or extract HTML body)
 *   4. Save content through the standard parser pipeline
 *
 * Prerequisites:
 *   npx playwright install chromium
 *
 * Usage:
 *   npx tsx scripts/ingest-waf.ts                       # All WAF-blocked entries
 *   npx tsx scripts/ingest-waf.ts --limit 50            # Test with 50 entries
 *   npx tsx scripts/ingest-waf.ts --category 320        # Only judicial interpretations
 *   npx tsx scripts/ingest-waf.ts --category 270,290,260 # Multiple categories (comma-separated)
 *   npx tsx scripts/ingest-waf.ts --force               # Re-download existing seeds
 *   npx tsx scripts/ingest-waf.ts --concurrency 3       # Parallel browser tabs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser, type Page } from 'playwright';
import mammoth from 'mammoth';
import { parseDocxHtml } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');

const FLK_DETAIL_URL = 'https://flk.npc.gov.cn/detail';
const FLK_DOWNLOAD_URL = 'https://flk.npc.gov.cn/law-search/download/mobile';

// Categories that are WAF-blocked and need Playwright
const WAF_BLOCKED_CODES = new Set([220, 230, 260, 270, 290, 295, 300, 305, 320, 330, 340]);

// Category → document type mapping
const DOC_TYPE_MAP: Record<number, string> = {
  220: 'supervisory_regulation',
  230: 'local_regulation', 260: 'local_regulation', 270: 'local_regulation',
  290: 'local_regulation', 295: 'local_regulation', 300: 'local_regulation',
  305: 'regulatory_decision',
  320: 'judicial_interpretation', 330: 'judicial_interpretation', 340: 'judicial_interpretation',
};

const CATEGORY_MAP: Record<number, string> = {
  220: 'supervisory_reg',
  230: 'local_reg', 260: 'local_reg', 270: 'local_reg',
  290: 'local_reg', 295: 'local_reg', 300: 'local_reg',
  305: 'regulatory_decision',
  320: 'judicial_interp', 330: 'judicial_interp', 340: 'judicial_interp',
};

const STATUS_MAP: Record<string, string> = {
  in_force: 'in_force',
  amended: 'amended',
  repealed: 'repealed',
  not_yet_in_force: 'not_yet_in_force',
  unknown: 'in_force',
};

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
  province?: string;
  province_code?: string;
}

interface Census {
  entries: CensusEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let force = false;
  let categoryFilter: number[] = [];
  let concurrency = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i++; }
    if (args[i] === '--force') { force = true; }
    if (args[i] === '--category' && args[i + 1]) {
      categoryFilter = args[i + 1].split(',').map(s => parseInt(s.trim(), 10));
      i++;
    }
    if (args[i] === '--concurrency' && args[i + 1]) { concurrency = parseInt(args[i + 1], 10); i++; }
  }
  return { limit, force, categoryFilter, concurrency };
}

// ─────────────────────────────────────────────────────────────────────────────
// Playwright: download DOCX through the WAF
// ─────────────────────────────────────────────────────────────────────────────

async function downloadViaPlaywright(page: Page, bbbs: string): Promise<Buffer | null> {
  const downloadUrl = `${FLK_DOWNLOAD_URL}?format=docx&bbbs=${bbbs}`;

  try {
    // Use Promise.all pattern: register download listener BEFORE goto.
    // goto() throws when the response is a file download (not a page), so we
    // catch it and rely on the download event instead.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.goto(downloadUrl, { timeout: 30_000 }).catch(() => null),
    ]);

    const downloadPath = await download.path();
    if (downloadPath) {
      const buffer = fs.readFileSync(downloadPath);
      if (buffer.length > 100) return buffer;
    }

    return null;
  } catch (error) {
    return null;
  }
}

async function extractHtmlContent(page: Page, bbbs: string): Promise<string | null> {
  // The detail page is a Vue SPA — static selectors won't match.
  // Instead, intercept the JSON API response that the Vue app fetches.
  const detailUrl = `${FLK_DETAIL_URL}?bbbs=${bbbs}`;

  try {
    let apiContent: string | null = null;

    // Listen for API responses containing law body text
    const responseHandler = async (response: import('playwright').Response) => {
      const url = response.url();
      if (!url.includes(bbbs)) return;
      const ct = response.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      try {
        const text = await response.text();
        if (text.length > 200 && !apiContent) apiContent = text;
      } catch {}
    };

    page.on('response', responseHandler);

    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(8_000); // Let Vue hydrate and fetch data

    page.off('response', responseHandler);

    if (apiContent) {
      // Try to extract the body/content field from the JSON
      try {
        const json = JSON.parse(apiContent);
        const body = json?.result?.body ?? json?.data?.body ?? json?.body ?? '';
        if (typeof body === 'string' && body.length > 100) return body;
      } catch {}
      // Return raw if large enough — parser can handle HTML
      if (apiContent.length > 200) return apiContent;
    }

    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Process a single entry
// ─────────────────────────────────────────────────────────────────────────────

async function processEntry(
  page: Page,
  entry: CensusEntry,
  force: boolean,
): Promise<{ success: boolean; provisions: number }> {
  const seedFile = path.join(SEED_DIR, `${entry.bbbs}.json`);

  if (!force && fs.existsSync(seedFile)) {
    return { success: true, provisions: 0 };
  }

  const docType = DOC_TYPE_MAP[entry.category_code] ?? 'statute';
  const category = CATEGORY_MAP[entry.category_code] ?? 'other';
  const status = STATUS_MAP[entry.status] ?? 'in_force';

  // Try DOCX download first
  const docxBuffer = await downloadViaPlaywright(page, entry.bbbs);

  if (docxBuffer && docxBuffer.length > 100) {
    try {
      const mammothResult = await mammoth.convertToHtml({ buffer: docxBuffer });
      const html = mammothResult.value;

      if (html && html.length > 50) {
        const parsed = parseDocxHtml(html, entry.bbbs, {
          title: entry.title,
          type: docType as 'statute' | 'administrative_regulation',
          status: status as any,
          issued_date: entry.publish_date,
          in_force_date: entry.effective_date,
        });

        const seed: Record<string, unknown> = {
          id: entry.bbbs,
          type: docType,
          category,
          title: entry.title,
          title_en: '',
          short_name: '',
          status,
          issued_date: entry.publish_date,
          in_force_date: entry.effective_date,
          url: `https://flk.npc.gov.cn/detail?bbbs=${entry.bbbs}`,
          category_code: entry.category_code,
          category_name: entry.category_name,
          issuing_body: entry.issuing_body,
          provisions: parsed.provisions,
          definitions: [],
        };

        if (entry.province_code) {
          seed.province = entry.province;
          seed.province_code = entry.province_code;
        }

        fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
        return { success: true, provisions: parsed.provisions.length };
      }
    } catch {
      // DOCX parse failed — try HTML fallback
    }
  }

  // Fallback: extract from HTML detail page
  const htmlContent = await extractHtmlContent(page, entry.bbbs);

  if (htmlContent) {
    const parsed = parseDocxHtml(htmlContent, entry.bbbs, {
      title: entry.title,
      type: docType as 'statute' | 'administrative_regulation',
      status: status as any,
      issued_date: entry.publish_date,
      in_force_date: entry.effective_date,
    });

    const seed: Record<string, unknown> = {
      id: entry.bbbs,
      type: docType,
      category,
      title: entry.title,
      title_en: '',
      short_name: '',
      status,
      issued_date: entry.publish_date,
      in_force_date: entry.effective_date,
      url: `https://flk.npc.gov.cn/detail?bbbs=${entry.bbbs}`,
      category_code: entry.category_code,
      category_name: entry.category_name,
      issuing_body: entry.issuing_body,
      provisions: parsed.provisions,
      definitions: [],
    };

    if (entry.province_code) {
      seed.province = entry.province;
      seed.province_code = entry.province_code;
    }

    fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
    return { success: true, provisions: parsed.provisions.length };
  }

  // Write metadata-only seed as last resort
  const seed: Record<string, unknown> = {
    id: entry.bbbs,
    type: docType,
    category,
    title: entry.title,
    title_en: '',
    short_name: '',
    status,
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
  return { success: false, provisions: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { limit, force, categoryFilter, concurrency } = parseArgs();

  console.log('Chinese Law MCP — WAF-Protected Content Ingestion');
  console.log('==================================================\n');

  if (!fs.existsSync(CENSUS_PATH)) {
    console.error('ERROR: Census file not found. Run census.ts --full-corpus first.');
    process.exit(1);
  }

  const census: Census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));

  // Filter to WAF-blocked, ingestable entries
  let entries = census.entries.filter(e =>
    e.classification === 'ingestable' &&
    WAF_BLOCKED_CODES.has(e.category_code)
  );

  if (categoryFilter.length > 0) {
    const filterSet = new Set(categoryFilter);
    entries = entries.filter(e => filterSet.has(e.category_code));
    console.log(`Filtering to categories: ${categoryFilter.join(', ')}\n`);
  }

  if (limit) {
    entries = entries.slice(0, limit);
    console.log(`Limiting to ${limit} entries\n`);
  }

  console.log(`Entries to process: ${entries.length}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Force re-download: ${force}\n`);

  // Skip already-seeded entries (unless force)
  if (!force) {
    const before = entries.length;
    entries = entries.filter(e => !fs.existsSync(path.join(SEED_DIR, `${e.bbbs}.json`)));
    const skipped = before - entries.length;
    if (skipped > 0) {
      console.log(`Skipping ${skipped} already-seeded entries, ${entries.length} remaining\n`);
    }
  }

  if (entries.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  fs.mkdirSync(SEED_DIR, { recursive: true });

  // Launch browser
  console.log('Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let succeeded = 0;
  let failed = 0;
  let totalProvisions = 0;

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Prime WAF cookies — visit main site once so all subsequent pages share the session
    console.log('Priming WAF cookies...');
    const primePage = await context.newPage();
    await primePage.goto('https://flk.npc.gov.cn/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await primePage.waitForTimeout(3_000);
    await primePage.close();
    console.log('WAF cookies primed.\n');

    // Process in batches with concurrency
    for (let i = 0; i < entries.length; i += concurrency) {
      const batch = entries.slice(i, i + concurrency);
      const pages = await Promise.all(batch.map(() => context.newPage()));

      const results = await Promise.allSettled(
        batch.map((entry, idx) => {
          const progress = `[${i + idx + 1}/${entries.length}]`;
          process.stdout.write(`  ${progress} ${entry.title.substring(0, 40)}...`);
          return processEntry(pages[idx], entry, force);
        })
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled' && result.value.success) {
          succeeded++;
          totalProvisions += result.value.provisions;
          console.log(` ${result.value.provisions} articles`);
        } else {
          failed++;
          console.log(` FAIL`);
        }
      }

      // Close pages after batch
      await Promise.all(pages.map(p => p.close()));

      // Rate limit between batches (2 seconds to avoid server throttling)
      if (i + concurrency < entries.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nIngestion complete:`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total provisions: ${totalProvisions}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
