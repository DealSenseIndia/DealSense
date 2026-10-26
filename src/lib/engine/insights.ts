import type { PricePoint } from "../types";

/* ==================================================================
   DealSense analysis.

   Everything here is derived from the price points we actually recorded.
   Nothing is invented, and when the record is too thin we say so instead
   of guessing.
   ================================================================== */

export interface DealEvent {
  kind:
    | "LAUNCH"
    | "FESTIVAL"
    | "BIG_BILLION"
    | "REPUBLIC_DAY"
    | "SUMMER_SALE"
    | "PRIME_DAY"
    | "PRICE_HIKE"
    | "BIGGEST_DROP"
    | "LOWEST"
    | "HIGHEST";
  label: string;
  price: number;
  at: number;
  /** 0 green, 1 red, 2 blue, 3 amber, 4 steel */
  tone: 0 | 1 | 2 | 3 | 4;
}

export interface PriceForecast {
  predicted: number;
  horizonDays: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** How many past times the price sat at this level. */
  samples: number;
  /** How often the price fell over the horizon when it was here before. */
  fellRate: number;
  basis: string;
}

export interface IntensityBucket {
  from: number;
  to: number;
  drops: number;
  level: "LOW" | "MEDIUM" | "HIGH";
}

export interface PriceInsights {
  highest: { price: number; at: number } | null;
  lowest: { price: number; at: number } | null;
  average: number | null;
  median: number | null;
  /** Drop from the highest price we ever saw. */
  dropFromHighPct: number | null;
  dropFromHighAmount: number | null;
  /** Drop from the peak in the last 12 months. */
  dropFromYearHighPct: number | null;
}

export interface AnalysisBullet {
  text: string;
  kind: "GOOD" | "WARN" | "INFO";
}

export interface PriceAnalysis {
  events: DealEvent[];
  forecast: PriceForecast | null;
  intensity: IntensityBucket[];
  insights: PriceInsights;
  bullets: AnalysisBullet[];
  /** Days the price has been falling or rising, signed. */
  trendDays: number;
  /** What we think the shopper should do. */
  recommendation: "BUY" | "WAIT" | "AVOID";
  headline: string;
  sub: string;
}

const DAY = 86400000;

/** Indian sale windows we can actually see in the data. */
const SALE_WINDOWS: {
  from: [number, number];
  to: [number, number];
  kind: DealEvent["kind"];
  label: string;
  tone: 0 | 1 | 2 | 3;
}[] = [
  { from: [9, 25], to: [10, 15], kind: "BIG_BILLION", label: "Big Billion Days", tone: 2 },
  { from: [10, 15], to: [11, 15], kind: "FESTIVAL", label: "Great Indian Festival", tone: 1 },
  { from: [11, 15], to: [11, 30], kind: "BIG_BILLION", label: "Big Billion Days", tone: 2 },
  { from: [0, 3], to: [0, 27], kind: "REPUBLIC_DAY", label: "Republic Day Sale", tone: 0 },
  { from: [4, 5], to: [5, 31], kind: "SUMMER_SALE", label: "Summer Sale", tone: 1 },
  { from: [6, 3], to: [7, 31], kind: "PRIME_DAY", label: "Prime Day", tone: 2 },
];

