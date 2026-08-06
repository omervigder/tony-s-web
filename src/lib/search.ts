/** Free-text product matching, shared by the storefront and the admin panel.
 *
 *  One implementation on purpose: a search box should mean the same thing in
 *  the catalog, in the box builder and in every admin picker, or "why does it
 *  find it there but not here" becomes a support question.
 *
 *  Name only — that is what both the shopper and the shop owner have in their
 *  head — and every word typed has to appear, in any order. Hebrew product
 *  names read like "נר ריחני לבנדר", and someone hunting for it is just as
 *  likely to type "לבנדר נר". */
export function matchesSearch(name: string, term: string): boolean {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = (name ?? '').toLowerCase();
  return words.every(word => haystack.includes(word));
}

/** `matchesSearch` over a list, with an empty term meaning "everything". */
export function filterByName<T extends { name: string }>(items: T[], term: string): T[] {
  if (!term.trim()) return items;
  return items.filter(item => matchesSearch(item.name, term));
}
