import type { Product, ProductGift } from '../types';

/** Which products can still be sold, and which gift a product grants.
 *
 *  Pure, like `cart.ts` — no React, no Firestore — because the same two questions
 *  are asked in three places that must never disagree: the storefront (does the
 *  button say "הוספה לסל" or "אזל מהמלאי"), the admin panel, and `createOrder`,
 *  which is the one that actually decides. `functions/stock.js` is the CommonJS
 *  port; `src/lib/stock-parity.test.ts` fails the build if they drift.
 *
 *  Firestore values are untrusted here too: `stock` is admin-typed and `gift`
 *  points at product ids that may since have been deleted, so every rule
 *  degrades to "sellable, no gift" rather than to a NaN or a crash. */

/** Units left, or `null` when the product is not counted (unlimited supply).
 *
 *  A tracked product with a garbage or negative quantity reads as 0 — refusing
 *  to sell something we cannot count is the safe direction to fail. */
export function availableStock(p: Pick<Product, 'stock'> | null | undefined): number | null {
  const s = p?.stock;
  if (!s || s.tracked !== true) return null;
  const n = Number(s.quantity);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Is this product unbuyable right now?
 *
 *  Either the admin flipped the manual switch, or the counter has run out. */
export function isSoldOut(p: Pick<Product, 'stock'> | null | undefined): boolean {
  if (p?.stock?.soldOut === true) return true;
  const left = availableStock(p);
  return left !== null && left <= 0;
}

/** Can `qty` units of this product still be ordered? */
export function canOrder(p: Pick<Product, 'stock'> | null | undefined, qty: number): boolean {
  if (isSoldOut(p)) return false;
  const left = availableStock(p);
  return left === null || qty <= left;
}

/** Hebrew copy for a stock refusal — the storefront never invents its own wording. */
export function stockMessage(name: string, left: number | null): string {
  if (left === null || left <= 0) return `${name} אזל מהמלאי`;
  return `נותרו ${left} יחידות בלבד מ${name}`;
}

/* ─────────────────────────────── Product gifts ──────────────────────────────── */

/** The gift configuration a product actually offers.
 *
 *  A gift is only real once it resolves to a product that can still be shipped,
 *  so ids that were deleted or have sold out are dropped here — a freebie we
 *  cannot send must never block a sale or appear as a choice. */
export function giftConfig(p: Pick<Product, 'gift'> | null | undefined): ProductGift | null {
  const g = p?.gift;
  if (!g || g.enabled !== true) return null;
  const ids = Array.isArray(g.productIds) ? g.productIds.filter(Boolean) : [];
  if (ids.length === 0) return null;
  return { enabled: true, mode: g.mode === 'checkout' ? 'checkout' : 'product', productIds: ids };
}

/** The gift products a purchase of `p` can actually be given, resolved against
 *  the catalog and filtered to what is still in stock. */
export function giftChoices(
  p: Pick<Product, 'gift'> | null | undefined,
  catalog: Map<string, Product> | Product[],
): Product[] {
  const config = giftConfig(p);
  if (!config) return [];
  const byId = catalog instanceof Map
    ? catalog
    : new Map(catalog.map(x => [x.id, x]));
  return config.productIds
    .map(id => byId.get(id))
    .filter((g): g is Product => !!g && !isSoldOut(g));
}

/** Does the shopper have to pick, or is the gift simply granted?
 *
 *  One choice is not a choice — it is attached automatically, and the product
 *  page just tells them it is coming. */
export function giftRequiresChoice(choices: Product[]): boolean {
  return choices.length > 1;
}

/** Resolve the gift a line ends up with.
 *
 *  `chosenId` is what the shopper picked (or nothing, on a single-gift product).
 *  Returns null when the product grants no gift, or when the pick is not one of
 *  the products actually on offer — a stale choice must never smuggle an
 *  arbitrary catalog item into the order at ₪0. */
export function resolveGift(
  p: Pick<Product, 'gift'> | null | undefined,
  catalog: Map<string, Product> | Product[],
  chosenId?: string,
): Product | null {
  const choices = giftChoices(p, catalog);
  if (choices.length === 0) return null;
  if (chosenId) return choices.find(g => g.id === chosenId) ?? null;
  // Nothing picked: granted automatically only when there was nothing to pick.
  return choices.length === 1 ? choices[0] : null;
}
