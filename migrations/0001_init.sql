-- SciELO Open Library - Cloudflare D1 Schema
-- Supports indexed SciELO Books, Chapters & Regional Journal Articles,
-- OECD/UNESCO taxonomy facets, and user Shelves & Study Notes.

CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  oai_identifier TEXT UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  authors_json TEXT NOT NULL DEFAULT '[]',
  publisher TEXT NOT NULL DEFAULT 'SciELO',
  collection TEXT NOT NULL DEFAULT 'SciELO Books',
  collection_code TEXT NOT NULL DEFAULT 'books',
  publication_year INTEGER,
  publication_date TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  doc_type TEXT NOT NULL DEFAULT 'book', -- 'book' | 'chapter' | 'article'
  oecd_area TEXT NOT NULL DEFAULT 'social-sciences',
  oecd_area_label TEXT NOT NULL DEFAULT 'Ciencias Sociales',
  oecd_subarea TEXT,
  abstract TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  doi TEXT,
  isbn TEXT,
  scielo_url TEXT NOT NULL,
  pdf_url TEXT,
  epub_url TEXT,
  cover_url TEXT,
  page_count INTEGER,
  cited_by_count INTEGER NOT NULL DEFAULT 0,
  source_origin TEXT NOT NULL DEFAULT 'oai-pmh', -- 'oai-pmh' | 'opds' | 'openalex'
  raw_set_spec TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pub_year ON publications(publication_year DESC);
CREATE INDEX IF NOT EXISTS idx_pub_lang ON publications(language);
CREATE INDEX IF NOT EXISTS idx_pub_type ON publications(doc_type);
CREATE INDEX IF NOT EXISTS idx_pub_oecd ON publications(oecd_area);
CREATE INDEX IF NOT EXISTS idx_pub_collection ON publications(collection_code);
CREATE INDEX IF NOT EXISTS idx_pub_doi ON publications(doi);

CREATE TABLE IF NOT EXISTS shelves (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  accent TEXT NOT NULL DEFAULT '#9E2A2B',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shelf_items (
  id TEXT PRIMARY KEY,
  shelf_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  publication_json TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  reading_page INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE,
  UNIQUE(shelf_id, publication_id)
);

CREATE INDEX IF NOT EXISTS idx_shelf_items_shelf ON shelf_items(shelf_id);
CREATE INDEX IF NOT EXISTS idx_shelf_items_pub ON shelf_items(publication_id);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  records_synced INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  message TEXT,
  resumption_token TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default curated reading shelves
INSERT OR IGNORE INTO shelves (id, name, description, accent) VALUES
  ('favorites', 'Lecturas Esenciales', 'Monografías y artículos fundamentales guardados para consulta frecuente.', '#9E2A2B'),
  ('research-queue', 'Tesis & Marco Teórico', 'Fuentes citables seleccionadas para revisión bibliográfica y contraste.', '#B8863B');
