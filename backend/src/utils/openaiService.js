/**
 * OpenAI (GPT-4o / GPT-4o-mini) — the app's only AI provider. This module owns the
 * transport (auth, request shape, retries at the caller's level); the prompts and the
 * response normalization live in aiService, which is what the rest of the app calls.
 */

const {
  normalizeBillData,
  getOcrTextPrompt,
  getVisionMetadataPrompt,
  getVisionItemsPrompt,
  mergeParsedBill,
  parseJsonResponse,
  reconcileItemPasses,
} = require('./aiService');

const API_URL = 'https://api.openai.com/v1/chat/completions';
// gpt-4.1-mini benchmarks better than gpt-4o on this workload (dense batch/expiry columns
// in small print) at roughly a sixth of the cost — see the bench note in .env.example.
// gpt-4o-mini is NOT a substitute: it misreads the QTY column badly on these invoices.
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
const MAX_LOG_CHARS = Number(process.env.OPENAI_LOG_MAX_CHARS || 20000);

/**
 * The OCR hint is pasted into every vision prompt, so a long hint is paid for once per
 * pass. Cap it — the hint only has to be good enough to disambiguate characters the
 * model is already looking at in the image.
 */
const MAX_HINT_CHARS = Number(process.env.OPENAI_VISION_HINT_MAX_CHARS || 4000);

/**
 * Item-table double-read mode:
 *   'auto'   — second pass only when the first read looks shaky (default)
 *   'always' — previous behaviour: always read twice
 *   'never'  — single read, no reconciliation
 */
const DOUBLE_READ_MODE = (process.env.OPENAI_ITEM_DOUBLE_READ || 'auto').toLowerCase();

// USD per 1M tokens. Only used for the cost figures in the logs — update these (or the
// env overrides) if OpenAI's published pricing moves.
const PRICING = {
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
};
const FALLBACK_PRICE = {
  in: Number(process.env.OPENAI_PRICE_IN || 2.5),
  out: Number(process.env.OPENAI_PRICE_OUT || 10),
};
const USD_TO_INR = Number(process.env.USD_TO_INR || 88);

function priceFor(model) {
  const name = String(model || '');
  // Longest prefix wins — "gpt-4o-mini" must not match the "gpt-4o" entry.
  const key = Object.keys(PRICING)
    .filter((m) => name.startsWith(m))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICING[key] : FALLBACK_PRICE;
}

function truncateForLog(value, maxChars = MAX_LOG_CHARS) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

/** Trim the hint from the middle: the header and the totals block are the useful ends. */
function capHint(hint) {
  const text = String(hint || '').trim();
  if (text.length <= MAX_HINT_CHARS) return text;
  const half = Math.floor(MAX_HINT_CHARS / 2);
  console.log(`[OpenAIService] OCR hint ${text.length} chars — trimming to ${MAX_HINT_CHARS} for the vision prompts`);
  return `${text.slice(0, half)}\n...[hint trimmed]...\n${text.slice(-half)}`;
}

function estimateCost(usage, model) {
  const price = priceFor(model);
  const inTok = usage?.prompt_tokens || 0;
  const outTok = usage?.completion_tokens || 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens || 0;
  // Cached input bills at half rate on OpenAI.
  const usd = ((inTok - cached) * price.in + cached * price.in * 0.5 + outTok * price.out) / 1e6;
  return { inTok, outTok, cached, usd, inr: usd * USD_TO_INR };
}

