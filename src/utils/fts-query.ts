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

export interface FtsQueryVariants {
  primary: string;
  fallback?: string;
  /** True if query is too short for FTS5 trigram — caller should use LIKE */
  use_like: boolean;
}

/**
 * Sanitise a single token for safe inclusion in an FTS5 query.
 * Preserves CJK characters, alphanumeric, hyphens, underscores, and Unicode letters.
 */
function sanitiseToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}_-]/gu, '');
}

/** Check if a string contains CJK characters */
function hasCJK(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
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

  // For CJK text: use direct substring matching (trigram handles this natively)
  if (hasCJK(trimmed)) {
    // Sanitise but preserve CJK characters
    const sanitised = sanitiseToken(trimmed);
    if (sanitised.length < MIN_FTS_LENGTH) {
      return { primary: sanitised, use_like: true };
    }
    // With trigram, just pass the string directly — it matches substrings
    return { primary: sanitised, use_like: false };
  }

  // For non-CJK (English) text: tokenize and build OR query
  const tokens = trimmed
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(sanitiseToken)
    .filter(t => t.length >= MIN_FTS_LENGTH);

  if (tokens.length === 0) {
    // All tokens too short for trigram
    return { primary: trimmed, use_like: true };
  }

  // Join with OR for broader matching
  const primary = tokens.join(' OR ');
  return { primary, use_like: false };
}
