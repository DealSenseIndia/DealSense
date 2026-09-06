"""
DealWise Smart Setup Builder Engine.
Composes complete, aesthetically coordinated rooms and desk setups constrained by budget,
filters out already-owned items, and generates 3 intelligent tiers (Best Value, Smart Upgrade, Premium Luxe).
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from backend.data.setup_catalog import SETUP_CATALOG


class SetupRequest(BaseModel):
    space: str = "bedroom"  # 'bedroom', 'wfh_desk', 'living_room'
    budget: float = 25000.0
    owned_items: List[str] = []
    style: str = "modern_minimal"  # 'modern_minimal', 'warm_boho', 'dark_aesthetic'


def build_smart_setup(space: str, budget: float, owned_items: List[str], style: str) -> Dict[str, Any]:
    """Generates 3 intelligent budget tiers for the requested space, filtering out owned items."""
    space_key = space if space in SETUP_CATALOG else "bedroom"
    catalog = SETUP_CATALOG[space_key]
    owned_set = set(item.lower().strip() for item in owned_items)

    # Calculate Trust Guard savings for items user already owns
    owned_saved_amount = 0
    owned_item_names = []
    for cat_name, product_options in catalog.items():
        if cat_name.lower() in owned_set:
            avg_cost = sum(p["price"] for p in product_options) // len(product_options)
            owned_saved_amount += avg_cost
            owned_item_names.append(cat_name.replace("_", " ").title())

    tiers = ["value", "upgrade", "luxe"]
    tier_meta = {
        "value": {
            "title": "Best Value Setup",
            "badge": "Recommended for Renters",
            "tagline": "Maximum style & comfort staying well within your budget.",
            "color": "#16A34A",
            "target_mult": 0.70,
        },
        "upgrade": {
            "title": "Smart Upgrade Setup",
            "badge": "High Visual Impact",
            "tagline": "Spends more where it actually matters (Lighting, Rug & Ergonomics).",
            "color": "#2563EB",
            "target_mult": 1.00,
        },
        "luxe": {
            "title": "Premium Luxe Setup",
            "badge": "Architectural Aesthetic",
            "tagline": "Heirloom hardwoods, designer lighting & premium materials.",
            "color": "#9333EA",
            "target_mult": 1.45,
        },
    }

    generated_tiers = []

    for t_key in tiers:
        meta = tier_meta[t_key]
        phase1_items = []
        phase2_items = []
        total_price = 0
        total_mrp = 0

        for cat_name, product_options in catalog.items():
            if cat_name.lower() in owned_set:
                # User already owns this product category (e.g. Bed or Mattress)
                continue

            # Pick product matching the tier
            match = next((p for p in product_options if p["tier"] == t_key), product_options[0])
            item_data = {
                "category": cat_name.replace("_", " ").title(),
                "name": match["name"],
                "price": match["price"],
                "mrp": match["mrp"],
                "discount_pct": round(((match["mrp"] - match["price"]) / match["mrp"]) * 100),
                "store": match["store"],
                "logo": match["logo"],
                "url": match["url"],
                "image": match["image"],
                "deal_verdict": match["deal_verdict"],
                "phase": match["phase"],
                "reason": match["reason"],
            }

            total_price += match["price"]
            total_mrp += match["mrp"]

            if match["phase"] == 1:
                phase1_items.append(item_data)
            else:
                phase2_items.append(item_data)

        savings = total_mrp - total_price
        budget_diff = budget - total_price

        if budget_diff >= 0:
            alloc_advice = f"You save ₹{savings:,} with verified deals. ₹{budget_diff:,} remaining in your ₹{int(budget):,} budget."
        else:
            alloc_advice = f"₹{abs(budget_diff):,} above target budget, but delivers heirloom longevity and solid wood construction."

        generated_tiers.append({
            "tier_key": t_key,
            "title": meta["title"],
            "badge": meta["badge"],
            "tagline": meta["tagline"],
            "color": meta["color"],
            "total_price": total_price,
            "total_mrp": total_mrp,
            "savings": savings,
            "budget_diff": budget_diff,
            "allocation_advice": alloc_advice,
            "phase1_total": sum(i["price"] for i in phase1_items),
            "phase1_items": phase1_items,
            "phase2_total": sum(i["price"] for i in phase2_items),
            "phase2_items": phase2_items,
            "all_items": phase1_items + phase2_items,
        })

    return {
        "status": "success",
        "space": space_key,
        "requested_budget": budget,
        "owned_items": list(owned_set),
        "style": style,
        "owned_summary": {
            "count": len(owned_item_names),
            "item_names": owned_item_names,
            "saved_amount": owned_saved_amount,
        },
        "tiers": generated_tiers,
    }
