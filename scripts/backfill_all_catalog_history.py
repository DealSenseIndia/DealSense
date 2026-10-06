"""
Catalog-Wide Competitor History Backfill Script:
Scans all active merchant listings in SQLite that have insufficient price history (< 3 observations),
queries competitor archives (PriceBefore) for genuine daily historical observations (up to 365 days),
and persists them into PriceObservation rows with alert evaluation and serverless feed synchronization.
"""

import argparse
import logging
import random
import sys
import time
from pathlib import Path

# Add project root to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from sqlmodel import select
from backend.database import get_session
from backend.models import MerchantListing, PriceObservation, Product
from backend.services.competitor_adapter import bootstrap_listing_history
from scripts.sync_deals_to_serverless import generate_curated_deals_feed

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def backfill_catalog(min_existing_points: int = 3, limit: int = 0):
    print("=== STARTING CATALOG-WIDE COMPETITOR PRICE HISTORY BACKFILL ===")

    with get_session() as session:
        # 1. Fetch active listings
        all_listings = session.exec(
            select(MerchantListing).where(MerchantListing.active == True)
        ).all()
        print(f"Total active listings in database: {len(all_listings)}")

        # 2. Filter candidates needing history, skipping duplicate URLs
        candidates = []
        seen_urls = set()
        for l in all_listings:
            target_url = l.clean_url or l.url
            if not target_url or target_url in seen_urls:
                continue
            seen_urls.add(target_url)

            obs_count = len(
                session.exec(
                    select(PriceObservation).where(PriceObservation.listing_id == l.id)
                ).all()
            )
            if obs_count < min_existing_points:
                candidates.append((l, obs_count))

        print(f"Listings needing historical backfill (< {min_existing_points} points): {len(candidates)}")

        if limit > 0:
            candidates = candidates[:limit]
            print(f"Applying limit: processing first {limit} listings.")

    if not candidates:
        print("All listings already have sufficient price history! Nothing to backfill.")
        return

    enriched_listings = 0
    total_observations_added = 0

    for idx, (listing, existing_count) in enumerate(candidates, start=1):
        target_url = listing.clean_url or listing.url
        if not target_url:
            continue

        with get_session() as session:
            prod = session.get(Product, listing.product_id) if listing.product_id else None
            raw_title = prod.canonical_title if prod else (listing.title_at_merchant or f"Listing #{listing.id}")
            safe_title = raw_title.encode("ascii", "replace").decode("ascii")

        print(f"[{idx}/{len(candidates)}] Listing #{listing.id} ({listing.merchant}) - {safe_title[:45]} (current: {existing_count} pts)...")

        try:
            with get_session() as session:
                inserted = bootstrap_listing_history(
                    session=session,
                    listing_id=listing.id,
                    product_url=target_url,
                    max_days=365,
                )

            if inserted > 0:
                enriched_listings += 1
                total_observations_added += inserted
                print(f"  -> Successfully added {inserted} daily observations!")
            else:
                print("  -> No competitor history available for this URL.")

            # Gentle randomized politeness jitter
            time.sleep(random.uniform(0.2, 0.4))

        except Exception as e:
            print(f"  -> Error backfilling listing #{listing.id}: {e}")

    print("\n=== BACKFILL SUMMARY ===")
    print(f"Candidate listings processed: {len(candidates)}")
    print(f"Listings enriched with real curves: {enriched_listings}")
    print(f"Total historical observations added: {total_observations_added}")

    # 3. Synchronize newly enriched hero deals into serverless feeds
    print("\nSynchronizing updated deals into live feeds and serverless endpoints...")
    try:
        generate_curated_deals_feed()
    except Exception as e:
        print(f"Warning: Failed to sync serverless feeds: {e}")

    print("=== BACKFILL PIPELINE COMPLETE ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill competitor price history across catalog listings.")
    parser.add_argument("--min-points", type=int, default=3, help="Backfill listings with fewer than this many points (default: 3)")
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of listings to process (0 = all)")
    args = parser.parse_args()

    backfill_catalog(min_existing_points=args.min_points, limit=args.limit)
