export interface ProductImage {
  id: string;
  url: string;
}

export interface ProductVariation {
  name: string;
  values: string[];
}

/** A color the product is offered in, optionally bound to one of the product's images. */
export interface ProductColorOption {
  name: string;
  hex: string;
  imageUrl?: string;
}

/** A length (אורך) option; priceDelta may be 0. */
export interface ProductLengthOption {
  label: string;
  priceDelta: number;
}

/** Global branding catalog — Firestore collection `branding_options`. */
export interface BrandingOption {
  id: string;
  label: string;
  extraCost: number;
  isActive?: boolean;
}

/** Per-line option selections, shared by CartItem and OrderItem. */
export interface SelectedOptions {
  selectedColor?: ProductColorOption;
  selectedLength?: { label: string; priceDelta: number };
  selectedBranding?: { id: string; label: string; extraCost: number };
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  costPrice?: number;
  alt_text?: string;
  category_id: string;
  main_image: string;
  images: string[];
  variations?: ProductVariation[];
  colorOptions?: ProductColorOption[];
  lengthOptions?: ProductLengthOption[];
  brandingOptionIds?: string[];
  isBoxBase?: boolean;
  created_at?: Date;
}

export interface Category {
  id: string;
  name: string;
}

export interface OrderItem extends SelectedOptions {
  id: string;
  name: string;
  /** Unit price actually charged — base price plus any length/branding surcharge. */
  price: number;
  /** The product's base price at the time of the order. */
  basePrice?: number;
  costPrice?: number;
  quantity: number;
  selectedVariations?: Record<string, string>;
  bundleItems?: { id: string; name: string; price: number; quantity: number }[];
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
  orderStatus: 'Pending' | 'PendingPayment' | 'Processing' | 'Shipped' | 'Completed' | 'Cancelled';
  isPaid: boolean;
  shippingAddress?: string;
  created_at: string;
  coupon_code?: string;
  discount_amount?: number;
  dedication?: { message: string; cardType: 'digital' | 'printed' };
  customer_notes?: string;
}

export interface Review {
  id: string;
  product_id: string;
  product_name: string;
  customer_name: string;
  rating: number;
  message: string;
  photo_url?: string;
  created_at: string;
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
  printed_card_price?: string;
}

export interface CartItem extends Product, SelectedOptions {
  quantity: number;
  selectedVariations?: Record<string, string>;
  /** base price + length delta + branding surcharge. Absent on carts persisted before options shipped. */
  unitPrice?: number;
  bundleItems?: { id: string; name: string; price: number; quantity: number }[];
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
