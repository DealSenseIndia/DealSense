"""
DealSense Smart Setup Blueprints.

A blueprint describes the STRUCTURE of a setup — which functional slots a space
needs, how much of a budget each slot deserves, and which slots carry the most
visual or functional impact. It deliberately contains NO prices, NO ASINs, and
NO product names.

Why this file has no products in it
-----------------------------------
Products and prices are resolved at request time from real MerchantListing rows
that were ingested and observed by the live pipeline. Hardcoding a price here
would mean shipping a number that was never observed, which is precisely the
failure mode DESIGN.md's Anti-Fabrication Mandate exists to prevent.

Budget allocation model
-----------------------
Each slot carries an `impact_weight`. Weights within a blueprint sum to 1.0.
The engine allocates `budget * impact_weight` as a slot's target spend, then
selects the best real listing whose price falls inside
`[target * min_factor, target * max_factor]`.

`phase` separates the spend:
  phase 1 = structural items that determine whether the space functions at all
  phase 2 = accents that finish the look once phase 1 is covered

`owned_key` is the token the UI sends back when a user says they already own
this slot. When present, the slot is skipped and its allocation is redistributed
across the remaining unfilled slots in the same phase.
"""

from typing import Any, Dict, List

# Match tokens are lowercase substrings tested against a product's canonical
# title and category string. A listing matches a slot when it hits at least one
# `match_any` token and none of the `exclude` tokens. Kept deliberately broad —
# precision comes from the price envelope and the verdict, not from the tokens.

