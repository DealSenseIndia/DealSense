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

export type PcPlatform = "am4" | "am5" | "lga1151" | "lga1200" | "lga1700" | "lga1851";
export type MemoryGen = "ddr3" | "ddr4" | "ddr5";

const PLATFORM_TOKENS: [RegExp, PcPlatform][] = [
  [/\bam5\b/, "am5"],
  [/\bam4\b/, "am4"],
  [/\blga[\s-]?1851\b/, "lga1851"],
  [/\blga[\s-]?1700\b/, "lga1700"],
  [/\blga[\s-]?1200\b/, "lga1200"],
  [/\blga[\s-]?1151\b/, "lga1151"],
];

/** Chipsets, in the order they are unambiguous. */
const CHIPSET_PLATFORM: [RegExp, PcPlatform][] = [
  [/\b(z890|b860)\b/, "lga1851"],
  [/\b(h610|h610m|b660|b660m|b760|b760m|h670|z690|z790)\b/, "lga1700"],
  [/\b(a620|a620m|b650|b650m|b850|b850m|x670|x670e|x870|x870e)\b/, "am5"],
  [/\b(a320|a520|a520m|b350|b450|b450m|b550|b550m|x470|x570)\b/, "am4"],
  [/\b(h410|h510|b460|b560|z490|z590)\b/, "lga1200"],
  [/\b(h110|b250|z370|h310|b360|z390)\b/, "lga1151"],
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
