const { setGlobalOptions } = require("firebase-functions");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();
// Data lives in the named database "default" (not the standard "(default)")
const db = admin.app().firestore();
db.settings({ databaseId: "default" });

setGlobalOptions({ maxInstances: 10 });

const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");
const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// ── Helper: normalize Israeli phone to 05XXXXXXXX ─────────────────────────────
function normalizePhone(phone) {
  let p = (phone || '').replace(/[\s\-().+]/g, '');
  if (p.startsWith('972')) p = '0' + p.slice(3);
  return p;
}

// ── Helper: upsert customer CRM record ───────────────────────────────────────
async function upsertCustomer(order) {
  const normalizedPhone = normalizePhone(order.customer_phone);
  if (!normalizedPhone) return 1;
  const orderTotal = Number(order.total_price) || 0;
  const now = new Date().toISOString();
  const customerRef = db.collection('customers').doc(normalizedPhone);
  const snap = await customerRef.get();
  if (snap.exists) {
    const newTotal = (snap.data().totalOrders || 0) + 1;
    await customerRef.update({
      totalOrders: admin.firestore.FieldValue.increment(1),
      totalSpend: admin.firestore.FieldValue.increment(orderTotal),
      lastOrderDate: now,
      name: order.customer_name,
      ...(order.customer_email ? { email: order.customer_email } : {}),
    });
    return newTotal;
  } else {
    await customerRef.set({
      name: order.customer_name,
      phone: order.customer_phone,
      normalizedPhone,
      ...(order.customer_email ? { email: order.customer_email } : {}),
      totalOrders: 1,
      totalSpend: orderTotal,
      firstOrderDate: now,
      lastOrderDate: now,
    });
    return 1;
  }
}

// ── Shared: build and send order notification to Telegram ─────────────────────
async function sendOrderToTelegram(orderId, order, pickupAddress, BOT_TOKEN, CHAT_ID, totalOrders = 1) {
  const items = Array.isArray(order.items) ? order.items : [];
  const whatsappPhone = (order.customer_phone || "").replace(/^0/, "");
  const whatsappLink = `https://wa.me/972${whatsappPhone}`;

  const deliveryLine = order.delivery_method === "delivery"
    ? `🚚 משלוח — ${order.shippingAddress || ""}`
    : `📍 איסוף עצמי: ${pickupAddress || ""}`;

  const itemsList = items
    .map(i => {
      let line = `• ${i.name} x${i.quantity} — ₪${(i.price * i.quantity).toFixed(2)}`;
      if (i.selectedVariations && Object.keys(i.selectedVariations).length > 0) {
        const vars = Object.entries(i.selectedVariations).map(([k, v]) => `${k}: ${v}`).join(", ");
        line += `\n  🎨 ${vars}`;
      }
      return line;
    })
    .join("\n");

  const dedicationLine = order.dedication?.message
    ? `\n\n💌 *הקדשה:* ${order.dedication.message}\n🃏 *סוג כרטיס:* ${order.dedication.cardType === "printed" ? "מודפס" : "דיגיטלי"}`
    : "";
  const notesLine = order.customer_notes ? `\n\n📝 *הערות:* ${order.customer_notes}` : "";

  const returningBadge = totalOrders > 1
    ? `⭐ *לקוח חוזר! (הזמנה ${totalOrders})*\n\n`
    : '';

  const message =
`${returningBadge}📦 *הזמנה חדשה! #${orderId.slice(-6)}*

👤 *שם:* ${order.customer_name}
📞 *טלפון:* ${order.customer_phone}${order.customer_email ? `\n📧 *אימייל:* ${order.customer_email}` : ""}
${deliveryLine}

🛒 *פריטים:*
${itemsList}

💰 *סה"כ לתשלום: ₪${Number(order.total_price).toFixed(2)}*
💳 *סטטוס תשלום:* ממתין לאישור${dedicationLine}${notesLine}

💬 [שלח WhatsApp ללקוח](${whatsappLink})`;

  await telegramApi(BOT_TOKEN, "sendMessage", {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ שולם",   callback_data: `status_paid:${orderId}` },
          { text: "🚚 נשלח",   callback_data: `status_shipped:${orderId}` },
          { text: "📦 הושלם",  callback_data: `status_completed:${orderId}` },
        ],
        [
          { text: "💬 WhatsApp",    url: whatsappLink },
        ],
      ],
    },
  });
}

