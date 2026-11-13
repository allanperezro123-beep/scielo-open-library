import { useEffect, useRef, useState } from 'react';
import { buildCoverProxyUrl, buildPdfProxyUrl, pdfjsLib, pdfThumbnailQueue } from '../lib/pdfWorker';
import { OECD_AREA_MAP } from '../lib/taxonomy';
import type { Publication } from '../types/publication';

interface PdfCoverThumbnailProps {
  publication: Publication;
  enableLivePdfRender: boolean;
  className?: string;
}

export function PdfCoverThumbnail({
  publication,
  enableLivePdfRender,
  className = ''
}: PdfCoverThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [pdfRendered, setPdfRendered] = useState(false);

  const areaDef = OECD_AREA_MAP[publication.oecdArea];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Optionally render Page 1 directly from the PDF via byte-range request
  const shouldRenderPdf =
    visible &&
    Boolean(publication.pdfUrl) &&
    (enableLivePdfRender || (!publication.coverUrl && publication.docType === 'book'));

  useEffect(() => {
    if (!shouldRenderPdf || !publication.pdfUrl || pdfRendered) return;
    let cancelled = false;

    void pdfThumbnailQueue.enqueue(async () => {
      if (cancelled) return;
      const proxiedUrl = buildPdfProxyUrl(publication.pdfUrl!);
      let loadingTask = pdfjsLib.getDocument({
        url: proxiedUrl,
        rangeChunkSize: 65536,
        disableAutoFetch: true,
        disableStream: false
      });

      let pdfDoc;
      try {
        pdfDoc = await loadingTask.promise;
      } catch {
        // Fallback direct URL if local Vite dev has no /api/pdf-proxy and origin allows CORS
        if (publication.pdfUrl!.includes('books.scielo.org')) {
          loadingTask = pdfjsLib.getDocument({
            url: publication.pdfUrl!.replace(/^http:\/\//i, 'https://'),
            rangeChunkSize: 65536,
            disableAutoFetch: true
          });
          pdfDoc = await loadingTask.promise;
        } else {
          return;
        }
      }

      if (cancelled) {
        await loadingTask.destroy();
        return;
      }

      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 0.45 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) {
        await loadingTask.destroy();
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setPdfRendered(true);
      }
      await loadingTask.destroy();
    });

    return () => {
      cancelled = true;
    };
  }, [shouldRenderPdf, publication.pdfUrl, pdfRendered]);

  const coverImgSrc = publication.coverUrl ? buildCoverProxyUrl(publication.coverUrl) : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden border ${className}`}
      style={{
        borderColor: 'var(--border-hairline)',
        backgroundColor: 'var(--bg-surface)'
      }}
    >
      {/* 1. Rendered PDF Page 1 Canvas (when active) */}
      <canvas
        ref={canvasRef}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          pdfRendered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 2. Official SciELO Cover Thumbnail (when available and PDF canvas not yet overriding) */}
      {!pdfRendered && coverImgSrc && !imgFailed && (
        <img
          src={coverImgSrc}
          alt={publication.title}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      )}

      {/* 3. Dynamic Editorial Cover Fallback */}
      {!pdfRendered && (!coverImgSrc || imgFailed) && (
        <div
          className="absolute inset-0 flex flex-col justify-between p-3.5"
          style={{
            background: `linear-gradient(155deg, ${areaDef.accent}18 0%, var(--bg-surface) 58%, ${areaDef.accent}10 100%)`,
            borderLeft: `4px solid ${areaDef.accent}`
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="truncate text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: areaDef.accent }}
            >
              {publication.publisher}
            </span>
            {publication.year && (
              <span className="font-code text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {publication.year}
              </span>
            )}
          </div>

          <div className="my-auto py-2">
            <div
              className="mb-2 h-[1px] w-8"
              style={{ backgroundColor: areaDef.accent, opacity: 0.6 }}
            />
            <p className="font-editorial line-clamp-4 text-sm font-semibold leading-snug">
              {publication.title}
            </p>
          </div>

          <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <span className="truncate">
              {publication.authors[0] || publication.collection}
            </span>
            <span className="font-code uppercase">{publication.language}</span>
          </div>
        </div>
      )}
    </div>
  );
}
