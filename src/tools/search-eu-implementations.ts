/**
 * search_eu_implementations — Search EU directives/regulations with Chinese law implementation info.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface SearchEUImplementationsInput {
  query?: string;
  type?: 'directive' | 'regulation';
  year_from?: number;
  year_to?: number;
  community?: string;
  has_chinese_implementation?: boolean;
  limit?: number;
}

export interface SearchEUImplementationsResult {
  results: Array<{
    eu_document: {
      id: string; type: string; year: number; number: number;
      title?: string; short_name?: string; community: string;
    };
    chinese_statute_count: number;
    primary_implementations: string[];
  }>;
  total_results: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function searchEUImplementations(
  db: Database,
  input: SearchEUImplementationsInput
): Promise<ToolResponse<SearchEUImplementationsResult>> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let sql = `
    SELECT
      ed.id, ed.type, ed.year, ed.number, ed.title, ed.short_name, ed.community,
      COUNT(DISTINCT er.document_id) AS chinese_statute_count,
      GROUP_CONCAT(DISTINCT CASE WHEN er.is_primary_implementation = 1 THEN er.document_id END) AS primary_implementations
    FROM eu_documents ed
    LEFT JOIN eu_references er ON ed.id = er.eu_document_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (input.query?.trim()) {
    sql += ` AND (ed.title LIKE ? OR ed.short_name LIKE ? OR ed.celex_number LIKE ?)`;
    const term = `%${input.query.trim()}%`;
    params.push(term, term, term);
  }
  if (input.type) { sql += ` AND ed.type = ?`; params.push(input.type); }
  if (input.year_from) { sql += ` AND ed.year >= ?`; params.push(input.year_from); }
  if (input.year_to) { sql += ` AND ed.year <= ?`; params.push(input.year_to); }
  if (input.community) { sql += ` AND ed.community = ?`; params.push(input.community); }

  sql += ` GROUP BY ed.id`;

  if (input.has_chinese_implementation !== undefined) {
    sql += input.has_chinese_implementation ? ` HAVING chinese_statute_count > 0` : ` HAVING chinese_statute_count = 0`;
  }

  sql += ` ORDER BY ed.year DESC, ed.number DESC LIMIT ?`;
  params.push(limit);

  interface Row {
    id: string; type: string; year: number; number: number;
    title: string | null; short_name: string | null; community: string;
    chinese_statute_count: number; primary_implementations: string | null;
  }

  const rows = db.prepare(sql).all(...params) as Row[];

  return {
    results: {
      results: rows.map(r => ({
        eu_document: {
          id: r.id, type: r.type, year: r.year, number: r.number,
          title: r.title || undefined, short_name: r.short_name || undefined,
          community: r.community,
        },
        chinese_statute_count: r.chinese_statute_count,
        primary_implementations: r.primary_implementations?.split(',').filter(Boolean) ?? [],
      })),
      total_results: rows.length,
    },
    _metadata: generateResponseMetadata(db),
  };
}
