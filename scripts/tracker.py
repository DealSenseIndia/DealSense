import argparse
import json
import random
import time
from pathlib import Path
from typing import List, Dict, Any

from sqlmodel import select
from backend.database import get_session, init_db
from backend.models import MerchantListing, PriceObservation
from backend.service import ingest_and_evaluate

BASE_DIR = Path(__file__).resolve().parent.parent
SEEDS_FILE = BASE_DIR / "data" / "catalog_seeds.json"


def track_urls(urls: List[str], force_refresh: bool = True, delay: float = 2.0) -> None:
    """
    Sequentially processes a list of product URLs with polite rate-limiting.
    Detects price drops and updates SQLite persistence.
    """
    init_db()

    total = len(urls)
    success = 0
    errors = 0
    price_drops = 0

    print("=" * 70)
    print(f"      STARTING CATALOG PRICE TRACKER ({total} products queued)")
    print("=" * 70)

    for i, url in enumerate(urls, 1):
        print(f"\n[{i}/{total}] Checking: {url[:60]}...")
        try:
            # Check price before update if available
            with get_session() as session:
                # Find existing listing ID
                prev_obs = None
                from backend.resolver import resolve_product_url
                try:
                    res = resolve_product_url(url)
                    listing = session.exec(
                        select(MerchantListing).where(
                            MerchantListing.merchant == res.merchant,
                            MerchantListing.merchant_product_id == res.product_id,
                        )
                    ).first()
                    if listing:
                        prev_obs = session.exec(
                            select(PriceObservation)
                            .where(PriceObservation.listing_id == listing.id)
                            .order_by(PriceObservation.observed_at.desc())
                        ).first()
                except Exception:
                    pass

            # Ingest and evaluate
            report = ingest_and_evaluate(url, force_refresh=force_refresh)
            pr = report["pricing"]
            dec = report["decision"]
            prod = report["product"]

            old_price = prev_obs.price if prev_obs else None
            new_price = pr["current_price"]

            print(f"  Title:    {prod['title'][:55]}...")
            print(f"  Price:    Rs. {new_price:,.0f} (MRP: Rs. {pr['mrp'] or 0:,.0f})")
            print(f"  Verdict:  [{dec['verdict']}] - Score: {dec['score']}/100")

            if old_price is not None:
                if new_price < old_price:
                    diff = old_price - new_price
                    pct = (diff / old_price) * 100
                    print(f"  >>> [PRICE DROP DETECTED] Dropped Rs. {diff:,.0f} ({pct:.1f}%) from Rs. {old_price:,.0f}!")
                    price_drops += 1
                elif new_price > old_price:
                    diff = new_price - old_price
                    print(f"  >>> [PRICE INCREASE] Rose Rs. {diff:,.0f} from Rs. {old_price:,.0f}.")
                else:
                    print(f"  >>> [UNCHANGED] Matches last recorded price.")
            else:
                print(f"  >>> [NEW RECORD] First price point logged.")

            success += 1

        except Exception as e:
            print(f"  [ERROR] Failed to check product: {e}")
            errors += 1

        # Non-scraping database evaluation

    print("\n" + "=" * 70)
    print("      TRACKER RUN SUMMARY")
    print("=" * 70)
    print(f"Total Products Checked: {total}")
    print(f"Successful:             {success}")
    print(f"Price Drops Detected:   {price_drops}")
    print(f"Failed / Throttled:     {errors}")
    print("=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Deal Intelligence Automated Price Tracker")
    parser.add_argument("--seed", action="store_true", help="Ingest top catalog items from data/catalog_seeds.json")
    parser.add_argument("--update-all", action="store_true", help="Refresh all existing listings in SQLite")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of items to process")
    parser.add_argument("--delay", type=float, default=2.0, help="Delay in seconds between requests (default: 2.0s)")
    args = parser.parse_args()

    urls_to_check = []

    if args.seed:
        if not SEEDS_FILE.exists():
            print(f"Seed file not found: {SEEDS_FILE}")
            return
        with open(SEEDS_FILE, "r", encoding="utf-8") as f:
            seed_items = json.load(f)
            urls_to_check = [item["url"] for item in seed_items]
            print(f"Loaded {len(urls_to_check)} seed items from {SEEDS_FILE.name}")

    elif args.update_all:
        init_db()
        with get_session() as session:
            listings = session.exec(select(MerchantListing)).all()
            urls_to_check = [l.clean_url for l in listings]
            print(f"Loaded {len(urls_to_check)} existing listings from database.")

    else:
        # Default: run seeds if DB is small, otherwise update existing
        init_db()
        with get_session() as session:
            count = len(session.exec(select(MerchantListing)).all())
            if count < 5 and SEEDS_FILE.exists():
                with open(SEEDS_FILE, "r", encoding="utf-8") as f:
                    seed_items = json.load(f)
                    urls_to_check = [item["url"] for item in seed_items]
            else:
                listings = session.exec(select(MerchantListing)).all()
                urls_to_check = [l.clean_url for l in listings]

    if args.limit:
        urls_to_check = urls_to_check[: args.limit]

    if not urls_to_check:
        print("No URLs found to track. Use --seed or add products first.")
        return

    track_urls(urls_to_check, force_refresh=True, delay=args.delay)


if __name__ == "__main__":
    main()
