export type EUDocumentType = 'directive' | 'regulation';
export type EUCommunity = 'EU' | 'EC' | 'EEC' | 'Euratom';
export type ReferenceType = 'implements' | 'supplements' | 'applies' | 'cites' | 'cites_article' | 'references' | 'complies_with' | 'derogates_from' | 'amended_by' | 'repealed_by';
export type ImplementationStatus = 'full' | 'partial' | 'pending' | 'unknown';

export interface EUDocument {
  id: string;
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;
  title?: string;
  short_name?: string;
  url_eur_lex?: string;
}

export interface EUReference {
  id: number;
  document_id: string;
  eu_document_id: string;
  reference_type: ReferenceType;
  eu_article?: string;
  is_primary_implementation: boolean;
}

export interface EUBasisDocument {
  id: string;
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  celex_number?: string;
  title?: string;
  short_name?: string;
  url_eur_lex?: string;
  articles?: string[];
}

export interface ChineseImplementation {
  document_id: string;
  title: string;
  reference_type: ReferenceType;
  is_primary: boolean;
}

export interface ProvisionEUReference {
  id: string;
  type: EUDocumentType;
  reference_type: ReferenceType;
  full_citation: string;
  title?: string;
  short_name?: string;
  article?: string;
  context?: string;
}
