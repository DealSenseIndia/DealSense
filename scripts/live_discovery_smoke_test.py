"""
DealSense Phase 4.2 Layer 2B Controlled Live Candidate Discovery Smoke Test.

Runs live candidate discovery:
- Amazon India (up to 10 queries)
- Flipkart India (up to 10 queries)

Audits & Records:
- Raw candidates discovered per merchant
- Valid merchant identifiers (ASINs/PIDs) & URLs verified
- Duplicate candidates filtered
- Unique candidates enqueued
- Worker intake cycle processing: accepted, rejected, listings created, listings reused
- Synthetic observations (MUST BE 0)
- DealCandidates created (MUST BE 0)
"""
import os
import sys
from pathlib import Path

# Ensure repo root is in sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from datetime import datetime, timezone
import json
from typing import Dict, Any, List
from sqlmodel import select

from backend.database import get_session, init_db
from backend.models import (
    DiscoveryCandidate,
    Product,
    MerchantListing,
    PriceObservation,
)
from backend.services.discovery.sources.amazon import AmazonDiscoverySource
from backend.services.discovery.sources.flipkart import FlipkartDiscoverySource
from backend.services.discovery.queue import queue_service
from backend.services.discovery.worker import discovery_worker
from backend.services.discovery.analytics import get_discovery_analytics


