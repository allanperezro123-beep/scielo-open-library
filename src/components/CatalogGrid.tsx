import { ArrowUpDown, BookMarked, FileImage, LayoutGrid, List, SearchX } from 'lucide-react';
import type { CatalogFilters, Publication } from '../types/publication';
import { BookCard } from './BookCard';

interface CatalogGridProps {
  items: Publication[];
  loading: boolean;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  enableLivePdfRender: boolean;
  onToggleLivePdfRender: () => void;
  sortBy: CatalogFilters['sortBy'];
  onSortChange: (sort: CatalogFilters['sortBy']) => void;
  savedIds: Set<string>;
  onSelect: (pub: Publication) => void;
  onReadPdf: (pub: Publication) => void;
  onQuickSave: (pub: Publication) => void;
  onResetFilters: () => void;
}

export function CatalogGrid({
  items,
  loading,
  viewMode,
  onViewModeChange,
  enableLivePdfRender,
  onToggleLivePdfRender,
  sortBy,
  onSortChange,
  savedIds,
  onSelect,
  onReadPdf,
  onQuickSave,
  onResetFilters
}: CatalogGridProps) {
  return (
    <div className="min-w-0 flex-1">
      {/* Toolbar */}
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border px-3.5 py-2.5"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-hairline)'
        }}
      >
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4" style={{ color: 'var(--accent-crimson)' }} />
          <span className="text-sm font-semibold">
            {items.length} {items.length === 1 ? 'publicación encontrada' : 'publicaciones encontradas'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'grid' && (
            <button
              type="button"
              onClick={onToggleLivePdfRender}
              className="inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors"
              style={{
                borderColor: enableLivePdfRender ? 'var(--accent-crimson)' : 'var(--border-hairline)',
                backgroundColor: enableLivePdfRender ? 'var(--accent-crimson-soft)' : 'var(--bg-surface)',
                color: enableLivePdfRender ? 'var(--accent-crimson)' : 'var(--text-secondary)'
              }}
              title="Renderizar la página 1 real del PDF usando PDF.js en la vista de tarjetas"
            >
              <FileImage className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Portadas PDF.js</span>
            </button>
          )}

          {/* Sort */}
          <div className="relative inline-flex items-center">
            <ArrowUpDown
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5"
              style={{ color: 'var(--text-muted)' }}
            />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as CatalogFilters['sortBy'])}
              className="h-8 rounded border pl-7 pr-2.5 text-xs font-medium outline-none"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)'
              }}
              aria-label="Ordenar resultados"
            >
              <option value="year-desc">Más recientes</option>
              <option value="citations">Más citados</option>
              <option value="relevance">Relevancia / PDF</option>
              <option value="title">Título (A–Z)</option>
              <option value="year-asc">Más antiguos</option>
            </select>
          </div>

          {/* View Switcher */}
          <div
            className="inline-flex rounded border p-0.5"
            style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-surface)' }}
          >
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className="inline-flex h-7 items-center gap-1 rounded-xs px-2 text-xs font-medium transition-colors"
              style={{
                backgroundColor: viewMode === 'grid' ? 'var(--bg-card)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)'
              }}
              aria-label="Vista en cuadrícula"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              className="inline-flex h-7 items-center gap-1 rounded-xs px-2 text-xs font-medium transition-colors"
              style={{
                backgroundColor: viewMode === 'list' ? 'var(--bg-card)' : 'transparent',
                color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)'
              }}
              aria-label="Vista en lista compacta"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading Skeletons (Zero Layout Shift) */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="animate-pulse rounded border p-3"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-hairline)'
              }}
            >
              <div
                className="aspect-[3/4] w-full rounded-[3px]"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              />
              <div className="mt-3 h-3 w-1/3 rounded" style={{ backgroundColor: 'var(--bg-surface)' }} />
              <div className="mt-2 h-4 w-5/6 rounded" style={{ backgroundColor: 'var(--bg-surface)' }} />
              <div className="mt-1.5 h-3 w-2/3 rounded" style={{ backgroundColor: 'var(--bg-surface)' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded border px-6 py-16 text-center"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-hairline)'
          }}
        >
          <SearchX className="mb-3 h-10 w-10" style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-editorial text-lg font-semibold">
            No se encontraron publicaciones con estos filtros
          </h3>
          <p className="mt-1 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
            Prueba limpiar los filtros activos o presiona el botón <strong>Red SciELO</strong> en el
            buscador superior para consultar OpenAlex en vivo.
          </p>
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-4 rounded px-4 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--accent-crimson)', color: '#F8F7F4' }}
          >
            Restablecer todos los filtros
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="flex flex-col gap-2.5">
          {items.map((pub) => (
            <BookCard
              key={pub.id}
              publication={pub}
              viewMode="list"
              enableLivePdfRender={enableLivePdfRender}
              isSaved={savedIds.has(pub.id)}
              onSelect={onSelect}
              onReadPdf={onReadPdf}
              onQuickSave={onQuickSave}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((pub) => (
            <BookCard
              key={pub.id}
              publication={pub}
              viewMode="grid"
              enableLivePdfRender={enableLivePdfRender}
              isSaved={savedIds.has(pub.id)}
              onSelect={onSelect}
              onReadPdf={onReadPdf}
              onQuickSave={onQuickSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