function saleFor(d: Date): { kind: DealEvent["kind"]; label: string; tone: 0 | 1 | 2 | 3 } | null {
  const m = d.getMonth();
  const day = d.getDate();
  for (const w of SALE_WINDOWS) {
    const [fm, fd] = w.from;
    const [tm, td] = w.to;
    const after = m > fm || (m === fm && day >= fd);
    const before = m < tm || (m === tm && day <= td);
    if (after && before) return { kind: w.kind, label: w.label, tone: w.tone };
  }
  return null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Events we can prove from the series. */
export function findEvents(points: PricePoint[]): DealEvent[] {
  if (points.length < 2) return [];
  const events: DealEvent[] = [];

  const first = points[0];
  const last = points[points.length - 1];

  // Launch price — the very first thing we recorded.
  events.push({
    kind: "LAUNCH",
    label: "Launch Price",
    price: first.price,
    at: first.t,
    tone: 4,
  });

  // Lowest and highest ever.
  let lowP = points[0];
  let highP = points[0];
  for (const p of points) {
    if (p.price < lowP.price) lowP = p;
    if (p.price > highP.price) highP = p;
  }
  events.push({ kind: "LOWEST", label: "Lowest Price Ever", price: lowP.price, at: lowP.t, tone: 0 });

  // The biggest single fall and the biggest single climb.
  let biggestDrop: { price: number; at: number } | null = null;
  let biggestRise: { price: number; at: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].price;
    const b = points[i].price;
    if (b < a && (!biggestDrop || a - b > biggestDrop.price - biggestDrop.price)) {
      biggestDrop = { price: b, at: points[i].t };
    }
    if (b > a && (!biggestRise || b - a > biggestRise.price - biggestRise.price)) {
      biggestRise = { price: b, at: points[i].t };
    }
  }
  if (biggestDrop) {
    events.push({
      kind: "BIGGEST_DROP",
      label: "Biggest Drop",
      price: biggestDrop.price,
      at: biggestDrop.at,
      tone: 0,
    });
  }
  if (biggestRise && points.length > 4) {
    events.push({
      kind: "PRICE_HIKE",
      label: "Price Increased",
      price: biggestRise.price,
      at: biggestRise.at,
      tone: 3,
    });
  }

  // Sale dips — a local minimum that sits inside a known sale window.
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].price;
    const cur = points[i].price;
    const next = points[i + 1].price;
    if (!(cur < prev && cur <= next)) continue;
    const drop = prev > 0 ? (prev - cur) / prev : 0;
    if (drop < 0.015) continue; // not a real dip
    const sale = saleFor(new Date(points[i].t));
    if (!sale) continue;
    if (events.some((e) => e.kind === sale.kind && Math.abs(e.at - points[i].t) < 20 * DAY)) continue;
    events.push({
      kind: sale.kind,
      label: sale.label,
      price: cur,
      at: points[i].t,
      tone: sale.tone,
    });
  }

  return events.sort((a, b) => a.at - b.at);
}

/**
 * What the price tends to do over the next 30 days from here.
 *
 * We look for every past moment the price sat within 5% of today's price and
 * see what it did 30 days later. The median of those outcomes is the
 * forecast. If there are not enough past moments we do not forecast at all.
 */
export function forecastNext(
  points: PricePoint[],
  current: number | null,
  horizonDays = 30,
): PriceForecast | null {
  if (!current || points.length < 20) return null;

  const window = horizonDays * DAY;
  const band = current * 0.05;

  const outcomes: number[] = [];
  let fell = 0;

  for (let i = 0; i < points.length; i++) {
    if (Math.abs(points[i].price - current) / current > 0.05) continue;
    const j = points.findIndex((p) => p.t >= points[i].t + window);
    if (j < 0) continue;
    outcomes.push(points[j].price);
    if (points[j].price < current) fell++;
  }

  if (outcomes.length < 3) return null;

  const predicted = median(outcomes);
  const fellRate = Math.round((fell / outcomes.length) * 100);

  return {
    predicted: Math.round(predicted),
    horizonDays,
    confidence: outcomes.length >= 8 ? "HIGH" : outcomes.length >= 5 ? "MEDIUM" : "LOW",
    samples: outcomes.length,
    fellRate,
    basis: `${outcomes.length} past times the price sat within 5% of today`,
  };
}

/** How busy each stretch of the record was — how often the price fell. */
export function dealIntensity(points: PricePoint[], buckets = 36): IntensityBucket[] {
  if (points.length < 4) return [];

  // Every bucket needs at least two points, or we cannot count a fall in it.
  const count = Math.max(1, Math.min(buckets, Math.floor(points.length / 2)));
  const size = Math.max(2, Math.floor(points.length / count));

  const out: IntensityBucket[] = [];

  for (let start = 0; start < points.length - 1; start += size) {
    const slice = points.slice(start, start + size);
    if (slice.length < 2) continue;
    let drops = 0;
    for (let i = 1; i < slice.length; i++) {
      if (slice[i].price < slice[i - 1].price) drops++;
    }
    out.push({ from: slice[0].t, to: slice[slice.length - 1].t, drops, level: "LOW" });
  }

  if (!out.length) return [];

  const max = Math.max(1, ...out.map((b) => b.drops));
  for (const b of out) {
    const r = b.drops / max;
    b.level = r <= 0.33 ? "LOW" : r <= 0.66 ? "MEDIUM" : "HIGH";
  }
  return out;
}

