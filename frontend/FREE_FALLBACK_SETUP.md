# Free AI Fallback Setup

## Overview
The app now supports a **free fallback** using Groq API when Gemini fails or is unavailable.

## How It Works

### Priority Order:
1. **Gemini API** (Primary - Paid but more accurate)
2. **Groq API** (Fallback - FREE with generous limits)
3. **Local Parser** (Last resort - basic regex-based parsing)

## Setup Groq Free API

### Step 1: Get Free API Key
1. Visit: https://console.groq.com
2. Sign up for a free account
3. Go to API Keys section
4. Create a new API key

### Step 2: Add to Environment
Open `.env` file and add your Groq API key:

```env
EXPO_PUBLIC_GROQ_API_KEY=gsk_your_api_key_here
```

### Step 3: Restart App
```bash
npx expo start -c
```

## Groq Free Tier Benefits

✅ **Completely FREE** - No credit card required  
✅ **Fast inference** - Often faster than Gemini  
✅ **Generous limits** - 14,400 requests/day on free tier  
✅ **Multiple models** - Using Llama 3.3 70B (very capable)  
✅ **High quality** - Comparable accuracy to paid services  

## Usage

The app automatically:
1. Tries Gemini first (if API key available)
2. Falls back to Groq if Gemini fails
3. Uses local parser if both fail

No code changes needed - it's all automatic!

## Cost Comparison

| Service | Cost | Speed | Accuracy |
|---------|------|-------|----------|
| Gemini | $0.15-0.60/1M tokens | Fast | Excellent |
| Groq | **FREE** (14.4k req/day) | Very Fast | Very Good |
| Local Parser | FREE | Instant | Basic |

## Recommendations

For best results:
- Add both Gemini AND Groq API keys
- Gemini will be used primarily
- Groq provides reliable free backup
- Local parser handles edge cases

## Troubleshooting

**Issue**: Groq not working  
**Solution**: Check API key in .env file, ensure it starts with `gsk_`

**Issue**: Both APIs failing  
**Solution**: Check internet connection, verify API keys are valid

**Issue**: Getting local parser results  
**Solution**: Both API keys missing or invalid - add at least Groq key
