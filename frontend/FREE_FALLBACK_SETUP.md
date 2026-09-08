# AI Parsing & Fallback Setup

## Overview

Bill parsing runs on the **backend only**, using OpenAI. The mobile/web app never holds a
model API key.

> **Why this matters:** anything read from an `EXPO_PUBLIC_*` variable is inlined into the
> shipped JS bundle, so a key placed there is published to everyone who installs the app.
> The project previously called Gemini directly from the client this way, and that key was
> flagged as leaked by Google and revoked. Do not reintroduce a client-side model key.

## How It Works

### Priority order

1. **Backend AI parse** (`POST /api/ai/parse-ocr`) — OpenAI, the only AI provider.
2. **Local parser** (`fallbackParseOcrText` in `components/bill-form/bill-parser.js`) —
   regex-based, no network. Used when the backend is unreachable, so a pharmacist can
   still get a filled-in form offline.

Vision parsing (`POST /api/ai/parse-image`) runs a metadata pass plus an item-table pass
read twice and reconciled, so disagreements surface as "needs review" rather than being
silently resolved to one possibly-wrong value.

## Setup

The only key you need is on the backend. In `backend/.env`:

```env
OPENAI_API_KEY=sk-your_api_key_here

# Optional model overrides
OPENAI_VISION_MODEL=gpt-4o
OPENAI_TEXT_MODEL=gpt-4o-mini
```

The app just needs to know where the backend is. In `frontend/.env`:

```env
EXPO_PUBLIC_BACKEND_URL=https://your-backend-host/api
```

Then restart:

```bash
npx expo start -c
```

## Groq

Groq is still used on the backend for email bill *detection* (deciding whether an incoming
email contains an invoice), not for bill parsing. It is optional — set `GROQ_API_KEY` in
`backend/.env` if you want it. Like every model key, it belongs on the backend only.

## Troubleshooting

**Issue**: Always getting local-parser results
**Solution**: The app can't reach the backend. Check `EXPO_PUBLIC_BACKEND_URL` and that the
backend is running; look for `[BillParser] Backend parse failed` in the app logs.

**Issue**: Backend returns "AI is not configured"
**Solution**: `OPENAI_API_KEY` is missing from `backend/.env`.

**Issue**: Backend returns 401/403 from OpenAI
**Solution**: The key is invalid, revoked, or out of quota. Rotate it in the OpenAI
dashboard and update `backend/.env` (and your host's environment settings).
