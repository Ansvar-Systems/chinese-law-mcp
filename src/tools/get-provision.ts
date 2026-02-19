/**
 * get_provision — Retrieve a specific provision from a Chinese law.
 * Supports article references in both Chinese (第三条) and Arabic (3) format.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { resolveExistingStatuteId } from '../utils/statute-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetProvisionInput {
  document_id: string;
  article?: string;
  section?: string;
  provision_ref?: string;
  language?: string;
}

export interface ProvisionResult {
  document_id: string;
  document_title: string;
  document_title_en: string | null;
  document_status: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
  language: string | null;
}

interface ProvisionRow {
  document_id: string;
  document_title: string;
  document_title_en: string | null;
  document_status: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
  language: string | null;
}

const MAX_ALL_PROVISIONS = 200;

export async function getProvision(
  db: Database,
  input: GetProvisionInput
): Promise<ToolResponse<ProvisionResult | ProvisionResult[] | { provisions: ProvisionResult[]; truncated: boolean; total: number } | null>> {
  if (!input.document_id) {
    throw new Error('document_id is required (e.g., "csl-2016", "网络安全法", or "Cybersecurity Law")');
  }

  const resolvedDocumentId = resolveExistingStatuteId(db, input.document_id) ?? input.document_id;

  const provisionRef = input.provision_ref ?? input.article ?? input.section;

  // If no specific provision, return all provisions for the document (with safety cap)
  if (!provisionRef) {
    const countRow = db.prepare(
      'SELECT COUNT(*) as count FROM legal_provisions WHERE document_id = ?'
    ).get(resolvedDocumentId) as { count: number } | undefined;
    const total = countRow?.count ?? 0;

    let sql = `
      SELECT
        lp.document_id,
        ld.title as document_title,
        ld.title_en as document_title_en,
        ld.status as document_status,
        lp.provision_ref,
        lp.chapter,
        lp.section,
        lp.title,
        lp.content,
        lp.language
      FROM legal_provisions lp
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE lp.document_id = ?
    `;
    const params: (string | number)[] = [resolvedDocumentId];

    if (input.language) {
      sql += ` AND lp.language = ?`;
      params.push(input.language);
    }

    sql += ` ORDER BY lp.id LIMIT ?`;
    params.push(MAX_ALL_PROVISIONS);

    const rows = db.prepare(sql).all(...params) as ProvisionRow[];

    if (total > MAX_ALL_PROVISIONS) {
      return {
        results: {
          provisions: rows,
          truncated: true,
          total,
        },
        _metadata: generateResponseMetadata(db),
      };
    }

    return {
      results: rows,
      _metadata: generateResponseMetadata(db)
    };
  }

  let sql = `
    SELECT
      lp.document_id,
      ld.title as document_title,
      ld.title_en as document_title_en,
      ld.status as document_status,
      lp.provision_ref,
      lp.chapter,
      lp.section,
      lp.title,
      lp.content,
      lp.language
    FROM legal_provisions lp
    JOIN legal_documents ld ON ld.id = lp.document_id
    WHERE lp.document_id = ? AND (lp.provision_ref = ? OR lp.section = ?)
  `;
  const params: (string | number)[] = [resolvedDocumentId, provisionRef, provisionRef];

  if (input.language) {
    sql += ` AND lp.language = ?`;
    params.push(input.language);
  }

  const row = db.prepare(sql).get(...params) as ProvisionRow | undefined;

  if (!row) {
    return {
      results: null,
      _metadata: generateResponseMetadata(db)
    };
  }

  return {
    results: row,
    _metadata: generateResponseMetadata(db)
  };
}
