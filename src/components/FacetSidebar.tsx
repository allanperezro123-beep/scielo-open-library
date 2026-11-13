import { RotateCcw, X } from 'lucide-react';
import { OECD_AREA_MAP } from '../lib/taxonomy';
import type {
  CatalogFilters,
  CatalogStats,
  DocumentType,
  LanguageCode,
  OecdAreaId
} from '../types/publication';

interface FacetSidebarProps {
  stats: CatalogStats;
  filters: CatalogFilters;
  onToggleFacet: <K extends 'oecdAreas' | 'languages' | 'docTypes' | 'collections'>(
    key: K,
    value: CatalogFilters[K][number]
  ) => void;
  onYearChange: (from: number | null, to: number | null) => void;
  onToggleOnlyPdf: () => void;
  onReset: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function FacetSidebar({
  stats,
  filters,
  onToggleFacet,
  onYearChange,
  onToggleOnlyPdf,
  onReset,
  mobileOpen,
  onCloseMobile
}: FacetSidebarProps) {
  const activeFilterCount =
    filters.oecdAreas.length +
    filters.languages.length +
    filters.docTypes.length +
    filters.collections.length +
    (filters.yearFrom !== null ? 1 : 0) +
    (filters.yearTo !== null ? 1 : 0) +
    (filters.onlyWithPdf ? 1 : 0);

  const content = (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-hairline)' }}>
        <div>
          <h2 className="font-editorial text-base font-semibold">Filtros Taxonómicos</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Clasificación OCDE / UNESCO y facetas
          </p>
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'var(--accent-crimson-soft)',
              color: 'var(--accent-crimson)'
            }}
          >
            <RotateCcw className="h-3 w-3" />
            <span>Limpiar ({activeFilterCount})</span>
          </button>
        )}
      </div>

      {/* Only PDF available switch */}
      <label
        className="flex cursor-pointer items-center justify-between rounded border px-3 py-2.5 transition-colors"
        style={{
          borderColor: filters.onlyWithPdf ? 'var(--accent-crimson)' : 'var(--border-hairline)',
          backgroundColor: filters.onlyWithPdf ? 'var(--accent-crimson-soft)' : 'var(--bg-surface)'
        }}
      >
        <div>
          <div className="text-xs font-semibold">Solo lectura inmediata (PDF)</div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {stats.withPdf} documentos con PDF abierto
          </div>
        </div>
        <input
          type="checkbox"
          checked={filters.onlyWithPdf}
          onChange={onToggleOnlyPdf}
          className="h-4 w-4 accent-[#9E2A2B]"
        />
      </label>

      {/* OECD / UNESCO Areas */}
      <section>
        <h3
          className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Área Temática (OCDE / UNESCO)
        </h3>
        <div className="flex flex-col gap-1">
          {stats.oecdAreas.map((bucket) => {
            const areaId = bucket.value as OecdAreaId;
            const def = OECD_AREA_MAP[areaId];
            const selected = filters.oecdAreas.includes(areaId);
            return (
              <button
                key={bucket.value}
                type="button"
                onClick={() => onToggleFacet('oecdAreas', areaId)}
                className="flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors"
                style={{
                  backgroundColor: selected ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: `3px solid ${selected ? def.accent : 'transparent'}`
                }}
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: def.accent }}
                  />
                  <span className={selected ? 'font-semibold' : ''}>{bucket.label}</span>
                </span>
                <span className="font-code text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {bucket.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Document Type */}
      <section>
        <h3
          className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Tipo de Documento
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {stats.docTypes.map((bucket) => {
            const typeVal = bucket.value as DocumentType;
            const selected = filters.docTypes.includes(typeVal);
            return (
              <button
                key={bucket.value}
                type="button"
                onClick={() => onToggleFacet('docTypes', typeVal)}
                className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors"
                style={{
                  borderColor: selected ? 'var(--accent-crimson)' : 'var(--border-hairline)',
                  backgroundColor: selected ? 'var(--accent-crimson-soft)' : 'var(--bg-surface)',
                  color: selected ? 'var(--accent-crimson)' : 'var(--text-secondary)'
                }}
              >
                <span>{bucket.label}</span>
                <span className="font-code text-[10px] opacity-75">{bucket.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Language */}
      <section>
        <h3
          className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Idioma de Publicación
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {stats.languages.map((bucket) => {
            const langVal = bucket.value as LanguageCode;
            const selected = filters.languages.includes(langVal);
            return (
              <button
                key={bucket.value}
                type="button"
                onClick={() => onToggleFacet('languages', langVal)}
                className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors"
                style={{
                  borderColor: selected ? 'var(--accent-crimson)' : 'var(--border-hairline)',
                  backgroundColor: selected ? 'var(--accent-crimson-soft)' : 'var(--bg-surface)',
                  color: selected ? 'var(--accent-crimson)' : 'var(--text-secondary)'
                }}
              >
                <span>{bucket.label}</span>
                <span className="font-code text-[10px] opacity-75">{bucket.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Year Range */}
      <section>
        <h3
          className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Año de Publicación
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Desde
            </label>
            <input
              type="number"
              min={stats.yearMin}
              max={stats.yearMax}
              value={filters.yearFrom ?? ''}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                onYearChange(Number.isNaN(v) ? null : v, filters.yearTo);
              }}
              placeholder={String(stats.yearMin)}
              className="h-8 w-full rounded border px-2 font-code text-xs outline-none"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Hasta
            </label>
            <input
              type="number"
              min={stats.yearMin}
              max={stats.yearMax}
              value={filters.yearTo ?? ''}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                onYearChange(filters.yearFrom, Number.isNaN(v) ? null : v);
              }}
              placeholder={String(stats.yearMax)}
              className="h-8 w-full rounded border px-2 font-code text-xs outline-none"
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { label: '2020–Hoy', from: 2020, to: null },
            { label: '2015–2019', from: 2015, to: 2019 },
            { label: '≤ 2014', from: null, to: 2014 }
          ].map((preset) => {
            const active = filters.yearFrom === preset.from && filters.yearTo === preset.to;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  onYearChange(active ? null : preset.from, active ? null : preset.to)
                }
                className="rounded border px-2 py-0.5 font-code text-[11px] transition-colors"
                style={{
                  borderColor: active ? 'var(--accent-crimson)' : 'var(--border-hairline)',
                  backgroundColor: active ? 'var(--accent-crimson-soft)' : 'transparent',
                  color: active ? 'var(--accent-crimson)' : 'var(--text-muted)'
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* SciELO Collection */}
      <section>
        <h3
          className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Colección SciELO
        </h3>
        <div className="flex flex-col gap-1">
          {stats.collections.map((bucket) => {
            const selected = filters.collections.includes(bucket.value);
            return (
              <button
                key={bucket.value}
                type="button"
                onClick={() => onToggleFacet('collections', bucket.value)}
                className="flex items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors"
                style={{
                  backgroundColor: selected ? 'var(--bg-hover)' : 'transparent',
                  color: selected ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                <span className={selected ? 'font-semibold' : ''}>{bucket.label}</span>
                <span className="font-code text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {bucket.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside
        className="hidden w-72 shrink-0 rounded border p-4 lg:block lg:self-start"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-hairline)'
        }}
      >
        {content}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={onCloseMobile} />
          <div
            className="relative z-10 h-full w-80 max-w-[85vw] overflow-y-auto border-r p-4 shadow-xl"
            style={{
              backgroundColor: 'var(--bg-page)',
              borderColor: 'var(--border-hairline)'
            }}
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={onCloseMobile}
                className="inline-flex h-8 w-8 items-center justify-center rounded border"
                style={{ borderColor: 'var(--border-hairline)' }}
                aria-label="Cerrar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
