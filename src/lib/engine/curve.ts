/**
 * A monotone cubic curve through a series of points.
 *
 * The recorded price history is lumpy — one day ₹96,999, the next ₹89,873 —
 * and joining those with straight lines turns the chart into a picket fence.
 * A monotone cubic spline keeps the shape (it never invents a high or a low
 * that is not in the data) while reading as one smooth price curve.
 *
 * Fritsch–Carlson tangents, the same method d3 uses for `curveMonotoneX`.
 */

export interface CurvePoint {
  x: number;
  y: number;
}

export interface CurveSegment {
  /** The `d` for this one piece of the curve, ready to draw on its own. */
  d: string;
  /** Just the curve command, so the pieces can be joined into one path. */
  c: string;
  /** The point it starts at. */
  from: CurvePoint;
  /** The point it ends at. */
  to: CurvePoint;
}

/** The whole curve as one path, starting with a move. */
export function curvePath(segments: CurveSegment[], first: CurvePoint): string {
  if (!segments.length) return "";
  return `M ${first.x.toFixed(1)},${first.y.toFixed(1)} ${segments.map((s) => s.c).join(" ")}`;
}

/**
 * Split a curve into one segment per pair of points, so each piece can be
 * drawn in its own colour.
 */
export function monotoneSegments(points: CurvePoint[]): CurveSegment[] {
  const n = points.length;
  if (n < 2) return [];

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i];
  }

  // Tangents.
  const t: number[] = new Array(n);
  t[0] = slope[0];
  t[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      t[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }

  // Fritsch–Carlson: keep the curve from overshooting the data.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / slope[i];
    const b = t[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * slope[i];
      t[i + 1] = k * b * slope[i];
    }
  }

  const out: CurveSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = dx[i] / 3;
    const c1 = { x: p0.x + h, y: p0.y + t[i] * h };
    const c2 = { x: p1.x - h, y: p1.y - t[i + 1] * h };
    const c = `C ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    out.push({
      d: `M ${p0.x.toFixed(1)},${p0.y.toFixed(1)} ${c}`,
      c,
      from: p0,
      to: p1,
    });
  }
  return out;
}
