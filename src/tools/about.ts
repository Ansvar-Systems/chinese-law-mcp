/**
 * about — Server metadata, dataset statistics, and provenance.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface AboutContext {
  version: string;
  fingerprint: string;
  dbBuilt: string;
}

function safeCount(db: InstanceType<typeof Database>, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

export function getAbout(db: InstanceType<typeof Database>, context: AboutContext) {

  const euRefs = safeCount(db, 'SELECT COUNT(*) as count FROM eu_references');

  const stats: Record<string, number> = {
    documents: safeCount(db, 'SELECT COUNT(*) as count FROM legal_documents'),
    provisions: safeCount(db, 'SELECT COUNT(*) as count FROM legal_provisions'),
    definitions: safeCount(db, 'SELECT COUNT(*) as count FROM definitions'),
  };

  if (euRefs > 0) {
    stats.eu_documents = safeCount(db, 'SELECT COUNT(*) as count FROM eu_documents');
    stats.eu_references = euRefs;
  }

  return {
    name: 'Chinese Law MCP',
    version: context.version,
    jurisdiction: 'CN',
    description: 'Chinese Law MCP — legislation via Model Context Protocol',
    stats,
    data_sources: [
      {
        name: 'National Laws and Regulations Database',
        url: 'https://flk.npc.gov.cn',
        authority: 'National People's Congress',
      },
    ],
    freshness: {
      database_built: context.dbBuilt,
    },
    disclaimer:
      'This is a research tool, not legal advice. Verify critical citations against official sources.',
    network: {
      name: 'Ansvar MCP Network',
      open_law: 'https://ansvar.eu/open-law',
      directory: 'https://ansvar.ai/mcp',
    },
  };
}