// ── Firestore trigger — fires automatically when a new order document is created
exports.onOrderCreated = onDocumentCreated(
  { document: "orders/{orderId}", database: "default", secrets: [telegramBotToken, telegramChatId] },
  async (event) => {
    const orderId = event.params.orderId;
    // Data comes directly from the trigger — document is guaranteed to exist
    const order = event.data.data();

    const BOT_TOKEN = telegramBotToken.value();
    const CHAT_ID = telegramChatId.value();

    // Read pickup address from settings (only needed for pickup orders)
    let pickupAddress = "";
    if (order.delivery_method !== "delivery") {
      try {
        const settingsSnap = await db.collection("settings").doc("store").get();
        if (settingsSnap.exists) pickupAddress = settingsSnap.data().pickup_address || "";
      } catch (e) {
        logger.warn("Could not read pickup_address from settings:", e);
      }
    }

    let totalOrders = 1;
    try {
      totalOrders = await upsertCustomer(order);
      logger.info(`Customer upserted for order ${orderId}, totalOrders=${totalOrders}`);
    } catch (err) {
      logger.warn(`Could not upsert customer for order ${orderId}:`, err);
    }

    try {
      await sendOrderToTelegram(orderId, order, pickupAddress, BOT_TOKEN, CHAT_ID, totalOrders);
      logger.info(`Telegram notification sent for order ${orderId}`);
    } catch (err) {
      logger.error(`Failed to send Telegram notification for order ${orderId}:`, err);
    }
  }
);

// ── Telegram Webhook — handles inline button callbacks ────────────────────────
exports.telegramWebhook = onRequest(
  { secrets: [telegramBotToken, telegramChatId, telegramWebhookSecret] },
  async (req, res) => {
    // Verify the secret token Telegram sends in every webhook request
    const incomingSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (incomingSecret !== telegramWebhookSecret.value()) {
      logger.warn("Rejected webhook: invalid secret token");
      res.status(403).send("Forbidden");
      return;
    }

    const BOT_TOKEN = telegramBotToken.value();
    const ALLOWED_CHAT_ID = String(telegramChatId.value());
    const body = req.body;

    // ── Auto-reply to any incoming text message ───────────────────────────────
    if (body.message) {
      const chatId = body.message.chat.id;
      await telegramApi(BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: "Tony Bot פעיל ✅",
      }).catch(err => logger.error("Auto-reply error:", err));
      res.status(200).send("OK");
      return;
    }

    // ── Inline button callbacks ───────────────────────────────────────────────
    if (!body.callback_query) {
      res.status(200).send("OK");
      return;
    }

    const { id: callbackQueryId, data: callbackData, message } = body.callback_query;
    const chatId = String(message.chat.id);
    const messageId = message.message_id;

    // Security: only accept button presses from the authorised chat
    if (chatId !== ALLOWED_CHAT_ID) {
      logger.warn(`Rejected callback from unauthorised chat: ${chatId}`);
      await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text: "⛔ אין לך הרשאה לבצע פעולה זו!",
        show_alert: true,
      }).catch(() => {});
      res.status(200).send("OK");
      return;
    }

    if (typeof callbackData !== "string") {
      res.status(200).send("OK");
      return;
    }

    // ── status_paid ───────────────────────────────────────────────────────────
    if (callbackData.startsWith("status_paid:")) {
      const orderId = callbackData.replace("status_paid:", "");
      try {
        await db.collection("orders").doc(orderId).update({
          isPaid: true,
          orderStatus: "Processing",
          status: "בטיפול",
          paid_at: new Date().toISOString(),
        });
        logger.info(`Order ${orderId} marked as paid`);

        await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          text: "✅ תשלום אושר!",
        });

        // Update message — remove paid button, keep the rest
        await telegramApi(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ שולם ✓", callback_data: "noop" },
                { text: "🚚 נשלח",   callback_data: `status_shipped:${orderId}` },
                { text: "📦 הושלם",  callback_data: `status_completed:${orderId}` },
              ],
            ],
          },
        }).catch(() => {}); // non-critical
      } catch (err) {
        logger.error("Error confirming payment:", err);
        await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          text: "שגיאה באישור תשלום ❌",
          show_alert: true,
        }).catch(() => {});
      }
      res.status(200).send("OK");
      return;
    }

    // ── status_shipped ────────────────────────────────────────────────────────
    if (callbackData.startsWith("status_shipped:")) {
      const orderId = callbackData.replace("status_shipped:", "");
      try {
        await db.collection("orders").doc(orderId).update({
          orderStatus: "Shipped",
          status: "נשלח",
          shipped_at: new Date().toISOString(),
        });
        logger.info(`Order ${orderId} marked as shipped`);

        await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          text: "🚚 ההזמנה סומנה כנשלחה!",
        });

        await telegramApi(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🚚 נשלח ✓",  callback_data: "noop" },
                { text: "📦 הושלם",   callback_data: `status_completed:${orderId}` },
              ],
            ],
          },
        }).catch(() => {});
      } catch (err) {
        logger.error("Error marking as shipped:", err);
        await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          text: "שגיאה בעדכון ❌",
          show_alert: true,
        }).catch(() => {});
      }
      res.status(200).send("OK");
      return;
    }

    // ── status_completed ──────────────────────────────────────────────────────
    if (callbackData.startsWith("status_completed:")) {
      const orderId = callbackData.replace("status_completed:", "");
      try {
        await db.collection("orders").doc(orderId).update({
          status: "בוצע",
          orderStatus: "Completed",
          completed_at: new Date().toISOString(),
        });
        logger.info(`Order ${orderId} marked as completed`);

        await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          text: "📦 ההזמנה הושלמה!",
        });

        // Remove all buttons — order is fully complete
        await telegramApi(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        }).catch(() => {});
      } catch (err) {
        logger.error("Error completing order:", err);
        await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          text: "שגיאה בעדכון ההזמנה ❌",
          show_alert: true,
        }).catch(() => {});
      }
      res.status(200).send("OK");
      return;
    }

    // Unknown callback / noop — just acknowledge to clear the spinner
    await telegramApi(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQueryId }).catch(() => {});
    res.status(200).send("OK");
  }
);

