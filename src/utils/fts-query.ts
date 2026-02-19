/**
 * FTS5 query builder for Chinese Law MCP.
 *
 * Sanitises user input to prevent FTS5 syntax errors from unescaped
 * special characters while supporting both Chinese and English queries.
 * Chinese text uses unicode61 tokenizer which handles CJK characters.
 */

const EXPLICIT_FTS_SYNTAX = /["""]|(\bAND\b)|(\bOR\b)|(\bNOT\b)|\*$/;

/** Maximum query length to prevent abuse */
const MAX_QUERY_LENGTH = 1000;

export interface FtsQueryVariants {
  primary: string;
  fallback?: string;
}

/**
 * Sanitise a single token for safe inclusion in an FTS5 query.
 * Preserves CJK characters, alphanumeric, hyphens, underscores, and Unicode letters.
 */
function sanitiseToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}_-]/gu, '');
}

export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);

  if (trimmed.length === 0) {
    return { primary: '""' };
  }

  // If user is using explicit FTS5 syntax, sanitise dangerous chars
  // but preserve the intent of AND/OR/NOT and quotes
  if (EXPLICIT_FTS_SYNTAX.test(trimmed)) {
    let normalised = trimmed
      .replace(/[\u201C\u201D]/g, '"')  // smart quotes -> standard
      .replace(/;/g, '')                 // strip semicolons
      .replace(/--/g, '')                // strip comment sequences
      .slice(0, MAX_QUERY_LENGTH);

    // Balance unmatched double quotes
    const quoteCount = (normalised.match(/"/g) ?? []).length;
    if (quoteCount % 2 !== 0) {
      normalised += '"';
    }

    return { primary: normalised };
  }

  const tokens = trimmed
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(sanitiseToken)
    .filter(t => t.length > 0);

  if (tokens.length === 0) {
    return { primary: '""' };
  }

  // For Chinese text, wrap each token in quotes for exact matching
  const primary = tokens.map(t => `"${t}"*`).join(' ');
  const fallback = tokens.map(t => `${t}*`).join(' OR ');

  return { primary, fallback };
}
