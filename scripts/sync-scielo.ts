/**
 * SciELO OAI-PMH, OPDS & OpenAlex Harvester
 *
 * Consumes SciELO Books OAI-PMH (`oai_dc`), OPDS feeds, book landing metadata
 * (`citation_pdf_url`, DOI, ISBN), and OpenAlex SciELO-filtered works to generate:
 *   1. `src/data/seedCatalog.json` (zero-friction bundled snapshot)
 *   2. `migrations/0002_seed.sql` (Cloudflare D1 seed SQL)
 *
 * Run: npx tsx scripts/sync-scielo.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { XMLParser } from 'fast-xml-parser';
import { classifyOecdArea } from '../src/lib/taxonomy';
import type { DocumentType, LanguageCode, Publication } from '../src/types/publication';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true
});

// Allows fetching legacy SciELO OAI/OPDS servers whose TLS chain/date may fail strict checks
const permissiveAgent = new https.Agent({ rejectUnauthorized: false });

async function fetchText(url: string, insecureFallback = false): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SciELO-Open-Library-Harvester/1.0 (+https://books.scielo.org)' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } catch (err) {
    if (!insecureFallback || !url.startsWith('https://')) throw err;
    return await new Promise<string>((resolve, reject) => {
      const req = https.get(
        url,
        {
          agent: permissiveAgent,
          headers: { 'User-Agent': 'SciELO-Open-Library-Harvester/1.0' },
          timeout: 20000
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, url).toString();
            fetchText(nextUrl, true).then(resolve, reject);
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`HTTPS fallback HTTP ${res.statusCode} for ${url}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error(`Timeout fetching ${url}`));
      });
    });
  }
}

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

function normalizeLang(raw?: string | null): LanguageCode {
  if (!raw) return 'es';
  const c = String(raw).toLowerCase().slice(0, 2);
  if (c === 'es' || c === 'pt' || c === 'en') return c;
  return 'other';
}

function upgradeHttps(url?: string | null): string | undefined {
  if (!url) return undefined;
  return url.replace(/^http:\/\//i, 'https://');
}

interface LandingEnrichment {
  pdfUrl?: string;
  epubUrl?: string;
  doi?: string;
  isbn?: string;
  chapterPdfUrls?: string[];
}

async function enrichBookLanding(bookId: string): Promise<LandingEnrichment> {
  try {
    const html = await fetchText(`https://books.scielo.org/id/${bookId}`, true);
    const pdfMatch =
      /<meta[^>]+content=["']([^"']+\.pdf)["'][^>]+name=["']citation_pdf_url["']/i.exec(html) ||
      /<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+\.pdf)["']/i.exec(html) ||
      /href=["'](\/id\/[^"']+\/pdf\/[^"']+\.pdf)["'][^>]*class=["']pdf_file["']/i.exec(html) ||
      /href=["'](\/id\/[^"']+\/pdf\/[^"']+\.pdf)["']/i.exec(html);

    const epubMatch =
      /<meta[^>]+content=["']([^"']+\.epub)["'][^>]+name=["']citation_epub_url["']/i.exec(html) ||
      /<meta[^>]+name=["']citation_epub_url["'][^>]+content=["']([^"']+\.epub)["']/i.exec(html);

    const isbnMatch = /<meta[^>]+name=["']citation_isbn["'][^>]+content=["']([^"']+)["']/i.exec(html);
    const doiMatch = /https?:\/\/doi\.org\/(10\.7476\/[0-9A-Za-z._/-]+)/i.exec(html);

    const chapterMatches = [...html.matchAll(/href=["'](\/id\/[^"']+\/pdf\/[^"']+-\d{2}\.pdf)["']/gi)].map(
      (m) => `https://books.scielo.org${m[1]}`
    );

    let pdfUrl = pdfMatch?.[1];
    if (pdfUrl && pdfUrl.startsWith('/')) {
      pdfUrl = `https://books.scielo.org${pdfUrl}`;
    }

    let epubUrl = epubMatch?.[1];
    if (epubUrl && epubUrl.startsWith('/')) {
      epubUrl = `https://books.scielo.org${epubUrl}`;
    }

    return {
      pdfUrl: upgradeHttps(pdfUrl),
      epubUrl: upgradeHttps(epubUrl),
      doi: doiMatch?.[1],
      isbn: isbnMatch?.[1],
      chapterPdfUrls: [...new Set(chapterMatches)]
    };
  } catch {
    return {};
  }
}

async function harvestOaiPmhBooks(maxRecords = 40): Promise<Publication[]> {
  const endpoints = [
    'https://books.scielo.org/oai?verb=ListRecords&metadataPrefix=oai_dc',
    'https://oai.books.scielo.org/oai-pmh?verb=ListRecords&metadataPrefix=oai_dc'
  ];

  let xml = '';
  for (const endpoint of endpoints) {
    try {
      const text = await fetchText(endpoint, true);
      if (text.includes('<OAI-PMH') && text.includes('<ListRecords')) {
        xml = text;
        console.log(`✓ OAI-PMH conectado: ${endpoint}`);
        break;
      }
    } catch {
      console.log(`• Probando siguiente endpoint OAI-PMH (${endpoint} no disponible)...`);
    }
  }

  if (!xml) return [];

  const parsed = xmlParser.parse(xml);
  const records = toArray(parsed?.['OAI-PMH']?.ListRecords?.record).slice(0, maxRecords);
  const pubs: Publication[] = [];

  for (const rec of records) {
    const header = rec?.header;
    if (header?.['@_status'] === 'deleted') continue;
    const dc = rec?.metadata?.dc;
    if (!dc) continue;

    const identifier = String(header?.identifier || '').trim();
    if (!identifier) continue;
    const setSpec = toArray(header?.setSpec).map(String).join(', ');
    const title = decodeEntities(String(toArray(dc.title)[0] || ''));
    if (!title) continue;

    const authors = toArray(dc.creator).map((v) => decodeEntities(String(v))).filter(Boolean);
    const abstract = decodeEntities(
      toArray(dc.description)
        .map(String)
        .sort((a, b) => b.length - a.length)[0] || ''
    );
    const publisher = decodeEntities(String(toArray(dc.publisher)[0] || 'SciELO Books'));
    const dateStr = String(toArray(dc.date)[0] || '');
    const yearMatch = /\b(19|20)\d{2}\b/.exec(dateStr);
    const year = yearMatch ? Number.parseInt(yearMatch[0], 10) : null;
    const lang = normalizeLang(String(toArray(dc.language)[0] || 'pt'));
    const subjects = toArray(dc.subject).map(String).filter(Boolean);

    const { area, label, subarea } = classifyOecdArea({
      title,
      abstract,
      keywords: subjects,
      publisher,
      setSpec
    });

    pubs.push({
      id: `scielo-book-${identifier}`,
      oaiIdentifier: identifier,
      title,
      authors,
      publisher,
      collection: 'SciELO Books',
      collectionCode: 'books',
      year,
      publicationDate: dateStr || undefined,
      language: lang,
      docType: 'book',
      oecdArea: area,
      oecdAreaLabel: label,
      oecdSubarea: subarea,
      abstract,
      keywords: subjects.slice(0, 6),
      scieloUrl: `https://books.scielo.org/id/${identifier}`,
      coverUrl: `https://books.scielo.org/id/${identifier}/cover/cover_thumbnail.jpeg`,
      citedByCount: 0,
      sourceOrigin: 'oai-pmh',
      rawSetSpec: setSpec || undefined
    });
  }

  return pubs;
}

async function harvestOpdsBooks(pages = 2): Promise<Publication[]> {
  const pubs: Publication[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = page === 1 ? 'https://opds.livros.scielo.org/opds/new' : `https://opds.livros.scielo.org/opds/new?page=${page}`;
    try {
      const xml = await fetchText(url, true);
      const parsed = xmlParser.parse(xml);
      const entries = toArray(parsed?.feed?.entry);
      for (const entry of entries) {
        const id = String(entry.id || '').trim();
        const title = decodeEntities(String(entry.title || ''));
        if (!id || !title) continue;

        const authors = toArray(entry.author)
          .map((a: { name?: string }) => (a?.name ? decodeEntities(String(a.name)) : ''))
          .filter(Boolean);
        const publisher = entry.publisher ? decodeEntities(String(entry.publisher)) : 'SciELO Livros';
        const issued = entry.issued ? String(entry.issued) : '';
        const year = /^\d{4}/.test(issued) ? Number.parseInt(issued.slice(0, 4), 10) : null;
        const lang = normalizeLang(entry.language ? String(entry.language) : 'pt');
        const abstract = entry.summary ? decodeEntities(String(entry.summary).replace(/\r?\n/g, ' ')) : '';
        const identifiers = toArray(entry.identifier).map(String);
        const isbn = identifiers.find((x) => x.includes('isbn:'))?.replace('urn:isbn:', '');
        const { area, label, subarea } = classifyOecdArea({ title, abstract, publisher });

        pubs.push({
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
          abstract,
          keywords: [],
          isbn,
          scieloUrl: `https://books.scielo.org/id/${id}`,
          coverUrl: `https://books.scielo.org/id/${id}/cover/cover_thumbnail.jpeg`,
          citedByCount: 0,
          sourceOrigin: 'opds'
        });
      }
      console.log(`✓ OPDS página ${page}: ${entries.length} entradas`);
    } catch (err) {
      console.warn(`! Error OPDS página ${page}:`, err);
    }
  }
  return pubs;
}

function reconstructAbstract(inverted?: Record<string, number[]> | null): string {
  if (!inverted) return '';
  const words: string[] = [];
  for (const [token, positions] of Object.entries(inverted)) {
    for (const pos of positions) words[pos] = token;
  }
  return words.filter(Boolean).join(' ').trim();
}

async function harvestOpenAlexSciELO(): Promise<Publication[]> {
  const endpoints = [
    // SciELO Books in Spanish
    'https://api.openalex.org/works?filter=doi_starts_with:10.7476,has_pdf_url:true,language:es,type:book&sort=cited_by_count:desc&per-page=15',
    // SciELO Books in English & Portuguese (recent & cited)
    'https://api.openalex.org/works?filter=doi_starts_with:10.7476,has_pdf_url:true,type:book&sort=cited_by_count:desc&per-page=15',
    // SciELO Book Chapters
    'https://api.openalex.org/works?filter=doi_starts_with:10.7476,has_pdf_url:true,type:book-chapter&sort=cited_by_count:desc&per-page=12',
    // SciELO Regional Journal Articles (ES/PT/EN)
    'https://api.openalex.org/works?filter=primary_location.source.listed_in:scielo,has_pdf_url:true,language:es&sort=cited_by_count:desc&per-page=12',
    'https://api.openalex.org/works?filter=primary_location.source.listed_in:scielo,has_pdf_url:true,language:en&sort=cited_by_count:desc&per-page=8'
  ];

  const results: Publication[] = [];

  for (const url of endpoints) {
    try {
      const raw = await fetchText(url, false);
      const data = JSON.parse(raw) as { results?: Array<Record<string, unknown>> };
      for (const w of data.results || []) {
        const primaryLoc = (w.primary_location || {}) as Record<string, unknown>;
        const bestOa = (w.best_oa_location || {}) as Record<string, unknown>;
        const source = (primaryLoc.source || {}) as Record<string, unknown>;
        const rawPdf = (primaryLoc.pdf_url || bestOa.pdf_url) as string | undefined;
        const pdfUrl = upgradeHttps(rawPdf);
        if (!pdfUrl) continue;

        const landing = upgradeHttps(
          (primaryLoc.landing_page_url as string) || (w.doi as string) || (w.id as string)
        )!;
        const bookMatch = /books\.scielo\.org\/id\/([a-z0-9]+)/i.exec(pdfUrl);
        const bookId = bookMatch?.[1];
        const workType = String(w.type || 'article');
        const docType: DocumentType =
          workType === 'book' ? 'book' : workType === 'book-chapter' ? 'chapter' : 'article';

        const title = String(w.title || w.display_name || '').trim();
        if (!title) continue;

        const authors = ((w.authorships as Array<Record<string, unknown>>) || [])
          .map((a) => ((a.author as Record<string, unknown>)?.display_name as string) || (a.raw_author_name as string))
          .filter(Boolean)
          .slice(0, 8);

        const primaryTopic = (w.primary_topic || {}) as Record<string, unknown>;
        const fieldName = ((primaryTopic.field as Record<string, unknown>)?.display_name as string) || (primaryTopic.display_name as string);
        const domainId = (primaryTopic.domain as Record<string, unknown>)?.id as string | undefined;
        const keywords = ((w.keywords as Array<Record<string, unknown>>) || [])
          .map((k) => String(k.display_name || ''))
          .filter(Boolean)
          .slice(0, 7);

        const abstract = reconstructAbstract(w.abstract_inverted_index as Record<string, number[]> | null);
        const publisher =
          (source.display_name as string) || (source.host_organization_name as string) || 'SciELO Network';

        const { area, label, subarea } = classifyOecdArea({
          title,
          abstract,
          keywords,
          publisher,
          openAlexDomainId: domainId,
          openAlexFieldName: fieldName
        });

        let collection = 'Red SciELO';
        let collectionCode = 'scielo-network';
        if (pdfUrl.includes('books.scielo.org')) {
          collection = 'SciELO Books';
          collectionCode = 'books';
        } else if (pdfUrl.includes('scielo.br')) {
          collection = 'SciELO Brasil';
          collectionCode = 'scielo-br';
        } else if (pdfUrl.includes('scielo.org.co')) {
          collection = 'SciELO Colombia';
          collectionCode = 'scielo-co';
        } else if (pdfUrl.includes('scielo.org.mx')) {
          collection = 'SciELO México';
          collectionCode = 'scielo-mx';
        } else if (pdfUrl.includes('scielo.cl')) {
          collection = 'SciELO Chile';
          collectionCode = 'scielo-cl';
        } else if (pdfUrl.includes('scielo.org.ar')) {
          collection = 'SciELO Argentina';
          collectionCode = 'scielo-ar';
        } else if (pdfUrl.includes('scielo.org.pe')) {
          collection = 'SciELO Perú';
          collectionCode = 'scielo-pe';
        }

        const oaId = String(w.id || '').split('/').pop() || `${Date.now()}`;
        const doi = w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//i, '') : undefined;

        results.push({
          id: docType === 'book' && bookId ? `scielo-book-${bookId}` : `oa-${oaId}`,
          oaiIdentifier: bookId || String(w.id),
          title,
          authors,
          publisher,
          collection,
          collectionCode,
          year: typeof w.publication_year === 'number' ? w.publication_year : null,
          publicationDate: (w.publication_date as string) || undefined,
          language: normalizeLang(w.language as string),
          docType,
          oecdArea: area,
          oecdAreaLabel: label,
          oecdSubarea: subarea,
          abstract:
            abstract ||
            (fieldName
              ? `Documento científico en Acceso Abierto (${fieldName}) publicado en ${publisher}.`
              : `Publicación científica en Acceso Abierto indexada en ${collection}.`),
          keywords: keywords.length > 0 ? keywords : fieldName ? [fieldName] : [],
          doi,
          scieloUrl: bookId ? `https://books.scielo.org/id/${bookId}` : landing,
          pdfUrl,
          coverUrl: bookId ? `https://books.scielo.org/id/${bookId}/cover/cover_thumbnail.jpeg` : undefined,
          citedByCount: typeof w.cited_by_count === 'number' ? w.cited_by_count : 0,
          sourceOrigin: 'openalex'
        });
      }
    } catch (err) {
      console.warn('! Error OpenAlex batch:', err);
    }
  }

  console.log(`✓ OpenAlex SciELO harvest: ${results.length} registros`);
  return results;
}

function sqlStr(val: string | undefined | null): string {
  if (val === undefined || val === null) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}

async function main() {
  console.log('=== SciELO Open Library · Ingesta OAI-PMH + OPDS + OpenAlex ===');

  const [oaiItems, opdsItems, openAlexItems] = await Promise.all([
    harvestOaiPmhBooks(25),
    harvestOpdsBooks(2),
    harvestOpenAlexSciELO()
  ]);

  // Deduplicate keeping richest metadata
  const byKey = new Map<string, Publication>();

  const mergeIn = (item: Publication) => {
    const key = item.id.startsWith('scielo-book-')
      ? item.id
      : (item.doi || item.title.toLowerCase().slice(0, 80));

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      return;
    }

    byKey.set(key, {
      ...existing,
      ...item,
      abstract: item.abstract.length > existing.abstract.length ? item.abstract : existing.abstract,
      pdfUrl: item.pdfUrl || existing.pdfUrl,
      epubUrl: item.epubUrl || existing.epubUrl,
      coverUrl: item.coverUrl || existing.coverUrl,
      doi: item.doi || existing.doi,
      isbn: item.isbn || existing.isbn,
      keywords: item.keywords.length > existing.keywords.length ? item.keywords : existing.keywords,
      citedByCount: Math.max(item.citedByCount ?? 0, existing.citedByCount ?? 0),
      sourceOrigin: existing.sourceOrigin !== item.sourceOrigin ? 'hybrid' : item.sourceOrigin
    });
  };

  for (const item of [...oaiItems, ...opdsItems, ...openAlexItems]) {
    mergeIn(item);
  }

  const all = [...byKey.values()];

  // Enrich SciELO Books missing direct pdfUrl by scraping canonical <meta name="citation_pdf_url">
  const booksToEnrich = all.filter((p) => p.collectionCode === 'books' && (!p.pdfUrl || !p.doi));
  console.log(`• Enriqueciendo ${booksToEnrich.length} libros SciELO con PDF/DOI reales...`);

  const CONCURRENCY = 5;
  for (let i = 0; i < booksToEnrich.length; i += CONCURRENCY) {
    const slice = booksToEnrich.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (book) => {
        const bookId = book.oaiIdentifier || book.id.replace('scielo-book-', '');
        if (!bookId || bookId.includes('/')) return;
        const meta = await enrichBookLanding(bookId);
        if (meta.pdfUrl) book.pdfUrl = meta.pdfUrl;
        if (meta.epubUrl) book.epubUrl = meta.epubUrl;
        if (meta.doi) book.doi = meta.doi;
        if (meta.isbn) book.isbn = meta.isbn;
      })
    );
  }

  // Sort cleanly: books with PDF & high quality metadata first
  const finalCatalog = all
    .filter((p) => p.title && (p.pdfUrl || p.scieloUrl))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.citedByCount ?? 0) - (a.citedByCount ?? 0));

  const root = process.cwd();
  const seedJsonPath = path.join(root, 'src', 'data', 'seedCatalog.json');
  await fs.mkdir(path.dirname(seedJsonPath), { recursive: true });
  await fs.writeFile(seedJsonPath, JSON.stringify(finalCatalog, null, 2), 'utf8');

  // Generate SQL seed for Cloudflare D1
  const sqlLines = [
    '-- Auto-generated by scripts/sync-scielo.ts',
    '-- Real SciELO Books (OAI-PMH / OPDS) & SciELO OpenAlex records'
  ];

  for (const p of finalCatalog) {
    sqlLines.push(
      `INSERT OR REPLACE INTO publications (id, oai_identifier, title, subtitle, authors_json, publisher, collection, collection_code, publication_year, publication_date, language, doc_type, oecd_area, oecd_area_label, oecd_subarea, abstract, keywords_json, doi, isbn, scielo_url, pdf_url, epub_url, cover_url, page_count, cited_by_count, source_origin, raw_set_spec) VALUES (${[
        sqlStr(p.id),
        sqlStr(p.oaiIdentifier ?? p.id),
        sqlStr(p.title),
        sqlStr(p.subtitle),
        sqlStr(JSON.stringify(p.authors)),
        sqlStr(p.publisher),
        sqlStr(p.collection),
        sqlStr(p.collectionCode),
        p.year !== null && p.year !== undefined ? String(p.year) : 'NULL',
        sqlStr(p.publicationDate),
        sqlStr(p.language),
        sqlStr(p.docType),
        sqlStr(p.oecdArea),
        sqlStr(p.oecdAreaLabel),
        sqlStr(p.oecdSubarea),
        sqlStr(p.abstract),
        sqlStr(JSON.stringify(p.keywords)),
        sqlStr(p.doi),
        sqlStr(p.isbn),
        sqlStr(p.scieloUrl),
        sqlStr(p.pdfUrl),
        sqlStr(p.epubUrl),
        sqlStr(p.coverUrl),
        p.pageCount ? String(p.pageCount) : 'NULL',
        String(p.citedByCount ?? 0),
        sqlStr(p.sourceOrigin),
        sqlStr(p.rawSetSpec)
      ].join(', ')});`
    );
  }

  sqlLines.push(
    `INSERT INTO sync_logs (source, records_synced, status, message) VALUES ('oai-pmh+opds+openalex', ${finalCatalog.length}, 'ok', 'Initial real SciELO seed');`
  );

  const seedSqlPath = path.join(root, 'migrations', '0002_seed.sql');
  await fs.writeFile(seedSqlPath, sqlLines.join('\n') + '\n', 'utf8');

  const withPdf = finalCatalog.filter((x) => Boolean(x.pdfUrl)).length;
  console.log(`✅ Generado ${seedJsonPath} (${finalCatalog.length} registros, ${withPdf} con PDF directo)`);
  console.log(`✅ Generado ${seedSqlPath}`);
}

main().catch((err) => {
  console.error('❌ Error fatal en sync-scielo:', err);
  process.exit(1);
});
