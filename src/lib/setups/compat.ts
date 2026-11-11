/**
 * PC part compatibility.
 *
 * A setup can have every price in it verified and still be wrong: an AM5
 * processor does not fit an LGA1700 board, and a DDR4-only board will not take
 * the DDR5 kit sitting next to it. The builder therefore reads the platform and
 * memory generation straight out of the product title — the same text the slot
 * matcher already uses — and lets those two facts constrain the slots that have
 * to agree with each other.
 *
 * Nothing is guessed here. If a title does not state its platform, it is
 * returned as unknown and the builder stops constraining rather than inventing
 * a fit.
 */

export type PcPlatform =
  | "am4"
  | "am5"
  | "lga1151"
  | "lga1200"
  | "lga1700"
  | "lga1851"
  | "lga2011"
  | "lga2066"
  | "lga1150"
  | "lga1155";
export type MemoryGen = "ddr3" | "ddr4" | "ddr5";

const PLATFORM_TOKENS: [RegExp, PcPlatform][] = [
  [/\bam5\b/, "am5"],
  [/\bam4\b/, "am4"],
  [/\blga[\s-]?1851\b/, "lga1851"],
  [/\blga[\s-]?1700\b/, "lga1700"],
  [/\blga[\s-]?1200\b/, "lga1200"],
  [/\blga[\s-]?1151\b/, "lga1151"],
  [/\blga[\s-]?2011(?:-3)?\b/, "lga2011"],
  [/\blga[\s-]?2066\b/, "lga2066"],
  [/\blga[\s-]?1150\b/, "lga1150"],
  [/\blga[\s-]?1155\b/, "lga1155"],
];

/** Chipsets, in the order they are unambiguous. */
const CHIPSET_PLATFORM: [RegExp, PcPlatform][] = [
  [/\b(z890|b860)\b/, "lga1851"],
  [/\b(h610|h610m|b660|b660m|b760|b760m|h670|z690|z790)\b/, "lga1700"],
  // B650D4U and other server boards carry a suffix after the chipset name, so
  // the boundary must follow the whole model token, not just "b650".
  [/\b(a620|a620m|b650[a-z0-9]*|b850[a-z0-9]*|x670e?|x870e?)\b/, "am5"],
  [/\b(a320|a520|a520m|b350|b450|b450m|b550|b550m|x470|x570)\b/, "am4"],
  [/\b(h410|h510|b460|b560|z490|z590)\b/, "lga1200"],
  [/\b(h110|b250|z370|h310|b360|z390)\b/, "lga1151"],
  // Legacy workstation and desktop sockets. X79 is LGA2011 (DDR3), X99 is
  // LGA2011-3 (DDR4); H61 is LGA1155, not LGA1150.
  [/\b(x99|x79)\b/, "lga2011"],
  [/\bx299\b/, "lga2066"],
  [/\b(h81m?|b85m?|z97[a-z0-9]*)\b/, "lga1150"],
  [/\b(h61m?|p67|z68|b75[a-z0-9]*)\b/, "lga1155"],
];

/**
 * AMD desktop generations, read from the model number. The trailing digits are
 * bounded but letters are not — retail part numbers end in X, XT, G or KF.
 */
const RYZEN_PLATFORM: [RegExp, PcPlatform][] = [
  [/\bryzen\s?[3579]\s?9\d{3}(?![0-9])/, "am5"],
  [/\bryzen\s?[3579]\s?8\d{3}(?![0-9])/, "am5"],
  [/\bryzen\s?[3579]\s?7\d{3}(?![0-9])/, "am5"],
  [/\bryzen\s?[3579]\s?5\d{3}(?![0-9])/, "am4"],
  [/\bryzen\s?[3579]\s?3\d{3}(?![0-9])/, "am4"],
];