async function chatCompletion(messages, model, maxTokens = 4096, temperature = 0, label = 'call') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI is not configured. Set OPENAI_API_KEY in .env');
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${truncateForLog(body?.error || body)}`);
  }

  const cost = estimateCost(body.usage, model);
  console.log(
    `[OpenAIService] $$ ${label} (${model}): in=${cost.inTok} (cached ${cost.cached}) out=${cost.outTok} ` +
    `≈ $${cost.usd.toFixed(4)} / ₹${cost.inr.toFixed(2)}`
  );

  return { content: body.choices?.[0]?.message?.content || '', cost };
}

/**
 * Does a single item-table read need a second opinion? A confirmation pass costs as much
 * as the first read, so only spend it when the first read actually signals trouble:
 * self-reported uncertainty, a missing critical field, or broken row numbering.
 */
function needsConfirmationPass(items) {
  if (!Array.isArray(items) || items.length === 0) return true;

  const shaky = items.some((it, i) => (
    it?._uncertain_batchNumber ||
    it?._uncertain_expiryDate ||
    it?._uncertain_quantity ||
    it?._uncertain_freeQuantity ||
    it?._uncertain_rate ||
    !it?.name ||
    it?.quantity == null ||
    // Row numbering that doesn't march 1,2,3... is the classic row-shift symptom.
    (it?.sn != null && Number(it.sn) !== i + 1)
  ));

  if (shaky) {
    console.log('[OpenAIService] First item read flagged uncertainty — spending a confirmation pass');
  } else {
    console.log(`[OpenAIService] First item read is clean across ${items.length} rows — skipping the confirmation pass`);
  }
  return shaky;
}

/**
 * Parse bill image with vision: a metadata pass, then the item-table pass. The item table
 * is read a second time and reconciled — so disagreements surface as needsReview instead
 * of silently picking one possibly-wrong value — but only when the first read looks
 * shaky, since that second read doubles the cost of the most expensive call in the scan.
 * Set OPENAI_ITEM_DOUBLE_READ=always to restore the unconditional double read.
 */
async function parseImageWithOpenAIVision(base64Image, mimeType = 'image/jpeg', ocrTextHint = '') {
  const hint = capHint(ocrTextHint);
  const imagePart = {
    type: 'image_url',
    image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' },
  };
  const costs = [];

  console.log(`[OpenAIService] Sending image to OpenAI Vision (${VISION_MODEL}) metadata pass...`);
  const metadataRes = await chatCompletion(
    [
      {
        role: 'user',
        content: [{ type: 'text', text: getVisionMetadataPrompt(hint) }, imagePart],
      },
    ],
    VISION_MODEL,
    4096,
    0,
    'metadata pass'
  );
  costs.push(metadataRes.cost);
  console.log(`[OpenAIService] Metadata pass response:\n${truncateForLog(metadataRes.content)}`);
  const metadata = parseJsonResponse(metadataRes.content);

  const itemsMessages = [
    {
      role: 'user',
      content: [{ type: 'text', text: getVisionItemsPrompt(hint) }, imagePart],
    },
  ];

  console.log(`[OpenAIService] Sending image to OpenAI Vision (${VISION_MODEL}) item-table pass (mode: ${DOUBLE_READ_MODE})...`);
  let reconciledItems;

  if (DOUBLE_READ_MODE === 'always') {
    const [resA, resB] = await Promise.all([
      chatCompletion(itemsMessages, VISION_MODEL, 8192, 0, 'items pass A'),
      chatCompletion(itemsMessages, VISION_MODEL, 8192, 0, 'items pass B'),
    ]);
    costs.push(resA.cost, resB.cost);
    console.log(`[OpenAIService] Item-table pass A response:\n${truncateForLog(resA.content)}`);
    console.log(`[OpenAIService] Item-table pass B response:\n${truncateForLog(resB.content)}`);
    reconciledItems = reconcileItemPasses(
      parseJsonResponse(resA.content)?.items,
      parseJsonResponse(resB.content)?.items
    );
  } else {
    const resA = await chatCompletion(itemsMessages, VISION_MODEL, 8192, 0, 'items pass A');
    costs.push(resA.cost);
    console.log(`[OpenAIService] Item-table pass A response:\n${truncateForLog(resA.content)}`);
    const itemsA = parseJsonResponse(resA.content)?.items;

    if (DOUBLE_READ_MODE !== 'never' && needsConfirmationPass(itemsA)) {
      // The prompt+image prefix is identical to pass A, so this sequential call also
      // picks up OpenAI's automatic prompt-cache discount on the input.
      const resB = await chatCompletion(itemsMessages, VISION_MODEL, 8192, 0, 'items pass B (confirmation)');
      costs.push(resB.cost);
      console.log(`[OpenAIService] Item-table pass B response:\n${truncateForLog(resB.content)}`);
      reconciledItems = reconcileItemPasses(itemsA, parseJsonResponse(resB.content)?.items);
    } else {
      reconciledItems = itemsA;
    }
  }

  console.log(`[OpenAIService] Reconciled item-table fields:\n${truncateForLog(reconciledItems)}`);

  const merged = mergeParsedBill(metadata, { items: reconciledItems });
  const normalized = normalizeBillData(merged, ocrTextHint);

  const totalInr = costs.reduce((sum, c) => sum + c.inr, 0);
  const totalUsd = costs.reduce((sum, c) => sum + c.usd, 0);
  console.log(
    `[OpenAIService] ✓ OpenAI Vision parsed ${normalized.items?.length || 0} items ` +
    `in ${costs.length} call(s) — scan cost ≈ $${totalUsd.toFixed(4)} / ₹${totalInr.toFixed(2)}`
  );
  return normalized;
}

/**
 * Parse raw OCR text into structured bill data with GPT-4o-mini (text-only, cheaper).
 */
async function parseTextWithOpenAI(ocrText) {
  console.log(`[OpenAIService] Sending OCR text to OpenAI (${TEXT_MODEL})...`);
  const { content } = await chatCompletion(
    [
      {
        role: 'system',
        content: 'You are an expert Indian pharmacy invoice parser. You always return ONLY valid JSON, no markdown fences, no extra text.',
      },
      { role: 'user', content: getOcrTextPrompt(ocrText) },
    ],
    TEXT_MODEL,
    8192,
    0,
    'OCR text parse'
  );
  console.log(`[OpenAIService] Text parser response:\n${truncateForLog(content)}`);
  const parsed = parseJsonResponse(content);
  return normalizeBillData(parsed, ocrText);
}

/**
 * Generic "prompt in, JSON out" call, reached via aiService.generateStructuredJson and
 * used by non-bill AI features (product identity lookup, etc).
 */
async function generateJsonWithOpenAI(prompt, { label = 'structured JSON', temperature = 0, maxTokens = 4096 } = {}) {
  console.log(`[OpenAIService] Sending ${label} request to OpenAI (${TEXT_MODEL})...`);
  const { content } = await chatCompletion([{ role: 'user', content: prompt }], TEXT_MODEL, maxTokens, temperature, label);
  console.log(`[OpenAIService] ${label} raw response:\n${truncateForLog(content)}`);
  return parseJsonResponse(content);
}

/**
 * Read a UPI payment receipt screenshot (PhonePe, Google Pay, Paytm, BHIM, bank apps).
 * One small vision call, no item table, so this costs a fraction of a bill scan.
 * Returns the raw model JSON; paymentScreenshotService normalizes it.
 */
async function extractUpiPaymentFromImage(base64Image, mimeType = 'image/jpeg') {
  const prompt = `This is a screenshot of a UPI / bank payment receipt from an Indian payments app
