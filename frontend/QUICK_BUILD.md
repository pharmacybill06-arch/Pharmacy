# 🚀 Quick Commands for Public Distribution

## FASTEST WAY - Get APK Link in 20 Minutes

### Step 1: Install EAS CLI (One Time Only)
```powershell
npm install -g eas-cli
```

### Step 2: Login to Expo
```powershell
eas login
```
Create free account at expo.dev if you don't have one.

### Step 3: Build APK
```powershell
eas build --platform android --profile production
```

**Wait 15-20 minutes** ⏱️

You'll get:
```
✔ Build finished
📦 Download: https://expo.dev/artifacts/eas/xxxxx.apk
```

### Step 4: Share the Link
✅ Copy that APK link  
✅ Send to anyone  
✅ They download & install  
✅ Done!

---

## FOR INSTANT TESTING (Right Now)

If you want to test immediately with Expo Go:

```powershell
npx expo start --tunnel
```

This creates a public URL that works from anywhere in the world!  
Users need Expo Go app, but it's instant.

---

## WHICH METHOD SHOULD I USE?

### Use **EAS Build APK** if:
✅ You want a proper standalone app  
✅ Users should NOT need Expo Go  
✅ Professional distribution  
✅ App works offline after install  

### Use **Expo Tunnel** if:
✅ Quick testing only  
✅ Don't mind users installing Expo Go  
✅ Need to demo RIGHT NOW  

**Recommendation**: Use EAS Build for real distribution!

---

## Complete First-Time Setup

Run these in PowerShell:

```powershell
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login (creates account if needed)
eas login

# 3. Configure project (first time)
eas build:configure

# 4. Build Android APK
eas build --platform android --profile production

# Wait for build...
# You'll get an APK download link!
```

---

## After Building

### Download APK:
The build will give you a link like:
```
https://expo.dev/artifacts/eas/AbCdEfGh1234.apk
```

### Share APK:
1. **Direct Link**: Share the Expo link (expires in 30 days)
2. **Upload**: Download APK, upload to Google Drive/Dropbox
3. **WhatsApp**: Send file directly (if under 100MB)
4. **Website**: Host on your server

### Users Install:
1. Download APK on Android phone
2. Tap to install
3. Enable "Unknown Sources" if asked
4. Use app normally!

---

## Check Build Status

```powershell
# View all builds
eas build:list

# View specific platform
eas build:list --platform android
```

---

## Update App Later

When you make changes:

```powershell
# Update version in app.json first
# Change "version": "1.0.0" to "1.0.1"

# Then rebuild
eas build --platform android --profile production
```

Users will need to download and reinstall the new APK.

---

## Free Tier Limits

Expo EAS Free Plan:
- ✅ 30 builds per month
- ✅ Unlimited users can download
- ✅ No expiration on builds
- ✅ Full features

More than enough for development and testing!

---

## Need Help?

**Build failed?**
```powershell
eas build --platform android --profile production --clear-cache
```

**Check logs:**
```powershell
eas build:list
# Click on build ID to see logs
```

**Start over:**
```powershell
eas build:configure
eas build --platform android --profile production
```