/** Intel Core generations, read from the i3/i5/i7/i9 model number. */
const INTEL_PLATFORM: [RegExp, PcPlatform][] = [
  [/\bcore ultra\s?[3579]\s?2\d{2}(?![0-9])/, "lga1851"],
  [/\bi[3579][\s-]?1[234]\d{3}(?![0-9])/, "lga1700"],
  [/\bi[3579][\s-]?1(?:0|1)\d{3}(?![0-9])/, "lga1200"],
  [/\bi[3579][\s-]?[89]\d{3}(?![0-9])/, "lga1151"],
];

export function detectPlatform(text: string): PcPlatform | null {
  const t = text.toLowerCase();
  for (const [re, platform] of PLATFORM_TOKENS) if (re.test(t)) return platform;
  for (const [re, platform] of CHIPSET_PLATFORM) if (re.test(t)) return platform;
  for (const [re, platform] of RYZEN_PLATFORM) if (re.test(t)) return platform;
  for (const [re, platform] of INTEL_PLATFORM) if (re.test(t)) return platform;
  return null;
}

/**
 * Which memory generations a socket can actually take.
 *
 * The memory slot is normally constrained by the board that was picked with it.
 * When no board could be priced, the processor still tells us which generations
 * are possible, so a DDR3 stick cannot be recommended next to an LGA1700 CPU
 * just because the board slot stayed open.
 */
const PLATFORM_MEMORY: Record<PcPlatform, MemoryGen[]> = {
  am4: ["ddr4"],
  am5: ["ddr5"],
  lga1151: ["ddr3", "ddr4"],
  lga1200: ["ddr4"],
  lga1700: ["ddr4", "ddr5"],
  lga1851: ["ddr5"],
  // X79 (LGA2011) is DDR3, X99 (LGA2011-3) is DDR4; the family carries both,
  // and the board's own "DDR4" blurb still decides the RAM slot when present.
  lga2011: ["ddr3", "ddr4"],
  lga2066: ["ddr4"],
  lga1150: ["ddr3"],
  lga1155: ["ddr3"],
};

export function memoryGensForPlatform(platform: PcPlatform | null): MemoryGen[] | null {
  return platform ? PLATFORM_MEMORY[platform] : null;
}

export function detectMemoryGen(text: string): MemoryGen | null {
  const t = text.toLowerCase();
  if (/\bddr5\b/.test(t)) return "ddr5";
  if (/\bddr4\b/.test(t)) return "ddr4";
  if (/\bddr3\b/.test(t)) return "ddr3";
  return null;
}

/**
 * Do these two parts have any business sitting in the same build?
 *
 * Unknown is treated as compatible: the catalogue is built from store titles,
 * and a product that does not say its socket is not evidence that it clashes.
 */
export function platformsCompatible(a: PcPlatform | null, b: PcPlatform | null): boolean {
  if (!a || !b) return true;
  return a === b;
}

export function memoryGensCompatible(a: MemoryGen | null, b: MemoryGen | null): boolean {
  if (!a || !b) return true;
  return a === b;
}

/**
 * Does this processor carry usable built-in graphics?
 *
 * This matters only when a tier cannot afford a discrete card. AMD's "G" chips
 * (Ryzen 3 3200G, Ryzen 5 5600G) ship full Vega silicon and their titles name
 * it; nearly every Intel Core chip carries UHD graphics — except the SKUs whose
 * suffix ends in F (12100F, 14400F), which have it disabled. A title that does
 * not state a model we can read is treated as no coverage, because the builder
 * must never claim a build works when it does not know it does.
 */
export function hasIntegratedGraphics(text: string): boolean {
  const t = text.toLowerCase();
  if (/\bradeon\s?(vega\s?)?\d*\s?graphics\b|\bvega\s?\d\b/i.test(t)) return true;
  if (/\bryzen\s?[3579]\s?\d{3,4}gt?\b/i.test(t)) return true;
  const intel = /\bi([3579])[\s-]?(\d{4,5})([a-z]{0,2})\b/i.exec(t);
  if (intel) return !intel[3].toUpperCase().startsWith("F");
  return /\buhd graphics\b|\bintel hd graphics\b|\biris xe\b|\bcore ultra\b/i.test(t);
}
