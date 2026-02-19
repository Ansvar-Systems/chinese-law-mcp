/**
 * Runtime capability detection for Chinese Law MCP.
 * Detects which database tables are available to enable/disable features.
 */

import type Database from '@ansvar/mcp-sqlite';

export type Capability =
  | 'core_legislation'
  | 'eu_references'
  | 'judicial_interpretations'
  | 'departmental_rules';

const TABLE_MAP: Record<Capability, string[]> = {
  core_legislation: ['legal_documents', 'legal_provisions', 'provisions_fts'],
  eu_references: ['eu_documents', 'eu_references'],
  judicial_interpretations: ['judicial_interpretations'],
  departmental_rules: ['departmental_rules'],
};

export function detectCapabilities(db: InstanceType<typeof Database>): Set<Capability> {
  const caps = new Set<Capability>();
  const tables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map(r => r.name)
  );

  for (const [cap, required] of Object.entries(TABLE_MAP)) {
    if (required.every(t => tables.has(t))) {
      caps.add(cap as Capability);
    }
  }

  return caps;
}

export interface DbMetadata {
  tier: string;
  schema_version: string;
  built_at?: string;
  builder?: string;
}

export function readDbMetadata(db: InstanceType<typeof Database>): DbMetadata {
  const meta: Record<string, string> = {};
  try {
    const rows = db.prepare('SELECT key, value FROM db_metadata').all() as { key: string; value: string }[];
    for (const row of rows) {
      meta[row.key] = row.value;
    }
  } catch {
    // db_metadata table may not exist
  }
  return {
    tier: meta.tier ?? 'free',
    schema_version: meta.schema_version ?? '1.0',
    built_at: meta.built_at,
    builder: meta.builder,
  };
}

export function upgradeMessage(feature: string): string {
  return `The "${feature}" feature requires a professional-tier database. Contact hello@ansvar.eu for access.`;
}
