import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  BookOpenCheck,
  Database,
  Globe2,
  Loader2,
  Moon,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sun,
  X
} from 'lucide-react';
import type { AutocompleteSuggestion } from '../hooks/useCatalog';

interface HeaderProps {
  query: string;
  onQueryChange: (val: string) => void;
  getSuggestions: (val: string) => AutocompleteSuggestion[];
  onLiveSearch: (val: string) => void;
  liveSearching: boolean;
  liveCountAdded: number;
  totalCatalog: number;
  backendSource: 'd1' | 'seed';
  savedCount: number;
  onOpenShelves: () => void;
  onOpenSyncModal: () => void;
  onToggleMobileFilters: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function Header({
  query,
  onQueryChange,
  getSuggestions,
  onLiveSearch,
  liveSearching,
  liveCountAdded,
  totalCatalog,
  backendSource,
  savedCount,
  onOpenShelves,
  onOpenSyncModal,
  onToggleMobileFilters,
  darkMode,
  onToggleDarkMode
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = dropdownOpen ? getSuggestions(query) : [];

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    if (query.trim().length >= 2) {
      onLiveSearch(query);
    }
  };

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{
        backgroundColor: darkMode ? 'rgba(16, 17, 15, 0.88)' : 'rgba(248, 247, 244, 0.88)',
        borderColor: 'var(--border-hairline)'
      }}
    >
      <div className="mx-auto max-w-[1440px] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Editorial Brand */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleMobileFilters}
              className="inline-flex h-9 w-9 items-center justify-center rounded border lg:hidden"
              style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-surface)' }}
              aria-label="Abrir filtros"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded border"
                style={{
                  backgroundColor: 'var(--accent-crimson)',
                  borderColor: 'rgba(24,24,22,0.12)',
                  color: '#F8F7F4'
                }}
              >
                <BookOpenCheck className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-editorial text-lg font-semibold tracking-tight sm:text-xl">
                    SciELO Open Library
                  </h1>
                  <span
                    className="hidden items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider sm:inline-flex"
                    style={{
                      backgroundColor: 'var(--accent-crimson-soft)',
                      color: 'var(--accent-crimson)'
                    }}
                  >
                    <Database className="h-3 w-3" />
                    {backendSource === 'd1' ? 'Edge D1' : 'Catálogo Base'}
                  </span>
                </div>
                <p className="hidden text-xs sm:block" style={{ color: 'var(--text-muted)' }}>
                  Repositorio Académico · SciELO Books OAI-PMH &amp; OpenAlex ({totalCatalog} obras)
                </p>
              </div>
            </div>
          </div>

          {/* Search & Autocomplete Bar */}
          <div ref={containerRef} className="relative order-3 w-full lg:order-2 lg:max-w-xl lg:flex-1">
            <form onSubmit={handleSubmit} className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-3 h-4 w-4"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="search"
                value={query}
                onFocus={() => setDropdownOpen(true)}
                onChange={(e) => {
                  onQueryChange(e.target.value);
                  setDropdownOpen(true);
                  setActiveIndex(-1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIndex((prev) => Math.max(prev - 1, -1));
                  } else if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
                    e.preventDefault();
                    onQueryChange(suggestions[activeIndex].value);
                    setDropdownOpen(false);
                  } else if (e.key === 'Escape') {
                    setDropdownOpen(false);
                  }
                }}
                placeholder="Buscar título, autor, DOI (10.7476/...) o palabra clave..."
                className="h-10 w-full rounded border pl-9 pr-36 text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--text-primary)'
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    onQueryChange('');
                    setDropdownOpen(false);
                  }}
                  className="absolute right-[126px] rounded p-1 hover:opacity-80"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={liveSearching || query.trim().length < 2}
                className="absolute right-1.5 inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-all disabled:opacity-45"
                style={{
                  backgroundColor: 'var(--accent-crimson)',
                  color: '#F8F7F4'
                }}
                title="Consultar también OpenAlex + SciELO en tiempo real"
              >
                {liveSearching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe2 className="h-3.5 w-3.5" />
                )}
                <span>Red SciELO</span>
              </button>
            </form>

            {liveCountAdded > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--accent-moss)' }}>
                <span>+{liveCountAdded} publicaciones nuevas recuperadas en tiempo real desde OpenAlex/SciELO.</span>
              </div>
            )}

            {/* O(1) Autocomplete Dropdown */}
            {dropdownOpen && suggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded border shadow-lg"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-strong)'
                }}
              >
                <div
                  className="border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider"
                  style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-muted)' }}
                >
                  Sugerencias instantáneas del catálogo
                </div>
                <ul className="max-h-64 overflow-y-auto py-1">
                  {suggestions.map((s, idx) => (
                    <li key={`${s.category}-${s.value}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onQueryChange(s.value);
                          setDropdownOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors"
                        style={{
                          backgroundColor: idx === activeIndex ? 'var(--bg-hover)' : 'transparent'
                        }}
                      >
                        <span className="truncate font-medium">{s.label}</span>
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-muted)'
                          }}
                        >
                          {s.category}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="order-2 flex items-center gap-2 lg:order-3">
            <button
              type="button"
              onClick={onOpenSyncModal}
              className="group inline-flex h-9 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)'
              }}
              title="Sincronización OAI-PMH y estado Edge"
            >
              <RefreshCw className="anim-reactive-spin h-3.5 w-3.5" />
              <span className="hidden sm:inline">OAI-PMH</span>
            </button>

            <button
              type="button"
              onClick={onOpenShelves}
              className="inline-flex h-9 items-center gap-1.5 rounded border px-3 text-xs font-medium transition-colors"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)'
              }}
            >
              <Bookmark className="h-3.5 w-3.5" style={{ color: 'var(--accent-crimson)' }} />
              <span>Estanterías</span>
              <span
                className="rounded px-1.5 py-0.5 font-code text-[11px]"
                style={{
                  backgroundColor: 'var(--accent-crimson-soft)',
                  color: 'var(--accent-crimson)'
                }}
              >
                {savedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="inline-flex h-9 w-9 items-center justify-center rounded border transition-colors"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)'
              }}
              aria-label={darkMode ? 'Cambiar a modo papel claro' : 'Cambiar a modo archivo oscuro'}
              title={darkMode ? 'Modo papel claro' : 'Modo archivo nocturno'}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
