/**
 * Product options — colours, sizes, configurations.
 *
 * Stores publish the exact variant a buyer picked on every review, e.g.
 *
 *   "Colour: Black · Size: 16GB+512GB · Configuration: Without Apple Care"
 *
 * We read those strings straight off the store's own product page, so the
 * options we show are the options that actually exist for this product —
 * never a guess, never a generic list.
 */

export interface OptionValue {
  value: string;
  count: number;
}

export interface OptionDimension {
  /** Normalised key: "colour", "size", "styleName", "configuration"… */
  key: string;
  /** Human label: "Colour", "Size", "Style Name", "Configuration" */
  label: string;
  values: OptionValue[];
}

export interface ParsedVariant {
  raw: string;
  parts: Record<string, string>;
}

export interface ProductOptions {
  dimensions: OptionDimension[];
  /** Every distinct variant string we have seen, with the reviews behind it. */
  variants: ParsedVariant[];
  /** How many reviews carried a variant at all. */
  tagged: number;
  /** How many reviews there were in total. */
  total: number;
}

/** The keys stores use, in the order we want to show them. */
const DIMENSION_ORDER = [
  "colour",
  "size",
  "styleName",
  "configuration",
  "capacity",
  "model",
];

const DIMENSION_LABELS: Record<string, string> = {
  colour: "Colour",
  color: "Colour",
  size: "Size",
  styleName: "Style",
  style: "Style",
  configuration: "Configuration",
  capacity: "Capacity",
  model: "Model",
  pattern: "Pattern",
  material: "Material",
  unitCount: "Pack Size",
  scent: "Scent",
  itemPackageQuantity: "Quantity",
};

/** Turn "Style Name" into "styleName" so keys are stable and camel-cased. */
function normaliseKey(raw: string): string {
  const k = raw.trim().toLowerCase();
  const known = DIMENSION_ORDER.find((d) => d.toLowerCase() === k);
  if (known) return known;
  // "item package quantity" -> "itemPackageQuantity"
  return k.replace(/[^a-z0-9]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
}

function labelFor(key: string): string {
  if (DIMENSION_LABELS[key]) return DIMENSION_LABELS[key];
  if (DIMENSION_LABELS[key.toLowerCase()]) return DIMENSION_LABELS[key.toLowerCase()];
  // Fall back to the original casing of the key, split on capitals.
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/** Split one store variant string into its parts. */
export function parseVariant(raw: string): Record<string, string> {
  const parts: Record<string, string> = {};
  if (!raw) return parts;
  for (const chunk of raw.split("·")) {
    const idx = chunk.indexOf(":");
    if (idx < 0) continue;
    const key = normaliseKey(chunk.slice(0, idx));
    const value = chunk.slice(idx + 1).trim();
    if (!key || !value) continue;
    parts[key] = value;
  }
  return parts;
}

/**
 * Build the option matrix for a product from the variants its reviews
 * mention. Dimensions are ordered by how many distinct values they have,
 * with colour and size first — that is the order shoppers scan.
 */
export function buildOptions(
  rows: { variant: string | null }[],
): ProductOptions {
  const total = rows.length;
  const seen = new Map<string, ParsedVariant>();
  const counts = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const raw = (row.variant ?? "").trim();
    if (!raw) continue;
    const parts = parseVariant(raw);
    if (!Object.keys(parts).length) continue;
    if (!seen.has(raw)) seen.set(raw, { raw, parts });
    for (const [k, v] of Object.entries(parts)) {
      let m = counts.get(k);
      if (!m) {
        m = new Map();
        counts.set(k, m);
      }
      m.set(v, (m.get(v) ?? 0) + 1);
    }
  }

  const dimensions: OptionDimension[] = [];
  for (const [key, m] of counts) {
    const values = [...m.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    if (!values.length) continue;
    dimensions.push({ key, label: labelFor(key), values });
  }

  dimensions.sort((a, b) => {
    const ai = DIMENSION_ORDER.indexOf(a.key);
    const bi = DIMENSION_ORDER.indexOf(b.key);
    const ao = ai === -1 ? DIMENSION_ORDER.length : ai;
    const bo = bi === -1 ? DIMENSION_ORDER.length : bi;
    if (ao !== bo) return ao - bo;
    return b.values.length - a.values.length;
  });

  return {
    dimensions,
    variants: [...seen.values()],
    tagged: seen.size,
    total,
  };
}

/** Does this review match the chosen option? */
export function variantMatches(
  variant: string | null,
  filter: { key: string; value: string } | null,
): boolean {
  if (!filter) return true;
  if (!variant) return false;
  const parts = parseVariant(variant);
  return parts[filter.key] === filter.value;
}
