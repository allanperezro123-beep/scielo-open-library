import { CORS_HEADERS, jsonResponse, rowToPublication, type Env, type PublicationRow } from '../types';
import { classifyOecdArea } from '../../src/lib/taxonomy';
import type { DocumentType, LanguageCode, Publication } from '../../src/types/publication';

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  language?: string | null;
  type?: string | null;
  cited_by_count?: number;
  primary_location?: {
    landing_page_url?: string | null;
    pdf_url?: string | null;
    source?: {
      display_name?: string | null;
      host_organization_name?: string | null;
      country_code?: string | null;
    } | null;
  } | null;
  best_oa_location?: {
    landing_page_url?: string | null;
    pdf_url?: string | null;
  } | null;
  open_access?: {
    oa_url?: string | null;
  } | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
  }>;
  primary_topic?: {
    display_name?: string | null;
    field?: { display_name?: string | null } | null;
    domain?: { id?: string | null } | null;
  } | null;
  keywords?: Array<{ display_name?: string | null }>;
  abstract_inverted_index?: Record<string, number[]> | null;
}

function reconstructAbstract(inverted?: Record<string, number[]> | null): string {
  if (!inverted) return '';
  const words: string[] = [];
  for (const [token, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      words[pos] = token;
    }
  }
  return words.filter(Boolean).join(' ').trim();
}

function normalizeLanguage(lang?: string | null): LanguageCode {
  if (!lang) return 'es';
  const code = lang.toLowerCase().slice(0, 2);
  if (code === 'es' || code === 'pt' || code === 'en') return code;
  return 'other';
}

function normalizeDocType(type?: string | null): DocumentType {
  if (type === 'book') return 'book';
  if (type === 'book-chapter' || type === 'chapter') return 'chapter';
  return 'article';
}

function upgradeHttps(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://books.scielo.org/') || url.startsWith('http://www.scielo.') || url.startsWith('http://scielo.')) {
    return url.replace(/^http:\/\//, 'https://');
  }
  return url;
}

function extractScieloBookId(url?: string | null): string | null {
  if (!url) return null;
  const match = /books\.scielo\.org\/id\/([a-z0-9]+)/i.exec(url);
  return match ? match[1] : null;
}

function inferCollection(pdfUrl?: string, landingUrl?: string, sourceName?: string | null): { collection: string; code: string } {
  const combined = `${pdfUrl || ''} ${landingUrl || ''}`.toLowerCase();
  if (combined.includes('books.scielo.org')) return { collection: 'SciELO Books', code: 'books' };
  if (combined.includes('scielo.br')) return { collection: 'SciELO Brasil', code: 'scielo-br' };
  if (combined.includes('scielo.org.co')) return { collection: 'SciELO Colombia', code: 'scielo-co' };
  if (combined.includes('scielo.org.mx')) return { collection: 'SciELO México', code: 'scielo-mx' };
  if (combined.includes('scielo.cl')) return { collection: 'SciELO Chile', code: 'scielo-cl' };
  if (combined.includes('scielo.org.ar')) return { collection: 'SciELO Argentina', code: 'scielo-ar' };
  if (combined.includes('scielo.org.pe')) return { collection: 'SciELO Perú', code: 'scielo-pe' };
  if (combined.includes('scielo.isciii.es')) return { collection: 'SciELO España', code: 'scielo-es' };
  if (sourceName && sourceName.toLowerCase().includes('scielo')) {
    return { collection: sourceName, code: 'scielo-regional' };
  }
  return { collection: 'Red SciELO', code: 'scielo-network' };
}

