const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ maxInstances: 10 });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

/**
 * Telegram Webhook — handles inline button callbacks from order notifications.
 *
 * Security: Telegram sends the value you passed as `secret_token` when calling
 * setWebhook in the X-Telegram-Bot-Api-Secret-Token header on every request.
 * We reject anything that doesn't match.
 */
exports.telegramWebhook = onRequest(async (req, res) => {
  // ── Security: validate secret token ──────────────────────────────────────
  const incomingSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
    logger.warn("Rejected webhook request — invalid secret token");
    res.status(403).send("Forbidden");
    return;
  }

  const body = req.body;

  // We only care about inline-button presses
  if (!body.callback_query) {
    res.status(200).send("OK");
    return;
  }

  const { id: callbackQueryId, data: callbackData, message } = body.callback_query;
  const chatId = message.chat.id;
  const messageId = message.message_id;

  if (typeof callbackData === "string" && callbackData.startsWith("complete_order:")) {
    const orderId = callbackData.replace("complete_order:", "");

    try {
      // 1. Update Firestore order status
      await db.collection("orders").doc(orderId).update({
        status: "בוצע",
        completed_at: new Date().toISOString(),
      });

      logger.info(`Order ${orderId} marked as completed`);

      // 2. Dismiss the loading spinner on the button
      await telegramApi("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text: "✅ ההזמנה עודכנה!",
      });

      // 3. Remove the inline buttons so the action can't be triggered twice
      await telegramApi("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      });

      // 4. Send a confirmation message back to the chat
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "✅ ההזמנה סומנה כבוצעה במערכת",
      });

    } catch (err) {
      logger.error("Error completing order:", err);

      // Notify the admin in Telegram that something went wrong
      await telegramApi("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text: "שגיאה בעדכון ההזמנה ❌",
        show_alert: true,
      }).catch(() => {});
    }
  } else {
    // Unknown callback — just acknowledge to clear the spinner
    await telegramApi("answerCallbackQuery", { callback_query_id: callbackQueryId }).catch(() => {});
  }

  res.status(200).send("OK");
});

/**
 * Helper: calls the Telegram Bot API using axios.
 * @param {string} method  e.g. "sendMessage"
 * @param {object} payload  request body
 */
async function telegramApi(method, payload) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const response = await axios.post(url, payload);
  return response.data;
}
