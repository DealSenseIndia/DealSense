from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship


class Category(SQLModel, table=True):
    """Hierarchical category taxonomy supporting unlimited nesting."""

    __tablename__ = "categories"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    slug: str = Field(index=True, unique=True)
    parent_id: Optional[int] = Field(default=None, foreign_key="categories.id", index=True)
    icon: Optional[str] = None
    image: Optional[str] = None
    description: Optional[str] = None
    display_order: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=True,
    )

    products: List["Product"] = Relationship(back_populates="category_rel")


class Product(SQLModel, table=True):
    """Canonical representation of a product independent of merchant listings."""

    __tablename__ = "products"

    id: Optional[int] = Field(default=None, primary_key=True)
    canonical_title: str = Field(index=True)
    canonical_slug: Optional[str] = Field(default=None, index=True)
    brand: Optional[str] = Field(default=None, index=True)
    model_number: Optional[str] = Field(default=None, index=True)
    mpn: Optional[str] = None
    gtin: Optional[str] = None
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id", index=True)
    category: Optional[str] = Field(default=None, index=True)  # Backward compatibility string
    product_type: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    images_json: Optional[str] = Field(default=None, description="JSON array of product image URLs")
    rating: Optional[float] = Field(default=None, description="Product rating (e.g. 4.3)")
    ratings_count: Optional[str] = Field(default=None, description="Ratings count string (e.g. '12,345')")
    bought_count: Optional[str] = Field(default=None, description="Social proof text (e.g. '10K+ bought')")
    badge: Optional[str] = Field(default=None, description="Store badge (e.g. Amazon's Choice)")
    highlight_tag: Optional[str] = Field(default=None, description="Feature highlight tag")
    specifications_json: Optional[str] = Field(default=None, description="JSON array of {key, value} spec pairs")
    return_policy: Optional[str] = Field(default=None, description="Return or replacement policy")
    reviews_json: Optional[str] = Field(default=None, description="JSON array of real customer reviews")
    rating_breakdown_json: Optional[str] = Field(default=None, description="JSON dict of star percentages")
    pros_json: Optional[str] = Field(default=None, description="JSON array of pros")
    cons_json: Optional[str] = Field(default=None, description="JSON array of cons")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Optional[datetime] = None

    category_rel: Optional[Category] = Relationship(back_populates="products")
    listings: List["MerchantListing"] = Relationship(back_populates="product")
    variants: List["ProductVariant"] = Relationship(back_populates="product")


class ProductVariant(SQLModel, table=True):
    """Specific SKU/variant of a canonical product (e.g. 128GB Black)."""

    __tablename__ = "product_variants"

    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="products.id", index=True)
    variant_name: str
    sku: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    storage: Optional[str] = None
    attributes_json: Optional[str] = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    product: Optional[Product] = Relationship(back_populates="variants")
    listings: List["MerchantListing"] = Relationship(back_populates="variant")


class Merchant(SQLModel, table=True):
    """Supported e-commerce platforms (Strictly Amazon India & Flipkart at this stage)."""

    __tablename__ = "merchants"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)  # 'Amazon India' or 'Flipkart'
    slug: str = Field(index=True, unique=True)  # 'amazon' or 'flipkart'
    domain: str = Field(unique=True)  # 'amazon.in' or 'flipkart.com'
    logo_url: Optional[str] = None
    country: str = Field(default="IN")
    active: bool = Field(default=True)
    affiliate_enabled: bool = Field(default=True)
    product_data_enabled: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    listings: List["MerchantListing"] = Relationship(back_populates="merchant_rel")


class MerchantListing(SQLModel, table=True):
    """Merchant-specific product listing (e.g. Amazon ASIN or Flipkart PID)."""

    __tablename__ = "merchant_listings"

    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: Optional[int] = Field(default=None, foreign_key="products.id", index=True)
    variant_id: Optional[int] = Field(default=None, foreign_key="product_variants.id", index=True)
    merchant_id: Optional[int] = Field(default=None, foreign_key="merchants.id", index=True)

    merchant: str = Field(index=True)  # 'Amazon' or 'Flipkart' (preserved for backwards compatibility)
    merchant_product_id: str = Field(index=True, unique=True)  # ASIN or PID
    url: str
    clean_url: str
    affiliate_url: Optional[str] = None
    title_at_merchant: Optional[str] = None

    seller_name: Optional[str] = None
    seller: Optional[str] = None  # Preserved field
    delivery_info: Optional[str] = Field(default=None, description="Delivery estimate text")
    return_policy: Optional[str] = Field(default=None, description="Return policy text")
    is_prime: bool = Field(default=False, description="Amazon Prime eligible")
    is_f_assured: bool = Field(default=False, description="Flipkart Assured badge")
    coupons_json: Optional[str] = Field(default=None, description="Live coupon deals JSON")
    delivery_fee: float = Field(default=0.0, description="Delivery fee in INR")

    availability: str = Field(default="in_stock")
    current_price: Optional[float] = None
    currency: str = Field(default="INR")
    shipping_cost: Optional[float] = Field(default=0.0)
    data_source: str = Field(default="catalog_feed")
    source_confidence: str = Field(default="high")
    active: bool = Field(default=True)
    last_checked_at: Optional[datetime] = None
    next_check_at: Optional[datetime] = Field(default=None, index=True)
    failure_count: int = Field(default=0)
    refresh_priority: str = Field(default="NORMAL", index=True)
    last_error: Optional[str] = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    product: Optional[Product] = Relationship(back_populates="listings")
    variant: Optional[ProductVariant] = Relationship(back_populates="listings")
    merchant_rel: Optional[Merchant] = Relationship(back_populates="listings")
    price_observations: List["PriceObservation"] = Relationship(back_populates="listing")
    offers: List["Offer"] = Relationship(back_populates="listing")


