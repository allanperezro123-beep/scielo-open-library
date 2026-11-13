import { CORS_HEADERS, jsonResponse, type Env } from '../types';
import type { Publication, Shelf, ShelfItem } from '../../src/types/publication';

interface ShelfRow {
  id: string;
  name: string;
  description: string | null;
  accent: string;
  created_at: string;
  updated_at: string;
}

interface ShelfItemRow {
  id: string;
  shelf_id: string;
  publication_id: string;
  publication_json: string;
  note: string;
  reading_page: number;
  added_at: string;
  updated_at: string;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.DB) {
    return jsonResponse({ source: 'local-only', shelves: [], items: [] });
  }

  try {
    const [shelvesRes, itemsRes] = await Promise.all([
      env.DB.prepare('SELECT * FROM shelves ORDER BY created_at ASC').all<ShelfRow>(),
      env.DB.prepare('SELECT * FROM shelf_items ORDER BY updated_at DESC').all<ShelfItemRow>()
    ]);

    const shelves: Shelf[] = (shelvesRes.results || []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? undefined,
      accent: s.accent,
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }));

    const items: ShelfItem[] = [];
    for (const row of itemsRes.results || []) {
      try {
        const publication = JSON.parse(row.publication_json) as Publication;
        items.push({
          id: row.id,
          shelfId: row.shelf_id,
          publicationId: row.publication_id,
          publication,
          note: row.note || '',
          readingPage: row.reading_page || 1,
          addedAt: row.added_at,
          updatedAt: row.updated_at
        });
      } catch {
        // Ignore malformed item
      }
    }

    return jsonResponse({ source: 'd1', shelves, items });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to load shelves' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) {
    return jsonResponse({ source: 'local-only', ok: true });
  }

  try {
    const body = (await request.json()) as {
      action: 'create_shelf' | 'upsert_item' | 'update_note';
      id?: string;
      name?: string;
      description?: string;
      accent?: string;
      shelfId?: string;
      publicationId?: string;
      publication?: Publication;
      note?: string;
      readingPage?: number;
    };

    if (body.action === 'create_shelf') {
      const id = (body.id || `shelf-${Date.now()}`).slice(0, 64);
      const name = (body.name || '').trim().slice(0, 80);
      if (!name) return jsonResponse({ error: 'Shelf name is required' }, 400);

      await env.DB.prepare(
        `INSERT INTO shelves (id, name, description, accent) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, accent = excluded.accent, updated_at = datetime('now')`
      )
        .bind(id, name, body.description?.slice(0, 240) ?? null, body.accent || '#9E2A2B')
        .run();

      return jsonResponse({ ok: true, id });
    }

    if (body.action === 'upsert_item' && body.shelfId && body.publication) {
      const itemId = body.id || `${body.shelfId}::${body.publication.id}`;
      await env.DB.prepare(
        `INSERT INTO shelf_items (id, shelf_id, publication_id, publication_json, note, reading_page)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(shelf_id, publication_id) DO UPDATE SET
           publication_json = excluded.publication_json,
           note = CASE WHEN excluded.note != '' THEN excluded.note ELSE shelf_items.note END,
           reading_page = COALESCE(excluded.reading_page, shelf_items.reading_page),
           updated_at = datetime('now')`
      )
        .bind(
          itemId,
          body.shelfId,
          body.publication.id,
          JSON.stringify(body.publication),
          body.note ?? '',
          body.readingPage ?? 1
        )
        .run();

      return jsonResponse({ ok: true, id: itemId });
    }

    if (body.action === 'update_note' && body.shelfId && body.publicationId) {
      await env.DB.prepare(
        `UPDATE shelf_items SET note = ?, reading_page = COALESCE(?, reading_page), updated_at = datetime('now')
         WHERE shelf_id = ? AND publication_id = ?`
      )
        .bind(body.note ?? '', body.readingPage ?? null, body.shelfId, body.publicationId)
        .run();

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Invalid action payload' }, 400);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Shelf mutation failed' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) {
    return jsonResponse({ source: 'local-only', ok: true });
  }

  const url = new URL(request.url);
  const shelfId = url.searchParams.get('shelfId');
  const publicationId = url.searchParams.get('publicationId');

  if (!shelfId) {
    return jsonResponse({ error: 'shelfId required' }, 400);
  }

  try {
    if (publicationId) {
      await env.DB.prepare('DELETE FROM shelf_items WHERE shelf_id = ? AND publication_id = ?')
        .bind(shelfId, publicationId)
        .run();
    } else {
      await env.DB.prepare('DELETE FROM shelves WHERE id = ?').bind(shelfId).run();
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Delete failed' }, 500);
  }
};
