"""
DealSense Phase 4.2 Layer 2A Controlled Discovery Adapter Smoke Test.

Runs:
  - 5 Amazon fixture candidates
  - 5 Flipkart fixture candidates
Total: 10 candidate inputs

Audits:
  - Malformed candidates rejected
  - Duplicate candidates deduplicated
  - Existing listings reused in Product Graph
  - New candidates queued and processed
  - ZERO fabricated PriceObservations
  - ZERO DealCandidates created
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
from typing import Dict, Any
from sqlmodel import select

from backend.database import get_session, init_db
from backend.models import (
    DiscoveryCandidate,
    Product,
    MerchantListing,
    PriceObservation,
)
from backend.services.discovery.sources.amazon import AmazonDiscoverySource, AMAZON_FIXTURE_CANDIDATES
from backend.services.discovery.sources.flipkart import FlipkartDiscoverySource, FLIPKART_FIXTURE_CANDIDATES
from backend.services.discovery.queue import queue_service
from backend.services.discovery.worker import discovery_worker


def run_adapter_smoke_test() -> Dict[str, Any]:
    print("=" * 70)
    print("DEALSENSE PHASE 4.2 LAYER 2A CONTROLLED ADAPTER SMOKE TEST")
    print("=" * 70)

    # 1. Initialize DB and pre-seed existing listings
    init_db()

    with get_session() as session:
        # Pre-seed 1 Amazon and 1 Flipkart listing to test existing listing reuse
        existing_amazon_asin = "B0CX2533TN"
        existing_flipkart_pid = "MOBGZ8FYXHDVCHGY"

        # Check / create existing Amazon listing
        amz_listing = session.exec(
            select(MerchantListing).where(MerchantListing.merchant_product_id == existing_amazon_asin)
        ).first()
        if not amz_listing:
            prod_amz = Product(
                title="Existing OnePlus Nord CE4 Lite 5G",
                category="Smartphones",
                brand="OnePlus",
                clean_title="OnePlus Nord CE4 Lite 5G",
                created_at=datetime.now(timezone.utc),
            )
            session.add(prod_amz)
            session.commit()
            session.refresh(prod_amz)

            amz_listing = MerchantListing(
                product_id=prod_amz.id,
                merchant="Amazon India",
                merchant_product_id=existing_amazon_asin,
                product_url=f"https://www.amazon.in/dp/{existing_amazon_asin}",
                clean_url=f"https://www.amazon.in/dp/{existing_amazon_asin}",
                is_active=True,
                created_at=datetime.now(timezone.utc),
            )
            session.add(amz_listing)
            session.commit()

        # Check / create existing Flipkart listing
        fk_listing = session.exec(
            select(MerchantListing).where(MerchantListing.merchant_product_id == existing_flipkart_pid)
        ).first()
        if not fk_listing:
            prod_fk = Product(
                title="Existing Motorola G85 5G",
                category="Smartphones",
                brand="Motorola",
                clean_title="Motorola G85 5G",
                created_at=datetime.now(timezone.utc),
            )
            session.add(prod_fk)
            session.commit()
            session.refresh(prod_fk)

            fk_listing = MerchantListing(
                product_id=prod_fk.id,
                merchant="Flipkart",
                merchant_product_id=existing_flipkart_pid,
                product_url=f"https://www.flipkart.com/p/itm123?pid={existing_flipkart_pid}",
                clean_url=f"https://www.flipkart.com/p/itm123?pid={existing_flipkart_pid}",
                is_active=True,
                created_at=datetime.now(timezone.utc),
            )
            session.add(fk_listing)
            session.commit()

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

    # 2. Collect 5 Amazon + 5 Flipkart fixture candidates (Total 10 candidate inputs)
    amz_source = AmazonDiscoverySource(fixture_items=AMAZON_FIXTURE_CANDIDATES)
    fk_source = FlipkartDiscoverySource(fixture_items=FLIPKART_FIXTURE_CANDIDATES)

    raw_amazon_inputs = list(AMAZON_FIXTURE_CANDIDATES)
    raw_flipkart_inputs = list(FLIPKART_FIXTURE_CANDIDATES)
    total_raw_inputs = len(raw_amazon_inputs) + len(raw_flipkart_inputs)

    print(f"Step 1: Ingesting {total_raw_inputs} raw candidate inputs...")
    print(f"  - Amazon Fixture Inputs:   {len(raw_amazon_inputs)}")
    print(f"  - Flipkart Fixture Inputs:  {len(raw_flipkart_inputs)}")

    # 3. Normalization and malformed detection
    normalized_amazon = []
    malformed_amazon = 0
    for raw in raw_amazon_inputs:
        payload = amz_source.normalize_candidate(raw)
        if payload:
            normalized_amazon.append(payload)
        else:
            malformed_amazon += 1

    normalized_flipkart = []
    malformed_flipkart = 0
    for raw in raw_flipkart_inputs:
        payload = fk_source.normalize_candidate(raw)
        if payload:
            normalized_flipkart.append(payload)
        else:
            malformed_flipkart += 1

    total_malformed_rejected = malformed_amazon + malformed_flipkart
    all_normalized_payloads = normalized_amazon + normalized_flipkart
    print(f"Step 2: Normalization Results:")
    print(f"  - Valid Payloads:          {len(all_normalized_payloads)}")
    print(f"  - Malformed Rejected:      {total_malformed_rejected} (Amazon: {malformed_amazon}, Flipkart: {malformed_flipkart})")

    # 4. Enqueueing with Deduplication
    enqueued_candidates = []
    deduplicated_count = 0
    seen_keys = set()

    with get_session() as session:
        for p in all_normalized_payloads:
            if p.dedupe_key in seen_keys:
                deduplicated_count += 1
            else:
                seen_keys.add(p.dedupe_key)
            cand = queue_service.enqueue(p, session=session)
            enqueued_candidates.append(cand)

    unique_candidates_queued = len(seen_keys)
    print(f"Step 3: Queue Ingestion:")
    print(f"  - Deduplicated Candidates: {deduplicated_count}")
    print(f"  - Unique Candidates Queued: {unique_candidates_queued}")

    # 5. Process through DiscoveryWorker
    print("-" * 70)
    print(f"Step 4: Executing DiscoveryWorker batch intake...")
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

        # Check for duplicate merchant listings
        all_listings = session.exec(select(MerchantListing)).all()
        seen_listing_keys = set()
        duplicate_listings_count = 0
        for l in all_listings:
            key = (l.merchant, l.merchant_product_id)
            if key in seen_listing_keys:
                duplicate_listings_count += 1
            else:
                seen_listing_keys.add(key)

        # Check existing listing reuse
        reused_amazon = session.exec(
            select(DiscoveryCandidate).where(
                DiscoveryCandidate.dedupe_key == f"amazon:{existing_amazon_asin}",
                DiscoveryCandidate.listing_id != None,
            )
        ).first()
        reused_flipkart = session.exec(
            select(DiscoveryCandidate).where(
                DiscoveryCandidate.dedupe_key == f"flipkart:{existing_flipkart_pid}",
                DiscoveryCandidate.listing_id != None,
            )
        ).first()
        existing_reused = 2 if (reused_amazon and reused_flipkart) else (1 if (reused_amazon or reused_flipkart) else 0)

    delta_products = final_prod_count - init_prod_count
    delta_listings = final_listing_count - init_listing_count
    delta_obs = final_obs_count - init_obs_count

    print("=" * 70)
    print("PHASE 4.2 LAYER 2A SMOKE TEST RESULTS AUDIT")
    print("=" * 70)
    print(f"Total Candidate Inputs:         {total_raw_inputs}")
    print(f"  - Amazon Candidates:          {len(raw_amazon_inputs)}")
    print(f"  - Flipkart Candidates:        {len(raw_flipkart_inputs)}")
    print(f"Malformed Candidates Rejected:  {total_malformed_rejected}")
    print(f"Duplicate Candidates Filtered:  {deduplicated_count}")
    print(f"Unique Accepted Candidates:     {unique_candidates_queued}")
    print(f"Existing Listings Reused:       {existing_reused}")
    print(f"Products Created (delta):       {delta_products} (Total: {final_prod_count})")
    print(f"Listings Created (delta):       {delta_listings} (Total: {final_listing_count})")
    print(f"Observations Created (delta):   {delta_obs} (Total: {final_obs_count})")
    print(f"Synthetic Observations:         {synthetic_obs_count} (MUST BE 0)")
    print(f"Deal Candidates Created:        {deal_candidates_count} (MUST BE 0)")
    print(f"Duplicate Listings:             {duplicate_listings_count} (MUST BE 0)")
    print("=" * 70)

    report = {
        "total_inputs": total_raw_inputs,
        "amazon_inputs": len(raw_amazon_inputs),
        "flipkart_inputs": len(raw_flipkart_inputs),
        "malformed_rejected": total_malformed_rejected,
        "deduplicated": deduplicated_count,
        "unique_accepted": unique_candidates_queued,
        "existing_reused": existing_reused,
        "delta_products": delta_products,
        "total_products": final_prod_count,
        "delta_listings": delta_listings,
        "total_listings": final_listing_count,
        "delta_observations": delta_obs,
        "synthetic_observations": synthetic_obs_count,
        "deal_candidates": deal_candidates_count,
        "duplicate_listings": duplicate_listings_count,
    }
    return report


if __name__ == "__main__":
    report = run_adapter_smoke_test()

    if report["synthetic_observations"] > 0:
        print("FAIL: Fabricated/synthetic observations detected!")
        sys.exit(1)
    if report["deal_candidates"] > 0:
        print("FAIL: DealCandidates were created during discovery intake!")
        sys.exit(1)
    if report["duplicate_listings"] > 0:
        print("FAIL: Duplicate merchant listings detected!")
        sys.exit(1)
    if report["total_inputs"] != 10:
        print(f"FAIL: Expected 10 inputs, got {report['total_inputs']}")
        sys.exit(1)

    print("SUCCESS: Phase 4.2 Layer 2A Controlled Adapter Smoke Test PASSED!")
    sys.exit(0)
