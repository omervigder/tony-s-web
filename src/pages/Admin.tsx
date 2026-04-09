import React, { useState, useEffect } from 'react';
import { auth, db, storage, googleProvider } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, addDoc, deleteDoc, setDoc, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar
} from 'recharts';
import {
  ShoppingBag, BarChart3, Package, Settings as SettingsIcon,
  LogOut, Menu, X, Plus, Trash2, Pencil, Camera, Loader2,
  MessageCircle, DollarSign, CheckCircle2, Download, ChevronDown, ChevronUp, Users
} from 'lucide-react';
import * as XLSX from 'xlsx';

/* ─────────────────────────────── Types ─────────────────────────────── */
interface OrderItem { id: string; name: string; price: number; quantity: number; selectedVariations?: Record<string, string>; }
interface Order {
  id: string; customer_name: string; customer_phone: string;
  delivery_method: 'pickup' | 'delivery'; total_price: number;
  items: OrderItem[] | string; status: string; created_at: string;
  adminNote?: string;
}
interface ProductVariation { name: string; values: string[]; }
interface Product {
  id: string; name: string; description: string; price: number;
  category_id: string; main_image: string; images: string[]; created_at?: any;
  variations?: ProductVariation[]; isBoxBase?: boolean;
}
interface Category { id: string; name: string; }
interface StoreSettings { pickup_address: string; delivery_cost: string; bit_phone: string; }
interface Customer {
  id: string; name: string; phone: string; email?: string;
  totalOrders: number; totalSpend: number;
  firstOrderDate: string; lastOrderDate: string;
}
type TabName = 'orders' | 'analytics' | 'products' | 'customers' | 'settings';

