#!/usr/bin/env tsx
/**
 * Upstream drift detection for golden anchors.
 *
 * Checks that key provisions on npc.gov.cn have not changed since
 * the last database build.
 *
 * Exits:
 *   0 = no drift
 *   1 = network/error failures
 *   2 = drift detected
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HASHES_PATH = resolve(__dirname, '../fixtures/golden-hashes.json');
const USER_AGENT = 'ChineseLawMCP-DriftDetect/1.0';
const REQUEST_TIMEOUT_MS = 30_000;

interface GoldenHashEntry {
  id: string;
  description: string;
  upstream_url: string;
  selector_hint: string;
  expected_sha256: string;
  expected_snippet: string;
}

interface GoldenHashFile {
  provisions?: GoldenHashEntry[];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sha256(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex');
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const file = JSON.parse(readFileSync(HASHES_PATH, 'utf-8')) as GoldenHashFile;
  const provisions = file.provisions ?? [];

  if (provisions.length === 0) {
    console.log('No drift anchors configured in fixtures/golden-hashes.json');
    process.exit(0);
  }

  let driftCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  console.log(`Drift detection: checking ${provisions.length} anchors...\n`);

  for (const entry of provisions) {
    if (entry.expected_sha256 === 'COMPUTE_ON_FIRST_INGEST') {
      console.log(`  SKIP  ${entry.id}: expected hash not locked yet`);
      skippedCount++;
      continue;
    }

    try {
      const body = await fetchText(entry.upstream_url);
      const actualHash = sha256(body);

      if (actualHash !== entry.expected_sha256) {
        console.log(`  DRIFT ${entry.id}: ${entry.description}`);
        console.log(`        expected=${entry.expected_sha256}`);
        console.log(`        actual=${actualHash}`);
        driftCount++;
      } else {
        console.log(`  OK    ${entry.id}: ${entry.description}`);
      }
    } catch (error) {
      console.log(
        `  ERROR ${entry.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      errorCount++;
    }

    // Rate limit: 1000ms between requests to Chinese government sites
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('');
  console.log(
    `Results: ${provisions.length - driftCount - errorCount - skippedCount} ok, ` +
    `${driftCount} drift, ${errorCount} errors, ${skippedCount} skipped`,
  );

  if (driftCount > 0) {
    process.exit(2);
  }
  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal drift-detect error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
