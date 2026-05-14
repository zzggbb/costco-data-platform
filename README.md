# Costco Data ETL

**Live:** https://leonardovila.com/costco-data/

Pipeline end-to-end de scraping, almacenamiento y visualizacion del catalogo completo de Costco.com. Extrae +10,000 productos y +1,000 categorias diariamente, computa deltas de precios e inventario, y los expone a traves de una API read-only y un dashboard de Business Intelligence.

---

## Tabla de Contenidos

- [Arquitectura](#arquitectura)
- [Stack Tecnologico](#stack-tecnologico)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Base de Datos](#base-de-datos)
- [Pipeline ETL](#pipeline-etl)
- [API REST](#api-rest)
- [Frontend](#frontend)
- [Instalacion y Setup Local](#instalacion-y-setup-local)
- [Deploy en VPS](#deploy-en-vps)
- [Uso](#uso)

---

## Arquitectura

```
                           VPS (Cronjob diario)
                          ┌─────────────────────────┐
                          │  python -m costco_etl    │
                          │    .main_runner          │
                          │                          │
                          │  1. Scrape Costco.com    │
                          │  2. Build category tree  │
                          │  3. Persist to SQLite    │
                          │  4. Compute deltas       │
                          └────────┬────────────────┘
                                   │ escribe
                                   ▼
                            ┌─────────────┐
                            │  costco.db  │
                            │  (SQLite)   │
                            └──────┬──────┘
                                   │ lee
                                   ▼
                          ┌─────────────────────┐
                          │  FastAPI (uvicorn)   │
                          │  :8001 — Read-Only   │
                          └──────────┬──────────┘
                                     │
                              Nginx reverse proxy
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │  React Dashboard     │
                          │  (static build)      │
                          └─────────────────────┘
```

**Principio fundamental:** Arquitectura stateless de solo lectura. El usuario consulta datos; el pipeline ETL (ejecutado via cronjob en el VPS) es el unico que escribe en la base de datos. El frontend no dispara operaciones de escritura.

---

## Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| **ETL / Scraping** | Python 3.9+, aiohttp (async HTTP), asyncio |
| **API** | FastAPI, uvicorn |
| **Base de Datos** | SQLite (modelo snapshot — rebuild completo diario) |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| **UI Components** | Tremor (charts/tables), Headless UI, Heroicons |
| **State Management** | Zustand |
| **Deploy** | VPS Linux, Nginx, cronjob |

---

## Estructura del Proyecto

```
costco-etl/
├── costco_etl/                       # Paquete Python principal
│   ├── api/
│   │   └── app.py                    # FastAPI — 7 endpoints GET read-only
│   ├── scraping/
│   │   ├── costco_scraper.py         # Orquestador principal del scraping
│   │   ├── get_key.py                # Extrae API key de Costco.com
│   │   ├── get_megamenu.py           # Descarga megamenu de categorias
│   │   ├── parse_megamenu.py         # Parsea estructura JSON del megamenu
│   │   └── navigation_crawler.py     # Crawling paginado de productos por categoria
│   ├── category_structuring/
│   │   ├── build_category_tree.py    # Construye arbol jerarquico de categorias
│   │   └── prune_category_tree.py    # Poda categorias vacias (sin productos)
│   ├── storage/
│   │   ├── init_db.py                # Schema DDL + compute_delta + snapshot
│   │   ├── paths.py                  # Configuracion de path a la DB
│   │   ├── persist_products.py       # INSERT de productos
│   │   ├── persist_product_categories.py  # Relaciones M2M producto-categoria
│   │   ├── persist_category_map.py   # Arbol de categorias como JSON
│   │   ├── persist_category_metrics.py    # Metricas agregadas por categoria
│   │   └── persist_arbitrage_daily.py     # Reporte delta diario
│   ├── observability/
│   │   └── run_context.py            # Logging estructurado (JSONL + JSON report)
│   └── main_runner.py                # Entry point del pipeline ETL
│
├── frontend/                         # Aplicacion React
│   ├── src/
│   │   ├── App.tsx                   # Layout principal con pestanas
│   │   ├── components/
│   │   │   ├── CatalogExplorer.tsx   # Tab 1: Exploracion de productos
│   │   │   └── BusinessIntelligence.tsx  # Tab 2: Dashboard BI
│   │   └── stores/
│   │       └── etlStore.ts           # Zustand store
│   ├── package.json
│   └── vite.config.ts
│
├── costco.db                         # Base de datos SQLite
├── pyproject.toml                    # Metadata y dependencias Python
├── CHANGELOG.md                      # Historial de versiones
└── logs/                             # Logs de ejecucion del pipeline
```

---

## Base de Datos

SQLite con modelo **snapshot**: se reconstruye completamente en cada ejecucion del pipeline. 5 tablas:

```
┌──────────────┐       ┌────────────────────────┐       ┌──────────────┐
│   products   │──M:M──│   product_categories   │──M:1──│  categories  │
│              │       │                        │       │              │
│ id (PK)      │       │ product_id (PK)        │       │ url (PK)     │
│ name         │       │ category_url (PK)      │       │ name         │
│ min_price    │       └────────────────────────┘       │ level        │
│ max_price    │                                        │ product_count│
│ rating       │                                        │ total_reviews│
│ image_url    │                                        │ avg_rating   │
│ review_count │                                        │ avg_min_price│
└──────────────┘                                        │ sale_count   │
                                                        └──────────────┘

┌──────────────────┐       ┌───────────────────┐
│   category_map   │       │  arbitrage_daily  │
│                  │       │                   │
│ id (PK)          │       │ id (PK)           │
│ payload (JSON)   │       │ payload (JSON)    │
│ updated_at       │       │ updated_at        │
└──────────────────┘       └───────────────────┘
```

- **products**: Catalogo completo (~10,000+ SKUs)
- **product_categories**: Relacion muchos-a-muchos entre productos y categorias
- **categories**: Entidades de categoria con metricas agregadas (~1,000+)
- **category_map**: Arbol jerarquico completo como JSON (1 fila)
- **arbitrage_daily**: Reporte delta del ultimo run (1 fila)

---

## Pipeline ETL

El pipeline se ejecuta como proceso asincrono orquestado por `main_runner.py`:

### Etapas

1. **Scrape Catalog**
   - Extrae API key de Costco.com via regex en el HTML
   - Descarga megamenu de categorias desde `search.costco.com`
   - Crawl concurrente de todas las categorias (5 categorias simultaneas, 3 paginas concurrentes por categoria)
   - Delays anti-throttling: 1.5s entre categorias, 0.5s entre paginas
   - Deduplicacion por product ID con union de categorias

2. **Category Structuring**
   - Construye arbol jerarquico desde el megamenu
   - Poda categorias sin productos (elimina ramas vacias)

3. **Storage**
   - Snapshot del estado previo de la DB (para calcular deltas)
   - Recreacion completa del schema (DROP + CREATE)
   - Persistencia de productos, relaciones M2M, mapa de categorias y metricas
   - **Calculo de deltas**: Compara snapshot anterior vs datos nuevos
   - Persistencia del reporte de arbitraje diario

### Safety Stop

Si el pipeline obtiene menos de 8,500 productos (en modo completo), aborta la ejecucion para proteger la DB existente de un rebuild con datos incompletos.

### Reconciliacion Semantica

El sistema de deltas detecta **rotaciones de SKU**: cuando un producto cambia de ID pero mantiene el mismo nombre, se interpreta como rotacion (no como baja + alta), evitando falsos positivos en el reporte.

### Ejecucion

```bash
# Modo completo (produccion)
python -m costco_etl.main_runner

# Modo demo (solo categoria Jewelry, para testing)
python -m costco_etl.main_runner --demo
```

### Logs

Cada ejecucion genera:
- `logs/RUN_<timestamp>_costco_data_etl_main.jsonl` — Eventos estructurados por etapa
- `logs/REPORT_<timestamp>_costco_data_etl_main.json` — Resumen consolidado con metricas y timings

---

## API REST

FastAPI corriendo en el puerto `8001`. Exclusivamente endpoints GET (read-only). CORS habilitado.

| Endpoint | Descripcion |
|----------|-------------|
| `GET /` | Health check — `{"status": "api ok", "mode": "read-only"}` |
| `GET /system/status` | Timestamp de ultima actualizacion, conteo de productos y categorias |
| `GET /catalog?search=&page=1&page_size=50` | Catalogo paginado con busqueda por texto. Ordenado por `review_count` DESC |
| `GET /categories/tree` | Arbol jerarquico completo de categorias (JSON) |
| `GET /products/by-category?category_url=...` | Productos de una categoria especifica |
| `GET /categories/metrics?category_url=...` | Metricas agregadas de una categoria (promedio precio, rating, reviews, ventas) |
| `GET /arbitrage/latest` | Ultimo reporte delta: price drops, price increases, new items, removed items |

### Ejemplo de respuesta — `/system/status`

```json
{
  "last_updated": "2026-03-30T02:00:15",
  "total_products": 10247,
  "total_categories": 1083
}
```

### Ejemplo de respuesta — `/arbitrage/latest`

```json
{
  "data": {
    "price_drops": [...],
    "price_increases": [...],
    "new_items": [...],
    "removed_items": [...],
    "summary": {
      "previous_count": 10180,
      "current_count": 10247,
      "new_count": 85,
      "removed_count": 18,
      "price_drop_count": 142,
      "price_increase_count": 67,
      "unchanged_count": 9935
    }
  },
  "updated_at": "2026-03-30T02:00:15"
}
```

---

## Frontend

Dashboard React con dos pestanas principales:

### Tab 1 — Explorar Catalogo

- Buscador de categorias con autocomplete
- Boton "Sorprendeme!" (categoria aleatoria)
- Grilla de productos con imagenes, precios, ratings y reviews
- Ordenamiento por reviews, rating o precio (toggle asc/desc)
- Barra de metricas de la categoria seleccionada
- Paginacion

### Tab 2 — Business Intelligence

- KPIs: tamano del catalogo, cambio neto, price drops, price increases
- Estadisticas secundarias: nuevos SKUs, eliminados, sin cambios
- Tablas colapsables y ordenables para cada tipo de movimiento
- Timestamp del ultimo reporte

### Caracteristicas de UX

- Tema oscuro (zinc-900 base)
- Verde neon para descuentos/ahorros, rojo para aumentos
- Fecha de "Ultima Actualizacion del Sistema" visible prominentemente en el header
- Disclaimer de modo solo-lectura en el footer

---

## Instalacion y Setup Local

### Requisitos

- Python >= 3.9
- Node.js >= 18
- npm

### Backend

```bash
# Clonar el repositorio
git clone <repo-url>
cd costco-etl

# Instalar dependencias Python (editable)
pip install -e .

# Ejecutar el pipeline (modo demo para primera prueba)
python -m costco_etl.main_runner --demo

# Levantar la API
uvicorn costco_etl.api.app:app --host 127.0.0.1 --port 8001
```

### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Desarrollo (con proxy a la API en :8001)
npm run dev

# Build para produccion
npm run build
```

La configuracion de Vite incluye un proxy que redirige `/api/costco/*` a `http://localhost:8001`, permitiendo desarrollo local sin configurar CORS adicional.

### Variable de Entorno (Opcional)

```bash
# Override del path a la base de datos
export COSTCO_DB_PATH=/ruta/custom/costco.db
```

Si no se define, el sistema usa `/opt/costco_api/data/costco.db` en VPS o `./costco.db` localmente como fallback.

---

## Deploy en VPS

### Arquitectura de Deploy

```
VPS
├── /opt/costco_api/               # Backend Python
│   ├── costco_etl/                # Paquete del pipeline
│   ├── data/costco.db             # Base de datos
│   └── logs/                      # Logs de ejecucion
├── /var/www/leonardovila/
│   └── costco-data/               # Frontend build (servido por Nginx)
└── Cronjob                        # Ejecucion diaria del pipeline
```

### Pasos

1. **Build del frontend**
   ```bash
   cd frontend && npm run build
   ```

2. **Transferir archivos al VPS**
   ```bash
   scp -r frontend/dist/* user@vps:/var/www/leonardovila/costco-data/
   scp -r costco_etl/ user@vps:/opt/costco_api/
   ```

3. **Iniciar la API**
   ```bash
   cd /opt/costco_api
   uvicorn costco_etl.api.app:app --host 127.0.0.1 --port 8001
   ```

4. **Configurar cronjob**
   ```bash
   crontab -e
   # Ejecutar pipeline diariamente a las 2:00 AM
   0 2 * * * cd /opt/costco_api && python3 -m costco_etl.main_runner >> /opt/costco_api/logs/cron.log 2>&1
   ```

5. **Configurar Nginx** como reverse proxy de `/api/` a `localhost:8001` y servir los archivos estaticos del frontend.

---

## Uso

1. El pipeline ETL corre automaticamente una vez al dia via cronjob
2. La API expone los datos mas recientes en modo read-only
3. El usuario accede al dashboard para:
   - **Explorar** el catalogo completo por categorias
   - **Analizar** movimientos de precio e inventario en la pestana de BI
   - **Verificar** la fecha de ultima actualizacion del sistema

---

## Autor

**Leonardo Vila**

## Licencia

Uso privado.
