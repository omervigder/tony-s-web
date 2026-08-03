/** Parity check: `functions/pricing.js` must agree with `src/lib/cart.ts`.
 *
 *  The storefront renders the total from the TypeScript module; the customer is
 *  actually charged the total the Cloud Function computes from the CommonJS one.
 *  If those two drift, the shopper is quoted one price and billed another — so
 *  this runs the same scenarios through both and diffs the money.
 *
 *  Run with `npm test`. No framework — `node:assert` under tsx, same as cart.test.ts.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { computeTotals } from './cart';
import type { CartItem, Coupon, Product, Settings } from '../types';

const require = createRequire(import.meta.url);
const server = require('../../functions/pricing.js');

const item = (price: number, quantity = 1): CartItem => ({
  id: `p${price}`, name: 'x', description: '', price, category_id: '', main_image: '', images: [],
  quantity, unitPrice: price,
} as CartItem);

const settings: Settings = {
  pickup_address: '', bit_phone: '', delivery_cost: '30',
  printed_card_price: '15',
  free_shipping_enabled: true, free_shipping_threshold: '200',
  gift_enabled: true, gift_threshold: '350', gift_product_id: 'g1',
  min_order_amount: '50',
};

const giftProduct = { id: 'g1', name: 'נר ריחני', main_image: 'u', costPrice: 7 } as Product;

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: 'SAVE10', code: 'SAVE10', type: 'percent', value: 10,
  expiryDate: '', isActive: true, ...over,
} as Coupon);

/** The fields that decide what the customer pays. A difference in any of these
 *  is a difference in the bill. */
const MONEY_FIELDS = [
  'subtotal', 'discountAmount', 'discountedSubtotal', 'shippingBase', 'shippingCost',
  'freeShipping', 'freeShippingEarned', 'freeShippingReason', 'cardCost', 'total',
  'meetsMinimum', 'minOrderAmount', 'amountToFreeShipping', 'amountToGift',
] as const;

type Scenario = { label: string; input: Parameters<typeof computeTotals>[0] };

const base = { settings, coupon: null, deliveryMethod: 'delivery' as const, giftProduct, cardCharged: false };

const scenarios: Scenario[] = [
  { label: 'empty cart',                 input: { ...base, cart: [] } },
  { label: 'below free-shipping line',   input: { ...base, cart: [item(150)] } },
  { label: 'exactly at the line',        input: { ...base, cart: [item(200)] } },
  { label: 'pickup never ships',         input: { ...base, cart: [item(200)], deliveryMethod: 'pickup' } },
  { label: 'gift threshold reached',     input: { ...base, cart: [item(400)] } },
  { label: 'gift with no product wired', input: { ...base, cart: [item(400)], giftProduct: null, settings: { ...settings, gift_name: 'שוקולד' } } },
  { label: 'printed card charged',       input: { ...base, cart: [item(100)], cardCharged: true } },
  { label: 'percent coupon',             input: { ...base, cart: [item(220)], coupon: coupon() } },
  { label: 'percent coupon with cap',    input: { ...base, cart: [item(1000)], coupon: coupon({ maxDiscount: 50 }) } },
  { label: 'fixed coupon',               input: { ...base, cart: [item(220)], coupon: coupon({ type: 'fixed', value: 40 }) } },
  { label: 'coupon exceeding subtotal',  input: { ...base, cart: [item(60)], coupon: coupon({ type: 'fixed', value: 500 }) } },
  { label: 'coupon drops below line',    input: { ...base, cart: [item(210)], coupon: coupon({ type: 'fixed', value: 30 }) } },
  { label: 'free-shipping coupon',       input: { ...base, cart: [item(100)], coupon: coupon({ value: 0, freeShipping: true }) } },
  { label: 'expired coupon ignored',     input: { ...base, cart: [item(220)], coupon: coupon({ expiryDate: '2020-01-01' }) } },
  { label: 'exhausted coupon ignored',   input: { ...base, cart: [item(220)], coupon: coupon({ usageLimit: 5, usageCount: 5 }) } },
  { label: 'coupon under its minimum',   input: { ...base, cart: [item(80)], coupon: coupon({ minOrderAmount: 300 }) } },
  { label: 'below minimum order',        input: { ...base, cart: [item(20)] } },
  { label: 'float dust (3 × 19.99)',     input: { ...base, cart: [item(19.99, 3)] } },
  { label: 'mixed multi-line cart',      input: { ...base, cart: [item(49.9, 2), item(120), item(15.5, 4)] } },
  { label: 'thresholds off',             input: { ...base, cart: [item(500)], settings: { ...settings, free_shipping_enabled: false, gift_enabled: false } } },
  { label: 'zero threshold unconfigured',input: { ...base, cart: [item(10)], settings: { ...settings, free_shipping_threshold: '0' } } },
  { label: 'card price defaulted',       input: { ...base, cart: [item(100)], cardCharged: true, settings: { ...settings, printed_card_price: undefined } } },
  { label: 'garbage delivery cost',      input: { ...base, cart: [item(100)], settings: { ...settings, delivery_cost: 'abc' } } },
];

let n = 0;
console.log('\npricing parity — src/lib/cart.ts vs functions/pricing.js');
for (const { label, input } of scenarios) {
  const client = computeTotals(input) as unknown as Record<string, unknown>;
  const serverTotals = server.computeTotals(input) as Record<string, unknown>;

  for (const field of MONEY_FIELDS) {
    assert.deepEqual(
      serverTotals[field], client[field],
      `${label}: "${field}" differs — client ${JSON.stringify(client[field])}, ` +
      `server ${JSON.stringify(serverTotals[field])}`,
    );
  }

  // The gift is a shipped item, so its identity has to match too — not just the money.
  const giftId = (t: Record<string, unknown>) => (t.gift as { id?: string } | null)?.id ?? null;
  assert.deepEqual(giftId(serverTotals), giftId(client), `${label}: gift product differs`);

  n++;
  console.log('  ok  ', label);
}

// A discount that a stale client still shows must not survive server pricing.
console.log('\ncoupon validation parity');
const couponCases: [string, Coupon, number][] = [
  ['active percent', coupon(), 220],
  ['inactive',       coupon({ isActive: false }), 220],
  ['expired',        coupon({ expiryDate: '2020-01-01' }), 220],
  ['exhausted',      coupon({ usageLimit: 1, usageCount: 3 }), 220],
  ['under minimum',  coupon({ minOrderAmount: 500 }), 220],
];
for (const [label, c, subtotal] of couponCases) {
  const { validateCoupon, couponDiscount } = await import('./cart');
  assert.equal(
    server.validateCoupon(c, subtotal).ok, validateCoupon(c, subtotal).ok,
    `validateCoupon parity failed: ${label}`,
  );
  assert.equal(
    server.couponDiscount(c, subtotal), couponDiscount(c, subtotal),
    `couponDiscount parity failed: ${label}`,
  );
  n++;
  console.log('  ok  ', label);
}

console.log(`\n${n} parity checks passed\n`);
