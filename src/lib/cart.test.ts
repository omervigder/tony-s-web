/** Regression tests for the cart rules — run with `npm test`.
 *
 *  This is the code that decides what a customer is charged, so it is worth
 *  pinning down: no test framework, just `node:assert` under tsx, so it stays a
 *  zero-dependency check that runs in a second. */
import assert from 'node:assert/strict';
import { computeTotals, couponDiscount, validateCoupon, readStoreRules } from './cart';
import type { CartItem, Coupon, Product, Settings } from '../types';

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

const base = { settings, coupon: null, deliveryMethod: 'delivery' as const, giftProduct, cardCharged: false };
let n = 0;
const check = (label: string, fn: () => void) => { fn(); n++; console.log('  ok  ', label); };

console.log('\nfree shipping threshold');
check('below threshold pays shipping', () => {
  const t = computeTotals({ ...base, cart: [item(150)] });
  assert.equal(t.shippingCost, 30);
  assert.equal(t.freeShipping, false);
  assert.equal(t.amountToFreeShipping, 50);
  assert.equal(t.total, 180);
});
check('at threshold ships free', () => {
  const t = computeTotals({ ...base, cart: [item(200)] });
  assert.equal(t.shippingCost, 0);
  assert.equal(t.freeShipping, true);
  assert.equal(t.freeShippingReason, 'threshold');
  assert.equal(t.total, 200);
});
check('pickup is never charged shipping and never "free shipping"', () => {
  const t = computeTotals({ ...base, cart: [item(200)], deliveryMethod: 'pickup' });
  assert.equal(t.shippingCost, 0);
  assert.equal(t.freeShipping, false);
});
check('disabled threshold => no nudge, shipping charged', () => {
  const t = computeTotals({ ...base, cart: [item(500)], settings: { ...settings, free_shipping_enabled: false } });
  assert.equal(t.shippingCost, 30);
  assert.equal(t.amountToFreeShipping, null);
});
check('threshold of 0 is treated as unconfigured, not "everything free"', () => {
  const t = computeTotals({ ...base, cart: [item(10)], settings: { ...settings, free_shipping_threshold: '0' } });
  assert.equal(t.rules.freeShippingEnabled, false);
  assert.equal(t.shippingCost, 30);
});

console.log('\ncoupons');
const pct: Coupon = { id: 'A', code: 'A', type: 'percent', value: 10, expiryDate: '', isActive: true };
check('percent discount', () => {
  const t = computeTotals({ ...base, cart: [item(300)], coupon: pct });
  assert.equal(t.discountAmount, 30);
  assert.equal(t.discountedSubtotal, 270);
});
check('percent respects maxDiscount cap', () => {
  assert.equal(couponDiscount({ ...pct, value: 50, maxDiscount: 40 }, 300), 40);
});
check('fixed never exceeds subtotal', () => {
  assert.equal(couponDiscount({ ...pct, type: 'fixed', value: 500 }, 120), 120);
});
check('discount drops the cart back below the free-shipping line', () => {
  const t = computeTotals({ ...base, cart: [item(210)], coupon: { ...pct, value: 20 } });
  assert.equal(t.discountedSubtotal, 168);
  assert.equal(t.freeShipping, false);
  assert.equal(t.shippingCost, 30);
});
check('free-shipping coupon waives delivery on a small order', () => {
  const t = computeTotals({ ...base, cart: [item(60)], coupon: { ...pct, value: 0, freeShipping: true } });
  assert.equal(t.shippingCost, 0);
  assert.equal(t.freeShippingReason, 'coupon');
  assert.equal(t.total, 60);
});
check('expiry is inclusive through the end of the day', () => {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.equal(validateCoupon({ ...pct, expiryDate: iso }, 100).ok, true, 'today must still be valid');
  assert.equal(validateCoupon({ ...pct, expiryDate: '2020-01-01' }, 100).reason, 'expired');
});
check('usage limit exhausts', () => {
  assert.equal(validateCoupon({ ...pct, usageLimit: 5, usageCount: 5 }, 100).reason, 'exhausted');
  assert.equal(validateCoupon({ ...pct, usageLimit: 5, usageCount: 4 }, 100).ok, true);
});
check('minimum order blocks and reports the minimum', () => {
  const c = validateCoupon({ ...pct, minOrderAmount: 200 }, 150);
  assert.equal(c.reason, 'min_order');
  assert.equal(c.minOrderAmount, 200);
});
check('an invalid coupon discounts nothing even if still attached', () => {
  const t = computeTotals({ ...base, cart: [item(100)], coupon: { ...pct, isActive: false } });
  assert.equal(t.discountAmount, 0);
  assert.equal(t.total, 130);
});

console.log('\ngift');
check('gift appears at threshold with cost carried', () => {
  const t = computeTotals({ ...base, cart: [item(350)] });
  assert.equal(t.gift?.name, 'נר ריחני');
  assert.equal(t.gift?.costPrice, 7);
  assert.equal(t.amountToGift, null);
  assert.equal(t.total, 350, 'the gift must add nothing to the total');
});
check('gift falls back to a plain label when no product is wired', () => {
  const t = computeTotals({ ...base, cart: [item(400)], giftProduct: null, settings: { ...settings, gift_product_id: '', gift_name: 'שוקולד' } });
  assert.equal(t.gift?.name, 'שוקולד');
});
check('no gift, no label => nothing promised', () => {
  const t = computeTotals({ ...base, cart: [item(400)], giftProduct: null, settings: { ...settings, gift_product_id: '' } });
  assert.equal(t.gift, null);
});
check('below gift threshold reports the remainder', () => {
  const t = computeTotals({ ...base, cart: [item(300)] });
  assert.equal(t.amountToGift, 50);
  assert.equal(t.gift, null);
});

console.log('\nmisc');
check('minimum order gate', () => {
  assert.equal(computeTotals({ ...base, cart: [item(40)] }).meetsMinimum, false);
  assert.equal(computeTotals({ ...base, cart: [item(50)] }).meetsMinimum, true);
});
check('printed card surcharge', () => {
  const t = computeTotals({ ...base, cart: [item(200)], cardCharged: true });
  assert.equal(t.cardCost, 15);
  assert.equal(t.total, 215);
});
check('empty cart is all zeroes and no nudges', () => {
  const t = computeTotals({ ...base, cart: [] });
  assert.equal(t.total, 0);
  assert.equal(t.amountToFreeShipping, null);
  assert.equal(t.amountToGift, null);
});
check('malformed settings degrade to rules-off, never NaN', () => {
  const t = computeTotals({ ...base, cart: [item(100)], settings: { pickup_address: '', bit_phone: '', delivery_cost: 'abc' } as Settings });
  assert.equal(t.shippingCost, 0);
  assert.equal(Number.isFinite(t.total), true);
  assert.equal(t.total, 100);
  assert.equal(readStoreRules({} as Settings).printedCardPrice, 15);
});
check('float dust never reaches a total', () => {
  const t = computeTotals({ ...base, cart: [item(0.1), item(0.2)], deliveryMethod: 'pickup' });
  assert.equal(t.total, 0.3);
});
check('quantity multiplies', () => {
  const t = computeTotals({ ...base, cart: [item(50, 3)], deliveryMethod: 'pickup' });
  assert.equal(t.subtotal, 150);
});

console.log(`\n${n} assertions passed\n`);
