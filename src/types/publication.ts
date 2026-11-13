export type DocumentType = 'book' | 'chapter' | 'article';

export type LanguageCode = 'es' | 'pt' | 'en' | 'other';

export type OecdAreaId =
  | 'natural-sciences'
  | 'engineering-tech'
  | 'medical-health'
  | 'agricultural-sciences'
  | 'social-sciences'
  | 'humanities';

export interface OecdAreaDefinition {
  id: OecdAreaId;
  code: string;
  label: string;
  unescoLabel: string;
  accent: string;
  description: string;
}

export interface Publication {
  id: string;
  oaiIdentifier?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher: string;
  collection: string;
  collectionCode: string;
  year: number | null;
  publicationDate?: string;
  language: LanguageCode;
  docType: DocumentType;
  oecdArea: OecdAreaId;
  oecdAreaLabel: string;
  oecdSubarea?: string;
  abstract: string;
  keywords: string[];
  doi?: string;
  isbn?: string;
  scieloUrl: string;
  pdfUrl?: string;
  epubUrl?: string;
  coverUrl?: string;
  pageCount?: number;
  citedByCount?: number;
  sourceOrigin: 'oai-pmh' | 'opds' | 'openalex' | 'hybrid';
  rawSetSpec?: string;
}

export interface CatalogFilters {
  query: string;
  oecdAreas: OecdAreaId[];
  languages: LanguageCode[];
  docTypes: DocumentType[];
  collections: string[];
  yearFrom: number | null;
  yearTo: number | null;
  onlyWithPdf: boolean;
  sortBy: 'relevance' | 'year-desc' | 'year-asc' | 'citations' | 'title';
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface CatalogStats {
  total: number;
  withPdf: number;
  oecdAreas: FacetBucket[];
  languages: FacetBucket[];
  docTypes: FacetBucket[];
  collections: FacetBucket[];
  yearMin: number;
  yearMax: number;
}

export interface Shelf {
  id: string;
  name: string;
  description?: string;
  accent: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShelfItem {
  id: string;
  shelfId: string;
  publicationId: string;
  publication: Publication;
  note: string;
  readingPage: number;
  addedAt: string;
  updatedAt: string;
}

export type CitationFormat = 'apa7' | 'ieee' | 'bibtex';
