import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  Moon,
  PanelLeft,
  Search,
  Sun,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { buildPdfProxyUrl, pdfjsLib } from '../lib/pdfWorker';
import type { Publication } from '../types/publication';

interface PdfReaderModalProps {
  publication: Publication;
  initialPage?: number;
  onClose: () => void;
  onPagePersist?: (page: number) => void;
}

interface ThumbnailTileProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  isActive: boolean;
  isMatch: boolean;
  onSelect: (page: number) => void;
}

function ThumbnailTile({ pdfDoc, pageNumber, isActive, isMatch, onSelect }: ThumbnailTileProps) {
  const tileRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = tileRef.current;
    if (!el || rendered) return;
    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();

        void (async () => {
          try {
            const page = await pdfDoc.getPage(pageNumber);
            if (cancelled) return;
            const viewport = page.getViewport({ scale: 0.22 });
            const canvas = canvasRef.current;
            if (!canvas || cancelled) return;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
            if (!cancelled) setRendered(true);
          } catch {
            // Ignore cancelled thumbnail render
          }
        })();
      },
      { rootMargin: '150px' }
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pdfDoc, pageNumber, rendered]);

  return (
    <button
      ref={tileRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      className="group flex w-full flex-col items-center gap-1 rounded border p-1.5 transition-all"
      style={{
        borderColor: isActive ? '#C94A4B' : isMatch ? '#B8863B' : 'rgba(237,234,228,0.12)',
        backgroundColor: isActive ? 'rgba(201, 74, 75, 0.16)' : 'rgba(255,255,255,0.03)'
      }}
    >
      <div className="relative flex w-full items-center justify-center overflow-hidden rounded-[2px] bg-[#242521] min-h-[84px]">
        <canvas ref={canvasRef} className="max-w-full h-auto block" />
        {!rendered && (
          <span className="font-code text-[10px] text-[#86827A]">{pageNumber}</span>
        )}
      </div>
      <div className="flex w-full items-center justify-between px-1 font-code text-[10px] text-[#B9B5AC]">
        <span>p. {pageNumber}</span>
        {isMatch && <span className="rounded bg-[#B8863B]/25 px-1 text-[#E6B86A]">coinc.</span>}
      </div>
    </button>
  );
}

