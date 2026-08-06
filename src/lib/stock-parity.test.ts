/** Parity check: `functions/stock.js` must agree with `src/lib/stock.ts`.
 *
 *  The storefront decides from the TypeScript module whether the button says
 *  "הוספה לסל" or "אזל מהמלאי", and which gifts it offers; `createOrder` decides
 *  from the CommonJS one whether the order is accepted at all. If those drift,
 *  the shop advertises something it then refuses to sell — so this runs the same
 *  table through both and diffs the answers.
 *
 *  Run with `npm test`. No framework — `node:assert` under tsx, same as cart.test.ts.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  availableStock, canOrder, giftChoices, giftConfig, giftRequiresChoice, isSoldOut, resolveGift,
} from './stock';
import type { Product, ProductStock } from '../types';

const require = createRequire(import.meta.url);
const server = require('../../functions/stock.js');

const product = (id: string, over: Partial<Product> = {}): Product => ({
  id, name: id, description: '', price: 10, category_id: 'c', main_image: '', images: [],
  ...over,
} as Product);

const stock = (over: Partial<ProductStock>): ProductStock =>
  ({ tracked: false, quantity: 0, soldOut: false, ...over });

let n = 0;
const check = (label: string, fn: string, ...args: unknown[]) => {
  const impls: Record<string, (...a: never[]) => unknown> = {
    availableStock, isSoldOut, canOrder, giftRequiresChoice,
  };
  const client = impls[fn](...(args as never[]));
  const srv = server[fn](...args);
  assert.deepEqual(srv, client, `${label}: ${fn} differs — client ${JSON.stringify(client)}, server ${JSON.stringify(srv)}`);
  n++;
  console.log('  ok  ', `${fn} — ${label}`);
};

console.log('\nstock parity — src/lib/stock.ts vs functions/stock.js');

// ── Availability ───────────────────────────────────────────────────────────
const stockCases: [string, Product][] = [
  ['no stock field at all',    product('a')],
  ['tracking off',             product('b', { stock: stock({ tracked: false, quantity: 99 }) })],
  ['tracked with units',       product('c', { stock: stock({ tracked: true, quantity: 7 }) })],
  ['tracked, exactly one',     product('d', { stock: stock({ tracked: true, quantity: 1 }) })],
  ['tracked, none left',       product('e', { stock: stock({ tracked: true, quantity: 0 }) })],
  ['tracked, gone negative',   product('f', { stock: stock({ tracked: true, quantity: -3 }) })],
  ['tracked, fractional',      product('g', { stock: stock({ tracked: true, quantity: 2.7 }) })],
  ['tracked, garbage count',   product('h', { stock: { tracked: true, quantity: 'abc', soldOut: false } as unknown as ProductStock })],
  ['manual sold-out, untracked', product('i', { stock: stock({ soldOut: true }) })],
  ['manual sold-out beats count', product('j', { stock: stock({ tracked: true, quantity: 50, soldOut: true }) })],
];
for (const [label, p] of stockCases) {
  check(label, 'availableStock', p);
  check(label, 'isSoldOut', p);
  check(label, 'canOrder', p, 1);
  check(label, 'canOrder', p, 8);
}
// Undefined must not throw on either side — a deleted product reaches both.
check('undefined product', 'availableStock', undefined);
check('undefined product', 'isSoldOut', undefined);
check('undefined product', 'canOrder', undefined, 1);

// ── Gifts ──────────────────────────────────────────────────────────────────
console.log('\ngift resolution parity');

const inStock = product('g1', { name: 'נר ריחני' });
const alsoInStock = product('g2', { name: 'שוקולד' });
const goneGift = product('g3', { name: 'סבון', stock: stock({ tracked: true, quantity: 0 }) });
const catalog = [inStock, alsoInStock, goneGift];

const giftCases: [string, Product, string | undefined][] = [
  ['no gift configured',        product('p1'), undefined],
  ['gift switched off',         product('p2', { gift: { enabled: false, mode: 'product', productIds: ['g1'] } }), undefined],
  ['gift on, empty list',       product('p3', { gift: { enabled: true, mode: 'product', productIds: [] } }), undefined],
  ['single gift, granted',      product('p4', { gift: { enabled: true, mode: 'product', productIds: ['g1'] } }), undefined],
  ['two gifts, none chosen',    product('p5', { gift: { enabled: true, mode: 'product', productIds: ['g1', 'g2'] } }), undefined],
  ['two gifts, one chosen',     product('p6', { gift: { enabled: true, mode: 'product', productIds: ['g1', 'g2'] } }), 'g2'],
  ['chosen gift not on offer',  product('p7', { gift: { enabled: true, mode: 'product', productIds: ['g1'] } }), 'g2'],
  ['chosen gift sold out',      product('p8', { gift: { enabled: true, mode: 'product', productIds: ['g1', 'g3'] } }), 'g3'],
  ['sold-out gift filtered out', product('p9', { gift: { enabled: true, mode: 'product', productIds: ['g1', 'g3'] } }), undefined],
  ['gift id not in catalog',    product('p10', { gift: { enabled: true, mode: 'product', productIds: ['nope'] } }), undefined],
  ['checkout mode',             product('p11', { gift: { enabled: true, mode: 'checkout', productIds: ['g1', 'g2'] } }), 'g1'],
  ['unknown mode normalised',   product('p12', { gift: { enabled: true, mode: 'weird', productIds: ['g1'] } as never }), undefined],
];

for (const [label, p, chosen] of giftCases) {
  assert.deepEqual(server.giftConfig(p), giftConfig(p), `${label}: giftConfig differs`);

  const ids = (t: Product[]) => t.map(x => x.id);
  assert.deepEqual(
    ids(server.giftChoices(p, catalog)), ids(giftChoices(p, catalog)),
    `${label}: giftChoices differs`,
  );
  check(label, 'giftRequiresChoice', giftChoices(p, catalog));

  const id = (g: Product | null) => g?.id ?? null;
  assert.deepEqual(
    id(server.resolveGift(p, catalog, chosen)), id(resolveGift(p, catalog, chosen)),
    `${label}: resolveGift differs`,
  );
  n += 3;
  console.log('  ok  ', label);
}

// A Map catalog is what the Cloud Function actually passes — same answers.
const asMap = new Map(catalog.map(p => [p.id, p]));
const twoGifts = product('p13', { gift: { enabled: true, mode: 'product', productIds: ['g1', 'g2'] } });
assert.deepEqual(
  server.giftChoices(twoGifts, asMap).map((g: Product) => g.id),
  giftChoices(twoGifts, asMap).map(g => g.id),
  'Map catalog: giftChoices differs',
);
n++;
console.log('  ok  ', 'Map catalog accepted by both');

console.log(`\n${n} parity checks passed\n`);
