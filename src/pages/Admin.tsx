import React, { useState, useEffect } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { db, storage } from '../firebase';
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
  Menu, X, Plus, Trash2, Pencil, Camera, Loader2,
  MessageCircle, DollarSign, CheckCircle2, Download, ChevronDown, ChevronUp, Users, Sparkles,
  Archive, ArchiveRestore, Image as ImageIcon, Tag
} from 'lucide-react';

/* ─────────────────────────────── Types ─────────────────────────────── */
// Product/OrderItem/Category and the option types are shared with the storefront —
// keeping private copies here is what let the two drift apart in the first place.
import type {
  OrderItem, Product, Category, BrandingOption,
  ProductColorOption, ProductLengthOption, ProductDiscount, SiteBanner,
} from '../types';
import { COLOR_PALETTE } from '../constants/colors';
import { effectivePrice } from '../lib/pricing';

interface Order {
  id: string; customer_name: string; customer_phone: string;
  delivery_method: 'pickup' | 'delivery'; total_price: number;
  items: OrderItem[] | string; status: string; created_at: string;
  adminNote?: string;
  isArchived?: boolean;
}
interface StoreSettings { pickup_address: string; delivery_cost: string; bit_phone: string; }
interface Customer {
  id: string; name: string; phone: string; email?: string;
  totalOrders: number; totalSpend: number;
  firstOrderDate: string; lastOrderDate: string;
}
type TabName = 'orders' | 'analytics' | 'products' | 'branding' | 'design' | 'customers' | 'settings';