/** The four numbers people actually want out of a price history. */
export function priceInsights(points: PricePoint[]): PriceInsights {
  if (!points.length) {
    return {
      highest: null,
      lowest: null,
      average: null,
      median: null,
      dropFromHighPct: null,
      dropFromHighAmount: null,
      dropFromYearHighPct: null,
    };
  }

  const prices = points.map((p) => p.price);
  let high = points[0];
  let low = points[0];
  for (const p of points) {
    if (p.price > high.price) high = p;
    if (p.price < low.price) low = p;
  }

  const yearAgo = Date.now() - 365 * DAY;
  const lastYear = points.filter((p) => p.t >= yearAgo);
  let yearHigh = lastYear[0] ?? high;
  for (const p of lastYear) if (p.price > yearHigh.price) yearHigh = p;

  const average = prices.reduce((a, b) => a + b, 0) / prices.length;
  const current = points[points.length - 1].price;

  return {
    highest: { price: high.price, at: high.t },
    lowest: { price: low.price, at: low.t },
    average: Math.round(average),
    median: Math.round(median(prices)),
    dropFromHighPct: high.price > 0 ? Math.round(((high.price - current) / high.price) * 100) : null,
    dropFromHighAmount: Math.round(high.price - current),
    dropFromYearHighPct:
      lastYear.length > 1 && yearHigh.price > 0
        ? Math.round(((yearHigh.price - current) / yearHigh.price) * 100)
        : null,
  };
}

/** How many days in a row the price has been moving one way. */
export function trendDays(points: PricePoint[]): number {
  if (points.length < 2) return 0;
  let dir = 0;
  let count = 0;
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1].price;
    const b = points[i].price;
    const d = b > a ? 1 : b < a ? -1 : 0;
    if (d === 0) break;
    if (dir === 0) dir = d;
    else if (d !== dir) break;
    count++;
  }
  return dir * count;
}

/**
 * Plain-English findings, each one backed by a number from the record.
 */
