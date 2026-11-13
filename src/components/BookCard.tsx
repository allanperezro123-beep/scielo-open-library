import { memo } from 'react';
import { Bookmark, BookOpen, Eye, FileText, Quote } from 'lucide-react';
import { OECD_AREA_MAP } from '../lib/taxonomy';
import type { Publication } from '../types/publication';
import { PdfCoverThumbnail } from './PdfCoverThumbnail';

interface BookCardProps {
  publication: Publication;
  viewMode: 'grid' | 'list';
  enableLivePdfRender: boolean;
  isSaved: boolean;
  onSelect: (pub: Publication) => void;
  onReadPdf: (pub: Publication) => void;
  onQuickSave: (pub: Publication) => void;
}

const DOC_TYPE_LABEL: Record<Publication['docType'], string> = {
  book: 'Libro',
  chapter: 'Capítulo',
  article: 'Artículo'
};

export const BookCard = memo(function BookCard({
  publication,
  viewMode,
  enableLivePdfRender,
  isSaved,
  onSelect,
  onReadPdf,
  onQuickSave
}: BookCardProps) {
  const area = OECD_AREA_MAP[publication.oecdArea];
  const authorsText =
    publication.authors.length > 0
      ? publication.authors.slice(0, 3).join('; ') + (publication.authors.length > 3 ? ' et al.' : '')
      : publication.publisher;

  if (viewMode === 'list') {
    return (
      <article
        className="group flex flex-col justify-between gap-3 rounded border p-3.5 transition-all duration-200 sm:flex-row sm:items-center"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-hairline)',
          transitionTimingFunction: 'var(--ease-glide)'
        }}
      >
        <div
          onClick={() => onSelect(publication)}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3.5"
        >
          <div
            className="mt-1 h-11 w-1.5 shrink-0 rounded-xs"
            style={{ backgroundColor: area.accent }}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span
                className="rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide"
                style={{ backgroundColor: `${area.accent}1A`, color: area.accent }}
              >
                {DOC_TYPE_LABEL[publication.docType]}
              </span>
              <span className="font-code uppercase" style={{ color: 'var(--text-muted)' }}>
                {publication.language}
              </span>
              {publication.year && (
                <span className="font-code" style={{ color: 'var(--text-muted)' }}>
                  · {publication.year}
                </span>
              )}
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                · {publication.collection}
              </span>
              {publication.citedByCount ? (
                <span className="inline-flex items-center gap-1 font-code" style={{ color: 'var(--accent-ochre)' }}>
                  · <Quote className="h-3 w-3" /> {publication.citedByCount}
                </span>
              ) : null}
            </div>
            <h3 className="font-editorial line-clamp-1 text-base font-semibold group-hover:underline">
              {publication.title}
            </h3>
            <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {authorsText} — <span style={{ color: 'var(--text-muted)' }}>{publication.publisher}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
          <button
            type="button"
            onClick={() => onQuickSave(publication)}
            className="inline-flex h-8 w-8 items-center justify-center rounded border transition-colors"
            style={{
              borderColor: isSaved ? 'var(--accent-crimson)' : 'var(--border-hairline)',
              backgroundColor: isSaved ? 'var(--accent-crimson-soft)' : 'var(--bg-surface)',
              color: isSaved ? 'var(--accent-crimson)' : 'var(--text-secondary)'
            }}
            title={isSaved ? 'Guardado en estantería' : 'Guardar en Lecturas Esenciales'}
          >
            <Bookmark className="h-3.5 w-3.5" fill={isSaved ? 'currentColor' : 'none'} />
          </button>

          <button
            type="button"
            onClick={() => onSelect(publication)}
            className="inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors"
            style={{
              borderColor: 'var(--border-hairline)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)'
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Ficha</span>
          </button>

          {publication.pdfUrl && (
            <button
              type="button"
              onClick={() => onReadPdf(publication)}
              className="inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'var(--accent-crimson)',
                color: '#F8F7F4'
              }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Leer PDF</span>
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className="group flex flex-col overflow-hidden rounded border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-hairline)',
        transitionTimingFunction: 'var(--ease-glide)'
      }}
    >
      {/* Cover Area */}
      <div onClick={() => onSelect(publication)} className="relative cursor-pointer p-3 pb-0">
        <PdfCoverThumbnail
          publication={publication}
          enableLivePdfRender={enableLivePdfRender}
          className="aspect-[3/4] w-full rounded-[3px]"
        />

        {/* Floating top badges */}
        <div className="pointer-events-none absolute left-5 top-5 flex flex-wrap gap-1">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow-xs backdrop-blur-xs"
            style={{
              backgroundColor: 'rgba(24, 24, 22, 0.78)',
              color: '#F8F7F4'
            }}
          >
            {DOC_TYPE_LABEL[publication.docType]}
          </span>
          {publication.pdfUrl && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-code text-[10px] font-medium shadow-xs"
              style={{
                backgroundColor: 'var(--accent-crimson)',
                color: '#F8F7F4'
              }}
            >
              <FileText className="h-2.5 w-2.5" /> PDF
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickSave(publication);
          }}
          className="absolute right-5 top-5 inline-flex h-7 w-7 items-center justify-center rounded border shadow-xs backdrop-blur-xs transition-colors"
          style={{
            borderColor: isSaved ? 'var(--accent-crimson)' : 'rgba(248, 247, 244, 0.35)',
            backgroundColor: isSaved ? 'var(--accent-crimson)' : 'rgba(24, 24, 22, 0.65)',
            color: '#F8F7F4'
          }}
          title={isSaved ? 'Guardado en estantería' : 'Guardar en estantería'}
          aria-label="Guardar en estantería"
        >
          <Bookmark className="h-3.5 w-3.5" fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Metadata Body */}
      <div className="flex flex-1 flex-col justify-between p-3.5">
        <div onClick={() => onSelect(publication)} className="cursor-pointer">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span
              className="truncate font-semibold uppercase tracking-wider"
              style={{ color: area.accent }}
            >
              {publication.oecdAreaLabel}
            </span>
            <span className="shrink-0 font-code uppercase" style={{ color: 'var(--text-muted)' }}>
              {publication.language} {publication.year ? `· ${publication.year}` : ''}
            </span>
          </div>

          <h3 className="font-editorial line-clamp-2 text-[15px] font-semibold leading-snug group-hover:underline">
            {publication.title}
          </h3>

          <p className="mt-1 line-clamp-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {authorsText}
          </p>
        </div>

        {/* Footer CTA bar */}
        <div
          className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <button
            type="button"
            onClick={() => onSelect(publication)}
            className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Vista previa</span>
          </button>

          {publication.pdfUrl ? (
            <button
              type="button"
              onClick={() => onReadPdf(publication)}
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'var(--accent-crimson)',
                color: '#F8F7F4'
              }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Leer</span>
            </button>
          ) : (
            <a
              href={publication.scieloUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium underline"
              style={{ color: 'var(--accent-ochre)' }}
            >
              Ver en SciELO
            </a>
          )}
        </div>
      </div>
    </article>
  );
});
