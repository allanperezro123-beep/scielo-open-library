import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Layers, Sparkles, X } from 'lucide-react';
import { CatalogGrid } from './components/CatalogGrid';
import { FacetSidebar } from './components/FacetSidebar';
import { Header } from './components/Header';
import { PdfReaderModal } from './components/PdfReaderModal';
import { PreviewDrawer } from './components/PreviewDrawer';
import { ShelvesModal } from './components/ShelvesModal';
import { SyncStatusModal } from './components/SyncStatusModal';
import { useCatalog } from './hooks/useCatalog';
import { useShelves } from './hooks/useShelves';
import { OECD_AREA_MAP } from './lib/taxonomy';
import type { Publication } from './types/publication';

export function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('scielo-open-library:theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [enableLivePdfRender, setEnableLivePdfRender] = useState<boolean>(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [readerState, setReaderState] = useState<{ pub: Publication; initialPage: number } | null>(null);
  const [shelvesModalOpen, setShelvesModalOpen] = useState<boolean>(false);
  const [syncModalOpen, setSyncModalOpen] = useState<boolean>(false);

  const catalog = useCatalog();
  const shelvesStore = useShelves();

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('scielo-open-library:theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore
    }
  }, [darkMode]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    for (const areaId of catalog.filters.oecdAreas) {
      chips.push({
        key: `area-${areaId}`,
        label: OECD_AREA_MAP[areaId]?.label || areaId,
        onRemove: () => catalog.toggleFacet('oecdAreas', areaId)
      });
    }
    for (const lang of catalog.filters.languages) {
      chips.push({
        key: `lang-${lang}`,
        label: `Idioma: ${lang.toUpperCase()}`,
        onRemove: () => catalog.toggleFacet('languages', lang)
      });
    }
    for (const dt of catalog.filters.docTypes) {
      chips.push({
        key: `type-${dt}`,
        label: `Tipo: ${dt === 'book' ? 'Libro' : dt === 'chapter' ? 'Capítulo' : 'Artículo'}`,
        onRemove: () => catalog.toggleFacet('docTypes', dt)
      });
    }
    for (const col of catalog.filters.collections) {
      chips.push({
        key: `col-${col}`,
        label: `Colección: ${col}`,
        onRemove: () => catalog.toggleFacet('collections', col)
      });
    }
    if (catalog.filters.yearFrom !== null || catalog.filters.yearTo !== null) {
      chips.push({
        key: 'years',
        label: `Años: ${catalog.filters.yearFrom ?? '…'}–${catalog.filters.yearTo ?? '…'}`,
        onRemove: () =>
          catalog.setFilters((prev) => ({ ...prev, yearFrom: null, yearTo: null }))
      });
    }
    if (catalog.filters.onlyWithPdf) {
      chips.push({
        key: 'pdf',
        label: 'Solo PDF directo',
        onRemove: () => catalog.setFilters((prev) => ({ ...prev, onlyWithPdf: false }))
      });
    }
    return chips;
  }, [catalog]);

  const handleOpenReader = (pub: Publication, initialPage = 1) => {
    setReaderState({ pub, initialPage });
  };

  const handleSaveReadingProgress = (pub: Publication, page: number) => {
    const existing = shelvesStore.getPublicationShelves(pub.id);
    const targetShelfId = existing[0]?.shelfId || 'favorites';
    if (existing.length > 0) {
      void shelvesStore.updateNote(targetShelfId, pub, existing[0].note, page);
    }
  };

  return (
    <div className="archive-texture min-h-screen flex flex-col">
      <Header
        query={catalog.filters.query}
        onQueryChange={(query) => catalog.setFilters((prev) => ({ ...prev, query }))}
        getSuggestions={catalog.getSuggestions}
        onLiveSearch={catalog.searchLiveSciELO}
        liveSearching={catalog.liveSearching}
        liveCountAdded={catalog.liveCountAdded}
        totalCatalog={catalog.stats.total}
        backendSource={catalog.backendSource}
        savedCount={shelvesStore.savedPublicationIds.size}
        onOpenShelves={() => setShelvesModalOpen(true)}
        onOpenSyncModal={() => setSyncModalOpen(true)}
        onToggleMobileFilters={() => setMobileFiltersOpen(true)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />

      {/* Editorial Hero Strip */}
      <section
        className="border-b"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)'
        }}
      >
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="max-w-3xl">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--accent-crimson)' }}>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Acceso Abierto Iberoamericano
              </span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span style={{ color: 'var(--text-muted)' }}>Protocolo OAI-PMH &amp; OpenAlex</span>
            </div>
            <h2 className="font-editorial text-xl font-semibold tracking-tight sm:text-2xl">
              Biblioteca Científica Abierta conectada con SciELO Books y Colecciones Regionales
            </h2>
            <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              Explora monografías académicas, capítulos y artículos arbitrados con taxonomía OCDE/UNESCO,
              citación instantánea (APA 7, IEEE, BibTeX) y lector PDF.js por rangos de bytes en el borde.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div
              className="flex items-center gap-2 rounded border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-hairline)' }}
            >
              <BookOpen className="h-4 w-4" style={{ color: 'var(--accent-crimson)' }} />
              <div>
                <div className="font-code text-sm font-semibold">{catalog.stats.withPdf}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>PDFs legibles</div>
              </div>
            </div>
            <div
              className="flex items-center gap-2 rounded border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-hairline)' }}
            >
              <Layers className="h-4 w-4" style={{ color: 'var(--accent-ochre)' }} />
              <div>
                <div className="font-code text-sm font-semibold">{catalog.stats.collections.length}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Colecciones</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Workspace */}
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <FacetSidebar
          stats={catalog.stats}
          filters={catalog.filters}
          onToggleFacet={catalog.toggleFacet}
          onYearChange={(yearFrom, yearTo) =>
            catalog.setFilters((prev) => ({ ...prev, yearFrom, yearTo }))
          }
          onToggleOnlyPdf={() =>
            catalog.setFilters((prev) => ({ ...prev, onlyWithPdf: !prev.onlyWithPdf }))
          }
          onReset={catalog.resetFilters}
          mobileOpen={mobileFiltersOpen}
          onCloseMobile={() => setMobileFiltersOpen(false)}
        />

        <div className="min-w-0 flex-1">
          {catalog.errorMessage && (
            <div
              className="mb-3 rounded border px-3 py-2 text-xs"
              style={{
                borderColor: 'var(--accent-ochre)',
                backgroundColor: 'rgba(184, 134, 59, 0.12)',
                color: 'var(--text-primary)'
              }}
            >
              {catalog.errorMessage}
            </div>
          )}

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors"
                  style={{
                    borderColor: 'var(--accent-crimson)',
                    backgroundColor: 'var(--accent-crimson-soft)',
                    color: 'var(--accent-crimson)'
                  }}
                >
                  <span>{chip.label}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          <CatalogGrid
            items={catalog.filteredItems}
            loading={catalog.loading}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            enableLivePdfRender={enableLivePdfRender}
            onToggleLivePdfRender={() => setEnableLivePdfRender((v) => !v)}
            sortBy={catalog.filters.sortBy}
            onSortChange={(sortBy) => catalog.setFilters((prev) => ({ ...prev, sortBy }))}
            savedIds={shelvesStore.savedPublicationIds}
            onSelect={(pub) => setSelectedPublication(pub)}
            onReadPdf={(pub) => {
              const savedPage = shelvesStore
                .getPublicationShelves(pub.id)
                .find((i) => i.readingPage > 1)?.readingPage;
              handleOpenReader(pub, savedPage || 1);
            }}
            onQuickSave={(pub) => void shelvesStore.toggleInShelf('favorites', pub)}
            onResetFilters={catalog.resetFilters}
          />
        </div>
      </main>

      <footer
        className="border-t py-4 text-center text-xs"
        style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-muted)' }}
      >
        SciELO Open Library · Infraestructura Edge en Cloudflare Pages + Workers + D1 · Metadatos
        abiertos SciELO OAI-PMH, OPDS y OpenAlex
      </footer>

      {/* Publication Quick Preview Drawer */}
      <PreviewDrawer
        publication={selectedPublication}
        shelves={shelvesStore.shelves}
        publicationShelfItems={
          selectedPublication ? shelvesStore.getPublicationShelves(selectedPublication.id) : []
        }
        onClose={() => setSelectedPublication(null)}
        onOpenReader={(pub, page) => handleOpenReader(pub, page || 1)}
        onToggleShelf={(shelfId, pub) => void shelvesStore.toggleInShelf(shelfId, pub)}
        onSaveNote={(shelfId, pub, note) => void shelvesStore.updateNote(shelfId, pub, note)}
        onKeywordClick={(kw) => catalog.setFilters((prev) => ({ ...prev, query: kw }))}
      />

      {/* Integrated PDF.js Reader Modal */}
      {readerState && (
        <PdfReaderModal
          publication={readerState.pub}
          initialPage={readerState.initialPage}
          onClose={() => setReaderState(null)}
          onPagePersist={(page) => handleSaveReadingProgress(readerState.pub, page)}
        />
      )}

      {/* Shelves & Notes Manager Modal */}
      <ShelvesModal
        open={shelvesModalOpen}
        onClose={() => setShelvesModalOpen(false)}
        shelves={shelvesStore.shelves}
        shelfItems={shelvesStore.shelfItems}
        syncedWithD1={shelvesStore.syncedWithD1}
        onCreateShelf={(name, desc, accent) => void shelvesStore.createShelf(name, desc, accent)}
        onDeleteShelf={(id) => void shelvesStore.deleteShelf(id)}
        onRemoveItem={(shelfId, pub) => void shelvesStore.toggleInShelf(shelfId, pub)}
        onSelectPublication={(pub) => setSelectedPublication(pub)}
        onOpenReader={(pub, page) => handleOpenReader(pub, page || 1)}
        onUpdateNote={(shelfId, pub, note) => void shelvesStore.updateNote(shelfId, pub, note)}
      />

      {/* Edge Sync Diagnostics Modal */}
      <SyncStatusModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        onSyncCompleted={() => void catalog.reloadFromEdge()}
      />
    </div>
  );
}

export default App;
