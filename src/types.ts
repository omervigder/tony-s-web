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

/** One half of a product's name embroidery — the first name or the last name. */
export interface EmbroideryFieldOption {
  enabled: boolean;
  /** Surcharge in ₪ for embroidering this half. May be 0 (offered free). */
  price: number;
}

/** Name embroidery (רקמת שם) offered on a product.
 *
 *  Unlike branding, this is *not* a global catalog: every product is embroidered
 *  differently and the admin prices each one on the product itself, so the two
 *  halves live on the product document and each carries its own price. */
export interface ProductEmbroidery {
  firstName: EmbroideryFieldOption;
  lastName: EmbroideryFieldOption;
}

/** Inventory for one product.
 *
 *  Absent on the document = never tracked, always sellable — every product that
 *  predates this field has to keep selling. `tracked` and `soldOut` are separate
 *  on purpose: `soldOut` is the admin saying "not right now" (a supplier delay, a
 *  photo shoot) and survives whatever the counter says, while `tracked` is the
 *  counter actually running the shop. Read both through `isSoldOut()`. */
export interface ProductStock {
  /** Count units for this product. Off = unlimited supply. */
  tracked: boolean;
  /** Units on hand. Only consulted while `tracked`; decremented server-side when
   *  an order is paid, never by the client. */
  quantity: number;
  /** Manual override — sold out regardless of `quantity`. */
  soldOut: boolean;
}

/** When the shopper picks the gift a product grants.
 *
 *  Both modes give the same free product; they differ only in *where* the choice
 *  is made — on the product page while adding to the cart, or in the checkout
 *  summary once everything is in the basket. */
export type ProductGiftMode = 'product' | 'checkout';

/** A free gift that comes with buying a product.
 *
 *  The gifts are ordinary catalog products given at ₪0, so they carry their own
 *  cost price into the order and profit analytics stays honest. A single entry in
 *  `productIds` is granted automatically; two or more make it the shopper's
 *  choice, and they must pick one before the order can be placed. */
export interface ProductGift {
  enabled: boolean;
  mode: ProductGiftMode;
  /** Catalog product ids offered as the gift, in display order. */
  productIds: string[];
}

/** Heading the storefront puts above a product's color swatches. The wording is
 *  the data: a product embroidered in a chosen thread reads "צבע ריקמה", while a
 *  product simply offered in several colors reads "צבע". */
export type ProductColorLabel = 'צבע' | 'צבע ריקמה';

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
  /** The name/text the customer wants printed on a branded item. Collected only
   *  when the product switched `brandingNameField` on; free text, so it also
   *  keys the cart line. */
  brandingText?: string;
  /** Embroidered first/last name. The ₪ charged is captured on the line so an
   *  order still reads correctly after the product's embroidery prices change.
   *  Free text, so both also key the cart line. */
  embroideryFirstName?: { text: string; price: number };
  embroideryLastName?: { text: string; price: number };
  /** The free gift chosen for this line, when the product grants one. Ships at
   *  ₪0, so it never moves the line price — but it does key the cart line, so
   *  the same product taken twice with different gifts stays two lines. */
  selectedGift?: { id: string; name: string };
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
  /** Heading above the color swatches. Absent = 'צבע'. */
  colorLabel?: ProductColorLabel;
  lengthOptions?: ProductLengthOption[];
  brandingOptionIds?: string[];
  /** Ask the shopper for the name to put on the branding (`brandingText`).
   *  Absent/false = the branding is picked, but no name is collected. */
  brandingNameField?: boolean;
  /** Per-product name embroidery, priced per half. Absent = not offered. */
  embroidery?: ProductEmbroidery;
  /** Inventory. Absent = untracked, always sellable. */
  stock?: ProductStock;
  /** A free gift granted by buying this product. Absent = none. */
  gift?: ProductGift;
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
  /** Build-A-Box only: the catalog product the box was built on. The line's own
   *  id is synthetic, so this is what lets the box be taken off the shelf. */
  boxBaseId?: string;
  /** A gift line — the store-wide threshold gift, or one granted by a product.
   *  Charged at ₪0, and never a line the customer paid for. */
  isGift?: boolean;
  /** On a product-granted gift line: the name of the product that earned it, so
   *  whoever packs the box knows which item the freebie belongs to. */
  giftFor?: string;
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
  /** Set server-side once the order's items have been taken off the shelf —
   *  makes the stock decrement idempotent across trigger retries. */
  stock_counted?: boolean;
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
  /** Master switch for the home-page showcase. Absent = enabled — what really
   *  gates the showcase is whether `featured_product_ids` resolves to anything. */
  featured_enabled?: boolean;
  /** Products the admin wants to advertise, in display order. They are the only
   *  ones the home page shows; everything else moves behind the catalog link.
   *  Empty (or all ids stale) = the home page falls back to the full catalog. */
  featured_product_ids?: string[];
  /** Heading above the showcase strip. Absent = 'מוצרים נבחרים'. */
  featured_title?: string;
}

export interface CartItem extends Product, SelectedOptions {
  quantity: number;
  selectedVariations?: Record<string, string>;
  /** base price + length delta + branding surcharge. Absent on carts persisted before options shipped. */
  unitPrice?: number;
  bundleItems?: { id: string; name: string; price: number; quantity: number }[];
  /** Build-A-Box only: the catalog product the box was built on. A bundle line's
   *  own `id` is synthetic (`bundle_<ts>`), so this is what lets the server
   *  re-price the box from the catalog at checkout. */
  boxBaseId?: string;
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
