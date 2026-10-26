/**
 * Smart Setups depth pass.
 *
 * Imports genuine, price-verified catalogue depth for the slots the setups
 * blueprints now ask for: a full PC build (GPU/CPU/board/RAM/SSD/PSU/case/
 * cooler), the desk and audio around it, and the missing essentials in every
 * other room.
 *
 * Rules, same as every other importer here:
 *   • Only exact provider product ids are fetched — never a guessed match.
 *   • At least three recorded price points, latest within 45 days, in stock.
 *   • One real listing per product; no invented history, no placeholder prices.
 *   • Store links come from the listing; outbound buys still use our /go route.
 *
 * The picker deliberately spreads picks across the available price range so a
 * ₹18,000 card, a ₹50,000 card and a ₹1,50,000 card all exist in the catalogue
 * instead of ten variants at the same price.
 *
 *   npx tsx scripts/import-setups-depth.ts --dry
 *   npx tsx scripts/import-setups-depth.ts --only gpu
 *   npx tsx scripts/import-setups-depth.ts
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings } from "../src/lib/db/schema";
import { addObservation, upsertListing, upsertProduct } from "../src/lib/db/queries";
import {
  fetchPriceHistoryAi,
  searchPriceHistoryAi,
  type PHAIProduct,
} from "../src/lib/engine/providers/pricehistoryAi";
import { closePlaywright } from "../src/lib/merchants/http";
import { merchantFromUrl } from "../src/lib/merchants/resolve";
import { priceTrackedMerchants } from "../src/lib/config";
import { slugify } from "../src/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SUPPORTED = new Set<string>(priceTrackedMerchants);

function arg(name: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? (args[i + 1] ?? "") : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

interface Target {
  key: string;
  query: string;
  include: RegExp;
  exclude?: RegExp;
  category: string;
  max: number;
  minPrice: number;
  maxPrice?: number;
}

/**
 * Shared title filters.
 *
 * These exist because the same wrong product keeps arriving under a different
 * query: a phone that mentions its processor, a tablet that mentions its quad
 * speakers, a desktop that mentions its RAM. Every target that sells into a PC
 * slot reuses the same guard rails instead of inventing a new one per query.
 */
const GPU_EXCLUDE =
  /laptop|notebook|external|enclosure|egpu|water ?block|waterblock|bracket|holder|riser|capture|docking|adapter|cable|case|server|processor|\bcpu\b|gt ?730|gt ?1030|rx ?550|rx ?580|rx ?590|hd ?5450|hd ?6450|gddr3|gtx ?7\d{2}|gtx ?9\d{2}|gtx ?10\d{2}/i;
/**
 * The entry band, where the Indian market is mostly RX 580/590 and GTX 1660
 * cards from lesser-known brands. Those names were banned above because a
 * ₹20,000 card looked like noise next to an RTX 5080; for a ₹50,000–₹75,000
 * build they are the honest answer, so this variant keeps them and still
 * rejects the prebuilt-desktop listings that share the same search results.
 */
const ENTRY_GPU_EXCLUDE =
  /laptop|notebook|\bdesktop\b|tower|assembled|prebuilt|pre-built|\bcpu\b|processor|xeon|ryzen|\bcore i[3579]\b|\d+\s?gb\s?(ram|ddr3)\b|\bssd\b|\bhdd\b|\bcombo\b|\bkit\b|riser|bracket|holder|support|water ?block|thermal|paste|capture|enclosure|external|\bcable\b|adapter|docking|server|cabinet|\bcase\b|mining|\d+ ?hdmi|hdmi monitor|4k ?tv box/i;
const CPU_EXCLUDE =
  /laptop|notebook|mobile|smartphone|\bphone\b|5g|4g|tablet|macbook|mini pc|nuc|cooler|motherboard|mainboard|thermal paste|processor socket only|graphics card|battery|camera|display|inch|desktop pc|gaming pc|tower desktop|assembled|desktop cpu|reliance|lavya|\bcabinet\b|\brtx\b|geforce|\batx\b|\bmatx\b|dram|supports intel|supports amd|\bx870e?\b|\bb650m?\b|\bb760m?\b|\bz890\b|\bh610m?\b/i;
const BOARD_EXCLUDE =
  /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler|graphics card|\bcpu cooler\b/i;
const RAM_EXCLUDE =
  /laptop|notebook|so-dimm|sodimm|memory card|sd card|microsd|flash|pen drive|ssd|hard drive|card reader|pillow|mattress|cushion|foam|graphics|geforce|radeon|processor|\bcpu\b|5g|4g|smartphone|\bphone\b|mobile|tablet|ipad|galaxy tab|combo|motherboard|assembled|desktop pc|gaming pc|on-board memory/i;
const SSD_EXCLUDE =
  /enclosure|caddy|case|heatsink only|reader|laptop|notebook|portable|external|hard drive|\bhdd\b|phone|tablet|camera|action cam|dash ?cam|my passport|extreme pro|desktop pc|gaming pc|tower|\bcpu\b|processor|ryzen|geforce|\brtx\b|assembled|macbook|ideacentre/i;
const COOLER_EXCLUDE =
  /room cooler|air conditioner|personal cooler|desert cooler|tower fan|case fan|fan only|laptop|gpu|thermal paste|cooler stand|water bottle|cooler bag|ice box|lunch box|portable cooler|threadripper|tr5|sp6|\bxeon\b|workstation|server|sandy bridge|ep\/ex|socket \d|\blga\d{4}\b|supermicro/i;
const CASE_EXCLUDE =
  /cpu cooler|air cooler|liquid cooler|cooling fan|case fan|motherboard|power supply|\bpsu\b|psu|stand|table|wall|shoe|bathroom|kitchen|office|file|almirah|wardrobe|tv cabinet|wooden cabinet|steel cabinet|storage cabinet|cpu cooler/i;
const MONITOR_EXCLUDE =
  /stand|arm|mount|tablet|television|smart ?tv|light|lamp|bar|laptop|cctv|security|rear view|car|\bdvr\b|screen guard|privacy filter|desktop cpu|\bcpu\b|processor|\bi[3579]-?\d{3,4}\b|ddr[345]|assembled|\brtx\b|geforce/i;
const KEYBOARD_EXCLUDE =
  /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|clicker|fidget|keychain|key chain|air mouse|remote|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|all in one|aio|desktop pc|\bi[3579]\b|ryzen|snapdragon|\bgb\b|\btb\b|mouse only/i;
const MOUSE_EXCLUDE =
  /pad|bungee|feet|skates|grip|cover|case|holder|laptop|notebook|macbook|keyboard and mouse|keyboard & mouse|combo|sneaker|shoe|slipper|sandal|kids|boys|girls|lunch|tiffin|backpack|bag\b|watch\b|strap\b/i;
const CONTROLLER_EXCLUDE =
  /console|skin|cover|case|pouch|thumb|grip|charging|charger|dock|dock|stand|holder|cable|cord|adapter|gamestick|game stick|video game|projector|remote|speaker|emulator|plug & play|plug and play|hdmi|handheld|for kids|cooling|battery|rechargeable battery/i;
const CHAIR_EXCLUDE =
  /cover|cushion|bean bag|sofa|seater|armchair|dining|plastic|wheelchair|car seat|kids|child|baby|high chair|folding|wooden|teak|sheesham|metal study table|swing|hanging|recliner|massag/i;
const HEADSET_EXCLUDE =
  /case|stand|ear cushions?|cover|earbuds|earphone|tws|neckband|true wireless|replacement|vr|virtual reality|mixed reality|quest|mic only/i;

