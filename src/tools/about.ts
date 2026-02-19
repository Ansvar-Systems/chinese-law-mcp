import type Database from '@ansvar/mcp-sqlite';

export interface AboutContext {
  version: string;
  fingerprint: string;
  dbBuilt: string;
}

export interface AboutResult {
  server: {
    name: string;
    package: string;
    version: string;
    suite: string;
    repository: string;
  };
  dataset: {
    fingerprint: string;
    built: string;
    jurisdiction: string;
    content_basis: string;
    counts: Record<string, number>;
  };
  provenance: {
    sources: string[];
    license: string;
    authenticity_note: string;
  };
  security: {
    access_model: string;
    network_access: boolean;
    filesystem_access: boolean;
    arbitrary_code: boolean;
  };
}

function safeCount(db: InstanceType<typeof Database>, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

export function getAbout(
  db: InstanceType<typeof Database>,
  context: AboutContext
): AboutResult {
  return {
    server: {
      name: 'Chinese Law MCP',
      package: '@ansvar/chinese-law-mcp',
      version: context.version,
      suite: 'Ansvar Compliance Suite',
      repository: 'https://github.com/Ansvar-Systems/chinese-law-mcp',
    },
    dataset: {
      fingerprint: context.fingerprint,
      built: context.dbBuilt,
      jurisdiction: 'People\'s Republic of China (CN)',
      content_basis:
        'Chinese law text from npc.gov.cn and gov.cn official sources. ' +
        'Covers cybersecurity, data protection, commercial, and competition law. ' +
        'English translations from NPC English portal (reference only, not legally binding).',
      counts: {
        legal_documents: safeCount(db, 'SELECT COUNT(*) as count FROM legal_documents'),
        legal_provisions: safeCount(db, 'SELECT COUNT(*) as count FROM legal_provisions'),
        eu_documents: safeCount(db, 'SELECT COUNT(*) as count FROM eu_documents'),
        eu_references: safeCount(db, 'SELECT COUNT(*) as count FROM eu_references'),
      },
    },
    provenance: {
      sources: [
        'npc.gov.cn (National People\'s Congress — national laws)',
        'gov.cn (State Council — administrative regulations)',
        'en.npc.gov.cn (NPC English translations — reference only)',
      ],
      license:
        'Apache-2.0 (server code). Law text is public domain under Chinese law.',
      authenticity_note:
        'Law text is derived from official NPC and State Council publications. ' +
        'The Chinese text is the sole legally binding version. English translations are marked ' +
        '"Translation for Reference Only" by the NPC. Content may lag behind PRC Official Gazette. ' +
        'Verify against official publications when legal certainty is required.',
    },
    security: {
      access_model: 'read-only',
      network_access: false,
      filesystem_access: false,
      arbitrary_code: false,
    },
  };
}
