"""
Targeted Deep Purge:
Purges old test fixture residues (399+ records) and out-of-scope categories (Kajal, Footwear, Furniture, None)
while categorizing legitimate products (Hisense TV -> tvs).
"""

import sys
import sqlite3
from pathlib import Path

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

OUT_OF_SCOPE_CATS = [
    "kajal", "footwear", "fashion", "furniture", "bar", "storage boxes",
    "sheet & pillowcase sets", "carpets", "video game chairs", "cosmetic display cases"
]


def deep_clean():
    print("=== DEALSENSE TARGETED DEEP CLEAN ===")

    with get_session() as session:
        all_products = session.exec(select(Product)).all()
        to_delete_ids = []

        for p in all_products:
            t = (p.canonical_title or "").lower()
            cat = (p.category or "").lower()

            # 1. Test residue identification
            is_test = any(tok in t for tok in [
                "test ", "worker test", "integrity test", "univ p", "failed scrape",
                "unique rated", "image-less", "discontinued gizmo", "vintage walkman", "searchunique"
            ])

            # 2. Out of scope category
            is_bad_cat = cat in OUT_OF_SCOPE_CATS

            # 3. Category None with no real tech keyword
            is_none_junk = False
            if p.category is None:
                if any(w in t for w in ["tv", "led", "smart", "television"]):
                    p.category = "tvs"
                    session.add(p)
                elif any(w in t for w in ["phone", "mobile", "galaxy", "iphone", "redmi", "motorola"]):
                    p.category = "mobiles"
                    session.add(p)
                elif any(w in t for w in ["headphone", "audio", "earbuds", "speaker", "soundbar"]):
                    p.category = "audio"
                    session.add(p)
                elif any(w in t for w in ["laptop", "notebook", "macbook", "computer"]):
                    p.category = "laptops"
                    session.add(p)
                elif any(w in t for w in ["fryer", "purifier", "vacuum", "cooker", "heater"]):
                    p.category = "appliances"
                    session.add(p)
                else:
                    is_none_junk = True

            if is_test or is_bad_cat or is_none_junk:
                to_delete_ids.append(p.id)

        session.commit()
        print(f"Products to deep purge: {len(to_delete_ids)} out of {len(all_products)}")

        # Cascade purge in chunks
        chunk_size = 200
        for i in range(0, len(to_delete_ids), chunk_size):
            chunk = to_delete_ids[i:i + chunk_size]

            # Discovery events
            events = session.exec(select(ProductDiscoveryEvent).where(ProductDiscoveryEvent.product_id.in_(chunk))).all()
            for e in events:
                session.delete(e)

            # Alerts
            alerts = session.exec(select(PriceAlert).where(PriceAlert.product_id.in_(chunk))).all()
            for al in alerts:
                session.delete(al)

            # Setup items
            s_items = session.exec(select(SetupItem).where(SetupItem.product_id.in_(chunk))).all()
            for si in s_items:
                session.delete(si)

            # Listings and their children
            listings = session.exec(select(MerchantListing).where(MerchantListing.product_id.in_(chunk))).all()
            l_ids = [l.id for l in listings]
            if l_ids:
                obs = session.exec(select(PriceObservation).where(PriceObservation.listing_id.in_(l_ids))).all()
                for o in obs:
                    session.delete(o)
                offers = session.exec(select(Offer).where(Offer.listing_id.in_(l_ids))).all()
                for off in offers:
                    session.delete(off)
                l_alerts = session.exec(select(PriceAlert).where(PriceAlert.listing_id.in_(l_ids))).all()
                for la in l_alerts:
                    session.delete(la)
                for l in listings:
                    session.delete(l)

            # Variants
            variants = session.exec(select(ProductVariant).where(ProductVariant.product_id.in_(chunk))).all()
            for v in variants:
                session.delete(v)

            # Products
            prods = session.exec(select(Product).where(Product.id.in_(chunk))).all()
            for p in prods:
                session.delete(p)

            session.commit()

        # Clean report
        remaining = session.exec(select(Product)).all()
        cats = session.exec(select(Product.category)).all()
        cat_counts = {}
        for c in cats:
            cat_counts[c] = cat_counts.get(c, 0) + 1

        print("\n=== FINAL CLEAN CATALOG INVENTORY ===")
        print(f"Total Clean Products: {len(remaining)}")
        for c, count in sorted(cat_counts.items(), key=lambda x: str(x[0])):
            print(f"  - {c}: {count} products")

    conn = sqlite3.connect(ROOT_DIR / "data" / "deal_intelligence.db")
    conn.execute("VACUUM")
    conn.close()
    print("Vacuum complete.")


if __name__ == "__main__":
    deep_clean()