export function analysisBullets(input: {
  points: PricePoint[];
  current: number | null;
  insights: PriceInsights;
  forecast: PriceForecast | null;
  events: DealEvent[];
  score: number | null;
  confidence: string;
}): AnalysisBullet[] {
  const { points, current, insights, forecast, events, score, confidence } = input;
  const bullets: AnalysisBullet[] = [];
  if (!current || !points.length) return bullets;

  // Against the 3-month average.
  const threeMonths = points.filter((p) => p.t >= Date.now() - 90 * DAY);
  if (threeMonths.length > 3) {
    const avg =
      threeMonths.reduce((s, p) => s + p.price, 0) / threeMonths.length;
    const diff = ((current - avg) / avg) * 100;
    if (Math.abs(diff) >= 1) {
      bullets.push({
        text: `Current price is ${Math.abs(diff).toFixed(0)}% ${diff < 0 ? "below" : "above"} the 3-month average of ${formatShort(avg)}`,
        kind: diff < 0 ? "GOOD" : "WARN",
      });
    }
  }

  // How close to the yearly low.
  const yearAgo = Date.now() - 365 * DAY;
  const lastYear = points.filter((p) => p.t >= yearAgo);
  if (lastYear.length > 3) {
    const yLow = Math.min(...lastYear.map((p) => p.price));
    const gap = ((current - yLow) / yLow) * 100;
    if (gap <= 12) {
      bullets.push({
        text: `Within ${gap.toFixed(0)}% of the lowest price in the last year (${formatShort(yLow)})`,
        kind: "GOOD",
      });
    } else {
      bullets.push({
        text: `${gap.toFixed(0)}% above the lowest price in the last year (${formatShort(yLow)})`,
        kind: "INFO",
      });
    }
  }

  // Do prices climb back up after a sale? Only claim it if the record shows it.
  const saleEvents = events.filter((e) =>
    ["FESTIVAL", "BIG_BILLION", "REPUBLIC_DAY", "SUMMER_SALE", "PRIME_DAY"].includes(
      e.kind,
    ),
  );
  if (saleEvents.length >= 2) {
    let rose = 0;
    for (const ev of saleEvents) {
      const after = points.filter((p) => p.t > ev.at && p.t <= ev.at + 30 * DAY);
      if (!after.length) continue;
      const maxAfter = Math.max(...after.map((p) => p.price));
      if (maxAfter > ev.price * 1.02) rose++;
    }
    if (rose >= 2) {
      bullets.push({
        text: `Prices usually climb back up after ${saleEvents[0].label} — we saw it in ${rose} of the last ${saleEvents.length} sale${saleEvents.length === 1 ? "" : "s"}`,
        kind: "WARN",
      });
    }
  }

  // The forecast.
  if (forecast) {
    if (forecast.predicted < current) {
      bullets.push({
        text: `Price could fall to about ${formatShort(forecast.predicted)} in the next ${forecast.horizonDays} days — it fell ${forecast.fellRate}% of the time from this level before`,
        kind: forecast.fellRate >= 60 ? "GOOD" : "INFO",
      });
    } else {
      bullets.push({
        text: `History suggests it holds around ${formatShort(forecast.predicted)} over the next ${forecast.horizonDays} days`,
        kind: "INFO",
      });
    }
  }

  // The trend.
  const trend = trendDays(points);
  if (Math.abs(trend) >= 3) {
    bullets.push({
      text: `The price has ${trend > 0 ? "risen" : "fallen"} on ${Math.abs(trend)} of the last ${Math.abs(trend)} days`,
      kind: trend > 0 ? "WARN" : "GOOD",
    });
  }

  // Honesty about the record itself.
  bullets.push({
    text: `Based on ${points.length} recorded price points${
      confidence ? ` · ${confidence.toLowerCase()} confidence` : ""
    }`,
    kind: "INFO",
  });

  if (score !== null) {
    bullets.push({
      text: `DealSense score ${Math.round(score)} out of 100`,
      kind: score >= 70 ? "GOOD" : score >= 50 ? "INFO" : "WARN",
    });
  }

  return bullets;
}

/** What the shopper should do, in one line. */
export function recommendation(
  score: number | null,
  verdict: string | null,
  bullets: AnalysisBullet[],
  forecast: PriceForecast | null,
  current: number | null,
): { recommendation: "BUY" | "WAIT" | "AVOID"; headline: string; sub: string } {
  const s = score ?? 0;
  const belowAvg = bullets.find((b) => b.text.includes("below the 3-month average"));
  const nearLow = bullets.find((b) => b.text.startsWith("Within"));
  const drop = bullets.find((b) => b.text.startsWith("Price could fall"));

  if (verdict === "BUY" || s >= 75) {
    const bits: string[] = [];
    if (belowAvg) bits.push(belowAvg.text.replace("Current price is ", "").replace(/^./, (c) => c.toLowerCase()));
    if (nearLow) bits.push(nearLow.text.toLowerCase());
    return {
      recommendation: "BUY",
      headline: "Buy Now",
      sub: bits.length
        ? `Great price — ${bits.join(", and ")}.`
        : "Great price. It is below the average we have recorded for this product.",
    };
  }

  if (verdict === "AVOID" || s < 40) {
    return {
      recommendation: "AVOID",
      headline: "Skip It",
      sub: "The price is well above what this product usually costs. We would wait.",
    };
  }

  const forecastNote = drop
    ? ` ${drop.text.replace("Price could fall to about", "We think it could reach")}.`
    : forecast && forecast.predicted < (current ?? 0)
      ? ` We think it could reach ${formatShort(forecast.predicted)}.`
      : "";

  return {
    recommendation: "WAIT",
    headline: "Hold Off",
    sub: `It is not a deal yet.${forecastNote} Set a price alert and we will tell you when it drops.`,
  };
}

function formatShort(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(n >= 10000 ? 1 : 2)}K`;
  return `₹${Math.round(n)}`;
}
