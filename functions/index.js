const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ maxInstances: 10 });

const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");

/**
 * Telegram Webhook — handles messages and inline button callbacks.
 */
exports.telegramWebhook = onRequest(
  { secrets: [telegramBotToken, telegramChatId] },
  async (req, res) => {
    console.log('--- NEW MESSAGE FROM TELEGRAM ---', req.body);

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

    // ── legacy: complete_order ────────────────────────────────────────────────
    if (callbackData.startsWith("complete_order:")) {
      const orderId = callbackData.replace("complete_order:", "");
      try {
        await db.collection("orders").doc(orderId).update({
          status: "בוצע",
          orderStatus: "Completed",
          completed_at: new Date().toISOString(),
        });
        await telegramApi(BOT_TOKEN, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          text: "✅ ההזמנה עודכנה!",
        });
        await telegramApi(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });
        await telegramApi(BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "✅ ההזמנה סומנה כבוצעה במערכת",
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
 * Helper: calls the Telegram Bot API.
 */
async function telegramApi(botToken, method, payload) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await axios.post(url, payload);
  return response.data;
}
