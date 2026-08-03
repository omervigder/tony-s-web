import type { CartItem, Coupon, Product, SelectedOptions, Settings } from '../types';
import { effectivePrice } from './pricing';

/** Every ₪ figure the shopper sees or pays is produced here.
 *
 *  This module is deliberately pure — no React, no Firestore. The cart context
 *  owns the state, this owns the arithmetic, so the rules (coupon, free
 *  shipping, threshold gift) can be reasoned about and reused server-side.
 *
 *  Firestore values are untrusted: settings are admin-typed strings and coupons
 *  can be hand-edited in the console, so every number is coerced defensively and
 *  a malformed rule degrades to "rule off" rather than to NaN in an order total. */

/** ₪ rounding — kills float dust (0.1+0.2) before it reaches an order total. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Coerce an untrusted Firestore value to a non-negative number. */
export const money = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/* ────────────────────────────── Cart lines ─────────────────────────────── */

/** Identity of a cart line: the same product with different options is a different line. */
export type CartLine = Pick<CartItem, 'id' | 'selectedVariations' | 'selectedColor' | 'selectedLength' | 'selectedBranding' | 'brandingText' | 'embroideryFirstName' | 'embroideryLastName'>;

export const getCartKey = (item: CartLine) =>
  `${item.id}|${JSON.stringify({
    v: item.selectedVariations ?? null,
    c: item.selectedColor?.name ?? null,
    l: item.selectedLength?.label ?? null,
    b: item.selectedBranding?.id ?? null,
    // Two of the same box branded with different names are two different lines.
    bt: item.brandingText ?? null,
    // Same reasoning: two towels embroidered with different names are two lines.
    ef: item.embroideryFirstName?.text ?? null,
    el: item.embroideryLastName?.text ?? null,
  })}`;

/** Price of one unit, including length and branding surcharges.
 *  The `?? price` fallback covers carts persisted to localStorage before options shipped. */
export const unitPriceOf = (item: Pick<CartItem, 'price' | 'unitPrice'>) => money(item.unitPrice ?? item.price);

/** Surcharges stack on the *discounted* base — a sale price is the price we build from. */
export const priceWithOptions = (product: Product, opts: SelectedOptions) =>
  round2(
    effectivePrice(product).final
    + (opts.selectedLength?.priceDelta ?? 0)
    + (opts.selectedBranding?.extraCost ?? 0)
    + (opts.embroideryFirstName?.price ?? 0)
    + (opts.embroideryLastName?.price ?? 0)
  );

/** The ₪ a product asks for embroidering one half of a name. 0 when not offered —
 *  the product document is admin-typed, so `enabled` is checked, not assumed. */
export const embroideryPrice = (opt: { enabled?: boolean; price?: number } | undefined) =>
  opt?.enabled === true ? money(opt.price) : 0;

export const cartSubtotal = (cart: CartItem[]) =>
  round2(cart.reduce((sum, item) => sum + unitPriceOf(item) * (Number(item.quantity) || 0), 0));

/* ──────────────────────────── Store-wide rules ─────────────────────────── */

/** `settings/store`, parsed into the numbers and flags the cart actually uses. */
export interface StoreRules {
  deliveryCost: number;
  printedCardPrice: number;
  freeShippingEnabled: boolean;
  freeShippingThreshold: number;
  giftEnabled: boolean;
  giftThreshold: number;
  giftProductId: string;
  giftName: string;
  minOrderAmount: number;
  couponsEnabled: boolean;
}

export const DEFAULT_PRINTED_CARD_PRICE = 15;

export function readStoreRules(s: Settings | null | undefined): StoreRules {
  const settings = s ?? ({} as Settings);
  const freeShippingThreshold = money(settings.free_shipping_threshold);
  const giftThreshold = money(settings.gift_threshold);
  return {
    deliveryCost: money(settings.delivery_cost),
    printedCardPrice: money(settings.printed_card_price, DEFAULT_PRINTED_CARD_PRICE),
    // A threshold of 0 would make everything free — treat it as "not configured".
    freeShippingEnabled: settings.free_shipping_enabled === true && freeShippingThreshold > 0,
    freeShippingThreshold,
    giftEnabled: settings.gift_enabled === true && giftThreshold > 0,
    giftThreshold,
    giftProductId: settings.gift_product_id ?? '',
    giftName: settings.gift_name ?? '',
    minOrderAmount: money(settings.min_order_amount),
    // Absent means enabled — the switch only ever turns the box off.
    couponsEnabled: settings.coupons_enabled !== false,
  };
}

