"""
DealSense Dynamic Category & Taxonomy Classification Engine.
Classifies incoming products against a 3-tier taxonomy tree or dynamically creates
new, clean categories on the fly to support self-expanding product graphs.
"""

from datetime import datetime, timezone
import logging
import re
from typing import Optional, Tuple, List, Dict, Any
from sqlmodel import Session, select

from backend.models import Category

logger = logging.getLogger(__name__)

# Core keyword rules mapping common shopping intents to canonical category names and root parents
CORE_TAXONOMY_MAP: List[Dict[str, Any]] = [
    {
        "keywords": ["smartwatch", "apple watch", "galaxy watch", "fitness band", "smart band", "smart-watch", "fire-boltt", "noise colorfit", "boat wave"],
        "name": "Smartwatches",
        "slug": "smartwatches",
        "parent_slug": "electronics",
        "parent_name": "Electronics",
    },
    {
        "keywords": ["iphone", "smartphone", "mobile phone", "5g phone", "nord", "galaxy", "redmi", "realme", "pixel", "oneplus", "motorola", "iqoo", "poco", "xiaomi", "oppo", "vivo"],
        "name": "Smartphones",
        "slug": "smartphones",
        "parent_slug": "mobiles-accessories",
        "parent_name": "Mobiles & Accessories",
    },
    {
        "keywords": ["laptop", "macbook", "notebook", "gaming laptop", "chromebook", "thinkpad", "vivobook", "ideapad", "yoga"],
        "name": "Laptops",
        "slug": "laptops",
        "parent_slug": "computers-accessories",
        "parent_name": "Computers & Accessories",
    },
    {
        "keywords": ["headphone", "earphone", "earbuds", "airpods", "tws", "over-ear", "in-ear", "anc", "neckband", "wireless earbuds"],
        "name": "Headphones",
        "slug": "headphones",
        "parent_slug": "audio",
        "parent_name": "Audio",
    },
    {
        "keywords": ["smart tv", "television", "4k tv", "oled", "qled", "led tv", "google tv"],
        "name": "Smart TVs",
        "slug": "smart-tvs",
        "parent_slug": "electronics",
        "parent_name": "Electronics",
    },
    {
        "keywords": ["air fryer", "airfryer"],
        "name": "Air Fryers",
        "slug": "air-fryers",
        "parent_slug": "home-kitchen",
        "parent_name": "Home & Kitchen",
    },
    {
        "keywords": ["mixer grinder", "blender", "juicer", "food processor"],
        "name": "Mixer Grinders",
        "slug": "mixer-grinders",
        "parent_slug": "home-kitchen",
        "parent_name": "Home & Kitchen",
    },
    {
        "keywords": ["shoes", "sneakers", "running shoes", "footwear", "sports shoes"],
        "name": "Footwear",
        "slug": "footwear",
        "parent_slug": "fashion",
        "parent_name": "Fashion",
    },
    {
        "keywords": ["monitor", "gaming monitor", "uhd monitor", "display"],
        "name": "Monitors",
        "slug": "monitors",
        "parent_slug": "computers-accessories",
        "parent_name": "Computers & Accessories",
    },
    {
        "keywords": ["keyboard", "mechanical keyboard", "gaming keyboard"],
        "name": "Keyboards",
        "slug": "keyboards",
        "parent_slug": "computers-accessories",
        "parent_name": "Computers & Accessories",
    },
]


def _slugify(text: str) -> str:
    """Converts a title into a clean URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


def get_or_create_root_category(session: Session, name: str, slug: str) -> Category:
    """Retrieves an existing top-level category or creates one cleanly."""
    cat = session.exec(select(Category).where(Category.slug == slug)).first()
    if cat:
        return cat

    now_utc = datetime.now(timezone.utc)
    cat = Category(
        name=name,
        slug=slug,
        parent_id=None,
        is_active=True,
        created_at=now_utc,
    )
    session.add(cat)
    session.commit()
    session.refresh(cat)
    logger.info(f"Created root category: {name} ({slug})")
    return cat


def classify_and_assign_category(
    session: Session,
    title: str,
    brand: Optional[str] = None,
    raw_category: Optional[str] = None,
) -> Tuple[int, str]:
    """
    Identifies or dynamically creates the most accurate Category for a product.
    Guarantees that every product is linked to a valid Category record.
    Returns: (category_id, category_name)
    """
    search_text = f"{title} {brand or ''} {raw_category or ''}".lower()

    # 1. Match against Core Taxonomy Rules (Fast path)
    for rule in CORE_TAXONOMY_MAP:
        if any(re.search(rf"\b{re.escape(k)}\b", search_text) for k in rule["keywords"]):
            # Check if category exists in DB by slug
            cat = session.exec(select(Category).where(Category.slug == rule["slug"])).first()
            if not cat:
                # Also check by name
                cat = session.exec(select(Category).where(Category.name.ilike(rule["name"]))).first()

            if cat:
                return cat.id, cat.name

            # Category doesn't exist in DB: create root parent then child category
            parent = get_or_create_root_category(session, rule["parent_name"], rule["parent_slug"])
            now_utc = datetime.now(timezone.utc)
            new_cat = Category(
                name=rule["name"],
                slug=rule["slug"],
                parent_id=parent.id,
                is_active=True,
                created_at=now_utc,
            )
            session.add(new_cat)
            session.commit()
            session.refresh(new_cat)
            logger.info(f"Dynamically created taxonomy subcategory: {new_cat.name} under {parent.name}")
            return new_cat.id, new_cat.name

    # 2. Check if raw_category provided by merchant matches any existing Category name
    if raw_category:
        raw_slug = _slugify(raw_category)
        cat = session.exec(select(Category).where(Category.slug == raw_slug)).first()
        if not cat:
            cat = session.exec(select(Category).where(Category.name.ilike(raw_category.strip()))).first()
        if cat:
            return cat.id, cat.name

    # 3. Search existing database categories using title words
    tokens = [w for w in re.findall(r"\b[A-Za-z]{3,}\b", title) if w.lower() not in ("with", "for", "and", "the", "inch", "black", "blue", "pack")]
    for token in tokens[:5]:
        cat = session.exec(select(Category).where(Category.name.ilike(token))).first()
        if cat:
            return cat.id, cat.name

    # 4. Dynamic Propose: If completely unknown, derive clean product type from title tokens
    # e.g., "Logitech MX Master 3S Wireless Mouse" -> "Wireless Mouse"
    candidate_name = raw_category or (tokens[-1].title() if tokens else "General Electronics")
    candidate_slug = _slugify(candidate_name)

    cat = session.exec(select(Category).where(Category.slug == candidate_slug)).first()
    if cat:
        return cat.id, cat.name

    # Create root 'Electronics' or 'General' as parent
    default_parent = get_or_create_root_category(session, "Electronics", "electronics")
    now_utc = datetime.now(timezone.utc)
    dynamic_cat = Category(
        name=candidate_name.title(),
        slug=candidate_slug,
        parent_id=default_parent.id,
        is_active=True,
        created_at=now_utc,
    )
    session.add(dynamic_cat)
    session.commit()
    session.refresh(dynamic_cat)
    logger.info(f"Auto-generated new dynamic category on the fly: {dynamic_cat.name} (id={dynamic_cat.id})")
    return dynamic_cat.id, dynamic_cat.name
