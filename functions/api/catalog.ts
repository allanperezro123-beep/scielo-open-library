import { CORS_HEADERS, jsonResponse, rowToPublication, type Env, type PublicationRow } from '../types';
import type { Publication } from '../../src/types/publication';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) {
    return jsonResponse({
      source: 'fallback',
      items: [],
      total: 0,
      message: 'D1 database binding (DB) not active; frontend seed catalog will be used.'
    });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const areas = (url.searchParams.get('areas') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const langs = (url.searchParams.get('langs') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const types = (url.searchParams.get('types') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const collections = (url.searchParams.get('collections') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const yearFrom = Number.parseInt(url.searchParams.get('yearFrom') || '', 10);
  const yearTo = Number.parseInt(url.searchParams.get('yearTo') || '', 10);
  const onlyPdf = url.searchParams.get('onlyPdf') === '1';
  const sort = url.searchParams.get('sort') || 'year-desc';
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '120', 10)));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10));

  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (q) {
      const like = `%${q}%`;
      conditions.push(
        '(title LIKE ? OR authors_json LIKE ? OR abstract LIKE ? OR keywords_json LIKE ? OR doi LIKE ? OR publisher LIKE ?)'
      );
      params.push(like, like, like, like, like, like);
    }

    if (areas.length > 0) {
      conditions.push(`oecd_area IN (${areas.map(() => '?').join(',')})`);
      params.push(...areas);
    }

    if (langs.length > 0) {
      conditions.push(`language IN (${langs.map(() => '?').join(',')})`);
      params.push(...langs);
    }

    if (types.length > 0) {
      conditions.push(`doc_type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }

    if (collections.length > 0) {
      conditions.push(`collection_code IN (${collections.map(() => '?').join(',')})`);
      params.push(...collections);
    }

    if (!Number.isNaN(yearFrom)) {
      conditions.push('publication_year >= ?');
      params.push(yearFrom);
    }
    if (!Number.isNaN(yearTo)) {
      conditions.push('publication_year <= ?');
      params.push(yearTo);
    }
    if (onlyPdf) {
      conditions.push("pdf_url IS NOT NULL AND pdf_url != ''");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    let orderBy = 'publication_year DESC, cited_by_count DESC, title ASC';
    if (sort === 'year-asc') orderBy = 'publication_year ASC, title ASC';
    else if (sort === 'citations') orderBy = 'cited_by_count DESC, publication_year DESC';
    else if (sort === 'title') orderBy = 'title ASC';

    const listSql = `SELECT * FROM publications ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) as cnt FROM publications ${whereClause}`;

    const [listRes, countRes, areaFacets, langFacets, typeFacets, colFacets] = await Promise.all([
      env.DB.prepare(listSql).bind(...params, limit, offset).all<PublicationRow>(),
      env.DB.prepare(countSql).bind(...params).first<{ cnt: number }>(),
      env.DB.prepare('SELECT oecd_area as value, oecd_area_label as label, COUNT(*) as count FROM publications GROUP BY oecd_area').all(),
      env.DB.prepare('SELECT language as value, COUNT(*) as count FROM publications GROUP BY language').all(),
      env.DB.prepare('SELECT doc_type as value, COUNT(*) as count FROM publications GROUP BY doc_type').all(),
      env.DB.prepare('SELECT collection_code as value, collection as label, COUNT(*) as count FROM publications GROUP BY collection_code').all()
    ]);

    const items = (listRes.results || []).map(rowToPublication);
    return jsonResponse({
      source: 'd1',
      items,
      total: countRes?.cnt ?? items.length,
      facets: {
        oecdAreas: areaFacets.results || [],
        languages: langFacets.results || [],
        docTypes: typeFacets.results || [],
        collections: colFacets.results || []
      }
    });
  } catch (err) {
    return jsonResponse(
      {
        source: 'error',
        items: [],
        total: 0,
        error: err instanceof Error ? err.message : 'D1 query failed'
      },
      500
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) {
    return jsonResponse({ error: 'D1 database binding not configured' }, 503);
  }

  try {
    const body = (await request.json()) as { publications?: Publication[] };
    const pubs = Array.isArray(body.publications) ? body.publications.slice(0, 100) : [];
    if (pubs.length === 0) {
      return jsonResponse({ inserted: 0 });
    }

    const stmt = env.DB.prepare(`
      INSERT INTO publications (
        id, oai_identifier, title, subtitle, authors_json, publisher,
        collection, collection_code, publication_year, publication_date,
        language, doc_type, oecd_area, oecd_area_label, oecd_subarea,
        abstract, keywords_json, doi, isbn, scielo_url, pdf_url,
        epub_url, cover_url, page_count, cited_by_count, source_origin, raw_set_spec, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        authors_json = excluded.authors_json,
        abstract = CASE WHEN length(excluded.abstract) > length(COALESCE(publications.abstract, '')) THEN excluded.abstract ELSE publications.abstract END,
        pdf_url = COALESCE(excluded.pdf_url, publications.pdf_url),
        cover_url = COALESCE(excluded.cover_url, publications.cover_url),
        doi = COALESCE(excluded.doi, publications.doi),
        cited_by_count = MAX(excluded.cited_by_count, publications.cited_by_count),
        updated_at = datetime('now')
    `);

    const batch = pubs.map((p) =>
      stmt.bind(
        p.id,
        p.oaiIdentifier ?? p.id,
        p.title,
        p.subtitle ?? null,
        JSON.stringify(p.authors || []),
        p.publisher || 'SciELO',
        p.collection || 'SciELO Books',
        p.collectionCode || 'books',
        p.year ?? null,
        p.publicationDate ?? null,
        p.language || 'es',
        p.docType || 'book',
        p.oecdArea || 'social-sciences',
        p.oecdAreaLabel || 'Ciencias Sociales y Educación',
        p.oecdSubarea ?? null,
        p.abstract || '',
        JSON.stringify(p.keywords || []),
        p.doi ?? null,
        p.isbn ?? null,
        p.scieloUrl,
        p.pdfUrl ?? null,
        p.epubUrl ?? null,
        p.coverUrl ?? null,
        p.pageCount ?? null,
        p.citedByCount ?? 0,
        p.sourceOrigin || 'openalex',
        p.rawSetSpec ?? null
      )
    );

    await env.DB.batch(batch);
    return jsonResponse({ inserted: pubs.length });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Failed to upsert publications' },
      500
    );
  }
};
