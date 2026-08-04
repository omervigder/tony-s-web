import React, { useState, useEffect, useRef } from 'react';
import AccessibilityWidget from './components/AccessibilityWidget';
import GiftAssistant from './components/GiftAssistant';
import CheckoutSuccess from './components/CheckoutSuccess';
import { ShoppingCart, Package, Plus, Minus, Trash2, Camera, ChevronRight, ChevronLeft, CheckCircle2, X, Menu, Loader2, ChevronDown, Copy, Star, MessageCircle, Gift, Check, Instagram } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, CartItem, Coupon, SiteContent, Review, BrandingOption, ProductColorOption, ProductLengthOption, SiteBanner } from './types';
import { effectivePrice } from './lib/pricing';
import { embroideryPrice, getCartKey, unitPriceOf } from './lib/cart';
import { CartProvider, useCart } from './contexts/CartContext';
import { app, db, storage } from './firebase';
import { collection, getDocs, doc, getDoc, query, orderBy, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const INSTAGRAM_URL = 'https://www.instagram.com/tony_amrami__branding?igsh=M2QycXNhZDk2Z2s2&utm_source=qr';

/** What the shopper picked — never what it costs.
 *
 *  The order total is computed by the `createOrder` Cloud Function from the
 *  catalog, the coupon document and `settings/store`; the totals rendered around
 *  the checkout are a preview of that calculation, not an input to it. */
interface CreateOrderLine {
  /** Absent on a Build-A-Box line, which is priced from `bundle` instead. */
  productId?: string;
  quantity: number;
  selectedVariations?: Record<string, string>;
  selectedColorName?: string;
  selectedLengthLabel?: string;
  selectedBrandingId?: string;
  brandingText?: string;
  /** The names to embroider. Only the text travels — the server takes the ₪ for
   *  each half from the product document. */
  embroideryFirstName?: string;
  embroideryLastName?: string;
  /** A box the shopper assembled — the server re-prices it from the box base
   *  and the contents, so the browser's `bundle_<ts>` line never sets a price. */
  bundle?: {
    boxBaseId: string;
    items: { productId: string; quantity: number }[];
  };
}

interface CreateOrderRequest {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryMethod: 'pickup' | 'delivery';
  shippingAddress?: string;
  items: CreateOrderLine[];
  couponCode?: string;
  dedicationMessage?: string;
  dedicationCardType?: 'digital' | 'printed';
  customerNotes?: string;
  /** What the storefront displayed. Compared, never trusted for pricing — the
   *  server refuses to create an order whose total the shopper has not seen. */
  expectedTotal: number;
}

interface CreateOrderResponse {
  orderId: string;
  total: number;
  subtotal: number;
  discountAmount: number;
  shippingCost: number;
  cardCost: number;
  couponApplied: boolean;
}

const createOrderFn = httpsCallable<CreateOrderRequest, CreateOrderResponse>(
  getFunctions(app),
  'createOrder',
);

/** Reviews are written server-side so submissions can be rate-limited and the
 *  product name taken from the catalog rather than from the submission. */
const submitReviewFn = httpsCallable<{
  productId: string;
  customerName: string;
  rating: number;
  message: string;
  photoUrl?: string;
}, { ok: boolean }>(getFunctions(app), 'submitReview');

// lucide-react ships no WhatsApp glyph, so the mark lives here and is shared by
// the header, the footer and the floating bubble.
const WhatsAppIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// Format ₪ amounts — rounds to 2 decimals and trims trailing zeros so
// float imprecision (e.g. 0.1+0.2 = 0.30000000000000004) never reaches the UI.
const formatPrice = (n: number | string | undefined | null): string => {
  const num = Number(n) || 0;
  return num.toFixed(2).replace(/\.?0+$/, '');
};

/** A product's price. On sale, the list price is struck through and the saving badged.
 *  `surcharge` is any length/branding extra the shopper has already picked. */
const PriceTag = ({
  product, surcharge = 0, size = 'md',
}: { product: Product; surcharge?: number; size?: 'md' | 'lg' }) => {
  const p = effectivePrice(product);
  const big = size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <span className="flex items-center gap-2 flex-wrap">
      <span className={`${big} font-semibold text-ink`}>₪{formatPrice(p.final + surcharge)}</span>
      {p.isDiscounted && (
        <>
          <span className="text-sm text-muted line-through">₪{formatPrice(p.list + surcharge)}</span>
          <span className="text-xs font-bold px-1.5 py-0.5 bg-ink text-cream">-{p.percentOff}%</span>
          {p.label && <span className="text-xs text-muted">{p.label}</span>}
        </>
      )}
    </span>
  );
};

/** What an applied coupon gives, in one phrase. A code can carry a ₪/% discount,
 *  free shipping, or both, so this is not just a percentage. */
const couponBenefit = (c: Coupon): string => {
  const parts: string[] = [];
  if (c.value > 0) parts.push(c.type === 'percent' ? `${c.value}% הנחה` : `₪${formatPrice(c.value)} הנחה`);
  if (c.freeShipping) parts.push('משלוח חינם');
  return parts.join(' + ') || 'הנחה';
};

/** "Spend ₪X more and…" — the progress bar that makes a threshold feel reachable. */
const ThresholdNudge = ({ text, progress }: { text: string; progress: number }) => (
  <div className="bg-cream border border-line rounded-xl px-4 py-3 space-y-2">
    <p className="text-sm font-medium text-ink">{text}</p>
    <div className="h-1.5 bg-white rounded-full overflow-hidden">
      <div
        className="h-full bg-ink rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
      />
    </div>
  </div>
);

/** The compact price used inside the Build-A-Box picker tiles. */
const BundlePrice = ({ product }: { product: Product }) => {
  const p = effectivePrice(product);
  return (
    <p className="text-ink font-bold text-sm flex items-center gap-1.5">
      ₪{formatPrice(p.final)}
      {p.isDiscounted && <span className="text-muted font-normal line-through">₪{formatPrice(p.list)}</span>}
    </p>
  );
};

/** The storefront. Wrapped by `<CartProvider>` (see the default export below) —
 *  the basket, the applied coupon, the store rules and every ₪ derived from them
 *  come from `useCart()`, so the cart drawer, the checkout summary and the order
 *  document can never disagree about what the customer owes. */
/** What the shopper has opted into on the product page. Embroidery is a paid
 *  extra, so it is off until they tick it — never pre-selected. */
const EMPTY_EMBROIDERY_CHOICE = {
  firstName: { on: false, text: '' },
  lastName: { on: false, text: '' },
};

/** True when the product has options the shopper must choose before it can be added. */
const needsOptions = (p: Product) => !!(
  p.variations?.length || p.colorOptions?.length || p.lengthOptions?.length || p.brandingOptionIds?.length
);

/** The catalog tile — shared by the home showcase and the full catalog so the
 *  two can never drift into looking like different stores. */
