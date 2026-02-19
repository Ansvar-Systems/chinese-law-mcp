import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import { join } from 'path';
import { existsSync, createWriteStream, rmSync, renameSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import https from 'https';
import type { IncomingMessage } from 'http';

import { registerTools } from '../src/tools/registry.js';
import type { AboutContext } from '../src/tools/registry.js';

// ---------------------------------------------------------------------------
// Server identity
// ---------------------------------------------------------------------------

const SERVER_NAME = 'chinese-law-mcp';
const SERVER_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Database — downloaded from GitHub Releases on cold start (Strategy B)
// ---------------------------------------------------------------------------

const TMP_DB = '/tmp/database.db';
const TMP_DB_TMP = '/tmp/database.db.tmp';
const TMP_DB_LOCK = '/tmp/database.db.lock';

const GITHUB_REPO = 'Ansvar-Systems/chinese-law-mcp';
const RELEASE_TAG = `v${SERVER_VERSION}`;
const ASSET_NAME = 'database.db.gz';
const DEFAULT_RELEASE_URL =
  `https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}/${ASSET_NAME}`;

let db: InstanceType<typeof Database> | null = null;
let resolvedDbPath = TMP_DB;
let dbReady = false;
let dbReadyPromise: Promise<void> | null = null;

function httpsGet(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': SERVER_NAME } }, resolve)
      .on('error', reject);
  });
}

async function downloadDatabase(url: string): Promise<void> {
  let response = await httpsGet(url);

  // Follow up to 5 redirects (GitHub redirects to S3)
  let redirects = 0;
  while (
    response.statusCode &&
    response.statusCode >= 300 &&
    response.statusCode < 400 &&
    response.headers.location &&
    redirects < 5
  ) {
    response = await httpsGet(response.headers.location);
    redirects++;
  }

  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to download database: HTTP ${response.statusCode} from ${url}`,
    );
  }

  const gunzip = createGunzip();
  const out = createWriteStream(TMP_DB_TMP);
  await pipeline(response, gunzip, out);
  renameSync(TMP_DB_TMP, TMP_DB);
  resolvedDbPath = TMP_DB;
}

async function initializeDatabase(): Promise<void> {
  if (dbReady) {
    return;
  }

  // Clean stale lock files from previous invocations
  if (existsSync(TMP_DB_LOCK)) {
    rmSync(TMP_DB_LOCK, { recursive: true, force: true });
  }

  const envDb = process.env.CHINESE_LAW_DB_PATH;
  if (envDb && existsSync(envDb)) {
    resolvedDbPath = envDb;
    dbReady = true;
    return;
  }

  if (existsSync(TMP_DB)) {
    resolvedDbPath = TMP_DB;
    dbReady = true;
    return;
  }

  // Local fallback if a bundled DB is available.
  const bundledDb = join(process.cwd(), 'data', 'database.db');
  if (existsSync(bundledDb)) {
    const { copyFileSync } = await import('fs');
    copyFileSync(bundledDb, TMP_DB);
    resolvedDbPath = TMP_DB;
    dbReady = true;
    return;
  }

  const downloadUrl = process.env.CHINESE_LAW_DB_URL ?? DEFAULT_RELEASE_URL;
  console.log(`[${SERVER_NAME}] Downloading database from ${downloadUrl}`);
  await downloadDatabase(downloadUrl);
  console.log(`[${SERVER_NAME}] Database download complete`);

  dbReady = true;
}

async function ensureDatabase(): Promise<void> {
  if (dbReady) {
    return;
  }

  if (!dbReadyPromise) {
    dbReadyPromise = initializeDatabase().finally(() => {
      if (!dbReady) {
        dbReadyPromise = null;
      }
    });
  }

  await dbReadyPromise;
}

function getDatabase(): InstanceType<typeof Database> {
  if (!db) {
    if (!existsSync(resolvedDbPath)) {
      throw new Error(`Resolved database path does not exist: ${resolvedDbPath}`);
    }
    db = new Database(resolvedDbPath, { readonly: true });
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: 'mcp-streamable-http',
    });
    return;
  }

  try {
    await ensureDatabase();
    const database = getDatabase();

    const server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    // Build lightweight about context from DB metadata
    let fingerprint = 'http-runtime';
    let dbBuilt = 'unknown';
    try {
      const row = database.prepare("SELECT value FROM db_metadata WHERE key = 'built_at'").get() as { value: string } | undefined;
      if (row) dbBuilt = row.value;
    } catch { /* ignore */ }
    const aboutContext: AboutContext = { version: SERVER_VERSION, fingerprint, dbBuilt };

    registerTools(server, database, aboutContext);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MCP handler error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}
