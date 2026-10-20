import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, products } from "./schema";

export interface CategoryGroup {
  slug: string;
  name: string;
  emoji: string;
  icon: string;
  count: number;
  subcategories: string[];
  coverImage: string | null;
}

/**
 * Top-level taxonomy. Each group lists the leaf categories it owns, matched
 * by keyword against our real category names.
 */
const GROUPS: { slug: string; name: string; emoji: string; icon: string; keywords: string[] }[] = [
  {
    slug: "electronics",
    name: "Electronics",
    emoji: "💻",
    icon: "Laptop",
    keywords: [
      "mobile", "phone", "laptop", "computer", "tablet", "watch", "ear", "audio",
      "power bank", "charger", "monitor", "camera", "gadget", "electronics", "accessories",
    ],
  },
  {
    slug: "fashion",
    name: "Fashion & Apparel",
    emoji: "👕",
    icon: "Shirt",
    keywords: ["tshirt", "shirt", "jeans", "shoe", "sneaker", "sweatshirt", "fashion", "apparel", "dress", "kurti", "saree", "bag", "backpack", "sunglass"],
  },
  {
    slug: "home-living",
    name: "Home & Living",
    emoji: "🛋️",
    icon: "Sofa",
    keywords: ["furniture", "sofa", "chair", "table", "bed", "mattress", "decor", "kitchen", "home", "lamp", "cookware", "appliance"],
  },
  {
    slug: "beauty",
    name: "Beauty & Personal Care",
    emoji: "💄",
    icon: "Sparkles",
    keywords: ["lipstick", "eyeliner", "serum", "face", "perfume", "hair", "makeup", "beauty", "skin", "sunscreen", "cream", "fragrance"],
  },
  {
    slug: "sports",
    name: "Sports & Fitness",
    emoji: "🏃",
    icon: "Dumbbell",
    keywords: ["sport", "running", "training", "football", "cricket", "gym", "yoga", "fitness", "volleyball"],
  },
  {
    slug: "gaming",
    name: "Gaming",
    emoji: "🎮",
    icon: "Gamepad2",
    keywords: ["gaming", "console", "playstation", "xbox", "nintendo", "joystick", "gpu", "graphics"],
  },
  {
    slug: "books",
    name: "Books & Stationery",
    emoji: "📚",
    icon: "BookOpen",
    keywords: ["book", "stationery", "notebook", "pen", "office"],
  },
  {
    slug: "baby-kids",
    name: "Baby & Kids",
    emoji: "🧸",
    icon: "Baby",
    keywords: ["baby", "kids", "toy", "infant"],
  },
  {
    slug: "automotive",
    name: "Automotive",
    emoji: "🚗",
    icon: "Car",
    keywords: ["car", "auto", "vehicle", "bike", "tyre", "helmet"],
  },
  {
    slug: "travel",
    name: "Travel & Luggage",
    emoji: "🧳",
    icon: "Plane",
    keywords: ["luggage", "suitcase", "travel", "backpack", "tripod"],
  },
  {
    slug: "pets",
    name: "Pet Supplies",
    emoji: "🐶",
    icon: "Dog",
    keywords: ["pet", "dog", "cat", "aquarium"],
  },
];

function groupFor(category: string | null): (typeof GROUPS)[number] | null {
  if (!category) return null;
  const c = category.toLowerCase();
  for (const g of GROUPS) {
    if (g.keywords.some((k) => c.includes(k))) return g;
  }
  return null;
}

/** Public helper: map a raw leaf category to its top-level group. */
export function groupForCategory(category: string | null) {
  return groupFor(category);
}

/** Top-level category groups built from the real catalogue. */
export async function getCategoryGroups(): Promise<CategoryGroup[]> {
  await ensureSchema();

  const rows = await db
    .select({
      category: products.category,
      count: sql<number>`count(*)`,
      cover: sql<string | null>`max(${products.imageUrl})`,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(and(isNotNull(listings.price), isNotNull(products.category)))
    .groupBy(products.category)
    .orderBy(sql`count(*) desc`);

  const map = new Map<string, CategoryGroup>();

  for (const r of rows) {
    const g = groupFor(r.category);
    if (!g) continue;
    let entry = map.get(g.slug);
    if (!entry) {
      entry = {
        slug: g.slug,
        name: g.name,
        emoji: g.emoji,
        icon: g.icon,
        count: 0,
        subcategories: [],
        coverImage: r.cover ?? null,
      };
      map.set(g.slug, entry);
    }
    entry.count += r.count;
    if (r.category && !entry.subcategories.includes(r.category)) {
      entry.subcategories.push(r.category);
    }
  }

  return [...map.values()]
    .map((g) => ({ ...g, subcategories: g.subcategories.slice(0, 8) }))
    .sort((a, b) => b.count - a.count);
}

/** Popular search chips for the categories page. */
export async function getPopularSearches(): Promise<string[]> {
  const groups = await getCategoryGroups();
  const out: string[] = [];
  for (const g of groups) {
    for (const s of g.subcategories) {
      if (out.length < 8) out.push(s);
    }
  }
  return out;
}