const ProductCard: React.FC<{
  product: Product; onOpen: (id: string) => void; onAdd: (p: Product) => void;
}> = ({ product, onOpen, onAdd }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="surface-card overflow-hidden flex flex-col cursor-pointer"
    onClick={() => onOpen(product.id)}
  >
    <div className="aspect-square relative overflow-hidden bg-cream">
      {product.main_image ? (
        <img src={product.main_image} alt={product.alt_text || product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-line-strong">
          <Package size={48} />
        </div>
      )}
    </div>
    <div className="p-6 flex flex-col flex-grow">
      <h3 className="text-lg text-ink mb-2">{product.name}</h3>
      <p className="text-muted text-sm mb-4 line-clamp-2">{product.description}</p>
      <div className="flex justify-between items-center gap-3 mt-auto">
        <PriceTag product={product} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            // A configurable product can't be added blind — send the shopper
            // to the product page to pick its options first.
            if (needsOptions(product)) { onOpen(product.id); return; }
            onAdd(product);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          {needsOptions(product) ? 'בחירת אפשרויות' : 'הוספה לסל'}
        </button>
      </div>
    </div>
  </motion.div>
);

/** The showcase strip: the admin's chosen products looping past the shopper.
 *
 *  The list is tiled until it comfortably overflows the strip, and that whole
 *  pass is then rendered twice; the track slides exactly one pass-width, which
 *  is what makes the loop seamless. Without the tiling, two or three featured
 *  products would run out mid-loop and leave a gap. */
const FeaturedMarquee = ({ products, onOpen }: {
  products: Product[]; onOpen: (id: string) => void;
}) => {
  if (products.length === 0) return null;

  // A tile is 176px wide at its narrowest (w-40 + mx-2) and the strip is at most
  // 980px, so ~6 tiles already fill it. Ten is that with room to spare, which is
  // what keeps two or three featured products from leaving a gap mid-loop.
  const MIN_TILES_PER_PASS = 10;
  const repeats = Math.max(1, Math.ceil(MIN_TILES_PER_PASS / products.length));
  const set = Array.from({ length: repeats }, () => products).flat();
  // 5s per tile — the pass grows with the repeats, so the pixel speed stays put.
  const duration = `${set.length * 5}s`;

  const tile = (product: Product, key: string, ariaHidden: boolean) => (
    <button
      key={key}
      type="button"
      dir="rtl"
      aria-hidden={ariaHidden}
      tabIndex={ariaHidden ? -1 : 0}
      onClick={() => onOpen(product.id)}
      className="group w-40 sm:w-52 flex-shrink-0 mx-2 text-right"
    >
      <div className="aspect-square overflow-hidden bg-surface border border-line group-hover:border-line-strong transition-colors">
        {product.main_image ? (
          <img
            src={product.main_image}
            alt={product.alt_text || product.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-line-strong">
            <Package size={36} />
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-ink truncate">{product.name}</p>
      <PriceTag product={product} />
    </button>
  );

  return (
    <div className="marquee-viewport" style={{ ['--marquee-duration' as string]: duration }}>
      <div className="marquee-track py-1">
        {set.map((p, i) => tile(p, `a-${i}-${p.id}`, false))}
        {/* The second pass exists only to cover the seam — hidden from AT. */}
        {set.map((p, i) => tile(p, `b-${i}-${p.id}`, true))}
      </div>
    </div>
  );
};

function StoreApp() {
  const [view, setView] = useState<'user' | 'catalog' | 'checkout' | 'success' | 'product' | 'build-box'>('user');

  const {
    cart, addToCart, addLine, removeFromCart, updateQuantity, clearCart, repriceCart,
    settings,
    deliveryMethod, setDeliveryMethod, dedication, setDedication,
    appliedCoupon, couponInput, setCouponInput, couponError, clearCouponError,
    isValidatingCoupon, applyCoupon, removeCoupon, totals,
  } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  // The delivery choice lives in the cart context — it changes the total.
  const [checkoutData, setCheckoutData] = useState({ name: '', phone: '', email: '', shippingAddress: '' });
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [productQuantity, setProductQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, string>>({});
  const [brandingOptions, setBrandingOptions] = useState<BrandingOption[]>([]);
  const [selectedColor, setSelectedColor] = useState<ProductColorOption | null>(null);
  const [selectedLength, setSelectedLength] = useState<ProductLengthOption | null>(null);
  const [selectedBrandingId, setSelectedBrandingId] = useState<string>('');
  /** The name to put on the branding — only asked for when the product's
   *  `brandingNameField` is on. Free of charge, so it never touches the price. */
  const [brandingText, setBrandingText] = useState('');
  const [embroidery, setEmbroidery] = useState(EMPTY_EMBROIDERY_CHOICE);
  const [customerNotes, setCustomerNotes] = useState('');

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, message: '', customerName: '', photoFile: null as File | null, photoPreview: '' });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; phone?: string }>({});

  // Saved total for success page (finalTotal resets to 0 when cart is cleared)
  const [savedFinalTotal, setSavedFinalTotal] = useState(0);

  // Build-A-Box
  const [selectedBoxBase, setSelectedBoxBase] = useState<Product | null>(null);
  const [bundleItems, setBundleItems] = useState<{ product: Product; qty: number }[]>([]);
  const [bundleBoxStyle, setBundleBoxStyle] = useState<string>('');

  // WhatsApp bubble
  const [waVisible, setWaVisible] = useState(false);
  const waTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const urlInitDone = useRef(false);

  // Site content (CMS)
  const DEFAULT_CONTENT: SiteContent = {
    storeName: 'Tony',
    announcementBar: 'משלוח חינם בהזמנות מעל ₪200 ✨',
    heroTitle: 'Tony — אמנות המיתוג במארז אחד',
    heroSubtitle: 'מארזי מתנה יוקרתיים עם מיתוג אישי. לאירועים, לעסקים ולכל רגע מיוחד.',
    collectionsTitle: 'הקולקציות שלנו',
    aboutTitle: 'אודות',
    contactTitle: 'צור קשר',
    seoDescription: 'מארזי מתנה יוקרתיים עם מיתוג אישי. לאירועים, לעסקים ולכל רגע מיוחד.',
  };
  const [siteContent, setSiteContent] = useState<SiteContent>(DEFAULT_CONTENT);
  const [isContentLoading, setIsContentLoading] = useState(true);

  // Admin-uploaded promo images: a strip on the homepage, and an arrival popup.
  const [banners, setBanners] = useState<SiteBanner[]>([]);
  const [activePopup, setActivePopup] = useState<SiteBanner | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchData();
    // Show WhatsApp bubble after 15 seconds
    waTimerRef.current = setTimeout(() => setWaVisible(true), 15000);

    return () => {
      if (waTimerRef.current) clearTimeout(waTimerRef.current);
    };
  }, []);

  const homeBanners = banners.filter(b => b.placement === 'home');

  // Arrival popup — the first active popup banner, shown once per browser session.
  // The key carries the banner id, so a newly uploaded popup still greets someone
  // who dismissed the previous one.
  const popupSeenKey = (id: string) => `tony_popup_seen_${id}`;

  useEffect(() => {
    const banner = banners.find(b => b.placement === 'popup');
    if (!banner) return;
    try {
      if (sessionStorage.getItem(popupSeenKey(banner.id))) return;
    } catch { /* Safari private mode — just show it */ }
    const timer = setTimeout(() => setActivePopup(banner), 1500);
    return () => clearTimeout(timer);
  }, [banners]);

  const dismissPopup = () => {
    if (activePopup) {
      try { sessionStorage.setItem(popupSeenKey(activePopup.id), '1'); } catch { /* ignore */ }
    }
    setActivePopup(null);
  };

  useEffect(() => {
    if (!activePopup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissPopup(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePopup]);

  const fetchData = async () => {
    try {
      // `settings/store` is not fetched here — the cart context subscribes to it,
      // so the store rules stay live rather than being read once at boot.
      const [productsSnapshot, categoriesSnapshot, brandingSnapshot, bannersSnapshot, contentDoc] = await Promise.all([
        getDocs(query(collection(db, "products"), orderBy("created_at", "desc"))),
        getDocs(collection(db, "categories")),
        getDocs(collection(db, "branding_options")),
        // Banners are decoration — a failed read (e.g. rules not deployed yet) must not
        // take the catalogue down with it, so this one settles to null instead of rejecting.
        getDocs(collection(db, "site_banners")).catch(err => {
          console.error("[Banners] fetch failed:", err);
          return null;
        }),
        getDoc(doc(db, "settings", "content")),
      ]);

      setProducts(productsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
      setCategories(categoriesSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Category[]);
      setBrandingOptions(
        (brandingSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as BrandingOption[])
          .filter(b => b.isActive !== false)
      );
      if (bannersSnapshot) {
        setBanners(
          (bannersSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as SiteBanner[])
            .filter(b => b.isActive && b.imageUrl)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        );
      }
      if (contentDoc.exists()) setSiteContent(prev => ({ ...prev, ...contentDoc.data() as SiteContent }));
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setIsContentLoading(false);
    }
  };

  // SEO: sync document.title and meta description whenever content changes
  React.useEffect(() => {
    document.title = siteContent.storeName
      ? `${siteContent.storeName} — ${siteContent.heroTitle || 'חנות מקוונת'}`
      : 'Tony — אמנות המיתוג במארז אחד';
    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (metaDesc && siteContent.seoDescription) metaDesc.content = siteContent.seoDescription;
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = document.title;
    const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDesc && siteContent.seoDescription) ogDesc.content = siteContent.seoDescription;
  }, [siteContent.storeName, siteContent.heroTitle, siteContent.seoDescription]);

  // ── URL-based navigation ───────────────────────────────────────────────────
  const VIEW_URLS: Record<string, string> = {
    user: '/', catalog: '/catalog', checkout: '/checkout', success: '/success', 'build-box': '/build-box',
  };
  const navigateTo = (newView: typeof view, productId?: string) => {
    const url = newView === 'product' && productId
      ? `/product/${productId}`
      : VIEW_URLS[newView] ?? '/';
    window.history.pushState({ view: newView, productId: productId ?? null }, '', url);
    setView(newView);
  };

  // Handle browser back / forward
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = e.state as { view: string; productId: string | null } | null;
      const target = (s?.view ?? 'user') as typeof view;
      setView(target);
      if (target === 'product' && s?.productId) fetchProductDetails(s.productId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [products]); // re-bind when products load so fetchProductDetails has fresh closure

  // Detect return from Grow payment redirect — runs immediately on mount before products load.
  // Trigger on the /success path itself (not on a specific query param) so the success page and
  // cart-clear are reliable regardless of which params Grow appends to the redirect.
  useEffect(() => {
    if (window.location.pathname !== '/success') return;
    const orderId = new URLSearchParams(window.location.search).get('orderId');
    if (orderId) setLastOrderId(orderId);
    clearCart();                // clear cart now that the customer has returned from payment
    setView('success');
    urlInitDone.current = true; // prevent the products-dependent effect from overriding
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize view from URL once products are available (handles direct links & refresh)
  useEffect(() => {
    if (products.length === 0 || urlInitDone.current) return;
    urlInitDone.current = true;
    const path = window.location.pathname;
    window.history.replaceState({ view: 'user', productId: null }, '', path);
    if (path.startsWith('/product/')) {
      fetchProductDetails(path.replace('/product/', ''));
    } else if (path === '/checkout') {
      setView('checkout');
    } else if (path === '/success') {
      setView('success');
    } else if (path === '/build-box') {
      setView('build-box');
    } else if (path === '/catalog') {
      setView('catalog');
    }
  }, [products]);

  const fetchProductDetails = (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    setSelectedProduct(product);
    setSelectedImageIndex(0);
    setProductQuantity(1);
    setSelectedVariations({});
    setSelectedColor(null);
    setSelectedLength(null);
    setSelectedBrandingId('');
    setBrandingText('');
    setEmbroidery(EMPTY_EMBROIDERY_CHOICE);
    setReviews([]);
    setReviewForm({ rating: 5, message: '', customerName: '', photoFile: null, photoPreview: '' });
    navigateTo('product', id);
    window.scrollTo(0, 0);
    fetchReviews(id);
  };

  const fetchReviews = async (productId: string) => {
    setIsLoadingReviews(true);
    try {
      const snap = await getDocs(query(collection(db, 'reviews'), where('product_id', '==', productId), orderBy('created_at', 'desc')));
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Review[]);
    } catch (err) {
      console.error('Error fetching reviews:', err);
    } finally {
      setIsLoadingReviews(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedProduct || !reviewForm.customerName.trim() || !reviewForm.message.trim()) {
      alert('נא למלא שם וטקסט ביקורת');
      return;
    }
    setIsSubmittingReview(true);
    try {
      let photoUrl = '';
      if (reviewForm.photoFile) {
        const storageRef = ref(storage, `reviews/${Date.now()}_${reviewForm.photoFile.name}`);
        await uploadBytes(storageRef, reviewForm.photoFile);
        photoUrl = await getDownloadURL(storageRef);
      }
      // Written server-side: `reviews` creates are denied to clients so the
      // submission can be throttled, which a Firestore rule cannot do.
      await submitReviewFn({
        productId: selectedProduct.id,
        customerName: reviewForm.customerName.trim(),
        rating: reviewForm.rating,
        message: reviewForm.message.trim(),
        ...(photoUrl && { photoUrl }),
      });
      showToast('תודה על הביקורת! 🌸');
      setReviewForm({ rating: 5, message: '', customerName: '', photoFile: null, photoPreview: '' });
      fetchReviews(selectedProduct.id);
    } catch (err) {
      console.error('Error submitting review:', err);
      // submitReview returns Hebrew copy for what the visitor can act on —
      // a rating out of range, an empty field, or the throttle having tripped.
      const message = (err as { message?: string })?.message;
      alert(message && !/internal|unavailable/i.test(message) ? message : 'שגיאה בשליחת הביקורת');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Build-A-Box helpers — a discounted product is discounted inside a bundle too.
  const bundleTotal = (selectedBoxBase ? effectivePrice(selectedBoxBase).final : 0)
    + bundleItems.reduce((sum, bi) => sum + effectivePrice(bi.product).final * bi.qty, 0);
  const addBundleItem = (product: Product) => {
    setBundleItems(prev => {
      const existing = prev.find(bi => bi.product.id === product.id);
      if (existing) return prev.map(bi => bi.product.id === product.id ? { ...bi, qty: bi.qty + 1 } : bi);
      return [...prev, { product, qty: 1 }];
    });
  };
  const removeBundleItem = (productId: string) => {
    setBundleItems(prev => prev.filter(bi => bi.product.id !== productId));
  };
  const updateBundleQty = (productId: string, delta: number) => {
    setBundleItems(prev => prev.map(bi => bi.product.id === productId ? { ...bi, qty: Math.max(1, bi.qty + delta) } : bi).filter(bi => bi.qty > 0));
  };
  const addBundleToCart = () => {
    if (!selectedBoxBase) return;
    const bundleProduct: Product = {
      ...selectedBoxBase,
      id: `bundle_${Date.now()}`,
      name: `מארז אישי — ${selectedBoxBase.name}`,
      // bundleTotal already has every discount applied. Carrying the box base's own
      // discount onto the bundle would discount the whole bundle a second time.
      price: bundleTotal,
      discount: undefined,
      images: selectedBoxBase.images,
    };
    const cartBundle: CartItem = {
      ...bundleProduct,
      quantity: 1,
      unitPrice: bundleProduct.price,
      // The line id is synthetic, so the box base is recorded separately — it is
      // what `createOrder` re-prices the bundle from at checkout.
      boxBaseId: selectedBoxBase.id,
      bundleItems: bundleItems.map(bi => ({
        id: bi.product.id, name: bi.product.name,
        price: effectivePrice(bi.product).final, quantity: bi.qty,
      })),
    };
    addLine(cartBundle);
    setSelectedBoxBase(null);
    setBundleItems([]);
    setBundleBoxStyle('');
    setIsCartOpen(true);
    navigateTo('user');
    showToast('המארז נוסף לסל! 🎁');
  };

  // WhatsApp smart message
  const getWhatsAppLink = () => {
    const phone = '972526268436';
    let msg = 'היי, אשמח לעזרה בבחירת מתנה';
    if (view === 'product' && selectedProduct) {
      msg = `היי טוני, יש לי שאלה לגבי ${selectedProduct.name}`;
    }
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  /** One-line summary of everything the shopper picked, for the cart drawer. */
  const cartLineOptions = (item: CartItem) => [
    ...Object.entries(item.selectedVariations ?? {}).map(([k, v]) => `${k}: ${v}`),
    item.selectedColor && `${item.colorLabel ?? 'צבע'}: ${item.selectedColor.name}`,
    item.selectedLength && `אורך: ${item.selectedLength.label}`,
    item.selectedBranding && `מיתוג: ${item.selectedBranding.label}`,
    item.brandingText && `שם למיתוג: ${item.brandingText}`,
    item.embroideryFirstName && `רקמת שם פרטי: ${item.embroideryFirstName.text}`,
    item.embroideryLastName && `רקמת שם משפחה: ${item.embroideryLastName.text}`,
  ].filter(Boolean).join(' | ');

  // Every ₪ below comes out of the cart context's single `computeTotals()` pass —
  // coupon discount, free-shipping waiver, threshold gift and greeting card included.
  const { subtotal: cartTotal, discountAmount, shippingCost, cardCost, total: finalTotal } = totals;

  // ── Product page: live option pricing ──────────────────────────────────
  // The branding options this product opted into, resolved against the global catalog.
  const productBrandingOptions = selectedProduct
    ? brandingOptions.filter(b => (selectedProduct.brandingOptionIds ?? []).includes(b.id))
    : [];
  const selectedBranding = productBrandingOptions.find(b => b.id === selectedBrandingId) ?? null;
  /** Ask for the name only once there is something to put it on: the product
   *  switched the field on, and either it offers no figures at all or the
   *  shopper picked one ("ללא דמות" leaves nothing to write the name beside). */
  const brandingNameOffered = selectedProduct?.brandingNameField === true
    && (productBrandingOptions.length === 0 || !!selectedBranding);
  /** Name embroidery, per half. The admin enables and prices each one on the
   *  product itself, so a half that is off simply isn't offered. */
  const embroideryOffered = {
    firstName: selectedProduct?.embroidery?.firstName?.enabled === true,
    lastName: selectedProduct?.embroidery?.lastName?.enabled === true,
  };
  const embroideryPrices = {
    firstName: embroideryPrice(selectedProduct?.embroidery?.firstName),
    lastName: embroideryPrice(selectedProduct?.embroidery?.lastName),
  };
  /** Only counts once the half is both offered *and* ticked — an add-on the
   *  product no longer offers must not survive in the price the shopper sees. */
  const embroideryPicked = {
    firstName: embroideryOffered.firstName && embroidery.firstName.on,
    lastName: embroideryOffered.lastName && embroidery.lastName.on,
  };
  const embroiderySurcharge =
    (embroideryPicked.firstName ? embroideryPrices.firstName : 0) +
    (embroideryPicked.lastName ? embroideryPrices.lastName : 0);

  const productSurcharge =
    (selectedLength?.priceDelta ?? 0) + (selectedBranding?.extraCost ?? 0) + embroiderySurcharge;
  const productPricing = selectedProduct
    ? effectivePrice(selectedProduct)
    : { list: 0, final: 0, isDiscounted: false, percentOff: 0 };
  const productUnitPrice = productPricing.final + productSurcharge;
  // Show a "starting from" prefix until the shopper has picked every option that could add cost.
  const hasSurchargeOptions = !!(
    selectedProduct?.lengthOptions?.some(l => l.priceDelta > 0) ||
    productBrandingOptions.some(b => b.extraCost > 0) ||
    embroideryPrices.firstName > 0 || embroideryPrices.lastName > 0
  );
  const hasPickedSurcharge = productSurcharge > 0;

  /** Pick a legible check mark for a swatch — dark tick on pale colors, white on dark ones. */
  const isLightHex = (hex: string) => {
    const h = hex.replace('#', '');
    if (h.length !== 6) return true;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
  };

  // Validation rules (kept strict so the Make.com pipeline gets clean data)
  const NAME_RE = /^[֐-׿a-zA-Z][֐-׿a-zA-Z\s'\-]{1,99}$/;
  const isValidName = (s: string) => {
    const t = s.trim();
    return NAME_RE.test(t) && t.split(/\s+/).filter(w => w.length >= 2).length >= 2;
  };
  const normalizePhone = (s: string) => s.replace(/[\s\-()]/g, '').replace(/^\+972/, '0');
  const isValidPhone = (s: string) => /^05\d{8}$/.test(normalizePhone(s));

  const NAME_ERROR = 'נא להזין שם פרטי ומשפחה (לפחות 2 אותיות בכל מילה)';
  const PHONE_ERROR = 'מספר נייד ישראלי לא תקין — חייב להתחיל ב-05 ולכלול 10 ספרות';

  const handleCheckout = async () => {
    const nameErr = isValidName(checkoutData.name) ? undefined : NAME_ERROR;
    const phoneErr = isValidPhone(checkoutData.phone) ? undefined : PHONE_ERROR;
    if (nameErr || phoneErr) {
      setFormErrors({ name: nameErr, phone: phoneErr });
      document.getElementById(nameErr ? 'checkout-name' : 'checkout-phone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (deliveryMethod === 'delivery' && !checkoutData.shippingAddress.trim()) return alert("נא להזין כתובת למשלוח");
    if (!totals.meetsMinimum) return alert(`סכום ההזמנה המינימלי הוא ₪${formatPrice(totals.minOrderAmount)}`);
    // Guard against a NaN/negative total (rules require total_price >= 0), e.g. malformed delivery_cost setting.
    if (!Number.isFinite(finalTotal) || finalTotal < 0) return alert("שגיאה בחישוב הסכום. רעננו את הדף ונסו שוב.");

    setIsCreatingPayment(true);

    // Only the *selections* travel to the server. Prices, discounts, shipping and
    // the gift are all re-derived there from the catalog — a total sent from here
    // would be a total the shopper could edit.
    const orderLines: CreateOrderLine[] = cart.map(i => {
      // A Build-A-Box line's own id is synthetic and its price was computed in
      // the browser — send the recipe instead and let the server cost it.
      if (i.bundleItems?.length) {
        return {
          quantity: i.quantity,
          bundle: {
            boxBaseId: i.boxBaseId ?? '',
            items: i.bundleItems.map(b => ({ productId: b.id, quantity: b.quantity })),
          },
        };
      }
      return {
        productId: i.id,
        quantity: i.quantity,
        ...(i.selectedVariations && Object.keys(i.selectedVariations).length > 0 && { selectedVariations: i.selectedVariations }),
        ...(i.selectedColor && { selectedColorName: i.selectedColor.name }),
        ...(i.selectedLength && { selectedLengthLabel: i.selectedLength.label }),
        ...(i.selectedBranding && { selectedBrandingId: i.selectedBranding.id }),
        ...(i.brandingText && { brandingText: i.brandingText }),
        ...(i.embroideryFirstName?.text && { embroideryFirstName: i.embroideryFirstName.text }),
        ...(i.embroideryLastName?.text && { embroideryLastName: i.embroideryLastName.text }),
      };
    });

    // A box built before `boxBaseId` was recorded cannot be re-priced server-side.
    // Those lines predate this checkout flow and only exist in a localStorage cart
    // that has been sitting open — ask for a rebuild rather than failing opaquely.
    if (orderLines.some(l => l.bundle && !l.bundle.boxBaseId)) {
      alert("מארז אישי בסל נוצר בגרסה קודמת של האתר. אנא הסירו אותו ובנו אותו מחדש.");
      setIsCreatingPayment(false);
      return;
    }

    // ── 1. Create the order server-side — do NOT show success UI yet ──
    // The server prices the cart from the catalog and refuses the order if its
    // total differs from `expectedTotal`, so the shopper is never sent to a
    // payment page for a number they have not seen.
    let order: CreateOrderResponse;
    try {
      const result = await createOrderFn({
        customerName: checkoutData.name,
        customerPhone: checkoutData.phone,
        ...(checkoutData.email && { customerEmail: checkoutData.email }),
        deliveryMethod,
        ...(deliveryMethod === 'delivery' && { shippingAddress: checkoutData.shippingAddress }),
        items: orderLines,
        ...(appliedCoupon && { couponCode: appliedCoupon.code }),
        ...(dedication.message.trim() && {
          dedicationMessage: dedication.message.trim(),
          dedicationCardType: dedication.cardType,
        }),
        ...(customerNotes.trim() && { customerNotes: customerNotes.trim() }),
        expectedTotal: finalTotal,
      });
      order = result.data;
      // Telegram notification fires automatically via onOrderCreated Cloud Function trigger
    } catch (err) {
      console.error("[Checkout] createOrder failed:", err);
      const { message, details } = (err ?? {}) as { message?: string; details?: { reason?: string } };

      // The cart has gone stale — a sale ended, a price was edited, a coupon was
      // exhausted. Pull the lines back in line with the catalog so the corrected
      // summary is what the shopper sees; without this the retry would fail the
      // same way forever, because the cart is a frozen localStorage snapshot.
      if (details?.reason === 'total_mismatch') {
        await repriceCart();
      }

      // The function returns Hebrew copy for everything the shopper can act on
      // (a stale price, a sold-out option, below the minimum order).
      alert(message && !/internal|unavailable/i.test(message)
        ? message
        : "שגיאה בשמירת ההזמנה. אנא בדקו את חיבור האינטרנט ונסו שוב.");
      setIsCreatingPayment(false);
      return;
    }

    // ── 2. POST to Make.com webhook (network) → get payment URL ──
    // `total_price` here is the server-computed figure, echoed for convenience.
    // ⚠ The Make.com scenario must read the amount to charge from the Firestore
    // order document keyed by `orderId` — this endpoint is public, so anything
    // in the body is attacker-controllable regardless of what the client sends.
    let response: Response;
    try {
      response = await fetch("https://hook.eu1.make.com/77c28f0f26ja6igr5wb6356nd89nfqip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.orderId,
          total_price: order.total,
          customer_name: checkoutData.name.trim(),
          customer_phone: normalizePhone(checkoutData.phone),
        }),
      });
    } catch (err) {
      // fetch only rejects on network-level failures (offline, DNS, blocked CORS preflight)
      console.error("[Checkout] Webhook request failed (network/CORS). Order ID:", order.orderId, err);
      alert("שגיאת רשת ביצירת התשלום. אנא בדקו את חיבור האינטרנט ונסו שוב.");
      setIsCreatingPayment(false);
      return;
    }

    // ── 3. Validate + parse webhook response, then extract payment_url ──
    // Read the body once as text so we can log the raw response for debugging.
    const rawResponse = await response.text();

    if (!response.ok) {
      console.error(`[Checkout] Webhook returned HTTP ${response.status} ${response.statusText}. Raw response:`, rawResponse);
      alert("שגיאה ביצירת התשלום (תגובת שרת שגויה). אנא נסו שוב.");
      setIsCreatingPayment(false);
      return;
    }

    let responseData: { payment_url?: string };
    try {
      responseData = JSON.parse(rawResponse);
    } catch (err) {
      console.error("[Checkout] Webhook response is not valid JSON. Raw response:", rawResponse, err);
      alert("שגיאה ביצירת התשלום (תגובה לא תקינה מהשרת). אנא נסו שוב.");
      setIsCreatingPayment(false);
      return;
    }

    if (!responseData.payment_url) {
      console.error("[Checkout] Webhook response is missing payment_url. Parsed response:", responseData, "Raw response:", rawResponse);
      alert("שגיאה ביצירת קישור התשלום. אנא נסו שוב.");
      setIsCreatingPayment(false);
      return;
    }

    // ── 4. Redirect to the payment page — page navigates away here ──
    console.log("[Checkout] Redirecting to payment URL for order", order.orderId, "→", responseData.payment_url);
    window.location.href = responseData.payment_url;
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

  // ── The home-page showcase ────────────────────────────────────────────────
  // The admin picks which products advertise the store; the rest live behind
  // the catalog link. Ids are resolved against the catalog, so one pointing at
  // a deleted product simply drops out — and if nothing survives (or nothing
  // was ever picked) the home page falls back to showing the whole catalog,
  // which is what every install did before this setting existed.
  const featuredProducts = settings.featured_enabled === false
    ? []
    : (settings.featured_product_ids ?? [])
        .map(id => products.find(p => p.id === id))
        .filter((p): p is Product => !!p);
  const isShowcase = featuredProducts.length > 0;
  const featuredTitle = settings.featured_title?.trim() || 'מוצרים נבחרים';

  const openCatalog = (categoryId: string | null = null) => {
    setSelectedCategory(categoryId);
    navigateTo('catalog');
    window.scrollTo(0, 0);
  };

  /** The catalog grid — the home page in fallback mode, and the whole of /catalog. */
  const productGrid = (list: Product[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      {list.map(product => (
        <ProductCard key={product.id} product={product} onOpen={fetchProductDetails} onAdd={addToCart} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen pb-20">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white px-6 py-3 rounded-2xl shadow-xl font-bold text-sm"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Announcement Bar — the one solid-ink surface on the page */}
      {(isContentLoading || siteContent.announcementBar) && (
        <div className="bg-ink text-cream text-center py-2 px-4 text-sm font-medium">
          {isContentLoading
            ? <span className="inline-block w-64 h-4 bg-cream/30 rounded animate-pulse" />
            : siteContent.announcementBar}
        </div>
      )}

      {/* Header — 3-column grid so the centre slot stays optically centered regardless
          of how wide the side clusters get (flex justify-between would not). */}
      <header className="bg-surface/85 backdrop-blur-md sticky top-0 z-50 border-b border-line">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-16 md:h-20 grid grid-cols-3 items-center">
          <div className="flex items-center gap-1 justify-self-start">
            <button
              onClick={() => setIsMenuOpen(true)}
              aria-label="פתיחת תפריט"
              className="p-2 hover:bg-ink/5 rounded-full transition-colors"
            >
              <Menu size={22} className="text-ink" />
            </button>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="hidden sm:flex p-2 rounded-full text-ink hover:bg-ink/5 transition-colors"
            >
              <Instagram size={20} />
            </a>
            <a
              href={getWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="hidden sm:flex p-2 rounded-full text-ink hover:bg-ink/5 transition-colors"
            >
              <WhatsAppIcon size={20} />
            </a>
          </div>

          {/* The wordmark now lives large in the hero, so the header keeps only an
              unobtrusive home link in the centre slot. */}
          <button
            onClick={() => navigateTo('user')}
            aria-label="Tony — לדף הבית"
            className="justify-self-center text-ink text-sm tracking-[0.3em] uppercase hover:opacity-60 transition-opacity"
          >
            Tony
          </button>

          <div className="justify-self-end">
          <button
            onClick={() => setIsCartOpen(true)}
            aria-label="סל הקניות"
            className="relative p-2 bg-ink/5 text-ink rounded-full hover:bg-ink/10 transition-colors"
          >
            <ShoppingCart size={20} />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-ink text-cream text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-surface">
                {cart.reduce((a, b) => a + b.quantity, 0)}
              </span>
            )}
          </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[980px] mx-auto px-6 py-8">
        {isLoadingProduct && (
          <div className="fixed inset-0 bg-cream/50 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-ink border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {view === 'user' && (
          <div className="space-y-12">
            {/* Hero Section — the wordmark itself is the headline. /logo.png is
                background-free, so it needs no mixBlendMode and sits on cream. */}
            <div className="text-center py-10">
              <h1 className="sr-only">{siteContent.heroTitle || 'Tony Amrami'}</h1>
              <img
                src="/logo.png"
                alt="Tony Amrami"
                width={2100}
                height={1014}
                fetchPriority="high"
                className="w-full max-w-2xl mx-auto h-auto"
              />
            </div>

            {/* Admin-uploaded promo banners */}
            {homeBanners.length > 0 && (
              <div className="space-y-6">
                {homeBanners.map(banner => {
                  const image = (
                    <img
                      src={banner.imageUrl}
                      alt={banner.title || 'מבצע'}
                      className="w-full h-auto object-cover"
                      referrerPolicy="no-referrer"
                    />
                  );
                  return banner.linkUrl ? (
                    <a key={banner.id} href={banner.linkUrl} target="_blank" rel="noopener noreferrer"
                      className="block overflow-hidden border border-line hover:border-line-strong transition-colors">
                      {image}
                    </a>
                  ) : (
                    <div key={banner.id} className="overflow-hidden border border-line">
                      {image}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Showcase strip — the products the admin is advertising. It breaks
                out of the 980px column so the tiles run edge to edge. */}
            {isShowcase && (
              <section className="space-y-5" aria-label={featuredTitle}>
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-bold text-gray-800">{featuredTitle}</h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-[#1A1A18]/30 to-transparent" />
                </div>
                <div className="-mx-6">
                  <FeaturedMarquee products={featuredProducts} onOpen={fetchProductDetails} />
                </div>
              </section>
            )}

            {/* In showcase mode the strip above *is* the home page — no grid
                under it. Without a selection this is still the catalog. */}
            {isShowcase ? (
              <div className="text-center">
                <button onClick={() => openCatalog(null)} className="btn-secondary inline-flex items-center gap-2">
                  לקטלוג המלא
                  <ChevronLeft size={18} />
                </button>
                <p className="text-muted text-sm mt-3">
                  {products.length} מוצרים בחנות
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  {isContentLoading
                    ? <div className="h-7 w-40 bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg animate-pulse" />
                    : <h3 className="text-2xl font-bold text-gray-800">{siteContent.collectionsTitle}</h3>}
                  <div className="flex-1 h-px bg-gradient-to-r from-[#1A1A18]/30 to-transparent" />
                </div>
                {productGrid(products)}
              </>
            )}
          </div>
        )}

        {view === 'catalog' && (
          <div className="space-y-8">
            <button onClick={() => navigateTo('user')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800">
              <ChevronRight size={20} /> חזרה לדף הבית
            </button>

            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-gray-800">
                {categories.find(c => c.id === selectedCategory)?.name ?? 'כל המוצרים'}
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-[#1A1A18]/30 to-transparent" />
            </div>

            {/* Category filter — the drawer does this too, but a shopper who
                landed on /catalog directly shouldn't have to go find it. */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSelectedCategory(null)}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${!selectedCategory ? 'bg-ink text-cream border-ink' : 'border-line text-body hover:border-line-strong'}`}>
                  הכל
                </button>
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${selectedCategory === cat.id ? 'bg-ink text-cream border-ink' : 'border-line text-body hover:border-line-strong'}`}>
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {filteredProducts.length === 0
              ? <p className="text-muted text-center py-12">אין מוצרים בקטגוריה הזו.</p>
              : productGrid(filteredProducts)}
          </div>
        )}

        {view === 'product' && selectedProduct && (
          <div className="space-y-8">
            <button onClick={() => navigateTo('user')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800">
              <ChevronRight size={20} /> חזרה לחנות
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-4">
                {/* No forced aspect ratio here: whatever the admin uploaded is shown
                    whole. `object-contain` + a max height keeps a very tall photo from
                    running off the screen without ever cropping it. */}
                <div className="rounded-3xl overflow-hidden bg-cream shadow-inner flex items-center justify-center min-h-[280px]">
                  <img
                    src={selectedProduct.images?.[selectedImageIndex] || selectedProduct.main_image}
                    alt={selectedProduct.name}
                    className="w-full max-h-[620px] object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {selectedProduct.images && selectedProduct.images.length > 1 && (
                  <div className="grid grid-cols-4 gap-4">
                    {selectedProduct.images.map((img, idx) => (
                      <div
                        key={idx}
                        className={`aspect-square rounded-xl overflow-hidden cursor-pointer bg-cream border-2 transition-all ${selectedImageIndex === idx ? 'border-ink' : 'border-transparent'}`}
                        onClick={() => setSelectedImageIndex(idx)}
                      >
                        {/* Contain too, so the thumbnail previews the same framing as the main image. */}
                        <img src={img} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-6">
                <h2 className="text-4xl text-ink">{selectedProduct.name}</h2>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {hasSurchargeOptions && !hasPickedSurcharge && (
                      <span className="text-sm text-muted">החל מ-</span>
                    )}
                    <PriceTag product={selectedProduct} surcharge={productSurcharge} size="lg" />
                  </div>
                  {productSurcharge > 0 && (
                    <p className="text-sm text-muted mt-1">
                      ₪{formatPrice(productPricing.final)} + ₪{formatPrice(productSurcharge)} תוספות
                    </p>
                  )}
                </div>
                <p className="text-body text-lg leading-relaxed">{selectedProduct.description}</p>

                {selectedProduct.variations && selectedProduct.variations.length > 0 && (
                  <div className="space-y-4">
                    {selectedProduct.variations.map(variation => (
                      <div key={variation.name}>
                        <label className="block text-sm font-medium text-ink mb-2">{variation.name}:</label>
                        <div className="flex flex-wrap gap-2">
                          {variation.values.map(value => (
                            <button
                              key={value}
                              onClick={() => setSelectedVariations(prev => ({ ...prev, [variation.name]: value }))}
                              className={`px-4 py-2 rounded-full border text-sm transition-all ${
                                selectedVariations[variation.name] === value
                                  ? 'bg-ink text-cream border-ink'
                                  : 'border-line text-body hover:border-ink bg-surface'
                              }`}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Colors — selecting one swaps the gallery to that color's image */}
                {selectedProduct.colorOptions && selectedProduct.colorOptions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">
                      {selectedProduct.colorLabel ?? 'צבע'}{selectedColor ? `: ${selectedColor.name}` : ''}
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {selectedProduct.colorOptions.map(color => (
                        <button
                          key={color.name}
                          title={color.name}
                          aria-label={color.name}
                          aria-pressed={selectedColor?.name === color.name}
                          onClick={() => {
                            setSelectedColor(color);
                            const idx = color.imageUrl ? (selectedProduct.images ?? []).indexOf(color.imageUrl) : -1;
                            if (idx >= 0) setSelectedImageIndex(idx);
                          }}
                          className={`w-9 h-9 rounded-full border border-line-strong flex items-center justify-center transition-all ${
                            selectedColor?.name === color.name
                              ? 'ring-2 ring-ink ring-offset-2 ring-offset-cream'
                              : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: color.hex }}
                        >
                          {selectedColor?.name === color.name && (
                            <Check size={16} className={isLightHex(color.hex) ? 'text-ink' : 'text-white'} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Length */}
                {selectedProduct.lengthOptions && selectedProduct.lengthOptions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">אורך:</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.lengthOptions.map(len => (
                        <button
                          key={len.label}
                          onClick={() => setSelectedLength(len)}
                          className={`px-4 py-2 rounded-full border text-sm transition-all ${
                            selectedLength?.label === len.label
                              ? 'bg-ink text-cream border-ink'
                              : 'border-line text-body hover:border-ink bg-surface'
                          }`}
                        >
                          {len.label}
                          {len.priceDelta > 0 && ` (+₪${formatPrice(len.priceDelta)})`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Branding (מיתוג) — catalog picker, plus the optional name that
                    goes on it when the product asks for one. */}
                {(productBrandingOptions.length > 0 || brandingNameOffered) && (
                  <div>
                    <label htmlFor="branding-select" className="block text-sm font-medium text-ink mb-2">מיתוג:</label>
                    {productBrandingOptions.length > 0 && (
                      <select
                        id="branding-select"
                        value={selectedBrandingId}
                        onChange={(e) => setSelectedBrandingId(e.target.value)}
                        className="w-full bg-surface border border-line px-4 py-3 text-ink outline-none focus:border-ink transition-colors"
                      >
                        <option value="">— ללא דמות —</option>
                        {productBrandingOptions.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.label}{b.extraCost > 0 ? ` (+₪${formatPrice(b.extraCost)})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {brandingNameOffered && (
                      <div className={productBrandingOptions.length > 0 ? 'mt-3' : ''}>
                        <input
                          id="branding-name"
                          type="text"
                          maxLength={40}
                          value={brandingText}
                          onChange={(e) => setBrandingText(e.target.value)}
                          placeholder="שם למיתוג (למשל: נועה)"
                          aria-label="שם למיתוג"
                          className="w-full bg-surface border border-line px-4 py-3 text-ink outline-none focus:border-ink transition-colors"
                        />
                        <p className="text-muted text-xs mt-2">אופציונלי — נכתוב בדיוק כפי שיוקלד.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Embroidery (רקמת שם) — each half is a paid extra the admin
                    switched on and priced for this product, so it is opt-in:
                    ticking it reveals the name box and adds the surcharge. */}
                {(embroideryOffered.firstName || embroideryOffered.lastName) && (
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">רקמת שם:</label>
                    <div className="space-y-3">
                      {([
                        { half: 'firstName', label: 'רקמת שם פרטי', placeholder: 'למשל: נועה', inputId: 'embroidery-first' },
                        { half: 'lastName', label: 'רקמת שם משפחה', placeholder: 'למשל: כהן', inputId: 'embroidery-last' },
                      ] as const).filter(({ half }) => embroideryOffered[half]).map(({ half, label, placeholder, inputId }) => (
                        <div key={half} className="border border-line bg-surface p-4">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={embroidery[half].on}
                              onChange={(e) => {
                                const on = e.target.checked;
                                // Unticking must not leave an orphan name behind.
                                setEmbroidery(prev => ({ ...prev, [half]: { on, text: on ? prev[half].text : '' } }));
                              }}
                              className="w-4 h-4 accent-[#1A1A18]"
                            />
                            <span className="text-sm text-ink flex-1">{label}</span>
                            <span className="text-sm text-muted">
                              {embroideryPrices[half] > 0 ? `+₪${formatPrice(embroideryPrices[half])}` : 'ללא תוספת תשלום'}
                            </span>
                          </label>
                          {embroidery[half].on && (
                            <input
                              id={inputId}
                              type="text"
                              maxLength={40}
                              value={embroidery[half].text}
                              onChange={(e) => setEmbroidery(prev => ({ ...prev, [half]: { ...prev[half], text: e.target.value } }))}
                              placeholder={placeholder}
                              aria-label={label}
                              className="mt-3 w-full bg-cream border border-line px-4 py-3 text-ink outline-none focus:border-ink transition-colors"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-muted text-xs mt-2">נרקום בדיוק כפי שיוקלד.</p>
                  </div>
                )}

                <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl w-fit">
                  <span className="text-gray-500 font-medium">כמות:</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))}
                      className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-ink transition-colors"
                    >
                      <Minus size={20} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={productQuantity}
                      onChange={(e) => setProductQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 text-center bg-transparent font-bold text-xl outline-none"
                    />
                    <button
                      onClick={() => setProductQuantity(productQuantity + 1)}
                      className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-ink transition-colors"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const missing = (selectedProduct.variations ?? [])
                      .filter(v => !selectedVariations[v.name])
                      .map(v => v.name);
                    if (selectedProduct.colorOptions?.length && !selectedColor) missing.push(selectedProduct.colorLabel ?? 'צבע');
                    if (selectedProduct.lengthOptions?.length && !selectedLength) missing.push('אורך');
                    if (missing.length > 0) {
                      alert(`נא לבחור: ${missing.join(', ')}`);
                      return;
                    }
                    // Embroidery is charged for, so a ticked box with no name is
                    // a charge for nothing — ask rather than silently drop it.
                    const blankEmbroidery = [
                      embroideryPicked.firstName && !embroidery.firstName.text.trim() && 'שם פרטי לרקמה',
                      embroideryPicked.lastName && !embroidery.lastName.text.trim() && 'שם משפחה לרקמה',
                    ].filter(Boolean);
                    if (blankEmbroidery.length > 0) {
                      alert(`נא למלא: ${blankEmbroidery.join(', ')}`);
                      return;
                    }
                    addToCart(
                      selectedProduct,
                      productQuantity,
                      Object.keys(selectedVariations).length > 0 ? selectedVariations : undefined,
                      {
                        // Branding stays optional — "ללא דמות" is a valid purchase.
                        ...(selectedColor && { selectedColor }),
                        ...(selectedLength && { selectedLength }),
                        ...(selectedBranding && {
                          selectedBranding: {
                            id: selectedBranding.id,
                            label: selectedBranding.label,
                            extraCost: selectedBranding.extraCost,
                          },
                        }),
                        // Only when the field is actually being shown: a name typed
                        // before the shopper switched back to "ללא דמות" is stale.
                        ...(brandingNameOffered && brandingText.trim() && {
                          brandingText: brandingText.trim(),
                        }),
                        ...(embroideryPicked.firstName && {
                          embroideryFirstName: {
                            text: embroidery.firstName.text.trim(),
                            price: embroideryPrices.firstName,
                          },
                        }),
                        ...(embroideryPicked.lastName && {
                          embroideryLastName: {
                            text: embroidery.lastName.text.trim(),
                            price: embroideryPrices.lastName,
                          },
                        }),
                      },
                    );
                    setIsCartOpen(true);
                  }}
                  className="w-full btn-primary text-xl py-5 flex items-center justify-center gap-3"
                >
                  <ShoppingCart size={24} />
                  הוספה לסל הקניות
                </button>
              </div>
            </div>

            {/* ── Customer Reviews ──────────────────────────────────────── */}
            <div className="surface-card p-8 space-y-8">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <Star size={24} className="text-ink" fill="#1A1A18" />
                ביקורות לקוחות
                {reviews.length > 0 && <span className="text-base font-normal text-gray-400">({reviews.length})</span>}
              </h3>

              {/* Existing reviews */}
              {isLoadingReviews ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={28} className="animate-spin text-ink" />
                </div>
              ) : reviews.length === 0 ? (
                <p className="text-gray-400 text-center py-4">היה הראשון לכתוב ביקורת 🌸</p>
              ) : (
                <div className="space-y-6">
                  {reviews.map(review => (
                    <div key={review.id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                      <div className="flex items-start gap-4">
                        {review.photo_url && (
                          <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 shadow-sm">
                            <img src={review.photo_url} alt="ביקורת" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        <div className="flex-grow">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-gray-800">{review.customer_name}</span>
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} size={14} className={s <= review.rating ? 'text-amber-400' : 'text-gray-200'} fill={s <= review.rating ? '#fbbf24' : '#e5e7eb'} />
                              ))}
                            </div>
                          </div>
                          <p className="text-gray-600 text-sm leading-relaxed">{review.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Write a review form */}
              <div className="border-t pt-6 space-y-4">
                <h4 className="font-bold text-gray-700">✍️ כתוב ביקורת</h4>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">שם</label>
                  <input
                    type="text"
                    placeholder="השם שלך"
                    className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-ink/20 outline-none text-sm"
                    value={reviewForm.customerName}
                    onChange={e => setReviewForm(prev => ({ ...prev, customerName: e.target.value }))}
                  />
                </div>
                {/* Star rating picker */}
                <div>
                  <label className="block text-sm text-gray-600 mb-2">דירוג</label>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} type="button" onClick={() => setReviewForm(prev => ({ ...prev, rating: s }))}>
                        <Star size={28} className={s <= reviewForm.rating ? 'text-amber-400' : 'text-gray-200'} fill={s <= reviewForm.rating ? '#fbbf24' : '#e5e7eb'} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">הביקורת שלך</label>
                  <textarea
                    rows={3}
                    placeholder="ספר לנו על החוויה שלך..."
                    className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-ink/20 outline-none resize-none text-sm"
                    value={reviewForm.message}
                    onChange={e => setReviewForm(prev => ({ ...prev, message: e.target.value }))}
                  />
                </div>
                {/* Photo upload */}
                <div>
                  <label className="block text-sm text-gray-600 mb-2">📸 תמונה של המארז (אופציונלי)</label>
                  <div className="flex items-center gap-4">
                    <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-ink text-ink text-sm hover:bg-ink/5 transition-colors">
                      <Camera size={16} />
                      העלה תמונה
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const url = URL.createObjectURL(file);
                            setReviewForm(prev => ({ ...prev, photoFile: file, photoPreview: url }));
                          }
                        }}
                      />
                    </label>
                    {reviewForm.photoPreview && (
                      <div className="relative w-16 h-16 rounded-xl overflow-hidden shadow-sm">
                        <img src={reviewForm.photoPreview} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setReviewForm(prev => ({ ...prev, photoFile: null, photoPreview: '' }))}
                          className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleSubmitReview}
                  disabled={isSubmittingReview}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingReview ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
                  שלח ביקורת
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'checkout' && (
          <div className="max-w-md mx-auto space-y-8">
            <button onClick={() => navigateTo('user')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800">
              <ChevronRight size={20} /> חזרה לחנות
            </button>
            <h2 className="text-2xl font-bold">פרטי הזמנה</h2>
            <div className="surface-card p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
                  <input
                    id="checkout-name"
                    type="text"
                    placeholder="ישראל ישראלי"
                    aria-invalid={!!formErrors.name}
                    className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-ink/20 focus:border-transparent outline-none ${formErrors.name ? 'border-red-400' : 'border-gray-200'}`}
                    value={checkoutData.name}
                    onChange={e => {
                      setCheckoutData(prev => ({ ...prev, name: e.target.value }));
                      if (formErrors.name) setFormErrors(prev => ({ ...prev, name: undefined }));
                    }}
                    onBlur={e => setFormErrors(prev => ({ ...prev, name: e.target.value && !isValidName(e.target.value) ? NAME_ERROR : undefined }))}
                  />
                  {formErrors.name
                    ? <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>
                    : <p className="text-xs text-gray-400 mt-1">שם פרטי + משפחה, בעברית או באנגלית</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מספר טלפון</label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="0501234567"
                    maxLength={13}
                    aria-invalid={!!formErrors.phone}
                    className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-ink/20 focus:border-transparent outline-none ${formErrors.phone ? 'border-red-400' : 'border-gray-200'}`}
                    value={checkoutData.phone}
                    onChange={e => {
                      // Strip everything except digits and a leading '+' (for +972…)
                      const cleaned = e.target.value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
                      setCheckoutData(prev => ({ ...prev, phone: cleaned }));
                      if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: undefined }));
                    }}
                    onBlur={e => setFormErrors(prev => ({ ...prev, phone: e.target.value && !isValidPhone(e.target.value) ? PHONE_ERROR : undefined }))}
                  />
                  {formErrors.phone
                    ? <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>
                    : <p className="text-xs text-gray-400 mt-1">מספר נייד ישראלי המתחיל ב-05 (ספרות בלבד, לדוגמה 0501234567)</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אימייל (אופציונלי)</label>
                  <input
                    type="email"
                    className="w-full p-3 rounded-xl border-gray-200 border focus:ring-2 focus:ring-ink/20 focus:border-transparent outline-none"
                    value={checkoutData.email}
                    onChange={e => setCheckoutData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`flex-1 p-3 rounded-xl border transition-all ${deliveryMethod === 'pickup' ? 'bg-ink text-white border-ink' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    איסוף עצמי
                  </button>
                  <button
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`flex-1 p-3 rounded-xl border transition-all ${deliveryMethod === 'delivery' ? 'bg-ink text-white border-ink' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    משלוח עד הבית
                  </button>
                </div>
                {deliveryMethod === 'delivery' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">כתובת למשלוח *</label>
                    <input
                      type="text"
                      placeholder="רחוב, מספר בית, עיר"
                      className="w-full p-3 rounded-xl border-gray-200 border focus:ring-2 focus:ring-ink/20 focus:border-transparent outline-none"
                      value={checkoutData.shippingAddress}
                      onChange={e => setCheckoutData(prev => ({ ...prev, shippingAddress: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* Dedication Section */}
              <div className="border-t pt-4 space-y-3" style={{ background: '#EDE9E3', borderRadius: 16, padding: 20, marginTop: 8 }}>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  💌 ברכה אישית <span className="text-sm font-normal text-gray-400">(אופציונלי)</span>
                </h3>
                <p className="text-xs text-gray-400">הוסף הקדשה אישית שתצורף למארז</p>
                <textarea
                  placeholder="כתוב כאן את ההקדשה שלך..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-ink/20 focus:border-transparent outline-none resize-none text-sm"
                  value={dedication.message}
                  onChange={e => setDedication(prev => ({ ...prev, message: e.target.value }))}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">סוג כרטיס ברכה:</p>
                  {/* Toggle: 'printed' = opt-in (charged), 'digital' = not opted in (no card, no charge) */}
                  <button
                    type="button"
                    onClick={() => setDedication(prev => ({ ...prev, cardType: prev.cardType === 'printed' ? 'digital' : 'printed' }))}
                    className={`w-full p-3 rounded-xl border text-sm font-medium transition-all ${dedication.cardType === 'printed' ? 'bg-ink text-white border-ink shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-ink'}`}
                  >
                    🖨️ כרטיס מודפס פרימיום<br/><span className="text-xs font-normal opacity-75">+₪{formatPrice(totals.rules.printedCardPrice)}</span>
                  </button>
                </div>
              </div>

              {/* Customer Notes */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">📝 הערות נוספות <span className="font-normal text-gray-400">(אופציונלי)</span></label>
                <textarea
                  placeholder="הערות מיוחדות להזמנה..."
                  rows={2}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-ink/20 focus:border-transparent outline-none resize-none text-sm"
                  value={customerNotes}
                  onChange={e => setCustomerNotes(e.target.value)}
                />
              </div>

              {/* Coupon input */}
              {totals.rules.couponsEnabled && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">קוד קופון</label>
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                      <span className="text-green-700 font-semibold">
                        ✅ {appliedCoupon.code} — {couponBenefit(appliedCoupon)}
                      </span>
                      <button onClick={removeCoupon} className="text-gray-400 hover:text-red-500 mr-2">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="הזן קוד קופון"
                        className="flex-1 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-ink/20 focus:border-transparent outline-none uppercase"
                        value={couponInput}
                        onChange={e => { setCouponInput(e.target.value); clearCouponError(); }}
                        onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                      />
                      <button
                        onClick={() => applyCoupon()}
                        disabled={isValidatingCoupon || !couponInput.trim()}
                        className="px-4 py-3 bg-ink text-white rounded-xl font-medium disabled:opacity-50 hover:bg-ink transition-colors"
                      >
                        {isValidatingCoupon ? <Loader2 size={18} className="animate-spin" /> : 'החל'}
                      </button>
                    </div>
                  )}
                  {couponError && <p className="text-red-500 text-sm">{couponError}</p>}
                </div>
              )}

              {/* Live threshold nudges — the numbers come from settings/store, so
                  what the shopper is promised is what checkout actually charges. */}
              {(totals.amountToFreeShipping !== null || totals.amountToGift !== null || totals.gift) && (
                <div className="space-y-2">
                  {totals.amountToFreeShipping !== null && totals.amountToFreeShipping > 0 && (
                    <ThresholdNudge
                      text={`עוד ₪${formatPrice(totals.amountToFreeShipping)} ותקבלו משלוח חינם 🚚`}
                      progress={totals.discountedSubtotal / totals.rules.freeShippingThreshold}
                    />
                  )}
                  {totals.amountToGift !== null && totals.amountToGift > 0 && (
                    <ThresholdNudge
                      text={`עוד ₪${formatPrice(totals.amountToGift)} ותקבלו מתנה 🎁`}
                      progress={totals.discountedSubtotal / totals.rules.giftThreshold}
                    />
                  )}
                  {totals.gift && (
                    <p className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                      🎁 מתנה שצורפה להזמנה: {totals.gift.name}
                    </p>
                  )}
                </div>
              )}

              <div className="border-t pt-6 space-y-2">
                <div className="flex justify-between text-gray-500">
                  <span>סיכום מוצרים:</span>
                  <span>₪{formatPrice(cartTotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>הנחת קופון ({appliedCoupon?.code}):</span>
                    <span>-₪{formatPrice(discountAmount)}</span>
                  </div>
                )}
                {deliveryMethod === 'delivery' && (
                  <div className="flex justify-between text-gray-500">
                    <span>דמי משלוח:</span>
                    {totals.freeShipping ? (
                      <span className="text-green-600 font-medium">
                        <span className="line-through text-gray-400 ml-2">₪{formatPrice(totals.shippingBase)}</span>
                        חינם
                      </span>
                    ) : (
                      <span>₪{formatPrice(shippingCost)}</span>
                    )}
                  </div>
                )}
                {totals.gift && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>🎁 {totals.gift.name}:</span>
                    <span>חינם</span>
                  </div>
                )}
                {cardCost > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>כרטיס ברכה מודפס:</span>
                    <span>+₪{formatPrice(cardCost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold pt-2">
                  <span>סה"כ לתשלום:</span>
                  <span>₪{formatPrice(finalTotal)}</span>
                </div>
              </div>

              {!totals.meetsMinimum && (
                <p className="text-sm text-red-500 text-center">
                  סכום ההזמנה המינימלי הוא ₪{formatPrice(totals.minOrderAmount)} — הוסיפו עוד ₪{formatPrice(totals.minOrderAmount - cartTotal)} לסל
                </p>
              )}

              <button
                onClick={handleCheckout}
                disabled={isCreatingPayment || !totals.meetsMinimum}
                className="w-full btn-primary text-lg py-4 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCreatingPayment
                  ? <span className="flex items-center justify-center gap-2"><Loader2 size={20} className="animate-spin" />מכין תשלום...</span>
                  : 'אישור הזמנה ותשלום'}
              </button>
            </div>
          </div>
        )}

        {/* ── Build-A-Box ───────────────────────────────────────────── */}
        {view === 'build-box' && (
          <div className="space-y-8 max-w-4xl mx-auto">
            <button onClick={() => navigateTo('user')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800">
              <ChevronRight size={20} /> חזרה לחנות
            </button>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-ink">✨ בנה את המארז שלך</h2>
              <p className="text-gray-500">בחר בסיס מארז ואחר כך הוסף מוצרים לפי בחירתך</p>
            </div>

            {/* Step 1: Select Box Base */}
            <div className="surface-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-ink text-white text-sm flex items-center justify-center font-bold">1</span>
                בחר סגנון מארז
              </h3>
              {(() => {
                const boxBases = products.filter(p => p.isBoxBase);
                if (boxBases.length === 0) {
                  return <p className="text-gray-400 text-sm">אין בסיסי מארז זמינים כרגע. סמן מוצרים כ"בסיס מארז" בניהול.</p>;
                }
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {boxBases.map(box => (
                      <div
                        key={box.id}
                        onClick={() => setSelectedBoxBase(box)}
                        className={`cursor-pointer rounded-2xl border-2 overflow-hidden transition-all ${selectedBoxBase?.id === box.id ? 'border-ink shadow-lg scale-[1.02]' : 'border-gray-100 hover:border-line-strong'}`}
                      >
                        <div className="aspect-square bg-gray-50 relative">
                          {box.main_image ? (
                            <img src={box.main_image} alt={box.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Gift size={32} className="text-gray-200" /></div>
                          )}
                          {selectedBoxBase?.id === box.id && (
                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-ink flex items-center justify-center">
                              <CheckCircle2 size={14} color="white" />
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="font-semibold text-sm">{box.name}</p>
                          <BundlePrice product={box} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Step 2: Add Items */}
            {selectedBoxBase && (
              <div className="surface-card p-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-ink text-white text-sm flex items-center justify-center font-bold">2</span>
                  הוסף מוצרים למארז
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {products.filter(p => !p.isBoxBase).map(product => {
                    const inBundle = bundleItems.find(bi => bi.product.id === product.id);
                    return (
                      <div key={product.id} className={`rounded-2xl border-2 overflow-hidden transition-all ${inBundle ? 'border-ink shadow-md' : 'border-gray-100'}`}>
                        <div className="aspect-square bg-gray-50">
                          {product.main_image ? (
                            <img src={product.main_image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Package size={28} className="text-gray-200" /></div>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="font-semibold text-sm leading-tight">{product.name}</p>
                          <BundlePrice product={product} />
                          {inBundle ? (
                            <div className="flex items-center justify-between">
                              <button onClick={() => updateBundleQty(product.id, -1)} className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-100 text-gray-400"><Minus size={14} /></button>
                              <span className="font-bold text-sm">{inBundle.qty}</span>
                              <button onClick={() => updateBundleQty(product.id, 1)} className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-100 text-gray-400"><Plus size={14} /></button>
                              <button onClick={() => removeBundleItem(product.id)} className="text-red-300 hover:text-red-500"><X size={14} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addBundleItem(product)}
                              className="w-full text-xs py-1.5 rounded-lg border border-ink text-ink hover:bg-ink hover:text-white transition-all flex items-center justify-center gap-1"
                            >
                              <Plus size={12} /> הוסף
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Summary & Add to Cart */}
            {selectedBoxBase && (
              <div className="surface-card p-6 space-y-4 sticky bottom-4">
                <h3 className="text-lg font-bold text-gray-800">📦 סיכום המארז</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>בסיס: {selectedBoxBase.name}</span>
                    <span>₪{formatPrice(effectivePrice(selectedBoxBase).final)}</span>
                  </div>
                  {bundleItems.map(bi => (
                    <div key={bi.product.id} className="flex justify-between text-gray-600">
                      <span>{bi.product.name} × {bi.qty}</span>
                      <span>₪{formatPrice(effectivePrice(bi.product).final * bi.qty)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>סה"כ:</span>
                    <span className="text-ink">₪{formatPrice(bundleTotal)}</span>
                  </div>
                </div>
                <button
                  onClick={addBundleToCart}
                  className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={20} />
                  הוסף מארז לסל — ₪{formatPrice(bundleTotal)}
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'success' && (
          <CheckoutSuccess orderId={lastOrderId} onContinueShopping={() => navigateTo('user')} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-surface border-t border-line mt-16 px-6 py-10">
        <div className="max-w-[980px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="space-y-2">
              <div className="flex items-center">
                <img src="/logo.jpeg" alt="Tony Amrami" className="h-10 object-contain" style={{ mixBlendMode: 'multiply' }} />
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">מארזי מתנה יוקרתיים עם מיתוג אישי. לאירועים, לעסקים ולכל רגע מיוחד.</p>
            </div>

            {/* Navigation */}
            <div className="space-y-2">
              <h4 className="font-bold text-gray-700 text-sm">ניווט מהיר</h4>
              <div className="flex flex-col gap-1.5">
                {[['/', 'החנות']].map(([href, label]) => (
                  <a key={href} href={href} className="text-sm text-gray-500 hover:text-ink transition-colors">{label}</a>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div className="space-y-2">
              <h4 className="font-bold text-gray-700 text-sm">מידע משפטי</h4>
              <div className="flex flex-col gap-1.5">
                {[
                  ['/accessibility', 'הצהרת נגישות ♿'],
                  ['/terms', 'תקנון האתר'],
                  ['/privacy', 'מדיניות פרטיות'],
                  ['/shipping', 'משלוחים והחזרות'],
                ].map(([href, label]) => (
                  <a key={href} href={href} className="text-sm text-gray-500 hover:text-ink transition-colors">{label}</a>
                ))}
              </div>
            </div>

            {/* Social */}
            <div className="space-y-2">
              <h4 className="font-bold text-gray-700 text-sm">עקבו אחרינו</h4>
              <div className="flex items-center gap-3">
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-ink hover:bg-ink hover:text-cream transition-colors"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-ink hover:bg-ink hover:text-cream transition-colors"
                >
                  <WhatsAppIcon size={18} />
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
            <span>© {new Date().getFullYear()} Tony — אמנות המיתוג. כל הזכויות שמורות.</span>
            <div className="flex gap-4 flex-wrap">
              {[['/accessibility','נגישות'],['/terms','תקנון'],['/privacy','פרטיות'],['/shipping','משלוחים']].map(([href, label]) => (
                <a key={href} href={href} className="hover:text-ink transition-colors">{label}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* Menu Drawer (Categories) */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed inset-y-0 right-0 w-full max-w-xs bg-white z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Menu size={24} /> קטגוריות
                </h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-6 space-y-2">
                <button
                  onClick={() => { setIsMenuOpen(false); openCatalog(null); }}
                  className={`w-full text-right px-6 py-4 rounded-2xl transition-all font-bold ${!selectedCategory ? 'bg-ink/5 text-ink' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  הכל
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => { setIsMenuOpen(false); openCatalog(cat.id); }}
                    className={`w-full text-right px-6 py-4 rounded-2xl transition-all font-bold ${selectedCategory === cat.id ? 'bg-ink/5 text-ink' : 'hover:bg-gray-50 text-gray-600'}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Socials live here too — the header hides them below sm */}
              <div className="p-6 border-t border-line flex items-center gap-3">
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-ink hover:bg-ink hover:text-cream transition-colors"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="w-10 h-10 rounded-full border border-line flex items-center justify-center text-ink hover:bg-ink hover:text-cream transition-colors"
                >
                  <WhatsAppIcon size={18} />
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AccessibilityWidget />

      {/* ── Arrival popup — an admin-uploaded promo image ───────────── */}
      <AnimatePresence>
        {activePopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm"
            onClick={dismissPopup}
            role="dialog"
            aria-modal="true"
            aria-label={activePopup.title || 'מבצע'}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="relative w-full max-w-lg bg-surface border border-line overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={dismissPopup}
                aria-label="סגירת החלון"
                autoFocus
                className="absolute top-3 left-3 z-10 p-2 bg-surface/90 text-ink hover:bg-surface transition-colors"
              >
                <X size={18} />
              </button>
              {activePopup.linkUrl ? (
                <a href={activePopup.linkUrl} target="_blank" rel="noopener noreferrer" onClick={dismissPopup}>
                  <img src={activePopup.imageUrl} alt={activePopup.title || 'מבצע'}
                    className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
                </a>
              ) : (
                <img src={activePopup.imageUrl} alt={activePopup.title || 'מבצע'}
                  className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <ShoppingCart size={24} /> סל הקניות
                </h2>
                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-6 space-y-6">
                {cart.length === 0 ? (
                  <div className="text-center py-20 text-gray-400 space-y-4">
                    <ShoppingCart size={64} className="mx-auto opacity-20" />
                    <p>הסל שלך ריק</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={getCartKey(item)} className="flex gap-4 items-center">
                      <div className="w-20 h-20 bg-cream overflow-hidden flex-shrink-0">
                        {(item.selectedColor?.imageUrl || item.main_image) && (
                          <img src={item.selectedColor?.imageUrl || item.main_image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        )}
                      </div>
                      <div className="flex-grow">
                        <h4 className="font-medium text-ink">{item.name}</h4>
                        {cartLineOptions(item) && (
                          <p className="text-xs text-muted mt-0.5">{cartLineOptions(item)}</p>
                        )}
                        <p className="text-ink font-semibold">₪{formatPrice(unitPriceOf(item))}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => updateQuantity(item, -1)}
                            className="w-8 h-8 rounded-full border border-line flex items-center justify-center hover:bg-cream transition-colors text-muted"
                          >
                            <Minus size={16} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item, (parseInt(e.target.value) || 1) - item.quantity)}
                            className="w-12 text-center bg-transparent font-semibold outline-none"
                          />
                          <button
                            onClick={() => updateQuantity(item, 1)}
                            className="w-8 h-8 rounded-full border border-line flex items-center justify-center hover:bg-cream transition-colors text-muted"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(item)} className="text-line-strong hover:text-red-500 transition-colors">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t border-line bg-cream space-y-4">
                  {/* Threshold state, live — the drawer is where the shopper decides
                      whether to add one more item, so it has to say what that earns. */}
                  {totals.amountToFreeShipping !== null && totals.amountToFreeShipping > 0 && (
                    <ThresholdNudge
                      text={`עוד ₪${formatPrice(totals.amountToFreeShipping)} ותקבלו משלוח חינם 🚚`}
                      progress={totals.discountedSubtotal / totals.rules.freeShippingThreshold}
                    />
                  )}
                  {totals.freeShippingEarned && (
                    <p className="text-sm font-medium text-green-700 text-center">🚚 יש לכם משלוח חינם!</p>
                  )}
                  {totals.amountToGift !== null && totals.amountToGift > 0 && (
                    <ThresholdNudge
                      text={`עוד ₪${formatPrice(totals.amountToGift)} ותקבלו מתנה 🎁`}
                      progress={totals.discountedSubtotal / totals.rules.giftThreshold}
                    />
                  )}
                  {totals.gift && (
                    <div className="flex items-center gap-3 bg-white border border-green-200 rounded-xl p-2.5">
                      {totals.gift.imageUrl && (
                        <img src={totals.gift.imageUrl} alt="" className="w-10 h-10 object-cover rounded-lg" referrerPolicy="no-referrer" />
                      )}
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-medium text-ink truncate">🎁 {totals.gift.name}</p>
                        <p className="text-xs text-green-700">מתנה על ההזמנה</p>
                      </div>
                      <span className="text-sm font-semibold text-green-700">חינם</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-700 font-medium">
                      <span>הנחת קופון ({appliedCoupon?.code}):</span>
                      <span>-₪{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-semibold text-ink">
                    <span>סה"כ:</span>
                    <span>₪{formatPrice(totals.discountedSubtotal)}</span>
                  </div>
                  {!totals.meetsMinimum && (
                    <p className="text-sm text-red-500 text-center">
                      סכום ההזמנה המינימלי הוא ₪{formatPrice(totals.minOrderAmount)}
                    </p>
                  )}
                  <button
                    onClick={() => { setIsCartOpen(false); navigateTo('checkout'); }}
                    disabled={!totals.meetsMinimum}
                    className="w-full btn-primary text-lg py-4 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    מעבר לתשלום
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── AI Gift Assistant ──────────────────────────────────────── */}
      <GiftAssistant onNavigateToProduct={(id) => { fetchProductDetails(id); }} />

      {/* ── Smart WhatsApp Floating Bubble ─────────────────────────── */}
      <AnimatePresence>
        {waVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="fixed bottom-6 left-6 z-[200] flex flex-col items-start gap-2"
          >
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white text-gray-700 text-sm font-medium px-4 py-2 rounded-2xl shadow-lg border border-gray-100 max-w-[200px] leading-snug"
              style={{ borderRight: '3px solid #25D366' }}
            >
              {view === 'product' && selectedProduct
                ? `שאלות על ${selectedProduct.name}? 💬`
                : 'נעזור לך לבחור מתנה 🎁'}
            </motion.div>
            <div className="flex items-center gap-2">
              <a
                href={getWhatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)', boxShadow: '0 4px 20px rgba(37,211,102,0.4)' }}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform"
              >
                <WhatsAppIcon size={28} />
              </a>
              <button
                onClick={() => setWaVisible(false)}
                className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
              >
                <X size={12} className="text-gray-500" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <StoreApp />
    </CartProvider>
  );
}
