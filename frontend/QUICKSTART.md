# Pharmacy Bill App - Quick Start Guide

## 🚀 Getting Started

Your pharmacy bill app is now fully integrated with a backend server! Follow these steps to get everything running.

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- Expo CLI
- Android Studio / Xcode (for mobile testing)

## Installation

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

Or use the shortcut from the project root:

```bash
npm run backend:install
```

### 3. Setup Database

Make sure PostgreSQL is running, then:

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
```

Or use the complete setup script:

```bash
npm run backend:setup
```

## Configuration

### Backend Configuration (backend/.env)

The backend `.env` file is already configured with:

```env
DATABASE_URL="postgresql://postgres:Abhi@1234@localhost:5432/pharmacy_db"
PORT=5000
GEMINI_API_KEY=your_gemini_key_here
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
```

**Important:** Make sure your PostgreSQL credentials match your local setup.

### Frontend Configuration (.env)

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:5000/api
```

**For Mobile Testing:**
- Android Emulator: `http://10.0.2.2:5000/api`
- iOS Simulator: `http://localhost:5000/api`
- Physical Device: `http://YOUR_COMPUTER_IP:5000/api` (e.g., `http://192.168.1.100:5000/api`)

## Running the Application

### Option 1: Run Both Together (Recommended)

```bash
npm run dev
```

This will start:
- Backend server on http://localhost:5000
- Frontend Expo dev server

### Option 2: Run Separately

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm start
```

## Testing the Integration

### 1. Check Backend Health

Visit http://localhost:5000/api/health in your browser.

You should see:
```json
{
  "status": "Backend is running",
  "timestamp": "2026-01-20T..."
}
```

### 2. Test Bill Upload

1. Open the app on your device/emulator
2. Go to the "Explore" tab
3. Upload a pharmacy bill image:
   - **Option A:** Take a photo with camera
   - **Option B:** Choose from gallery

4. Watch the magic happen:
   - 📤 Image uploaded to backend
   - 🔍 OCR extraction with Google Cloud Vision
   - 🤖 AI parsing with Gemini
   - ✅ Structured data displayed in the form

### 3. Review and Save

- Edit any fields if needed
- Add/remove items
- Adjust quantities and prices
- Save the bill to database

## Project Structure

```
pharmacy-bill-app/
├── app/                          # Expo Router pages
│   └── (tabs)/
│       ├── index.js             # Home screen
│       └── explore.js           # Bill upload screen ⭐
├── components/
│   ├── screens/                 # Screen components
│   │   ├── BillUploadScreen.js
│   │   ├── BillFormScreen.js
│   │   └── OcrReviewScreen.js
│   ├── bill-form/               # Bill form components
│   │   ├── BillFormRedesigned.js
│   │   └── sections/
│   └── ui/                      # Reusable UI components
├── services/
│   └── api.js                   # API service ⭐ (NEW)
├── backend/                     # Backend server ⭐
│   ├── src/
│   │   ├── app.js              # Express app
│   │   ├── server.js           # Server entry point
│   │   ├── controllers/         # Business logic
│   │   │   └── billController.js  # Bill processing ⭐
│   │   ├── routes/              # API routes
│   │   ├── models/              # Database models
│   │   ├── utils/
│   │   │   ├── billExtractor.js    # OCR processing
│   │   │   └── geminiService.js    # Gemini AI ⭐ (NEW)
│   │   └── middleware/
│   ├── prisma/
│   │   └── schema.prisma       # Database schema
│   ├── uploads/                # Uploaded bill images
│   └── .env                    # Backend config
├── .env                        # Frontend config
└── package.json
```

## How It Works

### Complete Bill Processing Flow

```
1. User uploads bill image
   ↓
2. Frontend sends to backend (services/api.js)
   ↓
3. Backend receives image (billController.js)
   ↓
4. Image preprocessing (Sharp)
   ↓
5. OCR extraction (Google Cloud Vision)
   ↓
6. AI parsing (Gemini AI)
   ↓
7. Save as draft in PostgreSQL
   ↓
8. Return parsed data to frontend
   ↓
9. User reviews and edits
   ↓
10. Frontend confirms bill
    ↓