class PriceObservation(SQLModel, table=True):
    """Timestamped price observation capturing immutable historical price points over time."""

    __tablename__ = "price_observations"

    id: Optional[int] = Field(default=None, primary_key=True)
    listing_id: int = Field(foreign_key="merchant_listings.id", index=True)

    price: float = Field(description="Selling price in INR")
    mrp: Optional[float] = Field(default=None, description="Maximum Retail Price in INR")
    currency: str = Field(default="INR")
    shipping_cost: Optional[float] = Field(default=0.0)
    effective_price: Optional[float] = None
    in_stock: bool = Field(default=True)
    source: str = Field(default="live_extraction")
    confidence: str = Field(default="high")

    observed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )

    listing: Optional[MerchantListing] = Relationship(back_populates="price_observations")


class Offer(SQLModel, table=True):
    """Bank discount, coupon, or sale promotion attached to a listing."""

    __tablename__ = "offers"

    id: Optional[int] = Field(default=None, primary_key=True)
    listing_id: int = Field(foreign_key="merchant_listings.id", index=True)
    offer_type: str = Field(default="bank_discount")  # coupon, bank_discount, sale_discount
    title: str
    description: Optional[str] = None
    discount_value: float = Field(default=0.0)
    discount_type: str = Field(default="percentage")  # percentage or fixed_amount
    coupon_code: Optional[str] = None
    eligibility: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    source: str = Field(default="merchant_feed")
    confidence: str = Field(default="high")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    listing: Optional[MerchantListing] = Relationship(back_populates="offers")


class SetupCategory(SQLModel, table=True):
    """Category representing room, desk, or technology setups."""

    __tablename__ = "setup_categories"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)  # 'Bedroom', 'Gaming Setup', 'Home Office', etc.
    slug: str = Field(index=True, unique=True)
    domain_group: str = Field(default="Home")  # 'Home', 'Technology', 'Lifestyle', 'Automotive'
    icon: Optional[str] = None
    image_url: Optional[str] = None
    budget_start: int = Field(default=20000)
    popular: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    setups: List["Setup"] = Relationship(back_populates="category")


class Setup(SQLModel, table=True):
    """A curated, coordinated collection of items achieving a specific space goal."""

    __tablename__ = "setups"

    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="setup_categories.id", index=True)
    title: str
    slug: str = Field(index=True, unique=True)
    tier: str = Field(default="tier_1_budget")  # tier_1_budget, tier_2_smart_upgrade, tier_3_premium_luxe
    target_budget: float
    style: str = Field(default="Modern Minimalist")
    total_price: float
    verified_savings: float = Field(default=0.0)
    description: Optional[str] = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    category: Optional[SetupCategory] = Relationship(back_populates="setups")
    items: List["SetupItem"] = Relationship(back_populates="setup")


class SetupItem(SQLModel, table=True):
    """An individual item comprising a coordinated room or desk setup."""

    __tablename__ = "setup_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    setup_id: int = Field(foreign_key="setups.id", index=True)
    product_id: Optional[int] = Field(default=None, foreign_key="products.id", index=True)
    listing_id: Optional[int] = Field(default=None, foreign_key="merchant_listings.id", index=True)

    name: str
    category: str
    price: float
    mrp: float
    store: str = Field(default="Amazon")  # Amazon or Flipkart
    merchant_product_id: Optional[str] = None
    image_url: Optional[str] = None
    affiliate_url: Optional[str] = None
    quantity: int = Field(default=1)
    phase: int = Field(default=1)  # 1: Foundation Essential, 2: Upgrade
    is_optional: bool = Field(default=False)
    recommended_reason: Optional[str] = None

    setup: Optional[Setup] = Relationship(back_populates="items")


class PriceAlert(SQLModel, table=True):
    """User price alert configuration for WhatsApp or Email notifications."""

    __tablename__ = "price_alerts"

    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: Optional[int] = Field(default=None, foreign_key="products.id", index=True)
    product_title: str
    target_price: float
    current_price: float
    channel: str = Field(default="whatsapp")  # 'whatsapp' or 'email'
    contact: str  # Phone number or email address
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
