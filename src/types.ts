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
  /** The name/text the customer wants printed on a branded item. Only ever set
   *  alongside `selectedBranding`; free text, so it also keys the cart line. */
  brandingText?: string;
}

/** A price reduction on a product. `value` is a percentage (1–99) or a ₪ amount. */
export interface ProductDiscount {
  type: 'percent' | 'fixed';
  value: number;
  isActive: boolean;
  /** Optional sale name shown on the storefront, e.g. "מבצע קיץ". */
  label?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  /** List price, before any discount. Read the charged price through `effectivePrice()`. */
  price: number;
  discount?: ProductDiscount;
  costPrice?: number;
  alt_text?: string;
  category_id: string;
  main_image: string;
  images: string[];
  variations?: ProductVariation[];
  colorOptions?: ProductColorOption[];
  lengthOptions?: ProductLengthOption[];
  brandingOptionIds?: string[];
  /** Show the customer a free-text box for the name to print on this product. */
  allowBrandingName?: boolean;
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
  /** The base price the charge was built from — already discounted, if a discount applied. */
  basePrice?: number;
  /** The pre-discount list price. Present only when the line was discounted. */
  listPrice?: number;
  costPrice?: number;
  quantity: number;
  selectedVariations?: Record<string, string>;
  bundleItems?: { id: string; name: string; price: number; quantity: number }[];
  /** An automatic threshold gift. Charged at ₪0 — never a line the customer picked. */
  isGift?: boolean;
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
  /** Goods only, before discount, shipping and the greeting card. */
  subtotal?: number;
  coupon_code?: string;
  coupon_id?: string;
  coupon_type?: 'percent' | 'fixed';
  discount_amount?: number;
  /** What delivery actually cost after the free-shipping rules ran — 0 when waived. */
  shipping_cost?: number;
  /** The printed greeting-card surcharge, when the customer opted in. */
  card_cost?: number;
  /** True when the delivery fee was waived (threshold reached, or a coupon granted it). */
  free_shipping?: boolean;
  /** The automatic gift that came with this order, if the subtotal triggered one. */
  gift_item?: { id: string; name: string };
  dedication?: { message: string; cardType: 'digital' | 'printed' };
  /** Set server-side once the coupon redemption has been counted — makes counting idempotent. */
  coupon_counted?: boolean;
  customer_notes?: string;
  /** Archived orders are hidden from the admin list and excluded from analytics. */
  isArchived?: boolean;
}

/** A promotional image the admin uploads — shown on the homepage or as an arrival popup. */
export interface SiteBanner {
  id: string;
  imageUrl: string;
  placement: 'home' | 'popup';
  /** Optional click-through target. */
  linkUrl?: string;
  /** Alt text / accessible name. */
  title?: string;
  isActive: boolean;
  sortOrder: number;
  created_at?: any;
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

/** A discount code — Firestore collection `coupons`.
 *
 *  The document id **is** the uppercased code, so codes are unique by construction
 *  and the storefront can resolve one with a single `getDoc` instead of a query.
 *  Older coupons created before that convention still carry a random id; the
 *  storefront falls back to a `where('code','==',…)` lookup for those. */
export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  /** Percentage (1–100) or a ₪ amount, per `type`. May be 0 on a free-shipping-only coupon. */
  value: number;
  /** `YYYY-MM-DD`, inclusive — the code works through the end of that day. '' = never expires. */
  expiryDate: string;
  isActive: boolean;
  /** Minimum cart subtotal (goods only, before shipping). 0/absent = no minimum. */
  minOrderAmount?: number;
  /** Ceiling on a percent discount, in ₪. 0/absent = uncapped. */
  maxDiscount?: number;
  /** Total redemptions allowed across all customers. 0/absent = unlimited. */
  usageLimit?: number;
  /** Redemptions so far. Incremented server-side (`recordCouponUsage`) when an
   *  order is paid — a guest cannot write to `coupons`, so this is never client-set. */
  usageCount?: number;
  /** Waives the delivery fee, on top of any ₪ discount the code also carries. */
  freeShipping?: boolean;
  /** Admin-facing note — what the code is for, where it was published. */
  description?: string;
  created_at?: any;
}

/** The `settings/store` document — every global rule the storefront reads.
 *  Numbers are stored as strings because they come straight out of admin text
 *  inputs; read them through `readStoreRules()`, never with a bare `Number()`. */
export interface Settings {
  pickup_address: string;
  delivery_cost: string;
  bit_phone: string;
  printed_card_price?: string;
  /** Waive the delivery fee once the (post-discount) subtotal reaches the threshold. */
  free_shipping_enabled?: boolean;
  free_shipping_threshold?: string;
  /** Add a free gift once the (post-discount) subtotal reaches the threshold. */
  gift_enabled?: boolean;
  gift_threshold?: string;
  /** Product given as the gift. Its name and image are shown in the cart. */
  gift_product_id?: string;
  /** Label used when no gift product is picked (or it was deleted). */
  gift_name?: string;
  /** Minimum subtotal required to check out. '' / '0' = none. */
  min_order_amount?: string;
  /** Master switch for the coupon box at checkout. Absent = enabled. */
  coupons_enabled?: boolean;
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
