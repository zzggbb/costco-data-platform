import sqlite3

def persist_products(db_path: str, products_flat: list[dict]) -> None:
    """
    Inserts unique products into products table.
    Does NOT store category paths (handled by product_categories).
    """

    conn = sqlite3.connect(db_path)

    try:
        rows = []

        for product in products_flat:

            product_id = product.get("id")
            if not product_id:
                continue

            name = product.get("item_product_name") or product.get("name") or "UNKNOWN"

            rows.append(
                (
                    product_id,
                    name,
                    _safe_float(product.get("minSalePrice") or product.get("item_location_pricing_salePrice") or product.get("item_location_pricing_listPrice")),
                    _safe_float(product.get("maxSalePrice") or product.get("item_location_pricing_salePrice")),
                    _safe_float(product.get("item_review_ratings")),
                    product.get("item_product_primary_image") or product.get("image"),
                    _safe_int(product.get("item_product_review_count")),
                )
            )

        conn.executemany(
            """
            INSERT OR REPLACE INTO products (
                id,
                name,
                min_price,
                max_price,
                rating,
                image_url,
                review_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            rows
        )

        conn.commit()

    finally:
        conn.close()


def _safe_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except (ValueError, TypeError):
        return None


def _safe_int(value):
    try:
        if value is None:
            return None
        return int(value)
    except (ValueError, TypeError):
        return None