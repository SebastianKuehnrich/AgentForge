# 🚀 Railway Deployment Guide

## Prerequisites

- GitHub Account
- Railway Account (sign up at railway.app)
- OpenAI API Key
- OpenWeather API Key (optional)

---

## Step 1: Prepare Your Repository

### 1.1 Create GitHub Repository
```bash
# In your project folder
git init
git add .
git commit -m "Initial commit: AI Multi-Tool Agent"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 1.2 Verify Files

Make sure these files exist:
- ✅ server.ts
- ✅ public/index.html
- ✅ public/style.css
- ✅ package.json
- ✅ .gitignore
- ✅ .env.example (not .env!)
- ✅ Procfile

---

## Step 2: Railway Setup

### 2.1 Create New Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository

### 2.2 Configure Build

Railway should auto-detect Bun. If not:

**Settings → Build:**
- Build Command: `bun install`
- Start Command: `bun run server.ts`

---

## Step 3: Environment Variables

### 3.1 Add Variables

Go to **Variables** tab and add:
```
OPENAI_API_KEY=sk-your-key-here
OPENWEATHER_API_KEY=your-weather-key-here
PORT=3000
```

### 3.2 Important Notes

- ✅ PORT is automatically set by Railway (but 3000 as fallback is fine)
- ✅ Never commit .env to GitHub
- ✅ Weather API is optional - agent works without it

---

## Step 4: Deploy

### 4.1 Trigger Deployment

Railway deploys automatically when you push to main:
```bash
git add .
git commit -m "Deploy to Railway"
git push
```

### 4.2 Monitor Deployment

1. Watch the **Deployments** tab
2. Check logs for errors
3. Wait for "✓ Deployment successful"

---

## Step 5: Access Your App

### 5.1 Get Your URL

1. Go to **Settings** tab
2. Click "Generate Domain"
3. Your app will be at: `your-app-name.up.railway.app`

### 5.2 Test
```bash
# Health check
curl https://your-app-name.up.railway.app/health

# Should return:
{
  "status": "ok",
  "tools": 11,
  "timestamp": "2024-01-09T..."
}
```

---

## Step 6: Verify Tools

Open your Railway URL in browser and test:

1. ✅ "Was ist 25 * 4?"
2. ✅ "Wie spät ist es?"
3. ✅ "Wie ist das Wetter in Berlin?"
4. ✅ "Berechne MwSt für 100 Euro in Deutschland"
5. ✅ "Generiere ein Passwort mit 16 Zeichen"

---

## Troubleshooting

### Issue: Build Failed

**Solution:** Check package.json has all dependencies
```bash
bun install
bun run server.ts  # Test locally first
```

### Issue: App Crashes on Start

**Solution:** Check Railway logs
1. Go to Deployments tab
2. Click latest deployment
3. View logs
4. Look for errors

Common errors:
- Missing OPENAI_API_KEY
- Port binding issues (Railway sets PORT automatically)
- Import errors

### Issue: Tools Not Working

**Check:**
- ✅ Environment variables set correctly
- ✅ OpenAI API key valid
- ✅ Sufficient API credits

### Issue: Weather Tool Fails

**Solution:**
- Add OPENWEATHER_API_KEY to Railway variables
- Or: Weather tool will gracefully fail without affecting other tools

---

## Cost Estimates

### Railway
- **Free Tier:** $5 credit/month
- **Hobby Plan:** $5/month
- Typical usage: ~$2-3/month for this app

### OpenAI
- GPT-4o-mini: $0.150 per 1M tokens
- Typical session: $0.0003
- 1000 sessions/month: ~$0.30

### OpenWeather
- Free Tier: 1M calls/month
- Cost: $0 (FREE)

**Total:** ~$5-10/month depending on usage

---

## Updating Your Deployment
```bash
# Make changes locally
# Test locally: bun run server.ts

# Commit and push
git add .
git commit -m "Update: your changes"
git push

# Railway auto-deploys!
```

---

## Custom Domain (Optional)

### Add Your Domain

1. Go to **Settings** → **Domains**
2. Click "Custom Domain"
3. Add your domain
4. Update DNS records:
    - Type: CNAME
    - Name: @ or www
    - Value: your-app.up.railway.app

---

## Monitoring

### Check Metrics

Railway provides:
- CPU usage
- Memory usage
- Network traffic
- Request logs

Access via **Metrics** tab

### Set Up Alerts

Railway will email you if:
- Deployment fails
- App crashes
- Credit runs low

---

## Security Best Practices

1. ✅ Never commit .env file
2. ✅ Rotate API keys regularly
3. ✅ Use environment variables for secrets
4. ✅ Monitor usage/costs
5. ✅ Set up rate limiting (future enhancement)

---

## Next Steps

1. Add more tools
2. Implement user authentication
3. Add conversation history
4. Create admin dashboard
5. Add analytics

---

## Support

**Railway Issues:** https://help.railway.app
**OpenAI Issues:** https://help.openai.com
**Project Issues:** GitHub Issues on your repo

---

**🎉 You're Live!**

Share your URL:
- Portfolio
- LinkedIn
- Resume
- Demo presentations