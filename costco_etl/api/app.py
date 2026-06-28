"""
Costco Data ETL — Read-Only API
All data is populated by the ETL cronjob. This API only reads.
"""

import sqlite3
import json
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from costco_etl.storage.paths import DB_PATH
from typing import Any, Optional

def get_connection():
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


app = FastAPI(title="Costco Data ETL — Read-Only API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------- Health ----------

@app.get("/")
def root():
    return {"status": "api ok", "mode": "read-only"}


# ---------- System Status ----------

@app.get("/system/status")
def get_system_status():
    """
    Returns the last update timestamp from category_map (set during ETL run).
    This is the 'scanned_at' the frontend displays.
    """
    try:
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT updated_at FROM category_map ORDER BY id DESC LIMIT 1"
            ).fetchone()

            product_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
            category_count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]

            return {
                "last_updated": row["updated_at"] if row else None,
                "total_products": product_count,
                "total_categories": category_count,
            }

        finally:
            conn.close()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Catalog ----------

@app.get("/catalog")
def get_catalog(
    search: str = Query("", description="Search products by name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """
    Paginated product catalog with optional text search.
    Returns products sorted by review_count DESC.
    """
    try:
        conn = get_connection()
        try:
            offset = (page - 1) * page_size

            if search.strip():
                pattern = f"%{search.strip()}%"
                total = conn.execute(
                    "SELECT COUNT(*) FROM products WHERE name LIKE ?",
                    (pattern,),
                ).fetchone()[0]

                rows = conn.execute(
                    """
                    SELECT id, name, min_price, max_price, rating, image_url, review_count
                    FROM products
                    WHERE name LIKE ?
                    ORDER BY review_count DESC
                    LIMIT ? OFFSET ?
                    """,
                    (pattern, page_size, offset),
                ).fetchall()
            else:
                total = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]

                rows = conn.execute(
                    """
                    SELECT id, name, min_price, max_price, rating, image_url, review_count
                    FROM products
                    ORDER BY review_count DESC
                    LIMIT ? OFFSET ?
                    """,
                    (page_size, offset),
                ).fetchall()

            products = [dict(r) for r in rows]

            return {
                "products": products,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": max(1, -(-total // page_size)),
            }

        finally:
            conn.close()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Categories ----------

@app.get("/categories/tree")
def get_category_tree():
    try:
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT payload, updated_at FROM category_map ORDER BY id DESC LIMIT 1"
            ).fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Category tree not found")

            return {
                "category_tree": json.loads(row["payload"]),
                "updated_at": row["updated_at"],
            }

        finally:
            conn.close()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/products/by-category")
def get_products_by_category(
    category_url: str = Query(..., min_length=1),
    limit_products: Optional[int] = Query(None, description="Tajo opcional de los primeros X productos")
) -> dict[str, Any]:
    """
    Returns products linked to the given category_url via product_categories.
    """
    try:
        conn = get_connection()
        try:
            # Tu infra queda intacta. El ORDER BY ya acomoda los reviews.
            rows = conn.execute(
                """
                SELECT
                    p.id,
                    p.name,
                    p.min_price,
                    p.max_price,
                    p.rating,
                    p.image_url,
                    p.review_count
                FROM products p
                JOIN product_categories pc
                  ON pc.product_id = p.id
                WHERE pc.category_url = ?
                ORDER BY p.review_count DESC
                """,
                (category_url,),
            ).fetchall()

            products = [dict(r) for r in rows]

            # EL PARCHE BÁSICO: Aplicamos el tajo en memoria si se solicita.
            if limit_products is not None and limit_products > 0:
                products = products[:limit_products]

            return {
                "category_url": category_url,
                "count": len(products), # Ahora refleja el conteo real del tajo
                "products": products,
            }

        finally:
            conn.close()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/categories/metrics")
def get_category_metrics(category_url: str = Query(..., min_length=1)) -> dict[str, Any]:
    """
    Returns aggregated metrics for a given category_url from categories table.
    """
    try:
        conn = get_connection()
        try:
            row = conn.execute(
                """
                SELECT url, name, level, product_count, total_reviews,
                       avg_rating, avg_min_price, sale_count
                FROM categories
                WHERE url = ?
                """,
                (category_url,),
            ).fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Category not found")

            return dict(row)

        finally:
            conn.close()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Arbitrage / Business Intelligence ----------

@app.get("/arbitrage/latest")
def get_arbitrage_latest():
    """Returns the most recent arbitrage delta report from arbitrage."""
    try:
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT payload, updated_at FROM arbitrage ORDER BY id DESC LIMIT 1"
            ).fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="No arbitrage data available yet")

            return {
                "data": json.loads(row["payload"]),
                "updated_at": row["updated_at"],
            }

        finally:
            conn.close()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
