import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import seedCatalog from '../data/seedCatalog.json';
import type {
  CatalogFilters,
  CatalogStats,
  DocumentType,
  LanguageCode,
  OecdAreaId,
  Publication
} from '../types/publication';
import { OECD_AREAS } from '../lib/taxonomy';

export interface AutocompleteSuggestion {
  value: string;
  label: string;
  category: 'título' | 'autor' | 'tema' | 'doi' | 'editorial';
}

const DEFAULT_FILTERS: CatalogFilters = {
  query: '',
  oecdAreas: [],
  languages: [],
  docTypes: [],
  collections: [],
  yearFrom: null,
  yearTo: null,
  onlyWithPdf: false,
  sortBy: 'year-desc'
};

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  es: 'Español',
  pt: 'Portugués',
  en: 'Inglés',
  other: 'Otros'
};

const DOCTYPE_LABELS: Record<DocumentType, string> = {
  book: 'Libro completo',
  chapter: 'Capítulo',
  article: 'Artículo'
};

export function useCatalog() {
  const [items, setItems] = useState<Publication[]>(() => seedCatalog as Publication[]);
  const [loading, setLoading] = useState<boolean>(true);
  const [liveSearching, setLiveSearching] = useState<boolean>(false);
  const [liveCountAdded, setLiveCountAdded] = useState<number>(0);
  const [backendSource, setBackendSource] = useState<'d1' | 'seed'>('seed');
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deferredQuery = useDeferredValue(filters.query);

  // Hydrate from Cloudflare D1 Edge API (/api/catalog) on mount
  const reloadFromEdge = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/catalog?limit=200');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { source?: string; items?: Publication[] };
      if (data.source === 'd1' && Array.isArray(data.items) && data.items.length > 0) {
        setItems(data.items);
        setBackendSource('d1');
      } else {
        setItems(seedCatalog as Publication[]);
        setBackendSource('seed');
      }
    } catch {
      // Fallback transparently to bundled seed snapshot (works offline or in pure Vite dev)
      setItems(seedCatalog as Publication[]);
      setBackendSource('seed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadFromEdge();
  }, [reloadFromEdge]);

  // Precompute O(1) autocomplete index using Sets & normalized lookup entries
  // Avoids O(N) full-object scanning on every keystroke
  const autocompleteIndex = useMemo(() => {
    const uniqueMap = new Map<string, AutocompleteSuggestion>();

    const addEntry = (raw: string | undefined, category: AutocompleteSuggestion['category']) => {
      const clean = raw?.trim();
      if (!clean || clean.length < 3) return;
      const key = `${category}:${clean.toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          value: clean,
          label: clean,
          category
        });
      }
    };

    for (const pub of items) {
      addEntry(pub.title, 'título');
      for (const author of pub.authors) addEntry(author, 'autor');
      for (const kw of pub.keywords) addEntry(kw, 'tema');
      if (pub.doi) addEntry(pub.doi, 'doi');
      addEntry(pub.publisher, 'editorial');
    }

    const entries = [...uniqueMap.values()];
    const lowerValues = entries.map((e) => e.value.toLowerCase());
    return { entries, lowerValues };
  }, [items]);

  const getSuggestions = useCallback(
    (rawInput: string): AutocompleteSuggestion[] => {
      const needle = rawInput.trim().toLowerCase();
      if (needle.length < 2) return [];
      const matches: AutocompleteSuggestion[] = [];
      const { entries, lowerValues } = autocompleteIndex;
      for (let i = 0; i < entries.length; i++) {
        if (lowerValues[i].includes(needle)) {
          matches.push(entries[i]);
          if (matches.length >= 8) break;
        }
      }
      return matches;
    },
    [autocompleteIndex]
  );

  // Trigger real-time search against OpenAlex (SciELO filter) + D1 via /api/search
  const searchLiveSciELO = useCallback(async (queryText: string) => {
    const q = queryText.trim();
    if (!q) return;
    setLiveSearching(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ q, perPage: '16' });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: Publication[] };
      const incoming = data.items || [];

      if (incoming.length > 0) {
        let added = 0;
        setItems((prev) => {
          const existingKeys = new Set(prev.map((p) => (p.doi || p.id).toLowerCase()));
          const merged = [...prev];
          for (const pub of incoming) {
            const key = (pub.doi || pub.id).toLowerCase();
            if (!existingKeys.has(key)) {
              existingKeys.add(key);
              merged.unshift(pub);
              added++;
            }
          }
          setLiveCountAdded(added);
          return merged;
        });

        // Best-effort persist newly discovered SciELO works to D1 in background
        void fetch('/api/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publications: incoming.slice(0, 12) })
        }).catch(() => undefined);
      }
    } catch {
      setErrorMessage('Búsqueda en red OpenAlex no disponible en modo local; filtrando catálogo indexado.');
    } finally {
      setLiveSearching(false);
    }
  }, []);

  // Faceted statistics computed from full catalog
  const stats: CatalogStats = useMemo(() => {
    const areaCounts = new Map<OecdAreaId, number>();
    const langCounts = new Map<LanguageCode, number>();
    const typeCounts = new Map<DocumentType, number>();
    const colCounts = new Map<string, { label: string; count: number }>();

    let yearMin = 2026;
    let yearMax = 1990;
    let withPdf = 0;

    for (const p of items) {
      if (p.pdfUrl) withPdf++;
      areaCounts.set(p.oecdArea, (areaCounts.get(p.oecdArea) ?? 0) + 1);
      langCounts.set(p.language, (langCounts.get(p.language) ?? 0) + 1);
      typeCounts.set(p.docType, (typeCounts.get(p.docType) ?? 0) + 1);

      const existingCol = colCounts.get(p.collectionCode);
      colCounts.set(p.collectionCode, {
        label: p.collection,
        count: (existingCol?.count ?? 0) + 1
      });

      if (p.year && p.year >= 1950 && p.year <= 2030) {
        if (p.year < yearMin) yearMin = p.year;
        if (p.year > yearMax) yearMax = p.year;
      }
    }

    return {
      total: items.length,
      withPdf,
      oecdAreas: OECD_AREAS.map((area) => ({
        value: area.id,
        label: area.label,
        count: areaCounts.get(area.id) ?? 0
      })),
      languages: (['es', 'pt', 'en', 'other'] as LanguageCode[])
        .map((code) => ({
          value: code,
          label: LANGUAGE_LABELS[code],
          count: langCounts.get(code) ?? 0
        }))
        .filter((b) => b.count > 0),
      docTypes: (['book', 'chapter', 'article'] as DocumentType[])
        .map((type) => ({
          value: type,
          label: DOCTYPE_LABELS[type],
          count: typeCounts.get(type) ?? 0
        }))
        .filter((b) => b.count > 0),
      collections: [...colCounts.entries()]
        .map(([value, info]) => ({ value, label: info.label, count: info.count }))
        .sort((a, b) => b.count - a.count),
      yearMin: yearMin <= yearMax ? yearMin : 1995,
      yearMax: yearMax >= yearMin ? yearMax : 2026
    };
  }, [items]);

  // Filtered & sorted catalog list using deferred query for zero input lag
  const filteredItems = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const areaSet = new Set(filters.oecdAreas);
    const langSet = new Set(filters.languages);
    const typeSet = new Set(filters.docTypes);
    const colSet = new Set(filters.collections);

    const out = items.filter((p) => {
      if (filters.onlyWithPdf && !p.pdfUrl) return false;
      if (areaSet.size > 0 && !areaSet.has(p.oecdArea)) return false;
      if (langSet.size > 0 && !langSet.has(p.language)) return false;
      if (typeSet.size > 0 && !typeSet.has(p.docType)) return false;
      if (colSet.size > 0 && !colSet.has(p.collectionCode)) return false;
      if (filters.yearFrom !== null && (p.year === null || p.year < filters.yearFrom)) return false;
      if (filters.yearTo !== null && (p.year === null || p.year > filters.yearTo)) return false;

      if (q) {
        const haystack = [
          p.title,
          p.authors.join(' '),
          p.publisher,
          p.doi || '',
          p.isbn || '',
          p.keywords.join(' '),
          p.abstract
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    out.sort((a, b) => {
      if (filters.sortBy === 'year-desc') {
        return (b.year ?? 0) - (a.year ?? 0) || (b.citedByCount ?? 0) - (a.citedByCount ?? 0);
      }
      if (filters.sortBy === 'year-asc') {
        return (a.year ?? 9999) - (b.year ?? 9999);
      }
      if (filters.sortBy === 'citations') {
        return (b.citedByCount ?? 0) - (a.citedByCount ?? 0) || (b.year ?? 0) - (a.year ?? 0);
      }
      if (filters.sortBy === 'title') {
        return a.title.localeCompare(b.title, 'es');
      }
      // Relevance: prioritize PDF availability + query title match + citations
      const aPdf = a.pdfUrl ? 1 : 0;
      const bPdf = b.pdfUrl ? 1 : 0;
      if (q) {
        const aTitle = a.title.toLowerCase().includes(q) ? 2 : 0;
        const bTitle = b.title.toLowerCase().includes(q) ? 2 : 0;
        if (bTitle !== aTitle) return bTitle - aTitle;
      }
      return bPdf - aPdf || (b.citedByCount ?? 0) - (a.citedByCount ?? 0) || (b.year ?? 0) - (a.year ?? 0);
    });

    return out;
  }, [items, deferredQuery, filters]);

  const toggleFacet = useCallback(
    <K extends 'oecdAreas' | 'languages' | 'docTypes' | 'collections'>(
      key: K,
      value: CatalogFilters[K][number]
    ) => {
      setFilters((prev) => {
        const arr = prev[key] as string[];
        const exists = arr.includes(value as string);
        return {
          ...prev,
          [key]: exists ? arr.filter((v) => v !== value) : [...arr, value]
        };
      });
    },
    []
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setLiveCountAdded(0);
  }, []);

  return {
    items,
    filteredItems,
    stats,
    filters,
    setFilters,
    toggleFacet,
    resetFilters,
    loading,
    liveSearching,
    liveCountAdded,
    backendSource,
    errorMessage,
    getSuggestions,
    searchLiveSciELO,
    reloadFromEdge
  };
}