const TARGETS: Target[] = [
  /* ---------------------------------------------------------------- */
  /* The PC itself                                                     */
  /* ---------------------------------------------------------------- */
  {
    key: "gpu",
    query: "graphics card",
    include: /graphics card|gpu|geforce|radeon|rtx/i,
    exclude:
      /laptop|notebook|external|enclosure|egpu|water ?block|waterblock|bracket|holder|riser|capture|docking|adapter|cable|case|server|gt ?730|gt730|gt ?1030|gt1030|rx ?550|rx550|rx ?580|rx580|rx ?590|rx590|hd ?5450|hd ?6450|gddr3|ddr3|gtx ?7\d{2}|gtx ?9\d{2}|gtx ?10\d{2}|gt ?7\d{2}|gt ?9\d{2}/i,
    category: "Graphics Cards",
    max: 10,
    minPrice: 15000,
  },
  {
    key: "gpu-rtx",
    query: "nvidia rtx graphics card",
    include: /rtx|geforce/i,
    exclude:
      /laptop|notebook|external|enclosure|egpu|water ?block|waterblock|bracket|holder|riser|capture|docking|adapter|cable|case|server|gt ?730|gt ?1030|gtx ?10[35]0|gtx ?7\d{2}|gtx ?9\d{2}|gtx ?10\d{2}|gt ?7\d{2}|gt ?9\d{2}/i,
    category: "Graphics Cards",
    max: 8,
    minPrice: 15000,
  },
  {
    key: "gpu-radeon",
    query: "amd radeon graphics card",
    include: /radeon|rx ?[5-9]\d{3}/i,
    exclude:
      /laptop|notebook|external|enclosure|egpu|water ?block|waterblock|bracket|holder|riser|capture|docking|adapter|cable|case|server|rx ?550|rx550|rx ?580|rx580|rx ?590|rx590|gddr3|ddr3/i,
    category: "Graphics Cards",
    max: 5,
    minPrice: 15000,
  },
  {
    key: "cpu-intel",
    query: "intel processor",
    include: /core i[3579]|intel core|processor|cpu/i,
    exclude:
      /laptop|notebook|mobile|tablet|macbook|mini pc|nuc|cooler|motherboard|mainboard|thermal paste|x870|b650|b760|h610|supports/i,
    category: "Processors",
    max: 8,
    minPrice: 4000,
  },
  {
    key: "cpu-amd",
    query: "amd ryzen processor",
    include: /ryzen|processor|cpu/i,
    exclude:
      /laptop|notebook|mobile|tablet|macbook|mini pc|nuc|cooler|motherboard|mainboard|thermal paste|x870|b650|b760|h610|supports/i,
    category: "Processors",
    max: 8,
    minPrice: 4000,
  },
  {
    key: "cpu-budget",
    query: "intel core desktop processor",
    include: /i3|i5|pentium|processor/i,
    exclude:
      /laptop|notebook|mobile|tablet|macbook|mini pc|nuc|cooler|motherboard|mainboard|thermal paste|x870|b650|b760|h610|supports/i,
    category: "Processors",
    max: 4,
    minPrice: 3000,
    maxPrice: 16000,
  },
  {
    key: "motherboard",
    query: "motherboard",
    include: /motherboard|mainboard|b650|b760|h610|b550|a620|b850|x670|x870|z690|z790|b660/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 8,
    minPrice: 3500,
  },
  {
    key: "mb-b650",
    query: "b650 motherboard",
    include: /b650|b850|motherboard|mainboard/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 3,
    minPrice: 3500,
  },
  {
    key: "mb-b760",
    query: "b760 motherboard",
    include: /b760|z790|motherboard|mainboard/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 3,
    minPrice: 3500,
  },
  {
    key: "mb-h610",
    query: "h610 motherboard",
    include: /h610|b660|b760|motherboard|mainboard/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 3,
    minPrice: 3000,
  },
  {
    key: "mb-am4",
    query: "b550 motherboard",
    include: /b550|a520|motherboard|mainboard/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 3,
    minPrice: 3000,
  },
  {
    key: "mb-am5",
    query: "am5 motherboard",
    include: /x670|x870|b650|b850|motherboard|mainboard/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 3,
    minPrice: 5000,
  },
  {
    key: "mb-b760m",
    query: "b760m motherboard",
    include: /b760|b660|h610|motherboard|mainboard/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 3,
    minPrice: 4000,
  },
  {
    key: "mb-a620",
    query: "a620 motherboard",
    include: /a620|b650|motherboard|mainboard/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 3,
    minPrice: 4000,
  },
  {
    key: "mb-gaming",
    query: "gaming motherboard",
    include: /motherboard|mainboard/i,
    exclude:
      /laptop|notebook|barebone|mini pc|nuc|combo|bundle|stand|bracket|screw|cable|wifi card|thermal paste|cooler/i,
    category: "Motherboards",
    max: 4,
    minPrice: 4000,
  },
  {
    key: "ram-ddr4",
    query: "ddr4 ram",
    include: /\bddr4\b|\bram\b|\bmemory\b|\bdimm\b/i,
    exclude:
      /laptop|notebook|so-dimm|sodimm|memory card|sd card|microsd|flash|pen drive|ssd|hard drive|card reader|pillow|mattress|cushion|foam|graphics|geforce|radeon|processor|cpu|5g|smartphone|phone|mobile|tablet|ipad|tab s|galaxy tab|combo|motherboard|ssd|assembled|desktop pc|gaming pc/i,
    category: "Memory",
    max: 5,
    minPrice: 1500,
  },
  {
    key: "ram-ddr5",
    query: "ddr5 ram",
    include: /\bddr5\b|\bram\b|\bmemory\b|\bdimm\b/i,
    exclude:
      /laptop|notebook|so-dimm|sodimm|memory card|sd card|microsd|flash|pen drive|ssd|hard drive|card reader|pillow|mattress|cushion|foam|graphics|geforce|radeon|processor|cpu|5g|smartphone|phone|mobile|tablet|ipad|tab s|galaxy tab|combo|motherboard|assembled|desktop pc|gaming pc/i,
    category: "Memory",
    max: 5,
    minPrice: 2000,
  },
  {
    key: "ram-desktop",
    query: "desktop ram",
    include: /\bddr4\b|\bddr5\b|\bram\b|\bmemory\b|\bdimm\b/i,
    exclude:
      /laptop|notebook|so-dimm|sodimm|memory card|sd card|microsd|flash|pen drive|ssd|hard drive|card reader|pillow|mattress|cushion|foam|graphics|geforce|radeon|processor|cpu|5g|smartphone|phone|mobile|tablet|ipad|tab s|galaxy tab|combo|motherboard|assembled|desktop pc|gaming pc/i,
    category: "Memory",
    max: 5,
    minPrice: 1200,
  },
  {
    key: "ram-16",
    query: "16gb ram",
    include: /\bddr4\b|\bddr5\b|\bram\b|\bmemory\b|\bdimm\b/i,
    exclude:
      /laptop|notebook|so-dimm|sodimm|memory card|sd card|microsd|flash|pen drive|ssd|hard drive|card reader|pillow|mattress|cushion|foam|graphics|geforce|radeon|processor|cpu|5g|smartphone|phone|mobile|tablet|ipad|tab s|galaxy tab|combo|motherboard|assembled|desktop pc|gaming pc/i,
    category: "Memory",
    max: 4,
    minPrice: 2000,
    maxPrice: 14000,
  },
  {
    key: "ram-8",
    query: "8gb ram",
    include: /\bddr4\b|\bddr5\b|\bram\b|\bmemory\b|\bdimm\b/i,
    exclude:
      /laptop|notebook|so-dimm|sodimm|memory card|sd card|microsd|flash|pen drive|ssd|hard drive|card reader|pillow|mattress|cushion|foam|graphics|geforce|radeon|processor|cpu|5g|smartphone|phone|mobile|tablet|ipad|tab s|galaxy tab|combo|motherboard|assembled|desktop pc|gaming pc/i,
    category: "Memory",
    max: 3,
    minPrice: 900,
    maxPrice: 5000,
  },
  {
    key: "ssd-nvme",
    query: "nvme ssd",
    include: /\bssd\b|\bnvme\b|solid state/i,
    exclude:
      /enclosure|caddy|case|heatsink only|reader|laptop|notebook|portable|external|hard drive|hdd|assembled|server|processor|core i[3579]|gaming pc|desktop pc|workstation|motherboard/i,
    category: "Storage",
    max: 6,
    minPrice: 2500,
  },
  {
    key: "ssd-sata",
    query: "sata ssd",
    include: /\bssd\b|solid state/i,
    exclude:
      /enclosure|caddy|case|heatsink only|reader|laptop|notebook|portable|external|hard drive|hdd|assembled|server|processor|core i[3579]|gaming pc|desktop pc|workstation|motherboard/i,
    category: "Storage",
    max: 4,
    minPrice: 2000,
  },
  {
    key: "ssd-budget",
    query: "ssd 512gb",
    include: /\bssd\b|solid state/i,
    exclude:
      /enclosure|caddy|case|heatsink only|reader|laptop|notebook|portable|external|hard drive|hdd|assembled|server|processor|core i[3579]|gaming pc|desktop pc|workstation|motherboard/i,
    category: "Storage",
    max: 4,
    minPrice: 1800,
    maxPrice: 9500,
  },
  {
    key: "ssd-1tb",
    query: "ssd 1tb",
    include: /\bssd\b|solid state/i,
    exclude:
      /enclosure|caddy|case|heatsink only|reader|laptop|notebook|portable|external|hard drive|hdd|assembled|server|processor|core i[3579]|gaming pc|desktop pc|workstation|motherboard/i,
    category: "Storage",
    max: 4,
    minPrice: 4000,
    maxPrice: 20000,
  },
  {
    key: "psu",
    query: "power supply unit",
    include: /\bpower supply\b|\bsmps\b|\bpsu\b|80 plus/i,
    exclude:
      /cable|extension|socket|board|ups|inverter|battery|charger|adapter|bulb|lamp|fan|heater|iron|case only|cabinet/i,
    category: "Power Supplies",
    max: 6,
    minPrice: 1500,
  },
  {
    key: "psu-smps",
    query: "smps",
    include: /\bpower supply\b|\bsmps\b|\bpsu\b|80 plus/i,
    exclude:
      /cable|extension|socket|board|ups|inverter|battery|charger|adapter|bulb|lamp|fan|heater|iron|case only|cabinet/i,
    category: "Power Supplies",
    max: 6,
    minPrice: 1500,
  },
  {
    key: "psu-2",
    query: "power supply",
    include: /\bpower supply\b|\bsmps\b|\bpsu\b|80 plus/i,
    exclude:
      /cable|extension|socket|board|ups|inverter|battery|charger|adapter|bulb|lamp|fan|heater|iron|case only|cabinet/i,
    category: "Power Supplies",
    max: 6,
    minPrice: 1500,
  },
  {
    key: "psu-3",
    query: "psu",
    include: /\bpower supply\b|\bsmps\b|\bpsu\b|80 plus/i,
    exclude:
      /cable|extension|socket|board|ups|inverter|battery|charger|adapter|bulb|lamp|fan|heater|iron|case only|cabinet/i,
    category: "Power Supplies",
    max: 6,
    minPrice: 1500,
  },
  {
    key: "psu-4",
    query: "80 plus gold",
    include: /\bpower supply\b|\bsmps\b|\bpsu\b|80 plus/i,
    exclude:
      /cable|extension|socket|board|ups|inverter|battery|charger|adapter|bulb|lamp|fan|heater|iron|case only|cabinet/i,
    category: "Power Supplies",
    max: 4,
    minPrice: 1500,
  },
  {
    key: "case",
    query: "gaming cabinet",
    include: /cabinet|pc case|computer case|mid tower|mid-tower|tower case|gaming case/i,
    exclude:
      /cpu cooler|air cooler|liquid cooler|cooling fan|case fan|motherboard|power supply|psu|stand|table|wall|storage|shoe|bathroom|kitchen|office|file|almirah|wardrobe|tv cabinet|wooden cabinet|steel cabinet/i,
    category: "PC Cases",
    max: 6,
    minPrice: 1800,
  },
  {
    key: "case-2",
    query: "computer case",
    include: /cabinet|pc case|computer case|mid tower|mid-tower|tower case|gaming case/i,
    exclude:
      /cpu cooler|air cooler|liquid cooler|cooling fan|case fan|motherboard|power supply|psu|stand|table|wall|storage|shoe|bathroom|kitchen|office|file|almirah|wardrobe|tv cabinet|wooden cabinet|steel cabinet/i,
    category: "PC Cases",
    max: 6,
    minPrice: 1800,
  },
  {
    key: "cooler",
    query: "cpu cooler",
    include:
      /cpu cooler|cpu air cooler|cpu liquid cooler|aio cooler|aio liquid|liquid cpu cooler|air cpu cooler|tower cooler/i,
    exclude: /room|air conditioner|personal cooler|desert cooler|case fan|fan only|laptop|gpu|thermal paste|stand/i,
    category: "CPU Coolers",
    max: 6,
    minPrice: 1200,
  },

  /* ---------------------------------------------------------------- */
  /* Screen, desk, seating, audio and the finishing layer              */
  /* ---------------------------------------------------------------- */
  {
    key: "monitor",
    query: "gaming monitor",
    include: /\bmonitors?\b/i,
    exclude: /stand|arm|mount|tablet|television|smartphone|light|lamp|bar|laptop|cctv|security|rear view|car/i,
    category: "Monitors",
    max: 8,
    minPrice: 6000,
  },
  {
    key: "monitor-budget",
    query: "monitor 24 inch",
    include: /\bmonitors?\b/i,
    exclude: /stand|arm|mount|tablet|television|smartphone|light|lamp|bar|laptop|cctv|security|rear view|car/i,
    category: "Monitors",
    max: 4,
    minPrice: 4000,
    maxPrice: 13000,
  },
  {
    key: "keyboard",
    query: "mechanical keyboard",
    include: /\bkeyboards?\b/i,
    exclude:
      /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|desktop|all in one|aio|i3|i5|i7|ryzen|snapdragon|gb\/|tb\//i,
    category: "Keyboards",
    max: 6,
    minPrice: 1000,
  },
  {
    key: "keyboard-2",
    query: "gaming keyboard",
    include: /\bkeyboards?\b/i,
    exclude:
      /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|desktop|all in one|aio|i3|i5|i7|ryzen|snapdragon|gb\/|tb\//i,
    category: "Keyboards",
    max: 6,
    minPrice: 800,
  },
  {
    key: "keyboard-3",
    query: "wireless keyboard",
    include: /\bkeyboards?\b/i,
    exclude:
      /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|desktop|all in one|aio|i3|i5|i7|ryzen|snapdragon|gb\/|tb\//i,
    category: "Keyboards",
    max: 4,
    minPrice: 700,
  },
  {
    key: "keyboard-logitech",
    query: "logitech keyboard",
    include: /\bkeyboards?\b/i,
    exclude:
      /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|desktop|all in one|aio|i3|i5|i7|ryzen|snapdragon|gb\/|tb\//i,
    category: "Keyboards",
    max: 4,
    minPrice: 700,
  },
  {
    key: "keyboard-cosmic",
    query: "cosmic byte keyboard",
    include: /\bkeyboards?\b/i,
    exclude:
      /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|desktop|all in one|aio|i3|i5|i7|ryzen|snapdragon|gb\/|tb\//i,
    category: "Keyboards",
    max: 4,
    minPrice: 700,
  },
  {
    key: "keyboard-redragon",
    query: "redragon keyboard",
    include: /\bkeyboards?\b/i,
    exclude:
      /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|desktop|all in one|aio|i3|i5|i7|ryzen|snapdragon|gb\/|tb\//i,
    category: "Keyboards",
    max: 4,
    minPrice: 700,
  },
  {
    key: "keyboard-zebronics",
    query: "zebronics keyboard",
    include: /\bkeyboards?\b/i,
    exclude:
      /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|desktop|all in one|aio|i3|i5|i7|ryzen|snapdragon|gb\/|tb\//i,
    category: "Keyboards",
    max: 4,
    minPrice: 500,
  },
  {
    key: "mouse",
    query: "gaming mouse",
    include: /\bmouse\b/i,
    exclude:
      /pad|bungee|feet|skates|grip|cover|case|holder|laptop|notebook|macbook|desktop|monitor|console|bundle|combo|assembled|gaming pc|keyboard/i,
    category: "Mice",
    max: 6,
    minPrice: 400,
  },
  {
    key: "headset",
    query: "gaming headset",
    include: /\bheadsets?\b|\bheadphones?\b/i,
    exclude:
      /case|stand|ear cushions|ear cushion|cover|earbuds|replacement|\bwired?\b|vr|virtual reality|mixed reality|quest|meta/i,
    category: "Headphones",
    max: 6,
    minPrice: 1000,
  },
  {
    key: "capture",
    query: "capture card",
    include: /capture card|video capture|game capture/i,
    exclude: /cctv|security|dvr|nvr|adapter only/i,
    category: "Capture Cards",
    max: 4,
    minPrice: 700,
  },
  {
    key: "webcam",
    query: "webcam",
    include: /webcam|web camera|streaming camera/i,
    exclude:
      /cover|cctv|security|tripod|stand only|laptop|notebook|desktop|monitor|tablet|phone/i,
    category: "Webcams",
    max: 4,
    minPrice: 1000,
  },
  {
    key: "webcam-2",
    query: "web camera",
    include: /webcam|web camera|streaming camera/i,
    exclude:
      /cover|cctv|security|tripod|stand only|laptop|notebook|desktop|monitor|tablet|phone/i,
    category: "Webcams",
    max: 4,
    minPrice: 800,
    maxPrice: 15000,
  },
  {
    key: "webcam-3",
    query: "1080p webcam",
    include: /webcam|web camera|streaming camera/i,
    exclude:
      /cover|cctv|security|tripod|stand only|laptop|notebook|desktop|monitor|tablet|phone/i,
    category: "Webcams",
    max: 4,
    minPrice: 800,
    maxPrice: 12000,
  },
  {
    key: "ups",
    query: "ups for pc",
    include: /\bups\b|uninterruptible/i,
    exclude:
      /battery only|replacement battery|inverter battery|trolley|inverter|bag|cart|cups|crockery|mug|teacup/i,
    category: "UPS",
    max: 6,
    minPrice: 1500,
  },
  {
    key: "speakers",
    query: "computer speakers",
    include: /speakers?\b|soundbar/i,
    exclude:
      /stand|mount|cable|case|cover|phone|smartphone|tablet|\bpad\b|laptop|notebook|desktop|monitor|television|\btv\b|car|bike|replacement|driver only|speaker wire|portable\b/i,
    category: "Speakers",
    max: 6,
    minPrice: 700,
  },
  {
    key: "speakers-2",
    query: "bluetooth speaker",
    include: /speakers?\b|soundbar/i,
    exclude:
      /stand|mount|cable|case|cover|phone|smartphone|tablet|\bpad\b|laptop|notebook|desktop|monitor|television|\btv\b|car|bike|replacement|driver only|speaker wire/i,
    category: "Speakers",
    max: 4,
    minPrice: 700,
  },
  {
    key: "speakers-3",
    query: "soundbar",
    include: /soundbar|speakers?\b/i,
    exclude:
      /stand|mount|cable|case|cover|phone|smartphone|tablet|\bpad\b|laptop|notebook|desktop|monitor|television|\btv\b|car|bike|replacement|driver only/i,
    category: "Speakers",
    max: 3,
    minPrice: 1500,
  },
  {
    key: "speakers-4",
    query: "2.1 speaker",
    include: /speakers?\b|soundbar/i,
    exclude:
      /stand|mount|cable|case|cover|phone|smartphone|tablet|\bpad\b|laptop|notebook|desktop|monitor|television|\btv\b|car|bike|replacement|driver only/i,
    category: "Speakers",
    max: 4,
    minPrice: 700,
  },
  {
    key: "controller",
    query: "wireless controller",
    include: /\bcontrollers?\b|\bgamepad\b/i,
    exclude:
      /console|skin|cover|case|thumb|grip|charging|dock|stand|holder|cable|adapter|gamestick|game stick|video game|projector|remote|console kit|emulator|plug & play|plug and play|hdmi/i,
    category: "Gaming Controllers",
    max: 5,
    minPrice: 1500,
  },
  {
    key: "chair",
    query: "gaming chair",
    include: /gaming chair|office chair|ergonomic chair|computer chair/i,
    exclude: /chair cover|cushion|bean bag|sofa|seater|armchair|dining|plastic|wheelchair|car seat/i,
    category: "Chairs",
    max: 5,
    minPrice: 3500,
  },
  {
    key: "office-chair",
    query: "office chair",
    include: /office chair|ergonomic chair|study chair|computer chair/i,
    exclude: /chair cover|cushion|bean bag|sofa|seater|armchair|dining|plastic|wheelchair|gaming/i,
    category: "Chairs",
    max: 4,
    minPrice: 2200,
  },
  {
    key: "desk",
    query: "gaming desk",
    include: /\bdesks?\b|\btables?\b/i,
    exclude:
      /mat|pad|organizer|chair|lamp|light|decor|monitor|stand|\bbed\b|sofa|dressing|vanity|bookshelf|storage rack|pen stand|coffee|centre table|center table|side table|bedside|desktop|keyboard|mouse|laptop|printer/i,
    category: "Desks",
    max: 4,
    minPrice: 2500,
  },
  {
    key: "study-table",
    query: "study table",
    include: /study table|computer table|writing desk|folding table/i,
    exclude:
      /mat|pad|organizer|chair|lamp|light|decor|monitor|stand|\bbed\b|sofa|dressing|vanity|bookshelf|storage rack|pen stand|coffee|centre table|center table|side table|bedside|desktop|keyboard|mouse|laptop|printer/i,
    category: "Desks",
    max: 4,
    minPrice: 1500,
  },
  {
    key: "deskmat",
    query: "desk mat",
    include: /desk mat|desk pad|mouse pad|mousepad/i,
    exclude: /keyboard|wrist rest only|cover|kitchen|bath|floor|rug|table mat/i,
    category: "Desk Accessories",
    max: 4,
    minPrice: 100,
  },
  {
    key: "rgb",
    query: "rgb led strip",
    include: /led strip|rgb light|light strip/i,
    exclude: /bulb|holder|ceiling|street|curtain/i,
    category: "Lighting",
    max: 4,
    minPrice: 250,
  },
  {
    key: "monitor-light",
    query: "monitor light bar",
    include: /monitor light|screen bar|light bar/i,
    exclude: /\bcar\b|ceiling|street/i,
    category: "Lighting",
    max: 3,
    minPrice: 600,
  },

  /* ---------------------------------------------------------------- */
  /* Work, study and the rooms around them                             */
  /* ---------------------------------------------------------------- */
  {
    key: "laptop",
    query: "laptop",
    include: /laptop/i,
    exclude:
      /stand|bag|cover|sleeve|skin|charger|adapter|battery|table|desk|fan|cooling|keyboard|mouse|screen guard|dock|hub/i,
    category: "Laptops",
    max: 6,
    minPrice: 20000,
  },
  {
    key: "laptop-budget",
    query: "laptop i5",
    include: /laptop/i,
    exclude:
      /stand|bag|cover|sleeve|skin|charger|adapter|battery|table|desk|fan|cooling|keyboard|mouse|screen guard|dock|hub/i,
    category: "Laptops",
    max: 4,
    minPrice: 25000,
    maxPrice: 75000,
  },
  {
    key: "tablet",
    query: "tablet",
    include: /tablet/i,
    exclude:
      /stand|cover|case|charger|screen guard|holder|mount|arm|phone|drawing|nintendo|switch|console/i,
    category: "Tablets",
    max: 3,
    minPrice: 8000,
  },
  {
    key: "bedsheet",
    query: "bedsheet king size",
    include: /bedsheet|bed sheet|bedding set/i,
    exclude: /baby|crib|mattress|protector|comforter only|pillow cover only/i,
    category: "Bedding",
    max: 4,
    minPrice: 400,
  },
  {
    key: "comforter",
    query: "comforter",
    include: /comforter|quilt|duvet|blanket/i,
    exclude: /baby|kids|crib|cover only/i,
    category: "Bedding",
    max: 3,
    minPrice: 700,
  },
  {
    key: "wardrobe",
    query: "wardrobe",
    include: /wardrobe|almirah|cupboard/i,
    exclude: /kids|toy|shoe|kitchen|office|cover|organizer|hanging|bag/i,
    category: "Wardrobes",
    max: 4,
    minPrice: 3500,
  },
  {
    key: "wardrobe-steel",
    query: "steel almirah",
    include: /almirah|wardrobe|cupboard/i,
    exclude: /kids|toy|shoe|kitchen|office|cover|organizer|hanging|bag/i,
    category: "Wardrobes",
    max: 3,
    minPrice: 3500,
  },
  {
    key: "dresser",
    query: "dressing table",
    include: /dressing table|vanity table|dresser/i,
    exclude: /mirror only|organizer|stool|chair|makeup/i,
    category: "Dressers",
    max: 3,
    minPrice: 2500,
  },
  {
    key: "tv",
    query: "smart tv 43 inch",
    include: /television|smart tv|led tv|qled|oled/i,
    exclude: /stand|mount|cover|remote|bracket|tv unit|projector screen/i,
    category: "Televisions",
    max: 5,
    minPrice: 12000,
  },
  {
    key: "curtains",
    query: "curtains",
    include: /curtain|drape/i,
    exclude: /rod|hook|clip|party|backdrop|shower|baby/i,
    category: "Curtains",
    max: 4,
    minPrice: 400,
  },
  {
    key: "cookware",
    query: "cookware set",
    include: /cookware|kadai|kadhai|pan set|pot set|pressure cooker|casserole/i,
    exclude: /cleaner|scrub|stand|rack|organizer|cover|spatula only|knife/i,
    category: "Cookware",
    max: 5,
    minPrice: 700,
  },
  {
    key: "mixer",
    query: "mixer grinder",
    include: /mixer grinder|mixer|grinder/i,
    exclude:
      /coffee grinder|blender only|attachment|jar only|spice grinder only|hand blender|angle grinder|bench grinder|amplifier|audio/i,
    category: "Kitchen Appliances",
    max: 4,
    minPrice: 1500,
  },
  {
    key: "makeup-kit",
    query: "makeup kit",
    include: /makeup kit|makeup set|cosmetic kit|makeup palette/i,
    exclude: /brush set only|organizer|bag|storage|mirror|nail/i,
    category: "Makeup",
    max: 4,
    minPrice: 400,
  },
  {
    key: "diaper-bag",
    query: "diaper bag",
    include: /diaper bag|nappy bag|maternity bag/i,
    exclude: /insert only|organizer insert/i,
    category: "Baby Care",
    max: 3,
    minPrice: 700,
  },
  {
    key: "diaper-bag-2",
    query: "maternity bag",
    include: /maternity bag|diaper bag|nappy bag|baby bag/i,
    exclude: /insert only|organizer insert/i,
    category: "Baby Care",
    max: 3,
    minPrice: 700,
  },
  {
    key: "baby-cot",
    query: "baby cot",
    include: /baby cot|baby crib|crib|cradle/i,
    exclude: /mattress|sheet|mosquito|net|rail|toy|bumper|pillow/i,
    category: "Baby Care",
    max: 3,
    minPrice: 2500,
  },
  {
    key: "baby-cot-2",
    query: "baby crib",
    include: /baby cot|baby crib|crib|cradle/i,
    exclude: /mattress|sheet|mosquito|net|rail|toy|bumper|pillow/i,
    category: "Baby Care",
    max: 3,
    minPrice: 2500,
  },
  {
    key: "wall-clock",
    query: "wall clock",
    include: /wall clock/i,
    exclude: /sticker|projector|light/i,
    category: "Home Decor",
    max: 3,
    minPrice: 300,
  },
  {
    key: "live-plant",
    query: "indoor live plant",
    include: /live plant|indoor plant|money plant|snake plant|areca palm|peace lily/i,
    exclude: /artificial|pot only|planter only|seeds|wall sticker/i,
    category: "Plants",
    max: 3,
    minPrice: 250,
  },
  {
    key: "potli",
    query: "potli bag",
    include: /potli|ethnic bag|clutch/i,
    exclude: /kids|school|trolley|laptop|dress|kurta|saree|lehenga|suit/i,
    category: "Bags",
    max: 3,
    minPrice: 300,
  },
  {
    key: "plant-stand",
    query: "plant stand",
    include: /plant stand|plant holder|plant caddy/i,
    exclude: /wall|hanging only|pot only|tray only/i,
    category: "Garden",
    max: 3,
    minPrice: 400,
  },
  {
    key: "soil",
    query: "potting soil",
    include: /potting soil|soil mix|compost|fertilizer|manure|vermicompost/i,
    exclude: /face|bath|hair|paint/i,
    category: "Gardening",
    max: 3,
    minPrice: 150,
  },
  {
    key: "soil-2",
    query: "organic compost",
    include: /potting soil|soil mix|compost|fertilizer|manure|vermicompost/i,
    exclude: /face|bath|hair|paint/i,
    category: "Gardening",
    max: 3,
    minPrice: 150,
  },
  {
    key: "garden-chair",
    query: "garden chair",
    include: /garden chair|outdoor chair|balcony chair|patio chair|folding chair/i,
    exclude: /office|gaming|dining|cover|mat|car|swing|hanging|bar|stool/i,
    category: "Outdoor Furniture",
    max: 3,
    minPrice: 700,
  },
  {
    key: "garden-chair-2",
    query: "outdoor chair",
    include: /garden chair|outdoor chair|balcony chair|patio chair|folding chair/i,
    exclude: /office|gaming|dining|cover|mat|car|swing|hanging|bar|stool/i,
    category: "Outdoor Furniture",
    max: 3,
    minPrice: 700,
  },
  {
    key: "leash",
    query: "dog leash",
    include: /\b(?:leash|harness|collar)\b/i,
    exclude:
      /kids|human|car seat|bike|belt for men|waist|jacket|coat|rain|clothes|shirt|sweater/i,
    category: "Pet Supplies",
    max: 4,
    minPrice: 250,
  },
  {
    key: "pet-carrier",
    query: "pet carrier",
    include: /pet carrier|dog carrier|cat carrier|pet crate/i,
    exclude: /car seat|stroller|bike|bag for kids/i,
    category: "Pet Supplies",
    max: 3,
    minPrice: 700,
  },
  {
    key: "pet-carrier-2",
    query: "cat carrier",
    include: /pet carrier|dog carrier|cat carrier|pet crate/i,
    exclude: /car seat|stroller|bike|bag for kids/i,
    category: "Pet Supplies",
    max: 3,
    minPrice: 700,
  },
  {
    key: "studio-headphones",
    query: "studio headphones",
    include: /headphone|headset/i,
    exclude: /case|stand|earbuds|gaming|replacement|mic only/i,
    category: "Headphones",
    max: 4,
    minPrice: 1200,
  },
  {
    key: "power-bank",
    query: "power bank",
    include: /power bank|powerbank/i,
    exclude: /case|cover|cable only|charger only/i,
    category: "Power Banks",
    max: 4,
    minPrice: 700,
  },
  {
    key: "car-seat-cover",
    query: "car seat cover",
    include: /car seat cover|seat cover/i,
    exclude:
      /bike|scooter|office chair|wooden|bead|massage|baby|infant|child|carry cot|booster|firstcry/i,
    category: "Car Accessories",
    max: 4,
    minPrice: 800,
  },
  {
    key: "car-floor-mat",
    query: "car floor mats",
    include: /floor mat|floor mats|car mat/i,
    exclude: /bath|kitchen|door|yoga|bike|scooter/i,
    category: "Car Accessories",
    max: 4,
    minPrice: 500,
  },
  {
    key: "bookshelf",
    query: "bookshelf",
    include: /bookshelf|book shelf|bookcase/i,
    exclude: /wall sticker|mini|table top only/i,
    category: "Shelving",
    max: 3,
    minPrice: 900,
  },
  {
    key: "storage-box",
    query: "storage box",
    include:
      /storage box|storage basket|storage bin|storage organizer|wardrobe organizer|under bed storage|storage bag/i,
    exclude:
      /kitchen|spice|shoe|nutrition|supplement|food|paint|toy|jewellery|jewelry|makeup|cosmetic|watch|earring|necklace|silica|desiccant|tool kit|tool set|hardware|screw|nail|hearing|battery|tv unit|wall.?mount|television/i,
    category: "Storage",
    max: 4,
    minPrice: 250,
  },
  {
    key: "wall-art",
    query: "wall art",
    include: /wall art|wall decor|painting|canvas/i,
    exclude: /sticker|wallpaper|clock|kitchen|bathroom/i,
    category: "Home Decor",
    max: 3,
    minPrice: 350,
  },
  {
    key: "sofa",
    query: "sofa set",
    include: /sofa|3 seater|2 seater|couch/i,
    exclude: /cover|cushion|bean bag|office|recliner only|bed/i,
    category: "Sofas",
    max: 4,
    minPrice: 7000,
  },
  {
    key: "coffee-table",
    query: "coffee table",
    include: /coffee table|center table|centre table/i,
    exclude: /cover|mat|bedside|study/i,
    category: "Tables",
    max: 3,
    minPrice: 1200,
  },
  {
    key: "tv-unit",
    query: "tv unit",
    include: /tv unit|tv stand|tv cabinet|media console/i,
    exclude: /mount|bracket|cover|wall/i,
    category: "TV Units",
    max: 3,
    minPrice: 1800,
  },
  {
    key: "rug",
    query: "carpet",
    include: /\brugs?\b|\bcarpets?\b|\bdhurrie\b/i,
    exclude: /door mat|bath mat|bath rug|bathroom|kitchen|car|yoga|mat only/i,
    category: "Rugs",
    max: 3,
    minPrice: 600,
  },
  {
    key: "rug-2",
    query: "area rug",
    include: /\brugs?\b|\bcarpets?\b|\bdhurrie\b/i,
    exclude: /door mat|bath mat|bath rug|bathroom|kitchen|car|yoga|mat only/i,
    category: "Rugs",
    max: 3,
    minPrice: 600,
  },
  {
    key: "projector",
    query: "projector",
    include: /projector/i,
    exclude: /screen|stand|mount|paint|torch|phone/i,
    category: "Projectors",
    max: 3,
    minPrice: 4000,
  },
  {
    key: "av-receiver",
    query: "av receiver",
    include: /av receiver|home theater amplifier|home theatre amplifier/i,
    exclude: /car|headphone|speaker only|guitar|pa system/i,
    category: "Audio",
    max: 2,
    minPrice: 4000,
  },

  /* ---------------------------------------------------------------- */
  /* The remaining slots added in this pass                            */
  /* ---------------------------------------------------------------- */
  {
    key: "wallet",
    query: "leather wallet",
    include: /\bwallet\b/i,
    exclude: /phone|mobile|card holder only|passport|travel organiser cover/i,
    category: "Wallets",
    max: 3,
    minPrice: 300,
  },
  {
    key: "fragrance",
    query: "perfume",
    include: /perfume|eau de parfum|edp|fragrance|body spray/i,
    exclude: /car|room freshener|air freshener|diffuser|soap|deodorant/i,
    category: "Fragrance",
    max: 3,
    minPrice: 400,
  },
  {
    key: "gym-roller",
    query: "foam roller",
    include: /foam roller|massage roller|muscle roller/i,
    exclude: /paint|wall|kitchen|baking/i,
    category: "Fitness",
    max: 3,
    minPrice: 300,
  },
  {
    key: "gym-gloves",
    query: "gym gloves",
    include: /gym glove|workout glove|weightlifting glove|fitness glove/i,
    exclude: /driving|bike|motorcycle|kitchen|heat resistant/i,
    category: "Fitness",
    max: 3,
    minPrice: 250,
  },
  {
    key: "gym-bag",
    query: "gym bag",
    include: /gym bag|duffel bag|duffle bag|sports bag/i,
    exclude: /kids|school|trolley|laptop|shoe bag/i,
    category: "Fitness",
    max: 3,
    minPrice: 400,
  },
  {
    key: "tea",
    query: "green tea",
    include:
      /\btea leaves\b|\bgreen tea\b|\bblack tea\b|\bassam tea\b|\bdarjeeling tea\b|\btea powder\b/i,
    exclude:
      /cup|mug|kettle|maker|tree|oil|soap|bag|infuser only|earring|jewellery|jewelry|stud|pendant|necklace|ring|bracelet|dress|kurta|saree|shirt|t-shirt|top|face|skin|cream|green stone|teardrop/i,
    category: "Tea",
    max: 4,
    minPrice: 200,
  },
  {
    key: "tea-2",
    query: "tea powder",
    include:
      /\btea leaves\b|\bgreen tea\b|\bblack tea\b|\bassam tea\b|\bdarjeeling tea\b|\btea powder\b/i,
    exclude:
      /cup|mug|kettle|maker|tree|oil|soap|bag|infuser only|earring|jewellery|jewelry|stud|pendant|necklace|ring|bracelet|dress|kurta|saree|shirt|t-shirt|top|face|skin|cream|green stone|teardrop/i,
    category: "Tea",
    max: 4,
    minPrice: 200,
  },
  {
    key: "baby-bedding",
    query: "baby bedding",
    include: /baby bedding|crib sheet|cot sheet|baby blanket|baby mattress/i,
    exclude: /adult|king|queen|double bed/i,
    category: "Baby Care",
    max: 3,
    minPrice: 300,
  },
  {
    key: "desk-2",
    query: "computer desk",
    include: /\bdesks?\b|\btables?\b/i,
    exclude:
      /mat|pad|organizer|chair|lamp|light|decor|monitor|stand|\bbed\b|sofa|dressing|vanity|bookshelf|storage rack|pen stand|coffee|centre table|center table|side table|bedside|desktop|keyboard|mouse|laptop|printer|pendrive|pen drive|cable/i,
    category: "Desks",
    max: 4,
    minPrice: 1200,
  },
  {
    key: "desk-3",
    query: "office desk",
    include: /\bdesks?\b|\btables?\b/i,
    exclude:
      /mat|pad|organizer|chair|lamp|light|decor|monitor|stand|\bbed\b|sofa|dressing|vanity|bookshelf|storage rack|pen stand|coffee|centre table|center table|side table|bedside|desktop|keyboard|mouse|laptop|printer|pendrive|pen drive|cable/i,
    category: "Desks",
    max: 3,
    minPrice: 1500,
  },
  {
    key: "desk-4",
    query: "study desk",
    include: /\bdesks?\b|\btables?\b/i,
    exclude:
      /mat|pad|organizer|chair|lamp|light|decor|monitor|stand|\bbed\b|sofa|dressing|vanity|bookshelf|storage rack|pen stand|coffee|centre table|center table|side table|bedside|desktop|keyboard|mouse|laptop|printer|pendrive|pen drive|cable/i,
    category: "Desks",
    max: 3,
    minPrice: 1200,
  },
  {
    key: "deskmat-2",
    query: "mouse pad",
    include: /mouse ?pad|desk mat|desk pad/i,
    exclude:
      /keyboard|wrist rest only|cover|kitchen|bath|floor|rug|table mat|laptop|wrist support only/i,
    category: "Desk Accessories",
    max: 4,
    minPrice: 100,
  },
  {
    key: "deskmat-3",
    query: "gaming mouse pad",
    include: /mouse ?pad|desk mat|desk pad/i,
    exclude:
      /keyboard|wrist rest only|cover|kitchen|bath|floor|rug|table mat|laptop|wrist support only/i,
    category: "Desk Accessories",
    max: 4,
    minPrice: 150,
  },
  {
    key: "monitor-light-2",
    query: "monitor lamp",
    include: /monitor light|screen bar|light bar|monitor lamp/i,
    exclude: /car|ceiling|street|table lamp|desk lamp/i,
    category: "Lighting",
    max: 3,
    minPrice: 500,
  },
  {
    key: "wardrobe-2",
    query: "wooden wardrobe",
    include: /wardrobe|almirah|cupboard/i,
    exclude: /kids|toy|shoe|kitchen|office|cover|organizer|hanging|bag/i,
    category: "Wardrobes",
    max: 4,
    minPrice: 3500,
  },
  {
    key: "diaper-bag-3",
    query: "baby bag",
    include: /diaper bag|nappy bag|maternity bag|baby bag/i,
    exclude: /insert only|organizer insert|school bag|trolley/i,
    category: "Baby Care",
    max: 3,
    minPrice: 700,
  },
  {
    key: "baby-cot-3",
    query: "crib",
    include: /baby cot|baby crib|crib|cradle/i,
    exclude: /mattress|sheet|mosquito|net|rail|toy|bumper|pillow/i,
    category: "Baby Care",
    max: 3,
    minPrice: 2000,
  },
  {
    key: "soil-3",
    query: "vermicompost",
    include: /soil|compost|fertilizer|manure/i,
    exclude: /face|bath|hair|paint/i,
    category: "Gardening",
    max: 3,
    minPrice: 150,
  },
  {
    key: "leash-2",
    query: "dog collar",
    include: /\b(?:leash|harness|collar)\b/i,
    exclude:
      /kids|human|car seat|bike|belt for men|waist|jacket|coat|rain|clothes|shirt|sweater|shirt collar/i,
    category: "Pet Supplies",
    max: 4,
    minPrice: 200,
  },
  {
    key: "pet-carrier-3",
    query: "dog crate",
    include: /pet carrier|dog carrier|cat carrier|pet crate|kennel|cat cage/i,
    exclude: /car seat|stroller|bike|bag for kids/i,
    category: "Pet Supplies",
    max: 3,
    minPrice: 700,
  },
  {
    key: "car-seat-cover-2",
    query: "seat cover",
    include: /car seat cover|seat cover/i,
    exclude:
      /bike|scooter|office chair|wooden|bead|massage|baby|infant|child|carry cot|booster|firstcry|steering|gear/i,
    category: "Car Accessories",
    max: 4,
    minPrice: 800,
  },
  {
    key: "rug-3",
    query: "rug",
    include: /\brugs?\b|\bcarpets?\b|\bdhurrie\b/i,
    exclude: /door mat|bath mat|bath rug|bathroom|kitchen|car|yoga|mat only/i,
    category: "Rugs",
    max: 4,
    minPrice: 500,
  },
  {
    key: "rug-4",
    query: "dhurrie",
    include: /\brugs?\b|\bcarpets?\b|\bdhurrie\b/i,
    exclude: /door mat|bath mat|bath rug|bathroom|kitchen|car|yoga|mat only/i,
    category: "Rugs",
    max: 3,
    minPrice: 500,
  },
  {
    key: "rug-living",
    query: "living room rug",
    include: /\brugs?\b|\bcarpets?\b|\bdhurrie\b/i,
    exclude:
      /doormat|door mat|kitchen|bath|entrance|shrug|hiking|shoe|outdoor comfort/i,
    category: "Rugs",
    max: 4,
    minPrice: 900,
  },
  {
    key: "psu-antec",
    query: "antec power supply",
    include: /\bpower supply\b|\bsmps\b|\bpsu\b|80 plus/i,
    exclude:
      /cable|extension|socket|board|ups|inverter|battery|charger|adapter|bulb|lamp|fan|heater|iron|case only|cabinet/i,
    category: "Power Supplies",
    max: 4,
    minPrice: 1500,
  },
  {
    key: "keyboard-4",
    query: "keyboard",
    include: /\bkeyboards?\b/i,
    exclude:
      /keycap|keyboard cover|keyboard case|keyboard tray|keyboard cleaner|desk|monitor|stand|riser|notebook|laptop|macbook|ideapad|vivobook|chromebook|desktop|all in one|aio|i3|i5|i7|ryzen|snapdragon|gb\/|tb\/|tablet|touchpad/i,
    category: "Keyboards",
    max: 10,
    minPrice: 500,
  },
  {
    key: "desk-5",
    query: "computer table",
    include: /\bdesks?\b|\btables?\b/i,
    exclude:
      /mat|pad|organizer|chair|lamp|light|decor|monitor|stand|\bbed\b|sofa|dressing|vanity|bookshelf|storage rack|pen stand|coffee|centre table|center table|side table|bedside|desktop|keyboard|mouse|laptop|printer|pen drive|cable/i,
    category: "Desks",
    max: 4,
    minPrice: 1200,
  },
  {
    key: "wardrobe-3",
    query: "2 door wardrobe",
    include: /wardrobe|almirah|cupboard/i,
    exclude:
      /kids|toy|shoe|kitchen|office|cover|organizer|hanging|bag|night light/i,
    category: "Wardrobes",
    max: 4,
    minPrice: 300,
  },
  {
    key: "diaper-bag-4",
    query: "baby diaper bag",
    include: /diaper bag|nappy bag|maternity bag|baby bag/i,
    exclude: /insert only|organizer insert|school bag|trolley/i,
    category: "Baby Care",
    max: 3,
    minPrice: 300,
  },
  {
    key: "leash-3",
    query: "pet leash",
    include: /\b(?:leash|harness|collar)\b/i,
    exclude:
      /kids|human|car seat|bike|belt for men|waist|jacket|coat|rain|clothes|shirt|sweater|bells|charm|studs|craft/i,
    category: "Pet Supplies",
    max: 4,
    minPrice: 150,
  },
  {
    key: "creator-light",
    query: "video light",
    include: /video light|studio light|softbox|led panel/i,
    exclude:
      /phone|mobile|fairy|string|candle|decorative|surface|spot|car|selfie|cover only/i,
    category: "Lighting",
    max: 3,
    minPrice: 500,
  },
  {
    key: "ring-light",
    query: "ring light",
    include: /\bring lights?\b|selfie light/i,
    exclude:
      /phone|mobile|cover|tripod only|stand only|string light|curtain|fairy|diwali|chandelier/i,
    category: "Lighting",
    max: 3,
    minPrice: 400,
  },
  {
    key: "card-64",
    query: "memory card 64gb",
    include: /\bsd card\b|\bmemory card\b|\bmicrosd\b|\bmicro sd\b/i,
    exclude:
      /reader|adapter|case|phone|camera|security|cctv|robot|recorder|gpu|graphics|console/i,
    category: "Storage",
    max: 3,
    minPrice: 300,
    maxPrice: 3500,
  },
  {
    key: "car-vacuum",
    query: "car vacuum",
    include: /car vacuum|handheld vacuum|wet & dry|spot cleaner|upholstery cleaner/i,
    exclude: /robot|mattress|stick|home vacuum|filter|bag only/i,
    category: "Car Care",
    max: 3,
    minPrice: 800,
    maxPrice: 6000,
  },
  {
    key: "inflator",
    query: "tyre inflator",
    include: /inflator|air compressor/i,
    exclude: /blower/i,
    category: "Car Care",
    max: 3,
    minPrice: 700,
    maxPrice: 6000,
  },

  /* ---------------------------------------------------------------- */
  /* Depth pass two — the price bands the first pass left thin         */
  /* ---------------------------------------------------------------- */
  {
    key: "mb-b650m",
    query: "b650m motherboard",
    include: /b650|b650m|motherboard|mainboard/i,
    exclude: BOARD_EXCLUDE,
    category: "Motherboards",
    max: 2,
    minPrice: 8000,
  },
  {
    key: "mb-b850",
    query: "b850 motherboard",
    include: /b850|b850m|motherboard|mainboard/i,
    exclude: BOARD_EXCLUDE,
    category: "Motherboards",
    max: 3,
    minPrice: 10000,
  },
  {
    key: "mb-msi",
    query: "msi motherboard",
    include: /motherboard|mainboard/i,
    exclude: BOARD_EXCLUDE,
    category: "Motherboards",
    max: 4,
    minPrice: 5000,
  },
  {
    key: "mb-gigabyte",
    query: "gigabyte motherboard",
    include: /motherboard|mainboard/i,
    exclude: BOARD_EXCLUDE,
    category: "Motherboards",
    max: 3,
    minPrice: 4000,
  },
  {
    key: "mb-asus",
    query: "asus motherboard",
    include: /motherboard|mainboard/i,
    exclude: BOARD_EXCLUDE,
    category: "Motherboards",
    max: 3,
    minPrice: 8000,
  },
  /*
   * Depth pass two, second attempt. The provider's search behaves like an AND
   * over the words in the query, so brand-plus-model strings such as
   * "kingston fury ram" or "logitech c270 webcam" come back empty while short
   * category queries ("ddr4 ram", "internal ssd", "desk chair") return dozens.
   * Every query below was run first and only kept when it returns real,
   * in-stock, supported-store products for the slot it feeds.
   *
   * Price bands do the tiering: the same family is asked for twice at
   * overlapping ranges so a ₹12,000 build and a ₹2,00,000 build each get a
   * product that actually exists at that money.
   */
  {
    key: "cpu-ryzen5",
    query: "ryzen 5",
    include: /ryzen\s?5(?!\d)/i,
    exclude: CPU_EXCLUDE,
    category: "Processors",
    max: 5,
    minPrice: 8000,
    maxPrice: 22000,
  },
  {
    key: "cpu-ryzen7",
    query: "ryzen 7",
    include: /ryzen\s?7(?!\d)/i,
    exclude: CPU_EXCLUDE,
    category: "Processors",
    max: 4,
    minPrice: 15000,
    maxPrice: 40000,
  },
  {
    key: "cpu-ryzen9",
    query: "ryzen 9",
    include: /ryzen\s?9(?!\d)/i,
    exclude: CPU_EXCLUDE,
    category: "Processors",
    max: 3,
    minPrice: 35000,
  },
  {
    key: "cpu-intel-i3",
    query: "intel core i3",
    include: /\bi3-?\d{3,4}\b|core i3/i,
    exclude: CPU_EXCLUDE,
    category: "Processors",
    max: 4,
    minPrice: 6000,
    maxPrice: 18000,
  },
  {
    key: "cpu-intel-i5",
    query: "intel core i5",
    include: /\bi5-?\d{3,4}\b|core i5/i,
    exclude: CPU_EXCLUDE,
    category: "Processors",
    max: 5,
    minPrice: 12000,
    maxPrice: 32000,
  },
  {
    key: "cpu-intel-i7",
    query: "intel core i7",
    include: /\bi7-?\d{3,4}\b|core i7/i,
    exclude: CPU_EXCLUDE,
    category: "Processors",
    max: 4,
    minPrice: 20000,
    maxPrice: 62000,
  },
  {
    key: "cpu-intel-ultra",
    query: "intel core ultra processor",
    include: /core ultra/i,
    exclude: CPU_EXCLUDE,
    category: "Processors",
    max: 3,
    minPrice: 30000,
  },
  {
    key: "ram-ddr4",
    query: "ddr4 ram",
    include: /\bddr4\b/i,
    exclude: RAM_EXCLUDE,
    category: "Memory",
    max: 6,
    minPrice: 1500,
  },
  {
    key: "ram-ddr5",
    query: "ddr5 ram",
    include: /\bddr5\b/i,
    exclude: RAM_EXCLUDE,
    category: "Memory",
    max: 5,
    minPrice: 4000,
  },
  {
    key: "ram-desktop",
    query: "desktop ram",
    include: /\bddr[345]\b|\bdimm\b|desktop ram/i,
    exclude: RAM_EXCLUDE,
    category: "Memory",
    max: 5,
    minPrice: 1200,
  },
  {
    key: "ram-corsair",
    query: "corsair vengeance",
    include: /\bddr[45]\b|vengeance|memory|dimm/i,
    exclude: RAM_EXCLUDE,
    category: "Memory",
    max: 3,
    minPrice: 4000,
  },
  {
    key: "ssd-internal",
    query: "internal ssd",
    include: /\bssd\b|\bnvme\b|solid state/i,
    exclude: SSD_EXCLUDE,
    category: "Storage",
    max: 7,
    minPrice: 2500,
  },
  {
    key: "ssd-nvme",
    query: "nvme ssd",
    include: /\bssd\b|\bnvme\b|solid state/i,
    exclude: SSD_EXCLUDE,
    category: "Storage",
    max: 8,
    minPrice: 2500,
  },
  {
    key: "ssd-sata",
    query: "sata ssd",
    include: /\bssd\b|solid state/i,
    exclude: SSD_EXCLUDE,
    category: "Storage",
    max: 3,
    minPrice: 2500,
    maxPrice: 12000,
  },
  {
    key: "ssd-large",
    query: "1tb ssd",
    include: /\bssd\b|\bnvme\b|solid state/i,
    exclude: SSD_EXCLUDE,
    category: "Storage",
    max: 4,
    minPrice: 6000,
  },
  {
    key: "gpu-mid",
    query: "rtx 5060 graphics card",
    include: /graphics card|\bgpu\b|geforce|\brtx\b/i,
    exclude: GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 5,
    minPrice: 20000,
    maxPrice: 70000,
  },
  {
    key: "gpu-entry",
    query: "rtx 3050 graphics card",
    include: /graphics card|\bgpu\b|geforce|\brtx\b/i,
    exclude: GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 4,
    minPrice: 14000,
    maxPrice: 35000,
  },
  {
    key: "gpu-radeon",
    query: "radeon rx graphics card",
    include: /graphics card|\bgpu\b|radeon|\brx\b/i,
    exclude: GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 5,
    minPrice: 18000,
  },
  {
    key: "gpu-rtx50",
    query: "rtx 5070",
    include: /graphics card|\bgpu\b|geforce|\brtx\b/i,
    exclude: GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 4,
    minPrice: 45000,
    maxPrice: 95000,
  },
  {
    key: "cooler-air",
    query: "cpu cooler",
    include: /cpu cooler|air cooler|tower cooler/i,
    exclude: COOLER_EXCLUDE,
    category: "CPU Coolers",
    max: 6,
    minPrice: 1200,
    maxPrice: 14000,
  },
  {
    key: "cooler-aio",
    query: "liquid cooler",
    include: /liquid cooler|cpu cooler|\baio\b/i,
    exclude: COOLER_EXCLUDE,
    category: "CPU Coolers",
    max: 4,
    minPrice: 6000,
  },
  {
    key: "case-gaming",
    query: "gaming cabinet",
    include: /cabinet|pc case|mid tower|mid-tower|gaming case/i,
    exclude: CASE_EXCLUDE,
    category: "PC Cases",
    max: 5,
    minPrice: 1800,
    maxPrice: 14000,
  },
  {
    key: "case-midtower",
    query: "mid tower gaming case",
    include: /cabinet|pc case|mid tower|mid-tower|gaming case/i,
    exclude: CASE_EXCLUDE,
    category: "PC Cases",
    max: 4,
    minPrice: 2000,
  },
  {
    key: "monitor-gaming",
    query: "gaming monitor",
    include: /\bmonitors?\b/i,
    exclude: MONITOR_EXCLUDE,
    category: "Monitors",
    max: 8,
    minPrice: 7000,
    maxPrice: 45000,
  },
  {
    key: "monitor-curved",
    query: "curved gaming monitor",
    include: /\bmonitors?\b/i,
    exclude: MONITOR_EXCLUDE,
    category: "Monitors",
    max: 4,
    minPrice: 9000,
  },
  {
    key: "monitor-oled",
    query: "oled monitor",
    include: /\bmonitors?\b/i,
    exclude: MONITOR_EXCLUDE,
    category: "Monitors",
    max: 3,
    minPrice: 40000,
  },
  {
    key: "keyboard-gaming",
    query: "gaming keyboard",
    include: /\bkeyboards?\b/i,
    exclude: KEYBOARD_EXCLUDE,
    category: "Keyboards",
    max: 6,
    minPrice: 450,
    maxPrice: 9000,
  },
  {
    key: "keyboard-mech",
    query: "mechanical keyboard",
    include: /\bkeyboards?\b/i,
    exclude: KEYBOARD_EXCLUDE,
    category: "Keyboards",
    max: 4,
    minPrice: 1200,
  },
  {
    key: "mouse-gaming",
    query: "gaming mouse",
    include: /\bmouse\b|mice/i,
    exclude: MOUSE_EXCLUDE,
    category: "Mice",
    max: 6,
    minPrice: 180,
    maxPrice: 9000,
  },
  {
    key: "mouse-wireless",
    query: "wireless gaming mouse",
    include: /\bmouse\b|mice/i,
    exclude: MOUSE_EXCLUDE,
    category: "Mice",
    max: 4,
    minPrice: 500,
  },
  {
    key: "headset-gaming",
    query: "gaming headset",
    include: /gaming|headsets?\b/i,
    exclude: HEADSET_EXCLUDE,
    category: "Headphones",
    max: 6,
    minPrice: 1200,
    maxPrice: 22000,
  },
  {
    key: "headset-brand",
    query: "hyperx cloud headset",
    include: /headsets?\b/i,
    exclude: HEADSET_EXCLUDE,
    category: "Headphones",
    max: 4,
    minPrice: 1500,
  },
  {
    key: "headset-mic",
    query: "headset with mic for gaming",
    include: /headsets?\b/i,
    exclude: HEADSET_EXCLUDE,
    category: "Headphones",
    max: 4,
    minPrice: 900,
  },
  {
    key: "webcam",
    query: "webcam",
    include: /webcam|web camera|streaming camera/i,
    exclude: /cover|cctv|security|tripod|laptop|notebook|desktop|monitor|tablet|phone|\bpc\b\b/i,
    category: "Webcams",
    max: 3,
    minPrice: 1500,
    maxPrice: 25000,
  },
  {
    key: "ups-pc",
    query: "ups for computer",
    include: /\bups\b|uninterruptible/i,
    exclude: /battery only|replacement battery|inverter battery|trolley|bag|cart|cups|crockery|mug|teacup|filter|stainless|kitchen|solar|engineered wood|bedroom|kids|furniture|sofa|\bbed\b|study table|laptop|monitor/i,
    category: "UPS",
    max: 6,
    minPrice: 1500,
    maxPrice: 16000,
  },
  {
    key: "ups-brand",
    query: "online ups",
    include: /\bups\b|uninterruptible/i,
    exclude: /battery only|replacement battery|inverter battery|trolley|bag|cart|cups|crockery|mug|teacup|filter|stainless|kitchen|solar|engineered wood|bedroom|kids|furniture|sofa|\bbed\b|study table|laptop|monitor/i,
    category: "UPS",
    max: 3,
    minPrice: 2500,
  },
  {
    key: "chair-desk",
    query: "desk chair",
    include: /chair/i,
    exclude: CHAIR_EXCLUDE,
    category: "Chairs",
    max: 5,
    minPrice: 2500,
    maxPrice: 16000,
  },
  {
    key: "chair-ergo",
    query: "ergonomic chair",
    include: /chair/i,
    exclude: CHAIR_EXCLUDE,
    category: "Chairs",
    max: 6,
    minPrice: 5000,
    maxPrice: 30000,
  },
  {
    key: "controller-wireless",
    query: "wireless controller",
    include: /\bcontrollers?\b|\bgamepad\b/i,
    exclude: CONTROLLER_EXCLUDE,
    category: "Gaming Controllers",
    max: 4,
    minPrice: 1500,
    maxPrice: 12000,
  },
  {
    key: "controller-gamepad",
    query: "gamepad",
    include: /\bgamepad\b|\bcontrollers?\b/i,
    exclude: CONTROLLER_EXCLUDE,
    category: "Gaming Controllers",
    max: 4,
    minPrice: 1500,
    maxPrice: 12000,
  },

  /*
   * Depth pass three — the parts a ₹50,000–₹1,00,000 build still could not
   * find. Proven by scripts/tmp-probe-ddr5.ts and tmp-probe-depth3.ts, which
   * printed only what the provider actually returns in stock:
   *
   *   · entry-level boards and cards under ₹30,000 (the RX 580/590 and
   *     GTX 1660 class Indian builders really buy at that money),
   *   · one more DDR4 16GB kit and the AM5 boards the index has,
   *   · a 2TB NVMe above the 1TB band.
   *
   * Power supplies were probed again across twelve phrasings ("power supply
   * unit", "pc smps", "casing power supply", "450w", "600w", brand+series
   * strings). The provider indexes none, so the PSU slot stays honestly open
   * rather than filling with a UPS or a charger.
   */
  {
    key: "gpu-entry-3",
    query: "rx 580",
    include: /graphics card|\bgpu\b|radeon/i,
    exclude: ENTRY_GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 5,
    minPrice: 15000,
    maxPrice: 32000,
  },
  {
    key: "gpu-entry-4",
    query: "graphics card 8gb",
    include: /graphics card|\bgpu\b/i,
    exclude: ENTRY_GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 6,
    minPrice: 18000,
    maxPrice: 45000,
  },
  {
    key: "gpu-entry-5",
    query: "gtx 1660",
    include: /graphics card|\bgpu\b/i,
    exclude: ENTRY_GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 3,
    minPrice: 20000,
    maxPrice: 45000,
  },
  {
    key: "gpu-mid-2",
    query: "rtx 3060",
    include: /graphics card|\bgpu\b|geforce/i,
    exclude: GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 4,
    minPrice: 45000,
    maxPrice: 110000,
  },
  {
    key: "gpu-mid-3",
    query: "rtx 5060",
    include: /graphics card|\bgpu\b|video card|geforce/i,
    exclude: GPU_EXCLUDE,
    category: "Graphics Cards",
    max: 4,
    minPrice: 50000,
    maxPrice: 110000,
  },
  {
    key: "ram-ddr4-2",
    query: "ddr4 3200",
    include: /\bddr4\b|3200mhz|\bram\b|memory/i,
    exclude: RAM_EXCLUDE,
    category: "Memory",
    max: 4,
    minPrice: 2000,
  },
  {
    key: "mb-am5-2",
    query: "am5 motherboard",
    include: /motherboard|mainboard/i,
    exclude: BOARD_EXCLUDE,
    category: "Motherboards",
    max: 4,
    minPrice: 12000,
  },
  {
    key: "mb-intel-2",
    query: "gaming motherboard",
    include: /motherboard|mainboard/i,
    exclude: BOARD_EXCLUDE,
    category: "Motherboards",
    max: 4,
    minPrice: 9000,
    maxPrice: 45000,
  },
  {
    key: "ssd-m2",
    query: "m.2 ssd",
    include: /\bm\.?2\b|nvme|ssd/i,
    exclude: SSD_EXCLUDE,
    category: "Storage",
    max: 4,
    minPrice: 3000,
  },

  /*
   * Depth pass four — the other nineteen rooms, plus the browse shelves the
   * catalogue was thin on. Proven by scripts/tmp-probe-gaps.ts and
   * tmp-probe-gaps2.ts, which printed only what the provider really returns in
   * stock on a supported store, and it is not everything:
   *
   *   · "av receiver", "home theatre amplifier", "pet carrier", "dog carrier",
   *     "foam roller", "nappy bag" and "webcam full hd" all return either zero
   *     results or someone else's product (a laptop cooling pad for "foam
   *     roller", Puma "Amplifier" sneakers for "amplifier"), so those slots
   *     stay honestly empty in the builder instead of filling with noise;
   *   · what does exist in depth is recovery guns and bands, monitor arms,
   *     PC gamepads and racing wheels, nursery linen and crib mobiles, bed
   *     linen, apparel and footwear, tripods, table lamps, shelves, decor,
   *     air purifiers, geysers and real 5.1 home-theatre soundbars.
   */
  {
    key: "monitor-arm",
    query: "monitor arm",
    include: /monitor arm|monitor stand|monitor riser|vesa mount|arm mount/i,
    exclude:
      /light bar|screen bar|lamp|\bled\b|projector|\bcpu\b|laptop|tv mount|cctv|camera|microphone|\bspeaker\b|heart rate|armband|arm band|blood pressure|\bbp\b|armpit|fitness|watch/i,
    category: "Desk Accessories",
    max: 4,
    minPrice: 700,
    maxPrice: 14000,
  },
  {
    key: "monitor-arm-2",
    query: "vesa mount",
    include: /monitor arm|vesa|arm mount|bracket for (monitor|tv)/i,
    exclude:
      /\bpc\b|monitor \d|full hd|\bips\b|\bva panel\b|refresh|\bhz\b|gaming monitor|led backlit|light|lamp|\d{2}[.,]?\d*\s?-?\s?(inch|cm)|\b(fhd|qhd|wqhd|4k|oled)\b|1920|2560|adaptive sync|\bdp\b|hdmi port/i,
    category: "Desk Accessories",
    max: 3,
    minPrice: 700,
    maxPrice: 14000,
  },
  {
    key: "desk-organizer",
    query: "desk pad",
    include: /desk mat|desk pad|mouse pad|keyboard mat|desk organizer|controller stand|headphone stand|headphone holder/i,
    exclude: /fan|writing board|acrylic|glow|sticky|paper|note book|laptop stand|cooling pad|wrist rest only/i,
    category: "Desk Accessories",
    max: 5,
    minPrice: 90,
    maxPrice: 4000,
  },
  {
    key: "speaker-21",
    query: "2.1 speaker",
    include: /2\.1|multimedia speaker|computer speaker|gaming speaker|\bspeakers\b/i,
    exclude: /headset|headphone|earphone|earbud|neckband|sound ?bar|car|stage|party|dock|station|cable/i,
    category: "Audio",
    max: 4,
    minPrice: 700,
    maxPrice: 9000,
  },
  {
    key: "gamepad-pc",
    query: "joystick for pc",
    include: /controller|gamepad|joystick/i,
    exclude: CONTROLLER_EXCLUDE,
    category: "Gaming Controllers",
    max: 5,
    minPrice: 600,
    maxPrice: 6000,
  },
  {
    key: "racing-wheel",
    query: "steering wheel game",
    include: /steering wheel|wheel base|motion controller|racing game/i,
    exclude: /for kids|toy\b|remote|shifter|seat|clamp only|\bdesk\b|phone holder/i,
    category: "Gaming Controllers",
    max: 3,
    minPrice: 4000,
  },
  {
    key: "massage-gun",
    query: "massage gun",
    include: /massage gun|percussion/i,
    exclude: /face|facial|\bice\b|eye|beauty|chair|foot spa|slipper|gun (cleaning|toy)/i,
    category: "Fitness",
    max: 6,
    minPrice: 400,
    maxPrice: 5000,
  },
  {
    key: "bands-depth",
    query: "resistance band",
    include: /resistance band|pull reducer|therapy band|exercise band|toning tube/i,
    exclude: /watch|mobile holder|strap only|luggage/i,
    category: "Fitness",
    max: 5,
    minPrice: 100,
    maxPrice: 2000,
  },
  {
    key: "nursery-linen",
    query: "baby mattress",
    include: /(baby|newborn|new born|infant).*(sheet|protector|bedding|mattress|gadda|blanket)/i,
    exclude: /bed server|adult|king size|double bed|showpiece|figurine/i,
    category: "Baby Care",
    max: 4,
    minPrice: 150,
    maxPrice: 2500,
  },
  {
    key: "crib-mobile",
    query: "cradle",
    include: /crib|cot mobile|jhoomer|cradle|rocker|baby swing/i,
    exclude: /nativity|showpiece|figurine|remote control|doll|toy car|christmas/i,
    category: "Baby Care",
    max: 4,
    minPrice: 300,
    maxPrice: 15000,
  },
  {
    key: "bed-linen-depth",
    query: "bed sheet set",
    include: /bedsheet|bed sheet|bedding set/i,
    exclude: /protector|pillow cover only|mattress cover|bed server|showpiece/i,
    category: "Bed Linen",
    max: 8,
    minPrice: 150,
    maxPrice: 3000,
  },
  {
    key: "kurti-depth",
    query: "women kurti",
    include: /kurta|kurti/i,
    exclude: /fabric|metre|meters|unsitched|stitching|pillow|curtain/i,
    category: "Kurtas & Kurtis",
    max: 8,
    minPrice: 350,
    maxPrice: 3000,
  },
  {
    key: "tshirt-depth",
    query: "mens tshirt",
    include: /t-?shirt|tee\b/i,
    exclude: /women|kids|boys|girls|inner|thermals|pair of socks/i,
    category: "Tshirts",
    max: 8,
    minPrice: 300,
    maxPrice: 2500,
  },
  {
    key: "sneaker-depth",
    query: "sneakers",
    include: /sneaker|casual shoes|sports shoes|running shoes|lifestyle/i,
    exclude: /lace|shoe cover|cleaner|protectant|sock|insole|kids|boys|girls|slipper|formal belt/i,
    category: "Sports Shoes",
    max: 8,
    minPrice: 600,
    maxPrice: 6000,
  },
  {
    key: "tripod-depth",
    query: "tripod for mobile",
    include: /tripod|selfie stick|gimbal|stabilizer/i,
    exclude: /remote only|mount only|clip only|case|cover|bc-|battery/i,
    category: "Camera Accessories",
    max: 6,
    minPrice: 80,
    maxPrice: 12000,
  },
  {
    key: "table-lamp",
    query: "study lamp",
    include: /table lamp|desk lamp|bedside|reading light|study light|night lamp/i,
    exclude: /shade only|spare|bulb only|holder|ceiling|fan|glass set|dinner/i,
    category: "Lamps & Lights",
    max: 6,
    minPrice: 300,
    maxPrice: 4000,
  },
  {
    key: "shelf-depth",
    query: "kitchen storage",
    include: /shelf|shelves|organizer|storage rack|\brack\b/i,
    exclude: /refrigerator|fridge|tv unit|mattress|shoe rack only|car/i,
    category: "Shelves",
    max: 8,
    minPrice: 150,
    maxPrice: 4000,
  },
  {
    key: "decor-depth",
    query: "home decor",
    include: /wall sticker|showpiece|vase|photo frame|mirror|wall art|artificial plant|home decor/i,
    exclude: /light|lamp|candle|glue gun|bedsheet|curtain/i,
    category: "Home Decor",
    max: 8,
    minPrice: 90,
    maxPrice: 3000,
  },
  {
    key: "theatre-soundbar",
    query: "home theatre system",
    include: /home theatre|home theater|5\.1|soundbar/i,
    exclude: /remote|cable|stand|wall mount|battery|stand only/i,
    category: "Audio",
    max: 3,
    minPrice: 8000,
  },
  {
    key: "air-purifier",
    query: "air purifier",
    include: /air purifier/i,
    exclude: /filter pad|pouch|desiccant|mask|car\b|filter only|humidifier only/i,
    category: "Home Appliances",
    max: 5,
    minPrice: 800,
    maxPrice: 30000,
  },
  {
    key: "geyser",
    query: "geyser",
    include: /geyser|water heater|immersion rod|instant water/i,
    exclude: /smart plug|socket|shower head|pipe|filter/i,
    category: "Home Appliances",
    max: 6,
    minPrice: 350,
    maxPrice: 12000,
  },
  {
    key: "smartwatch-depth",
    query: "smartwatch",
    include: /smart ?watch/i,
    exclude: /strap|band|charger|case|cover|protector|buckle|tempered/i,
    category: "Smart Watches",
    max: 6,
    minPrice: 500,
    maxPrice: 8000,
  },
  {
    key: "pet-bed-depth",
    query: "dog bed",
    include: /(dog|cat|pet).*(bed|cot|mat|blanket|cushion)/i,
    exclude: /book|story|toy|crate|cage|cover only|sofa cover/i,
    category: "Pet Supplies",
    max: 3,
    minPrice: 150,
    maxPrice: 4000,
  },

  /**
   * Depth pass five — the rooms the coverage sweep still reported as thin after
   * pass four, and the aisles a real reader walks that we simply did not stock.
   * Proven by scripts/tmp-probe-gaps3.ts, phrase by phrase, on live results.
   *
   *   · still nothing, anywhere in the index: "car dashboard camera", "pet
   *     carrier", "dog carrier bag", "diaper bag for mom", "av receiver 5.1",
   *     "boat webcam"/"logitech c270"/"webcam with mic", "soft box lighting",
   *     "portable vacuum cleaner", "aquarium tank", "external hard disk",
   *     "stacking chair" and "windshield cleaner". Those stay honest gaps;
   *   · phrases that return someone else's product, and were therefore dropped
   *     as targets: "car seat cover" (all baby car seats), "car shampoo" (all
   *     hair shampoo), "kurta for men" (mostly women's kurtis), "jeans for men"
   *     (women's tops), "study table" (idols and lap trays) — each of those is
   *     kept only with an include pattern that demands the real thing;
   *   · what is genuinely deep: plant stands, cheap chairs and mattresses,
   *     kitchen appliances, storage and bottles, routers and projectors, 32"
   *     TVs, footwear and apparel for the wardrobe, strollers and carriers,
   *     and the whole home-gym accessory shelf (gloves, mats, ropes, dumbbells).
   */
  {
    key: "plant-stand",
    query: "plant stand",
    include: /(plant|pot|planter) stand|plant stool|flower stand/i,
    exclude: /artificial|fake|showpiece|idol|toy|sewing|iron sheet|book stand/i,
    category: "Gardening",
    max: 6,
    minPrice: 120,
    maxPrice: 5000,
  },
  {
    key: "study-table",
    query: "study table",
    include: /(study table|study desk|computer table|writing desk|kids table)/i,
    exclude: /tray|lap desk|bookshelf|book rack|organizer|idol|showpiece|lamp|light|chair|stool|mat|cover/i,
    category: "Desks",
    max: 6,
    minPrice: 1200,
    maxPrice: 25000,
  },
  {
    key: "plastic-chair",
    query: "plastic chair",
    // "plastic chair" returns the whole chairs aisle, so the words have to do
    // the sorting: a stackable garden chair is the target, an upholstered
    // mid-back office chair titled "For Living, Bed Room" is not.
    include: /plastic|stack|moulded|molded|garden|outdoor|cafeteria|arm ?less|chairs? set/i,
    exclude: /high ?chair|baby|toilet|cover|cushion|wheel|castor|spare|repair|mid ?back|high ?back|upholst|accent|recline|leather|cane|jute|swing|rocker|gaming/i,
    category: "Chairs",
    max: 5,
    minPrice: 700,
    maxPrice: 9000,
  },
  {
    key: "study-chair",
    query: "study chair for home",
    include: /(office|study|desk|computer|reading) chair|mid ?back|high ?back/i,
    exclude: /cover|cushion|bean bag|castor|wheel only|replacement|spare/i,
    category: "Chairs",
    max: 5,
    minPrice: 1200,
    maxPrice: 18000,
  },
  {
    key: "foam-mattress",
    query: "foam mattress 6 inch",
    include: /mattress/i,
    exclude: /protector|topper|pillow|sheet|tester|sample|roll cover|box spring/i,
    category: "Mattresses",
    max: 6,
    minPrice: 3500,
    maxPrice: 40000,
  },
  {
    key: "microfiber-cloth",
    query: "microfiber cloth car",
    include: /microfiber|cleaning cloth|washing cloth/i,
    exclude: /kitchen|glass|spectacle|screen|makeup|bathroom|toilet|duster only/i,
    category: "Microfiber Cloths",
    max: 4,
    minPrice: 80,
    maxPrice: 1500,
  },
  {
    key: "car-vacuum",
    query: "car vacuum cleaner",
    include: /(car|vehicle|auto|12v|portable|handheld)[a-z ]{0,14}vacuum|vacuum[a-z ]{0,14}(car|vehicle)/i,
    exclude: /robotic|deebot|bag only|filter only|carpet shampoo|mattress|upholster|sofa|stick vacuum|canister|wet ?& ?dry|drumless/i,
    category: "Car Vacuums",
    max: 4,
    minPrice: 600,
    maxPrice: 12000,
  },
  {
    // The same aisle, filed where it belongs. A "cordless stick vacuum" that
    // mentions a car in its blurb is a home appliance, not car care.
    key: "home-vacuum",
    query: "vacuum cleaner for home",
    include: /vacuum cleaner/i,
    exclude: /robot|deebot|bag only|filter only|spare|attachment|mattress sanitizer|car wash/i,
    category: "Vacuum Cleaners",
    max: 5,
    minPrice: 1200,
    maxPrice: 20000,
  },
  {
    key: "electric-kettle",
    query: "electric kettle",
    include: /electric kettle|kettle.*(stainless|ss|litre|l\b)/i,
    exclude: /stovetop|gas|induction bottom|cover|stand|holder|coffee|hot pot/i,
    category: "Electric Kettles",
    max: 6,
    minPrice: 350,
    maxPrice: 6000,
  },
  {
    key: "sandwich-maker",
    query: "sandwich maker",
    include: /sandwich (maker|grill|toaster)|panini/i,
    exclude: /butter|spread|bread|box|paper|recipe/i,
    category: "Kitchen Appliances",
    max: 4,
    minPrice: 600,
    maxPrice: 8000,
  },
  {
    key: "air-fryer",
    query: "air fryer",
    include: /air ?fryer/i,
    exclude: /liner|paper|silicone|bowl|sprayer|oil bottle|accessor|recipe|book|stand/i,
    category: "Air Fryers",
    max: 6,
    minPrice: 1500,
    maxPrice: 30000,
  },
  {
    key: "mixer-grinder",
    query: "mixer grinder",
    include: /mixer ?grinder|mixer|grinder/i,
    exclude: /jar only|spare|blade only|attachment|compatible|chutney jar|lid|coupler|belt/i,
    category: "Mixer Grinders",
    max: 6,
    minPrice: 900,
    maxPrice: 20000,
  },
  {
    key: "lunch-box",
    query: "lunch box",
    include: /lunch ?box|tiffin (box|container|set)|food container/i,
    exclude: /bag only|insulated bag|straw|spoon set|cleaner|toy/i,
    category: "Jars & Containers",
    max: 6,
    minPrice: 180,
    maxPrice: 4000,
  },
  {
    key: "water-bottle",
    query: "water bottle steel",
    include: /water bottle.*(steel|stainless|insulated|sports|gym)|steel.*water bottle/i,
    exclude: /purifier|dispenser|filter candle|cap only|lid only|cleaner|box|tray/i,
    category: "Water Bottles",
    max: 6,
    minPrice: 140,
    maxPrice: 3000,
  },
  {
    key: "airtight-container",
    query: "airtight containers",
    // Without the lunch-box ban this target re-imports the target above it:
    // every "airtight leak-proof" container on the store is a tiffin set.
    include: /airtight|storage container|food storage|canister|container (set|for|with|kit)/i,
    exclude: /lunch ?box|tiffin|gas cylinder|blood|camera|battery|wheel|bag/i,
    category: "Jars & Containers",
    max: 5,
    minPrice: 140,
    maxPrice: 5000,
  },
  {
    key: "wifi-router",
    query: "wifi router",
    include: /(wi-?fi|wireless)? ?router/i,
    // "Mini UPS for router" and "UPS | Backup for Desktop/Router" are power
    // backups sold against the router they protect. They fill the UPS slot,
    // never this one.
    exclude: /stand|holder|shelf|mount|cover|skin|antenna only|repeater? only|table|\bups\b|uninterrupt|backup|inverter|surge|stabiliz|stabilis|power bank|sim only|extension board/i,
    category: "Wi-fi Routers",
    max: 5,
    minPrice: 700,
    maxPrice: 9000,
  },
  {
    key: "projector",
    query: "projector",
    include: /projector/i,
    exclude: /toy|torch|slide|kids|cable|screen|hDMI|bulb|lamp|stand|bag|remote/i,
    category: "Projectors",
    max: 4,
    minPrice: 6000,
    maxPrice: 90000,
  },
  {
    key: "power-bank",
    query: "power bank 20000mah",
    include: /power bank/i,
    exclude: /case|cover|solar torch|cable only|charger plate/i,
    category: "Power Banks",
    max: 5,
    minPrice: 500,
    maxPrice: 6000,
  },
  {
    key: "tv-32",
    query: "smart led tv 32 inch",
    // The query says 32 inch; the results say 55. Without the size lock the
    // bedroom TV slot gets handed a ₹38,499 Coocaa 138 cm.
    include: /((32 ?inch|32"|80 ?cm).{0,55}(tv|television))|((tv|television).{0,55}(32 ?inch|32"|80 ?cm))/i,
    exclude: /mount|stand|cover|remote|panel|decoder|set ?top box|bracket|(39|40|43|50|55|58|60|65|70|75|85) ?inch|(100|102|109|123|138|139|140|146|164|165|178|189|214) ?cm/i,
    category: "Televisions",
    max: 5,
    minPrice: 6000,
    maxPrice: 30000,
  },
  {
    key: "tv-55",
    query: "smart tv 55 inch",
    include: /((43|50|55|65) ?inch|(109|123|138|139|140|164|165) ?cm).{0,55}(tv|television)|(tv|television).{0,55}((43|50|55|65) ?inch|(109|123|138|139|140|164|165) ?cm)/i,
    exclude: /mount|stand|cover|remote|panel|decoder|set ?top box|bracket|refurbish|32 ?inch|80 ?cm/i,
    category: "Televisions",
    max: 5,
    minPrice: 22000,
    maxPrice: 130000,
  },
  {
    key: "shoe-rack",
    query: "shoe rack",
    include: /shoe (rack|stand|organizer|shelf)/i,
    exclude: /silica|desiccant|polish|cleaner|bag only|box only|cover/i,
    category: "Shelves",
    max: 5,
    minPrice: 220,
    maxPrice: 7000,
  },
  {
    key: "sofa-cover",
    query: "sofa cover",
    include: /sofa (cover|slipcover|slip cover|protector|blanket|fabric)|couch cover/i,
    exclude: /pillow cover|cushion cover|table cover|car seat/i,
    category: "Home Decor",
    max: 5,
    minPrice: 200,
    maxPrice: 5000,
  },
  {
    key: "curtains",
    query: "curtains for room",
    include: /curtain/i,
    exclude: /rod|track|hook|tieback|ring|eyelet only|pillat|machine|shower/i,
    category: "Curtains",
    max: 6,
    minPrice: 220,
    maxPrice: 8000,
  },
  {
    key: "wall-clock",
    query: "wall clock",
    include: /wall ?clock|analog clock|quartz clock/i,
    exclude: /movement|mechanism|hands|battery only|repair|spare|toy/i,
    category: "Clocks",
    max: 5,
    minPrice: 180,
    maxPrice: 6000,
  },
  {
    key: "bedside-lamp",
    query: "bedside lamp",
    include: /(bedside|night|table|study) lamp|night light|lamp.*(bedside|night)/i,
    exclude: /ceiling|wall lamp|strip|projector|torch|fan|clip|solar|toy/i,
    category: "Table Lamps",
    max: 6,
    minPrice: 280,
    maxPrice: 6000,
  },
  {
    key: "women-sneakers",
    query: "sneakers for women",
    include: /(women|womens|female).*(sneaker|slip on|lace up)|sneaker for women/i,
    exclude: /\bmen\b|men's|mens\b|shoe rack|lace only|cleaner|cover|insole/i,
    category: "Sports Shoes",
    max: 6,
    minPrice: 450,
    maxPrice: 9000,
  },
  {
    key: "formal-shoes",
    query: "formal shoes men",
    include: /(formal|office|derby|oxford|loafer|dress) shoes?|shoes?.*(formal|office)/i,
    exclude: /women|sports|running|sneaker|canvas|slipper|sandal|insole|polish/i,
    category: "Formal Shoes",
    max: 6,
    minPrice: 450,
    maxPrice: 9000,
  },
  {
    key: "kurta-men",
    query: "kurta for men",
    include: /(men|mens|male|boys).*kurta|kurta for men|men'?s kurta/i,
    exclude: /women|kurti|palazzo|set (with|of)? ?palazzo|dupatta/i,
    category: "Ethnic Wear",
    max: 6,
    minPrice: 300,
    maxPrice: 6000,
  },
  {
    key: "blouse-women",
    query: "saree blouse",
    include: /saree blouse|sari blouse|\bblouse\b/i,
    // A "Saree with unstitched blouse piece" is sold as a saree. Keep it out of
    // the tops shelf and let the saree target below claim it.
    exclude: /shirt|kurti|dress|suit fabric|pattern book|pads|padding only|stitching|(saree|sari) with|with (an? ?)?(unstitched|stitched) blouse/i,
    category: "Tops",
    max: 5,
    minPrice: 350,
    maxPrice: 6000,
  },
  {
    key: "saree-depth",
    query: "saree for women",
    include: /saree|sari\b|saaree/i,
    exclude: /blouse piece only|stitching|petticoat|petiskirt|fabric (by|per) metre|per metre|wash|nurse|security/i,
    category: "Sarees",
    max: 8,
    minPrice: 400,
    maxPrice: 15000,
  },
  {
    key: "jeans-men",
    query: "jeans for men",
    include: /(men|mens|male).*jeans|jeans for men|men'?s jeans/i,
    exclude: /women|kurti|top|shirt|tshirt|belt|hoverboard/i,
    category: "Jeans",
    max: 6,
    minPrice: 450,
    maxPrice: 6000,
  },
  {
    key: "travel-backpack",
    query: "travel backpack",
    include: /(travel|hiking|laptop|rucksack|trekking|college).*(backpack|rucksack)|backpack.*(travel|laptop|hiking)/i,
    exclude: /cover|bag only|toy|kid'?s school cartoon|wheel|duffel/i,
    category: "Backpacks",
    max: 6,
    minPrice: 250,
    maxPrice: 7000,
  },
  {
    key: "baby-carrier",
    query: "baby carrier",
    include: /baby carrier|carrier.*(baby|infant|newborn)|hip ?seat/i,
    exclude: /stroller|pram|bag only|cover|insert|strap only/i,
    category: "Baby Care",
    max: 5,
    minPrice: 800,
    maxPrice: 12000,
  },
  {
    key: "stroller",
    query: "stroller",
    include: /stroller|pram/i,
    exclude: /toy|travel system bag|cover|wheels? only|accessor|organizer/i,
    category: "Baby Care",
    max: 5,
    minPrice: 3000,
    maxPrice: 30000,
  },
  {
    key: "baby-toys",
    query: "baby toys",
    include: /(baby|toddler|newborn|infant|kids|children).*(toy|toys|rattle|play mat|activity|teether|stack)/i,
    exclude: /cleanser|wash|bottle|cloth|food|oil|lotion|stroller|rocker|booster|feeding|baby ?monitor|diaper/i,
    category: "Toys & Games",
    max: 6,
    minPrice: 100,
    maxPrice: 6000,
  },
  {
    key: "dumbbell",
    query: "dumbbell set",
    include: /dumb ?bell/i,
    exclude: /rack only|stand only|case|cover|bar only/i,
    category: "Dumbbells",
    max: 5,
    minPrice: 450,
    maxPrice: 20000,
  },
  {
    key: "yoga-mat",
    query: "yoga mat",
    include: /yoga mat|exercise mat|fitness mat|gym mat/i,
    exclude: /ball|block|strap only|wheel|bag|cleaner/i,
    category: "Yoga Mats",
    max: 5,
    minPrice: 280,
    maxPrice: 5000,
  },
  {
    key: "skip-rope",
    query: "skip rope",
    include: /skipping rope|jump rope|speed rope/i,
    exclude: /machine|trainer only|replace/i,
    category: "Skipping Ropes",
    max: 4,
    minPrice: 70,
    maxPrice: 1500,
  },
  {
    key: "gym-gloves",
    query: "gym gloves",
    include: /(gym|fitness|workout|lifting|training|weight ?lifting) ?gloves?|gloves.*(gym|lifting|wrist)/i,
    exclude: /cotton|safety|garden|driving|surgical|nitrile|rubber industrial|weather/i,
    category: "Gym Gloves",
    max: 5,
    minPrice: 90,
    maxPrice: 3000,
  },
];

