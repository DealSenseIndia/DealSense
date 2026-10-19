import type { BankOffer, LandedPrice } from "../types";
import { offersFor, offerDiscount } from "./bankOffers";
import type { Merchant as M } from "../config";

export interface LandedInput {
  base: number;
  shipping?: number | null;
  coupon?: number | null;
  merchant: M;
  selectedOfferId?: string | null;
  autoBestOffer?: boolean;
}

/**
 * True landed (out-of-pocket) price:
 *   base + shipping − coupon − bank card discount
 * Only real, known inputs are used. Nothing is invented.
 */
export function computeLandedPrice(input: LandedInput): LandedPrice {
  const base = Math.max(input.base, 0);
  const shipping = Math.max(input.shipping ?? 0, 0);
  const coupon = Math.min(Math.max(input.coupon ?? 0, 0), base);

  let offer: BankOffer | null = null;
  if (input.selectedOfferId) {
    offer = offersFor(input.merchant).find((o) => o.id === input.selectedOfferId) ?? null;
  } else if (input.autoBestOffer !== false) {
    const best = offersFor(input.merchant)
      .map((o) => ({ o, d: offerDiscount(o, base) }))
      .sort((a, b) => b.d - a.d)[0];
    offer = best && best.d > 0 ? best.o : null;
  }
  const bankDiscount = offer ? offerDiscount(offer, base) : 0;

  const effective = Math.max(base + shipping - coupon - bankDiscount, 0);

  const breakdown: LandedPrice["breakdown"] = [{ label: "Base price", amount: base }];
  if (shipping > 0) breakdown.push({ label: "Delivery", amount: shipping });
  if (coupon > 0) breakdown.push({ label: "Coupon", amount: -coupon });
  if (bankDiscount > 0) {
    breakdown.push({
      label: "Card offer",
      amount: -bankDiscount,
      note: offer ? `${offer.bank} · ${offer.label}` : undefined,
    });
  }

  return {
    base,
    shipping,
    coupon,
    bankDiscount,
    effective,
    savings: base - effective,
    breakdown,
  };
}
