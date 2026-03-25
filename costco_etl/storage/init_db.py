# pipeline/init_db.py
import sqlite3
from pathlib import Path


def _to_float(val) -> float | None:
    """Safely coerce a value to float; returns None on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def snapshot_previous_state(db_path: str) -> dict[str, dict]:
    """
    Reads all products from the existing database before a rebuild.
    Returns {product_id: {name, min_price, max_price, rating, review_count}}.
    If the DB or table doesn't exist or is corrupt, returns empty dict.
    """
    path = Path(db_path)
    if not path.exists():
        return {}

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT id, name, min_price, max_price, rating, review_count FROM products"
            ).fetchall()
            return {
                row["id"]: {
                    "name": row["name"],
                    "min_price": row["min_price"],
                    "max_price": row["max_price"],
                    "rating": row["rating"],
                    "review_count": row["review_count"],
                }
                for row in rows
            }
        finally:
            conn.close()
    except Exception:
        return {}


def compute_delta(old_snapshot: dict[str, dict], new_products: list[dict]) -> dict:
    """
    Compares previous product state against newly scraped products.
    Returns delta report with price_drops, price_increases, new_items, removed_items.
    Includes Semantic Reconciliation to prevent SKU Churn (false positives).
    """
    new_lookup = {}
    for p in new_products:
        pid = p.get("id")
        if not pid:
            continue
        new_lookup[pid] = {
            "name": p.get("item_product_name") or p.get("name") or "UNKNOWN",
            "min_price": _to_float(p.get("minSalePrice") or p.get("item_location_pricing_salePrice") or p.get("item_location_pricing_listPrice")),
            "max_price": _to_float(p.get("maxSalePrice") or p.get("item_location_pricing_salePrice")),
        }

    old_ids = set(old_snapshot.keys())
    new_ids = set(new_lookup.keys())

    # 1. Identificación bruta
    raw_new_ids = new_ids - old_ids
    raw_removed_ids = old_ids - new_ids

    # 2. Diccionario temporal para reconciliación semántica (por Nombre)
    removed_by_name = {
        old_snapshot[pid]["name"]: {"id": pid, "price": old_snapshot[pid].get("min_price")}
        for pid in raw_removed_ids
    }

    new_items = []
    removed_items = []
    price_drops = []
    price_increases = []

    # 3. Intercepción y cruce semántico para evitar SKU Churn
    for pid in raw_new_ids:
        new_name = new_lookup[pid]["name"]
        new_price = new_lookup[pid]["min_price"]

        # Si el "nuevo" producto tiene el mismo nombre que uno "borrado" (Rotación de SKU)
        if new_name in removed_by_name:
            old_price = removed_by_name[new_name]["price"]
            del removed_by_name[new_name]  # Lo sacamos de las bajas

            # Evaluamos si en la rotación hubo cambio de precio
            if old_price is not None and new_price is not None and old_price != new_price:
                delta_pct = round((new_price - old_price) / old_price * 100, 2) if old_price else 0
                entry = {
                    "id": pid,
                    "name": new_name,
                    "old_price": old_price,
                    "new_price": new_price,
                    "delta": round(new_price - old_price, 2),
                    "delta_pct": delta_pct,
                }
                if new_price < old_price:
                    price_drops.append(entry)
                else:
                    price_increases.append(entry)
            continue  # Ya fue procesado como rotación, salteamos

        # Si no es rotación, es un ítem nuevo real
        new_items.append({
            "id": pid,
            "name": new_name,
            "min_price": new_price
        })

    # 4. Los que quedaron en el diccionario son bajas reales
    for name, data in removed_by_name.items():
        removed_items.append({
            "id": data["id"],
            "name": name,
            "last_min_price": data["price"]
        })

    # 5. Análisis de los productos que mantuvieron exactamente el mismo ID
    for pid in old_ids & new_ids:
        old_price = old_snapshot[pid].get("min_price")
        new_price = new_lookup[pid].get("min_price")

        if old_price is None or new_price is None or old_price == new_price:
            continue

        delta_pct = round((new_price - old_price) / old_price * 100, 2) if old_price else 0

        entry = {
            "id": pid,
            "name": new_lookup[pid]["name"],
            "old_price": old_price,
            "new_price": new_price,
            "delta": round(new_price - old_price, 2),
            "delta_pct": delta_pct,
        }

        if new_price < old_price:
            price_drops.append(entry)
        else:
            price_increases.append(entry)

    # Sort price drops by largest absolute savings first
    price_drops.sort(key=lambda x: x["delta"])
    price_increases.sort(key=lambda x: x["delta"], reverse=True)

    return {
        "new_items": new_items,
        "removed_items": removed_items,
        "price_drops": price_drops,
        "price_increases": price_increases,
        "summary": {
            "previous_count": len(old_ids),
            "current_count": len(new_ids),
            "new_count": len(new_items),
            "removed_count": len(removed_items),
            "price_drop_count": len(price_drops),
            "price_increase_count": len(price_increases),
            "unchanged_count": len(old_ids & new_ids) - len(price_drops) - len(price_increases),
        },
    }


def recreate_costco_db(db_path: str) -> None:
    """
    Drops and recreates all Costco tables (Phase 1 snapshot model).
    No historical data.
    Fresh rebuild every execution.
    """

    conn = sqlite3.connect(db_path)

    try:
        # ---------- DROP ALL ----------
        conn.execute("DROP TABLE IF EXISTS product_categories")
        conn.execute("DROP TABLE IF EXISTS products")
        conn.execute("DROP TABLE IF EXISTS categories")
        conn.execute("DROP TABLE IF EXISTS category_map")
        conn.execute("DROP TABLE IF EXISTS arbitrage_daily")

        # ---------- PRODUCTS ----------
        conn.execute("""
            CREATE TABLE products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                min_price REAL,
                max_price REAL,
                rating REAL,
                image_url TEXT,
                review_count INTEGER
            )
        """)

        # ---------- PRODUCT ↔ CATEGORY (PUENTE) ----------
        conn.execute("""
            CREATE TABLE product_categories (
                product_id TEXT NOT NULL,
                category_url TEXT NOT NULL,
                PRIMARY KEY (product_id, category_url)
            )
        """)

        # ---------- CATEGORIES (ENTIDAD REAL) ----------
        conn.execute("""
            CREATE TABLE categories (
                url TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                level INTEGER NOT NULL,
                product_count INTEGER NOT NULL,
                total_reviews INTEGER NOT NULL,
                avg_rating REAL,
                avg_min_price REAL,
                sale_count INTEGER NOT NULL
            )
        """)

        # ---------- CATEGORY MAP (JSON COMPLETO) ----------
        conn.execute("""
            CREATE TABLE category_map (
                id INTEGER PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # ---------- ARBITRAGE DAILY ----------
        conn.execute("""
            CREATE TABLE arbitrage_daily (
                id INTEGER PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        conn.commit()

    finally:
        conn.close()