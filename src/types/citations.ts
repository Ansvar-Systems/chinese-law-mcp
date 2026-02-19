export type CitationFormat = 'full' | 'short' | 'pinpoint' | 'chinese' | 'english';

export interface ParsedCitation {
  valid: boolean;
  type: 'statute' | 'administrative_regulation' | 'unknown';
  title?: string;
  title_en?: string;
  article?: string;
  paragraph?: string;
  error?: string;
}

export interface ValidationResult {
  citation: ParsedCitation;
  document_exists: boolean;
  provision_exists: boolean;
  document_title?: string;
  status?: string;
  warnings: string[];
}
