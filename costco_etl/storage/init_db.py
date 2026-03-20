# pipeline/init_db.py
import sqlite3
from pathlib import Path


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
    """
    new_lookup = {}
    for p in new_products:
        pid = p.get("id")
        if not pid:
            continue
        new_lookup[pid] = {
            "name": p.get("item_product_name") or p.get("name") or "UNKNOWN",
            "min_price": _to_float(p.get("minSalePrice")),
            "max_price": _to_float(p.get("maxSalePrice")),
        }

    old_ids = set(old_snapshot.keys())
    new_ids = set(new_lookup.keys())

    # New items (not in previous snapshot)
    new_items = [
        {"id": pid, "name": new_lookup[pid]["name"],
         "min_price": new_lookup[pid]["min_price"]}
        for pid in sorted(new_ids - old_ids)
    ]

    # Removed items (in previous, not in new)
    removed_items = [
        {"id": pid, "name": old_snapshot[pid]["name"],
         "last_min_price": old_snapshot[pid]["min_price"]}
        for pid in sorted(old_ids - new_ids)
    ]

    # Price changes (items in both snapshots)
    price_drops = []
    price_increases = []

    for pid in old_ids & new_ids:
        old_price = old_snapshot[pid].get("min_price")
        new_price = new_lookup[pid].get("min_price")

        if old_price is None or new_price is None:
            continue
        if old_price == new_price:
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

        conn.commit()

    finally:
        conn.close()


def _to_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except (ValueError, TypeError):
        return None
