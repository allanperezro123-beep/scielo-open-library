import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Publication, Shelf, ShelfItem } from '../types/publication';

const STORAGE_SHELVES_KEY = 'scielo-open-library:shelves:v1';
const STORAGE_ITEMS_KEY = 'scielo-open-library:shelf-items:v1';

const DEFAULT_SHELVES: Shelf[] = [
  {
    id: 'favorites',
    name: 'Lecturas Esenciales',
    description: 'Monografías y artículos fundamentales guardados para consulta frecuente.',
    accent: '#9E2A2B',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'research-queue',
    name: 'Tesis & Marco Teórico',
    description: 'Fuentes citables seleccionadas para revisión bibliográfica y contraste.',
    accent: '#B8863B',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useShelves() {
  const [shelves, setShelves] = useState<Shelf[]>(() => readLocal<Shelf[]>(STORAGE_SHELVES_KEY, DEFAULT_SHELVES));
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>(() => readLocal<ShelfItem[]>(STORAGE_ITEMS_KEY, []));
  const [syncedWithD1, setSyncedWithD1] = useState<boolean>(false);

  // Persist local cache immediately on state updates
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SHELVES_KEY, JSON.stringify(shelves));
    } catch {
      // Ignore quota errors
    }
  }, [shelves]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(shelfItems));
    } catch {
      // Ignore quota errors
    }
  }, [shelfItems]);

  // Hydrate from Cloudflare D1 (/api/shelves)
  useEffect(() => {
    let active = true;
    fetch('/api/shelves')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { source?: string; shelves?: Shelf[]; items?: ShelfItem[] } | null) => {
        if (!active || !data || data.source !== 'd1') return;
        setSyncedWithD1(true);
        if (Array.isArray(data.shelves) && data.shelves.length > 0) {
          setShelves(data.shelves);
        }
        if (Array.isArray(data.items) && data.items.length > 0) {
          setShelfItems((prev) => {
            const byId = new Map(prev.map((item) => [`${item.shelfId}::${item.publicationId}`, item]));
            for (const item of data.items!) {
              byId.set(`${item.shelfId}::${item.publicationId}`, item);
            }
            return [...byId.values()];
          });
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const savedPublicationIds = useMemo(() => {
    return new Set(shelfItems.map((i) => i.publicationId));
  }, [shelfItems]);

  const getPublicationShelves = useCallback(
    (publicationId: string) => shelfItems.filter((i) => i.publicationId === publicationId),
    [shelfItems]
  );

  const createShelf = useCallback(async (name: string, description?: string, accent = '#9E2A2B') => {
    const clean = name.trim();
    if (!clean) return null;
    const now = new Date().toISOString();
    const id = `shelf-${Date.now().toString(36)}`;
    const newShelf: Shelf = {
      id,
      name: clean,
      description: description?.trim() || undefined,
      accent,
      createdAt: now,
      updatedAt: now
    };

    // Optimistic UI update
    setShelves((prev) => [...prev, newShelf]);

    try {
      await fetch('/api/shelves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_shelf',
          id,
          name: clean,
          description: newShelf.description,
          accent
        })
      });
    } catch {
      // LocalStorage preserves shelf gracefully
    }
    return newShelf;
  }, []);

  const deleteShelf = useCallback(async (shelfId: string) => {
    if (shelfId === 'favorites') return;
    setShelves((prev) => prev.filter((s) => s.id !== shelfId));
    setShelfItems((prev) => prev.filter((i) => i.shelfId !== shelfId));
    try {
      await fetch(`/api/shelves?shelfId=${encodeURIComponent(shelfId)}`, { method: 'DELETE' });
    } catch {
      // Ignore offline error
    }
  }, []);

  const toggleInShelf = useCallback(
    async (shelfId: string, publication: Publication, note = '') => {
      const exists = shelfItems.some(
        (i) => i.shelfId === shelfId && i.publicationId === publication.id
      );

      if (exists) {
        setShelfItems((prev) =>
          prev.filter((i) => !(i.shelfId === shelfId && i.publicationId === publication.id))
        );
        try {
          await fetch(
            `/api/shelves?shelfId=${encodeURIComponent(shelfId)}&publicationId=${encodeURIComponent(publication.id)}`,
            { method: 'DELETE' }
          );
        } catch {
          // Non-fatal
        }
        return false;
      }

      const now = new Date().toISOString();
      const newItem: ShelfItem = {
        id: `${shelfId}::${publication.id}`,
        shelfId,
        publicationId: publication.id,
        publication,
        note,
        readingPage: 1,
        addedAt: now,
        updatedAt: now
      };

      // Optimistic add
      setShelfItems((prev) => [newItem, ...prev]);

      try {
        await fetch('/api/shelves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert_item',
            id: newItem.id,
            shelfId,
            publication,
            note,
            readingPage: 1
          })
        });
      } catch {
        // Preserved in localStorage
      }
      return true;
    },
    [shelfItems]
  );

  const updateNote = useCallback(
    async (shelfId: string, publication: Publication, note: string, readingPage?: number) => {
      const now = new Date().toISOString();
      setShelfItems((prev) => {
        const exists = prev.some((i) => i.shelfId === shelfId && i.publicationId === publication.id);
        if (!exists) {
          return [
            {
              id: `${shelfId}::${publication.id}`,
              shelfId,
              publicationId: publication.id,
              publication,
              note,
              readingPage: readingPage ?? 1,
              addedAt: now,
              updatedAt: now
            },
            ...prev
          ];
        }
        return prev.map((i) =>
          i.shelfId === shelfId && i.publicationId === publication.id
            ? { ...i, note, readingPage: readingPage ?? i.readingPage, updatedAt: now }
            : i
        );
      });

      try {
        await fetch('/api/shelves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert_item',
            shelfId,
            publication,
            note,
            readingPage
          })
        });
      } catch {
        // LocalStorage keeps note safely
      }
    },
    []
  );

  return {
    shelves,
    shelfItems,
    syncedWithD1,
    savedPublicationIds,
    getPublicationShelves,
    createShelf,
    deleteShelf,
    toggleInShelf,
    updateNote
  };
}