11. Backend saves final bill + items
    ↓
12. Status: draft → completed ✅
```

## API Endpoints

### Health Check
```
GET /api/health
```

### User Management
```
POST   /api/users              # Create user
GET    /api/users/:userId      # Get user
PUT    /api/users/:userId      # Update user
DELETE /api/users/:userId      # Delete user
```

### Bill Management
```
POST   /api/bills/:userId/upload    # Upload & process bill ⭐
GET    /api/bills/:billId/draft     # Get draft bill
POST   /api/bills/:billId/confirm   # Confirm bill ⭐
GET    /api/bills/user/:userId      # Get user's bills
GET    /api/bills/:billId           # Get bill details
PUT    /api/bills/:billId           # Update bill
DELETE /api/bills/:billId           # Delete bill
```

## Troubleshooting

### "Cannot connect to backend"

**Solution:**
1. Check backend is running: `curl http://localhost:5000/api/health`
2. Verify `EXPO_PUBLIC_BACKEND_URL` in `.env`
3. For mobile device, use computer's IP address

### "Gemini AI is not configured"

**Solution:**
1. Check `GEMINI_API_KEY` in `backend/.env`
2. Verify API key is valid
3. Check quota/billing on Google AI Studio

### "Database connection failed"

**Solution:**
1. Check PostgreSQL is running
2. Verify `DATABASE_URL` in `backend/.env`
3. Run migrations: `cd backend && npm run prisma:migrate`

### "File upload failed"

**Solution:**
1. Check `backend/uploads/bills/` directory exists
2. Verify file permissions
3. Check file size limits in `backend/src/config/multer.js`

## Available Scripts

### Frontend
- `npm start` - Start Expo dev server
- `npm run android` - Run on Android
- `npm run ios` - Run on iOS
- `npm run web` - Run on web

### Backend
- `npm run backend` - Start backend server
- `npm run backend:install` - Install backend dependencies
- `npm run backend:setup` - Complete backend setup

### Combined
- `npm run dev` - Run both frontend and backend
- `npm run setup` - Install all dependencies and setup database

## Features

### ✅ Implemented

- 📸 Camera and gallery upload
- 🔍 OCR text extraction (Google Cloud Vision)
- 🤖 AI-powered bill parsing (Gemini)
- 📝 Editable bill form
- 💾 PostgreSQL database storage
- 🔐 API key security (server-side only)
- 📊 Structured data extraction:
  - Pharmacy details
  - Bill metadata
  - Line items with quantities/prices
  - Tax calculations
  - Totals

### 🚧 TODO

- 👤 User authentication
- 📋 Bill list screen
- 🔍 Search and filter bills
- 📤 Export bills (PDF/CSV)
- 📱 Offline support
- 🔄 Sync mechanism
- 📈 Analytics dashboard

## Database Schema

### User
- id, email, name, phone
- Relationships: Bills (one-to-many)

### Bill
- File info: fileName, filePath, fileSize, mimeType
- Metadata: pharmacyName, billNumber, billDate, totalAmount, pharmacyPhone
- OCR data: ocrData (JSON)
- Status: draft | processing | completed | failed
- Relationships: User (many-to-one), BillItems (one-to-many)

### BillItem
- Item details: itemName, quantity, unit, unitPrice, totalPrice
- Confidence: confidence score (0-1)
- Relationships: Bill (many-to-one)

## Tech Stack

### Frontend
- React Native (Expo)
- Expo Router
- Expo Camera
- Expo Image Picker

### Backend
- Node.js + Express
- PostgreSQL + Prisma ORM
- Google Cloud Vision API
- Gemini AI API
- Multer (file uploads)
- Sharp (image processing)

## Support & Documentation

- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Detailed integration guide
- [Backend API Documentation](./backend/API_DOCUMENTATION.md) - Complete API reference
- [Backend README](./backend/README.md) - Backend-specific documentation

## License

MIT

---

**Happy Bill Scanning! 🎉**

For questions or issues, check the logs:
- Frontend: Expo dev tools console
- Backend: Terminal where `npm run backend` is running
- Database: `cd backend && npm run prisma:studio`
