/**
 * FTS5 query builder for Chinese Law MCP.
 *
 * Uses trigram tokenizer for CJK substring matching.
 * Trigram requires minimum 3-character queries. For shorter queries,
 * callers should fall back to LIKE-based search.
 *
 * Chinese text has no word boundaries (no spaces), so trigram is the
 * only reliable tokenizer for substring matching across compound terms
 * like 数据出境 (cross-border data transfer).
 */

/** Maximum query length to prevent abuse */
const MAX_QUERY_LENGTH = 1000;

/** Minimum characters for trigram FTS5 to work */
export const MIN_FTS_LENGTH = 3;

/** Chunk size for splitting long CJK queries */
const CJK_CHUNK_SIZE = 4;

export interface FtsQueryVariants {
  primary: string;
  fallback?: string;
  /** True if query is too short for FTS5 trigram — caller should use LIKE */
  use_like: boolean;
}

/**
 * Sanitise a single token for safe inclusion in an FTS5 query.
 * Strips all FTS5 operators and special characters — keeps only
 * CJK characters, alphanumeric, underscores, and Unicode letters.
 *
 * Hyphens are intentionally stripped because FTS5 treats `-` as NOT.
 */
function sanitiseToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}_]/gu, '');
}

/** Wrap a token in double quotes for FTS5 literal matching */
function quoteFts(token: string): string {
  // Double any internal quotes to escape them
  return `"${token.replace(/"/g, '""')}"`;
}

/** Check if a string contains CJK characters */
function hasCJK(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

/**
 * Split a CJK string into chunks for broader FTS5 matching.
 *
 * Long CJK queries (> CJK_CHUNK_SIZE chars) are split into non-overlapping
 * chunks of CJK_CHUNK_SIZE and joined with OR. This dramatically improves
 * recall: 个人信息跨境提供 → "个人信息" OR "跨境提供" catches both
 * phrasings instead of requiring an exact 7-char substring.
 */
function splitCjkChunks(text: string): string[] {
  if (text.length <= CJK_CHUNK_SIZE) {
    return [text];
  }

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CJK_CHUNK_SIZE) {
    const chunk = text.slice(i, i + CJK_CHUNK_SIZE);
    if (chunk.length >= MIN_FTS_LENGTH) {
      chunks.push(chunk);
    }
  }
  return chunks.length > 0 ? chunks : [text];
}

export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);

  if (trimmed.length === 0) {
    return { primary: '""', use_like: false };
  }

  // For trigram tokenizer, queries shorter than 3 chars won't match
  if (trimmed.length < MIN_FTS_LENGTH) {
    return { primary: trimmed, use_like: true };
  }

  // For CJK text: split into chunks for broader matching
  if (hasCJK(trimmed)) {
    const sanitised = sanitiseToken(trimmed);
    if (sanitised.length < MIN_FTS_LENGTH) {
      return { primary: sanitised, use_like: true };
    }

    const chunks = splitCjkChunks(sanitised);

    if (chunks.length === 1) {
      // Short enough to match as-is — quote for safety
      return { primary: quoteFts(chunks[0]), use_like: false };
    }

    // Multiple chunks: OR for recall, exact string as fallback for precision
    const primary = chunks.map(quoteFts).join(' OR ');
    const fallback = quoteFts(sanitised);
    return { primary, fallback, use_like: false };
  }

  // For non-CJK text: tokenize, sanitise, and quote each token
  const tokens = trimmed
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(sanitiseToken)
    .filter(t => t.length >= MIN_FTS_LENGTH);

  if (tokens.length === 0) {
    // All tokens too short for trigram
    return { primary: trimmed, use_like: true };
  }

  // Quote each token to prevent FTS5 operator interpretation
  const primary = tokens.map(quoteFts).join(' OR ');
  return { primary, use_like: false };
}
