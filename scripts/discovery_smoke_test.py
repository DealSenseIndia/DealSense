"""
DealSense Phase 4.2 Controlled Autonomous Discovery Smoke Test.
Seeds exactly 5 curated benchmark candidates, runs DiscoveryWorker intake cycle,
and reports exact candidate, product, listing, observation, and deduplication metrics.
"""
from datetime import datetime, timezone
import json
import sys
from typing import Dict, Any
from sqlmodel import select, func

from backend.database import get_session, init_db
from backend.models import (
    DiscoveryCandidate,
    Product,
    MerchantListing,
    PriceObservation,
)
from backend.services.discovery.sources.curated_seed import CuratedSeedSource, DEFAULT_CURATED_BENCHMARKS
from backend.services.discovery.queue import queue_service
from backend.services.discovery.worker import discovery_worker


def run_controlled_smoke_test() -> Dict[str, Any]:
    print("=" * 60)
    print("DEALSENSE PHASE 4.2 CONTROLLED DISCOVERY SMOKE TEST")
    print("=" * 60)

    # 1. Initialize DB
    init_db()

    with get_session() as session:
        init_prod_count = len(session.exec(select(Product)).all())
        init_listing_count = len(session.exec(select(MerchantListing)).all())
        init_obs_count = len(session.exec(select(PriceObservation)).all())
        init_cand_count = len(session.exec(select(DiscoveryCandidate)).all())

    print(f"Pre-test Database Baseline:")
    print(f"  Products: {init_prod_count}")
    print(f"  MerchantListings: {init_listing_count}")
    print(f"  PriceObservations: {init_obs_count}")
    print(f"  DiscoveryCandidates: {init_cand_count}")
    print("-" * 60)

    # 2. Seed exactly 5 Curated Candidates
    source = CuratedSeedSource(seed_items=DEFAULT_CURATED_BENCHMARKS)
    payloads = source.fetch_candidates()
    print(f"Step 1: CuratedSeedSource produced {len(payloads)} CandidatePayload items.")

    enqueued_ids = []
    with get_session() as session:
        for p in payloads:
            cand = queue_service.enqueue(p, session=session)
            enqueued_ids.append(cand.id)
            print(f"  -> Enqueued #{cand.id}: [{cand.merchant}] {cand.dedupe_key} ({cand.status})")

    candidates_discovered = len(payloads)

    # 3. Run Discovery Intake Cycle
    print("-" * 60)
    print("Step 2: Running DiscoveryWorker intake cycle (batch_size=5)...")
    cycle_summary = discovery_worker.run_discovery_cycle(batch_size=5)

    print(f"  Dequeued: {cycle_summary['dequeued']}")
    print(f"  Accepted: {cycle_summary['accepted']}")
    print(f"  Failed / Retry: {cycle_summary['failed']}")
    print(f"  Rejected: {cycle_summary['rejected']}")

    # 4. Post-run Database Audit
    with get_session() as session:
        final_prod_count = len(session.exec(select(Product)).all())
        final_listing_count = len(session.exec(select(MerchantListing)).all())
        final_obs_count = len(session.exec(select(PriceObservation)).all())
        final_cand_count = len(session.exec(select(DiscoveryCandidate)).all())

        # Inspect the 5 seeded candidates
        seeded_ids = enqueued_ids
        candidates_in_db = session.exec(
            select(DiscoveryCandidate).where(DiscoveryCandidate.id.in_(seeded_ids))
        ).all()

        accepted_count = sum(
            1 for c in candidates_in_db if c.status in ("IDENTIFIED", "OBSERVED", "TRACKING")
        )
        rejected_count = sum(
            1 for c in candidates_in_db if c.status == "REJECTED"
        )
        retry_count = sum(
            1 for c in candidates_in_db if c.status in ("RETRY", "FAILED")
        )

        # Check for synthetic observations
        # Synthetic observations would have confidence='synthetic' or price=None or price <= 0
        all_obs = session.exec(select(PriceObservation)).all()
        synthetic_obs_count = sum(
            1 for o in all_obs
            if getattr(o, "confidence", "") == "synthetic"
            or o.price is None
            or o.price <= 0
        )

        # Check for duplicate listings
        all_listings = session.exec(select(MerchantListing)).all()
        seen_pids = set()
        duplicate_listings_count = 0
        for l in all_listings:
            key = (l.merchant, l.merchant_product_id)
            if key in seen_pids:
                duplicate_listings_count += 1
            else:
                seen_pids.add(key)

    new_products_created = final_prod_count - init_prod_count
    new_listings_created = final_listing_count - init_listing_count
    new_obs_created = final_obs_count - init_obs_count

    print("=" * 60)
    print("PHASE 4.2 SMOKE TEST RESULTS AUDIT")
    print("=" * 60)
    print(f"Candidates Discovered:     {candidates_discovered}")
    print(f"Candidates Accepted:       {accepted_count}")
    print(f"Candidates Rejected:       {rejected_count}")
    print(f"Candidates In Retry:       {retry_count}")
    print(f"Products Created (delta):  {new_products_created} (Total: {final_prod_count})")
    print(f"Listings Created (delta):  {new_listings_created} (Total: {final_listing_count})")
    print(f"Observations Created:      {new_obs_created} (Total: {final_obs_count})")
    print(f"Synthetic Observations:    {synthetic_obs_count} (MUST BE 0)")
    print(f"Duplicate Listings:        {duplicate_listings_count} (MUST BE 0)")
    print("=" * 60)

    report = {
        "candidates_discovered": candidates_discovered,
        "candidates_accepted": accepted_count,
        "candidates_rejected": rejected_count,
        "candidates_in_retry": retry_count,
        "products_created_delta": new_products_created,
        "total_products": final_prod_count,
        "listings_created_delta": new_listings_created,
        "total_listings": final_listing_count,
        "observations_created_delta": new_obs_created,
        "total_observations": final_obs_count,
        "synthetic_observations": synthetic_obs_count,
        "duplicate_listings": duplicate_listings_count,
    }
    return report


if __name__ == "__main__":
    report = run_controlled_smoke_test()
    if report["synthetic_observations"] > 0:
        print("FAIL: Synthetic observations detected!")
        sys.exit(1)
    if report["duplicate_listings"] > 0:
        print("FAIL: Duplicate merchant listings detected!")
        sys.exit(1)
    print("SUCCESS: Phase 4.2 smoke test passed with ZERO synthetic observations and ZERO duplicate listings.")
    sys.exit(0)