export function PdfReaderModal({
  publication,
  initialPage = 1,
  onClose,
  onPagePersist
}: PdfReaderModalProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [scale, setScale] = useState(1.2);
  const [nightMode, setNightMode] = useState(true);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total?: number }>({ loaded: 0 });
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [renderingPage, setRenderingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Internal Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingText, setSearchingText] = useState(false);
  const [matchPages, setMatchPages] = useState<number[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const [searchTermActive, setSearchTermActive] = useState('');

  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const activeTaskRef = useRef<PDFDocumentLoadingTask | null>(null);

  // Load PDF document via Cloudflare Edge proxy with byte-range streaming
  useEffect(() => {
    if (!publication.pdfUrl) {
      setError('Esta publicación no expone una URL de PDF directa.');
      setLoadingPdf(false);
      return;
    }

    let cancelled = false;
    setLoadingPdf(true);
    setError(null);
    setLoadProgress({ loaded: 0 });

    const load = async () => {
      const proxiedUrl = buildPdfProxyUrl(publication.pdfUrl!);

      const openDoc = (url: string) => {
        const task = pdfjsLib.getDocument({
          url,
          rangeChunkSize: 65536,
          disableAutoFetch: true,
          disableStream: false
        });
        activeTaskRef.current = task;
        task.onProgress = (prog: { loaded: number; total: number }) => {
          if (!cancelled) {
            setLoadProgress({ loaded: prog.loaded, total: prog.total || undefined });
          }
        };
        return task;
      };

      try {
        let task = openDoc(proxiedUrl);
        let doc: PDFDocumentProxy;
        try {
          doc = await task.promise;
        } catch (proxyErr) {
          // If pure Vite dev (no Pages Functions) and origin supports CORS directly
          if (publication.pdfUrl!.includes('books.scielo.org')) {
            await task.destroy().catch(() => undefined);
            task = openDoc(publication.pdfUrl!.replace(/^http:\/\//i, 'https://'));
            doc = await task.promise;
          } else {
            throw proxyErr;
          }
        }

        if (cancelled) {
          await task.destroy();
          return;
        }

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        const safePage = Math.max(1, Math.min(initialPage, doc.numPages));
        setCurrentPage(safePage);
        setPageInput(String(safePage));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `No fue posible transmitir el PDF directamente (${err.message}).`
              : 'No fue posible abrir el documento PDF.'
          );
        }
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (activeTaskRef.current) {
        void activeTaskRef.current.destroy().catch(() => undefined);
        activeTaskRef.current = null;
      }
    };
  }, [publication.pdfUrl, initialPage]);

  // Render active page + TextLayer + search highlight marks
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    const renderActivePage = async () => {
      setRenderingPage(true);
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = page.render({
          canvasContext: ctx,
          viewport,
          canvas
        });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        // Render synchronized TextLayer for selection & search highlighting
        textContainer.innerHTML = '';
        textContainer.style.width = `${Math.floor(viewport.width)}px`;
        textContainer.style.height = `${Math.floor(viewport.height)}px`;
        textContainer.style.setProperty('--scale-factor', String(scale));

        const textContent = await page.getTextContent();
        if (cancelled) return;

        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport
        });
        await textLayer.render();

        if (!cancelled && searchTermActive) {
          const needle = searchTermActive.toLowerCase();
          for (const span of textLayer.textDivs) {
            const raw = span.textContent || '';
            const idx = raw.toLowerCase().indexOf(needle);
            if (idx >= 0) {
              const before = raw.slice(0, idx);
              const hit = raw.slice(idx, idx + needle.length);
              const after = raw.slice(idx + needle.length);
              span.textContent = '';
              if (before) span.append(document.createTextNode(before));
              const mark = document.createElement('mark');
              mark.className = 'pdf-match';
              mark.textContent = hit;
              span.append(mark);
              if (after) span.append(document.createTextNode(after));
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          // Non-fatal render glitch
        }
      } finally {
        if (!cancelled) setRenderingPage(false);
      }
    };

    void renderActivePage();
    onPagePersist?.(currentPage);
    setPageInput(String(currentPage));

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, scale, searchTermActive, onPagePersist]);

  const goToPage = useCallback(
    (p: number) => {
      if (numPages <= 0) return;
      const clamped = Math.max(1, Math.min(p, numPages));
      setCurrentPage(clamped);
      viewportContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [numPages]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        document.activeElement?.tagName !== 'INPUT' &&
        (e.key === 'ArrowRight' || e.key === 'PageDown')
      ) {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (
        document.activeElement?.tagName !== 'INPUT' &&
        (e.key === 'ArrowLeft' || e.key === 'PageUp')
      ) {
        e.preventDefault();
        goToPage(currentPage - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goToPage, currentPage]);

  const handleFitWidth = async () => {
    if (!pdfDoc || !viewportContainerRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    const unscaled = page.getViewport({ scale: 1 });
    const avail = viewportContainerRef.current.clientWidth - 48;
    if (avail > 100) {
      setScale(Math.max(0.5, Math.min(2.4, Number((avail / unscaled.width).toFixed(2)))));
    }
  };

  // Search across PDF pages cleanly
  const handleTextSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchQuery.trim();
    if (!pdfDoc || term.length < 2) {
      setMatchPages([]);
      setSearchTermActive('');
      return;
    }

    setSearchingText(true);
    setSearchTermActive(term);
    const needle = term.toLowerCase();
    const hits: number[] = [];

    try {
      const maxScan = Math.min(pdfDoc.numPages, 250);
      for (let i = 1; i <= maxScan; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .toLowerCase();
        if (pageText.includes(needle)) {
          hits.push(i);
        }
      }
      setMatchPages(hits);
      if (hits.length > 0) {
        setActiveMatchIdx(0);
        goToPage(hits[0]);
      }
    } finally {
      setSearchingText(false);
    }
  };

  const stepMatch = (delta: number) => {
    if (matchPages.length === 0) return;
    const nextIdx = (activeMatchIdx + delta + matchPages.length) % matchPages.length;
    setActiveMatchIdx(nextIdx);
    goToPage(matchPages[nextIdx]);
  };

  const progressPct =
    loadProgress.total && loadProgress.total > 0
      ? Math.min(100, Math.round((loadProgress.loaded / loadProgress.total) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: nightMode ? '#10110F' : '#EAE7E0', color: nightMode ? '#EDEAE4' : '#181816' }}
      role="dialog"
      aria-label={`Lector PDF: ${publication.title}`}
    >
      {/* Top Reader Toolbar */}
      <header
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4"
        style={{
          backgroundColor: '#161714',
          borderColor: 'rgba(237, 234, 228, 0.12)',
          color: '#EDEAE4'
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowThumbnails((s) => !s)}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-white/5 hover:bg-white/10"
            title="Mostrar/ocultar miniaturas"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 max-w-xs sm:max-w-md">
            <h2 className="font-editorial truncate text-sm font-semibold">{publication.title}</h2>
            <p className="truncate text-[11px] text-[#B9B5AC]">
              {publication.authors[0] || publication.publisher} · {publication.collection}
            </p>
          </div>
        </div>

        {/* Center Page & Zoom Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded border border-white/15 bg-white/5 px-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="p-1.5 disabled:opacity-35"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = Number.parseInt(pageInput, 10);
                if (!Number.isNaN(parsed)) goToPage(parsed);
              }}
              className="flex items-center gap-1 px-1 font-code text-xs"
            >
              <input
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                className="w-10 rounded bg-black/30 px-1 py-0.5 text-center text-xs outline-none"
                aria-label="Número de página"
              />
              <span className="text-[#86827A]">/ {numPages || '—'}</span>
            </form>
            <button
              type="button"
              disabled={numPages === 0 || currentPage >= numPages}
              onClick={() => goToPage(currentPage + 1)}
              className="p-1.5 disabled:opacity-35"
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center rounded border border-white/15 bg-white/5 px-1">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.15).toFixed(2))))}
              className="p-1.5"
              title="Alejar"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-11 text-center font-code text-[11px]">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.4, Number((s + 0.15).toFixed(2))))}
              className="p-1.5"
              title="Acercar"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleFitWidth()}
              className="p-1.5 text-[#B9B5AC] hover:text-white"
              title="Ajustar al ancho"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Internal Search, Nocturnal Toggle, Download & Close */}
        <div className="flex flex-wrap items-center gap-1.5">
          <form onSubmit={handleTextSearch} className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[#86827A]" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en el PDF (Ctrl+F)..."
              className="h-8 w-44 rounded border border-white/15 bg-black/25 pl-7 pr-2 text-xs text-[#EDEAE4] outline-none sm:w-52"
            />
            {searchingText && <Loader2 className="ml-1.5 h-3.5 w-3.5 animate-spin text-[#B8863B]" />}
            {!searchingText && matchPages.length > 0 && (
              <div className="ml-1 flex items-center gap-0.5 font-code text-[11px] text-[#E6B86A]">
                <button type="button" onClick={() => stepMatch(-1)} className="px-1 hover:bg-white/10 rounded">
                  ‹
                </button>
                <span>
                  {activeMatchIdx + 1}/{matchPages.length}
                </span>
                <button type="button" onClick={() => stepMatch(1)} className="px-1 hover:bg-white/10 rounded">
                  ›
                </button>
              </div>
            )}
          </form>

          <button
            type="button"
            onClick={() => setNightMode((n) => !n)}
            className="inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium"
            style={{
              borderColor: nightMode ? '#B8863B' : 'rgba(255,255,255,0.18)',
              backgroundColor: nightMode ? 'rgba(184, 134, 59, 0.18)' : 'rgba(255,255,255,0.06)',
              color: nightMode ? '#E6B86A' : '#EDEAE4'
            }}
            title="Alternar modo lectura nocturna"
          >
            {nightMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{nightMode ? 'Nocturno' : 'Papel'}</span>
          </button>

          {publication.pdfUrl && (
            <a
              href={publication.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-white/5 hover:bg-white/10"
              title="Descargar / abrir PDF original"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-[#9E2A2B] text-white hover:opacity-90"
            aria-label="Cerrar lector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Split-View Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left Thumbnail Rail */}
        {showThumbnails && pdfDoc && (
          <aside className="hidden w-44 shrink-0 overflow-y-auto border-r border-white/10 bg-[#151613] p-2.5 sm:block">
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-[#86827A]">
              Páginas ({numPages})
            </div>
            <div className="flex flex-col gap-2">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <ThumbnailTile
                  key={pageNum}
                  pdfDoc={pdfDoc}
                  pageNumber={pageNum}
                  isActive={pageNum === currentPage}
                  isMatch={matchPages.includes(pageNum)}
                  onSelect={goToPage}
                />
              ))}
            </div>
          </aside>
        )}

        {/* Active PDF Viewport */}
        <div
          ref={viewportContainerRef}
          className="relative flex flex-1 items-start justify-center overflow-auto p-4 sm:p-6"
        >
          {loadingPdf && (
            <div className="my-auto flex max-w-md flex-col items-center rounded border border-white/15 bg-[#1A1B18] p-6 text-center text-[#EDEAE4]">
              <Loader2 className="mb-3 h-7 w-7 animate-spin text-[#C94A4B]" />
              <p className="font-editorial text-base font-medium">
                Transmitiendo documento desde Edge Cache...
              </p>
              <p className="mt-1 font-code text-xs text-[#B9B5AC]">
                {progressPct !== null
                  ? `Carga progresiva por rangos: ${progressPct}%`
                  : `${Math.round(loadProgress.loaded / 1024)} KB recibidos`}
              </p>
            </div>
          )}

          {error && !loadingPdf && (
            <div className="my-auto max-w-md rounded border border-[#B8863B]/40 bg-[#1A1B18] p-6 text-center text-[#EDEAE4]">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-[#E6B86A]" />
              <h3 className="font-editorial text-lg font-semibold">
                El portal origen restringió la lectura embebida
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#B9B5AC]">{error}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {publication.pdfUrl && (
                  <a
                    href={publication.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded bg-[#9E2A2B] px-3.5 py-2 text-xs font-semibold text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Abrir PDF directo</span>
                  </a>
                )}
                <a
                  href={publication.scieloUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border border-white/20 px-3.5 py-2 text-xs font-medium text-[#EDEAE4]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Ver en SciELO</span>
                </a>
              </div>
            </div>
          )}

          {!loadingPdf && !error && (
            <div className="relative shadow-2xl">
              {renderingPage && (
                <div className="pointer-events-none absolute right-2 top-2 z-20 rounded bg-black/70 px-2 py-1 text-[10px] text-white">
                  Renderizando pág. {currentPage}...
                </div>
              )}
              <canvas
                ref={canvasRef}
                className={`block rounded-[2px] bg-[#FBF9F5] ${nightMode ? 'pdf-night-canvas' : ''}`}
              />
              <div ref={textLayerRef} className="pdf-text-layer" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
