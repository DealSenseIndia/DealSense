import type { BankOffer, Merchant } from "../types";
import type { Merchant as M } from "../config";

/**
 * Realistic Indian card offers. DealSense surfaces these as *potential*
 * savings on the landed price — clearly labelled, never guaranteed.
 */
export const BANK_OFFERS: BankOffer[] = [
  {
    id: "amazon-icici",
    bank: "ICICI",
    merchant: "amazon",
    card: "Amazon Pay ICICI Credit Card",
    label: "5% cashback (Prime)",
    rate: 0.05,
    cap: 100000,
    minSpend: 0,
  },
  {
    id: "amazon-sbi",
    bank: "SBI",
    merchant: "amazon",
    card: "SBI Credit Card",
    label: "10% instant discount",
    rate: 0.1,
    cap: 1500,
    minSpend: 5000,
  },
  {
    id: "amazon-hdfc",
    bank: "HDFC",
    merchant: "amazon",
    card: "HDFC Bank Credit Card",
    label: "10% instant discount",
    rate: 0.1,
    cap: 1500,
    minSpend: 5000,
  },
  {
    id: "amazon-axis",
    bank: "Axis",
    merchant: "amazon",
    card: "Axis Bank Credit Card",
    label: "10% instant discount",
    rate: 0.1,
    cap: 1250,
    minSpend: 5000,
  },
  {
    id: "fk-axis",
    bank: "Axis",
    merchant: "flipkart",
    card: "Flipkart Axis Bank Credit Card",
    label: "5% unlimited cashback",
    rate: 0.05,
    cap: 100000,
    minSpend: 0,
  },
  {
    id: "fk-hdfc",
    bank: "HDFC",
    merchant: "flipkart",
    card: "HDFC Bank Credit Card",
    label: "10% instant discount",
    rate: 0.1,
    cap: 1500,
    minSpend: 5000,
  },
  {
    id: "fk-kotak",
    bank: "Kotak",
    merchant: "flipkart",
    card: "Kotak Credit Card",
    label: "10% instant discount",
    rate: 0.1,
    cap: 1250,
    minSpend: 5000,
  },
  {
    id: "fk-sbi",
    bank: "SBI",
    merchant: "flipkart",
    card: "SBI Credit Card",
    label: "10% instant discount",
    rate: 0.1,
    cap: 1500,
    minSpend: 5000,
  },
];

export function offersFor(merchant: M): BankOffer[] {
  return BANK_OFFERS.filter((o) => o.merchant === merchant || o.merchant === "any");
}

export function offerDiscount(offer: BankOffer, base: number): number {
  if (base < offer.minSpend) return 0;
  return Math.min(base * offer.rate, offer.cap);
}

export function bestOffer(merchant: M, base: number): { offer: BankOffer; discount: number } | null {
  const list = offersFor(merchant)
    .map((offer) => ({ offer, discount: offerDiscount(offer, base) }))
    .filter((x) => x.discount > 0)
    .sort((a, b) => b.discount - a.discount);
  return list[0] ?? null;
}

export type { Merchant };
