#!/usr/bin/env tsx
/**
 * Database builder for Chinese Law MCP server.
 *
 * Builds the SQLite database from seed JSON files in data/seed/.
 * Includes all laws for the professional tier.
 *
 * Usage: npm run build:db
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const DB_PATH = path.resolve(__dirname, '../data/database.db');

// ─────────────────────────────────────────────────────────────────────────────
// Seed file types
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentSeed {
  id: string;
  type: 'statute' | 'administrative_regulation' | 'departmental_rule' | 'local_regulation' | 'judicial_interpretation' | 'regulatory_decision' | 'supervisory_regulation';
  category?: string;
  title: string;
  title_en?: string;
  short_name?: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
  issuing_body?: string;
  province?: string;
  province_code?: string;
  provisions?: ProvisionSeed[];
  definitions?: DefinitionSeed[];
}

interface ProvisionSeed {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

interface DefinitionSeed {
  term: string;
  term_en?: string;
  definition: string;
  source_provision?: string;
}

interface ProvisionDedupStats {
  duplicate_refs: number;
  conflicting_duplicates: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database schema
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = `
-- Legal documents (laws, administrative regulations, local regulations, judicial interpretations)
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('statute', 'administrative_regulation', 'judicial_interpretation', 'departmental_rule', 'local_regulation', 'regulatory_decision', 'supervisory_regulation')),
  category TEXT,
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,
  status TEXT NOT NULL DEFAULT 'in_force'
    CHECK(status IN ('in_force', 'amended', 'repealed', 'not_yet_in_force')),
  issued_date TEXT,
  in_force_date TEXT,
  url TEXT,
  description TEXT,
  issuing_body TEXT,
  province TEXT,
  province_code TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_documents_type ON legal_documents(type);
CREATE INDEX idx_documents_category ON legal_documents(category);
CREATE INDEX idx_documents_province ON legal_documents(province_code);

-- Individual provisions (articles) from laws
CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  chapter TEXT,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  language TEXT DEFAULT 'zh',
  metadata TEXT,
  UNIQUE(document_id, provision_ref, language)
);

CREATE INDEX idx_provisions_doc ON legal_provisions(document_id);
CREATE INDEX idx_provisions_chapter ON legal_provisions(document_id, chapter);
CREATE INDEX idx_provisions_lang ON legal_provisions(language);

-- FTS5 for provision search (trigram tokenizer for CJK substring matching)
CREATE VIRTUAL TABLE provisions_fts USING fts5(
  content, title,
  content='legal_provisions',
  content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER provisions_ai AFTER INSERT ON legal_provisions BEGIN
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provisions_ad AFTER DELETE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provisions_au AFTER UPDATE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

-- Cross-references between provisions/documents
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  source_provision_ref TEXT,
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,
  ref_type TEXT NOT NULL DEFAULT 'references'
    CHECK(ref_type IN ('references', 'amended_by', 'implements', 'see_also'))
);

CREATE INDEX idx_xref_source ON cross_references(source_document_id);
CREATE INDEX idx_xref_target ON cross_references(target_document_id);

-- Legal term definitions
CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  term TEXT NOT NULL,
  term_en TEXT,
  definition TEXT NOT NULL,
  source_provision TEXT,
  UNIQUE(document_id, term)
);

-- FTS5 for definition search (trigram tokenizer for CJK substring matching)
CREATE VIRTUAL TABLE definitions_fts USING fts5(
  term, definition,
  content='definitions',
  content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER definitions_ai AFTER INSERT ON definitions BEGIN
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

CREATE TRIGGER definitions_ad AFTER DELETE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
END;

CREATE TRIGGER definitions_au AFTER UPDATE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

-- Build metadata
CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// ─────────────────────────────────────────────────────────────────────────────
// English names and abbreviations for key laws
// ─────────────────────────────────────────────────────────────────────────────

/** Map from Chinese title substring → { title_en, short_name } */
const ENGLISH_NAMES: Record<string, { title_en: string; short_name: string }> = {
  '个人信息保护法': { title_en: 'Personal Information Protection Law', short_name: 'PIPL' },
  '网络安全法': { title_en: 'Cybersecurity Law', short_name: 'CSL' },
  '数据安全法': { title_en: 'Data Security Law', short_name: 'DSL' },
  '民法典': { title_en: 'Civil Code', short_name: 'Civil Code' },
  '公司法': { title_en: 'Company Law', short_name: 'Company Law' },
  '电子商务法': { title_en: 'E-Commerce Law', short_name: 'E-Commerce Law' },
  '反垄断法': { title_en: 'Anti-Monopoly Law', short_name: 'AML' },
  '反不正当竞争法': { title_en: 'Anti-Unfair Competition Law', short_name: 'AUCL' },
  '消费者权益保护法': { title_en: 'Consumer Rights Protection Law', short_name: 'Consumer Protection Law' },
  '劳动法': { title_en: 'Labour Law', short_name: 'Labour Law' },
  '劳动合同法': { title_en: 'Labour Contract Law', short_name: 'Labour Contract Law' },
  '刑法': { title_en: 'Criminal Law', short_name: 'Criminal Law' },
  '刑事诉讼法': { title_en: 'Criminal Procedure Law', short_name: 'Criminal Procedure Law' },
  '民事诉讼法': { title_en: 'Civil Procedure Law', short_name: 'Civil Procedure Law' },
  '行政诉讼法': { title_en: 'Administrative Litigation Law', short_name: 'Administrative Litigation Law' },
  '行政处罚法': { title_en: 'Administrative Penalty Law', short_name: 'Administrative Penalty Law' },
  '证券法': { title_en: 'Securities Law', short_name: 'Securities Law' },
  '银行业监督管理法': { title_en: 'Banking Supervision Law', short_name: 'Banking Supervision Law' },
  '保险法': { title_en: 'Insurance Law', short_name: 'Insurance Law' },
  '税收征收管理法': { title_en: 'Tax Collection and Administration Law', short_name: 'Tax Administration Law' },
  '环境保护法': { title_en: 'Environmental Protection Law', short_name: 'Environmental Protection Law' },
  '著作权法': { title_en: 'Copyright Law', short_name: 'Copyright Law' },
  '专利法': { title_en: 'Patent Law', short_name: 'Patent Law' },
  '商标法': { title_en: 'Trademark Law', short_name: 'Trademark Law' },
  '反间谍法': { title_en: 'Counter-Espionage Law', short_name: 'Counter-Espionage Law' },
  '国家安全法': { title_en: 'National Security Law', short_name: 'National Security Law' },
  '密码法': { title_en: 'Cryptography Law', short_name: 'Cryptography Law' },
  '电子签名法': { title_en: 'Electronic Signature Law', short_name: 'E-Signature Law' },
  '反恐怖主义法': { title_en: 'Anti-Terrorism Law', short_name: 'Anti-Terrorism Law' },
  '宪法': { title_en: 'Constitution of the People\'s Republic of China', short_name: 'Constitution' },
  '立法法': { title_en: 'Legislation Law', short_name: 'Legislation Law' },
  '合同法': { title_en: 'Contract Law', short_name: 'Contract Law' },
  '物权法': { title_en: 'Property Law', short_name: 'Property Law' },
  '侵权责任法': { title_en: 'Tort Liability Law', short_name: 'Tort Law' },
  '外商投资法': { title_en: 'Foreign Investment Law', short_name: 'FIL' },
  '反洗钱法': { title_en: 'Anti-Money Laundering Law', short_name: 'Anti-Money Laundering Law' },
  '招标投标法': { title_en: 'Bidding Law', short_name: 'Bidding Law' },
  '政府采购法': { title_en: 'Government Procurement Law', short_name: 'Government Procurement Law' },
};

