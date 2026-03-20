import argparse
import asyncio

from costco_etl.scraping.costco_scraper import scrape_costco_catalog
from costco_etl.category_structuring.build_category_tree import build_category_tree
from costco_etl.category_structuring.prune_category_tree import prune_category_tree
from costco_etl.storage.init_db import recreate_costco_db
from costco_etl.storage.persist_products import persist_products
from costco_etl.storage.persist_product_categories import persist_product_categories
from costco_etl.storage.persist_category_map import persist_category_map
from costco_etl.storage.persist_category_metrics import persist_category_metrics
from costco_etl.observability.run_context import RunContext
from costco_etl.storage.paths import DB_PATH

def count_nodes(tree: dict) -> int:
    count = 0
    for node in tree.values():
        count += 1
        count += count_nodes(node.get("children", {}))
    return count

async def run_pipeline(ctx: RunContext, demo: bool):

    with ctx.span("scrape_catalog", demo_mode=demo):
        products_flat, parsed_megamenu, scrape_metrics = await scrape_costco_catalog(ctx, demo=demo)
    ctx.report["stages"]["scrape_catalog"].update(scrape_metrics)

    with ctx.span("category_structuring") as _:

        base_category_tree = build_category_tree(parsed_megamenu)
        clean_category_tree, pruned_count = prune_category_tree(base_category_tree, products_flat)

        total_before = count_nodes(base_category_tree)
        total_after = count_nodes(clean_category_tree)

    ctx.report["stages"]["category_structuring"].update({
        "total_categories_before": total_before,
        "total_categories_after": total_after,
        "pruned_categories": total_before - total_after,
        "survival_ratio": round(total_after / total_before, 4) if total_before else 0
    })

    with ctx.span("storage"):
        with ctx.span("recreate_database", db_path=str(DB_PATH)):
            recreate_costco_db(DB_PATH)

        with ctx.span("persist_products", product_count=len(products_flat)):
            persist_products(DB_PATH, products_flat)

        with ctx.span("persist_product_categories"):
            rel_metrics = persist_product_categories(DB_PATH, products_flat)

            avg_links = round(
                rel_metrics["relations_inserted"] / len(products_flat),
                4
            ) if products_flat else 0

            ctx.event(
                "product_category_relationship_summary",
                stage="persist_product_categories",
                total_relations=rel_metrics["relations_inserted"],
                unique_categories_linked=rel_metrics["unique_categories_linked"],
                avg_categories_per_product=avg_links
            )

        with ctx.span("persist_category_map"):
            persist_category_map(DB_PATH, clean_category_tree)

        with ctx.span("persist_category_metrics"):
            persist_category_metrics(DB_PATH, clean_category_tree)

def main():
    parser = argparse.ArgumentParser(description="Costco ETL Runner")

    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run Costco scraper in demo mode (single category)"
    )

    args = parser.parse_args()

    ctx = RunContext(run_name="costco_data_etl_main")

    try:
        asyncio.run(run_pipeline(ctx, demo=args.demo))
        ctx.finalize(status="success")
    except Exception:
        ctx.finalize(status="error")
        raise

if __name__ == "__main__":
    main()
