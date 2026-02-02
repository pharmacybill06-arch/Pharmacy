# Frontend-Backend Integration Guide

## Overview
Your pharmacy bill app is now integrated with the backend! The Gemini AI integration has been moved to the backend for better security and performance.

## Architecture

```
Frontend (React Native/Expo)
    ↓
API Service (services/api.js)
    ↓
Backend (Node.js/Express)
    ↓
├─ Google Cloud Vision (OCR)
├─ Gemini AI (Intelligent Parsing)
└─ PostgreSQL Database (Data Storage)
```

## Setup Instructions

### 1. Backend Setup

#### Install Dependencies
```bash
cd backend
npm install
```

This will install:
- `@google/generative-ai` - Gemini AI SDK
- `@google-cloud/vision` - Google Cloud Vision for OCR
- `@prisma/client` - Database ORM
- `express`, `cors`, `multer`, `sharp` - Server dependencies

#### Configure Environment Variables

The backend `.env` file is already configured with:
- `DATABASE_URL` - PostgreSQL connection
- `GEMINI_API_KEY` - Your Gemini API key (moved from frontend)
- `GROQ_API_KEY` - Fallback API key
- `GOOGLE_APPLICATION_CREDENTIALS` - Google Cloud Vision credentials
- `PORT=5000` - Backend server port

#### Setup Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio to view data
npm run prisma:studio
```

#### Start Backend Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will run on `http://localhost:5000`

### 2. Frontend Setup

#### Environment Configuration

The frontend `.env` is configured with:
```
EXPO_PUBLIC_BACKEND_URL=http://localhost:5000/api
```

**Important for Mobile Testing:**
- For Android Emulator: Use `http://10.0.2.2:5000/api`
- For iOS Simulator: Use `http://localhost:5000/api`
- For Physical Device: Use your computer's IP address `http://192.168.x.x:5000/api`

To find your IP:
```bash
# Windows
ipconfig

# Mac/Linux
ifconfig
```

#### Start Frontend

```bash
# From project root
npm start

# Or specifically
npx expo start
```

## How It Works

### Bill Upload Flow

1. **User uploads image** (camera or gallery)
   - Frontend: `explore.js` → `handlePickImage()` or `handleTakePhoto()`

2. **Image sent to backend**
   - Frontend: `billApi.uploadBill(userId, imageFile)`
   - Backend: Receives image via multer middleware

3. **Backend processes image**
   - **Step 1:** Image preprocessing with Sharp (enhance quality)
   - **Step 2:** OCR with Google Cloud Vision (extract text)
   - **Step 3:** AI parsing with Gemini (structure data)
   - **Step 4:** Save as draft in database

4. **Frontend receives parsed data**
   - Structured bill data (pharmacy name, items, totals)
   - OCR raw text (for review)
   - Bill ID (for later confirmation)

5. **User reviews and edits**
   - BillFormRedesigned component displays parsed data
   - User can edit any field

6. **User confirms**
   - Frontend: `billApi.confirmBill(billId, billData)`
   - Backend: Updates database, changes status to "completed"

### API Endpoints Used

#### User Management
- `POST /api/users` - Create user
- `GET /api/users/:userId` - Get user details

#### Bill Management
- `POST /api/bills/:userId/upload` - Upload and process bill
- `GET /api/bills/:billId/draft` - Get draft bill
- `POST /api/bills/:billId/confirm` - Confirm and save bill
- `GET /api/bills/user/:userId` - Get all user bills
- `PUT /api/bills/:billId` - Update bill
- `DELETE /api/bills/:billId` - Delete bill

## Key Changes Made

### Backend Changes

1. **Created `backend/src/utils/geminiService.js`**
   - Gemini AI integration for intelligent bill parsing
   - Normalizes and validates parsed data
   - Handles errors gracefully

2. **Updated `backend/src/controllers/billController.js`**
   - Added Gemini parsing to upload workflow
   - Pre-fills bill metadata from AI parsing
   - Stores both OCR and Gemini data

