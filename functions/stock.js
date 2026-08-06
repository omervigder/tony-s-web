/** Server-side port of `src/lib/stock.ts` — availability and product gifts.
 *
 *  Same arrangement as `pricing.js`: the storefront module is TypeScript ESM and
 *  Cloud Functions deploys `functions/` as CommonJS, so it is ported rather than
 *  imported.
 *
 *  ⚠ These two implementations MUST agree. `src/lib/stock-parity.test.ts` runs
 *  the same table through both and fails the build if they diverge; if you change
 *  a rule in one file, change it in the other and run `npm test`.
 *
 *  This module is the *authority*: what the storefront calls "sold out" is a
 *  preview, what `createOrder` refuses here is the real answer.
 */

/** Units left, or `null` when the product is not counted (unlimited supply). */
function availableStock(p) {
  const s = p && p.stock;
  if (!s || s.tracked !== true) return null;
  const n = Number(s.quantity);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Is this product unbuyable right now? */
function isSoldOut(p) {
  if (p && p.stock && p.stock.soldOut === true) return true;
  const left = availableStock(p);
  return left !== null && left <= 0;
}

/** Can `qty` units of this product still be ordered? */
function canOrder(p, qty) {
  if (isSoldOut(p)) return false;
  const left = availableStock(p);
  return left === null || qty <= left;
}

/** Hebrew copy for a stock refusal. */
function stockMessage(name, left) {
  if (left === null || left <= 0) return `${name} אזל מהמלאי`;
  return `נותרו ${left} יחידות בלבד מ${name}`;
}

/* ─────────────────────────────── Product gifts ──────────────────────────────── */

/** The gift configuration a product actually offers. */
function giftConfig(p) {
  const g = p && p.gift;
  if (!g || g.enabled !== true) return null;
  const ids = Array.isArray(g.productIds) ? g.productIds.filter(Boolean) : [];
  if (ids.length === 0) return null;
  return { enabled: true, mode: g.mode === "checkout" ? "checkout" : "product", productIds: ids };
}

/** The gift products a purchase of `p` can actually be given — resolved against
 *  the catalog and filtered to what is still in stock. */
function giftChoices(p, catalog) {
  const config = giftConfig(p);
  if (!config) return [];
  const byId = catalog instanceof Map ? catalog : new Map(catalog.map(x => [x.id, x]));
  return config.productIds
    .map(id => byId.get(id))
    .filter(g => !!g && !isSoldOut(g));
}

/** Does the shopper have to pick, or is the gift simply granted? */
function giftRequiresChoice(choices) {
  return choices.length > 1;
}

/** Resolve the gift a line ends up with. Returns null when the product grants
 *  none, or when the pick is not one of the products actually on offer. */
function resolveGift(p, catalog, chosenId) {
  const choices = giftChoices(p, catalog);
  if (choices.length === 0) return null;
  if (chosenId) return choices.find(g => g.id === chosenId) || null;
  return choices.length === 1 ? choices[0] : null;
}

module.exports = {
  availableStock,
  isSoldOut,
  canOrder,
  stockMessage,
  giftConfig,
  giftChoices,
  giftRequiresChoice,
  resolveGift,
};
