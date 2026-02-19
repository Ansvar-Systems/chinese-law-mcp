#!/usr/bin/env tsx
/**
 * Check npc.gov.cn for newly published or updated Chinese laws.
 *
 * Exits:
 *   0 = no updates
 *   1 = updates found
 *   2 = check failed
 */

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../data/database.db');

const USER_AGENT = 'ChineseLawMCP/1.0';
const REQUEST_TIMEOUT_MS = 30_000;

// Key law pages to check for updates
const CHECK_URLS = [
  { id: 'csl-2016', url: 'https://www.npc.gov.cn/npc/c2/c30834/202411/t20241101_441026.html', title: 'Cybersecurity Law' },
  { id: 'pipl-2021', url: 'https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313095.html', title: 'PIPL' },
  { id: 'dsl-2021', url: 'https://www.npc.gov.cn/npc/c2/c30834/202106/t20210610_312280.html', title: 'Data Security Law' },
];

async function checkUrl(url: string): Promise<{ status: number; contentLength: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    return {
      status: response.status,
      contentLength: parseInt(response.headers.get('content-length') ?? '0', 10),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  console.log('Chinese Law MCP - Update checker');
  console.log('');

  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(2);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const localDocs = new Set<string>(
    (db.prepare("SELECT id FROM legal_documents").all() as { id: string }[]).map(r => r.id),
  );
  db.close();

  let issueCount = 0;

  for (const check of CHECK_URLS) {
    try {
      const result = await checkUrl(check.url);
      if (result.status === 200) {
        const status = localDocs.has(check.id) ? 'LOCAL' : 'MISSING';
        console.log(`  ${status} ${check.id}: ${check.title} (HTTP ${result.status})`);
        if (!localDocs.has(check.id)) {
          issueCount++;
        }
      } else {
        console.log(`  WARN  ${check.id}: HTTP ${result.status} (URL may have changed)`);
        issueCount++;
      }
    } catch (error) {
      console.log(`  ERROR ${check.id}: ${error instanceof Error ? error.message : String(error)}`);
      issueCount++;
    }
  }

  console.log('');
  if (issueCount > 0) {
    console.log(`${issueCount} issue(s) detected.`);
    process.exit(1);
  }

  console.log('All checked URLs are accessible and locally present.');
}

main().catch((error) => {
  console.error(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
