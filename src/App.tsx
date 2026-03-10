import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, Settings as SettingsIcon, Plus, Trash2, Camera, ChevronRight, ChevronLeft, CheckCircle2, X, Menu, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, Order, Settings, CartItem } from './types';
import {
  getProductsFromFirestore,
  getProductFromFirestore,
  addProductToFirestore,
  deleteProductFromFirestore,
  getCategoriesFromFirestore,
  addCategoryToFirestore,
  deleteCategoryFromFirestore,
  uploadProductImages,
  addOrderToFirestore,
  getOrdersFromFirestore,
  getSettingsFromFirestore,
  saveSettingsToFirestore
} from './firebase';

export default function App() {
  const [view, setView] = useState<'user' | 'admin' | 'checkout' | 'success' | 'product'>('user');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<'products' | 'orders' | 'settings'>('products');
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
  const [checkoutData, setCheckoutData] = useState({ name: '', phone: '', delivery: 'pickup' as 'pickup' | 'delivery' });
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [productQuantity, setProductQuantity] = useState(1);

  // Admin Login State
  const [loginData, setLoginData] = useState({ username: '', password: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsData, categoriesData, settingsData] = await Promise.all([
        getProductsFromFirestore(),
        getCategoriesFromFirestore(),
        getSettingsFromFirestore()
      ]);
      setProducts(productsData as Product[]);
      setCategories(categoriesData as Category[]);
      if (settingsData) {
        setSettings(settingsData as Settings);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  const fetchProductDetails = async (id: string) => {
    try {
      setIsLoadingProduct(true);
      const data = await getProductFromFirestore(id);
      if (!data) throw new Error("Product not found");
      setSelectedProduct(data as Product);
      setSelectedImageIndex(0);
      setProductQuantity(1);
      setView('product');
      window.scrollTo(0, 0);
    } catch (err) {
      console.error("Error fetching product:", err);
      alert("שגיאה בטעינת פרטי המוצר");
    } finally {
      setIsLoadingProduct(false);
    }
  };

  const fetchOrders = async () => {
    const ordersData = await getOrdersFromFirestore();
    setOrders(ordersData as Order[]);
  };

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item);
      }
      return [...prev, { ...product, quantity } as CartItem];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const finalTotal = cartTotal + (checkoutData.delivery === 'delivery' ? Number(settings.delivery_cost) : 0);

  const handleCheckout = async () => {
    if (!checkoutData.name || !checkoutData.phone) return alert("נא למלא את כל השדות");

    try {
      const orderId = await addOrderToFirestore({
        customer_name: checkoutData.name,
        customer_phone: checkoutData.phone,
        delivery_method: checkoutData.delivery,
        total_price: finalTotal,
        items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }))
      });
      setLastOrderId(orderId);
      setCart([]);
      setView('success');
    } catch (err) {
      console.error("Checkout error:", err);
      alert("שגיאה בשליחת ההזמנה");
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.username === 'admin' && loginData.password === 'password123') {
      setIsAdmin(true);
      fetchOrders();
    } else {
      alert("שם משתמש או סיסמה שגויים");
    }
  };

  // Admin Actions
  const [newProduct, setNewProduct] = useState<{
    name: string;
    description: string;
    price: number;
    category_id: string;
    imageFiles: File[];
    imagePreviews: string[];
    main_image_index: number;
  }>({ name: '', description: '', price: 0, category_id: '', imageFiles: [], imagePreviews: [], main_image_index: 0 });
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.category_id) {
      return alert("נא למלא את כל השדות החובה");
    }

    try {
      setIsUploading(true);

      // Generate temp ID for storage folder
      const tempId = Date.now().toString();

      // Upload images to Firebase Storage
      let imageUrls: string[] = [];
      if (newProduct.imageFiles.length > 0) {
        imageUrls = await uploadProductImages(newProduct.imageFiles, tempId);
      }

      // Add product to Firestore
      await addProductToFirestore({
        name: newProduct.name,
        description: newProduct.description,
        price: newProduct.price,
        category_id: newProduct.category_id,
        images: imageUrls,
        main_image_index: newProduct.main_image_index
      });

      await fetchData();
      setNewProduct({ name: '', description: '', price: 0, category_id: '', imageFiles: [], imagePreviews: [], main_image_index: 0 });
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
      await deleteProductFromFirestore(id);
      await fetchData();
    } catch (err) {
      console.error("Error deleting product:", err);
      alert("שגיאה במחיקת המוצר");
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await addCategoryToFirestore(newCategoryName);
      await fetchData();
      setNewCategoryName('');
    } catch (err) {
      console.error("Error adding category:", err);
      alert("שגיאה בהוספת הקטגוריה");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteCategoryFromFirestore(id);
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
      await saveSettingsToFirestore(settings);
      alert("הגדרות נשמרו");
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("שגיאה בשמירת ההגדרות");
    }
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

  return (
    <div className="min-h-screen pb-20">
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
              החנות שלי
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
          <div className="space-y-8">
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
                      <img src={product.main_image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                    addToCart(selectedProduct, productQuantity);
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
              </div>

              <div className="border-t pt-6 space-y-2">
                <div className="flex justify-between text-gray-500">
                  <span>סיכום מוצרים:</span>
                  <span>₪{cartTotal}</span>
                </div>
                {checkoutData.delivery === 'delivery' && (
                  <div className="flex justify-between text-gray-500">
                    <span>דמי משלוח:</span>
                    <span>₪{settings.delivery_cost}</span>
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
                        <div key={c.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                          <span>{c.name}</span>
                          <button onClick={() => handleDeleteCategory(c.id)} className="text-red-400"><Trash2 size={16} /></button>
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
                        type="number" placeholder="מחיר" className="w-full p-2 rounded-lg border"
                        value={newProduct.price || ''} onChange={e => setNewProduct(prev => ({ ...prev, price: Number(e.target.value) }))}
                      />
                      <select
                        className="w-full p-2 rounded-lg border"
                        value={newProduct.category_id} onChange={e => setNewProduct(prev => ({ ...prev, category_id: e.target.value }))}
                      >
                        <option value="">בחר קטגוריה</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
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
              <div className="pastel-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-4 font-bold">מס'</th>
                        <th className="p-4 font-bold">לקוח</th>
                        <th className="p-4 font-bold">טלפון</th>
                        <th className="p-4 font-bold">פריטים</th>
                        <th className="p-4 font-bold">סה"כ</th>
                        <th className="p-4 font-bold">שיטה</th>
                        <th className="p-4 font-bold">תאריך</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orders.map(order => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="p-4">#{order.id.slice(0, 6)}</td>
                          <td className="p-4 font-medium">{order.customer_name}</td>
                          <td className="p-4">{order.customer_phone}</td>
                          <td className="p-4 text-xs">
                            {order.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                          </td>
                          <td className="p-4 font-bold text-[#ff9a9e]">₪{order.total_price}</td>
                          <td className="p-4">{order.delivery_method === 'delivery' ? 'משלוח' : 'איסוף'}</td>
                          <td className="p-4 text-gray-400 text-xs">{new Date(order.created_at).toLocaleString('he-IL')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
                  <button
                    onClick={handleSaveSettings}
                    className="w-full btn-primary"
                  >
                    שמירת הגדרות
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

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
                    <div key={item.id} className="flex gap-4 items-center">
                      <div className="w-20 h-20 rounded-2xl bg-gray-100 overflow-hidden flex-shrink-0">
                        {item.main_image && <img src={item.main_image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                      </div>
                      <div className="flex-grow">
                        <h4 className="font-bold">{item.name}</h4>
                        <p className="text-[#ff9a9e] font-bold">₪{item.price}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400"
                          >
                            <ChevronRight size={16} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, (parseInt(e.target.value) || 1) - item.quantity)}
                            className="w-12 text-center bg-transparent font-bold outline-none"
                          />
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-400"
                          >
                            <ChevronLeft size={16} />
                          </button>
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-400 transition-colors">
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
