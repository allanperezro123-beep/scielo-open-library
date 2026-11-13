import { useEffect, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Quote,
  StickyNote,
  Tag,
  X
} from 'lucide-react';
import { formatCitation } from '../lib/citations';
import { OECD_AREA_MAP } from '../lib/taxonomy';
import type { CitationFormat, Publication, Shelf, ShelfItem } from '../types/publication';
import { PdfCoverThumbnail } from './PdfCoverThumbnail';

interface PreviewDrawerProps {
  publication: Publication | null;
  shelves: Shelf[];
  publicationShelfItems: ShelfItem[];
  onClose: () => void;
  onOpenReader: (pub: Publication, initialPage?: number) => void;
  onToggleShelf: (shelfId: string, pub: Publication) => void;
  onSaveNote: (shelfId: string, pub: Publication, note: string) => void;
  onKeywordClick: (kw: string) => void;
}

const CITATION_TABS: Array<{ id: CitationFormat; label: string }> = [
  { id: 'apa7', label: 'APA 7' },
  { id: 'ieee', label: 'IEEE' },
  { id: 'bibtex', label: 'BibTeX' }
];

export function PreviewDrawer({
  publication,
  shelves,
  publicationShelfItems,
  onClose,
  onOpenReader,
  onToggleShelf,
  onSaveNote,
  onKeywordClick
}: PreviewDrawerProps) {
  const [citationFormat, setCitationFormat] = useState<CitationFormat>('apa7');
  const [copied, setCopied] = useState(false);
  const [activeShelfId, setActiveShelfId] = useState<string>('favorites');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const memberShelfIds = new Set(publicationShelfItems.map((i) => i.shelfId));

  useEffect(() => {
    if (!publication) return;
    const firstSaved = publicationShelfItems[0]?.shelfId || shelves[0]?.id || 'favorites';
    setActiveShelfId(firstSaved);
    const existing = publicationShelfItems.find((i) => i.shelfId === firstSaved);
    setNoteDraft(existing?.note || '');
    setCopied(false);
    setNoteSaved(false);
  }, [publication?.id]);

  useEffect(() => {
    if (!publication) return;
    const existing = publicationShelfItems.find((i) => i.shelfId === activeShelfId);
    setNoteDraft(existing?.note || '');
  }, [activeShelfId, publicationShelfItems, publication]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && publication) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [publication, onClose]);

  if (!publication) return null;

  const area = OECD_AREA_MAP[publication.oecdArea];
  const citationText = formatCitation(publication, citationFormat);
  const resumePage = publicationShelfItems.find((i) => i.readingPage > 1)?.readingPage;

  const handleCopyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citationText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleSaveNote = () => {
    onSaveNote(activeShelfId, publication, noteDraft);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <aside
        className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-page)',
          borderColor: 'var(--border-strong)'
        }}
        role="dialog"
        aria-label={`Vista previa de ${publication.title}`}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between border-b px-5 py-3.5"
          style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-surface)' }}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: area.accent }}
            />
            <span style={{ color: area.accent }}>{publication.oecdAreaLabel}</span>
            {publication.oecdSubarea && (
              <span style={{ color: 'var(--text-muted)' }}>· {publication.oecdSubarea}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded border transition-colors"
            style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-card)' }}
            aria-label="Cerrar vista previa"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {/* Header Block */}
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="w-36 shrink-0 sm:w-40">
              <PdfCoverThumbnail
                publication={publication}
                enableLivePdfRender={Boolean(publication.pdfUrl)}
                className="aspect-[3/4] w-full rounded-[4px] shadow-sm"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span
                  className="rounded px-2 py-0.5 font-semibold uppercase tracking-wider"
                  style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
                >
                  {publication.collection}
                </span>
                {publication.year && (
                  <span
                    className="rounded px-2 py-0.5 font-code"
                    style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)' }}
                  >
                    {publication.year}
                  </span>
                )}
                <span
                  className="rounded px-2 py-0.5 font-code uppercase"
                  style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)' }}
                >
                  {publication.language}
                </span>
                {publication.citedByCount ? (
                  <span
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-code"
                    style={{ backgroundColor: 'rgba(184, 134, 59, 0.14)', color: 'var(--accent-ochre)' }}
                  >
                    <Quote className="h-3 w-3" /> {publication.citedByCount} citas
                  </span>
                ) : null}
              </div>

              <h2 className="font-editorial text-xl font-semibold leading-snug sm:text-2xl">
                {publication.title}
              </h2>

              <p className="mt-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {publication.authors.length > 0
                  ? publication.authors.join(' · ')
                  : publication.publisher}
              </p>

              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Editorial / Fuente: <strong style={{ color: 'var(--text-secondary)' }}>{publication.publisher}</strong>
              </p>

              {/* Identifiers */}
              <div className="mt-3 flex flex-wrap gap-2 font-code text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {publication.doi && (
                  <a
                    href={`https://doi.org/${publication.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border px-2 py-0.5 hover:underline"
                    style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-surface)' }}
                  >
                    DOI: {publication.doi}
                  </a>
                )}
                {publication.isbn && (
                  <span
                    className="rounded border px-2 py-0.5"
                    style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-surface)' }}
                  >
                    ISBN: {publication.isbn}
                  </span>
                )}
                {publication.oaiIdentifier && (
                  <span
                    className="rounded border px-2 py-0.5"
                    style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-surface)' }}
                  >
                    ID: {publication.oaiIdentifier}
                  </span>
                )}
              </div>

              {/* Primary Reader CTAs */}
              <div className="mt-4 flex flex-wrap gap-2">
                {publication.pdfUrl ? (
                  <button
                    type="button"
                    onClick={() => onOpenReader(publication, resumePage)}
                    className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold shadow-xs transition-opacity hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--accent-crimson)',
                      color: '#F8F7F4'
                    }}
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>
                      {resumePage ? `Continuar lectura (pág. ${resumePage})` : 'Leer en el navegador'}
                    </span>
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 rounded border px-3 py-2 text-xs"
                    style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-muted)' }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>PDF completo disponible en portal SciELO</span>
                  </span>
                )}

                <a
                  href={publication.scieloUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border px-3.5 py-2 text-xs font-medium transition-colors"
                  style={{
                    borderColor: 'var(--border-hairline)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir en SciELO</span>
                </a>
              </div>
            </div>
          </div>

          {/* Abstract */}
          <section className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border-hairline)' }}>
            <h3
              className="mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Resumen y Alcance Editorial
            </h3>
            <p
              className="max-w-[65ch] text-sm leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {publication.abstract ||
                'Sin resumen disponible en el registro Dublin Core. Consulta la ficha original en SciELO o abre el documento PDF para inspeccionar el índice completo.'}
            </p>
          </section>

          {/* Keywords */}
          {publication.keywords.length > 0 && (
            <section className="mt-5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                <Tag className="h-3.5 w-3.5" />
                <span>Palabras Clave</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {publication.keywords.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => {
                      onKeywordClick(kw);
                      onClose();
                    }}
                    className="rounded border px-2.5 py-1 text-xs transition-colors hover:opacity-80"
                    style={{
                      borderColor: 'var(--border-hairline)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 1-Click Citation Generator */}
          <section
            className="mt-6 rounded border p-4"
            style={{
              borderColor: 'var(--border-hairline)',
              backgroundColor: 'var(--bg-surface)'
            }}
          >
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                <Quote className="h-3.5 w-3.5" style={{ color: 'var(--accent-crimson)' }} />
                <span>Citación en 1 clic</span>
              </div>

              <div className="flex items-center gap-1">
                {CITATION_TABS.map((tab) => {
                  const active = citationFormat === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setCitationFormat(tab.id);
                        setCopied(false);
                      }}
                      className="rounded px-2.5 py-1 text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--accent-crimson)' : 'transparent',
                        color: active ? '#F8F7F4' : 'var(--text-secondary)'
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <pre
              className={`overflow-x-auto rounded border p-3 text-xs leading-relaxed whitespace-pre-wrap ${
                citationFormat === 'bibtex' ? 'font-code' : 'font-sans'
              }`}
              style={{
                borderColor: 'var(--border-hairline)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)'
              }}
            >
              {citationText}
            </pre>

            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                onClick={handleCopyCitation}
                className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: copied ? 'var(--accent-moss)' : 'var(--border-hairline)',
                  backgroundColor: copied ? 'rgba(77, 107, 83, 0.14)' : 'var(--bg-card)',
                  color: copied ? 'var(--accent-moss)' : 'var(--text-primary)'
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Cita copiada' : `Copiar cita ${citationFormat.toUpperCase()}`}</span>
              </button>
            </div>
          </section>

          {/* Shelves & Study Notes */}
          <section
            className="mt-5 rounded border p-4"
            style={{
              borderColor: 'var(--border-hairline)',
              backgroundColor: 'var(--bg-surface)'
            }}
          >
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
              <Bookmark className="h-3.5 w-3.5" style={{ color: 'var(--accent-ochre)' }} />
              <span>Estanterías y Notas Rápidas</span>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {shelves.map((shelf) => {
                const inShelf = memberShelfIds.has(shelf.id);
                return (
                  <button
                    key={shelf.id}
                    type="button"
                    onClick={() => {
                      onToggleShelf(shelf.id, publication);
                      setActiveShelfId(shelf.id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      borderColor: inShelf ? shelf.accent : 'var(--border-hairline)',
                      backgroundColor: inShelf ? `${shelf.accent}1A` : 'var(--bg-card)',
                      color: inShelf ? shelf.accent : 'var(--text-secondary)'
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: shelf.accent }}
                    />
                    <span>{shelf.name}</span>
                    {inShelf && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-2">
              <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span className="inline-flex items-center gap-1">
                  <StickyNote className="h-3 w-3" /> Nota en estantería:
                </span>
                <select
                  value={activeShelfId}
                  onChange={(e) => setActiveShelfId(e.target.value)}
                  className="rounded border px-1.5 py-0.5 text-[11px] outline-none"
                  style={{
                    borderColor: 'var(--border-hairline)',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                  }}
                >
                  {shelves.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={3}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Anota citas clave, capítulos relevantes o ideas para tu investigación..."
                className="w-full rounded border p-2.5 text-xs outline-none"
                style={{
                  borderColor: 'var(--border-hairline)',
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-primary)'
                }}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="inline-flex items-center gap-1.5 rounded border px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    borderColor: noteSaved ? 'var(--accent-moss)' : 'var(--border-hairline)',
                    backgroundColor: noteSaved ? 'rgba(77, 107, 83, 0.14)' : 'var(--bg-card)',
                    color: noteSaved ? 'var(--accent-moss)' : 'var(--text-primary)'
                  }}
                >
                  {noteSaved ? <Check className="h-3.5 w-3.5" /> : <StickyNote className="h-3.5 w-3.5" />}
                  <span>{noteSaved ? 'Nota guardada' : 'Guardar nota en estantería'}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
