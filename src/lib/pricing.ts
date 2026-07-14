import type { Product } from '../types';

export interface EffectivePrice {
  /** The product's list price, before any discount. */
  list: number;
  /** What the shopper actually pays for one unit, before option surcharges. */
  final: number;
  isDiscounted: boolean;
  /** Rounded percentage off, for the badge. 0 when not discounted. */
  percentOff: number;
  label?: string;
}

/** Resolve a product's discount into the price actually charged.
 *
 *  Every price the shopper sees or pays must come through here — the storefront
 *  stacks length/branding surcharges on top of `final`, never on top of `list`.
 *  Firestore values are untrusted (an admin typo, a hand-edited doc), so a
 *  malformed discount degrades to "no discount" rather than producing a NaN
 *  or negative order total. */
export function effectivePrice(p: Pick<Product, 'price' | 'discount'>): EffectivePrice {
  const list = Number(p.price) || 0;
  const none: EffectivePrice = { list, final: list, isDiscounted: false, percentOff: 0 };

  const d = p.discount;
  if (!d || !d.isActive) return none;

  const value = Number(d.value);
  if (!Number.isFinite(value) || value <= 0) return none;

  const final = d.type === 'percent'
    ? list * (1 - Math.min(value, 99) / 100)
    : Math.max(0, list - value);

  // A discount that saves nothing is not a discount — don't strike through an unchanged price.
  if (final >= list) return none;

  return {
    list,
    final: Math.round(final * 100) / 100,
    isDiscounted: true,
    percentOff: list > 0 ? Math.round((1 - final / list) * 100) : 0,
    ...(d.label && { label: d.label }),
  };
}
