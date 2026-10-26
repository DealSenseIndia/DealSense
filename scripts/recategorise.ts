import "./env";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../src/lib/db/client";
import { products } from "../src/lib/db/schema";
import { resolveLeaf } from "../src/lib/db/taxonomy";

/**
 * Re-file the products the browse pages cannot place.
 *
 * Two kinds of row exist in `products.category`: the ones our own importers
 * wrote (canonical leaf names, always placeable) and the ones that came straight
 * out of a store feed — "Libas", "Wakefit Bed Mattress", "Optimum Nutrition",
 * "THE ATTIC TV Entertainment Units". A brand shelf is not a category, so those
 * products appear on no category page and can only ever be found by search.
 *
 * This script walks the rows the taxonomy cannot place and re-files them from
 * the *title*, which is the one field that always describes the product. It only
 * writes a value the taxonomy can resolve, and it never touches a category it
 * has no rule for — an honest gap beats a confident guess.
 *
 *   npx tsx scripts/recategorise.ts --dry     report only
 *   npx tsx scripts/recategorise.ts           write
 */

/** Ordered most-specific-first: the first rule whose pattern hits wins. */
const RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /\b(massage gun|percussion massager)\b/i, category: "Massage Guns" },
  { pattern: /\b(resistance band|exercise band|lat\s?band)\b/i, category: "Resistance Bands" },
  { pattern: /\b(yoga mat|exercise mat|gym mat)\b/i, category: "Yoga Mats" },
  { pattern: /\b(dumbbell|kettlebell|barbell|weight set)\b/i, category: "Dumbbells" },
  { pattern: /\b(treadmill|cycling bike|exercise bike|spinning bike)\b/i, category: "Treadmills" },
  { pattern: /\b(gym glove|lifting glove|weightlifting glove)\b/i, category: "Gym Gloves" },
  { pattern: /\b(whey protein|protein powder|mass gainer|creatine)\b/i, category: "Whey Protein" },
  { pattern: /\b(water bottle\s?(shaker)?|protein shaker|gym bottle)\b/i, category: "Water Bottles" },
  { pattern: /\b(skip ping rope|skipping rope|jump rope)\b/i, category: "Skipping Ropes" },
  { pattern: /\b(foam roller|roller for exercise|cavity roller)\b/i, category: "Foam Rollers" },

  { pattern: /\b(webcam|web camera)\b/i, category: "Webcams" },
  { pattern: /\b(desk lamp|table lamp|study lamp|bedside lamp|reading light)\b/i, category: "Table Lamps" },
  { pattern: /\b(festive light|led strip|string light|decor light)\b/i, category: "LED Strips" },
  // Decor first, because a showpiece description is full of the rooms it can
  // sit in — "for Living Room, Office Desk, Bookshelf" — and those words name
  // furniture, not the product.
  { pattern: /\b(showpiece|figurine|idol|murti|statue|sculpture|vase|wall decor|wall hanging|painting)\b/i, category: "Home Decor" },
  { pattern: /\b(cushion cover|throw pillow|cushion)\b/i, category: "Home Decor" },
  { pattern: /\b(gaming desk|computer desk|study table|office desk|office table|writing desk|computer table)\b/i, category: "Desks" },
  { pattern: /\b(tv unit|entertainment unit|television stand|tv stand)\b/i, category: "TV Units" },
  { pattern: /\b(wall shelf|floating shelf|standing shelf|tiered shelf|shelf|shelves|book shelf|storage rack)\b/i, category: "Shelves" },
  { pattern: /\b(recliner|sofa|couch|sectional)\b/i, category: "Sofas" },
  { pattern: /\b(dresser|dressing table|vanity table|makeup table)\b/i, category: "Dressers" },
  { pattern: /\b(mattress|bed mattress|spring bed|foam bed)\b/i, category: "Mattresses" },
  { pattern: /\b(queen size bed|king size bed|single bed|bed frame|wooden bed|sheesham|box storage bed)\b/i, category: "Beds" },
  { pattern: /\b(office chair|study chair|desk chair|mid back|high back|gaming chair|recline)\b/i, category: "Chairs" },
  { pattern: /\b(bed sheet|bedsheet|bedding set|bed linen|pillow cover)\b/i, category: "Bed Linen" },
  { pattern: /\b(plant pot|flower pot|planter|grow bag|garden tool|gardening)\b/i, category: "Gardening" },
  { pattern: /\b(bird repeller|bird control|pest control|mosquito repellent)\b/i, category: "Home Decor" },
  { pattern: /\b(area rug|carpet|doormat)\b/i, category: "Carpets" },
  { pattern: /\b(curtein|curtain|net curtain|roller blind)\b/i, category: "Curtains" },
  { pattern: /\b(wall clock|analog clock)\b/i, category: "Clocks" },

  { pattern: /\b(kurti|kurta|straight kurti|farshi)\b/i, category: "Kurtas & Kurtis" },
  { pattern: /\b(saree|sari|lehenga|dupatta|blouse)\b/i, category: "Sarees" },
  { pattern: /\b(t-shirt|tshirt|polo|round neck)\b/i, category: "T-Shirts" },
  { pattern: /\b(shirt|checked shirt|formal shirt)\b/i, category: "Shirts" },
  { pattern: /\b(jeans|denim)\b/i, category: "Jeans" },
  { pattern: /\b(legging|nightwear|pyjama|loungewear)\b/i, category: "Leggings" },
  { pattern: /\b(shawl|stole|scarf|muffler|dupatta)\b/i, category: "Scarves" },
  { pattern: /\b(underwear|briefs|boxer|vest)\b/i, category: "Innerwear" },
  { pattern: /\b(sneaker|casual shoes|sports shoes|running shoes|formal shoes|shoes)\b/i, category: "Sports Shoes" },
  { pattern: /\b(sandal|flip flop|slipper|floaters)\b/i, category: "Sandals" },
  { pattern: /\b(backpack|rucksack|school bag)\b/i, category: "Backpacks" },
  { pattern: /\b(handbag|purse|clutch|tote)\b/i, category: "Handbags" },
  { pattern: /\b(luggage|trolley bag|suitcase|cabin bag)\b/i, category: "Luggage" },
  { pattern: /\b(watch|watchees)\b/i, category: "Watches" },
  { pattern: /\b(belt)\b/i, category: "Belts" },
  { pattern: /\b(wallet|card holder)\b/i, category: "Wallets" },
  { pattern: /\b(earring|necklace|bracelet|ring|pendant|anklet)\b/i, category: "Jewellery" },
  { pattern: /\b(sunglasses|aviator|wayfarer)\b/i, category: "Sunglasses" },
  { pattern: /\b(desk mat|gaming mat|candle-stick chart)\b/i, category: "Desk Accessories" },

  { pattern: /\b(lip tint|lipstick|lip gloss|lip balm)\b/i, category: "Lipstick" },
  { pattern: /\b(eyebrow|eye brow|kajal|eyeliner|mascara)\b/i, category: "Eye Makeup" },
  { pattern: /\b(serum|face wash|cleanser|moisturiser|moisturizer|sunscreen|toner|face cream)\b/i, category: "Serums" },
  { pattern: /\b(nail polish|nail care|manicure|cuticle)\b/i, category: "Nail Care" },
  { pattern: /\b(hair colour|hair color|henna|shampoo|conditioner|hair oil|hair serum)\b/i, category: "Hair Care" },
  { pattern: /\b(perfume|deodorant|body mist|attar)\b/i, category: "Perfume" },
  { pattern: /\b(trimmer|shaver|hair dryer|straightener|grooming kit)\b/i, category: "Trimmers" },
  { pattern: /\b(lotion|cream|body wash|soap|scrub|soothing gel|aloe vera)\b/i, category: "Body Lotions" },

  { pattern: /\b(espresso|coffee maker|coffee machine|filter coffee|French press|coffee)\b/i, category: "Coffee" },
  { pattern: /\b(green tea|tea (box|pack|leaves)|chai|kadak)\b/i, category: "Tea" },
  { pattern: /\b(muesli|oats|breakfast cereal|granola)\b/i, category: "Oats" },
  { pattern: /\b(jam|preserve|marmalade|honey|chutney|pickle)\b/i, category: "Jams & Preserves" },
  { pattern: /\b(biscuit|cookie|wafer|chocolate|namkeen|snack)\b/i, category: "Snacks" },
  { pattern: /\b(noodle|maggi|pasta|atta|rice|dal|pulses)\b/i, category: "Grocery Staples" },

  { pattern: /\b(mixer grinder|juicer|grinder)\b/i, category: "Mixer Grinders" },
  { pattern: /\b(induction cooktop|hot plate)\b/i, category: "Induction Cooktops" },
  { pattern: /\bkettle\b/i, category: "Electric Kettles" },
  { pattern: /\b(geyser|water heater|immersion rod|immersion heater|heater rod)\b/i, category: "Geysers" },
  { pattern: /\b(room heater|fan heater|oil filled radiator)\b/i, category: "Heaters" },
  { pattern: /\b(air fryer|microwave|oven|toaster|sandwich maker)\b/i, category: "Air Fryers" },
  { pattern: /\b(refrigerator|fridge|washing machine|dishwasher|water purifier|air purifier|ac )\b/i, category: "Home Appliances" },
  { pattern: /\b(vacuum cleaner|car vacuum|stick vacuum)\b/i, category: "Vacuum Cleaners" },
  { pattern: /\b(cookware|kadai|pan set|pressure cooker|tawa|dosa)\b/i, category: "Cookware" },
  { pattern: /\b(dinner set|serve ware|serveware|cup|mug|tumbler|glass set)\b/i, category: "Cups & Mugs" },
  { pattern: /\b(storage container|jar|airtight)\b/i, category: "Jars & Containers" },
  { pattern: /\b(knife|cutter|peeler|strainer|colander|tongs|mould)\b/i, category: "Kitchen Tools" },
  { pattern: /\b(bathroom|towel|wash cloth|shower|soap dish|tap)\b/i, category: "Bathroom Accessories" },

  { pattern: /\b(car vacuum|car shampoo|car care|microfiber|wax|polish)\b/i, category: "Car Care" },
  { pattern: /\b(dash cam|dashcam|car charger|carplay)\b/i, category: "Dash Cameras" },
  { pattern: /\b(seat cover|floor mat|steering cover|sunshade)\b/i, category: "Car Accessories" },
  { pattern: /\b(tyre|tire) (inflator|pressure|tube|valve)\b/i, category: "Tyre Inflators" },
  { pattern: /\b(bike helmet|rider jacket|gloves for bike)\b/i, category: "Full Face Helmets" },

  { pattern: /\b(pet food|dog (food|bed|toy)|cat (food|litter)|aquarium|fish tank)\b/i, category: "Pet Supplies" },
  { pattern: /\b(baby |kid |kids |infant|newborn|toddler|crib|cot mobile|cradle)\b/i, category: "Baby Care" },
  { pattern: /\b(toy|rattle|building block|puzzle|board game)\b/i, category: "Toys & Games" },

  { pattern: /\b(laptop|macbook|ultrabook)\b/i, category: "Laptops" },
  { pattern: /\b(desktop pc|gaming pc|all in one pc|mini pc|personal computer|computer kit)\b/i, category: "Computers & Accessories" },
  { pattern: /\b(monitor)\b/i, category: "Monitors" },
  // Retail sells a 22" desktop screen as "Full HD LED Backlit VA Panel" and
  // never writes the word monitor at all.
  { pattern: /\bled backlit (va |ips |tn )?panel/i, category: "Monitors" },
  { pattern: /\b(keyboard|mouse pad)\b/i, category: "Desk Accessories" },
  { pattern: /\b(ssd|hard disk|pen drive|memory card|hdd)\b/i, category: "Storage" },
  { pattern: /\b(ddr[345]|sodimm|dimm|ram kit|memory kit|ram module)\b/i, category: "RAM" },
  { pattern: /\b(motherboard)\b/i, category: "Motherboards" },
  { pattern: /\b(graphic card|graphics card|gpu)\b/i, category: "Graphics Cards" },
  { pattern: /\b(processor|\bcpu\b|core i[357]|ryzen)\b/i, category: "Processors" },
  { pattern: /\b(cooler|cabinet)\b/i, category: "CPU Coolers" },
  { pattern: /\b(ups|power backup)\b/i, category: "UPS" },
  { pattern: /\b(router|modem|wifi extender)\b/i, category: "Wi-fi Routers" },
  { pattern: /\b(batteries|power bank|charger|adapter|adaptor)\b/i, category: "Chargers" },
  { pattern: /\b(smartwatch|smart watch|fitness band)\b/i, category: "Smartwatches" },
  { pattern: /\b(headphone|headset|earbuds|tws|earphone|neckband)\b/i, category: "Headphones" },
  { pattern: /\b(speaker|soundbar|bluetooth speaker)\b/i, category: "Speakers" },
  { pattern: /\b(mobile|smartphone|iphone|oneplus|samsung galaxy|vivo|oppo|redmi|realme)\b/i, category: "Smartphones" },
  { pattern: /\b(tablet|ipad)\b/i, category: "Tablets" },
  // Phone rows that carry only a model name ("Google Pixel 10a (Lavender, 256
  // GB)", "LAVA Virat V1 5G") say nothing about being a phone. Last rule in the
  // tech block, so a 5G tablet or a 4G camera is filed as itself first.
  { pattern: /(\b5g\b|\b4g\b|pixel|\bnord\b|moto g\d|motorola g\d|ai\+ pulse|iphone)/i, category: "Smartphones" },
  { pattern: /\b(camera|dslr|mirrorless|gopro|action cam)\b/i, category: "Camera Accessories" },
  { pattern: /\b(tripod|gimbal|selfie stick|ring light)\b/i, category: "Camera Accessories" },
  { pattern: /\b(joystick|gamepad|controller|console|playstation|xbox|nintendo)\b/i, category: "Controllers" },
  { pattern: /\b(projector)\b/i, category: "Projectors" },
  { pattern: /\b(book|novel|ncert)\b/i, category: "Books" },
  { pattern: /\b(notebook|diary|planner|pen|pencil|stationery|file)\b/i, category: "Office Supplies" },
];