def run_live_smoke_test(max_queries: int = 10) -> Dict[str, Any]:
    print("=" * 70)
    print("DEALSENSE PHASE 4.2 LAYER 2B CONTROLLED LIVE DISCOVERY SMOKE TEST")
    print("=" * 70)

    # 1. Initialize DB
    init_db()

    with get_session() as session:
        init_prod_count = len(session.exec(select(Product)).all())
        init_listing_count = len(session.exec(select(MerchantListing)).all())
        init_obs_count = len(session.exec(select(PriceObservation)).all())
        init_cand_count = len(session.exec(select(DiscoveryCandidate)).all())

    print(f"Pre-test Database Baseline:")
    print(f"  Products:            {init_prod_count}")
    print(f"  MerchantListings:    {init_listing_count}")
    print(f"  PriceObservations:   {init_obs_count}")
    print(f"  DiscoveryCandidates: {init_cand_count}")
    print("-" * 70)

    # 2. Execute Amazon Live Discovery (up to max_queries)
    print(f"Step 1: Executing Amazon India Live Discovery (max {max_queries} queries)...")
    amz_source = AmazonDiscoverySource(use_fixture=False)
    amz_payloads = amz_source.discover_candidates(max_queries=max_queries, candidates_per_query=20)

    # Verify Amazon merchant identifiers and clean URLs
    amz_valid_identifiers = 0
    amz_malformed = 0
    for p in amz_payloads:
        if p.merchant_product_id and len(p.merchant_product_id) == 10 and "amazon.in/dp/" in p.clean_url:
            amz_valid_identifiers += 1
        else:
            amz_malformed += 1

    print(f"  -> Amazon Discovered: {len(amz_payloads)} candidates")
    print(f"  -> Amazon Valid Identifiers (ASIN): {amz_valid_identifiers}")
    print(f"  -> Amazon Malformed: {amz_malformed}")

    # 3. Execute Flipkart Live Discovery (up to max_queries)
    print("-" * 70)
    print(f"Step 2: Executing Flipkart Live Discovery (max {max_queries} queries)...")
    fk_source = FlipkartDiscoverySource(use_fixture=False)
    fk_payloads = fk_source.discover_candidates(max_queries=max_queries, candidates_per_query=20)

    # Verify Flipkart merchant identifiers and clean URLs
    fk_valid_identifiers = 0
    fk_malformed = 0
    for p in fk_payloads:
        if p.merchant_product_id and len(p.merchant_product_id) >= 8 and "flipkart.com" in p.clean_url:
            fk_valid_identifiers += 1
        else:
            fk_malformed += 1

    print(f"  -> Flipkart Discovered: {len(fk_payloads)} candidates")
    print(f"  -> Flipkart Valid Identifiers (PID): {fk_valid_identifiers}")
    print(f"  -> Flipkart Malformed: {fk_malformed}")

    # 4. Enqueueing with Deduplication
    print("-" * 70)
    print("Step 3: Enqueueing candidates into candidate queue...")
    all_payloads = amz_payloads + fk_payloads
    enqueued_candidates = []
    duplicate_count = 0
    seen_keys = set()

    with get_session() as session:
        for p in all_payloads:
            if p.dedupe_key in seen_keys:
                duplicate_count += 1
            else:
                seen_keys.add(p.dedupe_key)
            cand = queue_service.enqueue(p, session=session)
            enqueued_candidates.append(cand)

    unique_candidates = len(seen_keys)
    print(f"  -> Total Raw Candidates: {len(all_payloads)}")
    print(f"  -> In-batch / Existing Duplicates Filtered: {duplicate_count}")
    print(f"  -> Unique Candidates Queued: {unique_candidates}")

    # 5. Process Batch with DiscoveryWorker
    print("-" * 70)
    print("Step 4: Running DiscoveryWorker intake cycle (batch_size=10)...")
    cycle_summary = discovery_worker.run_discovery_cycle(batch_size=10)
    print(f"  Dequeued:       {cycle_summary['dequeued']}")
    print(f"  Accepted:       {cycle_summary['accepted']}")
    print(f"  Failed / Retry: {cycle_summary['failed']}")
    print(f"  Rejected:       {cycle_summary['rejected']}")

    # 6. Post-Run Database Audit
    with get_session() as session:
        final_prod_count = len(session.exec(select(Product)).all())
        final_listing_count = len(session.exec(select(MerchantListing)).all())
        final_obs_count = len(session.exec(select(PriceObservation)).all())
        final_cand_count = len(session.exec(select(DiscoveryCandidate)).all())

        # Check for synthetic / fabricated observations
        all_obs = session.exec(select(PriceObservation)).all()
        synthetic_obs_count = sum(
            1 for o in all_obs
            if getattr(o, "confidence", "") == "synthetic"
            or o.price is None
            or o.price <= 0
        )

        # Check for deal candidates created in candidate pool
        deal_candidates_count = len(
            session.exec(
                select(DiscoveryCandidate).where(DiscoveryCandidate.status == "DEAL_CANDIDATE")
            ).all()
        )

        # Analytics breakdown
        analytics = get_discovery_analytics(session=session)

    delta_products = final_prod_count - init_prod_count
    delta_listings = final_listing_count - init_listing_count
    delta_obs = final_obs_count - init_obs_count
    listings_reused = max(0, cycle_summary["accepted"] - delta_listings)

    print("=" * 70)
    print("PHASE 4.2 LAYER 2B LIVE DISCOVERY SMOKE TEST AUDIT")
    print("=" * 70)
    print(f"Amazon Raw Candidates:        {len(amz_payloads)}")
    print(f"Amazon Valid ASINs:           {amz_valid_identifiers}")
    print(f"Amazon Unique Candidates:     {len(set(p.dedupe_key for p in amz_payloads))}")
    print(f"Flipkart Raw Candidates:      {len(fk_payloads)}")
    print(f"Flipkart Valid PIDs:          {fk_valid_identifiers}")
    print(f"Flipkart Unique Candidates:   {len(set(p.dedupe_key for p in fk_payloads))}")
    print(f"Total Raw Inputs:             {len(all_payloads)}")
    print(f"Duplicate Candidates:         {duplicate_count}")
    print(f"Unique Candidates Queued:     {unique_candidates}")
    print(f"Worker Batch Accepted:        {cycle_summary['accepted']}")
    print(f"Worker Batch Rejected:        {cycle_summary['rejected']}")
    print(f"Listings Created (delta):     {delta_listings}")
    print(f"Listings Reused:              {listings_reused}")
    print(f"Products Created (delta):     {delta_products}")
    print(f"PriceObservations (delta):    {delta_obs}")
    print(f"Synthetic Observations:       {synthetic_obs_count} (MUST BE 0)")
    print(f"DealCandidates Created:       {deal_candidates_count} (MUST BE 0)")
    print("=" * 70)

    report = {
        "amazon_raw": len(amz_payloads),
        "amazon_unique": len(set(p.dedupe_key for p in amz_payloads)),
        "amazon_valid_asin": amz_valid_identifiers,
        "flipkart_raw": len(fk_payloads),
        "flipkart_unique": len(set(p.dedupe_key for p in fk_payloads)),
        "flipkart_valid_pid": fk_valid_identifiers,
        "total_raw": len(all_payloads),
        "duplicates": duplicate_count,
        "unique_queued": unique_candidates,
        "accepted": cycle_summary["accepted"],
        "rejected": cycle_summary["rejected"],
        "delta_listings": delta_listings,
        "listings_reused": listings_reused,
        "delta_products": delta_products,
        "delta_observations": delta_obs,
        "synthetic_observations": synthetic_obs_count,
        "deal_candidates": deal_candidates_count,
        "analytics": analytics,
    }
    return report


if __name__ == "__main__":
    max_q = 10
    if len(sys.argv) > 1:
        try:
            max_q = int(sys.argv[1])
        except ValueError:
            pass

    report = run_live_smoke_test(max_queries=max_q)

    if report["synthetic_observations"] > 0:
        print("FAIL: Synthetic observations detected!")
        sys.exit(1)
    if report["deal_candidates"] > 0:
        print("FAIL: DealCandidates were created during discovery!")
        sys.exit(1)

    print("SUCCESS: Phase 4.2 Layer 2B Live Discovery Smoke Test PASSED!")
    sys.exit(0)
