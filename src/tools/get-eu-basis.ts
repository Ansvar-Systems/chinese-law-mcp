/**
 * get_eu_basis — Retrieve EU/international legal basis for a Chinese law.
 * Shows relationships like PIPL -> GDPR, CSL -> NIS2.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { EUBasisDocument } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { resolveExistingStatuteId } from '../utils/statute-id.js';

export interface GetEUBasisInput {
  document_id: string;
  include_articles?: boolean;
  reference_types?: string[];
}

export interface GetEUBasisResult {
  document_id: string;
  document_title: string;
  eu_documents: EUBasisDocument[];
  statistics: {
    total_eu_references: number;
    directive_count: number;
    regulation_count: number;
  };
}

export async function getEUBasis(
  db: Database,
  input: GetEUBasisInput
): Promise<ToolResponse<GetEUBasisResult>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const resolvedId = resolveExistingStatuteId(db, input.document_id);
  if (!resolvedId) {
    throw new Error(`Document "${input.document_id}" not found in database`);
  }

  const doc = db.prepare(
    'SELECT id, title FROM legal_documents WHERE id = ?'
  ).get(resolvedId) as { id: string; title: string };

  let sql = `
    SELECT
      ed.id, ed.type, ed.year, ed.number, ed.community,
      ed.celex_number, ed.title, ed.short_name, ed.url_eur_lex,
      er.reference_type, er.is_primary_implementation,
      GROUP_CONCAT(DISTINCT er.eu_article) AS articles
    FROM eu_documents ed
    JOIN eu_references er ON ed.id = er.eu_document_id
    WHERE er.document_id = ?
  `;
  const params: (string | number)[] = [resolvedId];

  if (input.reference_types && input.reference_types.length > 0) {
    const placeholders = input.reference_types.map(() => '?').join(', ');
    sql += ` AND er.reference_type IN (${placeholders})`;
    params.push(...input.reference_types);
  }

  sql += ` GROUP BY ed.id ORDER BY er.is_primary_implementation DESC, ed.year DESC`;

  interface QueryRow {
    id: string; type: 'directive' | 'regulation'; year: number; number: number;
    community: string; celex_number: string | null; title: string | null;
    short_name: string | null; url_eur_lex: string | null;
    reference_type: string; is_primary_implementation: number; articles: string | null;
  }

  const rows = db.prepare(sql).all(...params) as QueryRow[];

  const euDocuments: EUBasisDocument[] = rows.map(row => {
    const result: EUBasisDocument = {
      id: row.id, type: row.type, year: row.year, number: row.number,
      community: row.community as any, reference_type: row.reference_type as any,
      is_primary_implementation: row.is_primary_implementation === 1,
    };
    if (row.celex_number) result.celex_number = row.celex_number;
    if (row.title) result.title = row.title;
    if (row.short_name) result.short_name = row.short_name;
    if (row.url_eur_lex) result.url_eur_lex = row.url_eur_lex;
    if (input.include_articles && row.articles) {
      result.articles = row.articles.split(',').filter(a => a?.trim());
    }
    return result;
  });

  return {
    results: {
      document_id: doc.id,
      document_title: doc.title,
      eu_documents: euDocuments,
      statistics: {
        total_eu_references: euDocuments.length,
        directive_count: euDocuments.filter(d => d.type === 'directive').length,
        regulation_count: euDocuments.filter(d => d.type === 'regulation').length,
      },
    },
    _metadata: generateResponseMetadata(db),
  };
}