// ── Helper: Telegram Bot API ──────────────────────────────────────────────────
async function telegramApi(botToken, method, payload) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await axios.post(url, payload);
  return response.data;
}

// ── Helper: build embeddable text from a product document ────────────────────
function buildProductText(data) {
  return [
    data.name        || "",
    data.description || "",
    data.category    || "",
    data.price != null ? `מחיר: ${data.price} שקל` : "",
  ].filter(Boolean).join(". ");
}

// ── Helper: call Gemini gemini-embedding-001 and return the float array ─────────
async function embedText(apiKey, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const response = await axios.post(url, {
    model: "models/gemini-embedding-001",
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  });
  return response.data.embedding.values; // float[]
}

// ── Firestore trigger — auto-embed whenever a product is created or updated ───
exports.generateProductEmbedding = onDocumentWritten(
  { document: "products/{productId}", database: "default", secrets: [geminiApiKey] },
  async (event) => {
    // Document deleted — nothing to embed
    if (!event.data.after.exists) return;

    const newData = event.data.after.data();
    const oldData = event.data.before.exists ? event.data.before.data() : null;

    // Skip if only embeddingVector changed (prevents infinite loop)
    const contentFields = ["name", "description", "category", "price"];
    if (oldData) {
      const hasContentChange = contentFields.some(f => oldData[f] !== newData[f]);
      if (!hasContentChange) {
        logger.info(`Product ${event.params.productId}: no content change, skipping embedding`);
        return;
      }
    }

    const text = buildProductText(newData);
    if (!text.trim()) {
      logger.warn(`Product ${event.params.productId}: empty text, skipping embedding`);
      return;
    }

    try {
      const embedding = await embedText(geminiApiKey.value(), text);
      await db.collection("products").doc(event.params.productId).update({
        embeddingVector: FieldValue.vector(embedding),
      });
      logger.info(`Product ${event.params.productId}: embedding stored (${embedding.length} dims)`);
    } catch (err) {
      logger.error(`Product ${event.params.productId}: embedding failed`, err);
    }
  }
);

