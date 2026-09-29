# Web ↔ Mobile parity

This repo ships **two clients over one backend**:

| | Path | Stack | Backend URL comes from |
|---|---|---|---|
| Mobile | `frontend/` | Expo / React Native | `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` |
| Web | `my-react-app/` | Create React App | `REACT_APP_BACKEND_URL` in `my-react-app/.env` |
| API | `backend/` | Express + Prisma → Postgres | — |

They are the same product. A bill scanned on the phone must show up on the web
and vice versa.

## How they connect

There is no sync layer and there doesn't need to be one. Both clients:

1. Call the **same Express API** (CORS is open, `backend/src/app.js`).
2. Authenticate with the **same phone-OTP flow**, which returns the **same
   `user.id`** for the same phone number.
3. Read and write the **same Postgres rows**, scoped by that `user.id`.

So "connecting" the two is really two obligations:

- **Both `.env` files must point at the same backend.** This is the one that
  actually breaks in practice — see below.
- **Both clients must speak the same contract.** See the parity checklist.

### Pointing them at the same backend

The backend prints its reachable addresses on boot:

```
📌 Localhost: http://localhost:5000/api/health
📱 Mobile/Network: http://192.168.1.5:5000/api/health
```

- **Web on the same machine as the backend** → `http://localhost:5000/api`
- **Phone, emulator, or web opened from another device** → the LAN IP
- **Deployed** → the Render URL, set in the Netlify/Vercel dashboard, not in
  a committed file

⚠️ **The LAN IP changes when you switch networks.** A stale IP in
`frontend/.env` is the most common cause of "the app stopped loading" and of
the two clients appearing to hold different data — one is talking to a server
that isn't there. Check the boot banner against your `.env` whenever the phone
app goes quiet.

## Parity checklist

`frontend/services/api.js` and `my-react-app/src/services/api.js` are separate
files that must stay in step. When you touch one, check the other.

Shared today:

- **All 16 API modules.** `batchApi`, `expiryApi`, `ledgerApi`, `salesApi`,
  `patientApi`, `userApi` and `exportApi` were ported from mobile to web; they
  are byte-identical apart from the two exceptions below.
- **`apiFetch` error shape.** Both attach `status`, `code` and `details` to the
  thrown Error, and prefer the server's `message` over `error`. Callers rely on
  `err.status === 409` for the duplicate-invoice case.
- **`utils/dateFormat.js`.** One DD-MM-YYYY formatter, duplicated verbatim at
  `frontend/utils/dateFormat.js` and `my-react-app/src/utils/dateFormat.js`.
  Calendar dates are read in UTC, real timestamps in local time — see the file.
- **Free/scheme quantity.** Both bill forms show `QTY`, `FREE` and a read-only
  `TOTAL` (= qty + free), because free units enter stock but are not charged.
- **Duplicate invoices.** The backend refuses a repeat invoice number from the
  same distributor with a `409`; both clients surface it as "already saved"
  rather than a generic failure.

### Deliberate differences

Two methods cannot be identical, and are commented as such in both files:

| Method | Mobile | Web |
|---|---|---|
| `ledgerApi.uploadAttachment` | RN `{ uri, name, type }` FormData descriptor | real `File`/`Blob` from `<input type="file">` |
| `exportApi.generate` | returns base64 for `expo-file-system` + native share sheet | returns a Blob and drives an `<a download>` click |

`userApi.savePushToken` is mobile-only (Expo push has no web equivalent).

## When you add a backend endpoint

1. Add it to **both** `api.js` files.
2. If it returns dates, render them through `formatDDMMYYYY`.
3. If it can conflict, return `{ error, message, ...context }` with a 4xx so
   both clients can show the `message` directly.
