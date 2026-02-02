# 🔧 How to Reload Expo App After .env Changes

The `.env` file has been updated with the correct backend URL, but **Expo caches environment variables**.

You need to reload the app to pick up the new configuration.

## ⚡ Quick Fix: Reload the App

### **Step 1: Look at Your Expo Terminal**
Find the terminal window where you ran `npm start` - it should show the Expo menu.

### **Step 2: Press `r` to Reload**
Simply press the **`r`** key in the Expo terminal.

You should see:
```
› Press r │ reload app
```

After pressing `r`, the app will reload and should now use the new backend URL.

## 🎯 Complete Step-by-Step Instructions

### For Android Emulator:

1. **Update `.env`:**
   ```
   EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:5000/api
   ```

2. **Reload App:**
   - In Expo terminal, press `r`

3. **Try Uploading:**
   - Go to Explore tab
   - Upload a bill image

### For Physical Device (Android/iOS):

1. **Update `.env`:**
   ```
   EXPO_PUBLIC_BACKEND_URL=http://192.168.68.4:5000/api
   ```

2. **Reload App:**
   - In Expo terminal, press `r`

3. **Try Uploading:**
   - Go to Explore tab
   - Upload a bill image

### For iOS Simulator:

1. **Update `.env`:**
   ```
   EXPO_PUBLIC_BACKEND_URL=http://localhost:5000/api
   ```

2. **Reload App:**
   - In Expo terminal, press `r`

3. **Try Uploading:**
   - Go to Explore tab
   - Upload a bill image

## 🔍 Verify the Configuration

After reloading, look at the logs. You should see:
```
[API Service] Initialized with URL: http://192.168.68.4:5000/api
[API Service] EXPO_PUBLIC_BACKEND_URL env: http://192.168.68.4:5000/api
[API Fetch] GET/POST /users → http://192.168.68.4:5000/api/users
[API Fetch] GET/POST /bills/temp-user-123/upload → http://192.168.68.4:5000/api/bills/temp-user-123/upload
```

If you see `http://localhost:5000/api` instead, the app wasn't reloaded properly. Try again:
- Press `r` again in Expo terminal
- Or completely restart: Press `Ctrl+C` to stop, then `npm start` again

## 📋 Current Configuration

| Component | Status |
|-----------|--------|
| Backend | ✅ Running at http://192.168.68.4:5000 |
| Frontend .env | ✅ Updated to use http://192.168.68.4:5000/api |
| Reload Status | ⏳ **Pending - Press `r` to reload** |

## ❌ If Still Getting "Network request failed":

### Cause 1: App Wasn't Reloaded
- **Solution:** Press `r` in Expo terminal again

### Cause 2: Backend Crashed
- **Check:** Look at backend terminal for errors
- **Restart:** `cd backend && npm start`

### Cause 3: Wrong IP Address
- **Check:** Run `ipconfig` to get your computer's IP
- **Update:** `.env` with correct IP
- **Reload:** Press `r`

### Cause 4: Firewall Blocking
- **Solution:** Allow Node.js through Windows Firewall
- Or temporarily disable firewall to test

### Cause 5: Not on Same Network
- **Solution:** Ensure phone/emulator is on same WiFi as computer

---

## 🚀 Next Steps

1. **Reload the app:** Press `r` in Expo terminal
2. **Check the logs:** Should show the correct API URL
3. **Try uploading:** Go to Explore → Upload Bill
4. **Watch the magic:** OCR + Gemini AI processing!

Good luck! 🎉