/* ─────────────────────────────── Constants ──────────────────────────── */
const GOLD = '#ff9a9e';
const BLUE = '#a1c4fd';
const PIE_COLORS = [GOLD, BLUE, '#E040FB', '#00BCD4', '#FF6B6B', '#4CAF50'];
const STATUS_CFG: Record<string, { cls: string }> = {
  'חדש':    { cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  'בטיפול': { cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  'בוצע':   { cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
};

const parseItems = (items: OrderItem[] | string): OrderItem[] => {
  if (typeof items === 'string') { try { return JSON.parse(items); } catch { return []; } }
  return Array.isArray(items) ? items : [];
};

const toDate = (v: any): Date => {
  if (!v) return new Date(0);
  if (typeof v === 'string') return new Date(v);
  if (v?.toDate) return v.toDate();
  return new Date(v);
};

/* ─────────────────────────────── Login ──────────────────────────────── */
function LoginScreen({ unauthorized }: { unauthorized: boolean }) {
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      const code: string = err?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setLoading(false);
        return;
      }
      const msg: Record<string, string> = {
        'auth/user-disabled':          'המשתמש חסום. פנה למנהל.',
        'auth/network-request-failed': 'בעיית רשת. בדוק חיבור לאינטרנט.',
      };
      setError(msg[code] ?? 'שגיאה בהתחברות. נסה שוב.');
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#FFF5F7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.jpeg" alt="Tony Amrami" style={{ mixBlendMode: 'multiply' }} className="h-20 mx-auto mb-2 object-contain" />
          <p className="text-gray-500 text-sm mt-1">כניסה לפאנל ניהול</p>
        </div>
        <div className="bg-white border border-[#fce4ec] rounded-2xl p-6">
          {unauthorized && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-500 text-sm text-center">
              ⛔ החשבון הזה אינו מורשה לגשת לפאנל הניהול.
            </div>
          )}
          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-500 text-sm text-center">
              {error}
            </div>
          )}
          <button onClick={handle} disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-medium text-[#3c4043] bg-white hover:bg-gray-50 border border-gray-300 shadow-sm transition-all disabled:opacity-50">
            {loading ? <Loader2 size={18} className="animate-spin text-gray-500" /> : (
              <>
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.58-13.47-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                כניסה עם Google
              </>
            )}
          </button>
          <p className="text-center text-gray-400 text-xs mt-4">* כניסה מותרת למנהלים בלבד</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── StatCard ───────────────────────────── */
function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-white border border-[#fce4ec] rounded-2xl p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}35` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────── OrderCard ──────────────────────────── */
function OrderCard({ order }: { key?: string; order: Order }) {
  const items = parseItems(order.items);
  const cfg = STATUS_CFG[order.status] || { cls: 'bg-gray-500/20 text-gray-400 border-gray-500/40' };
  const phone = order.customer_phone.replace(/^0/, '972');
  const dateStr = toDate(order.created_at).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const [note, setNote] = useState(order.adminNote || '');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await updateDoc(doc(db, 'orders', order.id), { adminNote: note });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
    } finally {
      setSavingNote(false);
    }
  };

  const updateStatus = async (status: string) => {
    await updateDoc(doc(db, 'orders', order.id), { status });
  };

  return (
    <div className="bg-white border border-[#fce4ec] rounded-2xl p-5 space-y-4 flex flex-col">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h3 className="font-bold text-[#3a3a3a]">{order.customer_name}</h3>
          <p className="text-gray-500 text-xs mt-0.5">{dateStr} · #{order.id.slice(0, 6)}</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border whitespace-nowrap flex-shrink-0 ${cfg.cls}`}>
          {order.status}
        </span>
      </div>

      <div className="space-y-1.5 flex-1">
        {items.map((item, i) => (
          <div key={i} className="text-sm">
            <div className="flex justify-between">
              <span className="text-[#4a4a4a]">{item.name} <span className="text-gray-500">×{item.quantity}</span></span>
              <span className="text-gray-400">₪{(item.price * item.quantity)}</span>
            </div>
            {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
              <p className="text-gray-500 text-xs mt-0.5 mr-2">
                {Object.entries(item.selectedVariations).map(([k, v]) => `${k}: ${v}`).join(' | ')}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center border-t border-[#fce4ec] pt-3">
        <div className="flex gap-2 flex-wrap">
          <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors">
            <MessageCircle size={12} /> ווצאפ
          </a>
          <span className={`text-xs px-2.5 py-1.5 rounded-lg border ${order.delivery_method === 'delivery'
            ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
            : 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
            {order.delivery_method === 'delivery' ? '🚚 משלוח' : '🏪 איסוף'}
          </span>
        </div>
        <p className="font-bold text-lg" style={{ color: GOLD }}>₪{order.total_price}</p>
      </div>

      <select value={order.status} onChange={e => updateStatus(e.target.value)}
        className="w-full bg-[#FFF5F7] border border-[#fce4ec] rounded-xl p-2.5 text-sm text-[#4a4a4a] outline-none cursor-pointer hover:border-[#ff9a9e]/40 transition-colors">
        <option value="חדש">🔴 חדש</option>
        <option value="בטיפול">🔵 בטיפול</option>
        <option value="בוצע">🟢 בוצע</option>
      </select>

      <div className="space-y-2 border-t border-[#fce4ec] pt-3">
        <label className="block text-xs text-gray-500">הערת מנהל (פנימי)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="הערה פנימית..."
          className="w-full bg-[#FFF5F7] border border-[#fce4ec] rounded-xl p-2.5 text-sm text-[#4a4a4a] outline-none resize-none focus:border-[#ff9a9e]/40 transition-colors placeholder:text-gray-400"
        />
        <button
          onClick={saveNote}
          disabled={savingNote}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-60"
          style={{ background: noteSaved ? '#16a34a22' : '#F5C51815', color: noteSaved ? '#4ade80' : GOLD, border: `1px solid ${noteSaved ? '#4ade8040' : '#F5C51840'}` }}>
          {savingNote ? <Loader2 size={12} className="animate-spin" /> : noteSaved ? '✓ ההערה נשמרה' : 'שמור הערה'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── OrdersView ─────────────────────────── */
function OrdersView({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const count = (s: string) => orders.filter(o => o.status === s).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[#3a3a3a]">הזמנות</h2>
        <div className="flex gap-2 flex-wrap">
          {[['all', 'הכל'], ['חדש', `חדש (${count('חדש')})`], ['בטיפול', `בטיפול (${count('בטיפול')})`], ['בוצע', `בוצע (${count('בוצע')})`]].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${filter === val ? 'text-white' : 'bg-white border border-[#fce4ec] text-gray-400 hover:text-[#3a3a3a]'}`}
              style={filter === val ? { background: `linear-gradient(135deg, ${GOLD}, #fecfef)` } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <ShoppingBag size={52} className="mx-auto mb-3 opacity-20" />
          <p>אין הזמנות</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(order => <OrderCard key={order.id} order={order} />)}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── AnalyticsView ──────────────────────── */
function AnalyticsView({ orders, products, categories }: { orders: Order[]; products: Product[]; categories: Category[] }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  /* ── 1. Date range ── */
  const dateFiltered = orders.filter(o => {
    const d = toDate(o.created_at);
    if (startDate && d < new Date(startDate)) return false;
    if (endDate && d > new Date(endDate + 'T23:59:59')) return false;
    return true;
  });

  /* ── 2. Only completed orders feed every chart & stat ── */
  const completedInRange = dateFiltered.filter(o => o.status === 'בוצע');

  /* ── 3. Optional product filter (applied on top of completed) ── */
  const selProd = products.find(p => p.id === selectedProductId);
  const filtered = selectedProductId
    ? completedInRange.filter(o =>
        parseItems(o.items).some(i => i.id === selectedProductId || i.name === selProd?.name)
      )
    : completedInRange;

  /* ── Stat card values ── */
  const now = new Date();
  const thisMonthCompleted = completedInRange.filter(o => {
    const d = toDate(o.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const displayOrders = (startDate || endDate) ? filtered : thisMonthCompleted;
  const periodTotal  = displayOrders.reduce((s, o) => s + o.total_price, 0);
  const avgOrderValue = displayOrders.length > 0 ? Math.round(periodTotal / displayOrders.length) : 0;

  /* ── Daily buckets (completed only) ── */
  const bucketCount = startDate && endDate
    ? Math.min(30, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)
    : 30;

  const dailyData = Array.from({ length: bucketCount }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (bucketCount - 1 - i));
    const dayStr = d.toISOString().split('T')[0];

    const dayOrders = completedInRange.filter(o => toDate(o.created_at).toISOString().startsWith(dayStr));

    let revenue: number;
    if (selectedProductId) {
      revenue = dayOrders.reduce((s, o) =>
        s + parseItems(o.items)
          .filter(i => i.id === selectedProductId || i.name === selProd?.name)
          .reduce((is, i) => is + i.price * i.quantity, 0),
        0
      );
    } else {
      revenue = dayOrders.reduce((s, o) => s + o.total_price, 0);
    }

    return { date: d.toLocaleDateString('he-IL', { month: 'short', day: 'numeric' }), revenue: Math.round(revenue) };
  });

  /* ── Maps built from completed orders only ── */
  const productCatMap: Record<string, string> = {};
  products.forEach(p => { productCatMap[p.id] = p.category_id; });

  const catRevMap: Record<string, number> = {};
  const catVolMap: Record<string, number> = {};
  const prodRevMap: Record<string, number> = {};
  const prodVolMap: Record<string, number> = {};
  const prodNameMap: Record<string, string> = {};

  completedInRange.forEach(o => {
    parseItems(o.items).forEach(item => {
      const catId = productCatMap[item.id] ?? '';
      const rev = item.price * item.quantity;
      catRevMap[catId] = (catRevMap[catId] || 0) + rev;
      catVolMap[catId] = (catVolMap[catId] || 0) + item.quantity;
      prodRevMap[item.id] = (prodRevMap[item.id] || 0) + rev;
      prodVolMap[item.id] = (prodVolMap[item.id] || 0) + item.quantity;
      if (!prodNameMap[item.id]) prodNameMap[item.id] = item.name;
    });
  });

  /* ── Chart datasets ── */
  const categoryRevData = categories
    .map(c => ({ name: c.name, value: Math.round(catRevMap[c.id] || 0) }))
    .filter(c => c.value > 0).sort((a, b) => b.value - a.value);

  const categoryVolData = categories
    .map(c => ({ name: c.name, volume: catVolMap[c.id] || 0 }))
    .filter(c => c.volume > 0).sort((a, b) => b.volume - a.volume);

  const topProductsData = Object.entries(prodRevMap)
    .map(([id, rev]) => ({ name: prodNameMap[id] ?? products.find(p => p.id === id)?.name ?? id.slice(0, 8), value: Math.round(rev) }))
    .sort((a, b) => b.value - a.value).slice(0, 8);

  /* ── Product dropdown — only products from completed orders ── */
  const orderedProductIds = [...new Set(completedInRange.flatMap(o => parseItems(o.items).map(i => i.id)))];
  const orderedProducts   = orderedProductIds.map(id => products.find(p => p.id === id)).filter(Boolean) as Product[];

  /* ── Export (completed + filters) ── */
  const exportToExcel = () => {
    const exportBase = selectedProductId
      ? completedInRange.filter(o =>
          parseItems(o.items).some(i => i.id === selectedProductId || i.name === selProd?.name)
        )
      : completedInRange;

    const rows = exportBase.flatMap(o => {
      const items = parseItems(o.items).filter(item =>
        selectedProductId ? item.id === selectedProductId || item.name === selProd?.name : true
      );
      return items.map(item => ({
        'מספר הזמנה': `#${o.id.slice(0, 8)}`,
        'תאריך': toDate(o.created_at).toLocaleString('he-IL'),
        'שם לקוח': o.customer_name,
        'טלפון': o.customer_phone,
        'שיטת משלוח': o.delivery_method === 'delivery' ? 'משלוח' : 'איסוף',
        'מוצר': item.name,
        'וריאציות': item.selectedVariations ? Object.entries(item.selectedVariations).map(([k, v]) => `${k}: ${v}`).join(', ') : '',
        'כמות': item.quantity,
        'מחיר יחידה': item.price,
        'סה"כ שורה': item.price * item.quantity,
        'סה"כ הזמנה': o.total_price,
        'סטטוס': o.status,
      }));
    });

    if (rows.length === 0) { alert('אין נתונים לייצוא'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'הזמנות שבוצעו');
    const tag = selectedProductId ? `_${selProd?.name ?? 'product'}` : '';
    XLSX.writeFile(wb, `completed_orders${tag}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const tooltipStyle = { background: 'white', border: '1px solid #fce4ec', borderRadius: 12, color: '#3a3a3a' };
  const hasData = categoryRevData.length > 0 || categoryVolData.length > 0 || topProductsData.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#3a3a3a]">סטטיסטיקה</h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border"
            style={{ background: '#4CAF5018', color: '#4CAF50', borderColor: '#4CAF5035' }}>
            ✓ הזמנות שבוצעו בלבד
          </span>
        </div>
        <button onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #fecfef)` }}>
          <Download size={16} /> ייצוא לאקסל
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border border-[#fce4ec] rounded-2xl p-4 space-y-4">
        <h3 className="text-white text-sm font-semibold">סינון נתונים</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-gray-500 text-xs block mb-1">מתאריך</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-[#FFF5F7] border border-[#fce4ec] rounded-xl px-3 py-2 text-[#3a3a3a] text-sm outline-none focus:border-[#ff9a9e]/50 transition-colors" />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">עד תאריך</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="bg-[#FFF5F7] border border-[#fce4ec] rounded-xl px-3 py-2 text-[#3a3a3a] text-sm outline-none focus:border-[#ff9a9e]/50 transition-colors" />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">סינון לפי מוצר</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="bg-[#FFF5F7] border border-[#fce4ec] rounded-xl px-3 py-2 text-[#3a3a3a] text-sm outline-none focus:border-[#ff9a9e]/50 transition-colors min-w-[180px]"
            >
              <option value="">כל המוצרים</option>
              {orderedProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {(startDate || endDate || selectedProductId) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedProductId(''); }}
              className="px-3 py-2 text-sm text-gray-400 border border-[#fce4ec] rounded-xl hover:text-[#3a3a3a] transition-colors">
              נקה הכל
            </button>
          )}
          <span className="text-gray-500 text-xs py-2">{filtered.length} הזמנות</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={(startDate || endDate || selectedProductId) ? "הכנסה בתקופה/סינון" : "הכנסה החודש"}
          value={`₪${periodTotal.toLocaleString()}`}
          icon={DollarSign} color={GOLD}
        />
        <StatCard
          label={(startDate || endDate || selectedProductId) ? "הזמנות בסינון" : "הזמנות החודש"}
          value={displayOrders.length}
          icon={ShoppingBag} color={BLUE}
        />
        <StatCard label="ממוצע להזמנה" value={displayOrders.length > 0 ? `₪${avgOrderValue.toLocaleString()}` : '—'} icon={CheckCircle2} color="#4CAF50" />
      </div>

      {/* ── Line Chart: Revenue over Time ── */}
      <div className="bg-white border border-[#fce4ec] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <h3 className="text-white font-semibold">
            הכנסות לאורך זמן
            {selectedProductId && (
              <span className="mr-2 text-xs font-normal px-2 py-0.5 rounded-full"
                style={{ background: `${GOLD}20`, color: GOLD }}>
                {products.find(p => p.id === selectedProductId)?.name}
              </span>
            )}
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#fce4ec" />
            <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v}`} width={60} />
            <Tooltip contentStyle={{ ...tooltipStyle, fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
            <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={4}
              dot={{ fill: GOLD, strokeWidth: 0, r: 5 }} activeDot={{ r: 7, fill: GOLD }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasData ? (
        <>
          {/* ── Bar Chart: Sales Volume per Category ── */}
          {categoryVolData.length > 0 && (
            <div className="bg-white border border-[#fce4ec] rounded-2xl p-5">
              <h3 className="text-white font-bold mb-5">כמות מכירות לפי קטגוריה</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryVolData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#fce4ec" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ ...tooltipStyle, fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [v, "יחידות"]} />
                  <Bar dataKey="volume" radius={[8, 8, 0, 0]}>
                    {categoryVolData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Pie Chart: Category Revenue Distribution ── */}
            {categoryRevData.length > 0 && (
              <div className="bg-white border border-[#fce4ec] rounded-2xl p-5">
                <h3 className="text-white font-bold mb-4">הכנסות לפי קטגוריה</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={categoryRevData} cx="50%" cy="50%" outerRadius={95} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#555', strokeWidth: 1.5 }}>
                      {categoryRevData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ ...tooltipStyle, fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 13, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Pie Chart: Best-Selling Products by Revenue ── */}
            {topProductsData.length > 0 && (
              <div className="bg-white border border-[#fce4ec] rounded-2xl p-5">
                <h3 className="text-white font-bold mb-4">מוצרים מובילים לפי הכנסה</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={topProductsData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} dataKey="value"
                      paddingAngle={3}
                      label={({ name, percent }) => percent > 0.06 ? `${name.length > 12 ? name.slice(0, 12) + '…' : name} ${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={{ stroke: '#666', strokeWidth: 1.5 }}>
                      {topProductsData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ ...tooltipStyle, fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 13, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── Product volume table ── */}
          {Object.keys(prodVolMap).length > 0 && (
            <div className="bg-white border border-[#fce4ec] rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">כמות מכירות לפי מוצר</h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {Object.entries(prodVolMap)
                  .sort(([, a], [, b]) => b - a)
                  .map(([id, qty]) => {
                    const prod = products.find(p => p.id === id);
                    if (!prod) return null;
                    const maxQty = Math.max(...Object.values(prodVolMap));
                    return (
                      <div key={id} className="flex items-center gap-3 text-sm py-1 px-2 rounded-lg hover:bg-[#fff0f5] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-1">
                            <span className="text-[#4a4a4a] truncate">{prod.name}</span>
                            <span className="font-bold flex-shrink-0 mr-2" style={{ color: GOLD }}>{qty} יח'</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#1e1e3a] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(qty / maxQty) * 100}%`, background: GOLD }} />
                          </div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white border border-[#fce4ec] rounded-2xl p-10 text-center text-gray-400">
          <BarChart3 size={40} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm">אין נתוני מכירות עדיין</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── ProductsView ───────────────────────── */
function ProductsView({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', price: 0, category_id: '',
    files: [] as File[], previews: [] as string[],
    variations: [] as { name: string; values: string }[],
    isBoxBase: false,
  });
  const [toast, setToast] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setSavingCat(true);
    try {
      await addDoc(collection(db, 'categories'), { name, created_at: new Date() });
      setNewCatName('');
      showToast('הקטגוריה נוספה!');
    } catch (err) { console.error(err); }
    finally { setSavingCat(false); }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const hasProducts = products.some(p => p.category_id === id);
    if (hasProducts) { alert(`לא ניתן למחוק — ישנם מוצרים בקטגוריה "${name}"`); return; }
    if (!confirm(`למחוק את הקטגוריה "${name}"?`)) return;
    await deleteDoc(doc(db, 'categories', id));
    showToast('הקטגוריה נמחקה');
  };
  const resetForm = () => setForm({ name: '', description: '', price: 0, category_id: '', files: [], previews: [], variations: [], isBoxBase: false });

  const toggleCat = (catId: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const openAdd = () => { resetForm(); setEditing(null); setShowForm(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description, price: p.price, category_id: p.category_id,
      files: [], previews: [],
      variations: (p.variations || []).map(v => ({ name: v.name, values: v.values.join(', ') })),
      isBoxBase: p.isBoxBase ?? false,
    });
    setShowForm(true);
  };

  const handleImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = e.target.files;
    if (!fs) return;
    Array.from(fs).forEach((file: File) => {
      const r = new FileReader();
      r.onloadend = () => setForm(prev => ({ ...prev, files: [...prev.files, file], previews: [...prev.previews, r.result as string] }));
      r.readAsDataURL(file);
    });
  };

  const addVariation = () => setForm(p => ({ ...p, variations: [...p.variations, { name: '', values: '' }] }));
  const removeVariation = (i: number) => setForm(p => ({ ...p, variations: p.variations.filter((_, ii) => ii !== i) }));
  const updateVariation = (i: number, field: 'name' | 'values', val: string) =>
    setForm(p => ({ ...p, variations: p.variations.map((v, ii) => ii === i ? { ...v, [field]: val } : v) }));

  const buildVariations = () =>
    form.variations
      .filter(v => v.name.trim())
      .map(v => ({ name: v.name.trim(), values: v.values.split(',').map(s => s.trim()).filter(Boolean) }));

  const handleSave = async () => {
    if (!form.name || !form.price || !form.category_id) return alert('נא למלא שם, מחיר וקטגוריה');
    try {
      setUploading(true);
      const urls: string[] = [];
      for (const file of form.files) {
        const sRef = ref(storage, `products/${Date.now()}_${file.name}`);
        await uploadBytes(sRef, file);
        urls.push(await getDownloadURL(sRef));
      }
      const variations = buildVariations();
      if (editing) {
        const allImgs = [...(editing.images || []), ...urls];
        await updateDoc(doc(db, 'products', editing.id), {
          name: form.name, description: form.description,
          price: form.price, category_id: form.category_id,
          images: allImgs, main_image: allImgs[0] || editing.main_image,
          variations, isBoxBase: form.isBoxBase,
        });
        showToast('המוצר עודכן!');
      } else {
        await addDoc(collection(db, 'products'), {
          name: form.name, description: form.description,
          price: form.price, category_id: form.category_id,
          images: urls, main_image: urls[0] || null, created_at: new Date(),
          variations, isBoxBase: form.isBoxBase,
        });
        showToast('המוצר נוסף!');
      }
      resetForm(); setShowForm(false); setEditing(null);
    } catch (err) { console.error(err); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק מוצר זה?')) return;
    await deleteDoc(doc(db, 'products', id));
    showToast('המוצר נמחק');
  };

  const catName = (id: string) => categories.find(c => c.id === id)?.name || '-';

  // Group products by category
  const grouped = categories.map(cat => ({
    cat, prods: products.filter(p => p.category_id === cat.id),
  })).filter(g => g.prods.length > 0);

  const uncategorized = products.filter(p => !categories.find(c => c.id === p.category_id));

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-[#3a3a3a] px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[#3a3a3a]">מוצרים ({products.length})</h2>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #fecfef)` }}>
          <Plus size={16} /> מוצר חדש
        </button>
      </div>

      {/* ── Category management ── */}
      <div className="bg-white border border-[#fce4ec] rounded-2xl p-5 space-y-3">
        <h3 className="text-[#3a3a3a] font-bold text-sm">קטגוריות</h3>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <span key={cat.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-[#FFF5F7] border border-[#fce4ec] text-[#3a3a3a]">
              {cat.name}
              <button
                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                className="text-gray-400 hover:text-red-400 transition-colors leading-none"
                title="מחק קטגוריה"
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {categories.length === 0 && <p className="text-gray-400 text-sm">אין קטגוריות עדיין</p>}
        </div>
        <div className="flex gap-2">
          <input
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
            placeholder="שם קטגוריה חדשה..."
            maxLength={50}
            className="flex-1 bg-[#FFF5F7] border border-[#fce4ec] rounded-xl px-3 py-2 text-sm text-[#3a3a3a] outline-none focus:border-[#ff9a9e]/50 transition-colors"
          />
          <button
            onClick={handleAddCategory}
            disabled={savingCat || !newCatName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #fecfef)` }}
          >
            {savingCat ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            הוסף
          </button>
        </div>
      </div>

      {/* Grouped by category */}
      <div className="space-y-3">
        {grouped.map(({ cat, prods }) => (
          <div key={cat.id} className="bg-white border border-[#fce4ec] rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-right hover:bg-[#fff0f5] transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#3a3a3a]">{cat.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#fce4ec] text-gray-400">{prods.length} מוצרים</span>
              </div>
              {collapsedCats.has(cat.id) ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
            </button>
            {!collapsedCats.has(cat.id) && (
              <div className="border-t border-[#fce4ec] overflow-x-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr className="border-b border-[#fce4ec]">
                      {['מוצר', 'מחיר', 'וריאציות', 'פעולות'].map(h => (
                        <th key={h} className="p-4 text-gray-500 font-medium text-sm">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#fce4ec]">
                    {prods.map(p => (
                      <tr key={p.id} className="hover:bg-[#fff0f5] transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#FFF5F7] border border-[#fce4ec] overflow-hidden flex-shrink-0">
                              {p.main_image && <img src={p.main_image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-white font-medium text-sm">{p.name}</p>
                                {p.isBoxBase && <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ background: '#ff9a9e20', color: '#ff9a9e' }}>מארז</span>}
                              </div>
                              <p className="text-gray-500 text-xs line-clamp-1 max-w-[180px]">{p.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-sm whitespace-nowrap" style={{ color: GOLD }}>₪{p.price}</td>
                        <td className="p-4 text-gray-500 text-xs">
                          {p.variations && p.variations.length > 0
                            ? p.variations.map(v => v.name).join(', ')
                            : '—'}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(p)}
                              className="p-2 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(p.id)}
                              className="p-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        {uncategorized.length > 0 && (
          <div className="bg-white border border-[#fce4ec] rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleCat('__uncategorized__')}
              className="w-full flex items-center justify-between px-5 py-3.5 text-right hover:bg-[#fff0f5] transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-400">ללא קטגוריה</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#fce4ec] text-gray-400">{uncategorized.length}</span>
              </div>
              {collapsedCats.has('__uncategorized__') ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
            </button>
            {!collapsedCats.has('__uncategorized__') && (
              <div className="border-t border-[#fce4ec] overflow-x-auto">
                <table className="w-full text-right">
                  <thead><tr className="border-b border-[#fce4ec]">
                    {['מוצר', 'קטגוריה', 'מחיר', 'פעולות'].map(h => (
                      <th key={h} className="p-4 text-gray-500 font-medium text-sm">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-[#fce4ec]">
                    {uncategorized.map(p => (
                      <tr key={p.id} className="hover:bg-[#fff0f5] transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#FFF5F7] border border-[#fce4ec] overflow-hidden flex-shrink-0">
                              {p.main_image && <img src={p.main_image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                            </div>
                            <p className="text-white font-medium text-sm">{p.name}</p>
                          </div>
                        </td>
                        <td className="p-4 text-gray-400 text-sm">{catName(p.category_id)}</td>
                        <td className="p-4 font-bold text-sm whitespace-nowrap" style={{ color: GOLD }}>₪{p.price}</td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(p)} className="p-2 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {products.length === 0 && (
          <div className="bg-white border border-[#fce4ec] rounded-2xl p-12 text-center text-gray-400">
            <Package size={36} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">אין מוצרים עדיין</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white border border-[#fce4ec] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-[#fce4ec] flex justify-between items-center sticky top-0 bg-white">
              <h3 className="font-bold text-[#3a3a3a]">{editing ? 'עריכת מוצר' : 'מוצר חדש'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }}
                className="p-1.5 text-gray-500 hover:text-[#3a3a3a] rounded-lg hover:bg-[#1e1e3a] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input type="text" placeholder="שם המוצר *" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-[#FFF5F7] border border-[#fce4ec] rounded-xl p-3 text-[#3a3a3a] outline-none text-sm focus:border-[#ff9a9e]/50 transition-colors" />
              <textarea placeholder="תיאור" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full bg-[#FFF5F7] border border-[#fce4ec] rounded-xl p-3 text-[#3a3a3a] outline-none text-sm focus:border-[#ff9a9e]/50 transition-colors h-20 resize-none" />
              <input type="number" placeholder="מחיר *" value={form.price || ''}
                onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))}
                className="w-full bg-[#FFF5F7] border border-[#fce4ec] rounded-xl p-3 text-[#3a3a3a] outline-none text-sm focus:border-[#ff9a9e]/50 transition-colors" />
              <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                className="w-full bg-[#FFF5F7] border border-[#fce4ec] rounded-xl p-3 text-[#3a3a3a] outline-none text-sm focus:border-[#ff9a9e]/50 transition-colors">
                <option value="">בחר קטגוריה *</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* Box Base Toggle */}
              <label className="flex items-center justify-between p-3 bg-[#FFF5F7] border border-[#fce4ec] rounded-xl cursor-pointer hover:border-[#ff9a9e]/40 transition-colors">
                <div>
                  <p className="text-white text-sm font-medium">בסיס מארז אישי</p>
                  <p className="text-gray-500 text-xs mt-0.5">מוצר זה ישמש כקופסה/מארז לבחירת לקוח</p>
                </div>
                <div
                  onClick={() => setForm(p => ({ ...p, isBoxBase: !p.isBoxBase }))}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.isBoxBase ? 'bg-[#ff9a9e]' : 'bg-[#fce4ec]'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.isBoxBase ? 'translate-x-0.5' : 'translate-x-5'}`} />
                </div>
              </label>

              {/* Variations Section */}
              <div className="border-t border-[#fce4ec] pt-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-white text-sm font-bold">וריאציות</span>
                  <button onClick={addVariation}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">
                    <Plus size={12} /> הוסף וריאציה
                  </button>
                </div>
                {form.variations.length === 0 && (
                  <p className="text-gray-400 text-xs text-center py-2">אין וריאציות (למשל: צבע, גודל, סוג בקבוק)</p>
                )}
                {form.variations.map((v, i) => (
                  <div key={i} className="mb-3 p-3 bg-[#FFF5F7] rounded-xl border border-[#fce4ec]">
                    <div className="flex gap-2 mb-2">
                      <input
                        placeholder="שם הוריאציה (למשל: צבע)"
                        value={v.name}
                        onChange={e => updateVariation(i, 'name', e.target.value)}
                        className="flex-1 bg-white border border-[#fce4ec] rounded-lg p-2 text-[#3a3a3a] text-xs outline-none focus:border-[#ff9a9e]/40 transition-colors"
                      />
                      <button onClick={() => removeVariation(i)} className="p-2 text-red-400 hover:text-red-300 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                    <input
                      placeholder="ערכים מופרדים בפסיקים (למשל: אדום, כחול, ירוק)"
                      value={v.values}
                      onChange={e => updateVariation(i, 'values', e.target.value)}
                      className="w-full bg-white border border-[#fce4ec] rounded-lg p-2 text-[#3a3a3a] text-xs outline-none focus:border-[#ff9a9e]/40 transition-colors"
                    />
                  </div>
                ))}
              </div>

              {editing && editing.images?.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs mb-2">תמונות קיימות:</p>
                  <div className="grid grid-cols-4 gap-2">
                    {editing.images.map((img, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden border border-[#fce4ec]">
                        <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center justify-center gap-2 w-full p-3.5 border-2 border-dashed border-[#fce4ec] rounded-xl cursor-pointer hover:border-[#ff9a9e]/40 transition-colors">
                <Camera size={18} className="text-gray-500" />
                <span className="text-gray-500 text-sm">{editing ? 'הוסף תמונות' : 'העלה תמונות'}</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImages} />
              </label>
              {form.previews.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {form.previews.map((img, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden border border-[#fce4ec]">
                      <img src={img} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-[#fce4ec]">
              <button onClick={handleSave} disabled={uploading}
                className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                style={{ background: `linear-gradient(135deg, ${GOLD}, #fecfef)` }}>
                {uploading ? <><Loader2 size={16} className="animate-spin" /> מעלה...</> : editing ? 'שמור שינויים' : 'הוסף מוצר'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── CustomersView ─────────────────────── */
function CustomersView({ customers }: { customers: Customer[] }) {
  const [sortBy, setSortBy] = useState<'totalSpend' | 'totalOrders'>('totalSpend');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const sorted = [...customers].sort((a, b) => {
    const diff = b[sortBy] - a[sortBy];
    return sortDir === 'desc' ? diff : -diff;
  });

  const toggleSort = (key: 'totalSpend' | 'totalOrders') => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const fmtDate = (v: any) => {
    if (!v) return '-';
    return new Date(v).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#3a3a3a]">לקוחות ({customers.length})</h2>

      {customers.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <Users size={52} className="mx-auto mb-3 opacity-20" />
          <p>אין לקוחות עדיין</p>
        </div>
      ) : (
        <div className="bg-white border border-[#fce4ec] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#fce4ec]">
                  <th className="text-right text-gray-400 font-medium px-5 py-3.5">שם</th>
                  <th className="text-right text-gray-400 font-medium px-5 py-3.5">טלפון</th>
                  <th className="text-right px-5 py-3.5">
                    <button onClick={() => toggleSort('totalOrders')}
                      className="flex items-center gap-1 text-gray-400 font-medium hover:text-[#3a3a3a] transition-colors">
                      הזמנות
                      {sortBy === 'totalOrders' ? (sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />) : <ChevronDown size={14} className="opacity-20" />}
                    </button>
                  </th>
                  <th className="text-right px-5 py-3.5">
                    <button onClick={() => toggleSort('totalSpend')}
                      className="flex items-center gap-1 text-gray-400 font-medium hover:text-[#3a3a3a] transition-colors">
                      סה"כ ₪
                      {sortBy === 'totalSpend' ? (sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />) : <ChevronDown size={14} className="opacity-20" />}
                    </button>
                  </th>
                  <th className="text-right text-gray-400 font-medium px-5 py-3.5">הזמנה אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr key={c.id}
                    className={`hover:bg-[#fff0f5] transition-colors ${i < sorted.length - 1 ? 'border-b border-[#fce4ec]' : ''}`}>
                    <td className="px-5 py-3.5 text-[#3a3a3a] font-medium">
                      {c.totalOrders > 1 && <span className="text-yellow-400 ml-1">⭐</span>}
                      {c.name}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400">
                      <a href={`https://wa.me/972${c.phone.replace(/^0/, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="hover:text-green-400 transition-colors">{c.phone}</a>
                    </td>
                    <td className="px-5 py-3.5 text-[#4a4a4a] text-center">{c.totalOrders}</td>
                    <td className="px-5 py-3.5 font-bold" style={{ color: GOLD }}>₪{c.totalSpend.toFixed(0)}</td>
                    <td className="px-5 py-3.5 text-gray-400">{fmtDate(c.lastOrderDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── SettingsView ───────────────────────── */
function SettingsView({ settings: init }: { settings: StoreSettings }) {
  const [s, setS] = useState(init);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setS(init); }, [init]);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'store'), s);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-bold text-[#3a3a3a]">הגדרות</h2>
      <div className="bg-white border border-[#fce4ec] rounded-2xl p-6 space-y-5">
        {[
          { key: 'pickup_address', label: 'כתובת לאיסוף עצמי', type: 'text', placeholder: 'רחוב...' },
          { key: 'delivery_cost', label: 'עלות משלוח (₪)', type: 'number', placeholder: '30' },
          { key: 'bit_phone', label: 'מספר Bit לתשלום', type: 'tel', placeholder: '05X-XXXXXXX' },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key}>
            <label className="block text-sm text-gray-400 mb-2">{label}</label>
            <input type={type} placeholder={placeholder}
              value={s[key as keyof StoreSettings]}
              onChange={e => setS(p => ({ ...p, [key]: e.target.value }))}
              className="w-full bg-[#FFF5F7] border border-[#fce4ec] rounded-xl p-3 text-[#3a3a3a] outline-none text-sm focus:border-[#ff9a9e]/50 transition-colors" />
          </div>
        ))}
        <button onClick={save} disabled={saving}
          className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #fecfef)` }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? '✓ נשמר בהצלחה!' : 'שמור הגדרות'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Main Admin ─────────────────────────── */
export default function Admin() {
  const [user, setUser]           = useState<User | null | undefined>(undefined); // undefined = loading
  const [activeTab, setActiveTab] = useState<TabName>('orders');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ pickup_address: '', delivery_cost: '0', bit_phone: '' });
  const [dataError, setDataError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);

  // Auth state listener — checks Firestore admins whitelist
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); setUnauthorized(false); return; }
      const snap = await getDoc(doc(db, 'admin', u.email!));
      if (snap.exists() && snap.data()?.role === 'admin') {
        setUnauthorized(false);
        setUser(u);
      } else {
        setUnauthorized(true);
        setUser(null);
        await signOut(auth);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const onErr = (label: string) => (err: Error) => {
      console.error(`[Admin] ${label} listener error:`, err);
      setDataError(`שגיאה בטעינת נתונים (${label}). רענן את הדף.`);
    };
    const unsubO = onSnapshot(
      query(collection(db, 'orders'), orderBy('created_at', 'desc')),
      snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
      onErr('orders')
    );
    const unsubP = onSnapshot(
      query(collection(db, 'products'), orderBy('created_at', 'desc')),
      snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))),
      onErr('products')
    );
    const unsubC = onSnapshot(
      collection(db, 'categories'),
      snap => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))),
      onErr('categories')
    );
    const unsubCust = onSnapshot(
      collection(db, 'customers'),
      snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))),
      onErr('customers')
    );
    getDoc(doc(db, 'settings', 'store'))
      .then(d => { if (d.exists()) setSettings(d.data() as StoreSettings); })
      .catch(err => console.error('[Admin] settings fetch error:', err));
    return () => { unsubO(); unsubP(); unsubC(); unsubCust(); };
  }, [user]);

  if (user === undefined) return (
    <div className="min-h-screen bg-[#FFF5F7] flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin" style={{ color: GOLD }} />
    </div>
  );

  if (!user) return <LoginScreen unauthorized={unauthorized} />;

  const newOrdersCount = orders.filter(o => o.status === 'חדש').length;

  const navItems: { tab: TabName; label: string; icon: any }[] = [
    { tab: 'orders', label: 'הזמנות', icon: ShoppingBag },
    { tab: 'analytics', label: 'סטטיסטיקה', icon: BarChart3 },
    { tab: 'products', label: 'מוצרים', icon: Package },
    { tab: 'customers', label: 'לקוחות', icon: Users },
    { tab: 'settings', label: 'הגדרות', icon: SettingsIcon },
  ];

  const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navItems.map(({ tab, label, icon: Icon }) => (
        <button key={tab} onClick={() => { setActiveTab(tab); onNavigate?.(); }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full text-right relative ${activeTab === tab ? 'text-white' : 'text-gray-400 hover:text-[#3a3a3a] hover:bg-[#fff0f5]'}`}
          style={activeTab === tab ? { background: `linear-gradient(135deg, ${GOLD}, #fecfef)` } : {}}>
          <Icon size={18} />
          {label}
          {tab === 'orders' && newOrdersCount > 0 && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 bg-red-500 text-[#3a3a3a] text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {newOrdersCount}
            </span>
          )}
        </button>
      ))}
    </>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-[#FFF5F7] text-[#3a3a3a]">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FFF5F7]/95 backdrop-blur-md border-b border-[#fce4ec] px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl bg-white border border-[#fce4ec] md:hidden relative">
            <Menu size={18} className="text-gray-400" />
            {newOrdersCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-[#3a3a3a] text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                {newOrdersCount}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="Tony Amrami" style={{ mixBlendMode: 'multiply' }} className="h-8 object-contain" />
          </div>
        </div>
        <button onClick={() => signOut(auth)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-xl hover:bg-red-500/10">
          <LogOut size={14} /> יציאה
        </button>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-52 min-h-[calc(100vh-57px)] bg-[#FFF5F7] border-l border-[#fce4ec] sticky top-[57px] p-3 gap-1">
          <SidebarNav />
        </aside>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
            <div className="relative bg-[#FFF5F7] border-l border-[#fce4ec] w-56 flex flex-col p-3 gap-1">
              <div className="flex items-center justify-between px-2 py-2 mb-1">
                <img src="/logo.jpeg" alt="Tony Amrami" style={{ mixBlendMode: 'multiply' }} className="h-7 object-contain" />
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-gray-500 hover:text-[#3a3a3a]">
                  <X size={16} />
                </button>
              </div>
              <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 min-w-0 pb-24 md:pb-6">
          {dataError && (
            <div className="mb-4 flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm" dir="rtl">
              <span>{dataError}</span>
              <button onClick={() => setDataError('')} className="text-red-400/60 hover:text-red-400 transition-colors text-lg leading-none">×</button>
            </div>
          )}
          {activeTab === 'orders' && <OrdersView orders={orders} />}
          {activeTab === 'analytics' && <AnalyticsView orders={orders} products={products} categories={categories} />}
          {activeTab === 'products' && <ProductsView products={products} categories={categories} />}
          {activeTab === 'customers' && <CustomersView customers={customers} />}
          {activeTab === 'settings' && <SettingsView settings={settings} />}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 md:hidden bg-[#FFF5F7]/95 backdrop-blur-md border-t border-[#fce4ec] flex z-30">
        {navItems.map(({ tab, label, icon: Icon }) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors relative ${activeTab === tab ? '' : 'text-gray-400'}`}
            style={activeTab === tab ? { color: GOLD } : {}}>
            <Icon size={20} />
            {label}
            {tab === 'orders' && newOrdersCount > 0 && (
              <span className="absolute top-2 right-[22%] bg-red-500 text-[#3a3a3a] text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {newOrdersCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
