/**
 * build_legal_stance — Aggregate citations for a legal question.
 * Uses FTS5 trigram for CJK substring matching with LIKE fallback.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariantsLegacy as buildFtsQueryVariants } from '../utils/fts-query.js';
import { resolveDocumentId } from '../utils/statute-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface BuildLegalStanceInput {
  query: string;
  document_id?: string;
  as_of_date?: string;
  limit?: number;
}

interface ProvisionHit {
  document_id: string;
  document_title: string;
  provision_ref: string;
  title: string | null;
  snippet: string;
  relevance: number;
}

export interface LegalStanceResult {
  query: string;
  provisions: ProvisionHit[];
  total_citations: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export async function buildLegalStance(
  db: Database,
  input: BuildLegalStanceInput
): Promise<ToolResponse<LegalStanceResult>> {
  if (!input.query || input.query.trim().length === 0) {
    return {
      results: { query: '', provisions: [], total_citations: 0 },
      _metadata: generateResponseMetadata(db)
    };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  // Fetch extra rows to account for deduplication
  const fetchLimit = limit * 2;
  const queryVariants = buildFtsQueryVariants(input.query);

  // Resolve document_id from title if provided
  let resolvedDocId: string | undefined;
  if (input.document_id) {
    const resolved = resolveDocumentId(db as any, input.document_id);
    resolvedDocId = resolved ?? undefined;
    if (!resolved) {
      return {
        results: { query: input.query, provisions: [], total_citations: 0 },
        _metadata: {
          ...generateResponseMetadata(db),
          note: `No document found matching "${input.document_id}"`,
        },
      };
    }
  }

  // For short queries, use LIKE-based search
  if (queryVariants.use_like) {
    return buildStanceWithLike(db, input, fetchLimit, limit, resolvedDocId);
  }

  let provSql = `
    SELECT
      lp.document_id,
      ld.title as document_title,
      lp.provision_ref,
      lp.title,
      snippet(provisions_fts, 0, '>>>', '<<<', '...', 32) as snippet,
      bm25(provisions_fts) as relevance
    FROM provisions_fts
    JOIN legal_provisions lp ON lp.id = provisions_fts.rowid
    JOIN legal_documents ld ON ld.id = lp.document_id
    WHERE provisions_fts MATCH ?
  `;

  const provParams: (string | number)[] = [];

  if (resolvedDocId) {
    provSql += ` AND lp.document_id = ?`;
    provParams.push(resolvedDocId);
  }

  provSql += ` ORDER BY relevance LIMIT ?`;
  provParams.push(fetchLimit);

  const runProvisionQuery = (ftsQuery: string): ProvisionHit[] => {
    const bound = [ftsQuery, ...provParams];
    return db.prepare(provSql).all(...bound) as ProvisionHit[];
  };

  const primaryResults = runProvisionQuery(queryVariants.primary);
  const usedFallback = primaryResults.length === 0 && !!queryVariants.fallback;
  const rawProvisions = usedFallback
    ? runProvisionQuery(queryVariants.fallback!)
    : primaryResults;

  const provisions = deduplicateResults(rawProvisions, limit);

  return {
    results: {
      query: input.query,
      provisions,
      total_citations: provisions.length,
    },
    _metadata: {
      ...generateResponseMetadata(db),
      ...(usedFallback ? { query_strategy: 'broadened' } : {}),
    },
  };
}

/** LIKE-based fallback for queries too short for trigram FTS5 */
function buildStanceWithLike(
  db: Database,
  input: BuildLegalStanceInput,
  fetchLimit: number,
  limit: number,
  resolvedDocId?: string,
): ToolResponse<LegalStanceResult> {
  let sql = `
    SELECT
      lp.document_id,
      ld.title as document_title,
      lp.provision_ref,
      lp.title,
      substr(lp.content, 1, 200) as snippet,
      0 as relevance
    FROM legal_provisions lp
    JOIN legal_documents ld ON ld.id = lp.document_id
    WHERE lp.content LIKE ?
  `;

  const params: (string | number)[] = [`%${input.query.trim()}%`];

  if (resolvedDocId) {
    sql += ` AND lp.document_id = ?`;
    params.push(resolvedDocId);
  }

  sql += ` LIMIT ?`;
  params.push(fetchLimit);

  const rows = db.prepare(sql).all(...params) as ProvisionHit[];
  const provisions = deduplicateResults(rows, limit);

  return {
    results: {
      query: input.query,
      provisions,
      total_citations: provisions.length,
    },
    _metadata: {
      ...generateResponseMetadata(db),
      query_strategy: 'like_fallback',
    },
  };
}

/**
 * Deduplicate results by document_title + provision_ref.
 * Duplicate document IDs (numeric vs slug) cause the same provision to appear twice.
 * Keeps the first (highest-ranked) occurrence.
 */
function deduplicateResults(
  rows: ProvisionHit[],
  limit: number,
): ProvisionHit[] {
  const seen = new Set<string>();
  const deduped: ProvisionHit[] = [];
  for (const row of rows) {
    const key = `${row.document_title}::${row.provision_ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
