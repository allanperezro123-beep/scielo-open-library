import { useMemo, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Download,
  Plus,
  StickyNote,
  Trash2,
  X
} from 'lucide-react';
import { formatCitation } from '../lib/citations';
import type { Publication, Shelf, ShelfItem } from '../types/publication';

interface ShelvesModalProps {
  open: boolean;
  onClose: () => void;
  shelves: Shelf[];
  shelfItems: ShelfItem[];
  syncedWithD1: boolean;
  onCreateShelf: (name: string, description?: string, accent?: string) => void;
  onDeleteShelf: (shelfId: string) => void;
  onRemoveItem: (shelfId: string, pub: Publication) => void;
  onSelectPublication: (pub: Publication) => void;
  onOpenReader: (pub: Publication, page?: number) => void;
  onUpdateNote: (shelfId: string, pub: Publication, note: string) => void;
}

const SHELF_ACCENTS = ['#9E2A2B', '#B8863B', '#4D6B53', '#46545B', '#7D4E57'];

export function ShelvesModal({
  open,
  onClose,
  shelves,
  shelfItems,
  syncedWithD1,
  onCreateShelf,
  onDeleteShelf,
  onRemoveItem,
  onSelectPublication,
  onOpenReader,
  onUpdateNote
}: ShelvesModalProps) {
  const [selectedShelfId, setSelectedShelfId] = useState<string>(shelves[0]?.id || 'favorites');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAccent, setNewAccent] = useState(SHELF_ACCENTS[0]);
  const [showCreator, setShowCreator] = useState(false);

  const activeShelf = shelves.find((s) => s.id === selectedShelfId) || shelves[0];

  const itemsInShelf = useMemo(
    () => shelfItems.filter((i) => i.shelfId === activeShelf?.id),
    [shelfItems, activeShelf?.id]
  );

  if (!open) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateShelf(newName, newDesc, newAccent);
    setNewName('');
    setNewDesc('');
    setShowCreator(false);
  };

  const handleExportBibtex = () => {
    if (itemsInShelf.length === 0) return;
    const bib = itemsInShelf.map((i) => formatCitation(i.publication, 'bibtex')).join('\n\n');
    const blob = new Blob([bib], { type: 'application/x-bibtex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeShelf?.id || 'scielo-shelf'}.bib`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      <div
        className="relative z-10 flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded border shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-page)',
          borderColor: 'var(--border-strong)'
        }}
        role="dialog"
        aria-label="Estanterías y listas de lectura"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-3.5"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-hairline)' }}
        >
          <div className="flex items-center gap-2.5">
            <Bookmark className="h-5 w-5" style={{ color: 'var(--accent-crimson)' }} />
            <div>
              <h2 className="font-editorial text-lg font-semibold">Estanterías y Listas de Lectura</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {syncedWithD1
                  ? 'Sincronizadas en Cloudflare D1 + respaldo local'
                  : 'Guardadas localmente en este navegador'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded border"
            style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-card)' }}
            aria-label="Cerrar estanterías"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Left Shelves List */}
          <div
            className="w-full shrink-0 overflow-y-auto border-b p-4 md:w-64 md:border-b-0 md:border-r"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-hairline)' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Mis Colecciones
              </span>
              <button
                type="button"
                onClick={() => setShowCreator((v) => !v)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium"
                style={{ backgroundColor: 'var(--accent-crimson-soft)', color: 'var(--accent-crimson)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nueva</span>
              </button>
            </div>

            {showCreator && (
              <form
                onSubmit={handleCreate}
                className="mb-3 rounded border p-2.5"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-hairline)' }}
              >
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre de la estantería..."
                  className="mb-2 h-8 w-full rounded border px-2 text-xs outline-none"
                  style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-page)' }}
                  required
                />
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Descripción breve (opcional)"
                  className="mb-2 h-8 w-full rounded border px-2 text-xs outline-none"
                  style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-page)' }}
                />
                <div className="mb-2 flex items-center gap-1.5">
                  {SHELF_ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewAccent(c)}
                      className="h-4 w-4 rounded-full border-2"
                      style={{
                        backgroundColor: c,
                        borderColor: newAccent === c ? 'var(--text-primary)' : 'transparent'
                      }}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  className="w-full rounded py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent-crimson)', color: '#F8F7F4' }}
                >
                  Crear estantería
                </button>
              </form>
            )}

            <div className="flex flex-col gap-1.5">
              {shelves.map((shelf) => {
                const count = shelfItems.filter((i) => i.shelfId === shelf.id).length;
                const active = shelf.id === activeShelf?.id;
                return (
                  <div
                    key={shelf.id}
                    className="flex items-center justify-between rounded border px-2.5 py-2 transition-colors"
                    style={{
                      borderColor: active ? shelf.accent : 'var(--border-hairline)',
                      backgroundColor: active ? 'var(--bg-card)' : 'transparent'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedShelfId(shelf.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: shelf.accent }}
                      />
                      <span className="truncate text-xs font-semibold">{shelf.name}</span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <span className="font-code text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {count}
                      </span>
                      {shelf.id !== 'favorites' && (
                        <button
                          type="button"
                          onClick={() => onDeleteShelf(shelf.id)}
                          className="p-0.5 opacity-60 hover:opacity-100"
                          title="Eliminar estantería"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Shelf Items */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
            {activeShelf && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: 'var(--border-hairline)' }}>
                <div>
                  <h3 className="font-editorial text-lg font-semibold">{activeShelf.name}</h3>
                  {activeShelf.description && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {activeShelf.description}
                    </p>
                  )}
                </div>

                {itemsInShelf.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportBibtex}
                    className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium"
                    style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-surface)' }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Exportar BibTeX (.bib)</span>
                  </button>
                )}
              </div>
            )}

            {itemsInShelf.length === 0 ? (
              <div className="my-auto py-12 text-center">
                <p className="font-editorial text-base font-medium">Esta estantería aún está vacía</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Usa el ícono de marcador en cualquier libro o artículo para guardarlo aquí con tus notas.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {itemsInShelf.map((item) => (
                  <div
                    key={item.id}
                    className="rounded border p-3.5"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-hairline)' }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectPublication(item.publication);
                            onClose();
                          }}
                          className="font-editorial text-left text-base font-semibold hover:underline"
                        >
                          {item.publication.title}
                        </button>
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {item.publication.authors.join('; ') || item.publication.publisher} ·{' '}
                          {item.publication.year || 's.f.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {item.publication.pdfUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenReader(item.publication, item.readingPage);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium"
                            style={{ backgroundColor: 'var(--accent-crimson)', color: '#F8F7F4' }}
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>Leer {item.readingPage > 1 ? `(p. ${item.readingPage})` : ''}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.shelfId, item.publication)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border"
                          style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-muted)' }}
                          title="Quitar de estantería"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Editable quick note */}
                    <div className="mt-2.5 flex items-start gap-2">
                      <StickyNote className="mt-1.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent-ochre)' }} />
                      <textarea
                        rows={2}
                        defaultValue={item.note}
                        onBlur={(e) => {
                          if (e.target.value !== item.note) {
                            onUpdateNote(item.shelfId, item.publication, e.target.value);
                          }
                        }}
                        placeholder="Escribe una nota de lectura rápida (se guarda al salir del campo)..."
                        className="w-full rounded border px-2.5 py-1.5 text-xs outline-none"
                        style={{
                          borderColor: 'var(--border-hairline)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
