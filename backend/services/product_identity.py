"""
DealSense Product Identity & Variant Normalization Engine.
Extracts canonical product attributes and exact SKU variant specifications
(e.g., Storage, RAM, Color, Size) to prevent cross-variant historical corruption.
"""

from dataclasses import dataclass, field
import re
from typing import Dict, Any, Optional, Tuple


@dataclass
class VariantIdentity:
    """Represents the exact physical/hardware variant of a product."""
    variant_name: str
    storage: Optional[str] = None
    ram: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    sku: Optional[str] = None
    raw_attributes: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_standard_or_unspecified(self) -> bool:
        return not (self.storage or self.ram or self.color or self.size)


@dataclass
class NormalizedProductIdentity:
    """Canonical representation of a product independent of store listing."""
    canonical_title: str
    brand: Optional[str] = None
    model_number: Optional[str] = None
    category: Optional[str] = None
    variant: VariantIdentity = field(default_factory=lambda: VariantIdentity(variant_name="Standard"))


# Common Indian e-commerce color palettes
COMMON_COLORS = [
    "Midnight", "Starlight", "Space Grey", "Space Gray", "Natural Titanium",
    "Desert Titanium", "Black Titanium", "White Titanium", "Deep Purple",
    "Black", "White", "Silver", "Gold", "Rose Gold", "Blue", "Navy Blue",
    "Sky Blue", "Green", "Olive", "Red", "Yellow", "Orange", "Grey", "Gray",
    "Dark Grey", "Charcoal", "Beige", "Brown", "Purple", "Pink"
]


def clean_canonical_title(raw_title: str) -> str:
    """
    Strips marketing noise, promotional badges, and distributor spam from product titles.
    """
    if not raw_title:
        return "Unknown Product"

    title = raw_title.strip()
    # Remove emojis
    title = re.sub(r"[\U00010000-\U0010ffff]", "", title)

    # Strip promotional brackets and prefixes
    patterns_to_remove = [
        r"\(Renewed\)",
        r"\(Refurbished\)",
        r"\[Limited Time Deal\]",
        r"\[Sale\]",
        r"\[Offer\]",
        r"\(\d+%\s*Off\)",
        r"with\s+No\s+Cost\s+EMI.*$",
        r"\|\s*Limited\s*Time.*$",
        r"\|\s*Bank\s*Offer.*$",
    ]
    for pat in patterns_to_remove:
        title = re.sub(pat, "", title, flags=re.IGNORECASE)

    # Clean multiple spaces
    title = re.sub(r"\s+", " ", title).strip()
    return title


def extract_variant_from_title(title: str, raw_variant_str: Optional[str] = None) -> VariantIdentity:
    """
    Extracts structured hardware and aesthetic variant specifications from title/metadata.
    Guarantees that 128GB Black and 256GB Black produce distinct variant signatures.
    """
    combined_text = f"{title} {raw_variant_str or ''}".strip()

    storage = None
    ram = None
    color = None
    size = None

    # 1. Storage Detection (e.g., 64GB, 128GB, 256GB, 512GB, 1TB, 2TB ROM/SSD)
    storage_match = re.search(r"\b(32|64|128|256|512)\s*(?:GB|G)\b(?!\s*RAM)", combined_text, re.IGNORECASE)
    if storage_match:
        storage = f"{storage_match.group(1).upper()}GB"
    else:
        tb_match = re.search(r"\b(1|2|4)\s*(?:TB|T)\b(?!\s*RAM)", combined_text, re.IGNORECASE)
        if tb_match:
            storage = f"{tb_match.group(1).upper()}TB"

    # 2. RAM Detection (e.g., 4GB RAM, 8GB RAM, 16GB RAM, 32GB RAM)
    ram_match = re.search(r"\b(4|6|8|12|16|24|32|64)\s*(?:GB)?\s*RAM\b", combined_text, re.IGNORECASE)
    if ram_match:
        ram = f"{ram_match.group(1)}GB RAM"
    else:
        # Check for DDR/unified memory pattern
        alt_ram = re.search(r"\b(4GB|8GB|16GB|32GB)\s*(?:DDR4|DDR5|Unified|Memory)", combined_text, re.IGNORECASE)
        if alt_ram:
            ram = alt_ram.group(1).upper()

    # 3. Color Detection
    for c in COMMON_COLORS:
        if re.search(rf"\b{re.escape(c)}\b", combined_text, re.IGNORECASE):
            color = c
            break

    # 4. Display / Physical Size Detection (e.g. 55 Inch, 65 Inch, 14 Inch, 15.6 Inch)
    size_match = re.search(r"\b(\d{2}(?:\.\d)?)\s*(?:inch|inches|\"|-inch)\b", combined_text, re.IGNORECASE)
    if size_match:
        size = f"{size_match.group(1)} Inch"

    # Construct canonical variant label
    parts = []
    if storage:
        parts.append(storage)
    if ram:
        parts.append(ram)
    if size:
        parts.append(size)
    if color:
        parts.append(color)

    variant_name = " / ".join(parts) if parts else "Standard"

    return VariantIdentity(
        variant_name=variant_name,
        storage=storage,
        ram=ram,
        color=color,
        size=size,
    )


def are_variants_identical(v1: VariantIdentity, v2: VariantIdentity) -> bool:
    """
    Enforces strict variant compatibility.
    Returns False if key hardware specifications conflict.
    """
    if v1.storage and v2.storage and v1.storage.lower() != v2.storage.lower():
        return False
    if v1.ram and v2.ram and v1.ram.lower() != v2.ram.lower():
        return False
    if v1.size and v2.size and v1.size.lower() != v2.size.lower():
        return False
    if v1.color and v2.color and v1.color.lower() != v2.color.lower():
        return False
    return True


def normalize_product_identity(
    raw_title: str,
    brand: Optional[str] = None,
    model_number: Optional[str] = None,
    category: Optional[str] = None,
    raw_variant: Optional[str] = None,
) -> NormalizedProductIdentity:
    """
    Produces clean canonical product metadata and isolated variant specifications.
    """
    cleaned_title = clean_canonical_title(raw_title)
    variant = extract_variant_from_title(raw_title, raw_variant)

    # Detect brand from title if missing
    inferred_brand = brand
    if not inferred_brand:
        for known_brand in ["Apple", "Samsung", "Sony", "Lenovo", "Dell", "HP", "Acer", "Asus", "boAt", "Noise", "Philips", "LG"]:
            if re.search(rf"\b{known_brand}\b", raw_title, re.IGNORECASE):
                inferred_brand = known_brand
                break

    return NormalizedProductIdentity(
        canonical_title=cleaned_title,
        brand=inferred_brand,
        model_number=model_number,
        category=category,
        variant=variant,
    )