/* ─────────────────────────────── Coupons ───────────────────────────────── */

export type CouponRejection =
  | 'not_found' | 'inactive' | 'expired' | 'exhausted' | 'min_order' | 'error';

/** Not a discriminated union on purpose — this project compiles without
 *  `strictNullChecks`, so TypeScript would not narrow one. */
export interface CouponCheck {
  ok: boolean;
  reason?: CouponRejection;
  /** Set alongside `reason: 'min_order'`, for the "valid over ₪X" message. */
  minOrderAmount?: number;
}

/** Expiry is a date, not an instant: a code dated today is good until midnight.
 *  (A bare `new Date('2026-07-29')` is UTC midnight, which expires the code the
 *  moment the day starts — hence the explicit end-of-day.) */
function expiresAt(expiryDate: string): Date | null {
  if (!expiryDate) return null;
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ? `${expiryDate}T23:59:59` : expiryDate;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Is this coupon usable for a cart of `subtotal`? Pure — no I/O. */
export function validateCoupon(coupon: Coupon | null | undefined, subtotal: number, now: Date = new Date()): CouponCheck {
  if (!coupon) return { ok: false, reason: 'not_found' };
  if (!coupon.isActive) return { ok: false, reason: 'inactive' };

  const end = expiresAt(coupon.expiryDate);
  if (end && end < now) return { ok: false, reason: 'expired' };

  const limit = money(coupon.usageLimit);
  if (limit > 0 && money(coupon.usageCount) >= limit) return { ok: false, reason: 'exhausted' };

  const min = money(coupon.minOrderAmount);
  if (min > 0 && subtotal < min) return { ok: false, reason: 'min_order', minOrderAmount: min };

  return { ok: true };
}

/** The ₪ a coupon takes off `subtotal`. Never exceeds the subtotal — shipping and
 *  the greeting card are charged on top and are not discountable. */
export function couponDiscount(coupon: Coupon | null | undefined, subtotal: number): number {
  if (!coupon) return 0;
  const value = money(coupon.value);
  if (value <= 0) return 0;

  if (coupon.type === 'percent') {
    const raw = subtotal * Math.min(value, 100) / 100;
    const cap = money(coupon.maxDiscount);
    return round2(Math.min(cap > 0 ? Math.min(raw, cap) : raw, subtotal));
  }
  return round2(Math.min(value, subtotal));
}

/** Hebrew copy for a rejected code — the storefront never invents its own wording. */
export function couponRejectionMessage(check: CouponCheck): string {
  if (check.ok) return '';
  switch (check.reason) {
    case 'not_found': return 'קוד קופון לא קיים';
    case 'inactive':  return 'קוד קופון אינו פעיל';
    case 'expired':   return 'קוד הקופון פג תוקף';
    case 'exhausted': return 'קוד הקופון מוצה';
    case 'min_order': return `הקופון תקף בהזמנה מעל ₪${check.minOrderAmount}`;
    default:          return 'שגיאה בבדיקת הקופון';
  }
}

/* ──────────────────────────────── Totals ───────────────────────────────── */

/** The free item a threshold triggered. */
export interface GiftLine {
  id: string;
  name: string;
  imageUrl?: string;
  /** Carried into the order so profit analytics still sees what the gift cost us. */
  costPrice: number;
}

export interface CartTotals {
  /** Goods only, before anything else. */
  subtotal: number;
  discountAmount: number;
  /** `subtotal - discountAmount` — what the threshold rules are measured against. */
  discountedSubtotal: number;
  /** The delivery fee before the free-shipping rules ran (0 on pickup). */
  shippingBase: number;
  shippingCost: number;
  /** The cart has cleared the free-shipping threshold. True even on pickup, where
   *  there is no fee to waive — this is "the shopper earned it", not "it applied". */
  freeShippingEarned: boolean;
  freeShipping: boolean;
  /** Why shipping is free — drives the wording in the cart. */
  freeShippingReason: 'threshold' | 'coupon' | null;
  /** ₪ still needed to earn free shipping, or null when the rule can't apply. */
  amountToFreeShipping: number | null;
  gift: GiftLine | null;
  /** ₪ still needed to earn the gift, or null when the rule is off. */
  amountToGift: number | null;
  cardCost: number;
  total: number;
  /** False while the cart is below the configured minimum order. */
  meetsMinimum: boolean;
  minOrderAmount: number;
  rules: StoreRules;
}

export interface TotalsInput {
  cart: CartItem[];
  settings: Settings | null | undefined;
  coupon: Coupon | null;
  deliveryMethod: 'pickup' | 'delivery';
  /** The product configured as the threshold gift, already resolved from the catalog. */
  giftProduct: Product | null;
  /** True when the shopper opted into the printed greeting card. */
  cardCharged: boolean;
}

/** The single place a cart turns into money. Everything downstream — the cart
 *  drawer, the checkout summary, the order document — reads this one result, so
 *  the customer can never be shown a total the order was not written with. */
export function computeTotals(input: TotalsInput): CartTotals {
  const { cart, settings, coupon, deliveryMethod, giftProduct, cardCharged } = input;
  const rules = readStoreRules(settings);

  const subtotal = cartSubtotal(cart);
  // An applied coupon that no longer qualifies discounts nothing — the context
  // drops it from the UI, but the arithmetic must not depend on that having run.
  const couponValid = coupon ? validateCoupon(coupon, subtotal).ok : false;
  const discountAmount = couponValid ? couponDiscount(coupon, subtotal) : 0;
  const discountedSubtotal = round2(subtotal - discountAmount);

  // Thresholds are measured on what the customer actually pays for goods, so a
  // coupon can drop an order back below the free-shipping line.
  // An empty cart owes nothing — someone opening /checkout directly must not be
  // shown a delivery fee for goods they have not chosen.
  const shippingBase = deliveryMethod === 'delivery' && cart.length > 0 ? rules.deliveryCost : 0;
  const earnedFreeShipping = rules.freeShippingEnabled && discountedSubtotal >= rules.freeShippingThreshold;
  const couponFreeShipping = couponValid && coupon?.freeShipping === true;
  const freeShipping = shippingBase > 0 && (earnedFreeShipping || couponFreeShipping);
  const freeShippingReason: CartTotals['freeShippingReason'] =
    !freeShipping ? null : earnedFreeShipping ? 'threshold' : 'coupon';

  const amountToFreeShipping = rules.freeShippingEnabled && !earnedFreeShipping && cart.length > 0
    ? round2(Math.max(0, rules.freeShippingThreshold - discountedSubtotal))
    : null;

  const giftEarned = rules.giftEnabled && discountedSubtotal >= rules.giftThreshold;
  const gift: GiftLine | null = giftEarned
    ? giftProduct
      ? {
          id: giftProduct.id,
          name: giftProduct.name,
          ...(giftProduct.main_image && { imageUrl: giftProduct.main_image }),
          costPrice: money(giftProduct.costPrice),
        }
      // The admin can promise a gift ("שוקולד מתנה") without wiring a catalog product.
      : rules.giftName
        ? { id: '', name: rules.giftName, costPrice: 0 }
        : null
    : null;

  const amountToGift = rules.giftEnabled && !giftEarned && cart.length > 0
    ? round2(Math.max(0, rules.giftThreshold - discountedSubtotal))
    : null;

  const shippingCost = freeShipping ? 0 : shippingBase;
  const cardCost = cardCharged ? rules.printedCardPrice : 0;
  const total = round2(Math.max(0, discountedSubtotal + shippingCost + cardCost));

  return {
    subtotal,
    discountAmount,
    discountedSubtotal,
    shippingBase,
    shippingCost,
    freeShippingEarned: earnedFreeShipping,
    freeShipping,
    freeShippingReason,
    amountToFreeShipping,
    gift,
    amountToGift,
    cardCost,
    total,
    meetsMinimum: rules.minOrderAmount <= 0 || subtotal >= rules.minOrderAmount,
    minOrderAmount: rules.minOrderAmount,
    rules,
  };
}
