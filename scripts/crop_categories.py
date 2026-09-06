from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Khanna Computer\.gemini\antigravity-ide\brain\6ac0b66f-9744-42b6-8abb-459ac51274b5\.user_uploaded\media_1788522947350.jpg")
OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "categories"
OUT_DIR.mkdir(parents=True, exist_ok=True)

img = Image.open(SRC)

# Master categories mapping
# (slug, (x1, y1, x2, y2))
crops = {
    # Row 1
    "electronics": (214, 235, 334, 305),
    "home-living": (359, 230, 479, 305),
    "fashion": (504, 230, 624, 305),
    "beauty-personal-care": (649, 230, 769, 305),
    
    # Row 2
    "sports-fitness": (214, 430, 334, 500),
    "automotive": (359, 430, 479, 500),
    "baby-kids": (504, 430, 624, 500),
    "books-stationery": (649, 430, 769, 500),
    
    # Row 3
    "grocery-essentials": (214, 605, 334, 675),
    "health-nutrition": (359, 605, 479, 675),
    "toys-games": (504, 605, 624, 675),
    "pet-supplies": (649, 605, 769, 675),
    
    # Row 4
    "office-supplies": (214, 765, 334, 835),
    "musical-instruments": (359, 765, 479, 835),
    "travel-luggage": (504, 765, 624, 835),
    
    # Setup card illustration (armchair + lamp + plant)
    "setup-chair": (698, 815, 772, 895)
}

for slug, box in crops.items():
    cropped = img.crop(box)
    target = OUT_DIR / f"{slug}.png"
    cropped.save(target, "PNG", optimize=True)
    print(f"Cropped {slug} -> {target.name} ({cropped.size})")

# Also let's extract the shopping bags hero illustration if needed
hero_box = (545, 60, 795, 185)
hero_img = img.crop(hero_box)
hero_target = OUT_DIR.parent / "categories-hero.png"
hero_img.save(hero_target, "PNG", optimize=True)
print(f"Cropped categories-hero.png ({hero_img.size})")
