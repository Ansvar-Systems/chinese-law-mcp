#!/usr/bin/env node

/**
 * Chinese Law MCP Server — stdio entry point.
 *
 * Provides Chinese legislation search via Model Context Protocol.
 * Covers CSL, PIPL, DSL, Company Law, Civil Code, E-Commerce Law, Anti-Monopoly Law.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from '@ansvar/mcp-sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import { registerTools, type AboutContext } from './tools/registry.js';
import { detectCapabilities, readDbMetadata } from './capabilities.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SERVER_NAME = 'chinese-law-mcp';
const SERVER_VERSION = '1.0.0';
const DB_ENV_VAR = 'CHINESE_LAW_DB_PATH';

function resolveDbPath(): string {
  if (process.env[DB_ENV_VAR]) {
    return process.env[DB_ENV_VAR];
  }
  return join(__dirname, '..', 'data', 'database.db');
}

let db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!db) {
    const dbPath = resolveDbPath();
    db = new Database(dbPath, { readonly: true });
    db.pragma('foreign_keys = ON');

    const caps = detectCapabilities(db);
    const meta = readDbMetadata(db);
    console.error(`[${SERVER_NAME}] DB opened: tier=${meta.tier}, caps=[${[...caps].join(',')}]`);
  }
  return db;
}

function computeAboutContext(): AboutContext {
  const dbPath = resolveDbPath();
  let fingerprint = 'unknown';
  let dbBuilt = 'unknown';

  try {
    const buf = readFileSync(dbPath);
    fingerprint = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  } catch {
    // DB might not exist in dev
  }

  try {
    const database = getDb();
    const row = database.prepare("SELECT value FROM db_metadata WHERE key = 'built_at'").get() as { value: string } | undefined;
    if (row) dbBuilt = row.value;
  } catch {
    // Ignore
  }

  return { version: SERVER_VERSION, fingerprint, dbBuilt };
}

async function main() {
  const database = getDb();
  const aboutContext = computeAboutContext();

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  registerTools(server, database, aboutContext);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server running on stdio`);

  const cleanup = () => {
    if (db) {
      db.close();
      db = null;
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, err);
  process.exit(1);
});