const dryRun = process.argv.includes("--dry");
const verbose = process.argv.includes("--verbose");

async function main() {
  await ensureSchema();

  const rows = await db
    .select({ id: products.id, title: products.title, brand: products.brand, category: products.category })
    .from(products);

  const needsHelp: typeof rows = [];
  for (const r of rows) {
    if (!r.category || !resolveLeaf(r.category)) needsHelp.push(r);
  }

  const counts = new Map<string, number>();
  let updated = 0;
  let unresolved = 0;

  for (const row of needsHelp) {
    const haystack = `${row.title} ${row.brand ?? ""}`;
    const rule = RULES.find((r) => r.pattern.test(haystack));
    if (!rule) {
      unresolved++;
      console.log(`  ?  "${row.category ?? "NULL"}"  ${row.title.slice(0, 70)}`);
      continue;
    }
    // Guard against a rule that names a leaf the taxonomy does not carry.
    if (!resolveLeaf(rule.category)) {
      unresolved++;
      console.log(`  !  rule "${rule.category}" is not a taxonomy leaf — ${row.title.slice(0, 60)}`);
      continue;
    }
    if (verbose) {
      console.log(`  ${row.category ?? "NULL"} -> ${rule.category}  |  ${row.title.slice(0, 62)}`);
    }
    counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1);
    updated++;
    if (!dryRun) {
      await db.update(products).set({ category: rule.category }).where(eq(products.id, row.id));
    }
  }

  console.log(`\n${needsHelp.length} products were unplaceable · ${updated} re-filed · ${unresolved} left alone`);
  console.log(dryRun ? "(dry run — nothing written)\n" : "\nWRITTEN AS");
  for (const [category, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${category}`);
  }
}

main().then(() => process.exit(0));
