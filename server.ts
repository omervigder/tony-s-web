import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("database.sqlite");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category_id INTEGER,
    main_image_id INTEGER,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_data TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_method TEXT NOT NULL,
    total_price REAL NOT NULL,
    items TEXT NOT NULL,
    status TEXT DEFAULT 'חדש',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed initial settings if empty
const seedSettings = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
seedSettings.run("pickup_address", "רחוב הכלנית 5, תל אביב");
seedSettings.run("delivery_cost", "30");
seedSettings.run("bit_phone", "0501234567");

// Seed initial categories and products if empty
const categoryCount = db.prepare("SELECT COUNT(*) as count FROM categories").get() as { count: number };
if (categoryCount.count === 0) {
  const insertCat = db.prepare("INSERT INTO categories (name) VALUES (?)");
  const birthdayId = insertCat.run("ימי הולדת").lastInsertRowid;
  const holidayId = insertCat.run("חגים").lastInsertRowid;
  const giftId = insertCat.run("מתנות").lastInsertRowid;

  const insertProd = db.prepare("INSERT INTO products (name, description, price, category_id) VALUES (?, ?, ?, ?)");
  const insertImg = db.prepare("INSERT INTO product_images (product_id, image_data) VALUES (?, ?)");
  const updateMainImg = db.prepare("UPDATE products SET main_image_id = ? WHERE id = ?");

  const p1 = insertProd.run("מארז יום הולדת יוקרתי", "מארז הכולל שוקולדים, יין ובלונים", 250, birthdayId).lastInsertRowid;
  const img1 = insertImg.run(p1, "https://picsum.photos/seed/birthday/800/800").lastInsertRowid;
  updateMainImg.run(img1, p1);

  const p2 = insertProd.run("עוגת שכבות מעוצבת", "עוגת שוקולד עשירה עם קרם וניל", 180, birthdayId).lastInsertRowid;
  const img2 = insertImg.run(p2, "https://picsum.photos/seed/cake/800/800").lastInsertRowid;
  updateMainImg.run(img2, p2);

  const p3 = insertProd.run("סט חג שמח", "מארז חגיגי לראש השנה", 120, holidayId).lastInsertRowid;
  const img3 = insertImg.run(p3, "https://picsum.photos/seed/holiday/800/800").lastInsertRowid;
  updateMainImg.run(img3, p3);

  const p4 = insertProd.run("דובי ענק", "דובי פרווה רך ונעים", 90, giftId).lastInsertRowid;
  const img4 = insertImg.run(p4, "https://picsum.photos/seed/bear/800/800").lastInsertRowid;
  updateMainImg.run(img4, p4);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/categories", (req, res) => {
    const categories = db.prepare("SELECT * FROM categories").all();
    res.json(categories);
  });

  app.post("/api/categories", (req, res) => {
    const { name } = req.body;
    const result = db.prepare("INSERT INTO categories (name) VALUES (?)").run(name);
    res.json({ id: result.lastInsertRowid, name });
  });

  app.delete("/api/categories/:id", (req, res) => {
    db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/products", (req, res) => {
    const products = db.prepare(`
      SELECT p.*, pi.image_data as main_image 
      FROM products p 
      LEFT JOIN product_images pi ON p.main_image_id = pi.id
    `).all();
    res.json(products);
  });

  app.get("/api/products/:id", (req, res) => {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id) as any;
    if (!product) return res.status(404).json({ error: "Product not found" });
    const images = db.prepare("SELECT * FROM product_images WHERE product_id = ?").all(req.params.id);
    res.json({ ...product, images });
  });

  app.post("/api/products", (req, res) => {
    const { name, description, price, category_id, images, main_image_index } = req.body;
    
    const transaction = db.transaction(() => {
      const result = db.prepare("INSERT INTO products (name, description, price, category_id) VALUES (?, ?, ?, ?)")
        .run(name, description, price, category_id);
      const productId = result.lastInsertRowid;

      let mainImageId = null;
      if (images && images.length > 0) {
        const insertImg = db.prepare("INSERT INTO product_images (product_id, image_data) VALUES (?, ?)");
        images.forEach((imgData: string, index: number) => {
          const imgResult = insertImg.run(productId, imgData);
          if (index === (main_image_index || 0)) {
            mainImageId = imgResult.lastInsertRowid;
          }
        });
      }

      if (mainImageId) {
        db.prepare("UPDATE products SET main_image_id = ? WHERE id = ?").run(mainImageId, productId);
      }

      return productId;
    });

    const productId = transaction();
    res.json({ id: productId });
  });

  app.delete("/api/products/:id", (req, res) => {
    db.prepare("DELETE FROM product_images WHERE product_id = ?").run(req.params.id);
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/orders", (req, res) => {
    const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
    res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items) })));
  });

  app.post("/api/orders", async (req, res) => {
    const { customer_name, customer_phone, delivery_method, total_price, items } = req.body;
    const result = db.prepare("INSERT INTO orders (customer_name, customer_phone, delivery_method, total_price, items) VALUES (?, ?, ?, ?, ?)")
      .run(customer_name, customer_phone, delivery_method, total_price, JSON.stringify(items));
    
    const orderId = result.lastInsertRowid;

    // Telegram Notification
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (botToken && chatId) {
      const message = `
📦 *הזמנה חדשה מס' ${orderId}*
👤 שם: ${customer_name}
📞 טלפון: ${customer_phone}
🚚 משלוח: ${delivery_method === 'delivery' ? 'משלוח עד הבית' : 'איסוף עצמי'}
💰 סה"כ: ₪${total_price}

🛒 *פריטים:*
${items.map((i: any) => `- ${i.name} (x${i.quantity})`).join('\n')}
      `;
      
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          })
        });
      } catch (err) {
        console.error("Telegram error:", err);
      }
    }

    res.json({ id: orderId });
  });

  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsObj = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsObj);
  });

  app.post("/api/settings", (req, res) => {
    const { pickup_address, delivery_cost, bit_phone } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("pickup_address", pickup_address);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("delivery_cost", delivery_cost);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("bit_phone", bit_phone);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