// ── HTTP endpoint — one-time backfill for all existing products ───────────────
// Call once: POST /backfillProductEmbeddings  (protected by Firebase App Check
// or run manually via the Firebase console / curl with a valid ID token)
exports.backfillProductEmbeddings = onRequest(
  { secrets: [geminiApiKey], timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    // Simple method guard — only allow POST to reduce accidental runs
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed — use POST");
      return;
    }

    const API_KEY = geminiApiKey.value();
    const snapshot = await db.collection("products").get();
    const docs = snapshot.docs;

    logger.info(`Backfill: processing ${docs.length} products`);

    let success = 0;
    let skipped = 0;
    let failed  = 0;

    for (const doc of docs) {
      const data = doc.data();
      const text = buildProductText(data);

      if (!text.trim()) {
        skipped++;
        continue;
      }

      try {
        const embedding = await embedText(API_KEY, text);
        await db.collection("products").doc(doc.id).update({
          embeddingVector: FieldValue.vector(embedding),
        });
        success++;
        logger.info(`Backfill: embedded product ${doc.id}`);
      } catch (err) {
        failed++;
        logger.error(`Backfill: failed product ${doc.id}`, err);
      }

      // Small delay to stay within Gemini free-tier rate limits (60 RPM)
      await new Promise(r => setTimeout(r, 1100));
    }

    res.json({
      total: docs.length,
      success,
      skipped,
      failed,
    });
  }
);

// ── Callable — AI Gift Assistant ──────────────────────────────────────────────
exports.askGiftAssistant = onCall(
  { secrets: [geminiApiKey], cors: true },
  async (request) => {
    const { query } = request.data;
    if (!query || typeof query !== "string" || !query.trim()) {
      throw new HttpsError("invalid-argument", "query is required");
    }

    // Validate secret is available before doing any work
    const API_KEY = geminiApiKey.value();
    if (!API_KEY) {
      logger.error("GEMINI_API_KEY secret is empty or not bound to this function");
      throw new HttpsError("internal", "Server configuration error — API key missing");
    }

    try {
      // 1. Embed the user's query
      logger.info(`askGiftAssistant: embedding query "${query.trim()}"`);
      const queryEmbedding = await embedText(API_KEY, query.trim());

      // 2. Vector similarity search — top 3 products
      logger.info("askGiftAssistant: running vector search");
      const vectorQuery = db.collection("products").findNearest({
        vectorField: "embeddingVector",
        queryVector: FieldValue.vector(queryEmbedding),
        limit: 3,
        distanceMeasure: "COSINE",
      });
      const snap = await vectorQuery.get();

      if (snap.empty) {
        return { answer: "לא מצאתי מוצרים מתאימים כרגע. נסה לפרט יותר.", products: [] };
      }

      const foundProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 3. Build LLM prompt with product context
      const productContext = foundProducts
        .map((p, i) => `${i + 1}. ${p.name} — ₪${p.price}. ${p.description || ""}`)
        .join("\n");

      logger.info("askGiftAssistant: calling gemini-2.5-flash");
      const genAI = new GoogleGenerativeAI(API_KEY);
      const chatModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction:
          "את יועצת מתנות של טוני — חנות מתנות יוקרתית ובוטיקית. " +
          "כתבי בעברית טבעית, קצרה ואלגנטית. " +
          "חל איסור מוחלט על שימוש ב-Markdown: אין כוכביות (** או *), אין תגי # ואין רשימות. " +
          "פתחי במשפט אחד קצר ועל ידידותי. " +
          "לכל מוצר — משפט אחד בלבד שמסביר בצורה שיחותית למה הוא מתאים. " +
          "אל תציינו מחירים. אל תחזרי על שם המוצר המדויק — התייחסי אליו בטבעיות. " +
          "השתמשי באמוג׳י ✨ 🎁 💝 👇 במקום עיצוב טקסט. " +
          "הכרטיסיות של המוצרים מוצגות אוטומטית מתחת להודעה — אין צורך לפרט.",
      });

      const chatResult = await chatModel.generateContent(
        `בקשת הלקוח: "${query}"\n\nמוצרים רלוונטיים:\n${productContext}\n\nהמלצי עליהם בצורה טבעית וקצרה.`
      );

      return {
        answer: chatResult.response.text(),
        products: foundProducts.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          main_image: p.main_image || null,
        })),
      };
    } catch (err) {
      // Log the full error so it's visible in Firebase console
      logger.error("askGiftAssistant internal error:", err?.message ?? err, { stack: err?.stack });
      // Re-throw HttpsErrors as-is; wrap everything else into a structured response
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", `Gift assistant error: ${err?.message ?? "unknown"}`);
    }
  }
);
