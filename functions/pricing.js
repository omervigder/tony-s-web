/** Server-side port of the cart arithmetic in `src/lib/cart.ts` + `src/lib/pricing.ts`.
 *
 *  The storefront module is pure by design ("so the rules can be reused
 *  server-side"), but it is TypeScript ESM and Cloud Functions deploys only the
 *  `functions/` directory as CommonJS — so it is ported here rather than imported.
 *
 *  ⚠ These two implementations MUST agree. `src/lib/pricing-parity.test.ts` runs
 *  the same scenario table through both and fails the build if they diverge; if
 *  you change a rule in one file, change it in the other and run `npm test`.
 *
 *  This module is the *authority*: what `computeTotals` returns here is what the
 *  customer is charged. The client copy exists only to render a preview.
 */

/** ₪ rounding — kills float dust (0.1+0.2) before it reaches an order total. */
const round2 = (n) => Math.round(n * 100) / 100;

/** Coerce an untrusted Firestore value to a non-negative number. */
const money = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/* ─────────────────────────── Product-level discount ────────────────────────── */

/** Resolve a product's discount into the price actually charged. A malformed
 *  discount degrades to "no discount" rather than producing NaN or a negative. */
function effectivePrice(p) {
  const list = Number(p.price) || 0;
  const none = { list, final: list, isDiscounted: false, percentOff: 0 };

  const d = p.discount;
  if (!d || !d.isActive) return none;

  const value = Number(d.value);
  if (!Number.isFinite(value) || value <= 0) return none;

  const final = d.type === 'percent'
    ? list * (1 - Math.min(value, 99) / 100)
    : Math.max(0, list - value);

  if (final >= list) return none;

  return {
    list,
    final: round2(final),
    isDiscounted: true,
    percentOff: list > 0 ? Math.round((1 - final / list) * 100) : 0,
    ...(d.label && { label: d.label }),
  };
}

/* ────────────────────────────── Store-wide rules ───────────────────────────── */

const DEFAULT_PRINTED_CARD_PRICE = 15;

function readStoreRules(s) {
  const settings = s ?? {};
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

/* ──────────────────────────────── Coupons ──────────────────────────────────── */

/** Expiry is a date, not an instant: a code dated today is good until midnight. */
function expiresAt(expiryDate) {
  if (!expiryDate) return null;
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ? `${expiryDate}T23:59:59` : expiryDate;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Is this coupon usable for a cart of `subtotal`? Pure — no I/O. */
function validateCoupon(coupon, subtotal, now = new Date()) {
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
function couponDiscount(coupon, subtotal) {
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

/* ───────────────────────────────── Totals ──────────────────────────────────── */

/** Mirror of `computeTotals` in `src/lib/cart.ts`.
 *
 *  `cart` lines must already carry a server-derived `unitPrice` — see
 *  `priceCartLines()` in index.js, which rebuilds every unit price from the
 *  catalog so a client-supplied price can never enter this calculation. */
function computeTotals({ cart, settings, coupon, deliveryMethod, giftProduct, cardCharged }) {
  const rules = readStoreRules(settings);

  const subtotal = round2(
    cart.reduce((sum, item) => sum + money(item.unitPrice) * (Number(item.quantity) || 0), 0)
  );

  const couponValid = coupon ? validateCoupon(coupon, subtotal).ok : false;
  const discountAmount = couponValid ? couponDiscount(coupon, subtotal) : 0;
  const discountedSubtotal = round2(subtotal - discountAmount);

  // Thresholds are measured on what the customer actually pays for goods, so a
  // coupon can drop an order back below the free-shipping line.
  const shippingBase = deliveryMethod === 'delivery' && cart.length > 0 ? rules.deliveryCost : 0;
  const earnedFreeShipping = rules.freeShippingEnabled && discountedSubtotal >= rules.freeShippingThreshold;
  const couponFreeShipping = couponValid && coupon?.freeShipping === true;
  const freeShipping = shippingBase > 0 && (earnedFreeShipping || couponFreeShipping);
  const freeShippingReason = !freeShipping ? null : earnedFreeShipping ? 'threshold' : 'coupon';

  const amountToFreeShipping = rules.freeShippingEnabled && !earnedFreeShipping && cart.length > 0
    ? round2(Math.max(0, rules.freeShippingThreshold - discountedSubtotal))
    : null;

  const giftEarned = rules.giftEnabled && discountedSubtotal >= rules.giftThreshold;
  const gift = giftEarned
    ? giftProduct
      ? {
          id: giftProduct.id,
          name: giftProduct.name,
          ...(giftProduct.main_image && { imageUrl: giftProduct.main_image }),
          costPrice: money(giftProduct.costPrice),
        }
      // The admin can promise a gift without wiring a catalog product.
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

module.exports = {
  round2,
  money,
  effectivePrice,
  readStoreRules,
  validateCoupon,
  couponDiscount,
  computeTotals,
  DEFAULT_PRINTED_CARD_PRICE,
};
