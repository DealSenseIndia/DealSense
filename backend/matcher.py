"""
DealWise Cross-Store Competitor Matcher.
Unofficial Amazon & Flipkart HTML search scraping has been removed.
Matches competitor products against the local canonical database and verified catalog.
"""

import re
from dataclasses import dataclass
from typing import Optional

from sqlmodel import select

from backend.config import build_affiliate_url
from backend.database import get_session
from backend.models import Product, MerchantListing, PriceObservation


@dataclass
class CompetitorComparison:
    matched: bool
    rival_merchant: Optional[str] = None
    rival_product_id: Optional[str] = None
    rival_title: Optional[str] = None
    rival_price: Optional[float] = None
    rival_clean_url: Optional[str] = None
    rival_affiliate_url: Optional[str] = None
    price_difference: Optional[float] = None  # positive if rival is cheaper, negative if rival is more expensive
    recommendation: Optional[str] = None


# Noise words to filter out during matching
STOP_WORDS = {
    "online", "best", "price", "offers", "india", "buy", "with", "for", "and",
    "the", "pack", "set", "new", "original", "latest", "genuine", "deal"
}

# Accessory keywords to prevent matching an iPhone with an iPhone case
ACCESSORY_KEYWORDS = {
    "case", "cover", "protector", "tempered", "pouch", "strap", "sleeve",
    "cable", "adapter", "charger", "filter", "paper", "holder", "skin"
}


def _tokenize(text: str) -> set:
    """Normalizes string into a set of lower-case alphanumeric tokens."""
    tokens = set(re.findall(r"[a-z0-9]+", text.lower()))
    return {t for t in tokens if len(t) > 1 and t not in STOP_WORDS}


def _is_accessory_mismatch(source_title: str, candidate_title: str) -> bool:
    """Rejects candidate if candidate is an accessory while source product is not."""
    source_tokens = set(re.findall(r"[a-z]+", source_title.lower()))
    candidate_tokens = set(re.findall(r"[a-z]+", candidate_title.lower()))

    source_is_accessory = bool(source_tokens & ACCESSORY_KEYWORDS)
    candidate_is_accessory = bool(candidate_tokens & ACCESSORY_KEYWORDS)

    if not source_is_accessory and candidate_is_accessory:
        return True
    return False


def build_search_query(title: str, brand: Optional[str] = None) -> str:
    """Extracts concise search keywords (brand + model/key nouns) from product title."""
    model_matches = re.findall(r"\b[A-Za-z0-9]+-[A-Za-z0-9]+\b|\b[A-Za-z]{1,4}[0-9]{2,5}[A-Za-z0-9/]*\b", title)
    clean = re.sub(r"[^a-zA-Z0-9\s-]", " ", title)
    words = [w for w in clean.split() if w.lower() not in STOP_WORDS][:6]

    query_parts = []
    if brand and brand.lower() not in " ".join(words).lower():
        query_parts.append(brand)

    query_parts.extend(words[:4])
    if model_matches and model_matches[0] not in query_parts:
        query_parts.append(model_matches[0])

    return " ".join(query_parts).strip()


def find_rival_store_match(
    current_merchant: str,
    source_title: str,
    current_price: float,
    brand: Optional[str] = None,
) -> CompetitorComparison:
    """
    Finds matching competitor listing on the rival merchant from the verified local database.
    (Unofficial web search scraping has been removed).
    """
    rival_merchant = "Flipkart" if current_merchant.lower() == "amazon" else "Amazon"
    source_tokens = _tokenize(source_title)
    if brand:
        source_tokens.add(brand.lower())

    best_match = None
    best_score = 0.0

    try:
        with get_session() as session:
            # Query candidate listings on rival merchant from SQLite database
            rival_listings = session.exec(
                select(MerchantListing).where(
                    MerchantListing.merchant == rival_merchant,
                    MerchantListing.active == True,
                )
            ).all()

            for listing in rival_listings:
                prod = session.get(Product, listing.product_id) if listing.product_id else None
                cand_title = listing.title_at_merchant or (prod.canonical_title if prod else "")
                if not cand_title:
                    continue

                if _is_accessory_mismatch(source_title, cand_title):
                    continue

                cand_tokens = _tokenize(cand_title)
                if not cand_tokens:
                    continue

                if brand and brand.lower() not in cand_title.lower():
                    continue

                intersection = source_tokens & cand_tokens
                score = len(intersection) / max(len(source_tokens), 1)

                if score > best_score and score >= 0.35:
                    # Get latest price observation
                    obs = session.exec(
                        select(PriceObservation)
                        .where(PriceObservation.listing_id == listing.id)
                        .order_by(PriceObservation.observed_at.desc())
                    ).first()
                    cand_price = obs.price if obs else listing.current_price
                    best_score = score
                    best_match = (listing.merchant_product_id, cand_title, cand_price, listing.clean_url)

    except Exception:
        pass

    if not best_match:
        return CompetitorComparison(
            matched=False,
            rival_merchant=rival_merchant,
            recommendation=f"No verified exact match found on {rival_merchant}.",
        )

    cand_id, cand_title, cand_price, clean_url = best_match
    affiliate_url = build_affiliate_url(rival_merchant, clean_url)

    price_diff = None
    recommendation = None

    if cand_price is not None and cand_price > 0:
        price_diff = round(current_price - cand_price, 2)
        if price_diff > 50:
            recommendation = f"{rival_merchant} is cheaper by Rs. {price_diff:,.0f}!"
        elif price_diff < -50:
            diff_abs = abs(price_diff)
            recommendation = f"Current store ({current_merchant}) is cheaper by Rs. {diff_abs:,.0f}."
        else:
            recommendation = f"Prices are virtually identical across {current_merchant} and {rival_merchant}."
    else:
        recommendation = f"Matching item found on {rival_merchant}. Price requires verification."

    return CompetitorComparison(
        matched=True,
        rival_merchant=rival_merchant,
        rival_product_id=cand_id,
        rival_title=cand_title,
        rival_price=cand_price,
        rival_clean_url=clean_url,
        rival_affiliate_url=affiliate_url,
        price_difference=price_diff,
        recommendation=recommendation,
    )
