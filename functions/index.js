const { setGlobalOptions } = require("firebase-functions");
const { onRequest, onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ maxInstances: 10 });

const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");
const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");

/**
 * Telegram Webhook — handles messages and inline button callbacks.
 */
exports.telegramWebhook = onRequest(
  { secrets: [telegramBotToken, telegramChatId, telegramWebhookSecret] },
  async (req, res) => {
    // Verify the secret token Telegram sends in every webhook request.
    // This header is set when registering the webhook via setWebhook API.
    const incomingSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (incomingSecret !== telegramWebhookSecret.value()) {
      logger.warn("Rejected webhook: invalid secret token");
      res.status(403).send("Forbidden");
      return;
    }

    const BOT_TOKEN = telegramBotToken.value();
    const ALLOWED_CHAT_ID = String(telegramChatId.value());
    const body = req.body;

    // ── Auto-reply to any incoming message ───────────────────────────────────
    if (body.message) {
      const chatId = body.message.chat.id;
      await telegramApi(BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: "Tony Bot is Active!",
      }).catch(err => logger.error("Auto-reply error:", err));
      res.status(200).send("OK");
      return;
    }

    // ── Inline button callbacks ───────────────────────────────────────────────
    if (!body.callback_query) {
      res.status(200).send("OK");
      return;
    }

    const { id: callbackQueryId, data: callbackData, message, from } = body.callback_query;
    const chatId = String(message.chat.id);
    const messageId = message.message_id;

    // Security: only accept button presses from the authorised chat
    if (chatId !== ALLOWED_CHAT_ID) {
      logger.warn(`Rejected callback from unauthorised chat: ${chatId}`);
      await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text: "⛔ Unauthorized",
        show_alert: true,
      }).catch(() => {});
      res.status(200).send("OK");
      return;
    }

    if (typeof callbackData !== "string") {
      res.status(200).send("OK");
      return;
    }

    // ── confirm_payment ───────────────────────────────────────────────────────
    if (callbackData.startsWith("confirm_payment:")) {
      const orderId = callbackData.replace("confirm_payment:", "");
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

        // Update message buttons — remove Confirm Payment, keep Mark as Shipped
        await telegramApi(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚚 סמן כנשלח", callback_data: `mark_shipped:${orderId}` }]
            ]
          }
        });

        await telegramApi(BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `✅ *תשלום אושר להזמנה #${orderId.slice(-6)}*\nסטטוס עודכן ל־Processing`,
          parse_mode: "Markdown",
        });
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

    // ── mark_shipped ──────────────────────────────────────────────────────────
    if (callbackData.startsWith("mark_shipped:")) {
      const orderId = callbackData.replace("mark_shipped:", "");
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

        // Remove all buttons — no further actions needed
        await telegramApi(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });

        await telegramApi(BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `🚚 *הזמנה #${orderId.slice(-6)} סומנה כנשלחה*`,
          parse_mode: "Markdown",
        });
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

    // ── complete_order ────────────────────────────────────────────────────────
    if (callbackData.startsWith("complete_order:")) {
      const orderId = callbackData.replace("complete_order:", "");
      try {
        await db.collection("orders").doc(orderId).update({
          status: "בוצע",
          orderStatus: "Completed",
          completed_at: new Date().toISOString(),
        });
        logger.info(`Order ${orderId} marked as completed`);

        await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          text: "🏁 ההזמנה הושלמה!",
        });

        // Remove all buttons — order is fully complete
        await telegramApi(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });

        await telegramApi(BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `🏁 *הזמנה #${orderId.slice(-6)} הושלמה בהצלחה!*\nסטטוס עודכן ל־Completed`,
          parse_mode: "Markdown",
        });
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

    // Unknown callback — just acknowledge to clear the spinner
    await telegramApi(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQueryId }).catch(() => {});
    res.status(200).send("OK");
  }
);

/**
 * Callable function: sends a Telegram order notification.
 * Called from the frontend after an order is created in Firestore.
 * The frontend passes only the orderId — all sensitive data is read
 * server-side from Firestore, so the bot token never touches the client.
 */
exports.sendOrderNotification = onCall(
  { secrets: [telegramBotToken, telegramChatId], allowUnauthenticated: true },
  async (request) => {
    const { orderId, pickupAddress } = request.data;
    if (!orderId || typeof orderId !== "string") {
      throw new Error("Missing orderId");
    }

    const BOT_TOKEN = telegramBotToken.value();
    const CHAT_ID = telegramChatId.value();

    // Fetch the real order data from Firestore — never trust client values
    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      throw new Error("Order not found");
    }
    const order = orderSnap.data();

    // Reject if order was created more than 5 minutes ago (replay protection)
    const createdAt = new Date(order.created_at);
    if (Date.now() - createdAt.getTime() > 5 * 60 * 1000) {
      throw new Error("Order too old for notification");
    }

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

    const message =
`📦 *הזמנה חדשה! #${orderId.slice(-6)}*

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
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ אשר תשלום", callback_data: `confirm_payment:${orderId}` },
            { text: "🚚 סמן כנשלח", callback_data: `mark_shipped:${orderId}` },
          ],
          [{ text: "🏁 הושלם", callback_data: `complete_order:${orderId}` }],
          [
            { text: "📞 התקשר ללקוח", url: `tel:${order.customer_phone}` },
            { text: "💬 WhatsApp", url: whatsappLink },
          ],
        ],
      },
    });

    return { success: true };
  }
);

/**
 * Helper: calls the Telegram Bot API.
 */
async function telegramApi(botToken, method, payload) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await axios.post(url, payload);
  return response.data;
}