/* ─────────────────────────────── Constants ──────────────────────────── */
const INK = '#1A1A18';
const INK_SOFT = '#2F2F2D';
// Monochrome ramp — series stay distinguishable without breaking the black/cream palette.
const PIE_COLORS = [INK, '#3F3B36', '#6B6560', '#8E8C88', '#BEBAB6', '#E2E2E2'];
const STATUS_CFG: Record<string, { cls: string }> = {
  'חדש':    { cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  'בטיפול': { cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  'בוצע':   { cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
};

const parseItems = (items: OrderItem[] | string): OrderItem[] => {
  if (typeof items === 'string') { try { return JSON.parse(items); } catch { return []; } }
  return Array.isArray(items) ? items : [];
};

/** Everything the customer chose for a line — the fulfiller needs all of it. */
const itemOptions = (item: OrderItem): string => [
  ...Object.entries(item.selectedVariations ?? {}).map(([k, v]) => `${k}: ${v}`),
  item.selectedColor && `צבע: ${item.selectedColor.name}`,
  item.selectedLength && `אורך: ${item.selectedLength.label}`,
  item.selectedBranding && `מיתוג: ${item.selectedBranding.label} (+₪${item.selectedBranding.extraCost})`,
  item.brandingText && `שם למיתוג: "${item.brandingText}"`,
].filter(Boolean).join(' | ');

const toDate = (v: any): Date => {
  if (!v) return new Date(0);
  if (typeof v === 'string') return new Date(v);
  if (v?.toDate) return v.toDate();
  return new Date(v);
};

/* ─────────────────────────────── StatCard ───────────────────────────── */
function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-white border border-line rounded-2xl p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}35` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-ink text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

/* ────────────────────────────── AdminPriceCell ──────────────────────── */
/** A product's price in the admin table — struck-through list price when on sale. */
function AdminPriceCell({ product }: { product: Product }) {
  const p = effectivePrice(product);
  if (!p.isDiscounted) return <span style={{ color: INK }}>₪{p.list}</span>;
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ color: INK }}>₪{p.final}</span>
      <span className="line-through text-gray-400 font-normal">₪{p.list}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-md text-white" style={{ background: INK }}>-{p.percentOff}%</span>
    </span>
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

  // Archiving is reversible and hides the order from the list, the "new" badge and
  // analytics. Permanent deletion lives in the archive view, behind a typed confirm.
  const archive = async () => {
    if (!confirm(`להעביר לארכיון את ההזמנה של ${order.customer_name}?\nניתן לשחזר אותה מלשונית הארכיון.`)) return;
    await updateDoc(doc(db, 'orders', order.id), { isArchived: true });
  };

  return (
    <div className="bg-white border border-line rounded-2xl p-5 space-y-4 flex flex-col">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h3 className="font-bold text-ink">{order.customer_name}</h3>
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
              <span className="text-body">{item.name} <span className="text-gray-500">×{item.quantity}</span></span>
              <span className="text-gray-400">₪{(item.price * item.quantity)}</span>
            </div>
            {itemOptions(item) && (
              <p className="text-gray-500 text-xs mt-0.5 mr-2">{itemOptions(item)}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center border-t border-line pt-3">
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
        <p className="font-bold text-lg" style={{ color: INK }}>₪{order.total_price}</p>
      </div>

      <div className="flex gap-2">
        <select value={order.status} onChange={e => updateStatus(e.target.value)}
          className="flex-1 bg-cream border border-line rounded-xl p-2.5 text-sm text-body outline-none cursor-pointer hover:border-ink/40 transition-colors">
          <option value="חדש">🔴 חדש</option>
          <option value="בטיפול">🔵 בטיפול</option>
          <option value="בוצע">🟢 בוצע</option>
        </select>
        <button onClick={archive} title="העבר לארכיון"
          className="px-3 rounded-xl bg-cream border border-line text-gray-500 hover:text-ink hover:border-ink/40 transition-colors flex items-center justify-center">
          <Archive size={16} />
        </button>
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <label className="block text-xs text-gray-500">הערת מנהל (פנימי)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="הערה פנימית..."
          className="w-full bg-cream border border-line rounded-xl p-2.5 text-sm text-body outline-none resize-none focus:border-ink/40 transition-colors placeholder:text-gray-400"
        />
        <button
          onClick={saveNote}
          disabled={savingNote}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-60"
          style={{ background: noteSaved ? '#16a34a22' : '#F5C51815', color: noteSaved ? '#4ade80' : INK, border: `1px solid ${noteSaved ? '#4ade8040' : '#F5C51840'}` }}>
          {savingNote ? <Loader2 size={12} className="animate-spin" /> : noteSaved ? '✓ ההערה נשמרה' : 'שמור הערה'}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────── ArchivedOrderCard ─────────────────────── */
/** An archived order: restorable, or permanently deletable behind a typed confirm.
 *  A plain confirm() is too easy to fire by accident on a real customer's order. */
function ArchivedOrderCard({ order }: { key?: string; order: Order }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const items = parseItems(order.items);
  const dateStr = toDate(order.created_at).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const restore = async () => {
    setBusy(true);
    try { await updateDoc(doc(db, 'orders', order.id), { isArchived: false }); }
    finally { setBusy(false); }
  };

  const destroy = async () => {
    setBusy(true);
    try { await deleteDoc(doc(db, 'orders', order.id)); }
    catch (err) { console.error(err); alert('מחיקת ההזמנה נכשלה.'); setBusy(false); }
  };

  return (
    <div className="bg-white border border-line rounded-2xl p-5 space-y-3 opacity-90">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h3 className="font-bold text-ink">{order.customer_name}</h3>
          <p className="text-gray-500 text-xs mt-0.5">{dateStr} · #{order.id.slice(0, 6)}</p>
        </div>
        <span className="text-xs font-bold px-3 py-1 rounded-full border whitespace-nowrap flex-shrink-0 bg-gray-500/15 text-gray-400 border-gray-500/30">
          בארכיון · {order.status}
        </span>
      </div>

      <p className="text-gray-500 text-sm">
        {items.length} פריטים · ₪{order.total_price}
      </p>

      {confirming ? (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-xs text-red-400">
            מחיקה לצמיתות. להמשך, הקלד את שם הלקוח: <span className="font-bold">{order.customer_name}</span>
          </p>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={order.customer_name}
            className="w-full bg-cream border border-line rounded-xl p-2.5 text-sm text-body outline-none focus:border-red-400 transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={destroy}
              disabled={busy || typed.trim() !== order.customer_name}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-red-500/15 text-red-500 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} מחק לצמיתות
            </button>
            <button
              onClick={() => { setConfirming(false); setTyped(''); }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cream border border-line text-gray-500 hover:text-ink transition-colors">
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-line pt-3">
          <button onClick={restore} disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-cream border border-line text-body hover:border-ink/40 transition-colors disabled:opacity-60">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ArchiveRestore size={12} />} שחזר
          </button>
          <button onClick={() => setConfirming(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors">
            <Trash2 size={12} /> מחק
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── OrdersView ─────────────────────────── */
function OrdersView({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState('all');

  const active = orders.filter(o => !o.isArchived);
  const archived = orders.filter(o => o.isArchived);
  const isArchiveView = filter === 'archived';
  const filtered = isArchiveView
    ? archived
    : filter === 'all' ? active : active.filter(o => o.status === filter);
  const count = (s: string) => active.filter(o => o.status === s).length;

  const chips: [string, string][] = [
    ['all', 'הכל'],
    ['חדש', `חדש (${count('חדש')})`],
    ['בטיפול', `בטיפול (${count('בטיפול')})`],
    ['בוצע', `בוצע (${count('בוצע')})`],
    ['archived', `ארכיון (${archived.length})`],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-ink">הזמנות</h2>
        <div className="flex gap-2 flex-wrap">
          {chips.map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${filter === val ? 'text-white' : 'bg-white border border-line text-gray-400 hover:text-ink'}`}
              style={filter === val ? { background: `${INK}` } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isArchiveView && archived.length > 0 && (
        <p className="text-gray-500 text-sm">
          הזמנות בארכיון אינן מוצגות ברשימה הראשית ואינן נספרות בסטטיסטיקה. מחיקה לצמיתות אינה ניתנת לשחזור.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          {isArchiveView
            ? <><Archive size={52} className="mx-auto mb-3 opacity-20" /><p>הארכיון ריק</p></>
            : <><ShoppingBag size={52} className="mx-auto mb-3 opacity-20" /><p>אין הזמנות</p></>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {isArchiveView
            ? filtered.map(order => <ArchivedOrderCard key={order.id} order={order} />)
            : filtered.map(order => <OrderCard key={order.id} order={order} />)}
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
  const exportToExcel = async () => {
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
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'הזמנות שבוצעו');
    const tag = selectedProductId ? `_${selProd?.name ?? 'product'}` : '';
    XLSX.writeFile(wb, `completed_orders${tag}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const tooltipStyle = { background: 'white', border: '1px solid #E2E2E2', borderRadius: 12, color: '#1A1A18' };
  const hasData = categoryRevData.length > 0 || categoryVolData.length > 0 || topProductsData.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-ink">סטטיסטיקה</h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border"
            style={{ background: '#4CAF5018', color: '#4CAF50', borderColor: '#4CAF5035' }}>
            ✓ הזמנות שבוצעו בלבד
          </span>
        </div>
        <button onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: `${INK}` }}>
          <Download size={16} /> ייצוא לאקסל
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border border-line rounded-2xl p-4 space-y-4">
        <h3 className="text-ink text-sm font-semibold">סינון נתונים</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-gray-500 text-xs block mb-1">מתאריך</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-cream border border-line rounded-xl px-3 py-2 text-ink text-sm outline-none focus:border-ink transition-colors" />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">עד תאריך</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="bg-cream border border-line rounded-xl px-3 py-2 text-ink text-sm outline-none focus:border-ink transition-colors" />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">סינון לפי מוצר</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="bg-cream border border-line rounded-xl px-3 py-2 text-ink text-sm outline-none focus:border-ink transition-colors min-w-[180px]"
            >
              <option value="">כל המוצרים</option>
              {orderedProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {(startDate || endDate || selectedProductId) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedProductId(''); }}
              className="px-3 py-2 text-sm text-gray-400 border border-line rounded-xl hover:text-ink transition-colors">
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
          icon={DollarSign} color={INK}
        />
        <StatCard
          label={(startDate || endDate || selectedProductId) ? "הזמנות בסינון" : "הזמנות החודש"}
          value={displayOrders.length}
          icon={ShoppingBag} color={INK_SOFT}
        />
        <StatCard label="ממוצע להזמנה" value={displayOrders.length > 0 ? `₪${avgOrderValue.toLocaleString()}` : '—'} icon={CheckCircle2} color="#4CAF50" />
      </div>

      {/* ── Line Chart: Revenue over Time ── */}
      <div className="bg-white border border-line rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <h3 className="text-ink font-semibold">
            הכנסות לאורך זמן
            {selectedProductId && (
              <span className="mr-2 text-xs font-normal px-2 py-0.5 rounded-full"
                style={{ background: `${INK}20`, color: INK }}>
                {products.find(p => p.id === selectedProductId)?.name}
              </span>
            )}
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E2" />
            <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v}`} width={60} />
            <Tooltip contentStyle={{ ...tooltipStyle, fontWeight: 700, fontSize: 13 }} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
            <Line type="monotone" dataKey="revenue" stroke={INK} strokeWidth={4}
              dot={{ fill: INK, strokeWidth: 0, r: 5 }} activeDot={{ r: 7, fill: INK }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasData ? (
        <>
          {/* ── Bar Chart: Sales Volume per Category ── */}
          {categoryVolData.length > 0 && (
            <div className="bg-white border border-line rounded-2xl p-5">
              <h3 className="text-ink font-bold mb-5">כמות מכירות לפי קטגוריה</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryVolData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E2" vertical={false} />
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
              <div className="bg-white border border-line rounded-2xl p-5">
                <h3 className="text-ink font-bold mb-4">הכנסות לפי קטגוריה</h3>
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
              <div className="bg-white border border-line rounded-2xl p-5">
                <h3 className="text-ink font-bold mb-4">מוצרים מובילים לפי הכנסה</h3>
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
            <div className="bg-white border border-line rounded-2xl p-5">
              <h3 className="text-ink font-semibold mb-4">כמות מכירות לפי מוצר</h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {Object.entries(prodVolMap)
                  .sort(([, a], [, b]) => b - a)
                  .map(([id, qty]) => {
                    const prod = products.find(p => p.id === id);
                    if (!prod) return null;
                    const maxQty = Math.max(...Object.values(prodVolMap));
                    return (
                      <div key={id} className="flex items-center gap-3 text-sm py-1 px-2 rounded-lg hover:bg-cream transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-1">
                            <span className="text-body truncate">{prod.name}</span>
                            <span className="font-bold flex-shrink-0 mr-2" style={{ color: INK }}>{qty} יח'</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#1e1e3a] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(qty / maxQty) * 100}%`, background: INK }} />
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
        <div className="bg-white border border-line rounded-2xl p-10 text-center text-gray-400">
          <BarChart3 size={40} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm">אין נתוני מכירות עדיין</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── ProductsView ───────────────────────── */
const EMPTY_FORM = {
  name: '', description: '', price: 0, costPrice: 0, category_id: '',
  images: [] as string[],
  variations: [] as { name: string; values: string }[],
  colorOptions: [] as ProductColorOption[],
  lengthOptions: [] as ProductLengthOption[],
  brandingOptionIds: [] as string[],
  allowBrandingName: false,
  isBoxBase: false,
  discount: { type: 'percent', value: 0, isActive: false, label: '' } as ProductDiscount & { label: string },
};

function ProductsView({ products, categories, brandingOptions }: { products: Product[]; categories: Category[]; brandingOptions: BrandingOption[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
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
  const resetForm = () => setForm(EMPTY_FORM);

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
      name: p.name, description: p.description, price: p.price,
      costPrice: p.costPrice ?? 0, category_id: p.category_id,
      images: p.images ?? [],
      variations: (p.variations || []).map(v => ({ name: v.name, values: v.values.join(', ') })),
      colorOptions: p.colorOptions ?? [],
      lengthOptions: p.lengthOptions ?? [],
      brandingOptionIds: p.brandingOptionIds ?? [],
      allowBrandingName: p.allowBrandingName ?? false,
      isBoxBase: p.isBoxBase ?? false,
      discount: {
        type: p.discount?.type ?? 'percent',
        value: p.discount?.value ?? 0,
        isActive: p.discount?.isActive ?? false,
        label: p.discount?.label ?? '',
      },
    });
    setShowForm(true);
  };

  // Images upload as soon as they're picked, not on save — the color→image picker
  // below needs real Storage URLs to bind to while the modal is still open.
  const handleImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = e.target.files;
    if (!fs || fs.length === 0) return;
    setUploadingImages(true);
    try {
      for (const file of Array.from(fs) as File[]) {
        const sRef = ref(storage, `products/${Date.now()}_${file.name}`);
        await uploadBytes(sRef, file);
        const url = await getDownloadURL(sRef);
        setForm(prev => ({ ...prev, images: [...prev.images, url] }));
      }
    } catch (err) {
      console.error(err);
      alert('העלאת התמונה נכשלה. נסו שוב.');
    } finally {
      setUploadingImages(false);
      e.target.value = '';
    }
  };

  // Dropping an image must also unbind any color that pointed at it, or the
  // product page would try to show an image that is no longer in the gallery.
  const removeImage = (url: string) => setForm(p => ({
    ...p,
    images: p.images.filter(u => u !== url),
    colorOptions: p.colorOptions.map(c => c.imageUrl === url ? { ...c, imageUrl: undefined } : c),
  }));

  const addVariation = () => setForm(p => ({ ...p, variations: [...p.variations, { name: '', values: '' }] }));
  const removeVariation = (i: number) => setForm(p => ({ ...p, variations: p.variations.filter((_, ii) => ii !== i) }));
  const updateVariation = (i: number, field: 'name' | 'values', val: string) =>
    setForm(p => ({ ...p, variations: p.variations.map((v, ii) => ii === i ? { ...v, [field]: val } : v) }));

  const toggleColor = (c: { name: string; hex: string }) => setForm(p => ({
    ...p,
    colorOptions: p.colorOptions.some(x => x.name === c.name)
      ? p.colorOptions.filter(x => x.name !== c.name)
      : [...p.colorOptions, { name: c.name, hex: c.hex }],
  }));
  const bindColorImage = (name: string, url: string) => setForm(p => ({
    ...p,
    colorOptions: p.colorOptions.map(c =>
      c.name === name ? { ...c, imageUrl: c.imageUrl === url ? undefined : url } : c
    ),
  }));

  const addLength = () => setForm(p => ({ ...p, lengthOptions: [...p.lengthOptions, { label: '', priceDelta: 0 }] }));
  const removeLength = (i: number) => setForm(p => ({ ...p, lengthOptions: p.lengthOptions.filter((_, ii) => ii !== i) }));
  const updateLength = (i: number, field: 'label' | 'priceDelta', val: string) =>
    setForm(p => ({
      ...p,
      lengthOptions: p.lengthOptions.map((l, ii) =>
        ii === i ? { ...l, [field]: field === 'priceDelta' ? (Number(val) || 0) : val } : l
      ),
    }));

  const toggleBranding = (id: string) => setForm(p => ({
    ...p,
    brandingOptionIds: p.brandingOptionIds.includes(id)
      ? p.brandingOptionIds.filter(b => b !== id)
      : [...p.brandingOptionIds, id],
  }));

  const buildVariations = () =>
    form.variations
      .filter(v => v.name.trim())
      .map(v => ({ name: v.name.trim(), values: v.values.split(',').map(s => s.trim()).filter(Boolean) }));

  /** The sale price the shopper would see, given what's currently typed in the form. */
  const formPreview = effectivePrice({
    price: form.price,
    discount: { type: form.discount.type, value: form.discount.value, isActive: form.discount.isActive },
  });

  const handleSave = async () => {
    if (!form.name || !form.price || !form.category_id) return alert('נא למלא שם, מחיר וקטגוריה');
    if (form.discount.isActive) {
      if (!(form.discount.value > 0)) return alert('נא להזין ערך הנחה גדול מ-0 (או לכבות את המבצע)');
      if (!formPreview.isDiscounted) return alert('ההנחה אינה מקטינה את המחיר. בדוק את הערך שהזנת.');
      if (formPreview.final <= 0) return alert('ההנחה מאפסת את מחיר המוצר. הקטן את ההנחה.');
    }
    try {
      setUploading(true);
      // Firestore rejects `undefined`, so an unbound color must omit imageUrl entirely.
      const colorOptions = form.colorOptions.map(c => ({
        name: c.name,
        hex: c.hex,
        ...(c.imageUrl && { imageUrl: c.imageUrl }),
      }));
      const payload = {
        name: form.name,
        description: form.description,
        price: form.price,
        costPrice: form.costPrice,
        category_id: form.category_id,
        images: form.images,
        main_image: form.images[0] || null,
        variations: buildVariations(),
        colorOptions,
        lengthOptions: form.lengthOptions.filter(l => l.label.trim()),
        brandingOptionIds: form.brandingOptionIds,
        allowBrandingName: form.allowBrandingName,
        isBoxBase: form.isBoxBase,
        // `null` rather than a dropped key: an edit that turns a sale off has to
        // overwrite the discount already on the doc, and Firestore rejects `undefined`.
        discount: form.discount.isActive
          ? {
              type: form.discount.type,
              value: form.discount.value,
              isActive: true,
              ...(form.discount.label.trim() && { label: form.discount.label.trim() }),
            }
          : null,
      };
      if (editing) {
        await updateDoc(doc(db, 'products', editing.id), payload);
        showToast('המוצר עודכן!');
      } else {
        await addDoc(collection(db, 'products'), { ...payload, created_at: new Date() });
        showToast('המוצר נוסף!');
      }
      resetForm(); setShowForm(false); setEditing(null);
    } catch (err) { console.error(err); alert('שמירת המוצר נכשלה.'); }
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
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-ink px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-ink">מוצרים ({products.length})</h2>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: `${INK}` }}>
          <Plus size={16} /> מוצר חדש
        </button>
      </div>

      {/* ── Category management ── */}
      <div className="bg-white border border-line rounded-2xl p-5 space-y-3">
        <h3 className="text-ink font-bold text-sm">קטגוריות</h3>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <span key={cat.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-cream border border-line text-ink">
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
            className="flex-1 bg-cream border border-line rounded-xl px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors"
          />
          <button
            onClick={handleAddCategory}
            disabled={savingCat || !newCatName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: `${INK}` }}
          >
            {savingCat ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            הוסף
          </button>
        </div>
      </div>

      {/* Grouped by category */}
      <div className="space-y-3">
        {grouped.map(({ cat, prods }) => (
          <div key={cat.id} className="bg-white border border-line rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-right hover:bg-cream transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink">{cat.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-line text-gray-400">{prods.length} מוצרים</span>
              </div>
              {collapsedCats.has(cat.id) ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
            </button>
            {!collapsedCats.has(cat.id) && (
              <div className="border-t border-line overflow-x-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr className="border-b border-line">
                      {['מוצר', 'מחיר', 'וריאציות', 'פעולות'].map(h => (
                        <th key={h} className="p-4 text-gray-500 font-medium text-sm">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E2E2]">
                    {prods.map(p => (
                      <tr key={p.id} className="hover:bg-cream transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-cream border border-line overflow-hidden flex-shrink-0">
                              {p.main_image && <img src={p.main_image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-ink font-medium text-sm">{p.name}</p>
                                {p.isBoxBase && <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ background: '#1A1A1820', color: '#1A1A18' }}>מארז</span>}
                              </div>
                              <p className="text-gray-500 text-xs line-clamp-1 max-w-[180px]">{p.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-sm whitespace-nowrap"><AdminPriceCell product={p} /></td>
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
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleCat('__uncategorized__')}
              className="w-full flex items-center justify-between px-5 py-3.5 text-right hover:bg-cream transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-400">ללא קטגוריה</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-line text-gray-400">{uncategorized.length}</span>
              </div>
              {collapsedCats.has('__uncategorized__') ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
            </button>
            {!collapsedCats.has('__uncategorized__') && (
              <div className="border-t border-line overflow-x-auto">
                <table className="w-full text-right">
                  <thead><tr className="border-b border-line">
                    {['מוצר', 'קטגוריה', 'מחיר', 'פעולות'].map(h => (
                      <th key={h} className="p-4 text-gray-500 font-medium text-sm">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-[#E2E2E2]">
                    {uncategorized.map(p => (
                      <tr key={p.id} className="hover:bg-cream transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-cream border border-line overflow-hidden flex-shrink-0">
                              {p.main_image && <img src={p.main_image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                            </div>
                            <p className="text-ink font-medium text-sm">{p.name}</p>
                          </div>
                        </td>
                        <td className="p-4 text-gray-400 text-sm">{catName(p.category_id)}</td>
                        <td className="p-4 font-bold text-sm whitespace-nowrap"><AdminPriceCell product={p} /></td>
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
          <div className="bg-white border border-line rounded-2xl p-12 text-center text-gray-400">
            <Package size={36} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">אין מוצרים עדיין</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white border border-line rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-line flex justify-between items-center sticky top-0 bg-white">
              <h3 className="font-bold text-ink">{editing ? 'עריכת מוצר' : 'מוצר חדש'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }}
                className="p-1.5 text-gray-500 hover:text-ink rounded-lg hover:bg-[#1e1e3a] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input type="text" placeholder="שם המוצר *" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-cream border border-line rounded-xl p-3 text-ink outline-none text-sm focus:border-ink transition-colors" />
              <textarea placeholder="תיאור" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full bg-cream border border-line rounded-xl p-3 text-ink outline-none text-sm focus:border-ink transition-colors h-20 resize-none" />
              <div className="flex gap-3">
                <input type="number" placeholder="מחיר *" value={form.price || ''}
                  onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))}
                  className="flex-1 bg-cream border border-line rounded-xl p-3 text-ink outline-none text-sm focus:border-ink transition-colors" />
                <input type="number" placeholder="עלות (לרווחיות)" value={form.costPrice || ''}
                  onChange={e => setForm(p => ({ ...p, costPrice: Number(e.target.value) }))}
                  className="flex-1 bg-cream border border-line rounded-xl p-3 text-ink outline-none text-sm focus:border-ink transition-colors" />
              </div>
              <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                className="w-full bg-cream border border-line rounded-xl p-3 text-ink outline-none text-sm focus:border-ink transition-colors">
                <option value="">בחר קטגוריה *</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* ── Discount / sale ── */}
              <div className="border border-line rounded-xl overflow-hidden">
                <label className="flex items-center justify-between p-3 bg-cream cursor-pointer hover:bg-cream/70 transition-colors">
                  <div>
                    <p className="text-ink text-sm font-medium flex items-center gap-1.5"><Tag size={14} /> מבצע / הנחה</p>
                    <p className="text-gray-500 text-xs mt-0.5">המחיר המקורי יוצג בחנות עם קו חוצה</p>
                  </div>
                  <div
                    onClick={() => setForm(p => ({ ...p, discount: { ...p.discount, isActive: !p.discount.isActive } }))}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.discount.isActive ? 'bg-ink' : 'bg-line'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.discount.isActive ? 'translate-x-0.5' : 'translate-x-5'}`} />
                  </div>
                </label>

                {form.discount.isActive && (
                  <div className="p-3 space-y-3 border-t border-line">
                    <div className="flex gap-2">
                      {([['percent', '% אחוזים'], ['fixed', '₪ סכום קבוע']] as const).map(([type, label]) => (
                        <button key={type}
                          onClick={() => setForm(p => ({ ...p, discount: { ...p.discount, type } }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${form.discount.type === type ? 'bg-ink text-white' : 'bg-cream border border-line text-gray-500 hover:text-ink'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number" min="0"
                        max={form.discount.type === 'percent' ? 99 : undefined}
                        placeholder={form.discount.type === 'percent' ? 'אחוז הנחה (למשל 20)' : 'סכום הנחה בשקלים'}
                        value={form.discount.value || ''}
                        onChange={e => setForm(p => ({ ...p, discount: { ...p.discount, value: Number(e.target.value) || 0 } }))}
                        className="flex-1 bg-cream border border-line rounded-lg p-2.5 text-ink text-sm outline-none focus:border-ink transition-colors"
                      />
                      <input
                        type="text"
                        placeholder="שם המבצע (אופציונלי)"
                        value={form.discount.label}
                        onChange={e => setForm(p => ({ ...p, discount: { ...p.discount, label: e.target.value } }))}
                        className="flex-1 bg-cream border border-line rounded-lg p-2.5 text-ink text-sm outline-none focus:border-ink transition-colors"
                      />
                    </div>
                    {formPreview.isDiscounted ? (
                      <p className="text-sm text-body">
                        מחיר בחנות:{' '}
                        <span className="font-bold text-ink">₪{formPreview.final}</span>{' '}
                        <span className="line-through text-gray-400">₪{formPreview.list}</span>{' '}
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-ink text-white">-{formPreview.percentOff}%</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">הזן ערך הנחה כדי לראות את המחיר הסופי.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Box Base Toggle */}
              <label className="flex items-center justify-between p-3 bg-cream border border-line rounded-xl cursor-pointer hover:border-ink/40 transition-colors">
                <div>
                  <p className="text-ink text-sm font-medium">בסיס מארז אישי</p>
                  <p className="text-gray-500 text-xs mt-0.5">מוצר זה ישמש כקופסה/מארז לבחירת לקוח</p>
                </div>
                <div
                  onClick={() => setForm(p => ({ ...p, isBoxBase: !p.isBoxBase }))}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.isBoxBase ? 'bg-ink' : 'bg-line'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.isBoxBase ? 'translate-x-0.5' : 'translate-x-5'}`} />
                </div>
              </label>

              {/* Variations Section */}
              <div className="border-t border-line pt-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-ink text-sm font-bold">וריאציות</span>
                  <button onClick={addVariation}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">
                    <Plus size={12} /> הוסף וריאציה
                  </button>
                </div>
                {form.variations.length === 0 && (
                  <p className="text-gray-400 text-xs text-center py-2">אין וריאציות (למשל: צבע, גודל, סוג בקבוק)</p>
                )}
                {form.variations.map((v, i) => (
                  <div key={i} className="mb-3 p-3 bg-cream rounded-xl border border-line">
                    <div className="flex gap-2 mb-2">
                      <input
                        placeholder="שם הוריאציה (למשל: צבע)"
                        value={v.name}
                        onChange={e => updateVariation(i, 'name', e.target.value)}
                        className="flex-1 bg-white border border-line rounded-lg p-2 text-ink text-xs outline-none focus:border-ink/40 transition-colors"
                      />
                      <button onClick={() => removeVariation(i)} className="p-2 text-red-400 hover:text-red-300 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                    <input
                      placeholder="ערכים מופרדים בפסיקים (למשל: אדום, כחול, ירוק)"
                      value={v.values}
                      onChange={e => updateVariation(i, 'values', e.target.value)}
                      className="w-full bg-white border border-line rounded-lg p-2 text-ink text-xs outline-none focus:border-ink/40 transition-colors"
                    />
                  </div>
                ))}
              </div>

              {/* Images — uploaded immediately so colors can be bound to them below */}
              <div className="border-t border-line pt-4">
                <span className="text-ink text-sm font-bold">תמונות</span>
                <p className="text-gray-400 text-xs mt-0.5 mb-3">התמונה הראשונה היא התמונה הראשית</p>
                {form.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {form.images.map((img, i) => (
                      <div key={img} className="relative aspect-square rounded-lg overflow-hidden border border-line group">
                        <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        {i === 0 && (
                          <span className="absolute bottom-0 inset-x-0 bg-ink/70 text-white text-[10px] text-center py-0.5">ראשית</span>
                        )}
                        <button
                          onClick={() => removeImage(img)}
                          aria-label="הסר תמונה"
                          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-ink/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="flex items-center justify-center gap-2 w-full p-3.5 border-2 border-dashed border-line rounded-xl cursor-pointer hover:border-ink/40 transition-colors">
                  {uploadingImages ? <Loader2 size={18} className="animate-spin text-gray-500" /> : <Camera size={18} className="text-gray-500" />}
                  <span className="text-gray-500 text-sm">{uploadingImages ? 'מעלה…' : 'העלה תמונות'}</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImages} disabled={uploadingImages} />
                </label>
              </div>

              {/* Colors — pick from the palette, then bind each to one of the product's images */}
              <div className="border-t border-line pt-4">
                <span className="text-ink text-sm font-bold">צבעים</span>
                <p className="text-gray-400 text-xs mt-0.5 mb-3">בחרו את הצבעים שהמוצר מוצע בהם</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {COLOR_PALETTE.map(c => {
                    const on = form.colorOptions.some(x => x.name === c.name);
                    return (
                      <button
                        key={c.name}
                        onClick={() => toggleColor(c)}
                        title={c.name}
                        aria-label={c.name}
                        aria-pressed={on}
                        className={`w-8 h-8 rounded-full border border-line-strong flex items-center justify-center transition-all ${on ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {on && <CheckCircle2 size={14} className="text-white mix-blend-difference" />}
                      </button>
                    );
                  })}
                </div>

                {form.colorOptions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-gray-500 text-xs">שייכו לכל צבע תמונה:</p>
                    {form.colorOptions.map(c => (
                      <div key={c.name} className="flex items-center gap-3 p-2 bg-cream rounded-xl border border-line">
                        <span className="w-6 h-6 rounded-full border border-line-strong flex-shrink-0" style={{ backgroundColor: c.hex }} />
                        <span className="text-ink text-xs w-16 flex-shrink-0">{c.name}</span>
                        {form.images.length === 0 ? (
                          <span className="text-gray-400 text-xs">העלו תמונות כדי לשייך</span>
                        ) : (
                          <div className="flex gap-1.5 overflow-x-auto">
                            {form.images.map(img => (
                              <button
                                key={img}
                                onClick={() => bindColorImage(c.name, img)}
                                className={`w-10 h-10 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${c.imageUrl === img ? 'border-ink' : 'border-transparent opacity-60 hover:opacity-100'}`}
                              >
                                <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Length (אורך) */}
              <div className="border-t border-line pt-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-ink text-sm font-bold">אורך</span>
                  <button onClick={addLength}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-ink/10 text-ink hover:bg-ink/20 transition-colors">
                    <Plus size={12} /> הוסף אורך
                  </button>
                </div>
                {form.lengthOptions.length === 0 && (
                  <p className="text-gray-400 text-xs text-center py-2">אין אפשרויות אורך</p>
                )}
                {form.lengthOptions.map((l, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      placeholder='אורך (למשל: 50 ס"מ)'
                      value={l.label}
                      onChange={e => updateLength(i, 'label', e.target.value)}
                      className="flex-1 bg-cream border border-line rounded-lg p-2 text-ink text-xs outline-none focus:border-ink/40 transition-colors"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="תוספת ₪"
                      value={l.priceDelta || ''}
                      onChange={e => updateLength(i, 'priceDelta', e.target.value)}
                      className="w-24 bg-cream border border-line rounded-lg p-2 text-ink text-xs outline-none focus:border-ink/40 transition-colors"
                    />
                    <button onClick={() => removeLength(i)} className="p-2 text-red-400 hover:text-red-500 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Branding (מיתוג) — opt into entries from the global catalog */}
              <div className="border-t border-line pt-4">
                <span className="text-ink text-sm font-bold">מיתוג</span>
                <p className="text-gray-400 text-xs mt-0.5 mb-3">אילו מיתוגים זמינים למוצר זה?</p>
                {brandingOptions.length === 0 ? (
                  <p className="text-gray-400 text-xs text-center py-2">אין מיתוגים. הוסיפו אותם בלשונית "מיתוג".</p>
                ) : (
                  <div className="space-y-1.5">
                    {brandingOptions.map(b => (
                      <label key={b.id} className="flex items-center gap-2 p-2 bg-cream rounded-lg border border-line cursor-pointer hover:border-ink/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={form.brandingOptionIds.includes(b.id)}
                          onChange={() => toggleBranding(b.id)}
                          className="accent-[#1A1A18]"
                        />
                        <span className="text-ink text-xs flex-1">{b.label}</span>
                        <span className="text-gray-500 text-xs">+₪{b.extraCost}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Sits outside the catalog list on purpose: a product can be branded
                    with a name even when it opts into no priced branding option. */}
                <label className="mt-3 flex items-center justify-between p-3 bg-cream border border-line rounded-xl cursor-pointer hover:border-ink/40 transition-colors">
                  <div>
                    <p className="text-ink text-sm font-medium">שדה שם למיתוג</p>
                    <p className="text-gray-500 text-xs mt-0.5">הלקוח יוכל להקליד את השם שיודפס על המוצר</p>
                  </div>
                  <div
                    onClick={() => setForm(p => ({ ...p, allowBrandingName: !p.allowBrandingName }))}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.allowBrandingName ? 'bg-ink' : 'bg-line'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.allowBrandingName ? 'translate-x-0.5' : 'translate-x-5'}`} />
                  </div>
                </label>
              </div>
            </div>
            <div className="p-5 border-t border-line">
              <button onClick={handleSave} disabled={uploading}
                className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                style={{ background: `${INK}` }}>
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
      <h2 className="text-xl font-bold text-ink">לקוחות ({customers.length})</h2>

      {customers.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <Users size={52} className="mx-auto mb-3 opacity-20" />
          <p>אין לקוחות עדיין</p>
        </div>
      ) : (
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-right text-gray-400 font-medium px-5 py-3.5">שם</th>
                  <th className="text-right text-gray-400 font-medium px-5 py-3.5">טלפון</th>
                  <th className="text-right px-5 py-3.5">
                    <button onClick={() => toggleSort('totalOrders')}
                      className="flex items-center gap-1 text-gray-400 font-medium hover:text-ink transition-colors">
                      הזמנות
                      {sortBy === 'totalOrders' ? (sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />) : <ChevronDown size={14} className="opacity-20" />}
                    </button>
                  </th>
                  <th className="text-right px-5 py-3.5">
                    <button onClick={() => toggleSort('totalSpend')}
                      className="flex items-center gap-1 text-gray-400 font-medium hover:text-ink transition-colors">
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
                    className={`hover:bg-cream transition-colors ${i < sorted.length - 1 ? 'border-b border-line' : ''}`}>
                    <td className="px-5 py-3.5 text-ink font-medium">
                      {c.totalOrders > 1 && <span className="text-yellow-400 ml-1">⭐</span>}
                      {c.name}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400">
                      <a href={`https://wa.me/972${c.phone.replace(/^0/, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="hover:text-green-400 transition-colors">{c.phone}</a>
                    </td>
                    <td className="px-5 py-3.5 text-body text-center">{c.totalOrders}</td>
                    <td className="px-5 py-3.5 font-bold" style={{ color: INK }}>₪{c.totalSpend.toFixed(0)}</td>
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
      <h2 className="text-xl font-bold text-ink">הגדרות</h2>
      <div className="bg-white border border-line rounded-2xl p-6 space-y-5">
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
              className="w-full bg-cream border border-line rounded-xl p-3 text-ink outline-none text-sm focus:border-ink transition-colors" />
          </div>
        ))}
        <button onClick={save} disabled={saving}
          className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
          style={{ background: `${INK}` }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? '✓ נשמר בהצלחה!' : 'שמור הגדרות'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── BrandingView ───────────────────────── */
/** The global מיתוג catalog. Products opt into entries from this list. */
function BrandingView({ brandingOptions }: { brandingOptions: BrandingOption[] }) {
  const [label, setLabel] = useState('');
  const [extraCost, setExtraCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handleAdd = async () => {
    const name = label.trim();
    const cost = Number(extraCost) || 0;
    if (!name) return alert('נא להזין שם מיתוג');
    if (cost < 0) return alert('תוספת התשלום לא יכולה להיות שלילית');
    setSaving(true);
    try {
      await addDoc(collection(db, 'branding_options'), {
        label: name, extraCost: cost, isActive: true, created_at: new Date(),
      });
      setLabel(''); setExtraCost('');
      showToast('המיתוג נוסף!');
    } catch (err) { console.error(err); alert('הוספת המיתוג נכשלה.'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string, patch: Partial<BrandingOption>) => {
    try {
      await updateDoc(doc(db, 'branding_options', id), patch);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string, name: string) => {
    // Products keep the id in brandingOptionIds; the storefront resolves against
    // this catalog, so a deleted option simply stops being offered.
    if (!confirm(`למחוק את המיתוג "${name}"?`)) return;
    await deleteDoc(doc(db, 'branding_options', id));
    showToast('המיתוג נמחק');
  };

  return (
    <div className="space-y-5" dir="rtl">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}

      <div className="bg-white border border-line rounded-2xl p-5">
        <h3 className="text-ink font-bold mb-1">מיתוג</h3>
        <p className="text-gray-500 text-xs mb-4">
          רשימת המיתוגים הגלובלית (למשל: ספיידרמן, סופרמן). בכל מוצר בוחרים אילו מיתוגים זמינים עבורו.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <input
            type="text"
            placeholder="שם המיתוג (למשל: ספיידרמן)"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            className="flex-1 bg-cream border border-line rounded-xl p-3 text-ink outline-none text-sm focus:border-ink transition-colors"
          />
          <input
            type="number"
            min="0"
            placeholder="תוספת תשלום ₪"
            value={extraCost}
            onChange={e => setExtraCost(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            className="w-full sm:w-40 bg-cream border border-line rounded-xl p-3 text-ink outline-none text-sm focus:border-ink transition-colors"
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: `${INK}` }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            הוסף
          </button>
        </div>

        {brandingOptions.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">אין מיתוגים עדיין</p>
        ) : (
          <div className="space-y-2">
            {brandingOptions.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-3 bg-cream border border-line rounded-xl">
                <input
                  type="text"
                  value={b.label}
                  onChange={e => handleUpdate(b.id, { label: e.target.value })}
                  className="flex-1 bg-white border border-line rounded-lg p-2 text-ink text-sm outline-none focus:border-ink transition-colors"
                />
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 text-sm">+₪</span>
                  <input
                    type="number"
                    min="0"
                    value={b.extraCost}
                    onChange={e => handleUpdate(b.id, { extraCost: Number(e.target.value) || 0 })}
                    className="w-20 bg-white border border-line rounded-lg p-2 text-ink text-sm outline-none focus:border-ink transition-colors"
                  />
                </div>
                <button
                  onClick={() => handleUpdate(b.id, { isActive: b.isActive === false })}
                  title={b.isActive === false ? 'מוסתר בחנות' : 'מוצג בחנות'}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${b.isActive === false ? 'bg-line' : 'bg-ink'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${b.isActive === false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <button onClick={() => handleDelete(b.id, b.label)} className="p-2 text-red-400 hover:text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── DesignView ─────────────────────────── */
/** Promotional images: a strip on the homepage, or a popup on arrival. */
function DesignView({ banners }: { banners: SiteBanner[] }) {
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const home = banners.filter(b => b.placement === 'home').sort((a, b) => a.sortOrder - b.sortOrder);
  const popup = banners.filter(b => b.placement === 'popup').sort((a, b) => a.sortOrder - b.sortOrder);

  // Same pattern as the product gallery: upload on pick, so the admin sees the real
  // image (and any Storage permission error) before anything is saved.
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, placement: 'home' | 'popup') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const sRef = ref(storage, `banners/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const imageUrl = await getDownloadURL(sRef);
      const siblings = banners.filter(b => b.placement === placement);
      await addDoc(collection(db, 'site_banners'), {
        imageUrl,
        placement,
        isActive: true,
        sortOrder: siblings.length,
        created_at: new Date(),
      });
      showToast('התמונה הועלתה!');
    } catch (err: any) {
      console.error('[Design] banner upload failed:', err);
      alert(
        err?.code === 'storage/unauthorized'
          ? 'אין הרשאה להעלות לתיקיית banners באחסון. יש לעדכן את כללי ה-Storage בקונסולת Firebase.'
          : 'העלאת התמונה נכשלה. נסו שוב.'
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const patch = async (id: string, data: Partial<SiteBanner>) => {
    try { await updateDoc(doc(db, 'site_banners', id), data); }
    catch (err) { console.error(err); }
  };

  const remove = async (id: string) => {
    if (!confirm('למחוק את התמונה?')) return;
    await deleteDoc(doc(db, 'site_banners', id));
    showToast('התמונה נמחקה');
  };

  const BannerRow = ({ b }: { key?: string; b: SiteBanner }) => (
    <div className="bg-white border border-line rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
      <div className="w-full sm:w-40 aspect-video rounded-xl overflow-hidden bg-cream border border-line flex-shrink-0">
        <img src={b.imageUrl} alt={b.title || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </div>
      <div className="flex-1 space-y-2.5 min-w-0">
        <input
          type="text"
          placeholder="כותרת / טקסט חלופי (נגישות)"
          defaultValue={b.title ?? ''}
          onBlur={e => patch(b.id, { title: e.target.value.trim() })}
          className="w-full bg-cream border border-line rounded-lg p-2.5 text-ink text-sm outline-none focus:border-ink transition-colors"
        />
        <input
          type="url"
          dir="ltr"
          placeholder="קישור בלחיצה (אופציונלי) — https://..."
          defaultValue={b.linkUrl ?? ''}
          onBlur={e => patch(b.id, { linkUrl: e.target.value.trim() })}
          className="w-full bg-cream border border-line rounded-lg p-2.5 text-ink text-sm outline-none focus:border-ink transition-colors"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-xs">סדר</span>
            <input
              type="number" min="0"
              value={b.sortOrder}
              onChange={e => patch(b.id, { sortOrder: Number(e.target.value) || 0 })}
              className="w-16 bg-cream border border-line rounded-lg p-2 text-ink text-sm outline-none focus:border-ink transition-colors"
            />
          </div>
          <button
            onClick={() => patch(b.id, { isActive: !b.isActive })}
            title={b.isActive ? 'מוצג באתר' : 'מוסתר'}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${b.isActive ? 'bg-ink' : 'bg-line'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${b.isActive ? 'translate-x-0.5' : 'translate-x-5'}`} />
          </button>
          <span className="text-xs text-gray-500">{b.isActive ? 'מוצג באתר' : 'מוסתר'}</span>
          <button onClick={() => remove(b.id)} className="p-2 text-red-400 hover:text-red-500 transition-colors mr-auto">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  const Section = ({
    title, hint, placement, list,
  }: { title: string; hint: string; placement: 'home' | 'popup'; list: SiteBanner[] }) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <p className="text-gray-500 text-sm mt-0.5">{hint}</p>
        </div>
        <label className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
          style={{ background: INK, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          העלה תמונה
          <input type="file" accept="image/*" disabled={uploading}
            onChange={e => handleUpload(e, placement)} className="hidden" />
        </label>
      </div>
      {list.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl p-10 text-center text-gray-400">
          <ImageIcon size={36} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm">אין תמונות עדיין</p>
        </div>
      ) : (
        <div className="space-y-3">{list.map(b => <BannerRow key={b.id} b={b} />)}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-8 max-w-3xl">
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl">
          {toast}
        </div>
      )}
      <h2 className="text-xl font-bold text-ink">עיצוב האתר</h2>

      <Section
        title="באנרים בעמוד הבית"
        hint="תמונות שיוצגו בעמוד הבית, מתחת לכותרת הראשית. מוצגות לפי סדר עולה."
        placement="home"
        list={home}
      />

      <Section
        title="חלון קופץ בכניסה לאתר"
        hint="התמונה הפעילה הראשונה תקפוץ למבקר עם הכניסה לאתר, פעם אחת לכל גלישה."
        placement="popup"
        list={popup}
      />

      {popup.filter(b => b.isActive).length > 1 && (
        <p className="text-gray-500 text-sm">
          שים לב: רק החלון הקופץ הראשון (לפי סדר) יוצג למבקרים.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────── Main Admin ─────────────────────────── */
function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabName>('orders');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [brandingOptions, setBrandingOptions] = useState<BrandingOption[]>([]);
  const [banners, setBanners] = useState<SiteBanner[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ pickup_address: '', delivery_cost: '0', bit_phone: '' });
  const [dataError, setDataError] = useState('');

  useEffect(() => {
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
    const unsubB = onSnapshot(
      collection(db, 'branding_options'),
      snap => setBrandingOptions(snap.docs.map(d => ({ id: d.id, ...d.data() } as BrandingOption))),
      onErr('branding_options')
    );
    const unsubBanners = onSnapshot(
      collection(db, 'site_banners'),
      snap => setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as SiteBanner))),
      onErr('site_banners')
    );
    getDoc(doc(db, 'settings', 'store'))
      .then(d => { if (d.exists()) setSettings(d.data() as StoreSettings); })
      .catch(err => console.error('[Admin] settings fetch error:', err));
    return () => { unsubO(); unsubP(); unsubC(); unsubCust(); unsubB(); unsubBanners(); };
  }, []);

  // Archived orders are out of sight everywhere except the archive tab — they must not
  // keep the "new" badge lit or count toward revenue.
  const activeOrders = orders.filter(o => !o.isArchived);
  const newOrdersCount = activeOrders.filter(o => o.status === 'חדש').length;

  const navItems: { tab: TabName; label: string; icon: any }[] = [
    { tab: 'orders', label: 'הזמנות', icon: ShoppingBag },
    { tab: 'analytics', label: 'סטטיסטיקה', icon: BarChart3 },
    { tab: 'products', label: 'מוצרים', icon: Package },
    { tab: 'branding', label: 'מיתוג', icon: Sparkles },
    { tab: 'design', label: 'עיצוב', icon: ImageIcon },
    { tab: 'customers', label: 'לקוחות', icon: Users },
    { tab: 'settings', label: 'הגדרות', icon: SettingsIcon },
  ];

  const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navItems.map(({ tab, label, icon: Icon }) => (
        <button key={tab} onClick={() => { setActiveTab(tab); onNavigate?.(); }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full text-right relative ${activeTab === tab ? 'text-white' : 'text-gray-400 hover:text-ink hover:bg-cream'}`}
          style={activeTab === tab ? { background: `${INK}` } : {}}>
          <Icon size={18} />
          {label}
          {tab === 'orders' && newOrdersCount > 0 && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 bg-red-500 text-ink text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {newOrdersCount}
            </span>
          )}
        </button>
      ))}
    </>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-cream text-ink">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur-md border-b border-line px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl bg-white border border-line md:hidden relative">
            <Menu size={18} className="text-gray-400" />
            {newOrdersCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-ink text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                {newOrdersCount}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="Tony Amrami" style={{ mixBlendMode: 'multiply' }} className="h-8 object-contain" />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-52 min-h-[calc(100vh-57px)] bg-cream border-l border-line sticky top-[57px] p-3 gap-1">
          <SidebarNav />
        </aside>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
            <div className="relative bg-cream border-l border-line w-56 flex flex-col p-3 gap-1">
              <div className="flex items-center justify-between px-2 py-2 mb-1">
                <img src="/logo.jpeg" alt="Tony Amrami" style={{ mixBlendMode: 'multiply' }} className="h-7 object-contain" />
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-gray-500 hover:text-ink">
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
          {activeTab === 'analytics' && <AnalyticsView orders={activeOrders} products={products} categories={categories} />}
          {activeTab === 'products' && <ProductsView products={products} categories={categories} brandingOptions={brandingOptions} />}
          {activeTab === 'branding' && <BrandingView brandingOptions={brandingOptions} />}
          {activeTab === 'design' && <DesignView banners={banners} />}
          {activeTab === 'customers' && <CustomersView customers={customers} />}
          {activeTab === 'settings' && <SettingsView settings={settings} />}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 md:hidden bg-cream/95 backdrop-blur-md border-t border-line flex z-30">
        {navItems.map(({ tab, label, icon: Icon }) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors relative ${activeTab === tab ? '' : 'text-gray-400'}`}
            style={activeTab === tab ? { color: INK } : {}}>
            <Icon size={20} />
            {label}
            {tab === 'orders' && newOrdersCount > 0 && (
              <span className="absolute top-2 right-[22%] bg-red-500 text-ink text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {newOrdersCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ──────────────────── Protected Admin entry point ───────────────────── */
export default function Admin() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <AdminDashboard />
      </ProtectedRoute>
    </AuthProvider>
  );
}