(PhonePe, Google Pay, Paytm, BHIM, Amazon Pay, CRED, WhatsApp Pay or a bank app).
The shop owner PAID money TO the receiver. Extract exactly what is printed. Return JSON:
{
  "isPaymentReceipt": boolean,     // false if this is not a payment receipt at all
  "status": "success" | "pending" | "failed" | null,
  "amount": number | null,         // rupees paid, digits only (e.g. 12450.5). Not the balance.
  "date": "YYYY-MM-DD" | null,     // transaction date as printed
  "time": "HH:MM" | null,          // 24h, if printed
  "transactionId": string | null,  // UPI transaction ID / UTR / UPI Ref No (prefer the 12-digit UTR / UPI Ref No when both are shown); no spaces
  "otherReferenceIds": string[],   // any other ids shown (e.g. app transaction id, Google transaction ID)
  "receiverName": string | null,   // name of who RECEIVED the money ("Paid to", "To", "Sent to")
  "receiverUpiId": string | null,  // receiver VPA like name@okaxis, if shown
  "receiverBank": string | null,
  "payerName": string | null,      // who paid ("From", "Debited from")
  "app": "phonepe" | "google_pay" | "paytm" | "bhim" | "amazon_pay" | "cred" | "whatsapp" | "bank" | "other" | null,
  "note": string | null            // any message/remark the payer added
}
Rules: never guess a field that is not visible — use null. Dates in the image may be written like
"21 Oct 2026", "21/10/26" or "Oct 21, 2026"; in India 05/10/2026 means 5 October.`;

  const { content } = await chatCompletion(
    [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
      ],
    }],
    VISION_MODEL,
    700,
    0,
    'UPI screenshot'
  );
  console.log(`[OpenAIService] UPI screenshot response:\n${truncateForLog(content)}`);
  return parseJsonResponse(content);
}

module.exports = { parseImageWithOpenAIVision, parseTextWithOpenAI, generateJsonWithOpenAI, extractUpiPaymentFromImage };
