export interface ProductImage {
  id: string;
  url: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  costPrice?: number;
  category_id: string;
  main_image: string;
  images: string[];
  created_at?: Date;
}

export interface Category {
  id: string;
  name: string;
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_method: 'pickup' | 'delivery';
  total_price: number;
  items: OrderItem[];
  status: string;
  orderStatus: 'Pending' | 'Processing' | 'Shipped' | 'Completed' | 'Cancelled';
  isPaid: boolean;
  shippingAddress?: string;
  created_at: string;
  coupon_code?: string;
  discount_amount?: number;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  expiryDate: string;
  isActive: boolean;
}

export interface Settings {
  pickup_address: string;
  delivery_cost: string;
  bit_phone: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface SiteContent {
  storeName: string;
  announcementBar: string;
  heroTitle: string;
  heroSubtitle: string;
  collectionsTitle: string;
  aboutTitle: string;
  contactTitle: string;
  seoDescription: string;
}
