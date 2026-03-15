import React, { useState, useEffect } from 'react';
import { auth, db, storage } from '../firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, type User } from 'firebase/auth';
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
  MessageCircle, DollarSign, CheckCircle2, Download, ChevronDown, ChevronUp
} from 'lucide-react';
import * as XLSX from 'xlsx';

/* ─────────────────────────────── Types ─────────────────────────────── */
interface OrderItem { id: string; name: string; price: number; quantity: number; selectedVariations?: Record<string, string>; }
interface Order {
  id: string; customer_name: string; customer_phone: string;
  delivery_method: 'pickup' | 'delivery'; total_price: number;
  items: OrderItem[] | string; status: string; created_at: string;
}
interface ProductVariation { name: string; values: string[]; }
interface Product {
  id: string; name: string; description: string; price: number;
  category_id: string; main_image: string; images: string[]; created_at?: any;
  variations?: ProductVariation[]; isBoxBase?: boolean;
}
interface Category { id: string; name: string; }
interface StoreSettings { pickup_address: string; delivery_cost: string; bit_phone: string; }
type TabName = 'orders' | 'analytics' | 'products' | 'settings';

/* ─────────────────────────────── Constants ──────────────────────────── */
const GOLD = '#F5C518';
const BLUE = '#4A7FE5';
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
function LoginScreen({ onLogin }: { onLogin: (e: string, p: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try { await onLogin(email, password); }
    catch { setError('שם משתמש או סיסמה שגויים'); }
    finally { setLoading(false); }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#070712] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}35` }}>
            <Package size={28} style={{ color: GOLD }} />
          </div>
          <h1 className="text-2xl font-bold text-white">Tony Admin</h1>
          <p className="text-gray-500 text-sm mt-1">ניהול מתקדם לעסק שלך</p>
        </div>
        <form onSubmit={handle} className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">אימייל</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-[#070712] border border-[#252550] rounded-xl p-3 text-white outline-none text-sm transition-colors"
              style={{ borderColor: email ? `${GOLD}40` : '' }} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">סיסמה</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-[#070712] border border-[#252550] rounded-xl p-3 text-white outline-none text-sm transition-colors"
              style={{ borderColor: password ? `${GOLD}40` : '' }} />
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #D4910A)` }}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'כניסה'}
          </button>
        </form>
        <p className="text-center text-gray-600 text-xs mt-4">
          * הגדר משתמש אדמין ב-Firebase Authentication Console
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────── StatCard ───────────────────────────── */
function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-5 flex items-center gap-4">
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

  const updateStatus = async (status: string) => {
    await updateDoc(doc(db, 'orders', order.id), { status });
  };

  return (
    <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-5 space-y-4 flex flex-col">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h3 className="font-bold text-white">{order.customer_name}</h3>
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
              <span className="text-gray-300">{item.name} <span className="text-gray-500">×{item.quantity}</span></span>
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

      <div className="flex justify-between items-center border-t border-[#1e1e3a] pt-3">
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
        className="w-full bg-[#070712] border border-[#252550] rounded-xl p-2.5 text-sm text-gray-300 outline-none cursor-pointer hover:border-[#F5C518]/40 transition-colors">
        <option value="חדש">🔴 חדש</option>
        <option value="בטיפול">🔵 בטיפול</option>
        <option value="בוצע">🟢 בוצע</option>
      </select>
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
        <h2 className="text-xl font-bold text-white">הזמנות</h2>
        <div className="flex gap-2 flex-wrap">
          {[['all', 'הכל'], ['חדש', `חדש (${count('חדש')})`], ['בטיפול', `בטיפול (${count('בטיפול')})`], ['בוצע', `בוצע (${count('בוצע')})`]].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${filter === val ? 'text-black' : 'bg-[#0f0f24] border border-[#252550] text-gray-400 hover:text-white'}`}
              style={filter === val ? { background: `linear-gradient(135deg, ${GOLD}, #D4910A)` } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-24 text-gray-600">
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

  const tooltipStyle = { background: '#0f0f24', border: '1px solid #252550', borderRadius: 12, color: '#fff' };
  const hasData = categoryRevData.length > 0 || categoryVolData.length > 0 || topProductsData.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">סטטיסטיקה</h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border"
            style={{ background: '#4CAF5018', color: '#4CAF50', borderColor: '#4CAF5035' }}>
            ✓ הזמנות שבוצעו בלבד
          </span>
        </div>
        <button onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-black transition-opacity hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #D4910A)` }}>
          <Download size={16} /> ייצוא לאקסל
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-4 space-y-4">
        <h3 className="text-white text-sm font-semibold">סינון נתונים</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-gray-500 text-xs block mb-1">מתאריך</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-[#070712] border border-[#252550] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-[#F5C518]/50 transition-colors" />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">עד תאריך</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="bg-[#070712] border border-[#252550] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-[#F5C518]/50 transition-colors" />
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1">סינון לפי מוצר</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="bg-[#070712] border border-[#252550] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-[#F5C518]/50 transition-colors min-w-[180px]"
            >
              <option value="">כל המוצרים</option>
              {orderedProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {(startDate || endDate || selectedProductId) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedProductId(''); }}
              className="px-3 py-2 text-sm text-gray-400 border border-[#252550] rounded-xl hover:text-white transition-colors">
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
      <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-5">
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
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
            <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v}`} width={52} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
            <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.5}
              dot={{ fill: GOLD, strokeWidth: 0, r: 3 }} activeDot={{ r: 5, fill: GOLD }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasData ? (
        <>
          {/* ── Bar Chart: Sales Volume per Category ── */}
          {categoryVolData.length > 0 && (
            <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-5">כמות מכירות לפי קטגוריה</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryVolData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "יחידות"]} />
                  <Bar dataKey="volume" radius={[6, 6, 0, 0]}>
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
              <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-5">
                <h3 className="text-white font-semibold mb-4">הכנסות לפי קטגוריה</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={categoryRevData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#333' }}>
                      {categoryRevData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
                    <Legend wrapperStyle={{ color: '#777', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Pie Chart: Best-Selling Products by Revenue ── */}
            {topProductsData.length > 0 && (
              <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-5">
                <h3 className="text-white font-semibold mb-4">מוצרים מובילים לפי הכנסה</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={topProductsData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value"
                      paddingAngle={3}
                      label={({ name, percent }) => percent > 0.06 ? `${name.length > 12 ? name.slice(0, 12) + '…' : name} ${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={{ stroke: '#444', strokeWidth: 1 }}>
                      {topProductsData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₪${v}`, 'הכנסה']} />
                    <Legend wrapperStyle={{ color: '#777', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── Product volume table ── */}
          {Object.keys(prodVolMap).length > 0 && (
            <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">כמות מכירות לפי מוצר</h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {Object.entries(prodVolMap)
                  .sort(([, a], [, b]) => b - a)
                  .map(([id, qty]) => {
                    const prod = products.find(p => p.id === id);
                    if (!prod) return null;
                    const maxQty = Math.max(...Object.values(prodVolMap));
                    return (
                      <div key={id} className="flex items-center gap-3 text-sm py-1 px-2 rounded-lg hover:bg-[#070712] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-1">
                            <span className="text-gray-300 truncate">{prod.name}</span>
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
        <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-10 text-center text-gray-600">
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
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
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-xl">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">מוצרים ({products.length})</h2>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-black transition-opacity hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #D4910A)` }}>
          <Plus size={16} /> מוצר חדש
        </button>
      </div>

      {/* Grouped by category */}
      <div className="space-y-3">
        {grouped.map(({ cat, prods }) => (
          <div key={cat.id} className="bg-[#0f0f24] border border-[#252550] rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-right hover:bg-[#070712] transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{cat.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#252550] text-gray-400">{prods.length} מוצרים</span>
              </div>
              {collapsedCats.has(cat.id) ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
            </button>
            {!collapsedCats.has(cat.id) && (
              <div className="border-t border-[#1e1e3a] overflow-x-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr className="border-b border-[#1e1e3a]">
                      {['מוצר', 'מחיר', 'וריאציות', 'פעולות'].map(h => (
                        <th key={h} className="p-4 text-gray-500 font-medium text-sm">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a35]">
                    {prods.map(p => (
                      <tr key={p.id} className="hover:bg-[#070712] transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#070712] border border-[#252550] overflow-hidden flex-shrink-0">
                              {p.main_image && <img src={p.main_image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-white font-medium text-sm">{p.name}</p>
                                {p.isBoxBase && <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ background: '#F5C51820', color: '#F5C518' }}>מארז</span>}
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
          <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleCat('__uncategorized__')}
              className="w-full flex items-center justify-between px-5 py-3.5 text-right hover:bg-[#070712] transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-400">ללא קטגוריה</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#252550] text-gray-400">{uncategorized.length}</span>
              </div>
              {collapsedCats.has('__uncategorized__') ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
            </button>
            {!collapsedCats.has('__uncategorized__') && (
              <div className="border-t border-[#1e1e3a] overflow-x-auto">
                <table className="w-full text-right">
                  <thead><tr className="border-b border-[#1e1e3a]">
                    {['מוצר', 'קטגוריה', 'מחיר', 'פעולות'].map(h => (
                      <th key={h} className="p-4 text-gray-500 font-medium text-sm">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-[#1a1a35]">
                    {uncategorized.map(p => (
                      <tr key={p.id} className="hover:bg-[#070712] transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#070712] border border-[#252550] overflow-hidden flex-shrink-0">
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
          <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-12 text-center text-gray-600">
            <Package size={36} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">אין מוצרים עדיין</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-[#1e1e3a] flex justify-between items-center sticky top-0 bg-[#0f0f24]">
              <h3 className="font-bold text-white">{editing ? 'עריכת מוצר' : 'מוצר חדש'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }}
                className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-[#1e1e3a] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input type="text" placeholder="שם המוצר *" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-[#070712] border border-[#252550] rounded-xl p-3 text-white outline-none text-sm focus:border-[#F5C518]/50 transition-colors" />
              <textarea placeholder="תיאור" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full bg-[#070712] border border-[#252550] rounded-xl p-3 text-white outline-none text-sm focus:border-[#F5C518]/50 transition-colors h-20 resize-none" />
              <input type="number" placeholder="מחיר *" value={form.price || ''}
                onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))}
                className="w-full bg-[#070712] border border-[#252550] rounded-xl p-3 text-white outline-none text-sm focus:border-[#F5C518]/50 transition-colors" />
              <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                className="w-full bg-[#070712] border border-[#252550] rounded-xl p-3 text-white outline-none text-sm focus:border-[#F5C518]/50 transition-colors">
                <option value="">בחר קטגוריה *</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* Box Base Toggle */}
              <label className="flex items-center justify-between p-3 bg-[#070712] border border-[#252550] rounded-xl cursor-pointer hover:border-[#F5C518]/40 transition-colors">
                <div>
                  <p className="text-white text-sm font-medium">בסיס מארז אישי</p>
                  <p className="text-gray-500 text-xs mt-0.5">מוצר זה ישמש כקופסה/מארז לבחירת לקוח</p>
                </div>
                <div
                  onClick={() => setForm(p => ({ ...p, isBoxBase: !p.isBoxBase }))}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.isBoxBase ? 'bg-[#F5C518]' : 'bg-[#252550]'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.isBoxBase ? 'translate-x-0.5' : 'translate-x-5'}`} />
                </div>
              </label>

              {/* Variations Section */}
              <div className="border-t border-[#252550] pt-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-white text-sm font-bold">וריאציות</span>
                  <button onClick={addVariation}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">
                    <Plus size={12} /> הוסף וריאציה
                  </button>
                </div>
                {form.variations.length === 0 && (
                  <p className="text-gray-600 text-xs text-center py-2">אין וריאציות (למשל: צבע, גודל, סוג בקבוק)</p>
                )}
                {form.variations.map((v, i) => (
                  <div key={i} className="mb-3 p-3 bg-[#070712] rounded-xl border border-[#252550]">
                    <div className="flex gap-2 mb-2">
                      <input
                        placeholder="שם הוריאציה (למשל: צבע)"
                        value={v.name}
                        onChange={e => updateVariation(i, 'name', e.target.value)}
                        className="flex-1 bg-[#0f0f24] border border-[#252550] rounded-lg p-2 text-white text-xs outline-none focus:border-[#F5C518]/40 transition-colors"
                      />
                      <button onClick={() => removeVariation(i)} className="p-2 text-red-400 hover:text-red-300 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                    <input
                      placeholder="ערכים מופרדים בפסיקים (למשל: אדום, כחול, ירוק)"
                      value={v.values}
                      onChange={e => updateVariation(i, 'values', e.target.value)}
                      className="w-full bg-[#0f0f24] border border-[#252550] rounded-lg p-2 text-white text-xs outline-none focus:border-[#F5C518]/40 transition-colors"
                    />
                  </div>
                ))}
              </div>

              {editing && editing.images?.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs mb-2">תמונות קיימות:</p>
                  <div className="grid grid-cols-4 gap-2">
                    {editing.images.map((img, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden border border-[#252550]">
                        <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center justify-center gap-2 w-full p-3.5 border-2 border-dashed border-[#252550] rounded-xl cursor-pointer hover:border-[#F5C518]/40 transition-colors">
                <Camera size={18} className="text-gray-500" />
                <span className="text-gray-500 text-sm">{editing ? 'הוסף תמונות' : 'העלה תמונות'}</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImages} />
              </label>
              {form.previews.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {form.previews.map((img, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden border border-[#252550]">
                      <img src={img} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-[#1e1e3a]">
              <button onClick={handleSave} disabled={uploading}
                className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                style={{ background: `linear-gradient(135deg, ${GOLD}, #D4910A)` }}>
                {uploading ? <><Loader2 size={16} className="animate-spin" /> מעלה...</> : editing ? 'שמור שינויים' : 'הוסף מוצר'}
              </button>
            </div>
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
      <h2 className="text-xl font-bold text-white">הגדרות</h2>
      <div className="bg-[#0f0f24] border border-[#252550] rounded-2xl p-6 space-y-5">
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
              className="w-full bg-[#070712] border border-[#252550] rounded-xl p-3 text-white outline-none text-sm focus:border-[#F5C518]/50 transition-colors" />
          </div>
        ))}
        <button onClick={save} disabled={saving}
          className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #D4910A)` }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? '✓ נשמר בהצלחה!' : 'שמור הגדרות'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Main Admin ─────────────────────────── */
export default function Admin() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabName>('orders');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ pickup_address: '', delivery_cost: '0', bit_phone: '' });

  useEffect(() => {
    return onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubO = onSnapshot(query(collection(db, 'orders'), orderBy('created_at', 'desc')),
      snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))));
    const unsubP = onSnapshot(query(collection(db, 'products'), orderBy('created_at', 'desc')),
      snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))));
    const unsubC = onSnapshot(collection(db, 'categories'),
      snap => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))));
    getDoc(doc(db, 'settings', 'store')).then(d => { if (d.exists()) setSettings(d.data() as StoreSettings); });
    return () => { unsubO(); unsubP(); unsubC(); };
  }, [user]);

  if (authLoading) return (
    <div className="min-h-screen bg-[#070712] flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin" style={{ color: GOLD }} />
    </div>
  );

  if (!user) return (
    <LoginScreen onLogin={(e, p) => signInWithEmailAndPassword(auth, e, p).then(() => {})} />
  );

  const newOrdersCount = orders.filter(o => o.status === 'חדש').length;

  const navItems: { tab: TabName; label: string; icon: any }[] = [
    { tab: 'orders', label: 'הזמנות', icon: ShoppingBag },
    { tab: 'analytics', label: 'סטטיסטיקה', icon: BarChart3 },
    { tab: 'products', label: 'מוצרים', icon: Package },
    { tab: 'settings', label: 'הגדרות', icon: SettingsIcon },
  ];

  const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navItems.map(({ tab, label, icon: Icon }) => (
        <button key={tab} onClick={() => { setActiveTab(tab); onNavigate?.(); }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full text-right relative ${activeTab === tab ? 'text-black' : 'text-gray-400 hover:text-white hover:bg-[#0f0f24]'}`}
          style={activeTab === tab ? { background: `linear-gradient(135deg, ${GOLD}, #D4910A)` } : {}}>
          <Icon size={18} />
          {label}
          {tab === 'orders' && newOrdersCount > 0 && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {newOrdersCount}
            </span>
          )}
        </button>
      ))}
    </>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-[#070712] text-white">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#070712]/95 backdrop-blur-md border-b border-[#1e1e3a] px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl bg-[#0f0f24] border border-[#252550] md:hidden relative">
            <Menu size={18} className="text-gray-400" />
            {newOrdersCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                {newOrdersCount}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}35` }}>
              <Package size={16} style={{ color: GOLD }} />
            </div>
            <span className="font-bold tracking-wide" style={{ color: GOLD }}>Tony Admin</span>
          </div>
        </div>
        <button onClick={() => signOut(auth)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-xl hover:bg-red-500/10">
          <LogOut size={14} /> יציאה
        </button>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-52 min-h-[calc(100vh-57px)] bg-[#0a0a1a] border-l border-[#1e1e3a] sticky top-[57px] p-3 gap-1">
          <SidebarNav />
        </aside>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
            <div className="relative bg-[#0a0a1a] border-l border-[#1e1e3a] w-56 flex flex-col p-3 gap-1">
              <div className="flex items-center justify-between px-2 py-2 mb-1">
                <span className="font-bold text-sm" style={{ color: GOLD }}>Tony Admin</span>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-gray-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 min-w-0 pb-24 md:pb-6">
          {activeTab === 'orders' && <OrdersView orders={orders} />}
          {activeTab === 'analytics' && <AnalyticsView orders={orders} products={products} categories={categories} />}
          {activeTab === 'products' && <ProductsView products={products} categories={categories} />}
          {activeTab === 'settings' && <SettingsView settings={settings} />}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 md:hidden bg-[#0a0a1a]/95 backdrop-blur-md border-t border-[#1e1e3a] flex z-30">
        {navItems.map(({ tab, label, icon: Icon }) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors relative ${activeTab === tab ? '' : 'text-gray-600'}`}
            style={activeTab === tab ? { color: GOLD } : {}}>
            <Icon size={20} />
            {label}
            {tab === 'orders' && newOrdersCount > 0 && (
              <span className="absolute top-2 right-[22%] bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {newOrdersCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
