import { XMLParser } from 'fast-xml-parser';
import { CORS_HEADERS, jsonResponse, type Env } from '../types';
import { classifyOecdArea } from '../../src/lib/taxonomy';
import type { LanguageCode, Publication } from '../../src/types/publication';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true
});

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function normalizeLang(raw?: string): LanguageCode {
  if (!raw) return 'es';
  const c = String(raw).toLowerCase().slice(0, 2);
  if (c === 'es' || c === 'pt' || c === 'en') return c;
  return 'other';
}

function parseOaiRecords(xml: string, collectionName: string, collectionCode: string): Publication[] {
  const parsed = xmlParser.parse(xml);
  const listRecords = parsed?.['OAI-PMH']?.ListRecords;
  if (!listRecords) return [];

  const records = toArray(listRecords.record);
  const items: Publication[] = [];

  for (const rec of records) {
    const header = rec?.header;
    if (header?.['@_status'] === 'deleted') continue;

    const dc = rec?.metadata?.dc;
    if (!dc) continue;

    const identifier = String(header?.identifier || '');
    const setSpec = toArray(header?.setSpec).map(String).join(', ');
    const titles = toArray(dc.title).map(String).filter(Boolean);
    const title = decodeEntities(titles[0] || 'Publicación SciELO');
    const authors = toArray(dc.creator).map((v) => decodeEntities(String(v))).filter(Boolean);
    const descriptions = toArray(dc.description).map((v) => decodeEntities(String(v))).filter(Boolean);
    const abstract = descriptions.sort((a, b) => b.length - a.length)[0] || '';
    const publisher = decodeEntities(toArray(dc.publisher).map(String)[0] || 'SciELO');
    const rawDate = toArray(dc.date).map(String)[0] || '';
    const yearMatch = /\b(19|20)\d{2}\b/.exec(rawDate);
    const year = yearMatch ? Number.parseInt(yearMatch[0], 10) : null;
    const lang = normalizeLang(toArray(dc.language).map(String)[0]);
    const subjects = toArray(dc.subject).map(String).filter(Boolean);
    const identifiers = toArray(dc.identifier).map(String);
    const scieloUrl =
      identifiers.find((i) => i.includes('scielo')) ||
      identifiers.find((i) => i.startsWith('http')) ||
      `https://books.scielo.org/id/${identifier}`;
    const doi = identifiers.find((i) => i.includes('10.') && i.includes('/'))?.replace(/^https?:\/\/doi\.org\//i, '');

    const rawType = (toArray(dc.type).map(String)[0] || '').toLowerCase();
    const docType = rawType.includes('chapter')
      ? 'chapter'
      : rawType.includes('article') || collectionCode !== 'books'
        ? 'article'
        : 'book';

    const { area, label, subarea } = classifyOecdArea({
      title,
      abstract,
      keywords: subjects,
      publisher,
      setSpec
    });

    items.push({
      id: collectionCode === 'books' ? `scielo-book-${identifier}` : `${collectionCode}-${identifier.replace(/[^a-zA-Z0-9_-]/g, '')}`,
      oaiIdentifier: identifier,
      title,
      authors,
      publisher,
      collection: collectionName,
      collectionCode,
      year,
      publicationDate: rawDate || undefined,
      language: lang,
      docType,
      oecdArea: area,
      oecdAreaLabel: label,
      oecdSubarea: subarea,
      abstract,
      keywords: subjects.slice(0, 8),
      doi,
      scieloUrl: scieloUrl.replace(/^http:\/\//, 'https://'),
      coverUrl: collectionCode === 'books' ? `https://books.scielo.org/id/${identifier}/cover/cover_thumbnail.jpeg` : undefined,
      sourceOrigin: 'oai-pmh',
      rawSetSpec: setSpec || undefined
    });
  }

  return items;
}

function parseOpdsFeed(xml: string): Publication[] {
  const parsed = xmlParser.parse(xml);
  const entries = toArray(parsed?.feed?.entry);
  const items: Publication[] = [];

  for (const entry of entries) {
    const id = String(entry.id || '').trim();
    const title = decodeEntities(String(entry.title || ''));
    if (!id || !title) continue;

    const authors = toArray(entry.author)
      .map((a: { name?: string }) => (a?.name ? decodeEntities(String(a.name)) : ''))
      .filter(Boolean);
    const publisher = entry.publisher ? decodeEntities(String(entry.publisher)) : 'SciELO Livros';
    const yearStr = entry.issued ? String(entry.issued) : '';
    const year = /^\d{4}/.test(yearStr) ? Number.parseInt(yearStr.slice(0, 4), 10) : null;
    const lang = normalizeLang(entry.language ? String(entry.language) : 'pt');
    const summary = entry.summary ? decodeEntities(String(entry.summary)) : '';

    const identifiers = toArray(entry.identifier).map(String);
    const isbn = identifiers.find((x) => x.includes('isbn:'))?.replace('urn:isbn:', '');
    const links = toArray(entry.link) as Array<{ '@_rel'?: string; '@_href'?: string; '@_type'?: string }>;
    const pdfLink = links.find((l) => l['@_type'] === 'application/pdf')?.['@_href'];
    const thumbLink = links.find((l) => String(l['@_rel']).includes('thumbnail'))?.['@_href'];

    const { area, label, subarea } = classifyOecdArea({
      title,
      abstract: summary,
      publisher
    });

    items.push({
      id: `scielo-book-${id}`,
      oaiIdentifier: id,
      title,
      authors,
      publisher,
      collection: 'SciELO Books',
      collectionCode: 'books',
      year,
      language: lang,
      docType: 'book',
      oecdArea: area,
      oecdAreaLabel: label,
      oecdSubarea: subarea,
      abstract: summary,
      keywords: [],
      isbn,
      scieloUrl: `https://books.scielo.org/id/${id}`,
      pdfUrl: pdfLink ? pdfLink.replace(/^http:\/\//, 'https://') : undefined,
      coverUrl: thumbLink
        ? thumbLink.replace(/^http:\/\//, 'https://')
        : `https://books.scielo.org/id/${id}/cover/cover_thumbnail.jpeg`,
      sourceOrigin: 'opds'
    });
  }

  return items;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.DB) {
    return jsonResponse({ logs: [], d1Connected: false });
  }
  const res = await env.DB.prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT 10').all();
  return jsonResponse({ logs: res.results || [], d1Connected: true });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => ({}))) as { target?: 'books-oai' | 'opds' | 'scielo-mx' | 'scielo-pe' };
  const target = body.target || 'opds';

  const diagnostics: Record<string, unknown> = { target };
  let harvested: Publication[] = [];

  try {
    if (target === 'books-oai') {
      const res = await fetch('https://oai.books.scielo.org/oai-pmh?verb=ListRecords&metadataPrefix=oai_dc', {
        headers: { 'User-Agent': 'SciELO-Open-Library-Harvester/1.0' }
      });
      if (res.ok) {
        const xml = await res.text();
        harvested = parseOaiRecords(xml, 'SciELO Books', 'books').slice(0, 40);
      } else {
        diagnostics.fallback = `OAI-PMH SSL/HTTP ${res.status}; usando OpenAlex SciELO Books (10.7476)`;
      }
    } else if (target === 'scielo-mx') {
      const res = await fetch('https://www.scielo.org.mx/oai/scielo-oai.php?verb=ListRecords&metadataPrefix=oai_dc', {
        headers: { 'User-Agent': 'SciELO-Open-Library-Harvester/1.0' }
      });
      if (!res.ok) throw new Error(`SciELO MX OAI HTTP ${res.status}`);
      const xml = await res.text();
      harvested = parseOaiRecords(xml, 'SciELO México', 'scielo-mx').slice(0, 30);
    } else if (target === 'scielo-pe') {
      const res = await fetch('http://www.scielo.org.pe/oai/scielo-oai.php?verb=ListRecords&metadataPrefix=oai_dc', {
        headers: { 'User-Agent': 'SciELO-Open-Library-Harvester/1.0' }
      });
      if (!res.ok) throw new Error(`SciELO PE OAI HTTP ${res.status}`);
      const xml = await res.text();
      harvested = parseOaiRecords(xml, 'SciELO Perú', 'scielo-pe').slice(0, 30);
    } else {
      const res = await fetch('https://opds.livros.scielo.org/opds/new', {
        headers: { 'User-Agent': 'SciELO-Open-Library-Harvester/1.0' }
      });
      if (res.ok) {
        const xml = await res.text();
        harvested = parseOpdsFeed(xml).slice(0, 30);
      } else {
        diagnostics.fallback = `OPDS SSL/HTTP ${res.status}; usando OpenAlex SciELO Books (10.7476)`;
      }
    }

    // Fallback to OpenAlex SciELO Books, then Crossref 10.7476 if legacy OAI/OPDS TLS cert fails (526) or OpenAlex rate-limits (429)
    if (harvested.length === 0 && (target === 'opds' || target === 'books-oai')) {
      const oaRes = await fetch(
        'https://api.openalex.org/works?filter=doi_starts_with:10.7476,has_pdf_url:true,type:book&sort=publication_year:desc&per-page=25',
        { headers: { 'User-Agent': 'SciELO-Open-Library/1.0 (mailto:research@scielo-open-library.pages.dev)' } }
      );
      if (oaRes.ok) {
        const oaData = (await oaRes.json()) as {
          results?: Array<{
            id: string;
            doi?: string;
            title?: string;
            publication_year?: number;
            language?: string;
            cited_by_count?: number;
            primary_location?: { pdf_url?: string; landing_page_url?: string; source?: { display_name?: string } };
            authorships?: Array<{ author?: { display_name?: string } }>;
            primary_topic?: { display_name?: string; field?: { display_name?: string } };
          }>;
        };
        harvested = (oaData.results || [])
          .filter((w) => w.title && w.primary_location?.pdf_url)
          .map((w) => {
            const pdfUrl = String(w.primary_location!.pdf_url).replace(/^http:\/\//i, 'https://');
            const bookMatch = /books\.scielo\.org\/id\/([a-z0-9]+)/i.exec(pdfUrl);
            const bookId = bookMatch?.[1];
            const title = String(w.title);
            const publisher = w.primary_location?.source?.display_name || 'SciELO Books';
            const { area, label, subarea } = classifyOecdArea({
              title,
              publisher,
              openAlexFieldName: w.primary_topic?.field?.display_name || w.primary_topic?.display_name
            });
            return {
              id: bookId ? `scielo-book-${bookId}` : `oa-${w.id.split('/').pop()}`,
              oaiIdentifier: bookId || w.id,
              title,
              authors: (w.authorships || []).map((a) => a.author?.display_name || '').filter(Boolean),
              publisher,
              collection: 'SciELO Books',
              collectionCode: 'books',
              year: w.publication_year ?? null,
              language: normalizeLang(w.language),
              docType: 'book' as const,
              oecdArea: area,
              oecdAreaLabel: label,
              oecdSubarea: subarea,
              abstract: w.primary_topic?.display_name
                ? `Libro científico SciELO sobre ${w.primary_topic.display_name}.`
                : 'Libro científico en Acceso Abierto de SciELO Books.',
              keywords: w.primary_topic?.display_name ? [w.primary_topic.display_name] : [],
              doi: w.doi?.replace(/^https?:\/\/doi\.org\//i, ''),
              scieloUrl: bookId ? `https://books.scielo.org/id/${bookId}` : w.doi || w.id,
              pdfUrl,
              coverUrl: bookId ? `https://books.scielo.org/id/${bookId}/cover/cover_thumbnail.jpeg` : undefined,
              citedByCount: w.cited_by_count ?? 0,
              sourceOrigin: 'openalex' as const
            };
          });
      } else {
        diagnostics.openAlexStatus = oaRes.status;
        const crRes = await fetch(
          'https://api.crossref.org/prefixes/10.7476/works?filter=type:monograph&rows=25&sort=published&order=desc&mailto=research@scielo-open-library.pages.dev',
          { headers: { 'User-Agent': 'SciELO-Open-Library/1.0 (mailto:research@scielo-open-library.pages.dev)' } }
        );
        if (!crRes.ok) throw new Error(`Crossref fallback HTTP ${crRes.status}`);
        const crData = (await crRes.json()) as {
          message?: {
            items?: Array<{
              DOI?: string;
              title?: string[];
              author?: Array<{ given?: string; family?: string }>;
              publisher?: string;
              published?: { 'date-parts'?: number[][] };
              URL?: string;
            }>;
          };
        };
        harvested = (crData.message?.items || [])
          .filter((w) => w.title?.[0] && w.DOI)
          .map((w) => {
            const title = decodeEntities(String(w.title![0]));
            const publisher = decodeEntities(w.publisher || 'SciELO Books');
            const year = w.published?.['date-parts']?.[0]?.[0] ?? null;
            const authors = (w.author || [])
              .map((a) => [a.family, a.given].filter(Boolean).join(', '))
              .filter(Boolean);
            const { area, label, subarea } = classifyOecdArea({ title, publisher });
            const doiSlug = String(w.DOI).replace(/[^a-zA-Z0-9]/g, '');
            return {
              id: `cr-${doiSlug}`,
              oaiIdentifier: w.DOI,
              title,
              authors,
              publisher,
              collection: 'SciELO Books',
              collectionCode: 'books',
              year,
              language: 'pt' as const,
              docType: 'book' as const,
              oecdArea: area,
              oecdAreaLabel: label,
              oecdSubarea: subarea,
              abstract: `Monografía académica de ${publisher} registrada en SciELO Books (DOI: ${w.DOI}).`,
              keywords: [],
              doi: w.DOI,
              scieloUrl: w.URL || `https://doi.org/${w.DOI}`,
              citedByCount: 0,
              sourceOrigin: 'openalex' as const
            };
          });
      }
    }

    if (env.DB && harvested.length > 0) {
      const stmt = env.DB.prepare(`
        INSERT INTO publications (
          id, oai_identifier, title, authors_json, publisher,
          collection, collection_code, publication_year, language, doc_type,
          oecd_area, oecd_area_label, oecd_subarea, abstract, keywords_json,
          doi, isbn, scielo_url, pdf_url, cover_url, source_origin, raw_set_spec, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          abstract = CASE WHEN length(excluded.abstract) > length(COALESCE(publications.abstract, '')) THEN excluded.abstract ELSE publications.abstract END,
          cover_url = COALESCE(excluded.cover_url, publications.cover_url),
          updated_at = datetime('now')
      `);

      await env.DB.batch(
        harvested.map((p) =>
          stmt.bind(
            p.id,
            p.oaiIdentifier ?? p.id,
            p.title,
            JSON.stringify(p.authors),
            p.publisher,
            p.collection,
            p.collectionCode,
            p.year ?? null,
            p.language,
            p.docType,
            p.oecdArea,
            p.oecdAreaLabel,
            p.oecdSubarea ?? null,
            p.abstract,
            JSON.stringify(p.keywords),
            p.doi ?? null,
            p.isbn ?? null,
            p.scieloUrl,
            p.pdfUrl ?? null,
            p.coverUrl ?? null,
            p.sourceOrigin,
            p.rawSetSpec ?? null
          )
        )
      );

      await env.DB.prepare(
        'INSERT INTO sync_logs (source, records_synced, status, message) VALUES (?, ?, ?, ?)'
      )
        .bind(target, harvested.length, 'ok', `Synced ${harvested.length} records from ${target}`)
        .run();
    }

    return jsonResponse({
      ok: true,
      synced: harvested.length,
      items: harvested,
      diagnostics
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    if (env.DB) {
      await env.DB.prepare('INSERT INTO sync_logs (source, records_synced, status, message) VALUES (?, ?, ?, ?)')
        .bind(target, 0, 'error', message)
        .run()
        .catch(() => undefined);
    }
    return jsonResponse({ ok: false, error: message, diagnostics }, 502);
  }
};
