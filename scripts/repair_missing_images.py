"""
Inspect and repair products with missing or placeholder images in DealSense SQLite database.
"""
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.database import get_session
from backend.models import Product, MerchantListing
from backend.extractor import extract_product_data
from sqlmodel import select

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_images")

def repair_products():
    with get_session() as session:
        products = session.exec(select(Product)).all()
        logger.info(f"Checking {len(products)} products in database...")

        repaired_count = 0
        for p in products:
            needs_repair = (
                not p.image_url 
                or not p.images_json 
                or p.image_url == "/assets/placeholder-product.png"
                or "505740420928" in (p.image_url or "")
            )
            if not needs_repair:
                continue

            listings = session.exec(select(MerchantListing).where(MerchantListing.product_id == p.id)).all()
            if not listings:
                logger.warning(f"Product #{p.id} ({p.canonical_title}) has no listings.")
                continue

            target_listing = listings[0]
            url_to_scrape = target_listing.clean_url or target_listing.url
            logger.info(f"Repairing Product #{p.id} ({p.canonical_title}) from {url_to_scrape}...")

            try:
                extracted = extract_product_data(url_to_scrape)
                if extracted and extracted.image_url:
                    p.image_url = extracted.image_url
                    if extracted.images:
                        p.images_json = json.dumps(extracted.images)
                    else:
                        p.images_json = json.dumps([extracted.image_url])
                    
                    if extracted.rating and not p.rating:
                        p.rating = extracted.rating
                    if extracted.ratings_count and not p.ratings_count:
                        p.ratings_count = extracted.ratings_count
                    if extracted.bought_past_month and not p.bought_count:
                        p.bought_count = extracted.bought_past_month

                    session.add(p)
                    session.commit()
                    session.refresh(p)
                    repaired_count += 1
                    logger.info(f"Successfully repaired #{p.id}: {p.image_url}")
                else:
                    logger.warning(f"Could not extract image for #{p.id}")
            except Exception as ex:
                logger.error(f"Failed to repair #{p.id}: {ex}")

        logger.info(f"Done! Repaired {repaired_count} products.")

if __name__ == "__main__":
    repair_products()
