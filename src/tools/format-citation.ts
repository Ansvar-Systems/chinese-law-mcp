/**
 * format_citation — Format a Chinese legal citation per standard conventions.
 */

import { parseCitation } from '../citation/parser.js';
import { formatCitation } from '../citation/formatter.js';
import type { CitationFormat } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface FormatCitationInput {
  citation: string;
  format?: CitationFormat;
}

export interface FormatCitationResult {
  input: string;
  formatted: string;
  formatted_chinese: string;
  formatted_english: string;
  type: string;
  valid: boolean;
  error?: string;
}

export async function formatCitationTool(
  input: FormatCitationInput
): Promise<ToolResponse<FormatCitationResult>> {
  if (!input.citation || input.citation.trim().length === 0) {
    return {
      results: {
        input: '', formatted: '', formatted_chinese: '', formatted_english: '',
        type: 'unknown', valid: false, error: 'Empty citation',
      },
      _metadata: generateResponseMetadata()
    };
  }

  const parsed = parseCitation(input.citation);

  if (!parsed.valid) {
    return {
      results: {
        input: input.citation,
        formatted: input.citation,
        formatted_chinese: '',
        formatted_english: '',
        type: 'unknown',
        valid: false,
        error: parsed.error,
      },
      _metadata: generateResponseMetadata()
    };
  }

  const formatted = formatCitation(parsed, input.format ?? 'full');
  const formattedChinese = formatCitation(parsed, 'chinese');
  const formattedEnglish = formatCitation(parsed, 'english');

  return {
    results: {
      input: input.citation,
      formatted,
      formatted_chinese: formattedChinese,
      formatted_english: formattedEnglish,
      type: parsed.type,
      valid: true,
    },
    _metadata: generateResponseMetadata()
  };
}