function resolveEnglishName(chineseTitle: string): { title_en: string; short_name: string } | null {
  for (const [key, value] of Object.entries(ENGLISH_NAMES)) {
    if (chineseTitle.includes(key)) {
      return value;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function pickPreferredProvision(existing: ProvisionSeed, incoming: ProvisionSeed): ProvisionSeed {
  const existingContent = normalizeWhitespace(existing.content);
  const incomingContent = normalizeWhitespace(incoming.content);

  if (incomingContent.length > existingContent.length) {
    return { ...incoming, title: incoming.title ?? existing.title };
  }
  return { ...existing, title: existing.title ?? incoming.title };
}

function dedupeProvisions(provisions: ProvisionSeed[]): { deduped: ProvisionSeed[]; stats: ProvisionDedupStats } {
  const byRef = new Map<string, ProvisionSeed>();
  const stats: ProvisionDedupStats = { duplicate_refs: 0, conflicting_duplicates: 0 };

  for (const provision of provisions) {
    const key = `${provision.provision_ref}:${provision.language ?? 'zh'}`;
    const existing = byRef.get(key);

    if (!existing) {
      byRef.set(key, { ...provision, provision_ref: provision.provision_ref.trim() });
      continue;
    }

    stats.duplicate_refs++;
    const existingContent = normalizeWhitespace(existing.content);
    const incomingContent = normalizeWhitespace(provision.content);
    if (existingContent !== incomingContent) {
      stats.conflicting_duplicates++;
    }

    byRef.set(key, pickPreferredProvision(existing, provision));
  }

  return { deduped: Array.from(byRef.values()), stats };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────

function buildDatabase(): void {
  console.log('Building Chinese Law MCP database...\n');

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('  Deleted existing database.\n');
  }

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(SCHEMA);

  const insertDoc = db.prepare(`
    INSERT INTO legal_documents (id, type, category, title, title_en, short_name, status, issued_date, in_force_date, url, description, issuing_body, province, province_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProvision = db.prepare(`
    INSERT INTO legal_provisions (document_id, provision_ref, chapter, section, title, content, language, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDefinition = db.prepare(`
    INSERT INTO definitions (document_id, term, term_en, definition, source_provision)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Load seed files
  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed directory at ${SEED_DIR} — creating empty database.`);
    writeMeta(db, 'professional');
    db.close();
    return;
  }

  const seedFiles = fs.readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_'));

  if (seedFiles.length === 0) {
    console.log('No seed files found. Database created with empty schema.');
    writeMeta(db, 'professional');
    db.close();
    return;
  }

  let totalDocs = 0;
  let totalProvisions = 0;
  let totalDefs = 0;
  let totalDuplicateRefs = 0;
  let totalConflictingDuplicates = 0;
  let emptyDocs = 0;

  const loadAll = db.transaction(() => {
    for (const file of seedFiles) {
      const filePath = path.join(SEED_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const seed = JSON.parse(content) as DocumentSeed;

      const englishName = resolveEnglishName(seed.title);
      insertDoc.run(
        seed.id,
        seed.type ?? 'statute',
        seed.category ?? null,
        seed.title,
        seed.title_en || englishName?.title_en || null,
        seed.short_name || englishName?.short_name || null,
        seed.status ?? 'in_force',
        seed.issued_date ?? null,
        seed.in_force_date ?? null,
        seed.url ?? null,
        seed.description ?? null,
        seed.issuing_body ?? null,
        seed.province ?? null,
        seed.province_code ?? null,
      );
      totalDocs++;

      if (!seed.provisions || seed.provisions.length === 0) {
        emptyDocs++;
      } else {
        const { deduped, stats } = dedupeProvisions(seed.provisions);
        totalDuplicateRefs += stats.duplicate_refs;
        totalConflictingDuplicates += stats.conflicting_duplicates;
        if (stats.duplicate_refs > 0) {
          console.log(
            `    WARNING: ${stats.duplicate_refs} duplicate refs in ${seed.id} ` +
            `(${stats.conflicting_duplicates} with different text).`
          );
        }

        for (const prov of deduped) {
          insertProvision.run(
            seed.id,
            prov.provision_ref,
            prov.chapter ?? null,
            prov.section,
            prov.title ?? null,
            prov.content,
            prov.language ?? 'zh',
            prov.metadata ? JSON.stringify(prov.metadata) : null,
          );
          totalProvisions++;
        }
      }

      for (const def of seed.definitions ?? []) {
        insertDefinition.run(
          seed.id,
          def.term,
          def.term_en ?? null,
          def.definition,
          def.source_provision ?? null,
        );
        totalDefs++;
      }
    }
  });

  loadAll();
  writeMeta(db, 'professional');

  db.pragma('journal_mode = DELETE');
  db.exec('ANALYZE');
  db.exec('VACUUM');
  db.close();

  const size = fs.statSync(DB_PATH).size;
  console.log(
    `\nBuild complete: ${totalDocs} documents, ${totalProvisions} provisions, ` +
    `${totalDefs} definitions`
  );
  if (emptyDocs > 0) {
    console.log(`  ${emptyDocs} documents with no provisions.`);
  }
  if (totalDuplicateRefs > 0) {
    console.log(
      `Data quality: ${totalDuplicateRefs} duplicate refs detected ` +
      `(${totalConflictingDuplicates} with conflicting text).`
    );
  }
  console.log(`Output: ${DB_PATH} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

function writeMeta(db: Database.Database, tier: string): void {
  const insertMeta = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  const writeMetaTx = db.transaction(() => {
    insertMeta.run('tier', tier);
    insertMeta.run('schema_version', '2');
    insertMeta.run('built_at', new Date().toISOString());
    insertMeta.run('builder', 'build-db.ts');
    insertMeta.run('jurisdiction', 'CN');
    insertMeta.run('source', 'flk.npc.gov.cn');
    insertMeta.run('licence', 'Government Public Data');
  });
  writeMetaTx();
}

buildDatabase();
