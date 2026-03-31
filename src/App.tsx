import React, { useState, useEffect, useRef } from 'react';
import AccessibilityWidget from './components/AccessibilityWidget';
import GiftAssistant from './components/GiftAssistant';
import { ShoppingCart, Package, Settings as SettingsIcon, Plus, Trash2, Camera, ChevronRight, ChevronLeft, CheckCircle2, X, Menu, Loader2, Pencil, ChevronDown, Copy, Star, MessageCircle, Gift, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, Order, Settings, CartItem, Coupon, SiteContent, Review } from './types';
import { db, storage, auth } from './firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, doc, deleteDoc, getDoc, setDoc, updateDoc, query, orderBy, where, limit, onSnapshot } from "firebase/firestore";
import * as XLSX from 'xlsx';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar
} from 'recharts';

/* ─────────────────────────────── ShopAnalyticsView ──────────────────── */
const ANALYTICS_COLORS = ['#ff9a9e', '#fecfef', '#a1c4fd', '#c2e9fb', '#ffecd2', '#fcb69f', '#84fab0', '#8fd3f4'];

function ShopAnalyticsView({ orders, products, categories }: {
  orders: Order[];
  products: Product[];
  categories: Category[];
}) {
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [selectedProductId, setSelectedProductId] = React.useState('');

  const toDate = (v: string) => new Date(v);

  const dateFiltered = orders.filter(o => {
    const d = toDate(o.created_at);
    if (startDate && d < new Date(startDate)) return false;
    if (endDate && d > new Date(endDate + 'T23:59:59')) return false;
    return true;
  });

  const completed = dateFiltered.filter(o => o.orderStatus === 'Completed');
  const selProd = products.find(p => p.id === selectedProductId);
  const filtered = selectedProductId
    ? completed.filter(o => o.items.some(i => i.id === selectedProductId))
    : completed;

  const periodTotal = filtered.reduce((s, o) => s + o.total_price, 0);
  const avgOrder = filtered.length > 0 ? Math.round(periodTotal / filtered.length) : 0;
  const pendingPayment = orders.filter(o => !o.isPaid).length;
  const allPaid = orders.filter(o => o.isPaid);
  const totalCost = allPaid.reduce((sum, o) =>
    sum + o.items.reduce((s, i) => s + (i.costPrice ?? 0) * i.quantity, 0), 0);
  const netProfit = allPaid.reduce((s, o) => s + o.total_price, 0) - totalCost;

  const dailyData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dayStr = d.toISOString().split('T')[0];
    const dayOrders = completed.filter(o => toDate(o.created_at).toISOString().startsWith(dayStr));
    let revenue: number;
    if (selectedProductId) {
      revenue = dayOrders.reduce((s, o) =>
        s + o.items.filter(i => i.id === selectedProductId).reduce((is, i) => is + i.price * i.quantity, 0), 0);
    } else {
      revenue = dayOrders.reduce((s, o) => s + o.total_price, 0);
    }
    return { date: d.toLocaleDateString('he-IL', { month: 'short', day: 'numeric' }), revenue: Math.round(revenue) };
  });

  const productCatMap: Record<string, string> = {};
  products.forEach(p => { productCatMap[p.id] = p.category_id; });
  const catRevMap: Record<string, number> = {};
  const catVolMap: Record<string, number> = {};
  const prodRevMap: Record<string, number> = {};
  const prodVolMap: Record<string, number> = {};
  const prodNameMap: Record<string, string> = {};

  completed.forEach(o => {
    o.items.forEach(item => {
      const catId = productCatMap[item.id] ?? '';
      const rev = item.price * item.quantity;
      catRevMap[catId] = (catRevMap[catId] || 0) + rev;
      catVolMap[catId] = (catVolMap[catId] || 0) + item.quantity;
      prodRevMap[item.id] = (prodRevMap[item.id] || 0) + rev;
      prodVolMap[item.id] = (prodVolMap[item.id] || 0) + item.quantity;
      if (!prodNameMap[item.id]) prodNameMap[item.id] = item.name;
    });
  });

  const categoryRevData = categories
    .map(c => ({ name: c.name, value: Math.round(catRevMap[c.id] || 0) }))
    .filter(c => c.value > 0).sort((a, b) => b.value - a.value);

  const categoryVolData = categories
    .map(c => ({ name: c.name, volume: catVolMap[c.id] || 0 }))
    .filter(c => c.volume > 0).sort((a, b) => b.volume - a.volume);

  const topProductsData = Object.entries(prodRevMap)
    .map(([id, rev]) => ({ name: prodNameMap[id] ?? products.find(p => p.id === id)?.name ?? id.slice(0, 8), value: Math.round(rev) }))
    .sort((a, b) => b.value - a.value).slice(0, 8);

  const completedProductIds = [...new Set(completed.flatMap(o => o.items.map(i => i.id)))];
  const completedProducts = completedProductIds.map(id => products.find(p => p.id === id)).filter(Boolean) as Product[];
  const hasData = categoryRevData.length > 0 || topProductsData.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-xl font-bold">דשבורד אנליטיקס</h3>
          <p className="text-sm text-gray-400 mt-0.5">מבוסס על הזמנות שהושלמו בלבד</p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700">✓ Completed בלבד</span>
      </div>

      {/* Filters */}
      <div className="pastel-card p-4">
        <h4 className="font-semibold text-sm text-gray-700 mb-3">סינון נתונים</h4>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-gray-500 text-xs block mb-1">מתאריך</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm outline-none focus:border-[#ff9a9e] transition-colors" />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">עד תאריך</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm outline-none focus:border-[#ff9a9e] transition-colors" />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">סינון לפי מוצר</label>
            <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm outline-none focus:border-[#ff9a9e] min-w-[180px]">
              <option value="">כל המוצרים</option>
              {completedProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {(startDate || endDate || selectedProductId) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedProductId(''); }}
              className="px-3 py-2 text-sm text-gray-500 border rounded-xl hover:bg-gray-50 transition-colors">
              נקה הכל
            </button>
          )}
          <span className="text-gray-400 text-xs py-2">{filtered.length} הזמנות</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="pastel-card p-5 space-y-1">
          <p className="text-sm text-gray-500">הזמנות הושלמו</p>
          <p className="text-3xl font-bold text-gray-800">{filtered.length}</p>
          <p className="text-xs text-yellow-600">{pendingPayment} ממתינות</p>
        </div>
        <div className="pastel-card p-5 space-y-1">
          <p className="text-sm text-gray-500">הכנסות ברוטו</p>
          <p className="text-3xl font-bold text-[#ff9a9e]">₪{periodTotal.toLocaleString()}</p>
        </div>
        <div className="pastel-card p-5 space-y-1">
          <p className="text-sm text-gray-500">ממוצע להזמנה</p>
          <p className="text-3xl font-bold text-gray-800">{filtered.length > 0 ? `₪${avgOrder.toLocaleString()}` : '—'}</p>
        </div>
        <div className="pastel-card p-5 space-y-1">
          <p className="text-sm text-gray-500">רווח נקי</p>
          <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>₪{netProfit.toFixed(0)}</p>
        </div>
      </div>

      {/* Line Chart — Revenue over time */}
      <div className="pastel-card p-5">
        <h4 className="font-bold mb-4">
          הכנסות לאורך זמן (30 ימים אחרונים)
          {selectedProductId && selProd && (
            <span className="mr-2 text-xs font-normal px-2 py-0.5 rounded-full bg-pink-100 text-[#ff9a9e]">{selProd.name}</span>
          )}
        </h4>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0e8e8" />
            <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#888', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v}`} width={60} />
            <Tooltip contentStyle={{ fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
            <Line type="monotone" dataKey="revenue" stroke="#ff9a9e" strokeWidth={4}
              dot={{ fill: '#ff9a9e', strokeWidth: 0, r: 5 }} activeDot={{ r: 7, fill: '#ff9a9e' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasData ? (
        <>
          {/* Bar Chart — Volume by category */}
          {categoryVolData.length > 0 && (
            <div className="pastel-card p-5">
              <h4 className="font-bold mb-4">כמות מכירות לפי קטגוריה</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryVolData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e8e8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [v, 'יחידות']} />
                  <Bar dataKey="volume" radius={[8, 8, 0, 0]}>
                    {categoryVolData.map((_, idx) => <Cell key={idx} fill={ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pie Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {categoryRevData.length > 0 && (
              <div className="pastel-card p-5">
                <h4 className="font-bold mb-4">הכנסות לפי קטגוריה</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={categoryRevData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ strokeWidth: 1.5 }}>
                      {categoryRevData.map((_, idx) => <Cell key={idx} fill={ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
                    <Legend wrapperStyle={{ fontSize: 13, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {topProductsData.length > 0 && (
              <div className="pastel-card p-5">
                <h4 className="font-bold mb-4">מוצרים מובילים לפי הכנסה</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={topProductsData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}
                      label={({ name, percent }) => percent > 0.06 ? `${name.length > 12 ? name.slice(0, 12) + '…' : name} ${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={{ stroke: '#ccc', strokeWidth: 1.5 }}>
                      {topProductsData.map((_, idx) => <Cell key={idx} fill={ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
                    <Legend wrapperStyle={{ fontSize: 13, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Product volume table */}
          {Object.keys(prodVolMap).length > 0 && (
            <div className="pastel-card p-5">
              <h4 className="font-semibold mb-4">כמות מכירות לפי מוצר</h4>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {Object.entries(prodVolMap).sort(([, a], [, b]) => b - a).map(([id, qty]) => {
                  const prod = products.find(p => p.id === id);
                  if (!prod) return null;
                  const maxQty = Math.max(...Object.values(prodVolMap));
                  return (
                    <div key={id} className="flex items-center gap-3 text-sm">
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-700 truncate">{prod.name}</span>
                          <span className="font-bold text-[#ff9a9e] flex-shrink-0 mr-2">{qty} יח'</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-pink-100 overflow-hidden">
                          <div className="h-full rounded-full bg-[#ff9a9e]" style={{ width: `${(qty / maxQty) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="pastel-card p-10 text-center text-gray-400">
          <p className="text-sm">אין נתוני מכירות שהושלמו עדיין</p>
          <p className="text-xs mt-1">סמן הזמנות כ-Completed כדי לראות נתונים</p>
        </div>
      )}

      {/* Status Distribution */}
      <div className="pastel-card p-6">
        <h4 className="font-bold mb-4">התפלגות סטטוסי הזמנות</h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {(['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'] as const).map(status => {
            const count = orders.filter(o => (o.orderStatus ?? 'Pending') === status).length;
            const colors: Record<string, string> = {
              Pending: 'bg-yellow-100 text-yellow-700',
              Processing: 'bg-blue-100 text-blue-700',
              Shipped: 'bg-purple-100 text-purple-700',
              Completed: 'bg-green-100 text-green-700',
              Cancelled: 'bg-red-100 text-red-700'
            };
            return (
              <div key={status} className={`rounded-xl p-4 text-center ${colors[status]}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-sm font-medium">{status}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<'user' | 'admin' | 'checkout' | 'success' | 'product' | 'build-box'>('user');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<'products' | 'orders' | 'settings' | 'coupons' | 'content' | 'analytics' | 'legal'>('products');

  // Legal pages CMS
  const [legalDocs, setLegalDocs] = useState<{ terms: string; privacy: string; shipping: string }>({ terms: '', privacy: '', shipping: '' });
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalSaving, setLegalSaving] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings>({ pickup_address: '', delivery_cost: '0', bit_phone: '' });
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('tony_store_cart') || '[]'); } catch { return []; }
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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

  // Saved total for Bit payment link (finalTotal resets to 0 when cart is cleared)
  const [savedFinalTotal, setSavedFinalTotal] = useState(0);

  // Build-A-Box
  const [selectedBoxBase, setSelectedBoxBase] = useState<Product | null>(null);
  const [bundleItems, setBundleItems] = useState<{ product: Product; qty: number }[]>([]);
  const [bundleBoxStyle, setBundleBoxStyle] = useState<string>('');

  // WhatsApp bubble
  const [waVisible, setWaVisible] = useState(false);
  const waTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real-time orders listener cleanup
  const ordersUnsubRef = useRef<(() => void) | null>(null);
  const urlInitDone = useRef(false);

  // Export
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Admin orders expand
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Edit product
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProductData, setEditProductData] = useState<{
    name: string; description: string; price: number; costPrice: number; alt_text: string; category_id: string;
    newImageFiles: File[]; newImagePreviews: string[];
    variations: { name: string; values: string }[];
    isBoxBase: boolean;
  }>({ name: '', description: '', price: 0, costPrice: 0, alt_text: '', category_id: '', newImageFiles: [], newImagePreviews: [], variations: [], isBoxBase: false });

  // Edit category
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Coupon — storefront
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Coupon — admin
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [newCoupon, setNewCoupon] = useState<{ code: string; type: 'percent' | 'fixed'; value: number; expiryDate: string }>({
    code: '', type: 'percent', value: 0, expiryDate: ''
  });

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

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Admin Login State
  const [loginData, setLoginData] = useState({ email: '', password: '' });

  useEffect(() => {
    fetchData();
    // Show WhatsApp bubble after 15 seconds
    waTimerRef.current = setTimeout(() => setWaVisible(true), 15000);

    // Restore admin session if Firebase Auth token is still valid
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAdmin(true);
        subscribeOrders();
      }
    });

    return () => {
      if (waTimerRef.current) clearTimeout(waTimerRef.current);
      if (ordersUnsubRef.current) ordersUnsubRef.current();
      unsubAuth();
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
    const phone = '972525830758';
    let msg = 'היי, אשמח לעזרה בבחירת מתנה';
    if (view === 'product' && selectedProduct) {
      msg = `היי טוני, יש לי שאלה לגבי ${selectedProduct.name}`;
    }
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const fetchOrders = async () => {
    const ordersQuery = query(collection(db, "orders"), orderBy("created_at", "desc"));
    const ordersSnapshot = await getDocs(ordersQuery);
    const ordersData = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
    setOrders(ordersData);
  };

  // Real-time listener — replaces fetchOrders when admin is in orders tab
  const subscribeOrders = () => {
    // Clean up any existing subscription first
    if (ordersUnsubRef.current) {
      ordersUnsubRef.current();
      ordersUnsubRef.current = null;
    }
    const ordersQuery = query(collection(db, "orders"), orderBy("created_at", "desc"));
    const unsub = onSnapshot(ordersQuery, snapshot => {
      setOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Order[]);
    }, err => {
      console.error("onSnapshot error:", err);
    });
    ordersUnsubRef.current = unsub;
  };

  // Excel export
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      let exportOrders = orders;
      if (exportDateFrom || exportDateTo) {
        const from = exportDateFrom ? new Date(exportDateFrom).getTime() : 0;
        const to = exportDateTo ? new Date(exportDateTo + 'T23:59:59').getTime() : Infinity;
        exportOrders = orders.filter(o => {
          const t = new Date(o.created_at).getTime();
          return t >= from && t <= to;
        });
      }

      if (exportOrders.length === 0) {
        alert('אין הזמנות בטווח התאריכים שנבחר');
        return;
      }

      const rows = exportOrders.flatMap(order =>
        order.items.length === 0
          ? [{
              'מזהה הזמנה': order.id,
              'שם לקוח': order.customer_name,
              'טלפון': order.customer_phone,
              'אימייל': order.customer_email ?? '',
              'שיטת משלוח': order.delivery_method === 'delivery' ? 'משלוח' : 'איסוף עצמי',
              'כתובת משלוח': order.shippingAddress ?? '',
              'שם מוצר': '',
              'כמות': '',
              'מחיר יחידה': '',
              'וריאציות': '',
              'סה"כ הזמנה': order.total_price,
              'קוד קופון': order.coupon_code ?? '',
              'הנחה': order.discount_amount ?? 0,
              'סטטוס': order.orderStatus,
              'שולם': order.isPaid ? 'כן' : 'לא',
              'הקדשה': order.dedication?.message ?? '',
              'סוג כרטיס': order.dedication?.cardType ?? '',
              'הערות': order.customer_notes ?? '',
              'תאריך הזמנה': new Date(order.created_at).toLocaleString('he-IL'),
            }]
          : order.items.map(item => ({
              'מזהה הזמנה': order.id,
              'שם לקוח': order.customer_name,
              'טלפון': order.customer_phone,
              'אימייל': order.customer_email ?? '',
              'שיטת משלוח': order.delivery_method === 'delivery' ? 'משלוח' : 'איסוף עצמי',
              'כתובת משלוח': order.shippingAddress ?? '',
              'שם מוצר': item.name,
              'כמות': item.quantity,
              'מחיר יחידה': item.price,
              'וריאציות': item.selectedVariations ? Object.entries(item.selectedVariations).map(([k,v]) => `${k}: ${v}`).join(' | ') : '',
              'סה"כ הזמנה': order.total_price,
              'קוד קופון': order.coupon_code ?? '',
              'הנחה': order.discount_amount ?? 0,
              'סטטוס': order.orderStatus,
              'שולם': order.isPaid ? 'כן' : 'לא',
              'הקדשה': order.dedication?.message ?? '',
              'סוג כרטיס': order.dedication?.cardType ?? '',
              'הערות': order.customer_notes ?? '',
              'תאריך הזמנה': new Date(order.created_at).toLocaleString('he-IL'),
            }))
      );

      const ws = XLSX.utils.json_to_sheet(rows);
      // Auto-width columns
      const colWidths = Object.keys(rows[0] ?? {}).map(k => ({ wch: Math.max(k.length, 14) }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'הזמנות');
      const dateTag = exportDateFrom || exportDateTo
        ? `_${exportDateFrom || 'start'}_to_${exportDateTo || 'end'}`
        : `_${new Date().toISOString().slice(0, 10)}`;
      XLSX.writeFile(wb, `tony_orders${dateTag}.xlsx`);
      showToast(`יוצאו ${exportOrders.length} הזמנות לקובץ Excel ✅`);
    } catch (err) {
      console.error('Export error:', err);
      alert('שגיאה ביצוא הנתונים');
    } finally {
      setIsExporting(false);
    }
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

  const handleCheckout = async () => {
    if (!checkoutData.name || !checkoutData.phone) return alert("נא למלא את כל השדות");
    if (checkoutData.delivery === 'delivery' && !checkoutData.shippingAddress.trim()) return alert("נא להזין כתובת למשלוח");

    try {
      const orderItems = cart.map(i => ({
        id: i.id, name: i.name, price: i.price, costPrice: i.costPrice ?? 0, quantity: i.quantity,
        ...(i.selectedVariations && Object.keys(i.selectedVariations).length > 0 && { selectedVariations: i.selectedVariations }),
      }));
      const dedicationData = dedication.message.trim()
        ? { message: dedication.message.trim(), cardType: dedication.cardType }
        : undefined;
      const orderDoc = await addDoc(collection(db, "orders"), {
        customer_name: checkoutData.name,
        customer_phone: checkoutData.phone,
        ...(checkoutData.email && { customer_email: checkoutData.email }),
        delivery_method: checkoutData.delivery,
        total_price: finalTotal,
        items: orderItems,
        status: 'חדש',
        orderStatus: 'Pending',
        isPaid: false,
        ...(checkoutData.delivery === 'delivery' && { shippingAddress: checkoutData.shippingAddress }),
        created_at: new Date().toISOString(),
        ...(appliedCoupon && {
          coupon_code: appliedCoupon.code,
          discount_amount: discountAmount,
        }),
        ...(dedicationData && { dedication: dedicationData }),
        ...(customerNotes.trim() && { customer_notes: customerNotes.trim() }),
      });
      setLastOrderId(orderDoc.id);
      setSavedFinalTotal(finalTotal); // snapshot before cart is cleared
      setCart([]);
      setAppliedCoupon(null);
      setCouponInput('');
      setCheckoutData({ name: '', phone: '', email: '', delivery: 'pickup', shippingAddress: '' });
      setDedication({ message: '', cardType: 'digital' });
      setCustomerNotes('');
      navigateTo('success');
      // Telegram notification is sent automatically by the onOrderCreated Cloud Function trigger
    } catch (err) {
      console.error("Checkout error:", err);
      alert("שגיאה בשליחת ההזמנה");
    }
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

  // ── Coupon: admin ────────────────────────────────────────────────────────────
  const fetchCoupons = async () => {
    const snap = await getDocs(query(collection(db, "coupons"), orderBy("code")));
    setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Coupon[]);
  };

  const handleCreateCoupon = async () => {
    const code = newCoupon.code.trim().toUpperCase();
    if (!code || newCoupon.value <= 0) return alert("נא למלא קוד וערך תקינים");
    try {
      await addDoc(collection(db, "coupons"), {
        code,
        type: newCoupon.type,
        value: Number(newCoupon.value),
        expiryDate: newCoupon.expiryDate,
        isActive: true,
      });
      setNewCoupon({ code: '', type: 'percent', value: 0, expiryDate: '' });
      fetchCoupons();
      showToast("קופון נוצר בהצלחה");
    } catch (err) {
      console.error(err);
      alert("שגיאה ביצירת הקופון");
    }
  };

  const handleToggleCoupon = async (coupon: Coupon) => {
    await updateDoc(doc(db, "coupons", coupon.id), { isActive: !coupon.isActive });
    fetchCoupons();
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm("למחוק קופון זה?")) return;
    await deleteDoc(doc(db, "coupons", id));
    fetchCoupons();
  };

  const sendTelegramStatusUpdate = async (order: Order, newStatus: string) => {
    const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;
    const statusEmoji: Record<string, string> = { Pending: '⏳', Processing: '🔄', Completed: '✅', Cancelled: '❌' };
    const message = `${statusEmoji[newStatus] ?? '📋'} *עדכון סטטוס הזמנה #${order.id.slice(0, 6)}*\n\n👤 *לקוח:* ${order.customer_name}\n📞 *טלפון:* ${order.customer_phone}\n💰 *סה"כ:* ₪${order.total_price}\n\n🔁 *סטטוס חדש:* ${newStatus}`;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
    });
  };

  const handleUpdateOrderStatus = async (order: Order, newStatus: Order['orderStatus']) => {
    try {
      await updateDoc(doc(db, "orders", order.id), { orderStatus: newStatus });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, orderStatus: newStatus } : o));
      sendTelegramStatusUpdate({ ...order, orderStatus: newStatus }, newStatus)
        .catch(err => console.error("Telegram status update error:", err));
    } catch (err) {
      console.error("Error updating order status:", err);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, loginData.email, loginData.password);
      setIsAdmin(true);
      setAdminTab('orders');
      subscribeOrders();
    } catch {
      alert("שם משתמש או סיסמה שגויים");
    }
  };

  const handleEditProduct = async () => {
    if (!editingProduct || !editProductData.name || !editProductData.price) return;
    if (!confirm("האם לשמור את השינויים במוצר?")) return;
    try {
      setIsUploading(true);
      const newImageUrls: string[] = [];
      for (const file of editProductData.newImageFiles) {
        const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        newImageUrls.push(url);
      }
      const allImages = [...(editingProduct.images || []), ...newImageUrls];
      await updateDoc(doc(db, "products", editingProduct.id), {
        name: editProductData.name,
        description: editProductData.description,
        price: editProductData.price,
        costPrice: editProductData.costPrice ?? 0,
        alt_text: editProductData.alt_text || editProductData.name,
        category_id: editProductData.category_id,
        images: allImages,
        main_image: allImages[0] || editingProduct.main_image,
        variations: editProductData.variations
          .filter(v => v.name.trim())
          .map(v => ({ name: v.name.trim(), values: v.values.split(',').map(s => s.trim()).filter(Boolean) })),
        isBoxBase: editProductData.isBoxBase,
      });
      showToast("המוצר עודכן בהצלחה!");
      setEditingProduct(null);
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast("שגיאה בעדכון המוצר");
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditCategory = async (id: string) => {
    if (!editingCategoryName.trim()) return;
    if (!confirm("האם לשמור את שינוי הקטגוריה?")) return;
    try {
      await updateDoc(doc(db, "categories", id), { name: editingCategoryName });
      showToast("הקטגוריה עודכנה בהצלחה!");
      setEditingCategoryId(null);
      setEditingCategoryName('');
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Admin Actions
  const [newProduct, setNewProduct] = useState<{
    name: string;
    description: string;
    price: number;
    costPrice: number;
    alt_text: string;
    category_id: string;
    imageFiles: File[];
    imagePreviews: string[];
    main_image_index: number;
    variations: { name: string; values: string }[];
  }>({ name: '', description: '', price: 0, costPrice: 0, alt_text: '', category_id: '', imageFiles: [], imagePreviews: [], main_image_index: 0, variations: [] });
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.category_id) {
      return alert("נא למלא את כל השדות החובה");
    }

    try {
      setIsUploading(true);

      // 1. Upload images to Firebase Storage
      const imageUrls: string[] = [];
      for (const file of newProduct.imageFiles) {
        const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(storageRef);
        imageUrls.push(imageUrl);
      }

      // 2. Save product to Firestore
      await addDoc(collection(db, "products"), {
        name: newProduct.name,
        description: newProduct.description,
        price: newProduct.price,
        costPrice: newProduct.costPrice ?? 0,
        alt_text: newProduct.alt_text || newProduct.name,
        category_id: newProduct.category_id,
        images: imageUrls,
        main_image: imageUrls[newProduct.main_image_index] || imageUrls[0] || null,
        variations: newProduct.variations
          .filter(v => v.name.trim())
          .map(v => ({ name: v.name.trim(), values: v.values.split(',').map(s => s.trim()).filter(Boolean) })),
        created_at: new Date()
      });

      showToast("המוצר נוסף בהצלחה!");
      await fetchData();
      setNewProduct({ name: '', description: '', price: 0, costPrice: 0, alt_text: '', category_id: '', imageFiles: [], imagePreviews: [], main_image_index: 0, variations: [] });
    } catch (err) {
      console.error("Error adding product:", err);
      alert("שגיאה בהוספת המוצר");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק מוצר זה?")) return;
    try {
      await deleteDoc(doc(db, "products", id));
      await fetchData();
    } catch (err) {
      console.error("Error deleting product:", err);
      alert("שגיאה במחיקת המוצר");
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await addDoc(collection(db, "categories"), {
        name: newCategoryName,
        created_at: new Date()
      });
      showToast("הקטגוריה נוספה בהצלחה!");
      await fetchData();
      setNewCategoryName('');
    } catch (err) {
      console.error("Error adding category:", err);
      showToast("שגיאה בהוספת הקטגוריה");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק קטגוריה זו?")) return;
    try {
      await deleteDoc(doc(db, "categories", id));
      showToast("הקטגוריה נמחקה");
      await fetchData();
    } catch (err) {
      console.error("Error deleting category:", err);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);

      // Create previews
      newFiles.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewProduct(prev => ({
            ...prev,
            imageFiles: [...prev.imageFiles, file],
            imagePreviews: [...prev.imagePreviews, reader.result as string]
          }));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setNewProduct(prev => ({
      ...prev,
      imageFiles: prev.imageFiles.filter((_, i) => i !== index),
      imagePreviews: prev.imagePreviews.filter((_, i) => i !== index),
      main_image_index: prev.main_image_index >= index ? Math.max(0, prev.main_image_index - 1) : prev.main_image_index
    }));
  };

  const handleSaveSettings = async () => {
    try {
      await setDoc(doc(db, "settings", "store"), settings);
      showToast("הגדרות נשמרו בהצלחה");
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("שגיאה בשמירת ההגדרות");
    }
  };

  const handleSaveContent = async () => {
    try {
      await setDoc(doc(db, "settings", "content"), siteContent);
      showToast("תוכן האתר עודכן בהצלחה");
    } catch (err) {
      console.error("Error saving content:", err);
      alert("שגיאה בשמירת התוכן");
    }
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

  const printOrder = (order: Order) => {
    const win = window.open('', '_blank', 'width=820,height=700');
    if (!win) return;
    const itemsHtml = order.items.map(item => `
      <div class="item">
        <div>
          <div class="item-name">${item.name}</div>
          <div class="item-qty">× ${item.quantity} &nbsp;|&nbsp; ₪${item.price} ליחידה</div>
          ${item.selectedVariations && Object.keys(item.selectedVariations).length > 0
            ? `<div class="item-vars">${Object.entries(item.selectedVariations).map(([k, v]) => `${k}: <strong>${v}</strong>`).join(' &nbsp;|&nbsp; ')}</div>`
            : ''}
        </div>
        <div class="item-price">₪${(item.price * item.quantity).toFixed(2)}</div>
      </div>`).join('');

    const dedicationHtml = order.dedication?.message ? `
      <div class="section dedication">
        <h3>💌 הקדשה אישית</h3>
        <p class="ded-text">${order.dedication.message.replace(/\n/g, '<br>')}</p>
        <span class="card-badge">${order.dedication.cardType === 'printed' ? '🖨️ כרטיס מודפס' : '📱 כרטיס דיגיטלי'}</span>
      </div>` : '';

    const notesHtml = order.customer_notes ? `
      <div class="section notes-sec">
        <h3>📝 הערות לקוח</h3>
        <p>${order.customer_notes}</p>
      </div>` : '';

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>הזמנה #${order.id.slice(0, 6)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; direction: rtl; color: #111; background: #fff; padding: 32px 40px; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 3px solid #ff9a9e; margin-bottom: 20px; }
    .brand { font-size: 26px; font-weight: 900; color: #ff9a9e; }
    .brand-sub { font-size: 12px; color: #aaa; margin-top: 2px; }
    .order-id { font-size: 18px; font-weight: 700; color: #333; }
    .order-date { font-size: 12px; color: #999; margin-top: 3px; }
    .section { margin-bottom: 16px; padding: 14px 18px; border: 1px solid #ffe0e8; border-radius: 10px; background: #fff9fb; }
    .section h3 { font-size: 12px; font-weight: 800; color: #ff9a9e; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }
    .customer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .field label { display: block; font-size: 10px; color: #888; margin-bottom: 2px; }
    .field span { font-size: 14px; font-weight: 600; }
    .address-sec { background: #f0f7ff; border-color: #b3d4ff; }
    .address-sec h3 { color: #3b82f6; }
    .address-text { font-size: 16px; font-weight: 800; color: #1d4ed8; }
    .dedication { background: #fff5f7; border-color: #ffb3c1; border-width: 2px; }
    .dedication h3 { color: #e11d48; }
    .ded-text { font-size: 15px; line-height: 1.75; color: #333; font-style: italic; margin-bottom: 8px; }
    .card-badge { font-size: 12px; background: #ffe4e6; color: #be123c; padding: 3px 10px; border-radius: 99px; display: inline-block; }
    .notes-sec { background: #fffbeb; border-color: #fde68a; }
    .notes-sec h3 { color: #d97706; }
    .item { display: flex; justify-content: space-between; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #f5e0e4; }
    .item:last-child { border-bottom: none; }
    .item-name { font-weight: 700; font-size: 14px; }
    .item-qty { font-size: 12px; color: #888; margin-top: 3px; }
    .item-vars { font-size: 12px; color: #ff9a9e; margin-top: 4px; }
    .item-price { font-weight: 700; color: #ff9a9e; font-size: 14px; flex-shrink: 0; }
    .totals { margin-top: 12px; border-top: 2px dashed #ffcdd2; padding-top: 12px; }
    .total-row { display: flex; justify-content: space-between; font-size: 13px; color: #666; padding: 3px 0; }
    .total-row.grand { font-size: 20px; font-weight: 900; color: #ff9a9e; padding-top: 10px; border-top: 2px solid #ff9a9e; margin-top: 6px; }
    .footer-note { text-align: center; color: #bbb; font-size: 11px; margin-top: 28px; padding-top: 14px; border-top: 1px solid #f0f0f0; }
    @media print { @page { margin: 16mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div><div class="brand">Tony</div><div class="brand-sub">אמנות המיתוג</div></div>
    <div style="text-align:left"><div class="order-id">הזמנה #${order.id.slice(0, 6)}</div><div class="order-date">${new Date(order.created_at).toLocaleString('he-IL')}</div></div>
  </div>
  <div class="section">
    <h3>פרטי לקוח</h3>
    <div class="customer-grid">
      <div class="field"><label>שם מלא</label><span>${order.customer_name}</span></div>
      <div class="field"><label>טלפון</label><span>${order.customer_phone}</span></div>
      ${order.customer_email ? `<div class="field"><label>אימייל</label><span>${order.customer_email}</span></div>` : ''}
      <div class="field"><label>שיטת משלוח</label><span>${order.delivery_method === 'delivery' ? '🚚 משלוח' : '📍 איסוף עצמי'}</span></div>
    </div>
  </div>
  ${order.delivery_method === 'delivery' && order.shippingAddress ? `
  <div class="section address-sec">
    <h3>📍 כתובת למשלוח</h3>
    <div class="address-text">${order.shippingAddress}</div>
  </div>` : ''}
  ${dedicationHtml}
  ${notesHtml}
  <div class="section">
    <h3>פריטי הזמנה</h3>
    ${itemsHtml}
    <div class="totals">
      ${order.coupon_code ? `<div class="total-row"><span>קופון (${order.coupon_code})</span><span>-₪${order.discount_amount}</span></div>` : ''}
      <div class="total-row grand"><span>סה"כ לתשלום</span><span>₪${order.total_price}</span></div>
    </div>
  </div>
  <div class="footer-note">Tony — אמנות המיתוג &nbsp;|&nbsp; כל הזכויות שמורות</div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`;
    win.document.write(html);
    win.document.close();
  };

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
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigateTo('user')}>
            <div className="w-10 h-10 bg-gradient-to-br from-[#ff9a9e] to-[#fecfef] rounded-xl flex items-center justify-center text-white shadow-lg">
              <Package size={24} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#ff9a9e] to-[#a1c4fd]">
              {isContentLoading
                ? <span className="inline-block w-16 h-5 bg-gradient-to-r from-gray-200 to-gray-100 rounded animate-pulse" />
                : siteContent.storeName}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setView(view === 'admin' ? 'user' : 'admin')}
            className={`p-2 rounded-full transition-all ${view === 'admin' ? 'bg-[#ff9a9e] text-white shadow-md' : 'hover:bg-gray-100 text-gray-500'}`}
            title="ניהול"
          >
            <SettingsIcon size={20} />
          </button>
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
                      <ChevronRight size={20} />
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
                      <ChevronLeft size={20} />
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
                    type="text"
                    className="w-full p-3 rounded-xl border-gray-200 border focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                    value={checkoutData.name}
                    onChange={e => setCheckoutData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מספר טלפון</label>
                  <input
                    type="tel"
                    className="w-full p-3 rounded-xl border-gray-200 border focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                    value={checkoutData.phone}
                    onChange={e => setCheckoutData(prev => ({ ...prev, phone: e.target.value }))}
                  />
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
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setDedication(prev => ({ ...prev, cardType: 'digital' }))}
                      className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-all ${dedication.cardType === 'digital' ? 'bg-[#ff9a9e] text-white border-[#ff9a9e] shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-[#ff9a9e]'}`}
                    >
                      📱 כרטיס דיגיטלי<br/><span className="text-xs font-normal opacity-75">חינם</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDedication(prev => ({ ...prev, cardType: 'printed' }))}
                      className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-all ${dedication.cardType === 'printed' ? 'bg-[#ff9a9e] text-white border-[#ff9a9e] shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-[#ff9a9e]'}`}
                    >
                      🖨️ כרטיס מודפס פרימיום<br/><span className="text-xs font-normal opacity-75">+₪{settings.printed_card_price || 15}</span>
                    </button>
                  </div>
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
                className="w-full btn-primary text-lg py-4 shadow-lg"
              >
                אישור הזמנה ותשלום
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
                              <button onClick={() => updateBundleQty(product.id, -1)} className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-100 text-gray-400"><ChevronRight size={14} /></button>
                              <span className="font-bold text-sm">{inBundle.qty}</span>
                              <button onClick={() => updateBundleQty(product.id, 1)} className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-100 text-gray-400"><ChevronLeft size={14} /></button>
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
          <div className="max-w-md mx-auto text-center space-y-8 py-12">
            <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={48} />
            </div>
            <div className="space-y-4">
              <h2 className="text-3xl font-bold">ההזמנה התקבלה!</h2>
              <p className="text-gray-500">מספר הזמנה: #{lastOrderId}</p>
              <p className="text-gray-600">תודה שקנית אצלנו. כעת ניתן לעבור לתשלום ב-Bit.</p>
            </div>
            <a
              href={`https://bitpay.co.il/app/pay?phone=${settings.bit_phone}&amount=${savedFinalTotal}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-[#00b0ff] text-white py-4 rounded-2xl font-bold text-xl shadow-lg hover:bg-[#0091ea] transition-all"
            >
              שלם ב-Bit ₪{savedFinalTotal}
            </a>
            <button onClick={() => navigateTo('user')} className="text-gray-400 hover:text-gray-600">חזרה לדף הבית</button>
          </div>
        )}

        {view === 'admin' && !isAdmin && (
          <div className="max-w-md mx-auto space-y-8">
            <h2 className="text-2xl font-bold text-center">כניסת מנהל</h2>
            <form onSubmit={handleAdminLogin} className="pastel-card p-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                <input
                  type="email"
                  className="w-full p-3 rounded-xl border-gray-200 border outline-none focus:ring-2 focus:ring-[#a1c4fd]"
                  value={loginData.email}
                  onChange={e => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
                <input
                  type="password"
                  className="w-full p-3 rounded-xl border-gray-200 border outline-none focus:ring-2 focus:ring-[#a1c4fd]"
                  value={loginData.password}
                  onChange={e => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <button type="submit" className="w-full btn-secondary py-4 shadow-lg">כניסה</button>
            </form>
          </div>
        )}

        {view === 'admin' && isAdmin && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">ניהול מערכת</h2>
              <button onClick={() => { signOut(auth); setIsAdmin(false); }} className="text-red-400 hover:text-red-600">התנתקות</button>
            </div>

            <div className="flex gap-4 border-b">
              <button
                onClick={() => setAdminTab('products')}
                className={`pb-4 px-4 transition-all ${adminTab === 'products' ? 'border-b-2 border-[#ff9a9e] text-[#ff9a9e] font-bold' : 'text-gray-400'}`}
              >
                מוצרים וקטגוריות
              </button>
              <button
                onClick={() => { setAdminTab('orders'); subscribeOrders(); }}
                className={`pb-4 px-4 transition-all ${adminTab === 'orders' ? 'border-b-2 border-[#ff9a9e] text-[#ff9a9e] font-bold' : 'text-gray-400'}`}
              >
                הזמנות
              </button>
              <button
                onClick={() => setAdminTab('settings')}
                className={`pb-4 px-4 transition-all ${adminTab === 'settings' ? 'border-b-2 border-[#ff9a9e] text-[#ff9a9e] font-bold' : 'text-gray-400'}`}
              >
                הגדרות
              </button>
              <button
                onClick={() => { setAdminTab('coupons'); fetchCoupons(); }}
                className={`pb-4 px-4 transition-all ${adminTab === 'coupons' ? 'border-b-2 border-[#ff9a9e] text-[#ff9a9e] font-bold' : 'text-gray-400'}`}
              >
                קופונים
              </button>
              <button
                onClick={() => setAdminTab('content')}
                className={`pb-4 px-4 transition-all ${adminTab === 'content' ? 'border-b-2 border-[#ff9a9e] text-[#ff9a9e] font-bold' : 'text-gray-400'}`}
              >
                תוכן אתר
              </button>
              <button
                onClick={() => { setAdminTab('analytics'); fetchOrders(); }}
                className={`pb-4 px-4 transition-all ${adminTab === 'analytics' ? 'border-b-2 border-[#ff9a9e] text-[#ff9a9e] font-bold' : 'text-gray-400'}`}
              >
                אנליטיקס
              </button>
              <button
                onClick={() => {
                  setAdminTab('legal');
                  if (!legalDocs.terms && !legalDocs.privacy && !legalDocs.shipping) {
                    setLegalLoading(true);
                    Promise.all([
                      getDoc(doc(db, 'siteSettings', 'terms')),
                      getDoc(doc(db, 'siteSettings', 'privacy')),
                      getDoc(doc(db, 'siteSettings', 'shipping')),
                    ]).then(([t, p, s]) => {
                      setLegalDocs({
                        terms: t.exists() ? t.data().content ?? '' : '',
                        privacy: p.exists() ? p.data().content ?? '' : '',
                        shipping: s.exists() ? s.data().content ?? '' : '',
                      });
                    }).finally(() => setLegalLoading(false));
                  }
                }}
                className={`pb-4 px-4 transition-all ${adminTab === 'legal' ? 'border-b-2 border-[#ff9a9e] text-[#ff9a9e] font-bold' : 'text-gray-400'}`}
              >
                דפים משפטיים
              </button>
            </div>

            {adminTab === 'products' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-8">
                  <div className="pastel-card p-6 space-y-4">
                    <h3 className="font-bold border-b pb-2">הוספת קטגוריה</h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="שם קטגוריה"
                        className="flex-1 p-2 rounded-lg border outline-none"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                      />
                      <button onClick={handleAddCategory} className="p-2 bg-[#a1c4fd] text-white rounded-lg"><Plus /></button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {categories.map(c => (
                        <div key={c.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg gap-2">
                          {editingCategoryId === c.id ? (
                            <input
                              className="flex-1 p-1 rounded border text-sm outline-none focus:ring-1 focus:ring-[#a1c4fd]"
                              value={editingCategoryName}
                              onChange={e => setEditingCategoryName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleEditCategory(c.id)}
                              autoFocus
                            />
                          ) : (
                            <span className="flex-1">{c.name}</span>
                          )}
                          <div className="flex gap-1 flex-shrink-0">
                            {editingCategoryId === c.id ? (
                              <button onClick={() => handleEditCategory(c.id)} className="text-green-500 hover:text-green-700">
                                <CheckCircle2 size={16} />
                              </button>
                            ) : (
                              <button onClick={() => { setEditingCategoryId(c.id); setEditingCategoryName(c.name); }} className="text-blue-400 hover:text-blue-600">
                                <Pencil size={14} />
                              </button>
                            )}
                            <button onClick={() => handleDeleteCategory(c.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pastel-card p-6 space-y-4">
                    <h3 className="font-bold border-b pb-2">הוספת מוצר</h3>
                    <div className="space-y-3">
                      <input
                        type="text" placeholder="שם המוצר" className="w-full p-2 rounded-lg border"
                        value={newProduct.name} onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <textarea
                        placeholder="תיאור" className="w-full p-2 rounded-lg border h-20"
                        value={newProduct.description} onChange={e => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
                      />
                      <input
                        type="number" placeholder="מחיר מכירה (₪)" className="w-full p-2 rounded-lg border"
                        value={newProduct.price || ''} onChange={e => setNewProduct(prev => ({ ...prev, price: Number(e.target.value) }))}
                      />
                      <input
                        type="number" placeholder="מחיר עלות (₪)" className="w-full p-2 rounded-lg border"
                        value={newProduct.costPrice || ''} onChange={e => setNewProduct(prev => ({ ...prev, costPrice: Number(e.target.value) }))}
                      />
                      <input
                        type="text" placeholder="תיאור תמונה לנגישות (alt text)" className="w-full p-2 rounded-lg border"
                        value={newProduct.alt_text} onChange={e => setNewProduct(prev => ({ ...prev, alt_text: e.target.value }))}
                      />
                      <select
                        className="w-full p-2 rounded-lg border"
                        value={newProduct.category_id} onChange={e => setNewProduct(prev => ({ ...prev, category_id: e.target.value }))}
                      >
                        <option value="">בחר קטגוריה</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {/* Variations Section */}
                      <div className="border-t pt-3 mt-1">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-bold text-gray-700">וריאציות</span>
                          <button
                            type="button"
                            onClick={() => setNewProduct(prev => ({ ...prev, variations: [...prev.variations, { name: '', values: '' }] }))}
                            className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors flex items-center gap-1"
                          >
                            <Plus size={10} /> הוסף
                          </button>
                        </div>
                        {newProduct.variations.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-1">ניתן להוסיף וריאציות כגון: צבע, גודל, סוג</p>
                        )}
                        {newProduct.variations.map((v, i) => (
                          <div key={i} className="mb-2 p-2 bg-gray-50 rounded-lg border">
                            <div className="flex gap-2 mb-1">
                              <input
                                placeholder="שם (למשל: צבע)"
                                value={v.name}
                                onChange={e => setNewProduct(prev => ({ ...prev, variations: prev.variations.map((vv, ii) => ii === i ? { ...vv, name: e.target.value } : vv) }))}
                                className="flex-1 p-1.5 rounded border text-xs outline-none focus:ring-1 focus:ring-[#ff9a9e]"
                              />
                              <button type="button" onClick={() => setNewProduct(prev => ({ ...prev, variations: prev.variations.filter((_, ii) => ii !== i) }))} className="text-red-400 hover:text-red-600">
                                <X size={14} />
                              </button>
                            </div>
                            <input
                              placeholder="ערכים מופרדים בפסיקים (למשל: אדום, כחול)"
                              value={v.values}
                              onChange={e => setNewProduct(prev => ({ ...prev, variations: prev.variations.map((vv, ii) => ii === i ? { ...vv, values: e.target.value } : vv) }))}
                              className="w-full p-1.5 rounded border text-xs outline-none focus:ring-1 focus:ring-[#ff9a9e]"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="relative">
                        <input
                          type="file" accept="image/*" multiple className="hidden" id="image-upload"
                          onChange={handleImageUpload}
                        />
                        <label htmlFor="image-upload" className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                          <Camera size={24} className="text-gray-400" />
                          <span className="text-gray-500">העלאת תמונות (ניתן לבחור כמה)</span>
                        </label>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          {newProduct.imagePreviews.map((img, idx) => (
                            <div key={idx} className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${newProduct.main_image_index === idx ? 'border-[#ff9a9e]' : 'border-transparent'}`}>
                              <img src={img} className="w-full h-full object-cover" />
                              <button
                                onClick={() => removeImage(idx)}
                                className="absolute top-0 right-0 bg-red-500 text-white p-1"
                              >
                                <X size={10} />
                              </button>
                              <button
                                onClick={() => setNewProduct(prev => ({ ...prev, main_image_index: idx }))}
                                className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] py-1"
                              >
                                {newProduct.main_image_index === idx ? 'ראשי' : 'קבע כראשי'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={handleAddProduct}
                        disabled={isUploading}
                        className="w-full btn-primary flex items-center justify-center gap-2"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            מעלה...
                          </>
                        ) : (
                          'הוספת מוצר'
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <h3 className="font-bold">רשימת מוצרים</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {products.map(p => (
                      <div key={p.id} className="pastel-card p-4 flex gap-4 items-center">
                        <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                          {p.main_image && <img src={p.main_image} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-grow">
                          <h4 className="font-bold">{p.name}</h4>
                          <p className="text-xs text-gray-400">₪{p.price}</p>
                        </div>
                        <button
                          onClick={() => {
                            setEditingProduct(p);
                            setEditProductData({ name: p.name, description: p.description, price: p.price, costPrice: p.costPrice ?? 0, alt_text: p.alt_text ?? '', category_id: p.category_id, newImageFiles: [], newImagePreviews: [], variations: (p.variations || []).map(v => ({ name: v.name, values: v.values.join(', ') })), isBoxBase: p.isBoxBase ?? false });
                          }}
                          className="text-blue-400 p-2 hover:bg-blue-50 rounded-full transition-colors"
                        >
                          <Pencil size={18} />
                        </button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="text-red-400 p-2 hover:bg-red-50 rounded-full transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adminTab === 'orders' && (
              <div className="space-y-3">

                {/* ── Export Section ─────────────────────────────────── */}
                <div className="pastel-card p-5 space-y-4">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    📥 יצוא הזמנות ל-Excel
                    <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{orders.length} הזמנות טעונות</span>
                  </h3>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">מתאריך</label>
                      <input
                        type="date"
                        className="p-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] outline-none text-sm"
                        value={exportDateFrom}
                        onChange={e => setExportDateFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">עד תאריך</label>
                      <input
                        type="date"
                        className="p-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] outline-none text-sm"
                        value={exportDateTo}
                        onChange={e => setExportDateTo(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={handleExportExcel}
                      disabled={isExporting || orders.length === 0}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isExporting
                        ? <><Loader2 size={16} className="animate-spin" /> מייצא...</>
                        : <>📊 יצוא ל-Excel</>}
                    </button>
                    {(exportDateFrom || exportDateTo) && (
                      <button
                        onClick={() => { setExportDateFrom(''); setExportDateTo(''); }}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        נקה סינון
                      </button>
                    )}
                  </div>
                  {(exportDateFrom || exportDateTo) && (
                    <p className="text-xs text-gray-400">
                      {(() => {
                        const from = exportDateFrom ? new Date(exportDateFrom).getTime() : 0;
                        const to = exportDateTo ? new Date(exportDateTo + 'T23:59:59').getTime() : Infinity;
                        const count = orders.filter(o => {
                          const t = new Date(o.created_at).getTime();
                          return t >= from && t <= to;
                        }).length;
                        return `${count} הזמנות בטווח הנבחר`;
                      })()}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    {orders.length} הזמנות
                    <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">● עדכון חי</span>
                  </h3>
                  <button
                    onClick={() => setExpandedOrders(orders.length === expandedOrders.size ? new Set() : new Set(orders.map(o => o.id)))}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    {expandedOrders.size === orders.length ? 'כווץ הכל' : 'הרחב הכל'}
                  </button>
                </div>
                {orders.length === 0 && (
                  <div className="text-center py-16 text-gray-400">אין הזמנות עדיין</div>
                )}
                {orders.map(order => {
                  const isExpanded = expandedOrders.has(order.id);
                  const toggleExpand = () => setExpandedOrders(prev => {
                    const next = new Set(prev);
                    if (next.has(order.id)) next.delete(order.id); else next.add(order.id);
                    return next;
                  });
                  return (
                    <div key={order.id} className="pastel-card overflow-hidden">
                      {/* Header row */}
                      <div
                        className="p-4 flex flex-wrap gap-3 items-center cursor-pointer hover:bg-pink-50/50 transition-colors"
                        onClick={toggleExpand}
                      >
                        <span className="font-mono text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">#{order.id.slice(0, 6)}</span>
                        <span className="font-bold text-gray-800">{order.customer_name}</span>
                        <span className="text-gray-500 text-sm">{order.customer_phone}</span>
                        {order.dedication?.message && <span className="text-pink-500 text-xs font-medium bg-pink-50 px-2 py-0.5 rounded-full">💌 הקדשה</span>}
                        <span className="font-bold text-[#ff9a9e] mr-auto">₪{order.total_price}</span>
                        <span className="text-gray-400 text-xs hidden sm:block">{new Date(order.created_at).toLocaleString('he-IL')}</span>
                        <select
                          value={order.orderStatus ?? 'Pending'}
                          onChange={e => { e.stopPropagation(); handleUpdateOrderStatus(order, e.target.value as Order['orderStatus']); }}
                          onClick={e => e.stopPropagation()}
                          className={`text-xs px-2 py-1 rounded-lg border outline-none font-medium ${
                            order.orderStatus === 'Completed' ? 'bg-green-100 text-green-700 border-green-200' :
                            order.orderStatus === 'Cancelled' ? 'bg-red-100 text-red-700 border-red-200' :
                            order.orderStatus === 'Processing' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            order.orderStatus === 'Shipped' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                            'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Processing">Processing</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                        <ChevronDown size={16} className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t px-4 pb-5 pt-4 space-y-4 bg-gray-50/40">

                          {/* Items */}
                          <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">פריטי הזמנה</h4>
                            <div className="space-y-2">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="bg-white rounded-xl p-3 border border-gray-100 flex justify-between items-start gap-3">
                                  <div className="flex-grow">
                                    <span className="font-semibold">{item.name}</span>
                                    <div className="text-xs text-gray-400 mt-0.5">כמות: {item.quantity} × ₪{item.price}</div>
                                    {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {Object.entries(item.selectedVariations).map(([k, v]) => (
                                          <span key={k} className="bg-[#ff9a9e]/10 text-[#ff9a9e] text-xs px-2 py-0.5 rounded-full font-medium">{k}: {v}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <span className="font-bold text-[#ff9a9e] flex-shrink-0">₪{(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Dedication — highlighted */}
                          {order.dedication?.message && (
                            <div className="bg-pink-50 border-2 border-pink-200 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xl">💌</span>
                                <h4 className="font-bold text-pink-700">הקדשה אישית</h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.dedication.cardType === 'printed' ? 'bg-pink-200 text-pink-800' : 'bg-gray-100 text-gray-500'}`}>
                                  {order.dedication.cardType === 'printed' ? '🖨️ כרטיס מודפס' : '📱 דיגיטלי'}
                                </span>
                              </div>
                              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{order.dedication.message}</p>
                            </div>
                          )}

                          {/* Shipping address — highlighted */}
                          {order.delivery_method === 'delivery' && order.shippingAddress && (
                            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">🚚</span>
                                  <h4 className="font-bold text-blue-700">כתובת למשלוח</h4>
                                </div>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(order.shippingAddress!); showToast('הכתובת הועתקה!'); }}
                                  className="flex items-center gap-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-full transition-colors font-medium"
                                >
                                  <Copy size={12} /> העתק כתובת
                                </button>
                              </div>
                              <p className="text-gray-800 font-semibold text-sm">{order.shippingAddress}</p>
                            </div>
                          )}
                          {order.delivery_method === 'pickup' && (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2 text-sm text-gray-600">
                              <span>📍</span> <span>איסוף עצמי</span>
                            </div>
                          )}

                          {/* Customer notes */}
                          {order.customer_notes && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span>📝</span>
                                <h4 className="font-bold text-yellow-700 text-sm">הערות לקוח</h4>
                              </div>
                              <p className="text-gray-600 text-sm">{order.customer_notes}</p>
                            </div>
                          )}

                          {/* Meta grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                              <p className="text-gray-400 text-xs mb-0.5">טלפון</p>
                              <a href={`tel:${order.customer_phone}`} className="font-medium text-blue-600 hover:underline">{order.customer_phone}</a>
                            </div>
                            {order.customer_email && (
                              <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                                <p className="text-gray-400 text-xs mb-0.5">אימייל</p>
                                <p className="font-medium text-xs break-all">{order.customer_email}</p>
                              </div>
                            )}
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                              <p className="text-gray-400 text-xs mb-0.5">תשלום</p>
                              <p className={`font-medium text-sm ${order.isPaid ? 'text-green-600' : 'text-orange-500'}`}>
                                {order.isPaid ? '✅ שולם' : '⏳ ממתין'}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                              <p className="text-gray-400 text-xs mb-0.5">תאריך</p>
                              <p className="font-medium text-xs">{new Date(order.created_at).toLocaleString('he-IL')}</p>
                            </div>
                            {order.coupon_code && (
                              <div className="bg-white rounded-lg p-2.5 border border-gray-100 col-span-2">
                                <p className="text-gray-400 text-xs mb-0.5">קופון</p>
                                <p className="font-medium text-green-600">{order.coupon_code} <span className="text-gray-500">(-₪{order.discount_amount})</span></p>
                              </div>
                            )}
                          </div>

                          {/* Print button */}
                          <button
                            onClick={() => printOrder(order)}
                            className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-[#ff9a9e] text-[#ff9a9e] font-semibold text-sm hover:bg-[#ff9a9e] hover:text-white transition-all"
                          >
                            🖨️ הדפס הזמנה
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {adminTab === 'content' && (
              <div className="space-y-8 max-w-2xl">
                {/* Brand & Identity */}
                <div className="pastel-card p-6 space-y-5">
                  <h3 className="font-bold text-lg border-b pb-3 flex items-center gap-2">
                    <span className="w-2 h-5 bg-gradient-to-b from-[#ff9a9e] to-[#a1c4fd] rounded-full inline-block" />
                    זהות המותג
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">שם החנות</label>
                    <input
                      type="text"
                      className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                      placeholder="Tony"
                      value={siteContent.storeName}
                      onChange={e => setSiteContent(prev => ({ ...prev, storeName: e.target.value }))}
                    />
                    <p className="text-xs text-gray-400 mt-1">מופיע בכותרת הדפדפן, בלוגו ובתגי ה-SEO</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">פס הודעה עליון</label>
                    <input
                      type="text"
                      className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                      placeholder="משלוח חינם בהזמנות מעל ₪200 ✨"
                      value={siteContent.announcementBar}
                      onChange={e => setSiteContent(prev => ({ ...prev, announcementBar: e.target.value }))}
                    />
                    <p className="text-xs text-gray-400 mt-1">השאר ריק כדי להסתיר את הפס</p>
                  </div>
                </div>

                {/* Hero Section */}
                <div className="pastel-card p-6 space-y-5">
                  <h3 className="font-bold text-lg border-b pb-3 flex items-center gap-2">
                    <span className="w-2 h-5 bg-gradient-to-b from-[#ff9a9e] to-[#a1c4fd] rounded-full inline-block" />
                    קטע הפתיחה (Hero)
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">כותרת ראשית</label>
                    <input
                      type="text"
                      className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                      placeholder="Tony — אמנות המיתוג במארז אחד"
                      value={siteContent.heroTitle}
                      onChange={e => setSiteContent(prev => ({ ...prev, heroTitle: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">תת-כותרת / תיאור</label>
                    <textarea
                      rows={3}
                      className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none resize-none"
                      placeholder="מארזי מתנה יוקרתיים עם מיתוג אישי..."
                      value={siteContent.heroSubtitle}
                      onChange={e => setSiteContent(prev => ({ ...prev, heroSubtitle: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Section Titles */}
                <div className="pastel-card p-6 space-y-5">
                  <h3 className="font-bold text-lg border-b pb-3 flex items-center gap-2">
                    <span className="w-2 h-5 bg-gradient-to-b from-[#ff9a9e] to-[#a1c4fd] rounded-full inline-block" />
                    כותרות קטעים
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריות / קולקציות</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                        placeholder="הקולקציות שלנו"
                        value={siteContent.collectionsTitle}
                        onChange={e => setSiteContent(prev => ({ ...prev, collectionsTitle: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">אודות</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                        placeholder="אודות"
                        value={siteContent.aboutTitle}
                        onChange={e => setSiteContent(prev => ({ ...prev, aboutTitle: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">צור קשר</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none"
                        placeholder="צור קשר"
                        value={siteContent.contactTitle}
                        onChange={e => setSiteContent(prev => ({ ...prev, contactTitle: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* SEO */}
                <div className="pastel-card p-6 space-y-5">
                  <h3 className="font-bold text-lg border-b pb-3 flex items-center gap-2">
                    <span className="w-2 h-5 bg-gradient-to-b from-[#ff9a9e] to-[#a1c4fd] rounded-full inline-block" />
                    SEO — מנועי חיפוש
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">תיאור האתר (meta description)</label>
                    <textarea
                      rows={3}
                      className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none resize-none"
                      placeholder="מארזי מתנה יוקרתיים עם מיתוג אישי. לאירועים, לעסקים ולכל רגע מיוחד."
                      value={siteContent.seoDescription}
                      onChange={e => setSiteContent(prev => ({ ...prev, seoDescription: e.target.value }))}
                    />
                    <p className="text-xs text-gray-400 mt-1">מומלץ: 150–160 תווים. כרגע: {siteContent.seoDescription.length} תווים</p>
                  </div>
                  {/* Live preview */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200 space-y-1">
                    <p className="text-xs text-gray-400 font-medium mb-2">תצוגה מקדימה בגוגל:</p>
                    <p className="text-[#1a0dab] text-base font-medium truncate">
                      {siteContent.storeName} — {siteContent.heroTitle || 'חנות מקוונת'}
                    </p>
                    <p className="text-[#006621] text-xs">tony-amramy-branding.web.app</p>
                    <p className="text-gray-500 text-sm line-clamp-2">{siteContent.seoDescription || 'אין תיאור'}</p>
                  </div>
                </div>

                <button
                  onClick={handleSaveContent}
                  className="w-full btn-primary py-4 text-lg shadow-lg"
                >
                  שמירת כל השינויים
                </button>
              </div>
            )}

            {adminTab === 'coupons' && (
              <div className="space-y-8 max-w-2xl">
                {/* Create coupon form */}
                <div className="pastel-card p-6 space-y-4">
                  <h3 className="font-bold border-b pb-2">יצירת קופון חדש</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">קוד קופון</label>
                      <input
                        type="text"
                        placeholder="SAVE20"
                        className="w-full p-2 rounded-lg border outline-none uppercase"
                        value={newCoupon.code}
                        onChange={e => setNewCoupon(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">סוג הנחה</label>
                      <select
                        className="w-full p-2 rounded-lg border outline-none"
                        value={newCoupon.type}
                        onChange={e => setNewCoupon(prev => ({ ...prev, type: e.target.value as 'percent' | 'fixed' }))}
                      >
                        <option value="percent">אחוז (%)</option>
                        <option value="fixed">סכום קבוע (₪)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {newCoupon.type === 'percent' ? 'אחוז הנחה' : 'סכום הנחה (₪)'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="w-full p-2 rounded-lg border outline-none"
                        value={newCoupon.value || ''}
                        onChange={e => setNewCoupon(prev => ({ ...prev, value: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">תאריך תפוגה (אופציונלי)</label>
                      <input
                        type="date"
                        className="w-full p-2 rounded-lg border outline-none"
                        value={newCoupon.expiryDate}
                        onChange={e => setNewCoupon(prev => ({ ...prev, expiryDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  <button onClick={handleCreateCoupon} className="w-full btn-primary">
                    צור קופון
                  </button>
                </div>

                {/* Coupons list */}
                <div className="pastel-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-4 font-bold">קוד</th>
                          <th className="p-4 font-bold">סוג</th>
                          <th className="p-4 font-bold">ערך</th>
                          <th className="p-4 font-bold">תפוגה</th>
                          <th className="p-4 font-bold">סטטוס</th>
                          <th className="p-4 font-bold">פעולות</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {coupons.length === 0 && (
                          <tr><td colSpan={6} className="p-4 text-center text-gray-400">אין קופונים</td></tr>
                        )}
                        {coupons.map(c => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="p-4 font-mono font-bold">{c.code}</td>
                            <td className="p-4">{c.type === 'percent' ? 'אחוז' : 'קבוע'}</td>
                            <td className="p-4">{c.type === 'percent' ? `${c.value}%` : `₪${c.value}`}</td>
                            <td className="p-4 text-sm text-gray-500">{c.expiryDate || '—'}</td>
                            <td className="p-4">
                              <button
                                onClick={() => handleToggleCoupon(c)}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${c.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                              >
                                {c.isActive ? 'פעיל' : 'מושבת'}
                              </button>
                            </td>
                            <td className="p-4">
                              <button onClick={() => handleDeleteCoupon(c.id)} className="text-red-400 hover:text-red-600">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {adminTab === 'analytics' && (
              <ShopAnalyticsView orders={orders} products={products} categories={categories} />
            )}

            {adminTab === 'settings' && (
              <div className="max-w-md space-y-6">
                <div className="pastel-card p-8 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">כתובת לאיסוף עצמי</label>
                    <input
                      type="text" className="w-full p-3 rounded-xl border"
                      value={settings.pickup_address} onChange={e => setSettings(prev => ({ ...prev, pickup_address: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">עלות משלוח (₪)</label>
                    <input
                      type="number" className="w-full p-3 rounded-xl border"
                      value={settings.delivery_cost} onChange={e => setSettings(prev => ({ ...prev, delivery_cost: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מספר טלפון ל-Bit</label>
                    <input
                      type="tel" className="w-full p-3 rounded-xl border"
                      value={settings.bit_phone} onChange={e => setSettings(prev => ({ ...prev, bit_phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מחיר כרטיס ברכה מודפס (₪)</label>
                    <input
                      type="number" className="w-full p-3 rounded-xl border"
                      placeholder="15"
                      value={settings.printed_card_price || ''} onChange={e => setSettings(prev => ({ ...prev, printed_card_price: e.target.value }))}
                    />
                    <p className="text-xs text-gray-400 mt-1">עלות כרטיס מודפס — יתווסף לסה"כ ההזמנה כשהלקוח בוחר כרטיס מודפס</p>
                  </div>
                  <button
                    onClick={handleSaveSettings}
                    className="w-full btn-primary"
                  >
                    שמירת הגדרות
                  </button>
                </div>
              </div>
            )}

            {adminTab === 'legal' && (
              <div className="space-y-8 max-w-2xl">
                {legalLoading ? (
                  <div className="text-center py-12 text-gray-400">טוען...</div>
                ) : (
                  ([
                    { key: 'terms', label: 'תקנון ותנאי שימוש', url: '/terms' },
                    { key: 'privacy', label: 'מדיניות פרטיות', url: '/privacy' },
                    { key: 'shipping', label: 'מדיניות משלוחים והחזרות', url: '/shipping' },
                  ] as { key: 'terms' | 'privacy' | 'shipping'; label: string; url: string }[]).map(({ key, label, url }) => (
                    <div key={key} className="pastel-card p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-lg">{label}</h3>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#ff9a9e] underline">
                          צפייה בדף ←
                        </a>
                      </div>
                      <textarea
                        rows={12}
                        className="w-full p-3 rounded-xl border text-sm font-mono resize-y"
                        style={{ direction: 'rtl' }}
                        value={legalDocs[key]}
                        onChange={e => setLegalDocs(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={`הכנס כאן את תוכן "${label}"...`}
                      />
                      <button
                        disabled={legalSaving === key}
                        onClick={async () => {
                          setLegalSaving(key);
                          try {
                            await setDoc(doc(db, 'siteSettings', key), { content: legalDocs[key] }, { merge: true });
                            showToast(`${label} נשמר בהצלחה`);
                          } catch {
                            showToast('שגיאה בשמירה');
                          } finally {
                            setLegalSaving(null);
                          }
                        }}
                        className="btn-primary"
                      >
                        {legalSaving === key ? 'שומר...' : `שמור ${label}`}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      {view !== 'admin' && (
        <footer className="bg-white/60 border-t border-pink-100 mt-16 px-6 py-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
              {/* Brand */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-[#ff9a9e] to-[#fecfef] rounded-lg flex items-center justify-center">
                    <Package size={16} className="text-white" />
                  </div>
                  <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-[#ff9a9e] to-[#a1c4fd]">Tony</span>
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
      )}

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

      {/* Edit Product Drawer */}
      <AnimatePresence>
        {editingProduct && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditingProduct(null)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-xl font-bold">עריכת מוצר</h2>
                <button onClick={() => setEditingProduct(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} /></button>
              </div>
              <div className="flex-grow overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שם המוצר</label>
                  <input
                    type="text" className="w-full p-2 rounded-lg border outline-none focus:ring-2 focus:ring-[#ff9a9e]"
                    value={editProductData.name}
                    onChange={e => setEditProductData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                  <textarea
                    className="w-full p-2 rounded-lg border h-20 outline-none focus:ring-2 focus:ring-[#ff9a9e]"
                    value={editProductData.description}
                    onChange={e => setEditProductData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מחיר מכירה (₪)</label>
                  <input
                    type="number" className="w-full p-2 rounded-lg border outline-none focus:ring-2 focus:ring-[#ff9a9e]"
                    value={editProductData.price || ''}
                    onChange={e => setEditProductData(prev => ({ ...prev, price: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מחיר עלות (₪)</label>
                  <input
                    type="number" className="w-full p-2 rounded-lg border outline-none focus:ring-2 focus:ring-[#ff9a9e]"
                    value={editProductData.costPrice || ''}
                    onChange={e => setEditProductData(prev => ({ ...prev, costPrice: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תיאור תמונה לנגישות (alt text)</label>
                  <input
                    type="text" className="w-full p-2 rounded-lg border outline-none focus:ring-2 focus:ring-[#ff9a9e]"
                    placeholder={editProductData.name || 'תיאור התמונה'}
                    value={editProductData.alt_text}
                    onChange={e => setEditProductData(prev => ({ ...prev, alt_text: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה</label>
                  <select
                    className="w-full p-2 rounded-lg border outline-none focus:ring-2 focus:ring-[#ff9a9e]"
                    value={editProductData.category_id}
                    onChange={e => setEditProductData(prev => ({ ...prev, category_id: e.target.value }))}
                  >
                    <option value="">בחר קטגוריה</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {/* Box Base Toggle */}
                <label className="flex items-center justify-between p-3 bg-pink-50 border border-pink-200 rounded-xl cursor-pointer hover:bg-pink-100 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-800">בסיס מארז אישי</p>
                    <p className="text-xs text-gray-500 mt-0.5">מוצר זה ישמש כקופסה לבחירת לקוח</p>
                  </div>
                  <div
                    onClick={() => setEditProductData(prev => ({ ...prev, isBoxBase: !prev.isBoxBase }))}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 cursor-pointer ${editProductData.isBoxBase ? 'bg-[#ff9a9e]' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${editProductData.isBoxBase ? 'translate-x-0.5' : 'translate-x-5'}`} />
                  </div>
                </label>

                {editingProduct.images && editingProduct.images.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">תמונות קיימות</label>
                    <div className="grid grid-cols-4 gap-2">
                      {editingProduct.images.map((img, idx) => (
                        <div key={idx} className="aspect-square rounded-lg overflow-hidden border">
                          <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Variations Section */}
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-gray-700">וריאציות</label>
                    <button
                      type="button"
                      onClick={() => setEditProductData(prev => ({ ...prev, variations: [...prev.variations, { name: '', values: '' }] }))}
                      className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors flex items-center gap-1"
                    >
                      <Plus size={10} /> הוסף
                    </button>
                  </div>
                  {editProductData.variations.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-1">אין וריאציות — ניתן להוסיף כגון: צבע, גודל, סוג</p>
                  )}
                  {editProductData.variations.map((v, i) => (
                    <div key={i} className="mb-2 p-2 bg-gray-50 rounded-lg border">
                      <div className="flex gap-2 mb-1">
                        <input
                          placeholder="שם הוריאציה"
                          value={v.name}
                          onChange={e => setEditProductData(prev => ({ ...prev, variations: prev.variations.map((vv, ii) => ii === i ? { ...vv, name: e.target.value } : vv) }))}
                          className="flex-1 p-1.5 rounded border text-xs outline-none focus:ring-1 focus:ring-[#ff9a9e]"
                        />
                        <button type="button" onClick={() => setEditProductData(prev => ({ ...prev, variations: prev.variations.filter((_, ii) => ii !== i) }))} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                      <input
                        placeholder="ערכים מופרדים בפסיקים"
                        value={v.values}
                        onChange={e => setEditProductData(prev => ({ ...prev, variations: prev.variations.map((vv, ii) => ii === i ? { ...vv, values: e.target.value } : vv) }))}
                        className="w-full p-1.5 rounded border text-xs outline-none focus:ring-1 focus:ring-[#ff9a9e]"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">הוספת תמונות נוספות</label>
                  <input
                    type="file" accept="image/*" multiple className="hidden" id="edit-image-upload"
                    onChange={e => {
                      const files = e.target.files;
                      if (files) {
                        Array.from(files).forEach((file: File) => {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setEditProductData(prev => ({
                              ...prev,
                              newImageFiles: [...prev.newImageFiles, file],
                              newImagePreviews: [...prev.newImagePreviews, reader.result as string]
                            }));
                          };
                          reader.readAsDataURL(file);
                        });
                      }
                    }}
                  />
                  <label htmlFor="edit-image-upload" className="flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                    <Camera size={20} className="text-gray-400" />
                    <span className="text-gray-500 text-sm">העלאת תמונות</span>
                  </label>
                  {editProductData.newImagePreviews.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {editProductData.newImagePreviews.map((img, idx) => (
                        <div key={idx} className="aspect-square rounded-lg overflow-hidden border">
                          <img src={img} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6 border-t">
                <button
                  onClick={handleEditProduct}
                  disabled={isUploading}
                  className="w-full btn-primary py-4 text-lg shadow-lg flex items-center justify-center gap-2"
                >
                  {isUploading ? <><Loader2 size={18} className="animate-spin" /> שומר...</> : 'שמירת שינויים'}
                </button>
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
                            <ChevronRight size={16} />
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
                            <ChevronLeft size={16} />
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
      <GiftAssistant onNavigateToProduct={(id) => { navigateTo('product', id); }} />

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
