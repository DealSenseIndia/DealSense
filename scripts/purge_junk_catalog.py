"""
Purge Junk Catalog Script:
Removes uncategorized, non-tech, and orphaned products (carpets, soap dispensers, pillows, etc.)
from DealSense database with full foreign-key cascade cleanup, while preserving valid electronics
and test products.
"""

import sys
import sqlite3
from pathlib import Path

# Add project root to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.database import get_session
from backend.models import (
    Product,
    MerchantListing,
    PriceObservation,
    ProductDiscoveryEvent,
    ProductVariant,
    Offer,
    PriceAlert,
    SetupItem,
)
from sqlmodel import select

JUNK_KEYWORDS = [
    "carpet", "pillow", "soap", "gel", "bedsheet", "towel", "kajal",
    "chandelier", "curtain", "organizer", "mat", "hanger", "candle",
    "plant", "flower", "lotion", "cream", "lipstick", "dress", "shirt",
    "sandal", "soap dispenser", "body wash", "bed sheet", "pillowcase"
]


def purge_junk():
    print("=== DEALSENSE CATALOG PURGE ===")

    with get_session() as session:
        # Step 1: Find product IDs with at least 1 observation
        prods_with_obs = set(session.exec(
            select(MerchantListing.product_id)
            .join(PriceObservation, PriceObservation.listing_id == MerchantListing.id)
        ).all())

        all_products = session.exec(select(Product)).all()
        print(f"Total products before purge: {len(all_products)}")

        to_delete_product_ids = []
        for p in all_products:
            title_lower = (p.canonical_title or "").lower()
            is_junk_title = any(kw in title_lower for kw in JUNK_KEYWORDS)
            has_obs = p.id in prods_with_obs

            # Delete if it has no observations, or if it's an explicitly out-of-scope junk item
            if not has_obs or is_junk_title:
                to_delete_product_ids.append(p.id)

        print(f"Identified {len(to_delete_product_ids)} products to purge.")

        chunk_size = 200
        total_purged = 0

        for i in range(0, len(to_delete_product_ids), chunk_size):
            chunk = to_delete_product_ids[i:i + chunk_size]

            # 1. Delete discovery events referencing these products
            disc_events = session.exec(
                select(ProductDiscoveryEvent).where(ProductDiscoveryEvent.product_id.in_(chunk))
            ).all()
            for de in disc_events:
                session.delete(de)

            # 2. Delete price alerts referencing these products
            alerts = session.exec(
                select(PriceAlert).where(PriceAlert.product_id.in_(chunk))
            ).all()
            for al in alerts:
                session.delete(al)

            # 3. Delete setup items referencing these products
            s_items = session.exec(
                select(SetupItem).where(SetupItem.product_id.in_(chunk))
            ).all()
            for si in s_items:
                session.delete(si)

            # 4. Find all listings for these products
            listings = session.exec(
                select(MerchantListing).where(MerchantListing.product_id.in_(chunk))
            ).all()
            listing_ids = [l.id for l in listings]

            if listing_ids:
                # 4a. Delete observations for these listings
                obs_to_del = session.exec(
                    select(PriceObservation).where(PriceObservation.listing_id.in_(listing_ids))
                ).all()
                for o in obs_to_del:
                    session.delete(o)

                # 4b. Delete offers for these listings
                offers = session.exec(
                    select(Offer).where(Offer.listing_id.in_(listing_ids))
                ).all()
                for off in offers:
                    session.delete(off)

                # 4c. Delete alerts referencing these listings
                l_alerts = session.exec(
                    select(PriceAlert).where(PriceAlert.listing_id.in_(listing_ids))
                ).all()
                for la in l_alerts:
                    session.delete(la)

                # 4d. Delete listings
                for l in listings:
                    session.delete(l)

            # 5. Delete product variants
            variants = session.exec(
                select(ProductVariant).where(ProductVariant.product_id.in_(chunk))
            ).all()
            for v in variants:
                session.delete(v)

            # 6. Delete the products themselves
            prods_to_del = session.exec(
                select(Product).where(Product.id.in_(chunk))
            ).all()
            for p in prods_to_del:
                session.delete(p)

            session.commit()
            total_purged += len(prods_to_del)
            print(f"Purged batch {i} to {i + len(chunk)} ({total_purged}/{len(to_delete_product_ids)})...")

        # Remaining count
        remaining_products = session.exec(select(Product)).all()
        remaining_listings = session.exec(select(MerchantListing)).all()
        remaining_obs = session.exec(select(PriceObservation)).all()

        print("\n=== PURGE SUMMARY ===")
        print(f"Products purged: {total_purged}")
        print(f"Remaining clean products: {len(remaining_products)}")
        print(f"Remaining listings: {len(remaining_listings)}")
        print(f"Remaining observations: {len(remaining_obs)}")

    # SQLite VACUUM to reclaim disk space
    db_path = ROOT_DIR / "data" / "deal_intelligence.db"
    conn = sqlite3.connect(db_path)
    conn.execute("VACUUM")
    conn.close()
    print("Database VACUUM completed.")


if __name__ == "__main__":
    purge_junk()
