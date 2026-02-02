# ✅ Complete Setup Checklist

## 🔴 Your Current Issue: "Network request failed"

This means the frontend **cannot connect to the backend**. Here's how to fix it:

---

## 🎯 IMMEDIATE FIX (3 Steps)

### Step 1: Check Backend is Running
Open a terminal and run:
```bash
cd backend
npm start
```

You should see:
```
🚀 Pharmacy Bill Backend running on port 5000
📌 Localhost: http://localhost:5000/api/health
📱 Mobile/Network: http://192.168.68.4:5000/api/health
```

If NOT running, start it with the command above.

### Step 2: Reload Expo App
In the **Expo terminal** (where `npm start` is running), press:
```
r
```

Wait for the app to reload. You should see logs like:
```
[API Service] Initialized with URL: http://192.168.68.4:5000/api
```

### Step 3: Try Uploading a Bill
1. Go to Explore tab
2. Upload an image
3. Watch the logs for the backend URL being used

---

## 🧪 Verification Checklist

| ✅ | Item | How to Check |
|---|------|---|
| [ ] | Backend Running | Terminal shows "🚀 Pharmacy Bill Backend running" |
| [ ] | Port 5000 Open | `netstat -ano \| findstr :5000` shows a process |
| [ ] | API Health Check | `curl http://192.168.68.4:5000/api/health` returns JSON |
| [ ] | .env Updated | `.env` has `EXPO_PUBLIC_BACKEND_URL=http://192.168.68.4:5000/api` |
| [ ] | App Reloaded | Expo terminal shows logs with correct backend URL |
| [ ] | Network Connection | Phone/emulator on same WiFi as backend computer |
| [ ] | Firewall Allow | Node.js is allowed through Windows Firewall |

---

## 🛠 Troubleshooting by Device Type

### Android Emulator
```env
EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:5000/api
```
Then reload: Press `r`

### Physical Android Device
```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.68.4:5000/api
```
Then reload: Press `r`

### iOS Simulator
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:5000/api
```
Then reload: Press `r`

### iOS Physical Device
```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.68.4:5000/api
```
Then reload: Press `r`

---

## 🔍 Debug Steps

### See What URL the App is Using
After reloading, look at the Expo logs. You should see:
```
[API Service] Initialized with URL: http://192.168.68.4:5000/api
[API Service] EXPO_PUBLIC_BACKEND_URL env: http://192.168.68.4:5000/api
```

If you see `http://localhost:5000/api` instead, the app wasn't reloaded.

### Test Backend Directly
```bash
# PowerShell
Invoke-WebRequest http://192.168.68.4:5000/api/health

# Should return:
# {"status":"Backend is running","timestamp":"..."}
```

### Check Expo Logs During Upload
Watch for these logs:
```
[API Fetch] GET/POST /users → http://192.168.68.4:5000/api/users
[API Fetch] GET/POST /bills/temp-user-123/upload → http://192.168.68.4:5000/api/bills/temp-user-123/upload
```

---

## ⚠️ Common Issues & Solutions

### "Network request failed" Error

**Issue 1: App Not Reloaded**
- **Symptom:** Logs still show `http://localhost:5000/api`
- **Fix:** Press `r` in Expo terminal again

**Issue 2: Backend Crashed**
- **Symptom:** Backend terminal shows error
- **Fix:** Restart with `cd backend && npm start`

**Issue 3: Wrong IP Address**
- **Symptom:** Can't reach http://192.168.68.4:5000
- **Fix:** Run `ipconfig`, find your IP, update `.env`

**Issue 4: Firewall Blocking**
- **Symptom:** Connection refused
- **Fix:** Allow Node.js through Windows Firewall

**Issue 5: Wrong Device Type**
- **Symptom:** Works on web, fails on mobile
- **Fix:** Use `10.0.2.2` for Android emulator, IP for real devices

---

## 📋 Current Status

### Backend
- **Status:** ✅ Running
- **Port:** 5000
- **URL:** http://192.168.68.4:5000
- **Health Check:** /api/health

### Frontend
- **.env Updated:** ✅ Yes
- **Reload Status:** ⏳ **Pending - Press `r` to reload**

### Database
- **PostgreSQL:** ✅ Configured
- **Migrations:** ✅ Applied

### AI Integration
- **Gemini API:** ✅ Configured
- **Google Vision:** ✅ Configured

---

## 🚀 Next Steps

1. **Verify backend is running** (see step 1 above)
2. **Reload the app** by pressing `r` in Expo terminal
3. **Watch the logs** to confirm correct backend URL
4. **Try uploading** a bill image
5. **Enjoy** the AI-powered bill processing! 🎉

---

## 💡 Pro Tips

- **Keep both terminals open:**
  - Terminal 1: Backend running (`npm run backend` in backend folder)
  - Terminal 2: Frontend running (`npm start` in root folder)

- **Hot reload helps:**
  - Press `r` to reload app
  - Press `Ctrl+C` to stop, then restart if needed

- **Check logs first:**
  - Frontend logs in Expo terminal
  - Backend logs in backend terminal
  - Both show what URL is being used

---

**You've got this! 💪 Just reload the app and it should work.**
