import React, { useState, useEffect } from 'react';
import AccessibilityWidget from './components/AccessibilityWidget';
import { ShoppingCart, Package, Settings as SettingsIcon, Plus, Trash2, Camera, ChevronRight, ChevronLeft, CheckCircle2, X, Menu, Loader2, Pencil, ChevronDown, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, Order, Settings, CartItem, Coupon, SiteContent } from './types';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, getDoc, setDoc, updateDoc, query, orderBy, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function App() {
  const [view, setView] = useState<'user' | 'admin' | 'checkout' | 'success' | 'product'>('user');
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
  const [cart, setCart] = useState<CartItem[]>([]);
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
  }>({ name: '', description: '', price: 0, costPrice: 0, alt_text: '', category_id: '', newImageFiles: [], newImagePreviews: [], variations: [] });

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
  const [loginData, setLoginData] = useState({ username: '', password: '' });

  useEffect(() => {
    fetchData();
  }, []);

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

  const fetchProductDetails = (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    setSelectedProduct(product);
    setSelectedImageIndex(0);
    setProductQuantity(1);
    setSelectedVariations({});
    setView('product');
    window.scrollTo(0, 0);
  };

  const fetchOrders = async () => {
    const ordersQuery = query(collection(db, "orders"), orderBy("created_at", "desc"));
    const ordersSnapshot = await getDocs(ordersQuery);
    const ordersData = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
    setOrders(ordersData);
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

  const sendTelegramNotification = async (order: {
    orderId: string;
    name: string;
    phone: string;
    email: string;
    deliveryMethod: 'pickup' | 'delivery';
    shippingAddress: string;
    items: { name: string; price: number; quantity: number; selectedVariations?: Record<string, string> }[];
    total: number;
    pickupAddress: string;
    dedication?: { message: string; cardType: 'digital' | 'printed' };
    customerNotes?: string;
  }) => {
    const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const whatsappPhone = order.phone.replace(/^0/, '');
    const whatsappLink = `https://wa.me/972${whatsappPhone}`;
    const deliveryLine = order.deliveryMethod === 'delivery'
      ? `🚚 משלוח — ${order.shippingAddress}`
      : `📍 איסוף עצמי: ${order.pickupAddress}`;
    const itemsList = order.items
      .map(i => {
        let line = `• ${i.name} x${i.quantity} — ₪${(i.price * i.quantity).toFixed(2)}`;
        if (i.selectedVariations && Object.keys(i.selectedVariations).length > 0) {
          const vars = Object.entries(i.selectedVariations).map(([k, v]) => `${k}: ${v}`).join(', ');
          line += `\n  🎨 ${vars}`;
        }
        return line;
      })
      .join('\n');

    const dedicationLine = order.dedication?.message
      ? `\n\n💌 *הקדשה:* ${order.dedication.message}\n🃏 *סוג כרטיס:* ${order.dedication.cardType === 'printed' ? 'מודפס' : 'דיגיטלי'}`
      : '';
    const notesLine = order.customerNotes ? `\n\n📝 *הערות:* ${order.customerNotes}` : '';

    const message =
`📦 *הזמנה חדשה! #${order.orderId.slice(-6)}*

👤 *שם:* ${order.name}
📞 *טלפון:* ${order.phone}${order.email ? `\n📧 *אימייל:* ${order.email}` : ''}
${deliveryLine}

🛒 *פריטים:*
${itemsList}

💰 *סה"כ לתשלום: ₪${order.total.toFixed(2)}*
💳 *סטטוס תשלום:* ממתין לאישור${dedicationLine}${notesLine}

💬 [שלח WhatsApp ללקוח](${whatsappLink})`;

    const body = {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ אשר תשלום', callback_data: `confirm_payment:${order.orderId}` },
            { text: '🚚 סמן כנשלח', callback_data: `mark_shipped:${order.orderId}` },
          ],
          [
            { text: '📞 התקשר ללקוח', url: `tel:${order.phone}` },
            { text: '💬 WhatsApp', url: whatsappLink },
          ]
        ]
      }
    };

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

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
      setCart([]);
      setAppliedCoupon(null);
      setCouponInput('');
      setCheckoutData({ name: '', phone: '', email: '', delivery: 'pickup', shippingAddress: '' });
      setDedication({ message: '', cardType: 'digital' });
      setCustomerNotes('');
      setView('success');

      // Fire-and-forget — notification failure must not affect UX
      sendTelegramNotification({
        orderId: orderDoc.id,
        name: checkoutData.name,
        phone: checkoutData.phone,
        email: checkoutData.email,
        deliveryMethod: checkoutData.delivery,
        shippingAddress: checkoutData.shippingAddress,
        items: orderItems,
        total: finalTotal,
        pickupAddress: settings.pickup_address,
        dedication: dedicationData,
        customerNotes: customerNotes.trim() || undefined,
      }).catch(err => console.error("Telegram notification error:", err));
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

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const adminUser = import.meta.env.VITE_ADMIN_USERNAME;
    const adminPass = import.meta.env.VITE_ADMIN_PASSWORD;
    if (loginData.username === adminUser && loginData.password === adminPass) {
      setIsAdmin(true);
      fetchOrders();
    } else {
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
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('user')}>
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
            <button onClick={() => setView('user')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800">
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
          </div>
        )}

        {view === 'checkout' && (
          <div className="max-w-md mx-auto space-y-8">
            <button onClick={() => setView('user')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800">
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
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  💌 הקדשה אישית <span className="text-sm font-normal text-gray-400">(אופציונלי)</span>
                </h3>
                <textarea
                  placeholder="כתוב כאן את ההקדשה שלך..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#ff9a9e] focus:border-transparent outline-none resize-none text-sm"
                  value={dedication.message}
                  onChange={e => setDedication(prev => ({ ...prev, message: e.target.value }))}
                />
                {dedication.message.trim() && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setDedication(prev => ({ ...prev, cardType: 'digital' }))}
                      className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-all ${dedication.cardType === 'digital' ? 'bg-[#ff9a9e] text-white border-[#ff9a9e]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#ff9a9e]'}`}
                    >
                      📱 כרטיס דיגיטלי (חינם)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDedication(prev => ({ ...prev, cardType: 'printed' }))}
                      className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-all ${dedication.cardType === 'printed' ? 'bg-[#ff9a9e] text-white border-[#ff9a9e]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#ff9a9e]'}`}
                    >
                      🖨️ כרטיס מודפס (+₪{settings.printed_card_price || 15})
                    </button>
                  </div>
                )}
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
              href={`https://bitpay.co.il/app/pay?phone=${settings.bit_phone}&amount=${finalTotal}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-[#00b0ff] text-white py-4 rounded-2xl font-bold text-xl shadow-lg hover:bg-[#0091ea] transition-all"
            >
              שלם ב-Bit ₪{finalTotal}
            </a>
            <button onClick={() => setView('user')} className="text-gray-400 hover:text-gray-600">חזרה לדף הבית</button>
          </div>
        )}

        {view === 'admin' && !isAdmin && (
          <div className="max-w-md mx-auto space-y-8">
            <h2 className="text-2xl font-bold text-center">כניסת מנהל</h2>
            <form onSubmit={handleAdminLogin} className="pastel-card p-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם משתמש</label>
                <input
                  type="text"
                  className="w-full p-3 rounded-xl border-gray-200 border outline-none focus:ring-2 focus:ring-[#a1c4fd]"
                  value={loginData.username}
                  onChange={e => setLoginData(prev => ({ ...prev, username: e.target.value }))}
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
              <button onClick={() => setIsAdmin(false)} className="text-red-400 hover:text-red-600">התנתקות</button>
            </div>

            <div className="flex gap-4 border-b">
              <button
                onClick={() => setAdminTab('products')}
                className={`pb-4 px-4 transition-all ${adminTab === 'products' ? 'border-b-2 border-[#ff9a9e] text-[#ff9a9e] font-bold' : 'text-gray-400'}`}
              >
                מוצרים וקטגוריות
              </button>
              <button
                onClick={() => { setAdminTab('orders'); fetchOrders(); }}
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
                            setEditProductData({ name: p.name, description: p.description, price: p.price, costPrice: p.costPrice ?? 0, alt_text: p.alt_text ?? '', category_id: p.category_id, newImageFiles: [], newImagePreviews: [], variations: (p.variations || []).map(v => ({ name: v.name, values: v.values.join(', ') })) });
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
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{orders.length} הזמנות</h3>
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

            {adminTab === 'analytics' && (() => {
              const paidOrders = orders.filter(o => o.isPaid === true);
              const totalOrders = paidOrders.length;
              const totalRevenue = paidOrders.reduce((sum, o) => sum + o.total_price, 0);
              const totalCost = paidOrders.reduce((sum, order) =>
                sum + order.items.reduce((iSum, item) => {
                  const product = products.find(p => p.id === item.id);
                  return iSum + (item.costPrice ?? product?.costPrice ?? 0) * item.quantity;
                }, 0), 0);
              const netProfit = totalRevenue - totalCost;
              const pendingPayment = orders.filter(o => !o.isPaid).length;
              return (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold">דשבורד אנליטיקס</h3>
                  <p className="text-sm text-gray-400">מבוסס על הזמנות שאושר תשלומן בלבד</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="pastel-card p-6 space-y-2">
                      <p className="text-sm text-gray-500">הזמנות ששולמו</p>
                      <p className="text-3xl font-bold text-gray-800">{totalOrders}</p>
                      <p className="text-xs text-yellow-600">{pendingPayment} ממתינות לתשלום</p>
                    </div>
                    <div className="pastel-card p-6 space-y-2">
                      <p className="text-sm text-gray-500">הכנסות ברוטו</p>
                      <p className="text-3xl font-bold text-[#ff9a9e]">₪{totalRevenue.toFixed(2)}</p>
                    </div>
                    <div className="pastel-card p-6 space-y-2">
                      <p className="text-sm text-gray-500">עלויות</p>
                      <p className="text-3xl font-bold text-red-400">₪{totalCost.toFixed(2)}</p>
                    </div>
                    <div className="pastel-card p-6 space-y-2">
                      <p className="text-sm text-gray-500">רווח נקי</p>
                      <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>₪{netProfit.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="pastel-card p-6">
                    <h4 className="font-bold mb-4">התפלגות סטטוסי הזמנות</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      {(['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'] as const).map(status => {
                        const count = orders.filter(o => (o.orderStatus ?? 'Pending') === status).length;
                        const colors: Record<string, string> = { Pending: 'bg-yellow-100 text-yellow-700', Processing: 'bg-blue-100 text-blue-700', Shipped: 'bg-purple-100 text-purple-700', Completed: 'bg-green-100 text-green-700', Cancelled: 'bg-red-100 text-red-700' };
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
            })()}

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
                  onClick={() => { setSelectedCategory(null); setIsMenuOpen(false); setView('user'); }}
                  className={`w-full text-right px-6 py-4 rounded-2xl transition-all font-bold ${!selectedCategory ? 'bg-[#ff9a9e]/10 text-[#ff9a9e]' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                  הכל
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => { setSelectedCategory(cat.id); setIsMenuOpen(false); setView('user'); }}
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
                    onClick={() => { setIsCartOpen(false); setView('checkout'); }}
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
    </div>
  );
}