function desirability(p: PHAIProduct): number {
  const mrp =
    p.original_price && p.current_price && p.original_price > p.current_price
      ? p.original_price
      : null;
  const disc =
    p.discount_percentage ??
    (mrp && p.current_price ? ((mrp - p.current_price) / mrp) * 100 : 0);
  const rating = p.rating ?? 0;
  const reviews = Math.log10((p.review_count ?? 0) + 1);
  return Math.min(65, disc) * 0.9 + rating * 7 + Math.min(reviews, 4) * 5;
}

/**
 * Same model often appears twice from different sellers with punctuation
 * differences. Keep the first (cheapest band) and drop the near-duplicate so
 * the catalogue reads as products, not repeated listings.
 */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/coretm/g, "core")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 72);
}

/**
 * One pick per price band, cheapest to dearest, so the catalogue genuinely
 * covers every budget instead of stacking ten near-identical mid-range items.
 */
function spreadPicks(items: PHAIProduct[], max: number): PHAIProduct[] {
  if (items.length <= max) return [...items];
  const sorted = [...items].sort(
    (a, b) => (a.current_price ?? 0) - (b.current_price ?? 0),
  );
  const buckets = new Map<number, PHAIProduct[]>();
  sorted.forEach((item, i) => {
    const bucket = Math.min(max - 1, Math.floor((i * max) / sorted.length));
    const list = buckets.get(bucket) ?? [];
    list.push(item);
    buckets.set(bucket, list);
  });
  return [...buckets.values()]
    .map((bucket) => bucket.sort((a, b) => desirability(b) - desirability(a))[0])
    .sort((a, b) => (a.current_price ?? 0) - (b.current_price ?? 0));
}