SETUP_BLUEPRINTS: Dict[str, Dict[str, Any]] = {
    "bedroom": {
        "key": "bedroom",
        "title": "Bedroom Makeover",
        "tagline": "Sleep, storage, and warm light that makes a rented room feel yours.",
        "icon": "bed",
        "domain_group": "Home",
        "budget_min": 12000,
        "budget_max": 150000,
        "budget_default": 25000,
        "slots": [
            {
                "key": "bed",
                "label": "Bed Frame",
                "phase": 1,
                "impact_weight": 0.30,
                "min_factor": 0.55,
                "max_factor": 1.60,
                "owned_key": "bed",
                "match_any": ["bed frame", "queen bed", "king bed", "double bed", "single bed", "diwan"],
                "exclude": ["bedsheet", "bed sheet", "cover", "mattress protector"],
                "rationale": "Anchors the room and fixes its scale. Everything else is sized around it.",
            },
            {
                "key": "mattress",
                "label": "Mattress",
                "phase": 1,
                "impact_weight": 0.24,
                "min_factor": 0.55,
                "max_factor": 1.60,
                "owned_key": "mattress",
                "match_any": ["mattress"],
                "exclude": ["protector", "topper cover"],
                "rationale": "The single item most tied to daily comfort. Worth the largest share after the frame.",
            },
            {
                "key": "curtains",
                "label": "Curtains",
                "phase": 1,
                "impact_weight": 0.12,
                "min_factor": 0.45,
                "max_factor": 1.80,
                "owned_key": "curtains",
                "match_any": ["curtain", "drape", "blackout"],
                "exclude": ["rod", "hook", "clip"],
                "rationale": "Controls light and street noise. Disproportionate impact for the money.",
            },
            {
                "key": "lighting",
                "label": "Ambient Lighting",
                "phase": 1,
                "impact_weight": 0.12,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "lighting",
                "match_any": ["floor lamp", "table lamp", "bedside lamp", "led strip", "smart bulb", "lamp"],
                "exclude": ["bulb holder", "tube light"],
                "rationale": "Replacing overhead tube light with warm lamps changes the room's feel more than any decor item.",
            },
            {
                "key": "bedside_table",
                "label": "Bedside Table",
                "phase": 2,
                "impact_weight": 0.10,
                "min_factor": 0.45,
                "max_factor": 1.80,
                "owned_key": "bedside_table",
                "match_any": ["bedside", "nightstand", "night stand", "side table"],
                "exclude": [],
                "rationale": "Somewhere for a phone, a glass of water, and a lamp. Small but constantly used.",
            },
            {
                "key": "rug",
                "label": "Floor Rug",
                "phase": 2,
                "impact_weight": 0.08,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "rug",
                "match_any": ["rug", "carpet", "dhurrie"],
                "exclude": ["door mat", "doormat", "bath mat"],
                "rationale": "Warms bare tile or concrete and visually ties the furniture together.",
            },
            {
                "key": "decor",
                "label": "Wall Art & Plants",
                "phase": 2,
                "impact_weight": 0.04,
                "min_factor": 0.30,
                "max_factor": 2.50,
                "owned_key": "decor",
                "match_any": ["wall art", "painting", "canvas", "photo frame", "planter", "plant", "wall shelf"],
                "exclude": [],
                "rationale": "The finishing layer. Deliberately last — it cannot rescue a room that lacks the basics.",
            },
        ],
    },
    "wfh_desk": {
        "key": "wfh_desk",
        "title": "Work From Home Desk",
        "tagline": "A desk you can sit at for eight hours without your back filing a complaint.",
        "icon": "desk",
        "domain_group": "Technology",
        "budget_min": 10000,
        "budget_max": 200000,
        "budget_default": 30000,
        "slots": [
            {
                "key": "chair",
                "label": "Ergonomic Chair",
                "phase": 1,
                "impact_weight": 0.32,
                "min_factor": 0.55,
                "max_factor": 1.70,
                "owned_key": "chair",
                "match_any": ["office chair", "ergonomic chair", "study chair", "gaming chair", "chair"],
                "exclude": ["chair cover", "cushion", "dining chair", "plastic chair"],
                "rationale": "Highest-impact purchase in the list. Lumbar support is the difference between working and enduring.",
            },
            {
                "key": "desk",
                "label": "Desk",
                "phase": 1,
                "impact_weight": 0.26,
                "min_factor": 0.55,
                "max_factor": 1.70,
                "owned_key": "desk",
                "match_any": ["desk", "study table", "computer table", "work table"],
                "exclude": ["desk mat", "desk organizer", "desk lamp"],
                "rationale": "Determines usable depth. Too shallow and monitor distance forces a neck angle.",
            },
            {
                "key": "monitor",
                "label": "Monitor",
                "phase": 1,
                "impact_weight": 0.22,
                "min_factor": 0.50,
                "max_factor": 1.80,
                "owned_key": "monitor",
                "match_any": ["monitor", "display", "led monitor", "ips monitor"],
                "exclude": ["monitor stand", "monitor arm", "mount"],
                "rationale": "Screen real estate is the most direct multiplier on focused work.",
            },
            {
                "key": "task_lighting",
                "label": "Task Lighting",
                "phase": 1,
                "impact_weight": 0.08,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "task_lighting",
                "match_any": ["desk lamp", "monitor light", "screen bar", "study lamp", "led lamp"],
                "exclude": [],
                "rationale": "Reduces the contrast between a bright screen and a dark room, which is what actually causes eye strain.",
            },
            {
                "key": "keyboard_mouse",
                "label": "Keyboard & Mouse",
                "phase": 2,
                "impact_weight": 0.08,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "keyboard_mouse",
                "match_any": ["keyboard", "mouse", "combo"],
                "exclude": ["keyboard cover", "mouse pad"],
                "rationale": "Your hands touch these for the entire workday.",
            },
            {
                "key": "desk_accessories",
                "label": "Desk Mat & Riser",
                "phase": 2,
                "impact_weight": 0.04,
                "min_factor": 0.30,
                "max_factor": 2.50,
                "owned_key": "desk_accessories",
                "match_any": ["desk mat", "deskpad", "desk pad", "monitor stand", "laptop stand", "riser", "organizer"],
                "exclude": [],
                "rationale": "A riser that brings the screen to eye level is the cheapest posture fix available.",
            },
        ],
    },
    "living_room": {
        "key": "living_room",
        "title": "Living Room & Hall",
        "tagline": "Seating, surfaces, and light for the room guests actually see.",
        "icon": "sofa",
        "domain_group": "Home",
        "budget_min": 15000,
        "budget_max": 250000,
        "budget_default": 40000,
        "slots": [
            {
                "key": "sofa",
                "label": "Sofa",
                "phase": 1,
                "impact_weight": 0.38,
                "min_factor": 0.55,
                "max_factor": 1.60,
                "owned_key": "sofa",
                "match_any": ["sofa", "couch", "loveseat", "sectional", "recliner"],
                "exclude": ["sofa cover", "cushion cover", "sofa cum bed cover"],
                "rationale": "The largest object in the room. Its colour and scale set every other decision.",
            },
            {
                "key": "coffee_table",
                "label": "Coffee Table",
                "phase": 1,
                "impact_weight": 0.16,
                "min_factor": 0.50,
                "max_factor": 1.80,
                "owned_key": "coffee_table",
                "match_any": ["coffee table", "center table", "centre table"],
                "exclude": ["table cover", "runner"],
                "rationale": "Gives the seating a centre of gravity and somewhere to put things down.",
            },
            {
                "key": "tv_unit",
                "label": "TV Unit",
                "phase": 1,
                "impact_weight": 0.14,
                "min_factor": 0.50,
                "max_factor": 1.80,
                "owned_key": "tv_unit",
                "match_any": ["tv unit", "tv stand", "entertainment unit", "media console", "tv cabinet"],
                "exclude": ["wall mount", "bracket"],
                "rationale": "Hides cable clutter, which is the main thing that makes a hall look unfinished.",
            },
            {
                "key": "lighting",
                "label": "Floor & Accent Lighting",
                "phase": 1,
                "impact_weight": 0.12,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "lighting",
                "match_any": ["floor lamp", "table lamp", "led strip", "smart bulb", "lamp"],
                "exclude": ["tube light"],
                "rationale": "Layered lamps beat a single ceiling light for both mood and usable brightness.",
            },
            {
                "key": "rug",
                "label": "Area Rug",
                "phase": 2,
                "impact_weight": 0.12,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "rug",
                "match_any": ["rug", "carpet", "dhurrie"],
                "exclude": ["door mat", "doormat", "bath mat"],
                "rationale": "Defines the seating zone in an open-plan room.",
            },
            {
                "key": "decor",
                "label": "Wall Art & Plants",
                "phase": 2,
                "impact_weight": 0.08,
                "min_factor": 0.30,
                "max_factor": 2.50,
                "owned_key": "decor",
                "match_any": ["wall art", "painting", "canvas", "photo frame", "planter", "plant", "wall shelf", "vase"],
                "exclude": [],
                "rationale": "Fills vertical space, which is what stops a furnished room still feeling empty.",
            },
        ],
    },
    "gaming": {
        "key": "gaming",
        "title": "Gaming Setup",
        "tagline": "Frames, response time, and a chair that survives a long session.",
        "icon": "gamepad",
        "domain_group": "Technology",
        "budget_min": 25000,
        "budget_max": 400000,
        "budget_default": 75000,
        "slots": [
            {
                "key": "monitor",
                "label": "Gaming Monitor",
                "phase": 1,
                "impact_weight": 0.30,
                "min_factor": 0.50,
                "max_factor": 1.80,
                "owned_key": "monitor",
                "match_any": ["gaming monitor", "monitor", "144hz", "165hz", "display"],
                "exclude": ["monitor stand", "mount", "arm"],
                "rationale": "Refresh rate is where gaming money converts most directly into felt experience.",
            },
            {
                "key": "chair",
                "label": "Gaming Chair",
                "phase": 1,
                "impact_weight": 0.22,
                "min_factor": 0.55,
                "max_factor": 1.70,
                "owned_key": "chair",
                "match_any": ["gaming chair", "ergonomic chair", "office chair", "chair"],
                "exclude": ["chair cover", "cushion"],
                "rationale": "Long sessions expose a bad chair faster than a bad GPU.",
            },
            {
                "key": "desk",
                "label": "Gaming Desk",
                "phase": 1,
                "impact_weight": 0.16,
                "min_factor": 0.50,
                "max_factor": 1.80,
                "owned_key": "desk",
                "match_any": ["gaming desk", "desk", "computer table", "study table"],
                "exclude": ["desk mat", "organizer"],
                "rationale": "Needs depth for monitor distance and width for full mouse travel at low DPI.",
            },
            {
                "key": "headset",
                "label": "Headset",
                "phase": 1,
                "impact_weight": 0.12,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "headset",
                "match_any": ["gaming headset", "headset", "headphone"],
                "exclude": ["headphone stand", "case"],
                "rationale": "Positional audio is a real competitive input, not just immersion.",
            },
            {
                "key": "keyboard_mouse",
                "label": "Keyboard & Mouse",
                "phase": 1,
                "impact_weight": 0.12,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "keyboard_mouse",
                "match_any": ["mechanical keyboard", "gaming keyboard", "gaming mouse", "keyboard", "mouse"],
                "exclude": ["keyboard cover"],
                "rationale": "Actuation and sensor consistency matter more than switch branding.",
            },
            {
                "key": "lighting",
                "label": "RGB & Bias Lighting",
                "phase": 2,
                "impact_weight": 0.05,
                "min_factor": 0.30,
                "max_factor": 2.50,
                "owned_key": "lighting",
                "match_any": ["led strip", "rgb light", "light bar", "smart bulb", "bias lighting"],
                "exclude": [],
                "rationale": "Bias light behind the monitor genuinely reduces eye fatigue in a dark room.",
            },
            {
                "key": "desk_accessories",
                "label": "Deskmat & Cable Management",
                "phase": 2,
                "impact_weight": 0.03,
                "min_factor": 0.30,
                "max_factor": 2.50,
                "owned_key": "desk_accessories",
                "match_any": ["desk mat", "deskpad", "mouse pad", "cable", "organizer", "monitor stand"],
                "exclude": [],
                "rationale": "Cheap, and the difference between a setup and a pile of equipment.",
            },
        ],
    },
    "student": {
        "key": "student",
        "title": "Student Study Setup",
        "tagline": "Everything needed to actually study in a hostel room, on a real budget.",
        "icon": "book",
        "domain_group": "Lifestyle",
        "budget_min": 6000,
        "budget_max": 60000,
        "budget_default": 15000,
        "slots": [
            {
                "key": "desk",
                "label": "Study Table",
                "phase": 1,
                "impact_weight": 0.30,
                "min_factor": 0.50,
                "max_factor": 1.80,
                "owned_key": "desk",
                "match_any": ["study table", "desk", "computer table", "foldable table"],
                "exclude": ["desk organizer", "desk lamp"],
                "rationale": "A dedicated surface separates study from sleep, which matters in a single room.",
            },
            {
                "key": "chair",
                "label": "Study Chair",
                "phase": 1,
                "impact_weight": 0.26,
                "min_factor": 0.50,
                "max_factor": 1.80,
                "owned_key": "chair",
                "match_any": ["study chair", "office chair", "ergonomic chair", "chair"],
                "exclude": ["chair cover", "plastic chair", "dining chair"],
                "rationale": "Back support during long revision sessions. The most common thing students under-buy.",
            },
            {
                "key": "task_lighting",
                "label": "Study Lamp",
                "phase": 1,
                "impact_weight": 0.16,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "task_lighting",
                "match_any": ["study lamp", "desk lamp", "table lamp", "led lamp", "rechargeable lamp"],
                "exclude": [],
                "rationale": "Lets one person work without lighting the whole room, which matters with a roommate.",
            },
            {
                "key": "storage",
                "label": "Storage & Shelving",
                "phase": 1,
                "impact_weight": 0.14,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "storage",
                "match_any": ["book shelf", "bookshelf", "storage rack", "wall shelf", "organizer", "storage box"],
                "exclude": [],
                "rationale": "Hostel rooms run out of surface before they run out of space.",
            },
            {
                "key": "headphones",
                "label": "Headphones",
                "phase": 2,
                "impact_weight": 0.10,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "headphones",
                "match_any": ["headphone", "headset", "earphone", "earbuds"],
                "exclude": ["case", "stand"],
                "rationale": "Noise isolation is the only realistic form of privacy in shared accommodation.",
            },
            {
                "key": "desk_accessories",
                "label": "Desk Organisation",
                "phase": 2,
                "impact_weight": 0.04,
                "min_factor": 0.30,
                "max_factor": 2.50,
                "owned_key": "desk_accessories",
                "match_any": ["desk organizer", "pen stand", "laptop stand", "desk mat", "file"],
                "exclude": [],
                "rationale": "Low cost, and keeps a small surface usable.",
            },
        ],
    },
    "kitchen": {
        "key": "kitchen",
        "title": "Kitchen & Coffee Bar",
        "tagline": "The appliances and storage that get used every single day.",
        "icon": "coffee",
        "domain_group": "Home",
        "budget_min": 8000,
        "budget_max": 120000,
        "budget_default": 25000,
        "slots": [
            {
                "key": "coffee_machine",
                "label": "Coffee Maker",
                "phase": 1,
                "impact_weight": 0.30,
                "min_factor": 0.45,
                "max_factor": 1.90,
                "owned_key": "coffee_machine",
                "match_any": ["coffee maker", "espresso", "coffee machine", "french press", "moka"],
                "exclude": ["coffee powder", "coffee beans", "mug"],
                "rationale": "Daily-use appliance with a long life. Spending here amortises well.",
            },
            {
                "key": "air_fryer",
                "label": "Air Fryer",
                "phase": 1,
                "impact_weight": 0.28,
                "min_factor": 0.50,
                "max_factor": 1.80,
                "owned_key": "air_fryer",
                "match_any": ["air fryer", "airfryer", "otg", "microwave oven"],
                "exclude": ["accessory", "liner", "basket"],
                "rationale": "The appliance most likely to displace daily takeaway spend.",
            },
            {
                "key": "storage",
                "label": "Storage Containers",
                "phase": 1,
                "impact_weight": 0.18,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "storage",
                "match_any": ["container", "jar", "canister", "storage set", "airtight"],
                "exclude": [],
                "rationale": "Airtight storage is what keeps an Indian kitchen workable through humidity.",
            },
            {
                "key": "rack",
                "label": "Counter Rack",
                "phase": 2,
                "impact_weight": 0.14,
                "min_factor": 0.40,
                "max_factor": 2.00,
                "owned_key": "rack",
                "match_any": ["kitchen rack", "counter organizer", "shelf", "trolley", "stand"],
                "exclude": [],
                "rationale": "Counter space is the binding constraint in most Indian kitchens.",
            },
            {
                "key": "lighting",
                "label": "Under-Cabinet Lighting",
                "phase": 2,
                "impact_weight": 0.10,
                "min_factor": 0.30,
                "max_factor": 2.50,
                "owned_key": "lighting",
                "match_any": ["under cabinet", "led strip", "puck light", "kitchen light", "motion sensor light"],
                "exclude": [],
                "rationale": "Removes the shadow your own body casts over the chopping area.",
            },
        ],
    },
}


