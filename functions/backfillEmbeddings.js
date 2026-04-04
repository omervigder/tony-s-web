/**
 * Standalone backfill script — run locally with:
 *   GEMINI_API_KEY=<your-key> node functions/backfillEmbeddings.js
 *
 * Requires Application Default Credentials for Firestore access:
 *   firebase login   (already done if you can deploy)
 *   gcloud auth application-default login
 */

const admin = require("firebase-admin");
const axios = require("axios");
const { FieldValue } = require("firebase-admin/firestore");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY env var is not set.");
  console.error("Usage: GEMINI_API_KEY=<your-key> node functions/backfillEmbeddings.js");
  process.exit(1);
}

// ── Init Firebase Admin with service account key ─────────────────────────────
const serviceAccount = require("../serviceAccount.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "my-store-app-14f06",
});
const db = admin.firestore();
db.settings({ databaseId: "default" });

// ── Gemini embedding helper (direct REST — avoids SDK v1beta default) ─────────
async function embedText(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  const response = await axios.post(url, {
    model: "models/gemini-embedding-001",
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  });
  return response.data.embedding.values;
}

function buildProductText(data) {
  return [
    data.name        || "",
    data.description || "",
    data.category    || "",
    data.price != null ? `מחיר: ${data.price} שקל` : "",
  ].filter(Boolean).join(". ");
}

// ── Main backfill ─────────────────────────────────────────────────────────────
async function main() {
  const snap = await db.collection("products").get();
  const docs = snap.docs;
  console.log(`Found ${docs.length} products.`);

  let success = 0, skipped = 0, failed = 0;

  for (const doc of docs) {
    const data = doc.data();
    const text = buildProductText(data);

    if (!text.trim()) {
      console.log(`  [SKIP] ${doc.id} — no embeddable text`);
      skipped++;
      continue;
    }

    try {
      const vector = await embedText(text);
      await doc.ref.update({ embeddingVector: FieldValue.vector(vector) });
      console.log(`  [OK]   ${doc.id} — ${data.name || "(no name)"} (${vector.length} dims)`);
      success++;
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`  [FAIL] ${doc.id} — ${detail}`);
      failed++;
    }

    // Small delay to avoid hitting rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone. success=${success}  skipped=${skipped}  failed=${failed}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
