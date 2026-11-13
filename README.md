# SciELO Open Library

Repositorio académico y biblioteca digital moderna de libros científicos, capítulos y artículos en Acceso Abierto conectada con **SciELO Books (OAI-PMH / OPDS)** y **OpenAlex**, desplegada en el borde con **Cloudflare Pages + Pages Functions + D1 + Cache API**.

## Stack Tecnológico

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 + Lucide Icons
- **Visor PDF integrado:** `pdfjs-dist` (PDF.js) con carga progresiva por rangos de bytes, miniaturas de páginas, zoom, ajuste al ancho, búsqueda interna con resaltado de texto y modo lectura nocturna
- **Backend Edge:** Cloudflare Pages Functions (`functions/api/*`)
- **Base de Datos Edge:** Cloudflare D1 (`scielo-open-library-db`)

## Estructura del Proyecto

```text
scielo-open-library/
├── functions/api/
│   ├── catalog.ts        # Consulta facetada y upsert en Cloudflare D1
│   ├── pdf-proxy.ts      # Proxy CORS seguro con allowlist SciELO, Cache API y Range requests
│   ├── scielo-sync.ts    # Sincronización incremental OAI-PMH / OPDS hacia D1
│   ├── search.ts         # Búsqueda federada en tiempo real (D1 + OpenAlex filtrado a SciELO)
│   └── shelves.ts        # CRUD de estanterías y notas rápidas en D1
├── migrations/
│   ├── 0001_init.sql     # Esquema relacional D1 (publications, shelves, shelf_items, sync_logs)
│   └── 0002_seed.sql     # Seed real cosechado desde SciELO Books & OpenAlex
├── scripts/
│   └── sync-scielo.ts    # Script CLI de ingesta OAI-PMH (oai_dc) + OPDS + OpenAlex
├── src/
│   ├── components/       # Header, FacetSidebar, CatalogGrid, BookCard, PreviewDrawer, PdfReaderModal, ShelvesModal, SyncStatusModal
│   ├── hooks/            # useCatalog (autocompletado O(1), useDeferredValue) & useShelves (Optimistic UI)
│   ├── lib/              # taxonomy.ts (OCDE/UNESCO), citations.ts (APA 7 / IEEE / BibTeX), pdfWorker.ts
│   └── data/             # seedCatalog.json (respaldo instantáneo)
└── wrangler.toml
```

## Comandos Útiles

```bash
npm install
npm run sync:scielo       # Cosecha metadatos reales de SciELO OAI-PMH / OPDS / OpenAlex
npm run dev               # Servidor local Vite
npm run build             # Build de producción en dist/
npm run db:migrate:remote # Aplica migraciones en Cloudflare D1
npm run db:seed:remote    # Puebla D1 con el catálogo cosechado
npm run deploy            # Despliega a Cloudflare Pages
```