STYLE_PROFILES: Dict[str, Dict[str, Any]] = {
    "modern_minimal": {
        "key": "modern_minimal",
        "label": "Modern Minimal",
        "description": "Clean lines, restrained palette, few objects.",
        "prefer_tokens": ["minimal", "modern", "white", "grey", "gray", "matte", "nordic", "scandinavian"],
    },
    "warm_boho": {
        "key": "warm_boho",
        "label": "Warm & Cosy",
        "description": "Natural textures, warm light, layered fabric.",
        "prefer_tokens": ["wooden", "wood", "jute", "cotton", "beige", "boho", "rattan", "cane", "warm"],
    },
    "dark_aesthetic": {
        "key": "dark_aesthetic",
        "label": "Dark & Architectural",
        "description": "Deep tones, metal, high contrast.",
        "prefer_tokens": ["black", "dark", "matte black", "metal", "industrial", "walnut", "espresso"],
    },
    "no_preference": {
        "key": "no_preference",
        "label": "No Preference",
        "description": "Rank purely on price evidence.",
        "prefer_tokens": [],
    },
}


TIER_PROFILES: Dict[str, Dict[str, Any]] = {
    "saver": {
        "key": "saver",
        "label": "Budget Saver",
        "description": "Lowest defensible price per slot. Drops phase 2 first when the budget is tight.",
        "budget_factor": 0.70,
        "accent": "#0F9D58",
    },
    "value": {
        "key": "value",
        "label": "Best Value",
        "description": "Balances price evidence against slot impact. The default recommendation.",
        "budget_factor": 1.00,
        "accent": "#1A73E8",
    },
    "premium": {
        "key": "premium",
        "label": "Premium",
        "description": "Spends up where durability and daily contact justify it.",
        "budget_factor": 1.35,
        "accent": "#8430CE",
    },
}


def get_blueprint(space: str) -> Dict[str, Any]:
    """Returns the blueprint for a space key, or raises KeyError if unknown."""
    return SETUP_BLUEPRINTS[space]


def list_blueprints() -> List[Dict[str, Any]]:
    """Returns blueprint summaries for browse screens, without slot internals."""
    return [
        {
            "key": bp["key"],
            "title": bp["title"],
            "tagline": bp["tagline"],
            "icon": bp["icon"],
            "domain_group": bp["domain_group"],
            "budget_min": bp["budget_min"],
            "budget_max": bp["budget_max"],
            "budget_default": bp["budget_default"],
            "slot_count": len(bp["slots"]),
            "essential_count": sum(1 for s in bp["slots"] if s["phase"] == 1),
        }
        for bp in SETUP_BLUEPRINTS.values()
    ]


def validate_weights() -> Dict[str, float]:
    """
    Returns each blueprint's total impact weight. Used by tests to assert the
    allocation model stays coherent as slots are added or removed.
    """
    return {
        key: round(sum(s["impact_weight"] for s in bp["slots"]), 6)
        for key, bp in SETUP_BLUEPRINTS.items()
    }
