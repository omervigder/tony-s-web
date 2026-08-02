import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../firebase';
import type { CartItem, Coupon, Product, SelectedOptions, Settings } from '../types';
import {
  computeTotals, couponRejectionMessage, getCartKey, priceWithOptions, round2, validateCoupon,
  type CartLine, type CartTotals, type CouponRejection,
} from '../lib/cart';
import { effectivePrice } from '../lib/pricing';

/** Everything that turns a basket into an amount owed lives here: the lines, the
 *  applied coupon, the store-wide rules from `settings/store`, and the delivery
 *  choice they all depend on. Keeping them in one provider is what lets the
 *  totals stay *derived* — no effect writes a price into state, so the free
 *  shipping and gift thresholds re-evaluate on their own as the cart changes. */

const CART_STORAGE_KEY = 'tony_store_cart';

const DEFAULT_SETTINGS: Settings = { pickup_address: '', delivery_cost: '0', bit_phone: '' };

/** Resolves one coupon code. Guests cannot read the `coupons` collection — see
 *  firestore.rules — so this is the storefront's only route to a code. */
const validateCouponCodeFn = httpsCallable<
  { code: string; subtotal: number },
  { ok: boolean; reason?: CouponRejection; minOrderAmount?: number; coupon?: Coupon }
>(getFunctions(app), 'validateCouponCode');

export type DeliveryMethod = 'pickup' | 'delivery';
export type Dedication = { message: string; cardType: 'digital' | 'printed' };

