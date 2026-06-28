# Costco Data ETL

**[Live Site](https://leonardovila.com/costco-data/)**

End-to-end data pipeline that scrapes, structures, and serves the entire Costco.com catalog. Every day, it extracts **10,000+ products** across **1,000+ categories**, computes price and inventory deltas, and exposes everything through a read-only REST API and a Business Intelligence dashboard.

---

## How It Works

```
     Costco.com
         │
         ▼
┌─────────────────────────────┐
│   Async Scraper (Python)    │   Daily cronjob on VPS
│                             │
│   → Extract API key         │   5 concurrent category streams
│   → Crawl full catalog      │   Pagination + deduplication
│   → Build category tree     │   Anti-throttle delays
│   → Compute price deltas    │   SKU rotation reconciliation
└──────────┬──────────────────┘
           │
           ▼
     ┌───────────┐
     │  SQLite   │   Snapshot model — full rebuild each run
     └─────┬─────┘
           │
           ▼
┌─────────────────────────┐
│   FastAPI (read-only)   │   7 GET endpoints, zero writes
└──────────┬──────────────┘
           │
      Nginx reverse proxy
           │
           ▼
┌─────────────────────────┐
│   React Dashboard       │   Catalog Explorer + BI Analytics
└─────────────────────────┘
```

The system follows a strict **write-once, read-many** architecture. The ETL pipeline is the single writer. The API, the frontend, and every user interaction are purely read-only. No mutations, no side effects.

---

## Price Intelligence

The pipeline doesn't just snapshot the catalog — it tracks how it changes.

After each run, the system compares the current state against the previous snapshot and produces a delta report:

- **Price drops** and **price increases** with exact dollar and percentage changes
- **New SKUs** entering the catalog
- **Removed SKUs** leaving the catalog
- **Net catalog movement** (growth or contraction)

### Semantic Reconciliation

Costco periodically rotates product IDs without changing the actual product. A naive diff would flag these as a removal + a new addition — two false positives per rotation.

The delta engine detects this by matching products on name when IDs diverge. If a "removed" product shares its name with a "new" one, it's classified as a SKU rotation and excluded from the arbitrage report. This keeps the intelligence signal clean.

### Safety Stop

If a scrape returns fewer than 8,500 products, the pipeline aborts before writing. This protects the database from partial scrapes caused by rate limiting, network issues, or upstream changes. The previous good state is preserved.

---

## The Dashboard

### Catalog Explorer

Browse the full Costco catalog by category with real-time search, sorting (by reviews, rating, or price), and pagination. Each product card shows pricing, star ratings, review counts, and product images. Category-level metrics (average price, average rating, total reviews, sale count) are surfaced in a stats bar above the results.

### Business Intelligence

A second tab surfaces the delta report as a BI dashboard. KPI cards show catalog size, net change, price drops, and price increases at a glance. Collapsible, sortable tables break down each movement type — drill into which products dropped in price, which ones are new, and which ones disappeared.

---

## Technical Highlights

| | |
|---|---|
| **Concurrent async scraping** | `asyncio` + `aiohttp` with semaphore-throttled parallelism — 5 categories and 3 pages per category simultaneously |
| **Snapshot database model** | Full schema rebuild on each run. No migrations, no drift, no stale state. The DB is always a clean reflection of the current catalog |
| **Structured observability** | Every pipeline run emits a JSONL event stream and a JSON summary report with per-stage timings and metrics |
| **Hierarchical category tree** | Multi-level category structure parsed from Costco's megamenu, pruned of empty branches, served as a single JSON payload |
| **Deduplication** | Products appearing in multiple categories are deduplicated by ID, with category memberships merged — no data loss, no duplicates |

---

## Stack

| Layer | Technology |
|-------|------------|
| ETL | Python 3.9+, asyncio, aiohttp |
| API | FastAPI, Uvicorn |
| Database | SQLite |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4 |
| UI Components | Tremor, Headless UI, Heroicons |
| State | Zustand |
| Infrastructure | Linux VPS, Nginx, cron |

---

## API

Seven read-only endpoints. No authentication, no writes, CORS open.

| Endpoint | Returns |
|----------|---------|
| `GET /` | Health check |
| `GET /system/status` | Last update timestamp, product count, category count |
| `GET /catalog` | Paginated product search with text filtering |
| `GET /categories/tree` | Full hierarchical category tree |
| `GET /products/by-category` | Products within a specific category |
| `GET /categories/metrics` | Aggregated stats for a category |
| `GET /arbitrage/latest` | Daily delta report — price changes, new items, removed items |

---

## Data Model

Five tables, zero complexity:

- **products** — ~10,000 SKUs with pricing, ratings, images, and review counts
- **categories** — ~1,000 category nodes with aggregated metrics
- **product_categories** — Many-to-many junction table
- **category_map** — The full category hierarchy as a single JSON document
- **arbitrage** — The latest delta report as a single JSON document

---

**Built by [Leonardo Vila](https://leonardovila.com)**
