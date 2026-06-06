import React, { useState, useEffect, useRef } from 'react';
import AccessibilityWidget from './components/AccessibilityWidget';
import GiftAssistant from './components/GiftAssistant';
import CheckoutSuccess from './components/CheckoutSuccess';
import { ShoppingCart, Package, Plus, Minus, Trash2, Camera, ChevronRight, CheckCircle2, X, Menu, Loader2, ChevronDown, Copy, Star, MessageCircle, Gift, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, Settings, CartItem, Coupon, SiteContent, Review } from './types';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, doc, getDoc, setDoc, query, orderBy, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function App() {
  const [view, setView] = useState<'user' | 'checkout' | 'success' | 'product' | 'build-box'>('user');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings>({ pickup_address: '', delivery_cost: '0', bit_phone: '' });
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('tony_store_cart') || '[]'); } catch { return []; }
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [checkoutData, setCheckoutData] = useState({ name: '', phone: '', email: '', delivery: 'pickup' as 'pickup' | 'delivery', shippingAddress: '' });
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [productQuantity, setProductQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, string>>({});
  const [dedication, setDedication] = useState<{ message: string; cardType: 'digital' | 'printed' }>({ message: '', cardType: 'digital' });
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

  // Coupon — storefront
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

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

  // Persist cart to localStorage on every change
  useEffect(() => {
    localStorage.setItem('tony_store_cart', JSON.stringify(cart));
  }, [cart]);

  const fetchData = async () => {
    try {
      const [productsSnapshot, categoriesSnapshot, settingsDoc, contentDoc] = await Promise.all([
        getDocs(query(collection(db, "products"), orderBy("created_at", "desc"))),
        getDocs(collection(db, "categories")),
        getDoc(doc(db, "settings", "store")),
        getDoc(doc(db, "settings", "content")),
      ]);

      setProducts(productsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
      setCategories(categoriesSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Category[]);
      if (settingsDoc.exists()) setSettings(settingsDoc.data() as Settings);
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
    user: '/shop', checkout: '/shop/checkout', success: '/shop/success', 'build-box': '/shop/build-box',
  };
  const navigateTo = (newView: typeof view, productId?: string) => {
    const url = newView === 'product' && productId
      ? `/shop/product/${productId}`
      : VIEW_URLS[newView] ?? '/shop';
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

  // Detect return from Grow payment redirect — runs immediately on mount before products load
  useEffect(() => {
    if (window.location.pathname !== '/shop/success') return;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const response = params.get('response');
    if (orderId && response === 'success') {
      setLastOrderId(orderId);
      setCart([]);               // clear cart now that payment is confirmed
      setView('success');
      urlInitDone.current = true; // prevent the products-dependent effect from overriding
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize view from URL once products are available (handles direct links & refresh)
  useEffect(() => {
    if (products.length === 0 || urlInitDone.current) return;
    urlInitDone.current = true;
    const path = window.location.pathname;
    window.history.replaceState({ view: 'user', productId: null }, '', path);
    if (path.startsWith('/shop/product/')) {
      fetchProductDetails(path.replace('/shop/product/', ''));
    } else if (path === '/shop/checkout') {
      setView('checkout');
    } else if (path === '/shop/success') {
      setView('success');
    } else if (path === '/shop/build-box') {
      setView('build-box');
    }
  }, [products]);

  const fetchProductDetails = (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    setSelectedProduct(product);
    setSelectedImageIndex(0);
    setProductQuantity(1);
    setSelectedVariations({});
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
      await addDoc(collection(db, 'reviews'), {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        customer_name: reviewForm.customerName.trim(),
        rating: reviewForm.rating,
        message: reviewForm.message.trim(),
        ...(photoUrl && { photo_url: photoUrl }),
        created_at: new Date().toISOString(),
      });
      showToast('תודה על הביקורת! 🌸');
      setReviewForm({ rating: 5, message: '', customerName: '', photoFile: null, photoPreview: '' });
      fetchReviews(selectedProduct.id);
    } catch (err) {
      console.error('Error submitting review:', err);
      alert('שגיאה בשליחת הביקורת');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Build-A-Box helpers
  const bundleTotal = (selectedBoxBase?.price || 0) + bundleItems.reduce((sum, bi) => sum + bi.product.price * bi.qty, 0);
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
      price: bundleTotal,
      images: selectedBoxBase.images,
    };
    const cartBundle: CartItem = {
      ...bundleProduct,
      quantity: 1,
      bundleItems: bundleItems.map(bi => ({ id: bi.product.id, name: bi.product.name, price: bi.product.price, quantity: bi.qty })),
    };
    setCart(prev => [...prev, cartBundle]);
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

  const getCartKey = (id: string, variations?: Record<string, string>) =>
    variations && Object.keys(variations).length > 0
      ? `${id}|${JSON.stringify(variations)}`
      : id;

  const addToCart = (product: Product, quantity: number = 1, variations?: Record<string, string>) => {
    const key = getCartKey(product.id, variations);
    setCart(prev => {
      const existing = prev.find(item => getCartKey(item.id, item.selectedVariations) === key);
      if (existing) {
        return prev.map(item =>
          getCartKey(item.id, item.selectedVariations) === key
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { ...product, quantity, selectedVariations: variations } as CartItem];
    });
  };

  const removeFromCart = (id: string, variations?: Record<string, string>) => {
    const key = getCartKey(id, variations);
    setCart(prev => prev.filter(item => getCartKey(item.id, item.selectedVariations) !== key));
  };

  const updateQuantity = (id: string, delta: number, variations?: Record<string, string>) => {
    const key = getCartKey(id, variations);
    setCart(prev => prev.map(item => {
      if (getCartKey(item.id, item.selectedVariations) === key) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = appliedCoupon
    ? appliedCoupon.type === 'percent'
      ? Math.round(cartTotal * appliedCoupon.value / 100)
      : Math.min(appliedCoupon.value, cartTotal)
    : 0;
  const cardCost = dedication.message.trim() && dedication.cardType === 'printed' ? Number(settings.printed_card_price || 15) : 0;
  const finalTotal = Math.max(0, cartTotal - discountAmount + (checkoutData.delivery === 'delivery' ? Number(settings.delivery_cost) : 0) + cardCost);

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
    if (checkoutData.delivery === 'delivery' && !checkoutData.shippingAddress.trim()) return alert("נא להזין כתובת למשלוח");
    // Guard against a NaN/negative total (rules require total_price >= 0), e.g. malformed delivery_cost setting.
    if (!Number.isFinite(finalTotal) || finalTotal < 0) return alert("שגיאה בחישוב הסכום. רעננו את הדף ונסו שוב.");

    setIsCreatingPayment(true);

    const orderItems = cart.map(i => ({
      id: i.id, name: i.name, price: i.price, costPrice: i.costPrice ?? 0, quantity: i.quantity,
      ...(i.selectedVariations && Object.keys(i.selectedVariations).length > 0 && { selectedVariations: i.selectedVariations }),
    }));
    const dedicationData = dedication.message.trim()
      ? { message: dedication.message.trim(), cardType: dedication.cardType }
      : undefined;

    // ── 1. Save order as pending_payment (Firestore) — do NOT show success UI yet ──
    let orderDoc;
    try {
      orderDoc = await addDoc(collection(db, "orders"), {
        customer_name: checkoutData.name,
        customer_phone: checkoutData.phone,
        ...(checkoutData.email && { customer_email: checkoutData.email }),
        delivery_method: checkoutData.delivery,
        total_price: finalTotal,
        items: orderItems,
        status: 'pending_payment',
        orderStatus: 'PendingPayment',
        isPaid: false,
        ...(checkoutData.delivery === 'delivery' && { shippingAddress: checkoutData.shippingAddress }),
        created_at: new Date().toISOString(),
        ...(appliedCoupon && { coupon_code: appliedCoupon.code, discount_amount: discountAmount }),
        ...(dedicationData && { dedication: dedicationData }),
        ...(customerNotes.trim() && { customer_notes: customerNotes.trim() }),
      });
      // Telegram notification fires automatically via onOrderCreated Cloud Function trigger
    } catch (err) {
      console.error("[Checkout] Firestore order save failed:", err);
      alert("שגיאה בשמירת ההזמנה. אנא בדקו את חיבור האינטרנט ונסו שוב.");
      setIsCreatingPayment(false);
      return;
    }

    // ── 2. POST to Make.com webhook (network) → get payment URL ──
    let response: Response;
    try {
      response = await fetch("https://hook.eu1.make.com/77c28f0f26ja6igr5wb6356nd89nfqip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderDoc.id,
          total_price: finalTotal,
          customer_name: checkoutData.name.trim(),
          customer_phone: normalizePhone(checkoutData.phone),
        }),
      });
    } catch (err) {
      // fetch only rejects on network-level failures (offline, DNS, blocked CORS preflight)
      console.error("[Checkout] Webhook request failed (network/CORS). Order ID:", orderDoc.id, err);
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
    console.log("[Checkout] Redirecting to payment URL for order", orderDoc.id, "→", responseData.payment_url);
    window.location.href = responseData.payment_url;
  };

  // ── Coupon: storefront ──────────────────────────────────────────────────────
  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setIsValidatingCoupon(true);
    setCouponError(null);
    setAppliedCoupon(null);
    try {
      const q = query(collection(db, "coupons"), where("code", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) {
        setCouponError("קוד קופון לא קיים");
        return;
      }
      const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as Coupon;
      if (!coupon.isActive) { setCouponError("קוד קופון אינו פעיל"); return; }
      if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
        setCouponError("קוד הקופון פג תוקף"); return;
      }
      setAppliedCoupon(coupon);
      setCouponInput('');
    } catch (err) {
      console.error("Coupon validation error:", err);
      setCouponError("שגיאה בבדיקת הקופון");
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const removeAppliedCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

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

      {/* Announcement Bar */}
      {(isContentLoading || siteContent.announcementBar) && (
        <div className="bg-gradient-to-r from-[#ff9a9e] to-[#a1c4fd] text-white text-center py-2 px-4 text-sm font-medium">
          {isContentLoading
            ? <span className="inline-block w-64 h-4 bg-white/30 rounded animate-pulse" />
            : siteContent.announcementBar}
        </div>
      )}

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsMenuOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Menu size={24} className="text-gray-500" />
          </button>
          <div className="flex items-center cursor-pointer" onClick={() => navigateTo('user')}>
            <img src="/logo.jpeg" alt="Tony Amrami" className="h-10 object-contain" style={{ mixBlendMode: 'multiply' }} />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative p-2 bg-[#ff9a9e]/10 text-[#ff9a9e] rounded-full hover:bg-[#ff9a9e]/20 transition-colors"
          >
            <ShoppingCart size={20} />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                {cart.reduce((a, b) => a + b.quantity, 0)}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {isLoadingProduct && (
          <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-[#ff9a9e] border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {view === 'user' && (
          <div className="space-y-12">
            {/* Hero Section */}
            <div className="text-center py-10 space-y-4">
              {isContentLoading ? (
                <div className="space-y-3 flex flex-col items-center">
                  <div className="h-10 w-80 bg-gradient-to-r from-gray-100 to-gray-200 rounded-2xl animate-pulse" />
                  <div className="h-5 w-96 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl animate-pulse" />
                  <div className="h-5 w-72 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl animate-pulse" />
                </div>
              ) : (
                <>
                  {siteContent.heroTitle && (
                    <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#ff9a9e] via-[#fecfef] to-[#a1c4fd] leading-tight">
                      {siteContent.heroTitle}
                    </h2>
                  )}
                  {siteContent.heroSubtitle && (
                    <p className="text-gray-500 text-lg max-w-xl mx-auto leading-relaxed">
                      {siteContent.heroSubtitle}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Build-A-Box Banner */}
            <div
              onClick={() => { setSelectedBoxBase(null); setBundleItems([]); navigateTo('build-box'); window.scrollTo(0,0); }}
              className="cursor-pointer rounded-3xl overflow-hidden shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #fff0f5 0%, #ffe4ef 50%, #ffd6e8 100%)', border: '1.5px solid #ffd6e8' }}
            >
              <div className="p-6 flex items-center gap-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#ff9a9e,#fecfef)' }}>
                  <Gift size={32} color="white" />
                </div>
                <div className="flex-grow">
                  <h3 className="text-xl font-bold text-gray-800">✨ בנה את המארז שלך</h3>
                  <p className="text-gray-500 text-sm mt-1">בחר בסיס מארז, הוסף מוצרים ויצור חוויה מותאמת אישית</p>
                </div>
                <div className="btn-primary px-5 py-2 flex items-center gap-2 flex-shrink-0">
                  <Box size={16} /> בנה עכשיו
                </div>
              </div>
            </div>

            {/* Collections Title */}
            <div className="flex items-center gap-4">
              {isContentLoading
                ? <div className="h-7 w-40 bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg animate-pulse" />
                : <h3 className="text-2xl font-bold text-gray-800">{siteContent.collectionsTitle}</h3>}
              <div className="flex-1 h-px bg-gradient-to-r from-[#ff9a9e]/30 to-transparent" />
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredProducts.map(product => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={product.id}
                  className="pastel-card overflow-hidden flex flex-col cursor-pointer"
                  onClick={() => fetchProductDetails(product.id)}
                >
                  <div className="aspect-square relative overflow-hidden bg-gray-100">
                    {product.main_image ? (
                      <img src={product.main_image} alt={product.alt_text || product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Package size={48} />
                      </div>
                    )}
                  </div>
                  <div className="p-6 flex flex-col flex-grow">
                    <h3 className="text-lg font-bold mb-2">{product.name}</h3>
                    <p className="text-gray-500 text-sm mb-4 line-clamp-2">{product.description}</p>
                    <div className="flex justify-between items-center mt-auto">
                      <span className="text-xl font-bold text-[#ff9a9e]">₪{product.price}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                        className="btn-primary flex items-center gap-2"
                      >
                        <Plus size={18} />
                        הוספה לסל
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {view === 'product' && selectedProduct && (
          <div className="space-y-8">
            <button onClick={() => navigateTo('user')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800">
              <ChevronRight size={20} /> חזרה לחנות
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-4">
                <div className="aspect-square rounded-3xl overflow-hidden bg-gray-100 shadow-inner">
                  <img
                    src={selectedProduct.images?.[selectedImageIndex] || selectedProduct.main_image}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {selectedProduct.images && selectedProduct.images.length > 1 && (
                  <div className="grid grid-cols-4 gap-4">
                    {selectedProduct.images.map((img, idx) => (
                      <div
                        key={idx}
                        className={`aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${selectedImageIndex === idx ? 'border-[#ff9a9e]' : 'border-transparent'}`}
                        onClick={() => setSelectedImageIndex(idx)}
                      >
                        <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-6">
                <h2 className="text-4xl font-bold">{selectedProduct.name}</h2>
                <p className="text-xl text-[#ff9a9e] font-bold">₪{selectedProduct.price}</p>
                <div className="prose prose-pink">
                  <p className="text-gray-600 text-lg leading-relaxed">{selectedProduct.description}</p>
                </div>

                {selectedProduct.variations && selectedProduct.variations.length > 0 && (
                  <div className="space-y-4">
                    {selectedProduct.variations.map(variation => (
                      <div key={variation.name}>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{variation.name}:</label>
                        <div className="flex flex-wrap gap-2">
                          {variation.values.map(value => (
                            <button
                              key={value}
                              onClick={() => setSelectedVariations(prev => ({ ...prev, [variation.name]: value }))}
                              className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                                selectedVariations[variation.name] === value
                                  ? 'bg-[#ff9a9e] text-white border-[#ff9a9e] shadow-sm'
                                  : 'border-gray-200 text-gray-600 hover:border-[#ff9a9e] bg-white'
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

                <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl w-fit">
                  <span className="text-gray-500 font-medium">כמות:</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))}
                      className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-[#ff9a9e] transition-colors"
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
                      className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-[#ff9a9e] transition-colors"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (selectedProduct.variations && selectedProduct.variations.length > 0) {
                      const unselected = selectedProduct.variations.filter(v => !selectedVariations[v.name]);
                      if (unselected.length > 0) {
                        alert(`נא לבחור: ${unselected.map(v => v.name).join(', ')}`);
                        return;
                      }
                    }
                    addToCart(selectedProduct, productQuantity, Object.keys(selectedVariations).length > 0 ? selectedVariations : undefined);
                    setIsCartOpen(true);
                  }}
                  className="w-full btn-primary text-xl py-5 shadow-xl flex items-center justify-center gap-3"
                >
                  <ShoppingCart size={24} />
                  הוספה לסל הקניות
                </button>
              </div>
            </div>

            {/* ── Customer Reviews ──────────────────────────────────────── */}
            <div className="pastel-card p-8 space-y-8">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <Star size={24} className="text-[#ff9a9e]" fill="#ff9a9e" />
                ביקורות לקוחות
                {reviews.length > 0 && <span className="text-base font-normal text-gray-400">({reviews.length})</span>}
              </h3>

              {/* Existing reviews */}
              {isLoadingReviews ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={28} className="animate-spin text-[#ff9a9e]" />
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
                    className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] outline-none text-sm"
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
                    className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] outline-none resize-none text-sm"
                    value={reviewForm.message}
                    onChange={e => setReviewForm(prev => ({ ...prev, message: e.target.value }))}
                  />
                </div>
                {/* Photo upload */}
                <div>
                  <label className="block text-sm text-gray-600 mb-2">📸 תמונה של המארז (אופציונלי)</label>
                  <div className="flex items-center gap-4">
                    <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-[#ff9a9e] text-[#ff9a9e] text-sm hover:bg-[#ff9a9e]/5 transition-colors">
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
            <div className="pastel-card p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
                  <input
                    id="checkout-name"
                    type="text"
                    placeholder="ישראל ישראלי"
                    aria-invalid={!!formErrors.name}
                    className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none ${formErrors.name ? 'border-red-400' : 'border-gray-200'}`}
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
                    inputMode="tel"
                    placeholder="050-1234567"
                    aria-invalid={!!formErrors.phone}
                    className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none ${formErrors.phone ? 'border-red-400' : 'border-gray-200'}`}
                    value={checkoutData.phone}
                    onChange={e => {
                      setCheckoutData(prev => ({ ...prev, phone: e.target.value }));
                      if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: undefined }));
                    }}
                    onBlur={e => setFormErrors(prev => ({ ...prev, phone: e.target.value && !isValidPhone(e.target.value) ? PHONE_ERROR : undefined }))}
                  />
                  {formErrors.phone
                    ? <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>
                    : <p className="text-xs text-gray-400 mt-1">מספר נייד ישראלי המתחיל ב-05 (לדוגמה 050-1234567)</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אימייל (אופציונלי)</label>
                  <input
                    type="email"
                    className="w-full p-3 rounded-xl border-gray-200 border focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                    value={checkoutData.email}
                    onChange={e => setCheckoutData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setCheckoutData(prev => ({ ...prev, delivery: 'pickup' }))}
                    className={`flex-1 p-3 rounded-xl border transition-all ${checkoutData.delivery === 'pickup' ? 'bg-[#a1c4fd] text-white border-[#a1c4fd]' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    איסוף עצמי
                  </button>
                  <button
                    onClick={() => setCheckoutData(prev => ({ ...prev, delivery: 'delivery' }))}
                    className={`flex-1 p-3 rounded-xl border transition-all ${checkoutData.delivery === 'delivery' ? 'bg-[#a1c4fd] text-white border-[#a1c4fd]' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    משלוח עד הבית
                  </button>
                </div>
                {checkoutData.delivery === 'delivery' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">כתובת למשלוח *</label>
                    <input
                      type="text"
                      placeholder="רחוב, מספר בית, עיר"
                      className="w-full p-3 rounded-xl border-gray-200 border focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                      value={checkoutData.shippingAddress}
                      onChange={e => setCheckoutData(prev => ({ ...prev, shippingAddress: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* Dedication Section */}
              <div className="border-t pt-4 space-y-3" style={{ background: 'linear-gradient(135deg,#fff5f8,#fff0f5)', borderRadius: 16, padding: 20, marginTop: 8 }}>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  💌 ברכה אישית <span className="text-sm font-normal text-gray-400">(אופציונלי)</span>
                </h3>
                <p className="text-xs text-gray-400">הוסף הקדשה אישית שתצורף למארז</p>
                <textarea
                  placeholder="כתוב כאן את ההקדשה שלך..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none resize-none text-sm"
                  value={dedication.message}
                  onChange={e => setDedication(prev => ({ ...prev, message: e.target.value }))}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">סוג כרטיס ברכה:</p>
                  {/* Toggle: 'printed' = opt-in (charged), 'digital' = not opted in (no card, no charge) */}
                  <button
                    type="button"
                    onClick={() => setDedication(prev => ({ ...prev, cardType: prev.cardType === 'printed' ? 'digital' : 'printed' }))}
                    className={`w-full p-3 rounded-xl border text-sm font-medium transition-all ${dedication.cardType === 'printed' ? 'bg-[#ff9a9e] text-white border-[#ff9a9e] shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-[#ff9a9e]'}`}
                  >
                    🖨️ כרטיס מודפס פרימיום<br/><span className="text-xs font-normal opacity-75">+₪{settings.printed_card_price || 15}</span>
                  </button>
                </div>
              </div>

              {/* Customer Notes */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">📝 הערות נוספות <span className="font-normal text-gray-400">(אופציונלי)</span></label>
                <textarea
                  placeholder="הערות מיוחדות להזמנה..."
                  rows={2}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none resize-none text-sm"
                  value={customerNotes}
                  onChange={e => setCustomerNotes(e.target.value)}
                />
              </div>

              {/* Coupon input */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">קוד קופון</label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <span className="text-green-700 font-semibold">
                      ✅ {appliedCoupon.code} — {appliedCoupon.type === 'percent' ? `${appliedCoupon.value}% הנחה` : `₪${appliedCoupon.value} הנחה`}
                    </span>
                    <button onClick={removeAppliedCoupon} className="text-gray-400 hover:text-red-500 mr-2">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="הזן קוד קופון"
                      className="flex-1 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none uppercase"
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value); setCouponError(null); }}
                      onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={isValidatingCoupon || !couponInput.trim()}
                      className="px-4 py-3 bg-[#a1c4fd] text-white rounded-xl font-medium disabled:opacity-50 hover:bg-[#7fb3fc] transition-colors"
                    >
                      {isValidatingCoupon ? <Loader2 size={18} className="animate-spin" /> : 'החל'}
                    </button>
                  </div>
                )}
                {couponError && <p className="text-red-500 text-sm">{couponError}</p>}
              </div>

              <div className="border-t pt-6 space-y-2">
                <div className="flex justify-between text-gray-500">
                  <span>סיכום מוצרים:</span>
                  <span>₪{cartTotal}</span>
                </div>
                {appliedCoupon && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>הנחת קופון ({appliedCoupon.code}):</span>
                    <span>-₪{discountAmount}</span>
                  </div>
                )}
                {checkoutData.delivery === 'delivery' && (
                  <div className="flex justify-between text-gray-500">
                    <span>דמי משלוח:</span>
                    <span>₪{settings.delivery_cost}</span>
                  </div>
                )}
                {cardCost > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>כרטיס ברכה מודפס:</span>
                    <span>+₪{cardCost}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold pt-2">
                  <span>סה"כ לתשלום:</span>
                  <span>₪{finalTotal}</span>
                </div>
              </div>

              <button
                onClick={handleCheckout}
                disabled={isCreatingPayment}
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
              <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#ff9a9e] to-[#a1c4fd]">✨ בנה את המארז שלך</h2>
              <p className="text-gray-500">בחר בסיס מארז ואחר כך הוסף מוצרים לפי בחירתך</p>
            </div>

            {/* Step 1: Select Box Base */}
            <div className="pastel-card p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-[#ff9a9e] text-white text-sm flex items-center justify-center font-bold">1</span>
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
                        className={`cursor-pointer rounded-2xl border-2 overflow-hidden transition-all ${selectedBoxBase?.id === box.id ? 'border-[#ff9a9e] shadow-lg scale-[1.02]' : 'border-gray-100 hover:border-[#ffd6e8]'}`}
                      >
                        <div className="aspect-square bg-gray-50 relative">
                          {box.main_image ? (
                            <img src={box.main_image} alt={box.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Gift size={32} className="text-gray-200" /></div>
                          )}
                          {selectedBoxBase?.id === box.id && (
                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#ff9a9e] flex items-center justify-center">
                              <CheckCircle2 size={14} color="white" />
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="font-semibold text-sm">{box.name}</p>
                          <p className="text-[#ff9a9e] font-bold text-sm">₪{box.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Step 2: Add Items */}
            {selectedBoxBase && (
              <div className="pastel-card p-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[#a1c4fd] text-white text-sm flex items-center justify-center font-bold">2</span>
                  הוסף מוצרים למארז
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {products.filter(p => !p.isBoxBase).map(product => {
                    const inBundle = bundleItems.find(bi => bi.product.id === product.id);
                    return (
                      <div key={product.id} className={`rounded-2xl border-2 overflow-hidden transition-all ${inBundle ? 'border-[#a1c4fd] shadow-md' : 'border-gray-100'}`}>
                        <div className="aspect-square bg-gray-50">
                          {product.main_image ? (
                            <img src={product.main_image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Package size={28} className="text-gray-200" /></div>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="font-semibold text-sm leading-tight">{product.name}</p>
                          <p className="text-[#ff9a9e] font-bold text-sm">₪{product.price}</p>
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
                              className="w-full text-xs py-1.5 rounded-lg border border-[#ff9a9e] text-[#ff9a9e] hover:bg-[#ff9a9e] hover:text-white transition-all flex items-center justify-center gap-1"
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
              <div className="pastel-card p-6 space-y-4 sticky bottom-4">
                <h3 className="text-lg font-bold text-gray-800">📦 סיכום המארז</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>בסיס: {selectedBoxBase.name}</span>
                    <span>₪{selectedBoxBase.price}</span>
                  </div>
                  {bundleItems.map(bi => (
                    <div key={bi.product.id} className="flex justify-between text-gray-600">
                      <span>{bi.product.name} × {bi.qty}</span>
                      <span>₪{bi.product.price * bi.qty}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>סה"כ:</span>
                    <span className="text-[#ff9a9e]">₪{bundleTotal}</span>
                  </div>
                </div>
                <button
                  onClick={addBundleToCart}
                  className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={20} />
                  הוסף מארז לסל — ₪{bundleTotal}
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
      <footer className="bg-white/60 border-t border-pink-100 mt-16 px-6 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
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
                {[['/', 'דף הבית'], ['/shop', 'החנות']].map(([href, label]) => (
                  <a key={href} href={href} className="text-sm text-gray-500 hover:text-[#ff9a9e] transition-colors">{label}</a>
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
                  <a key={href} href={href} className="text-sm text-gray-500 hover:text-[#ff9a9e] transition-colors">{label}</a>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-pink-100 pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
            <span>© {new Date().getFullYear()} Tony — אמנות המיתוג. כל הזכויות שמורות.</span>
            <div className="flex gap-4 flex-wrap">
              {[['/accessibility','נגישות'],['/terms','תקנון'],['/privacy','פרטיות'],['/shipping','משלוחים']].map(([href, label]) => (
                <a key={href} href={href} className="hover:text-[#ff9a9e] transition-colors">{label}</a>
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
                  onClick={() => { setSelectedCategory(null); setIsMenuOpen(false); navigateTo('user'); }}
                  className={`w-full text-right px-6 py-4 rounded-2xl transition-all font-bold ${!selectedCategory ? 'bg-[#ff9a9e]/10 text-[#ff9a9e]' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  הכל
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => { setSelectedCategory(cat.id); setIsMenuOpen(false); navigateTo('user'); }}
                    className={`w-full text-right px-6 py-4 rounded-2xl transition-all font-bold ${selectedCategory === cat.id ? 'bg-[#ff9a9e]/10 text-[#ff9a9e]' : 'hover:bg-gray-50 text-gray-600'}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AccessibilityWidget />

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
                    <div key={getCartKey(item.id, item.selectedVariations)} className="flex gap-4 items-center">
                      <div className="w-20 h-20 rounded-2xl bg-gray-100 overflow-hidden flex-shrink-0">
                        {item.main_image && <img src={item.main_image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                      </div>
                      <div className="flex-grow">
                        <h4 className="font-bold">{item.name}</h4>
                        {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {Object.entries(item.selectedVariations).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                          </p>
                        )}
                        <p className="text-[#ff9a9e] font-bold">₪{item.price}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1, item.selectedVariations)}
                            className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400"
                          >
                            <Minus size={16} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, (parseInt(e.target.value) || 1) - item.quantity, item.selectedVariations)}
                            className="w-12 text-center bg-transparent font-bold outline-none"
                          />
                          <button
                            onClick={() => updateQuantity(item.id, 1, item.selectedVariations)}
                            className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(item.id, item.selectedVariations)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t bg-gray-50 space-y-4">
                  <div className="flex justify-between text-xl font-bold">
                    <span>סה"כ:</span>
                    <span>₪{cartTotal}</span>
                  </div>
                  <button
                    onClick={() => { setIsCartOpen(false); navigateTo('checkout'); }}
                    className="w-full btn-primary text-lg py-4 shadow-lg"
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
                <MessageCircle size={28} fill="white" />
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