interface CartContextValue {
  /* Lines */
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number, variations?: Record<string, string>, options?: SelectedOptions) => void;
  /** Append a pre-built line (the Build-A-Box bundle) that has no catalog identity. */
  addLine: (line: CartItem) => void;
  removeFromCart: (target: CartLine) => void;
  updateQuantity: (target: CartLine, delta: number) => void;
  clearCart: () => void;
  /** Pull stale line prices back in line with the catalog. Resolves true when
   *  something changed. See the implementation for why checkout needs it. */
  repriceCart: () => Promise<boolean>;
  cartCount: number;

  /* Store-wide rules */
  settings: Settings;

  /* Order-shape state that moves the total */
  deliveryMethod: DeliveryMethod;
  setDeliveryMethod: (method: DeliveryMethod) => void;
  dedication: Dedication;
  setDedication: React.Dispatch<React.SetStateAction<Dedication>>;

  /* Coupon */
  appliedCoupon: Coupon | null;
  couponInput: string;
  setCouponInput: (value: string) => void;
  couponError: string | null;
  clearCouponError: () => void;
  isValidatingCoupon: boolean;
  applyCoupon: (code?: string) => Promise<void>;
  removeCoupon: () => void;

  /* Money — the single source of truth for every ₪ on screen */
  totals: CartTotals;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [dedication, setDedication] = useState<Dedication>({ message: '', cardType: 'digital' });

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  const [giftProduct, setGiftProduct] = useState<Product | null>(null);

  // Persist the cart on every change. The ref keeps `repriceCart` free of a
  // `cart` dependency, so the callback identity stays stable across renders.
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  // Live store rules: an admin raising the free-shipping threshold reaches an
  // open cart without a reload, so nobody checks out against stale numbers.
  useEffect(() => {
    return onSnapshot(
      doc(db, 'settings', 'store'),
      snap => { if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() as Settings })); },
      err => console.error('[Cart] settings listener error:', err),
    );
  }, []);

  // Resolve the gift product by id. Fetched here rather than read out of the
  // storefront catalog so the gift still works if it is hidden or filtered out.
  const giftProductId = settings.gift_product_id ?? '';
  useEffect(() => {
    if (!giftProductId) { setGiftProduct(null); return; }
    let cancelled = false;
    getDoc(doc(db, 'products', giftProductId))
      .then(snap => {
        if (cancelled) return;
        setGiftProduct(snap.exists() ? { id: snap.id, ...snap.data() } as Product : null);
      })
      .catch(err => {
        console.error('[Cart] gift product fetch failed:', err);
        if (!cancelled) setGiftProduct(null);
      });
    return () => { cancelled = true; };
  }, [giftProductId]);

  const cardCharged = dedication.message.trim().length > 0 && dedication.cardType === 'printed';

  const totals = useMemo(
    () => computeTotals({ cart, settings, coupon: appliedCoupon, deliveryMethod, giftProduct, cardCharged }),
    [cart, settings, appliedCoupon, deliveryMethod, giftProduct, cardCharged],
  );

  // A coupon is applied against the cart it was applied to. Emptying the cart or
  // dropping below its minimum has to revoke it — otherwise the shopper keeps a
  // discount the rules no longer grant. `computeTotals` already ignores an
  // invalid coupon; this exists so the UI says why it disappeared.
  useEffect(() => {
    if (!appliedCoupon) return;
    const check = validateCoupon(appliedCoupon, totals.subtotal);
    if (!check.ok) {
      setAppliedCoupon(null);
      setCouponError(couponRejectionMessage(check));
    }
  }, [appliedCoupon, totals.subtotal]);

  /* ── Lines ─────────────────────────────────────────────────────────────── */

  const addToCart = useCallback((
    product: Product,
    quantity: number = 1,
    variations?: Record<string, string>,
    options: SelectedOptions = {},
  ) => {
    const line: CartItem = {
      ...product,
      quantity,
      selectedVariations: variations,
      ...options,
      unitPrice: priceWithOptions(product, options),
    };
    const key = getCartKey(line);
    setCart(prev => {
      const existing = prev.find(item => getCartKey(item) === key);
      if (existing) {
        return prev.map(item => getCartKey(item) === key ? { ...item, quantity: item.quantity + quantity } : item);
      }
      return [...prev, line];
    });
  }, []);

  const addLine = useCallback((line: CartItem) => setCart(prev => [...prev, line]), []);

  const removeFromCart = useCallback((target: CartLine) => {
    const key = getCartKey(target);
    setCart(prev => prev.filter(item => getCartKey(item) !== key));
  }, []);

  const updateQuantity = useCallback((target: CartLine, delta: number) => {
    const key = getCartKey(target);
    setCart(prev => prev.map(item =>
      getCartKey(item) === key ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
    setDedication({ message: '', cardType: 'digital' });
  }, []);

  /** Re-read every line's price from the catalog.
   *
   *  A cart line is a snapshot taken at add-to-cart time and then parked in
   *  localStorage, so a price the admin changed afterwards — or a sale that
   *  ended — never reaches an open cart on its own. `createOrder` prices the
   *  order from the live catalog and checkout refuses to proceed when the two
   *  disagree, so there has to be a way to pull the cart back into line;
   *  otherwise a shopper with a stale basket can never check out.
   *
   *  Lines whose product has been deleted are dropped — they cannot be ordered.
   *  Returns true when anything actually changed. */
  const repriceCart = useCallback(async (): Promise<boolean> => {
    const current = cartRef.current;
    if (current.length === 0) return false;

    // A Build-A-Box line's own id is synthetic, so it contributes its box base
    // and its contents instead — looking up `bundle_<ts>` would find nothing and
    // drop the box the shopper assembled.
    const ids: string[] = Array.from(new Set(current.flatMap(i =>
      i.bundleItems?.length
        ? [i.boxBaseId ?? '', ...i.bundleItems.map(b => b.id)].filter(Boolean)
        : [i.id]
    )));
    const snaps = await Promise.all(ids.map(id => getDoc(doc(db, 'products', id))));
    const fresh = new Map<string, Product>();
    snaps.forEach(snap => {
      if (snap.exists()) fresh.set(snap.id, { id: snap.id, ...snap.data() } as Product);
    });

    let changed = false;
    const next: CartItem[] = [];
    for (const item of current) {
      // ── Build-A-Box — same formula the server prices it with ──────────────
      if (item.bundleItems?.length) {
        const boxBase = item.boxBaseId ? fresh.get(item.boxBaseId) : undefined;
        // A box built before `boxBaseId` was recorded, or whose base was
        // delisted, cannot be re-priced. Leave it untouched: checkout explains
        // it needs rebuilding, which beats deleting it out from under them.
        if (!boxBase) { next.push(item); continue; }

        const contents = item.bundleItems.map(b => {
          const p = fresh.get(b.id);
          return p ? { id: p.id, name: p.name, price: effectivePrice(p).final, quantity: b.quantity } : null;
        });
        if (contents.some(c => c === null)) { next.push(item); continue; }  // a filling was delisted

        const priced = contents as NonNullable<(typeof contents)[number]>[];
        const unitPrice = round2(
          effectivePrice(boxBase).final + priced.reduce((s, c) => s + c.price * c.quantity, 0)
        );
        if (unitPrice !== item.unitPrice) changed = true;
        next.push({ ...item, price: unitPrice, unitPrice, bundleItems: priced });
        continue;
      }

      const product = fresh.get(item.id);
      if (!product) { changed = true; continue; }  // delisted — drop the line

      const options: SelectedOptions = {
        ...(item.selectedColor && { selectedColor: item.selectedColor }),
        ...(item.selectedLength && { selectedLength: item.selectedLength }),
        ...(item.selectedBranding && { selectedBranding: item.selectedBranding }),
        ...(item.brandingText && { brandingText: item.brandingText }),
      };
      const unitPrice = priceWithOptions(product, options);
      if (unitPrice !== item.unitPrice) changed = true;

      // Refresh the catalog fields too, so the cart shows the current name and
      // image — but keep the shopper's own choices (quantity, options) intact.
      next.push({ ...product, ...item, ...options, unitPrice });
    }

    if (changed) setCart(next);
    return changed;
  }, []);

  /* ── Coupon ────────────────────────────────────────────────────────────── */

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
  }, []);

  const clearCouponError = useCallback(() => setCouponError(null), []);

  /** Look a code up and apply it, or explain why not. Codes created by the admin
   *  panel use the code itself as the document id, so the common path is a single
   *  `getDoc`; the query is the fallback for coupons created before that. */
  const applyCoupon = useCallback(async (codeArg?: string) => {
    const code = (codeArg ?? couponInput).trim().toUpperCase();
    if (!code) return;

    setIsValidatingCoupon(true);
    setCouponError(null);
    setAppliedCoupon(null);
    try {
      // The `coupons` collection is not readable by guests — publishing the
      // discount list is what reading it directly amounted to. The function
      // answers about this one code and describes it only if it is valid.
      const { data } = await validateCouponCodeFn({ code, subtotal: totals.subtotal });

      if (!data.ok) {
        setCouponError(couponRejectionMessage({
          ok: false,
          reason: data.reason ?? 'error',
          ...(data.minOrderAmount != null && { minOrderAmount: data.minOrderAmount }),
        }));
        return;
      }
      setAppliedCoupon(data.coupon as Coupon);
      setCouponInput('');
    } catch (err) {
      console.error('[Cart] coupon validation error:', err);
      setCouponError(couponRejectionMessage({ ok: false, reason: 'error' }));
    } finally {
      setIsValidatingCoupon(false);
    }
  }, [couponInput, totals.subtotal]);

  const cartCount = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  const value: CartContextValue = {
    cart, addToCart, addLine, removeFromCart, updateQuantity, clearCart, repriceCart, cartCount,
    settings,
    deliveryMethod, setDeliveryMethod,
    dedication, setDedication,
    appliedCoupon, couponInput, setCouponInput, couponError, clearCouponError,
    isValidatingCoupon, applyCoupon, removeCoupon,
    totals,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