function mapOpenAlexWork(work: OpenAlexWork): Publication {
  const rawPdf =
    work.primary_location?.pdf_url ||
    work.best_oa_location?.pdf_url ||
    (work.open_access?.oa_url?.includes('.pdf') ? work.open_access.oa_url : undefined);
  const pdfUrl = upgradeHttps(rawPdf);
  const landing = upgradeHttps(
    work.primary_location?.landing_page_url || work.best_oa_location?.landing_page_url || work.doi || work.id
  )!;
  const bookId = extractScieloBookId(pdfUrl || landing);
  const coverUrl = bookId ? `https://books.scielo.org/id/${bookId}/cover/cover_thumbnail.jpeg` : undefined;
  const scieloUrl = bookId ? `https://books.scielo.org/id/${bookId}` : landing;

  const title = (work.title || work.display_name || 'Sin título').trim();
  const authors = (work.authorships || [])
    .map((a) => a.author?.display_name || a.raw_author_name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 10);

  const keywords = (work.keywords || [])
    .map((k) => k.display_name)
    .filter((k): k is string => Boolean(k))
    .slice(0, 8);

  const abstract = reconstructAbstract(work.abstract_inverted_index);
  const publisher =
    work.primary_location?.source?.display_name ||
    work.primary_location?.source?.host_organization_name ||
    'SciELO Network';

  const { area, label, subarea } = classifyOecdArea({
    title,
    abstract,
    keywords,
    publisher,
    openAlexDomainId: work.primary_topic?.domain?.id ?? undefined,
    openAlexFieldName: work.primary_topic?.field?.display_name ?? work.primary_topic?.display_name ?? undefined
  });

  const col = inferCollection(pdfUrl, scieloUrl, work.primary_location?.source?.display_name);

  return {
    id: bookId ? `scielo-book-${bookId}` : `oa-${work.id.split('/').pop()}`,
    oaiIdentifier: bookId ?? work.id,
    title,
    authors,
    publisher,
    collection: col.collection,
    collectionCode: col.code,
    year: work.publication_year ?? null,
    publicationDate: work.publication_date ?? undefined,
    language: normalizeLanguage(work.language),
    docType: normalizeDocType(work.type),
    oecdArea: area,
    oecdAreaLabel: label,
    oecdSubarea: subarea,
    abstract:
      abstract ||
      (work.primary_topic?.display_name
        ? `Publicación indexada en SciELO sobre ${work.primary_topic.display_name}.`
        : 'Publicación científica de Acceso Abierto indexada en la red SciELO.'),
    keywords: keywords.length > 0 ? keywords : work.primary_topic?.display_name ? [work.primary_topic.display_name] : [],
    doi: work.doi ? work.doi.replace(/^https?:\/\/doi\.org\//i, '') : undefined,
    scieloUrl,
    pdfUrl,
    coverUrl,
    citedByCount: work.cited_by_count ?? 0,
    sourceOrigin: 'openalex'
  };
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const type = url.searchParams.get('type') || 'all';
  const lang = url.searchParams.get('lang') || '';
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(25, Math.max(5, Number.parseInt(url.searchParams.get('perPage') || '12', 10)));

  const results: Publication[] = [];
  const seenKeys = new Set<string>();

  // 1. Query D1 first if available
  if (env.DB && q) {
    try {
      const like = `%${q}%`;
      const d1Rows = await env.DB.prepare(
        `SELECT * FROM publications
         WHERE (title LIKE ? OR authors_json LIKE ? OR abstract LIKE ? OR doi LIKE ? OR keywords_json LIKE ?)
         ORDER BY cited_by_count DESC, publication_year DESC LIMIT 20`
      )
        .bind(like, like, like, like, like)
        .all<PublicationRow>();

      for (const row of d1Rows.results || []) {
        const pub = rowToPublication(row);
        const key = (pub.doi || pub.title).toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          results.push(pub);
        }
      }
    } catch {
      // Non-fatal: continue with OpenAlex live search
    }
  }

  // 2. Real-time federated OpenAlex query filtered strictly to SciELO Books (10.7476) & SciELO Journals
  const oaHeaders = {
    'User-Agent': 'SciELO-Open-Library/1.0 (mailto:research@scielo-open-library.pages.dev)'
  };

  const langFilter = lang && ['es', 'pt', 'en'].includes(lang) ? `,language:${lang}` : '';
  const searchParam = q ? `&search=${encodeURIComponent(q)}` : '&sort=cited_by_count:desc';

  const queries: Promise<OpenAlexWork[]>[] = [];

  if (type === 'all' || type === 'book' || type === 'chapter') {
    const typeFilter = type === 'book' ? ',type:book' : type === 'chapter' ? ',type:book-chapter' : '';
    const booksUrl = `https://api.openalex.org/works?filter=doi_starts_with:10.7476,has_pdf_url:true${typeFilter}${langFilter}${searchParam}&per-page=${perPage}&page=${page}`;
    queries.push(
      fetch(booksUrl, { headers: oaHeaders })
        .then((r) => (r.ok ? (r.json() as Promise<{ results?: OpenAlexWork[] }>) : { results: [] }))
        .then((d) => d.results || [])
        .catch(() => [])
    );
  }

  if (type === 'all' || type === 'article') {
    const articlesUrl = `https://api.openalex.org/works?filter=primary_location.source.listed_in:scielo,has_pdf_url:true${langFilter}${searchParam}&per-page=${Math.ceil(perPage / (type === 'all' ? 2 : 1))}&page=${page}`;
    queries.push(
      fetch(articlesUrl, { headers: oaHeaders })
        .then((r) => (r.ok ? (r.json() as Promise<{ results?: OpenAlexWork[] }>) : { results: [] }))
        .then((d) => d.results || [])
        .catch(() => [])
    );
  }

  const settled = await Promise.all(queries);
  for (const batch of settled) {
    for (const work of batch) {
      const mapped = mapOpenAlexWork(work);
      const dedupeKey = (mapped.doi || mapped.title).toLowerCase();
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        results.push(mapped);
      }
    }
  }

  // Fallback to Crossref SciELO Books (10.7476) if OpenAlex shared egress hits 429
  if (results.length < 3 && q) {
    try {
      const crUrl = `https://api.crossref.org/prefixes/10.7476/works?query=${encodeURIComponent(q)}&rows=10&mailto=research@scielo-open-library.pages.dev`;
      const crRes = await fetch(crUrl, { headers: oaHeaders });
      if (crRes.ok) {
        const crData = (await crRes.json()) as {
          message?: {
            items?: Array<{
              DOI?: string;
              title?: string[];
              author?: Array<{ given?: string; family?: string }>;
              publisher?: string;
              published?: { 'date-parts'?: number[][] };
              type?: string;
              URL?: string;
            }>;
          };
        };
        for (const item of crData.message?.items || []) {
          const title = item.title?.[0];
          if (!title || !item.DOI) continue;
          const key = item.DOI.toLowerCase();
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          const publisher = item.publisher || 'SciELO Books';
          const { area, label, subarea } = classifyOecdArea({ title, publisher });
          results.push({
            id: `cr-${item.DOI.replace(/[^a-zA-Z0-9]/g, '')}`,
            oaiIdentifier: item.DOI,
            title,
            authors: (item.author || []).map((a) => [a.family, a.given].filter(Boolean).join(', ')).filter(Boolean),
            publisher,
            collection: 'SciELO Books',
            collectionCode: 'books',
            year: item.published?.['date-parts']?.[0]?.[0] ?? null,
            language: 'pt',
            docType: item.type === 'book-chapter' ? 'chapter' : 'book',
            oecdArea: area,
            oecdAreaLabel: label,
            oecdSubarea: subarea,
            abstract: `Obra registrada en SciELO Books (${publisher}, DOI: ${item.DOI}).`,
            keywords: [],
            doi: item.DOI,
            scieloUrl: item.URL || `https://doi.org/${item.DOI}`,
            citedByCount: 0,
            sourceOrigin: 'openalex'
          });
        }
      }
    } catch {
      // Ignore secondary fallback failure
    }
  }

  return jsonResponse({
    query: q,
    page,
    count: results.length,
    items: results,
    sources: {
      d1: Boolean(env.DB),
      openAlex: true
    }
  });
};
