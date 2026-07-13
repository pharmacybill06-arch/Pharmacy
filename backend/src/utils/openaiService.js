/**
 * OpenAI (GPT-4o) fallback parser — replaces Groq as the fallback used when
 * Gemini fails (vision or text). Reuses the same prompts/schema as Gemini so
 * output shape stays identical, via normalizeBillData.
 */

const {
  normalizeBillData,
  getOcrTextPrompt,
  getVisionMetadataPrompt,
  getVisionItemsPrompt,
  mergeParsedBill,
  parseJsonResponse,
  reconcileItemPasses,
} = require('./geminiService');

const API_URL = 'https://api.openai.com/v1/chat/completions';
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o';
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
const MAX_LOG_CHARS = Number(process.env.OPENAI_LOG_MAX_CHARS || 20000);

function truncateForLog(value, maxChars = MAX_LOG_CHARS) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

async function chatCompletion(messages, model, maxTokens = 4096) {
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
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${truncateForLog(body?.error || body)}`);
  }

  return body.choices?.[0]?.message?.content || '';
}

/**
 * Parse bill image with GPT-4o vision — same two-pass approach as Gemini Vision
 * (metadata pass, then item-table pass), merged and normalized identically.
 */
async function parseImageWithOpenAIVision(base64Image, mimeType = 'image/jpeg', ocrTextHint = '') {
  console.log(`[OpenAIService] Sending image to OpenAI Vision (${VISION_MODEL}) metadata pass...`);
  const metadataText = await chatCompletion(
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: getVisionMetadataPrompt(ocrTextHint) },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
        ],
      },
    ],
    VISION_MODEL,
    4096
  );
  console.log(`[OpenAIService] Metadata pass response:\n${truncateForLog(metadataText)}`);
  const metadata = parseJsonResponse(metadataText);

  console.log(`[OpenAIService] Sending image to OpenAI Vision (${VISION_MODEL}) item-table pass (2 independent reads for reconciliation)...`);
  const itemsMessages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: getVisionItemsPrompt(ocrTextHint) },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
      ],
    },
  ];
  const [itemsTextA, itemsTextB] = await Promise.all([
    chatCompletion(itemsMessages, VISION_MODEL, 8192),
    chatCompletion(itemsMessages, VISION_MODEL, 8192),
  ]);
  console.log(`[OpenAIService] Item-table pass A response:\n${truncateForLog(itemsTextA)}`);
  console.log(`[OpenAIService] Item-table pass B response:\n${truncateForLog(itemsTextB)}`);
  const itemResultA = parseJsonResponse(itemsTextA);
  const itemResultB = parseJsonResponse(itemsTextB);
  const reconciledItems = reconcileItemPasses(itemResultA?.items, itemResultB?.items);
  console.log(`[OpenAIService] Reconciled item-table fields:\n${truncateForLog(reconciledItems)}`);

  const merged = mergeParsedBill(metadata, { items: reconciledItems });
  const normalized = normalizeBillData(merged, ocrTextHint);

  console.log(`[OpenAIService] ✓ OpenAI Vision parsed ${normalized.items?.length || 0} items`);
  return normalized;
}

/**
 * Parse raw OCR text into structured bill data with GPT-4o-mini (text-only, cheaper).
 */
async function parseTextWithOpenAI(ocrText) {
  console.log(`[OpenAIService] Sending OCR text to OpenAI (${TEXT_MODEL})...`);
  const text = await chatCompletion(
    [
      {
        role: 'system',
        content: 'You are an expert Indian pharmacy invoice parser. You always return ONLY valid JSON, no markdown fences, no extra text.',
      },
      { role: 'user', content: getOcrTextPrompt(ocrText) },
    ],
    TEXT_MODEL,
    8192
  );
  console.log(`[OpenAIService] Text parser response:\n${truncateForLog(text)}`);
  const parsed = parseJsonResponse(text);
  return normalizeBillData(parsed, ocrText);
}

module.exports = { parseImageWithOpenAIVision, parseTextWithOpenAI };