3. **Updated `backend/package.json`**
   - Added `@google/generative-ai` dependency

4. **Updated `backend/.env`**
   - Added GEMINI_API_KEY and GROQ_API_KEY

### Frontend Changes

1. **Created `services/api.js`**
   - Centralized API communication
   - Handles file uploads
   - Error handling and logging

2. **Updated `app/(tabs)/explore.js`**
   - Removed local ML Kit OCR processing
   - Removed local Gemini integration
   - Now calls backend API for processing
   - Better error handling with user feedback

3. **Updated `.env`**
   - Added EXPO_PUBLIC_BACKEND_URL
   - Removed API keys (moved to backend)

## Testing the Integration

### 1. Start Backend
```bash
cd backend
npm run dev
```

You should see:
```
🚀 Pharmacy Bill Backend running on port 5000
📌 Localhost: http://localhost:5000/api/health
```

### 2. Test Backend Health
```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{
  "status": "Backend is running",
  "timestamp": "..."
}
```

### 3. Start Frontend
```bash
npx expo start
```

### 4. Test Bill Upload

1. Open app on device/emulator
2. Navigate to "Explore" tab
3. Upload a pharmacy bill image
4. Watch the processing:
   - Image upload to backend
   - OCR extraction with Google Vision
   - AI parsing with Gemini
   - Parsed data displayed in form

## Troubleshooting

### Backend Not Connecting

**Error:** "Failed to process bill: Network request failed"

**Solutions:**
1. Check backend is running: `curl http://localhost:5000/api/health`
2. Verify `EXPO_PUBLIC_BACKEND_URL` in frontend `.env`
3. For mobile device, use computer's IP address instead of localhost

### Gemini API Errors

**Error:** "Gemini AI is not configured"

**Solutions:**
1. Check `GEMINI_API_KEY` in `backend/.env`
2. Verify API key is valid
3. Check Gemini API quota/billing

### Database Errors

**Error:** "Cannot connect to database"

**Solutions:**
1. Check PostgreSQL is running
2. Verify `DATABASE_URL` in `backend/.env`
3. Run `npm run prisma:migrate` to setup schema

### File Upload Errors

**Error:** "Bill image file is required"

**Solutions:**
1. Check file permissions
2. Verify `uploads/bills/` directory exists
3. Check multer configuration in `backend/src/config/multer.js`

## Database Schema

### User
- id, email, name, phone
- One-to-many relationship with Bills

### Bill
- File info: fileName, filePath, fileSize, mimeType
- Metadata: pharmacyName, billNumber, billDate, totalAmount
- OCR data: ocrData (JSON with raw text + Gemini parsed data)
- Status: draft → completed
- Relationships: User (many-to-one), BillItems (one-to-many)

### BillItem
- Item details: itemName, quantity, unit, unitPrice, totalPrice
- Confidence score (for OCR validation)
- Relationship: Bill (many-to-one)

## Security Notes

✅ **Implemented:**
- API keys moved to backend (not exposed to client)
- CORS configured for API security
- File upload size limits
- User validation before processing

⚠️ **TODO for Production:**
- Add authentication (JWT tokens)
- Add authorization (user can only access their bills)
- Add rate limiting
- Add input validation middleware
- Use HTTPS
- Add file type validation
- Implement proper user management

## Next Steps

1. **Add User Authentication**
   - Replace TEMP_USER_ID with real user IDs
   - Implement login/signup

2. **Add Bill List Screen**
   - Display all user bills
   - Filter and search functionality

3. **Add Bill Details Screen**
   - View completed bills
   - Edit/delete bills

4. **Improve Error Handling**
   - Better user feedback
   - Retry mechanisms

5. **Add Offline Support**
   - Queue uploads when offline
   - Sync when back online

## Support

For issues or questions:
1. Check backend logs: Terminal where `npm run dev` is running
2. Check frontend logs: Expo dev tools console
3. Check database: `npm run prisma:studio` in backend folder

---

**Integration Complete! 🎉**

Your app now has a professional backend with OCR, AI parsing, and database storage.
