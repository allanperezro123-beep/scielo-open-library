import type { DocumentType, LanguageCode, OecdAreaId, Publication } from '../src/types/publication';

export interface Env {
  DB?: D1Database;
  ASSETS?: Fetcher;
}

export interface PublicationRow {
  id: string;
  oai_identifier: string | null;
  title: string;
  subtitle: string | null;
  authors_json: string;
  publisher: string;
  collection: string;
  collection_code: string;
  publication_year: number | null;
  publication_date: string | null;
  language: string;
  doc_type: string;
  oecd_area: string;
  oecd_area_label: string;
  oecd_subarea: string | null;
  abstract: string | null;
  keywords_json: string;
  doi: string | null;
  isbn: string | null;
  scielo_url: string;
  pdf_url: string | null;
  epub_url: string | null;
  cover_url: string | null;
  page_count: number | null;
  cited_by_count: number;
  source_origin: string;
  raw_set_spec: string | null;
}

export function rowToPublication(row: PublicationRow): Publication {
  let authors: string[] = [];
  let keywords: string[] = [];
  try {
    authors = JSON.parse(row.authors_json || '[]');
  } catch {
    authors = [];
  }
  try {
    keywords = JSON.parse(row.keywords_json || '[]');
  } catch {
    keywords = [];
  }

  return {
    id: row.id,
    oaiIdentifier: row.oai_identifier ?? undefined,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    authors,
    publisher: row.publisher,
    collection: row.collection,
    collectionCode: row.collection_code,
    year: row.publication_year,
    publicationDate: row.publication_date ?? undefined,
    language: (row.language as LanguageCode) || 'es',
    docType: (row.doc_type as DocumentType) || 'book',
    oecdArea: (row.oecd_area as OecdAreaId) || 'social-sciences',
    oecdAreaLabel: row.oecd_area_label,
    oecdSubarea: row.oecd_subarea ?? undefined,
    abstract: row.abstract || '',
    keywords,
    doi: row.doi ?? undefined,
    isbn: row.isbn ?? undefined,
    scieloUrl: row.scielo_url,
    pdfUrl: row.pdf_url ?? undefined,
    epubUrl: row.epub_url ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    pageCount: row.page_count ?? undefined,
    citedByCount: row.cited_by_count ?? 0,
    sourceOrigin: (row.source_origin as Publication['sourceOrigin']) || 'oai-pmh',
    rawSetSpec: row.raw_set_spec ?? undefined
  };
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, If-Modified-Since',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, X-Edge-Cache'
};

export function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}
