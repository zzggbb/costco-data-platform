import asyncio
import sqlite3
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from costco_etl.storage.paths import DB_PATH
from costco_etl.main_runner import run_pipeline
from costco_etl.observability.run_context import RunContext
from typing import Any
from fastapi import Query

_etl_lock = asyncio.Lock()

def get_connection():
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


app = FastAPI(title="costco-data-etl api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "api ok"}

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
                "updated_at": row["updated_at"]
            }

        finally:
            conn.close()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/products/by-category")
def get_products_by_category(category_url: str = Query(..., min_length=1)) -> dict[str, Any]:
    """
    Returns ALL products linked to the given category_url via product_categories.
    category_url must match exactly what's stored (e.g. '/floral-arrangements.html').
    """
    try:
        conn = get_connection()
        try:
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

            return {
                "category_url": category_url,
                "count": len(products),
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
                SELECT
                    url,
                    name,
                    level,
                    product_count,
                    total_reviews,
                    avg_rating,
                    avg_min_price,
                    sale_count
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


@app.get("/arbitrage/latest")
def get_arbitrage_latest():
    """Returns the most recent arbitrage delta report from arbitrage_daily."""
    try:
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT payload, updated_at FROM arbitrage_daily ORDER BY id DESC LIMIT 1"
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


ETL_TIMEOUT_S = 120


@app.post("/run-etl")
async def run_etl(demo: bool = False):
    if _etl_lock.locked():
        raise HTTPException(status_code=409, detail="ETL pipeline already running")

    async with _etl_lock:
        ctx = RunContext(run_name="etl_api_trigger", console=False)
        try:
            await asyncio.wait_for(
                run_pipeline(ctx, demo=demo),
                timeout=ETL_TIMEOUT_S,
            )
            report = ctx.finalize(status="success")
        except asyncio.TimeoutError:
            report = ctx.finalize(status="error")
            raise HTTPException(
                status_code=504,
                detail=f"ETL pipeline timed out after {ETL_TIMEOUT_S}s",
            )
        except Exception as e:
            ctx.finalize(status="error")
            raise HTTPException(status_code=500, detail=str(e))

    return report