/**
 * list_sources — Returns metadata about data sources, coverage, and freshness.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ListSourcesResult {
  jurisdiction: string;
  sources: Array<{
    name: string;
    authority: string;
    url: string;
    license: string;
    coverage: string;
    languages: string[];
  }>;
  database: {
    tier: string;
    schema_version: string;
    built_at: string;
    document_count: number;
    provision_count: number;
    eu_document_count: number;
  };
  limitations: string[];
}

function safeCount(db: Database, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

function safeMetaValue(db: Database, key: string): string {
  try {
    const row = db.prepare('SELECT value FROM db_metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function listSources(db: Database): Promise<ToolResponse<ListSourcesResult>> {
  const documentCount = safeCount(db, 'SELECT COUNT(*) as count FROM legal_documents');
  const provisionCount = safeCount(db, 'SELECT COUNT(*) as count FROM legal_provisions');
  const euDocumentCount = safeCount(db, 'SELECT COUNT(*) as count FROM eu_documents');

  return {
    results: {
      jurisdiction: 'People\'s Republic of China (CN)',
      sources: [
        {
          name: 'NPC Law Database',
          authority: 'National People\'s Congress of the PRC',
          url: 'https://www.npc.gov.cn',
          license: 'Government Public Data',
          coverage: 'All national laws adopted by the NPC and its Standing Committee, including Constitution, cybersecurity, data protection, company law, civil code, anti-monopoly, and e-commerce legislation.',
          languages: ['zh'],
        },
        {
          name: 'NPC English Translations',
          authority: 'National People\'s Congress of the PRC',
          url: 'http://en.npc.gov.cn.cdurl.cn/laws.html',
          license: 'Government Public Data (Reference Only)',
          coverage: 'Selected major national laws translated into English. Translations are for reference only and are not legally binding.',
          languages: ['en'],
        },
        {
          name: 'State Council / gov.cn',
          authority: 'State Council of the PRC',
          url: 'https://www.gov.cn',
          license: 'Government Public Data',
          coverage: 'Administrative regulations including CII protection, network data security management, and implementing regulations for major laws.',
          languages: ['zh'],
        },
      ],
      database: {
        tier: safeMetaValue(db, 'tier'),
        schema_version: safeMetaValue(db, 'schema_version'),
        built_at: safeMetaValue(db, 'built_at'),
        document_count: documentCount,
        provision_count: provisionCount,
        eu_document_count: euDocumentCount,
      },
      limitations: [
        `Covers ${documentCount.toLocaleString()} Chinese laws and regulations.`,
        'The Chinese text is the sole legally binding version. English translations are for reference only.',
        'Judicial interpretations by the Supreme People\'s Court require professional tier.',
        'Departmental rules from specific ministries require professional tier.',
        'Content may lag behind the PRC Official Gazette.',
        'EU/international cross-references are maintained for key regulatory equivalences (PIPL-GDPR, CSL-NIS2, etc.).',
        'Always verify against official NPC or State Council publications when legal certainty is required.',
      ],
    },
    _metadata: generateResponseMetadata(db),
  };
}
