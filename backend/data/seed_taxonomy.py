"""
Seed complete hierarchical category taxonomy, setup categories, merchants, and canonical items for DealWise.
"""
from datetime import datetime, timezone, timedelta
from sqlmodel import Session, select

from backend.database import engine, init_db
from backend.models import (
    Category,
    Merchant,
    Product,
    MerchantListing,
    PriceObservation,
    SetupCategory,
    Setup,
    SetupItem,
)


def seed_taxonomy():
    init_db()
    with Session(engine) as session:
        # 1. Seed Merchants (Amazon India & Flipkart only)
        merchants_data = [
            {
                "name": "Amazon India",
                "slug": "amazon",
                "domain": "amazon.in",
                "logo_url": "/assets/amazon-logo.svg",
                "country": "IN",
                "active": True,
                "affiliate_enabled": True,
                "product_data_enabled": True,
            },
            {
                "name": "Flipkart",
                "slug": "flipkart",
                "domain": "flipkart.com",
                "logo_url": "/assets/flipkart-icon.svg",
                "country": "IN",
                "active": True,
                "affiliate_enabled": True,
                "product_data_enabled": True,
            },
        ]
        merchants_by_slug = {}
        for m_data in merchants_data:
            existing = session.exec(select(Merchant).where(Merchant.slug == m_data["slug"])).first()
            if not existing:
                m = Merchant(**m_data)
                session.add(m)
                session.commit()
                session.refresh(m)
                merchants_by_slug[m.slug] = m
            else:
                merchants_by_slug[existing.slug] = existing

        # 2. Seed Hierarchical Product Categories
        # Root & Child taxonomies — complete 15-category taxonomy matching reference design
        DEAL_COUNTS = {
            "electronics": 24156,
            "home-living": 18974,
            "fashion": 32541,
            "beauty-personal-care": 12675,
            "sports-fitness": 8562,
            "automotive": 6843,
            "baby-kids": 7952,
            "books-stationery": 5378,
            "grocery-essentials": 9214,
            "health-nutrition": 6207,
            "toys-games": 8119,
            "pet-supplies": 5089,
            "office-supplies": 4392,
            "musical-instruments": 3246,
            "travel-luggage": 6721,
        }

        taxonomy_tree = {
            "Electronics": {
                "slug": "electronics",
                "icon": "💻",
                "description": "Laptops, mobiles, smart TVs, headphones, audio, gaming and tech deals.",
                "children": {
                    "Mobiles & Tablets": ["Smartphones", "Tablets", "Mobile Accessories", "Cases & Covers", "Chargers", "Power Banks"],
                    "Laptops & Accessories": ["Laptops", "Gaming Laptops", "Laptop Bags", "Laptop Stands", "Keyboards", "Mice"],
                    "TV & Home Entertainment": ["Televisions", "Streaming Devices", "Soundbars", "Home Theater", "Projectors"],
                    "Audio": ["Headphones", "Earbuds", "Speakers", "Microphones"],
                    "Cameras & Photography": ["DSLR Cameras", "Mirrorless", "Lenses", "Action Cameras", "Tripods", "Drones"],
                    "Wearables": ["Smartwatches", "Fitness Bands", "Wearable Accessories"],
                    "PC Components": ["Processors", "Graphics Cards", "Motherboards", "RAM", "Power Supplies"],
                    "Gaming": ["Gaming Consoles", "Controllers", "Gaming Chairs", "Gaming Monitors", "PC Gaming Components"],
                }
            },
            "Home & Living": {
                "slug": "home-living",
                "icon": "🛋️",
                "description": "Furniture, home decor, lighting, bedding, kitchen and cleaning appliances.",
                "children": {
                    "Furniture": ["Beds", "Mattresses", "Sofas", "Chairs", "Tables", "Desks", "Wardrobes", "Storage"],
                    "Home Decor": ["Wall Decor", "Lamps", "Rugs", "Curtains", "Plants", "Clocks"],
                    "Lighting": ["Ceiling Lights", "Table Lamps", "Floor Lamps", "LED Strips", "Smart Lighting"],
                    "Bedding & Linen": ["Bed Sheets", "Pillows", "Blankets", "Comforters", "Mattress Protectors"],
                    "Kitchen & Dining": ["Cookware", "Dinnerware", "Storage Containers", "Kitchen Tools", "Gas Stoves"],
                    "Home Appliances": ["Washing Machines", "Air Conditioners", "Air Purifiers", "Fans", "Heaters"],
                    "Bathroom": ["Bathroom Accessories", "Towels", "Mirrors", "Storage"],
                    "Cleaning Appliances": ["Vacuum Cleaners", "Steam Cleaners", "Air Purifiers", "Water Purifiers"],
                }
            },
            "Fashion": {
                "slug": "fashion",
                "icon": "👗",
                "description": "Men, women and kids fashion, footwear, watches, jewellery, bags and accessories.",
                "children": {
                    "Men": ["Clothing", "T-Shirts", "Shirts", "Jeans", "Trousers", "Ethnic Wear"],
                    "Women": ["Dresses", "Tops", "Sarees", "Kurtas", "Jeans", "Activewear"],
                    "Shoes": ["Casual Shoes", "Sports Shoes", "Formal Shoes", "Sneakers", "Sandals"],
                    "Watches": ["Analog Watches", "Digital Watches", "Smartwatches", "Chronograph"],
                    "Bags & Luggage": ["Backpacks", "Handbags", "Wallets", "Clutches", "Messenger Bags"],
                    "Jewellery": ["Necklaces", "Earrings", "Rings", "Bracelets", "Gold & Silver"],
                    "Accessories": ["Belts", "Wallets", "Caps", "Scarves", "Socks"],
                    "Sunglasses": ["Aviator", "Wayfarer", "Round", "Polarized Sunglasses"],
                }
            },
            "Beauty & Personal Care": {
                "slug": "beauty-personal-care",
                "icon": "✨",
                "description": "Skincare, makeup, hair care, fragrances, personal care appliances and grooming.",
                "children": {
                    "Skincare": ["Cleansers", "Moisturizers", "Serums", "Sunscreen", "Face Wash", "Face Masks"],
                    "Makeup": ["Lipstick", "Foundation", "Eyeliner", "Mascara", "Compact Powder"],
                    "Hair Care": ["Shampoo", "Conditioner", "Hair Oil", "Hair Serum", "Hair Color"],
                    "Fragrances": ["Perfumes", "Deodorants", "Body Mists", "Cologne"],
                    "Bath & Body": ["Body Wash", "Soaps", "Body Lotions", "Scrubs"],
                    "Personal Care Appliances": ["Trimmers", "Hair Dryers", "Straighteners", "Shavers"],
                    "Men's Grooming": ["Beard Oils", "Aftershave", "Shaving Creams", "Grooming Kits"],
                    "Health Care": ["Oral Care", "Electric Toothbrushes", "Sanitizers", "Personal Hygiene"],
                }
            },
            "Sports & Fitness": {
                "slug": "sports-fitness",
                "icon": "🏋️",
                "description": "Exercise equipment, sportswear, footwear, fitness accessories and sports nutrition.",
                "children": {
                    "Exercise Equipment": ["Dumbbells", "Treadmills", "Exercise Bikes", "Resistance Bands", "Kettlebells"],
                    "Fitness Accessories": ["Gym Gloves", "Shakers", "Wrist Wraps", "Yoga Blocks"],
                    "Sportswear": ["Track Pants", "Gym T-Shirts", "Sports Bras", "Compression Wear"],
                    "Footwear": ["Running Shoes", "Training Shoes", "Football Studs", "Badminton Shoes"],
                    "Outdoor Recreation": ["Tents", "Hiking Backpacks", "Trekking Poles", "Sleeping Bags"],
                    "Yoga & Meditation": ["Yoga Mats", "Meditation Cushions", "Yoga Straps"],
                    "Sports Nutrition": ["Whey Protein", "BCAA", "Creatine", "Energy Bars"],
                }
            },
            "Automotive": {
                "slug": "automotive",
                "icon": "🚗",
                "description": "Car accessories, electronics, tyres, car care, motorcycle gear and helmets.",
                "children": {
                    "Car Accessories": ["Seat Covers", "Car Mats", "Sunshades", "Steering Covers"],
                    "Motorcycle Accessories": ["Bike Covers", "Mobile Mounts", "Tank Bags", "Riding Bags"],
                    "Car Electronics": ["Dash Cameras", "Car Chargers", "GPS Navigators", "Reverse Cameras"],
                    "Tyres & Rims": ["Car Tyres", "Motorcycle Tyres", "Alloy Wheels", "Tyre Inflators"],
                    "Car Care & Cleaning": ["Car Shampoos", "Microfiber Cloths", "Polishes", "Car Vacuums"],
                    "Helmets & Riding Gear": ["Full Face Helmets", "Riding Jackets", "Gloves", "Knee Guards"],
                    "Tools & Equipment": ["Jack Kits", "Jump Starters", "Air Compressors", "Socket Sets"],
                }
            },
            "Baby & Kids": {
                "slug": "baby-kids",
                "icon": "🍼",
                "description": "Baby gear, toys, clothing, feeding, baby care, safety and nursery essentials.",
                "children": {
                    "Baby Gear": ["Strollers", "Car Seats", "Baby Carriers", "High Chairs", "Walkers"],
                    "Toys & Games": ["Soft Toys", "Rattles", "Building Blocks", "Educational Toys"],
                    "Baby Care": ["Diapers", "Wipes", "Baby Lotions", "Baby Powder", "Baby Shampoos"],
                    "Kids Fashion": ["Boys Clothes", "Girls Clothes", "Kids Shoes", "Ethnic Wear"],
                    "Feeding & Nursing": ["Feeding Bottles", "Breast Pumps", "Sterilizers", "Baby Food"],
                    "Baby Safety": ["Baby Monitors", "Safety Gates", "Corner Guards", "Child Locks"],
                    "Nursery": ["Baby Cribs", "Cots", "Baby Bedding", "Mattresses"],
                }
            },
            "Books & Stationery": {
                "slug": "books-stationery",
                "icon": "📚",
                "description": "Books, school supplies, office supplies, writing instruments, art and printers.",
                "children": {
                    "Books": ["Fiction", "Non-Fiction", "Self-Help", "Biographies", "Business"],
                    "School Books": ["NCERT", "CBSE", "Reference Books", "Children's Books"],
                    "Office Supplies": ["Files & Folders", "Desk Organizers", "Staplers", "Calculators"],
                    "Writing Instruments": ["Ball Pens", "Gel Pens", "Fountain Pens", "Markers", "Highlighters"],
                    "Art & Craft": ["Sketchbooks", "Acrylic Paints", "Watercolors", "Paint Brushes"],
                    "Notebooks & Diaries": ["Ruled Notebooks", "Spiral Diaries", "Journals", "Planners"],
                    "Printers & Ink": ["Ink Cartridges", "Laser Toner", "Photo Paper", "All-in-One Printers"],
                }
            },
            "Grocery & Essentials": {
                "slug": "grocery-essentials",
                "icon": "🛒",
                "description": "Daily food & beverages, branded snacks, household and personal essentials.",
                "children": {
                    "Food & Beverages": ["Tea", "Coffee", "Fruit Juices", "Health Drinks", "Soft Drinks"],
                    "Snacks & Branded Foods": ["Biscuits", "Chips", "Chocolates", "Instant Noodles"],
                    "Personal Care Essentials": ["Soaps", "Shampoos", "Toothpaste", "Handwash"],
                    "Household Essentials": ["Laundry Detergents", "Dishwash", "Surface Cleaners"],
                    "Baby Essentials": ["Baby Food", "Diapers", "Baby Wipes", "Baby Formula"],
                    "Pet Essentials": ["Pet Food", "Treats", "Pet Shampoo", "Odor Removers"],
                }
            },
            "Health & Nutrition": {
                "slug": "health-nutrition",
                "icon": "💊",
                "description": "Vitamins, health devices, ayurvedic remedies, fitness nutrition and medical supplies.",
                "children": {
                    "Vitamins & Supplements": ["Multivitamins", "Vitamin C", "Vitamin D3", "Omega 3", "Biotin"],
                    "Health Care Devices": ["Blood Pressure Monitors", "Glucometers", "Pulse Oximeters", "Thermometers"],
                    "Ayurveda & Herbal": ["Chyawanprash", "Ashwagandha", "Giloy", "Herbal Teas", "Triphala"],
                    "Protein & Fitness Nutrition": ["Whey Protein", "Plant Protein", "Mass Gainers", "Protein Bars"],
                    "Health Foods": ["Green Tea", "Honey", "Oats", "Dry Fruits", "Seeds"],
                    "Medical Supplies": ["First Aid Kits", "Bandages", "Masks", "Ointments"],
                }
            },
            "Toys & Games": {
                "slug": "toys-games",
                "icon": "🎮",
                "description": "Action figures, building sets, board games, educational toys and RC vehicles.",
                "children": {
                    "Action Figures": ["Marvel Figures", "Anime Figures", "Transformers", "DC Collectibles"],
                    "Building Sets": ["LEGO", "Magnetic Tiles", "Building Bricks", "Construction Toys"],
                    "Board Games": ["Monopoly", "Chess", "Scrabble", "Catan", "Carrom"],
                    "Educational Toys": ["STEM Kits", "Science Experiment Kits", "Coding Robots", "Globe"],
                    "Remote Control Toys": ["RC Cars", "RC Drones", "RC Helicopters", "RC Boats"],
                    "Puzzles": ["1000 Piece Jigsaw", "3D Puzzles", "Wooden Brain Teasers"],
                    "Outdoor Toys": ["Scooters", "Skates", "Water Guns", "Nerf Blasters", "Trampolines"],
                }
            },
            "Pet Supplies": {
                "slug": "pet-supplies",
                "icon": "🐾",
                "description": "Pet food, accessories, grooming, pet health, toys, beds and aquariums.",
                "children": {
                    "Pet Food": ["Dry Dog Food", "Wet Cat Food", "Bird Seed", "Puppy Kibble"],
                    "Pet Accessories": ["Leashes", "Collars", "Harnesses", "Feeding Bowls", "ID Tags"],
                    "Grooming": ["Pet Shampoos", "Brushes", "Nail Trimmers", "Pet Wipes"],
                    "Health Care": ["Flea & Tick Treatments", "Dewormers", "Joint Supplements", "Ear Cleaners"],
                    "Toys": ["Chew Toys", "Squeaky Balls", "Cat Scratchers", "Laser Toys"],
                    "Beds & Furniture": ["Orthopedic Dog Beds", "Cat Trees", "Crates", "Cages"],
                    "Aquarium Supplies": ["Fish Tanks", "Water Filters", "Air Pumps", "Fish Food", "Aquarium Decor"],
                }
            },
            "Office Supplies": {
                "slug": "office-supplies",
                "icon": "🖨️",
                "description": "Ergonomic furniture, paper, toner, office electronics and organization tools.",
                "children": {
                    "Office Furniture": ["Ergonomic Office Chairs", "Standing Desks", "File Cabinets", "Bookcases"],
                    "Paper & Stationery": ["A4 Copy Paper", "Sticky Notes", "Envelopes", "Legal Pads"],
                    "Ink & Toner": ["HP Toner", "Canon Cartridges", "Epson Ink Bottles", "Brother Toners"],
                    "Office Electronics": ["Paper Shredders", "Laminators", "Scientific Calculators", "Label Makers"],
                    "Storage & Organization": ["File Organizers", "Desk Tidy Trays", "Storage Boxes", "Magazine Racks"],
                }
            },
            "Musical Instruments": {
                "slug": "musical-instruments",
                "icon": "🎸",
                "description": "Guitars, keyboards, drums, studio equipment, DJ gear and string instruments.",
                "children": {
                    "Guitars": ["Acoustic Guitars", "Electric Guitars", "Classical Guitars", "Ukuleles"],
                    "Keyboards": ["Digital Pianos", "Synthesizers", "MIDI Keyboards", "Portable Keyboards"],
                    "Drums & Percussion": ["Drum Sets", "Electronic Drums", "Bongos", "Cajons"],
                    "Studio Equipment": ["Audio Interfaces", "Condenser Microphones", "Studio Monitors", "Headphones"],
                    "DJ & Audio Gear": ["DJ Controllers", "Mixers", "PA Speakers", "DJ Headphones"],
                    "String Instruments": ["Violins", "Cellos", "Mandolins", "Sitars"],
                }
            },
            "Travel & Luggage": {
                "slug": "travel-luggage",
                "icon": "🧳",
                "description": "Suitcases, trolleys, travel backpacks, packing cubes and travel accessories.",
                "children": {
                    "Suitcases & Trolleys": ["Cabin Trolleys", "Check-in Bags", "Hard Suitcases", "Soft Trolleys"],
                    "Backpacks": ["Laptop Backpacks", "Trekking Rucksacks", "Casual Backpacks"],
                    "Travel Accessories": ["Neck Pillows", "Universal Adapters", "Luggage Weighing Scales", "Luggage Tags"],
                    "Travel Essentials": ["Packing Cubes", "Toiletry Bags", "Passport Holders", "Money Belts"],
                    "Duffel Bags": ["Gym Duffels", "Wheeled Duffel Bags", "Leather Weekender Bags"],
                    "Laptop Bags": ["Briefcases", "Messenger Bags", "Laptop Sleeves"],
                }
            },
        }

        def make_slug(txt: str) -> str:
            return txt.lower().replace(" & ", "-").replace("&", "-").replace(" ", "-").replace("/", "-")

        categories_map = {}

        for order_idx, (root_name, root_info) in enumerate(taxonomy_tree.items(), start=1):
            r_slug = root_info["slug"]
            root_cat = session.exec(select(Category).where(Category.slug == r_slug)).first()
            img_path = f"/assets/categories/{r_slug}.png"
            if not root_cat:
                root_cat = Category(
                    name=root_name,
                    slug=r_slug,
                    icon=root_info.get("icon"),
                    image=img_path,
                    description=root_info.get("description"),
                    display_order=order_idx,
                    is_active=True,
                )
                session.add(root_cat)
                session.commit()
                session.refresh(root_cat)
            else:
                root_cat.image = img_path
                root_cat.display_order = order_idx
                root_cat.is_active = True
                root_cat.description = root_info.get("description")
                session.add(root_cat)
                session.commit()
                session.refresh(root_cat)
            categories_map[r_slug] = root_cat

            for child_order, (child_name, grand_children) in enumerate(root_info["children"].items(), start=1):
                c_slug = make_slug(f"{r_slug}-{child_name}")
                child_cat = session.exec(select(Category).where(Category.slug == c_slug)).first()
                if not child_cat:
                    child_cat = Category(
                        name=child_name,
                        slug=c_slug,
                        parent_id=root_cat.id,
                        display_order=child_order,
                        is_active=True,
                    )
                    session.add(child_cat)
                    session.commit()
                    session.refresh(child_cat)
                else:
                    child_cat.display_order = child_order
                    child_cat.is_active = True
                    session.add(child_cat)
                    session.commit()
                    session.refresh(child_cat)
                categories_map[c_slug] = child_cat

                for gc_order, gc_name in enumerate(grand_children, start=1):
                    gc_slug = make_slug(f"{c_slug}-{gc_name}")
                    gc_cat = session.exec(select(Category).where(Category.slug == gc_slug)).first()
                    if not gc_cat:
                        gc_cat = Category(
                            name=gc_name,
                            slug=gc_slug,
                            parent_id=child_cat.id,
                            display_order=gc_order,
                            is_active=True,
                        )
                        session.add(gc_cat)
                        session.commit()
                        session.refresh(gc_cat)
                    categories_map[gc_slug] = gc_cat

        # 3. Seed Setup Categories
        setup_categories_data = [
            {"name": "Bedroom", "slug": "bedroom", "domain_group": "Home", "icon": "🛏️", "budget_start": 20000, "image_url": "https://images.unsplash.com/photo-1540518614846-7ede433c4550?w=600&q=80"},
            {"name": "Gaming Setup", "slug": "gaming_setup", "domain_group": "Technology", "icon": "🎮", "budget_start": 40000, "image_url": "https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=600&q=80"},
            {"name": "Home Office", "slug": "home_office", "domain_group": "Technology", "icon": "💼", "budget_start": 25000, "image_url": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&q=80"},
            {"name": "Living Room", "slug": "living_room", "domain_group": "Home", "icon": "🛋️", "budget_start": 30000, "image_url": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80"},
            {"name": "Kitchen", "slug": "kitchen", "domain_group": "Home", "icon": "🍳", "budget_start": 25000, "image_url": "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&q=80"},
            {"name": "PC Build", "slug": "pc_build", "domain_group": "Technology", "icon": "🖥️", "budget_start": 50000, "image_url": "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=600&q=80"},
        ]

        setup_cats_by_slug = {}
        for sc_data in setup_categories_data:
            sc = session.exec(select(SetupCategory).where(SetupCategory.slug == sc_data["slug"])).first()
            if not sc:
                sc = SetupCategory(**sc_data)
                session.add(sc)
                session.commit()
                session.refresh(sc)
            setup_cats_by_slug[sc.slug] = sc

        # 4. Seed Setups and Setup Items
        from backend.data.setup_catalog import SETUP_CATALOG

        for sc_slug, sc_obj in setup_cats_by_slug.items():
            catalog_key = "gaming_pc" if sc_slug == "pc_build" else sc_slug
            if catalog_key not in SETUP_CATALOG:
                continue

            categories_dict = SETUP_CATALOG[catalog_key]
            # Create Tier 1 Budget Setup
            setup_slug = f"{sc_slug}-budget"
            setup_obj = session.exec(select(Setup).where(Setup.slug == setup_slug)).first()
            if not setup_obj:
                items_val = []
                total_val = 0
                total_mrp = 0

                for cat_name, cat_items in categories_dict.items():
                    val_item = next((i for i in cat_items if i.get("tier") == "value"), cat_items[0] if cat_items else None)
                    if val_item:
                        items_val.append((cat_name, val_item))
                        total_val += val_item["price"]
                        total_mrp += val_item.get("mrp", val_item["price"] * 1.3)

                setup_obj = Setup(
                    category_id=sc_obj.id,
                    title=f"Smart Budget {sc_obj.name}",
                    slug=setup_slug,
                    tier="tier_1_budget",
                    target_budget=sc_obj.budget_start,
                    style="Minimal Modern",
                    total_price=total_val,
                    verified_savings=max(0, total_mrp - total_val),
                    description=f"Aesthetic, high-utility {sc_obj.name.lower()} components optimized for maximum value."
                )
                session.add(setup_obj)
                session.commit()
                session.refresh(setup_obj)

                for cat_name, item_dict in items_val:
                    # Enforce only Amazon or Flipkart store
                    store_name = "Amazon" if "amazon" in item_dict.get("store", "Amazon").lower() else "Flipkart"
                    s_item = SetupItem(
                        setup_id=setup_obj.id,
                        name=item_dict["name"],
                        category=cat_name,
                        price=float(item_dict["price"]),
                        mrp=float(item_dict.get("mrp", item_dict["price"] * 1.3)),
                        store=store_name,
                        image_url=item_dict.get("image"),
                        affiliate_url=item_dict.get("url"),
                        phase=item_dict.get("phase", 1),
                        recommended_reason=item_dict.get("reason"),
                    )
                    session.add(s_item)
                session.commit()

        # 5. Seed Core Featured Products & Observations (Amazon & Flipkart Only)
        featured_products_data = [
            {
                "title": "Apple AirPods 4 with Active Noise Cancellation",
                "brand": "Apple",
                "model_number": "AirPods 4 ANC",
                "category": "Audio",
                "image_url": "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400&q=80",
                "merchant": "Amazon",
                "merchant_product_id": "B0DGJ68D4N",
                "url": "https://www.amazon.in/dp/B0DGJ68D4N",
                "price": 11999.0,
                "mrp": 16900.0,
                "verdict": "Good Deal",
                "drop_info": "18% below typical price",
            },
            {
                "title": "boAt Wave Call 2 Smart Watch with Bluetooth Calling",
                "brand": "boAt",
                "model_number": "Wave Call 2",
                "category": "Wearables",
                "image_url": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80",
                "merchant": "Flipkart",
                "merchant_product_id": "SMTWAVECL201",
                "url": "https://www.flipkart.com/boat-wave-call-2/p/itm123456",
                "price": 1299.0,
                "mrp": 2990.0,
                "verdict": "Great Deal",
                "drop_info": "Near 6-month low",
            },
            {
                "title": "Samsung 55-inch Crystal 4K Vivid Pro Ultra HD Smart TV",
                "brand": "Samsung",
                "model_number": "UA55DUE77AKLXL",
                "category": "TV & Entertainment",
                "image_url": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400&q=80",
                "merchant": "Amazon",
                "merchant_product_id": "B0CX8R9Y3M",
                "url": "https://www.amazon.in/dp/B0CX8R9Y3M",
                "price": 38990.0,
                "mrp": 59900.0,
                "verdict": "Good Deal",
                "drop_info": "12% below typical price",
            },
            {
                "title": "Puma Men's Flyer Runner Running Shoes",
                "brand": "Puma",
                "model_number": "Flyer Runner",
                "category": "Fashion",
                "image_url": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80",
                "merchant": "Amazon",
                "merchant_product_id": "B07P96J5Y7",
                "url": "https://www.amazon.in/dp/B07P96J5Y7",
                "price": 1799.0,
                "mrp": 3499.0,
                "verdict": "Great Deal",
                "drop_info": "Near historical low",
            },
            {
                "title": "Philips HL7756/00 750-Watt Mixer Grinder with 3 Jars",
                "brand": "Philips",
                "model_number": "HL7756/00",
                "category": "Home & Kitchen",
                "image_url": "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=400&q=80",
                "merchant": "Flipkart",
                "merchant_product_id": "MIXHL775600",
                "url": "https://www.flipkart.com/philips-hl7756-00-mixer-grinder/p/itm987654",
                "price": 2499.0,
                "mrp": 5995.0,
                "verdict": "Good Deal",
                "drop_info": "15% below typical price",
            },
            {
                "title": "Apple Watch Series 9 GPS 45mm Midnight Aluminium",
                "brand": "Apple",
                "model_number": "Series 9 45mm",
                "category": "Wearables",
                "image_url": "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=400&q=80",
                "merchant": "Amazon",
                "merchant_product_id": "B0CHWZ6R2X",
                "url": "https://www.amazon.in/dp/B0CHWZ6R2X",
                "price": 39900.0,
                "mrp": 45900.0,
                "verdict": "Good Deal",
                "drop_info": "₹6,000 drop from launch price",
            },
            {
                "title": "Philips HD9200/90 Digital Air Fryer 4.1 Litre",
                "brand": "Philips",
                "model_number": "HD9200/90",
                "category": "Home & Kitchen",
                "image_url": "https://images.unsplash.com/photo-1585515320310-259814833e62?w=400&q=80",
                "merchant": "Amazon",
                "merchant_product_id": "B0892R648P",
                "url": "https://www.amazon.in/dp/B0892R648P",
                "price": 4706.0,
                "mrp": 6995.0,
                "verdict": "Good Deal",
                "drop_info": "8% below typical price",
            },
            {
                "title": "OnePlus Nord 4 5G (128GB, Oasis Green)",
                "brand": "OnePlus",
                "model_number": "Nord 4",
                "category": "Mobiles",
                "image_url": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80",
                "merchant": "Amazon",
                "merchant_product_id": "B0D7D7R8QK",
                "url": "https://www.amazon.in/dp/B0D7D7R8QK",
                "price": 26999.0,
                "mrp": 32999.0,
                "verdict": "Good Deal",
                "drop_info": "16% below typical price",
            },
            {
                "title": "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
                "brand": "Sony",
                "model_number": "WH-1000XM5",
                "category": "Audio",
                "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80",
                "merchant": "Amazon",
                "merchant_product_id": "B09XS7JWHH",
                "url": "https://www.amazon.in/dp/B09XS7JWHH",
                "price": 24990.0,
                "mrp": 31990.0,
                "verdict": "Great Deal",
                "drop_info": "22% below typical price",
            },
            {
                "title": "LG 43-inch 4K Ultra HD Smart LED TV",
                "brand": "LG",
                "model_number": "43UR7500PSC",
                "category": "TV & Entertainment",
                "image_url": "https://images.unsplash.com/photo-1461151304267-38535e780c79?w=400&q=80",
                "merchant": "Flipkart",
                "merchant_product_id": "TVLG434K01",
                "url": "https://www.flipkart.com/lg-43-inch-4k/p/itm112233",
                "price": 23990.0,
                "mrp": 29900.0,
                "verdict": "Good Deal",
                "drop_info": "19% below typical price",
            },
            {
                "title": "ASUS TUF Gaming F15 Intel Core i5 11th Gen Laptop",
                "brand": "ASUS",
                "model_number": "FX506HF",
                "category": "Computers",
                "image_url": "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=400&q=80",
                "merchant": "Flipkart",
                "merchant_product_id": "LAPASUSTUF15",
                "url": "https://www.flipkart.com/asus-tuf-gaming-f15/p/itm445566",
                "price": 64990.0,
                "mrp": 81900.0,
                "verdict": "Good Deal",
                "drop_info": "20% below typical price",
            },
        ]

        now = datetime.now(timezone.utc)
        for p_data in featured_products_data:
            existing_p = session.exec(select(Product).where(Product.canonical_title == p_data["title"])).first()
            if not existing_p:
                p = Product(
                    canonical_title=p_data["title"],
                    brand=p_data["brand"],
                    model_number=p_data["model_number"],
                    category=p_data["category"],
                    image_url=p_data["image_url"],
                )
                session.add(p)
                session.commit()
                session.refresh(p)
            else:
                p = existing_p

            listing = session.exec(
                select(MerchantListing).where(MerchantListing.merchant_product_id == p_data["merchant_product_id"])
            ).first()
            m_slug = "amazon" if p_data["merchant"] == "Amazon" else "flipkart"
            merchant_rec = merchants_by_slug.get(m_slug)

            if not listing:
                listing = MerchantListing(
                    product_id=p.id,
                    merchant_id=merchant_rec.id if merchant_rec else None,
                    merchant=p_data["merchant"],
                    merchant_product_id=p_data["merchant_product_id"],
                    url=p_data["url"],
                    clean_url=p_data["url"],
                    current_price=p_data["price"],
                    last_checked_at=now,
                )
                session.add(listing)
                session.commit()
                session.refresh(listing)

                # Record single initial observation without synthetic history
                obs = PriceObservation(
                    listing_id=listing.id,
                    price=p_data["price"],
                    mrp=p_data["mrp"],
                    currency="INR",
                    in_stock=True,
                    source="initial_observation",
                    observed_at=now,
                    confidence="high",
                )
                session.add(obs)
                session.commit()

        print("Taxonomy, Merchants, Setups, Products & Observations seeded successfully!")


if __name__ == "__main__":
    seed_taxonomy()