async function main() {
  await ensureSchema();
  const dry = has("dry");
  const only = (arg("only") ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const onlySet = new Set(only);
  const targets = TARGETS.filter((t) => !onlySet.size || onlySet.has(t.key));

  const existing = await db
    .select({ merchant: listings.merchant, merchantProductId: listings.merchantProductId })
    .from(listings);
  const known = new Set(
    existing.map((r) => `${r.merchant}:${r.merchantProductId.toUpperCase()}`),
  );

  let imported = 0;
  let skipped = 0;
  let thin = 0;
  let failed = 0;
  const seenIds = new Set<number>();
  const seenTitles = new Set<string>();
  const started = Date.now();

  for (const target of targets) {
    const hits = await searchPriceHistoryAi(target.query, 50);
    const viable = hits
      .filter((h) => {
        if (h.current_price === null || h.current_price <= 0) return false;
        if (h.current_price < target.minPrice) return false;
        if (target.maxPrice && h.current_price > target.maxPrice) return false;
        if (h.title.length < 8 || !/^https?:\/\//.test(h.url)) return false;
        if (h.in_stock === false) return false;
        if (!target.include.test(h.title)) return false;
        if (target.exclude && target.exclude.test(h.title)) return false;
        const merchant = merchantFromUrl(h.url) ?? h.platform;
        return SUPPORTED.has(merchant);
      })
      .sort((a, b) => (a.current_price ?? 0) - (b.current_price ?? 0));

    const picks = spreadPicks(viable, target.max);
    console.log(
      `\n${target.key.padEnd(16)} "${target.query}" → ${viable.length} genuine matches, picking ${picks.length}`,
    );

    for (const item of picks) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);

      const tKey = titleKey(item.title);
      if (seenTitles.has(tKey)) continue;
      seenTitles.add(tKey);

      const merchant = merchantFromUrl(item.url) ?? item.platform;
      const pid = item.asin || String(item.id);
      if (known.has(`${merchant}:${pid.toUpperCase()}`)) {
        skipped++;
        continue;
      }

      if (dry) {
        console.log(
          `  · ${merchant.padEnd(14)} ₹${String(Math.round(item.current_price ?? 0)).padStart(7)}  ${target.category.padEnd(18)} ${item.title.slice(0, 62)}`,
        );
        continue;
      }

      try {
        const hist = await fetchPriceHistoryAi(item.id);
        const points = hist?.points ?? [];
        if (points.length < 3) {
          thin++;
          continue;
        }
        const latest = points[points.length - 1];
        if (Date.now() - latest.t > 45 * 86400000) {
          thin++;
          continue;
        }

        const slug = `${slugify(item.title).slice(0, 68)}-${item.id}`;
        const product = await upsertProduct({
          slug,
          title: item.title,
          brand: item.brand?.trim() || null,
          category: target.category,
          imageUrl: item.image_url ?? null,
          images: item.image_url ? [item.image_url] : [],
          identityKey: null,
        });

        const listing = await upsertListing({
          productId: product.id,
          merchant,
          merchantProductId: pid,
          url: item.url,
          title: item.title,
          price: item.current_price,
          mrp:
            item.original_price && item.original_price > (item.current_price ?? 0)
              ? item.original_price
              : null,
          inStock: item.in_stock,
          rating: item.rating,
          reviewCount: item.review_count,
          imageUrl: item.image_url ?? null,
          shipping: 0,
        });

        for (const point of points) {
          await addObservation({
            listingId: listing.id,
            price: point.price,
            source: "imported:pricehistory.ai",
            observedAt: point.t,
          });
        }

        known.add(`${merchant}:${pid.toUpperCase()}`);
        imported++;
        console.log(
          `  ✓ ${merchant.padEnd(14)} ₹${String(Math.round(item.current_price ?? 0)).padStart(7)} ${String(points.length).padStart(4)} pts  ${item.title.slice(0, 58)}`,
        );
      } catch (err) {
        failed++;
        console.log(
          `  ✗ ${merchant.padEnd(14)} ${item.id} — ${(err as Error).message.slice(0, 60)}`,
        );
      }
      await sleep(200);
    }
  }

  console.log(
    `\nDone: ${imported} imported · ${skipped} already known · ${thin} thin history · ${failed} failed · ${Math.round((Date.now() - started) / 60000)} min`,
  );
  await closePlaywright();
}

main().then(() => process.exit(0));
