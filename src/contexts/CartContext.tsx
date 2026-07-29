import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { CartItem, Coupon, Product, SelectedOptions, Settings } from '../types';
import {
  computeTotals, couponRejectionMessage, getCartKey, priceWithOptions, validateCoupon,
  type CartLine, type CartTotals,
} from '../lib/cart';

/** Everything that turns a basket into an amount owed lives here: the lines, the
 *  applied coupon, the store-wide rules from `settings/store`, and the delivery
 *  choice they all depend on. Keeping them in one provider is what lets the
 *  totals stay *derived* — no effect writes a price into state, so the free
 *  shipping and gift thresholds re-evaluate on their own as the cart changes. */

const CART_STORAGE_KEY = 'tony_store_cart';

const DEFAULT_SETTINGS: Settings = { pickup_address: '', delivery_cost: '0', bit_phone: '' };

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

  // Persist the cart on every change.
  useEffect(() => {
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
      let coupon: Coupon | null = null;

      const direct = await getDoc(doc(db, 'coupons', code));
      if (direct.exists()) {
        coupon = { id: direct.id, ...direct.data() } as Coupon;
      } else {
        const snap = await getDocs(query(collection(db, 'coupons'), where('code', '==', code)));
        if (!snap.empty) coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as Coupon;
      }

      const check = validateCoupon(coupon, totals.subtotal);
      if (!check.ok) {
        setCouponError(couponRejectionMessage(check));
        return;
      }
      setAppliedCoupon(coupon);
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
    cart, addToCart, addLine, removeFromCart, updateQuantity, clearCart, cartCount,
    settings,
    deliveryMethod, setDeliveryMethod,
    dedication, setDedication,
    appliedCoupon, couponInput, setCouponInput, couponError, clearCouponError,
    isValidatingCoupon, applyCoupon, removeCoupon,
    totals,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
