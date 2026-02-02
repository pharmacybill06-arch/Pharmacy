# Public Distribution Guide
## Make Your App Available to Anyone (Without Play Store)

## 🎯 Best Options

### Option 1: EAS Build APK (Recommended for Android)
Build a standalone APK that anyone can download and install directly.

#### Step 1: Install EAS CLI
```bash
npm install -g eas-cli
```

#### Step 2: Login to Expo
```bash
eas login
```

#### Step 3: Build APK for Android
```bash
# For preview/testing build
eas build --platform android --profile preview

# For production build
eas build --platform android --profile production
```

**Build time**: 10-20 minutes  
**Result**: You'll get a download link for the APK file

#### Step 4: Share the APK
Once the build completes:
1. Download the APK from the link provided
2. Upload to Google Drive, Dropbox, or your website
3. Share the link with anyone
4. Users can download and install directly on Android

**Note**: Users need to enable "Install from Unknown Sources" in Android settings

---

### Option 2: Expo Go (Quick Testing)
Users install Expo Go app and scan your QR code.

#### Requirements:
- Users must have Expo Go app installed
- Both you and users need internet connection

#### Steps:
```bash
# Start with tunnel mode for public access
npx expo start --tunnel
```

**Share**: Send the QR code or exp:// link to users  
**Limitation**: Users need Expo Go app, not standalone

---

### Option 3: Self-Hosted Web Version
Publish as a web app (if you add web support).

```bash
npx expo export:web
```

Then host the build folder on:
- Netlify
- Vercel
- GitHub Pages
- Your own server

---

## 📦 Recommended Approach: EAS Build APK

### Complete Build Process:

#### 1. Configure App Info
Update `app.json`:
```json
{
  "expo": {
    "name": "Pharmacy Bill Scanner",
    "slug": "pharmacy-bill-app",
    "version": "1.0.0",
    "android": {
      "package": "com.yourcompany.pharmacybillapp",
      "versionCode": 1
    }
  }
}
```

#### 2. Create Production Build
```bash
# First time - configure project
eas build:configure

# Build APK
eas build --platform android --profile production
```

#### 3. Download & Distribute
- EAS will provide a download link
- Download the APK (usually 30-50 MB)
- Share via:
  - Google Drive link
  - Dropbox link
  - WeTransfer
  - Your website
  - WhatsApp (if small enough)

#### 4. Users Install
1. Download APK on Android phone
2. Tap to install
3. Enable "Install from Unknown Sources" if prompted
4. App installs like any other app

---

## 🍎 For iOS Users

### Option A: TestFlight (Apple's Beta Testing)
```bash
eas build --platform ios --profile preview
```
- Requires Apple Developer account ($99/year)
- Can share with up to 10,000 testers
- Professional distribution method

### Option B: Expo Go
- Quick testing only
- Users need Expo Go app

---

## 🔥 Quick Start (Right Now)

### For Immediate Testing (Expo Go):
```bash
npx expo start --tunnel
```
Share QR code with anyone worldwide!

### For Production Distribution (APK):
```bash
npm install -g eas-cli
eas login
eas build --platform android --profile production
```
Get shareable APK link in 15-20 minutes!

---

## 💰 Cost Comparison

| Method | Cost | Best For |
|--------|------|----------|
| **EAS Build APK** | Free tier: 30 builds/month | Production-ready distribution |
| **Expo Go** | Free | Quick testing |
| **Play Store** | $25 one-time | Official public release |
| **TestFlight (iOS)** | $99/year | iOS beta testing |

---

## 🎬 Step-by-Step: Build Your First APK

Run these commands in order:

```bash
# 1. Install EAS CLI globally
npm install -g eas-cli

# 2. Login (create account if needed)
eas login

# 3. Configure project (first time only)
eas build:configure

# 4. Build production APK
eas build --platform android --profile production
```

**Wait 15-20 minutes**, then you'll get:
```
✔ Build finished
📦 APK: https://expo.dev/artifacts/eas/[your-download-link].apk
```

**Share that link** - anyone can download and install! 🎉

---

## 📱 User Installation Guide

Share this with your users:

### How to Install Pharmacy Bill Scanner APK

1. **Download**: Click the APK link on your Android phone
2. **Allow Unknown Sources**: 
   - When prompted, tap "Settings"
   - Enable "Install Unknown Apps" for your browser
3. **Install**: Tap "Install" button
4. **Open**: App appears in your app drawer
5. **Done**: Use the app normally!

**Note**: This is safe - the app is built by you, not from untrusted sources.

---

## 🔧 Troubleshooting

**Build fails?**
- Ensure app.json has correct package name
- Check internet connection
- Verify Expo account is active

**APK too large?**
- Remove unused dependencies
- Optimize images in assets/
- Use production build (automatically optimized)

**Users can't install?**
- Ensure Android 5.0+ (API 21+)
- Check "Unknown Sources" is enabled
- Try different browser for download

---

## 🚀 Next Steps

After building APK:
1. Test on multiple Android devices
2. Gather feedback from users
3. Update version in app.json
4. Rebuild with `eas build` when ready
5. When polished, consider Play Store release

---

## 📊 Distribution Tracking

To track downloads/installs, consider:
- Google Analytics (add to app)
- Firebase Analytics
- Custom analytics in your app

This helps understand user engagement before Play Store launch.
