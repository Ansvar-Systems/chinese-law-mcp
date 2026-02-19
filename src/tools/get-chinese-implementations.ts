/**
 * get_chinese_implementations — Find Chinese laws that implement/relate to an EU directive/regulation.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetChineseImplementationsInput {
  eu_document_id: string;
  primary_only?: boolean;
  in_force_only?: boolean;
}

export interface GetChineseImplementationsResult {
  eu_document_id: string;
  eu_title?: string;
  implementations: Array<{
    document_id: string;
    title: string;
    title_en: string | null;
    status: string;
    reference_type: string;
    is_primary: boolean;
  }>;
  total: number;
}

export async function getChineseImplementations(
  db: Database,
  input: GetChineseImplementationsInput
): Promise<ToolResponse<GetChineseImplementationsResult>> {
  if (!input.eu_document_id) {
    throw new Error('eu_document_id is required');
  }

  const euDoc = db.prepare(
    'SELECT id, title FROM eu_documents WHERE id = ?'
  ).get(input.eu_document_id) as { id: string; title: string } | undefined;

  let sql = `
    SELECT
      er.document_id,
      ld.title,
      ld.title_en,
      ld.status,
      er.reference_type,
      er.is_primary_implementation
    FROM eu_references er
    JOIN legal_documents ld ON ld.id = er.document_id
    WHERE er.eu_document_id = ?
  `;
  const params: (string | number)[] = [input.eu_document_id];

  if (input.primary_only) {
    sql += ` AND er.is_primary_implementation = 1`;
  }
  if (input.in_force_only) {
    sql += ` AND ld.status = 'in_force'`;
  }

  sql += ` ORDER BY er.is_primary_implementation DESC, ld.title`;

  interface Row {
    document_id: string; title: string; title_en: string | null; status: string;
    reference_type: string; is_primary_implementation: number;
  }

  const rows = db.prepare(sql).all(...params) as Row[];

  return {
    results: {
      eu_document_id: input.eu_document_id,
      eu_title: euDoc?.title,
      implementations: rows.map(r => ({
        document_id: r.document_id,
        title: r.title,
        title_en: r.title_en,
        status: r.status,
        reference_type: r.reference_type,
        is_primary: r.is_primary_implementation === 1,
      })),
      total: rows.length,
    },
    _metadata: generateResponseMetadata(db),
  };
}
