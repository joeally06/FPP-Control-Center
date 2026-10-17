# 🎄 FPP Control Center

**A modern web interface for controlling Falcon Player (FPP) Christmas light shows with interactive visitor features.**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/joeally06/FPP-Control-Center/actions/workflows/ci.yml/badge.svg)](https://github.com/joeally06/FPP-Control-Center/actions/workflows/ci.yml)

---

## 🌟 What is FPP Control Center?

FPP Control Center is a **complete web-based control panel** for your Falcon Player (FPP) Christmas light display. It provides an interactive visitor experience while giving you full control over your show.

**Perfect for:**
- 🎅 **Residential Christmas Displays** - Let visitors request songs and write to Santa
- 🏢 **Commercial Light Shows** - Professional control with visitor engagement
- 🎪 **Community Events** - Public displays with interactive features
- 🏠 **Home Networks** - Simple local-only setup for family use

---

## ✨ Features

### 🎵 **Interactive Jukebox**
- **Song Requests** - Visitors can request their favorite sequences
- **Live Queue Display** - See what's playing now and what's coming up
- **Vote on Sequences** - Community voting for popular songs
- **Automatic Queue Management** - First-come, first-served with fair play
- **Rate Limiting** - Prevents spam (3 requests per hour per visitor)

### 🎅 **Santa Letter Generator**
- **AI-Powered Responses** - Personalized letters using Ollama AI
- **Email Delivery** - Parents confirm their email address with a link first; Santa's reply is sent only after they do
- **Admin Review** - Reject a letter before it's answered, edit replies and resend them
- **Queue Processing** - Handles multiple submissions gracefully
- **Rate Limiting** - Daily limit per email address and per visitor, plus a daily cap for all visitors together (Settings page)

### 📊 **Real-Time Monitoring**
- **Device Status** - Live FPP connection status
- **Playlist Monitoring** - See current playlist and schedule
- **Email Alerts** - Get notified when FPP goes offline
- **Scheduled Monitoring** - Only check during show hours
- **Performance Metrics** - Track uptime and reliability

### 🎛️ **Admin Dashboard**
- **Analytics** - Visitor engagement, popular sequences, request patterns
- **Queue Management** - View, reorder, or clear song requests
- **Database Tools** - Backup, maintenance, and statistics
- **Seasonal Themes** - Halloween and Christmas looks for the visitor page, each with your own uploaded logo and round badge (Theme Settings)
- **Security Settings** - Configure rate limits and access control

### 🔒 **Enterprise Security**
- **Google OAuth** - Secure admin authentication
- **Email Whitelist** - Restrict admin access to approved accounts
- **CSRF Protection** - Prevent cross-site request forgery
- **Rate Limiting** - Database-backed anti-spam system
- **Session Management** - Automatic timeout and refresh
- **HTTPS Ready** - Works with Cloudflare Tunnel for public deployment

### 🔄 **Automatic Updates**
- **One-Click Updates** - Update from admin dashboard
- **Atomic Updates** - 8-phase process with automatic rollback
- **Zero Downtime** - Survives service restarts
- **Automatic Backups** - Database saved before every update
- **Rollback Protection** - Automatically reverts failed updates
- **Manual Fallback** - SSH command: `./scripts/run-update.sh`

---

## 📋 System Requirements

### **Required:**
- **Linux or macOS** - Raspberry Pi, Ubuntu, Debian, or Mac
- **Node.js 20+** - Download from [nodejs.org](https://nodejs.org/)
- **npm 10+** - Included with Node.js
- **Git** - Version control system

> **✨ New!** The setup wizard can automatically install Node.js and Git if missing

### **Optional:**
- **PM2** - Process manager for production (Linux/Mac)
- **Ollama** - AI for Santa letters ([ollama.ai](https://ollama.ai/))
- **SMTP Email** - For Santa letter delivery and alerts
- **Domain Name** - For public internet access via Cloudflare Tunnel

---

## 🔧 BEFORE YOU BEGIN: Gather Your Credentials

> **⚠️ IMPORTANT:** Complete these steps FIRST before running the setup wizard! The wizard will ask for these values and you'll save time by having them ready.

The setup wizard will ask for credentials from several services. **Set up these accounts and gather the following information before you start:**

---

### 📋 Pre-Setup Checklist

| Service | Required? | What You'll Need |
|---------|-----------|------------------|
| **Google OAuth** | ✅ Required | Client ID, Client Secret |
| **Spotify API** | ✅ Required | Client ID, Client Secret |
| **FPP Server** | ✅ Required | IP Address (e.g., 192.168.1.100) |
| **Gmail SMTP** | 🟡 Optional | Gmail address, App Password |
| **Ollama AI** | 🟡 Optional | Just install, no credentials needed |
| **Cloudflare** | 🟡 Optional | Domain name, Cloudflare account |

---

### 1️⃣ Google OAuth Setup (Required - ~10 minutes)

Google OAuth provides secure admin authentication.

#### Step 1: Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. **Project name:** `FPP Control Center`
4. Click **Create** and wait ~30 seconds
5. Select your new project

#### Step 2: Configure OAuth Consent Screen

1. Navigate: **APIs & Services** → **OAuth consent screen**
2. Select **External** → Click **Create**
3. Fill in:
   - **App name:** `FPP Control Center`
   - **User support email:** Your email
   - **Developer contact:** Your email
4. Click **Save and Continue** through all steps
5. On **Test users**: Add your admin email(s)

#### Step 3: Create OAuth Credentials

1. Navigate: **Credentials** → **+ Create Credentials** → **OAuth client ID**
2. **Application type:** Web application
3. **Name:** `FPP Control`
4. **Authorized redirect URIs:** Add these based on your setup:

   **For Local Network:**
   ```
   http://localhost:3000/api/auth/callback/google
   http://YOUR_IP:3000/api/auth/callback/google
   ```
   
   **For Public (Cloudflare Tunnel):**
   ```
   https://yourdomain.com/api/auth/callback/google
   ```

5. Click **Create**

#### Step 4: Save Your Credentials

Copy and save these values:
```
GOOGLE_CLIENT_ID=414031818307-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxx
```

---

### 2️⃣ Spotify API Setup (Required - ~5 minutes)

Spotify API fetches song metadata (artist, album art, etc.) for the jukebox.

#### Step 1: Create Developer Account

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account (or create a free one)

#### Step 2: Create an App

1. Click **Create App**
2. Fill in:
   - **App name:** `FPP Control Center`
   - **App description:** `Christmas light show jukebox`
   - **Redirect URI:** `http://localhost:3000` (required but not used)
   - **APIs:** Select **Web API**
3. Check the terms boxes
4. Click **Save**

#### Step 3: Get Your Credentials

1. Click **Settings** (top right of your app)
2. Copy your credentials:

```
SPOTIFY_CLIENT_ID=e18f418eb4b94dce909022ffea242dcf
SPOTIFY_CLIENT_SECRET=f84316021d314effb08f637972994ccd
```

---

### 3️⃣ Gmail SMTP Setup (Optional - ~5 minutes)

Required for Santa letter email delivery and FPP offline alerts.

#### Step 1: Enable 2-Factor Authentication

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already enabled

#### Step 2: Create App Password

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. **Select app:** Other (custom name)
3. **Name:** `FPP Control Center`
4. Click **Generate**
5. **Copy the 16-character password** (format: `abcd efgh ijkl mnop`)

> ⚠️ **This password is shown only once!** Save it now.

#### Step 3: Save Your Credentials

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourname@gmail.com
SMTP_PASS=abcdefghijklmnop  (no spaces)
```

---

### 4️⃣ Ollama AI Setup (Optional - ~10 minutes)

Ollama provides local AI for generating personalized Santa letter responses.

#### Linux Installation

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Download the model
ollama pull llama3.2

# Start the service
ollama serve
```

#### macOS Installation

1. Download from [ollama.ai](https://ollama.ai/)
2. Install and run Ollama
3. Open Terminal:
   ```bash
   ollama pull llama3.2
   ```

#### Save Your Configuration

```
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

---

### 5️⃣ Cloudflare Tunnel Setup (Optional - For Public Access)

Cloudflare Tunnel provides free HTTPS access to your site from anywhere, without port forwarding.

#### Prerequisites

- A domain name managed by Cloudflare (free to transfer)
- A free Cloudflare account at [cloudflare.com](https://www.cloudflare.com/)

#### Quick Setup (After Main Installation)

Run this after the main setup wizard completes:

```bash
./scripts/setup-cloudflare-tunnel.sh
```

#### ⚠️ CRITICAL: Geolocation Permission Header

**If using Cloudflare Tunnel, you MUST configure this header or voting/song requests won't work!**

The browser needs permission to use geolocation. Cloudflare blocks this by default.

##### Configure in Cloudflare Dashboard:

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select your domain
3. Navigate to: **Rules** → **Transform Rules** → **Modify Response Header**
4. Click **+ Create rule**
5. Configure:

   | Setting | Value |
   |---------|-------|
   | **Rule name** | `Allow Geolocation` |
   | **When incoming requests match** | All incoming requests |
   | **Then** | Set static |
   | **Header name** | `Permissions-Policy` |
   | **Value** | `camera=(), microphone=(), geolocation=(self)` |

6. Click **Deploy**

##### Verify It's Working

```bash
curl -I https://yourdomain.com | grep -i permissions-policy
```

Expected output:
```
permissions-policy: camera=(), microphone=(), geolocation=(self)
```

---

### 📝 Your Credentials Summary

Before starting setup, you should have:

```env
# ===== REQUIRED =====

# Admin Email(s) - comma-separated for multiple admins
ADMIN_EMAILS=yourname@gmail.com

# FPP Server
FPP_URL=http://192.168.1.100

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret

# Spotify API
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# ===== OPTIONAL =====

# Gmail SMTP (for Santa letters and alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=your-16-char-app-password

# Ollama AI (for Santa letters)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Public Domain (if using Cloudflare Tunnel)
NEXTAUTH_URL=https://yourdomain.com
```

---

## 🚀 Quick Start

Now that you have your credentials ready, installation is easy!

### **Automated Setup (Recommended)**

```bash
git clone https://github.com/joeally06/FPP-Control-Center.git
cd FPP-Control-Center
chmod +x setup.sh
./setup.sh
```

The interactive wizard walks you through everything in **10-15 minutes**.

### **Manual Setup**

See the complete [INSTALLATION.md](docs/INSTALLATION.md) guide for step-by-step instructions.

---

## 🌐 Deployment Options

### **Local Network Only**
- Simple setup, no domain required
- Access from home network: `http://YOUR_IP:3000`
- Perfect for residential displays
- **Setup time:** 10 minutes

### **Public Internet**
- Access from anywhere: `https://yourdomain.com`
- Free HTTPS via Cloudflare Tunnel
- No port forwarding required
- **Setup time:** 20 minutes (includes tunnel setup)

---

## CI and Tests ✅

This project includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on push and pull requests for `main`/`master` and performs the following checks:

- Installs dependencies via `npm ci`
- Lints the code (`npm run lint`)
- Builds the project (`npm run build`) with dummy env vars for CI
- Runs the TypeScript test scripts under `scripts/` that validate migrations, jukebox queue behaviour, SQL request counting, and SMTP retry/backoff
- Runs a CI security validation script, `scripts/check-security.js`, that verifies production-critical environment variables like `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are present or warns in CI.

To run the same validation locally, use:

```bash
npm ci
npm run lint
npm run build
npm run test:ci
```

The `test:ci` script runs the project's TypeScript test files sequentially and places test database files in `./tmp/`.

---

## 📚 Documentation

- **📋 [INSTALLATION.md](docs/INSTALLATION.md)** - Complete setup guide with every detail
- **🌐 [CLOUDFLARE-TUNNEL.md](docs/CLOUDFLARE-TUNNEL.md)** - Public deployment guide
- **🔒 [SECURITY.md](SECURITY.md)** - Security features and implementation
- **🐛 [Troubleshooting](docs/INSTALLATION.md#-troubleshooting)** - Common issues and solutions

---

## 🎯 How It Works

### **For Visitors:**
1. Visit your website (local or public)
2. Browse available sequences
3. Request their favorite song
4. Write a letter to Santa (optional)
5. Vote on sequences they love

### **For Admins:**
1. Log in with Google OAuth
2. Monitor FPP device status
3. Review and manage song requests
4. Review Santa letters (reject any that shouldn't get a reply)
5. View analytics and engagement

### **Backend:**
- **SQLite Database** - Fast, reliable, maintenance-free
- **Rate Limiting** - Prevents spam and abuse
- **Queue Processing** - Automated letter generation and email
- **Scheduled Tasks** - Database maintenance, monitoring
- **Security Middleware** - CSRF, session management, input validation

---

## 🔧 Technology Stack

**Frontend:**
- Next.js 16 (React framework)
- Tailwind CSS (styling)
- Responsive design (mobile-friendly)

**Backend:**
- Next.js API routes
- SQLite (better-sqlite3)
- NextAuth (Google OAuth)
- Nodemailer (email)

**Optional Integrations:**
- Ollama (AI Santa letters)
- Cloudflare Tunnel (public HTTPS)
- PM2 (process management)

---

## 🆘 Support

### **Getting Help:**
- 📖 Check [INSTALLATION.md](docs/INSTALLATION.md) for setup issues
- 🐛 [GitHub Issues](https://github.com/joeally06/FPP-Control-Center/issues) for bugs
- 💬 [Discussions](https://github.com/joeally06/FPP-Control-Center/discussions) for questions

### **Common Issues:**
- **Setup wizard won't run** → See [Troubleshooting](docs/INSTALLATION.md#-troubleshooting)
- **OAuth not working** → Check redirect URIs in Google Console
- **FPP connection failed** → Verify FPP IP address and network
- **Email not sending** → Verify SMTP credentials and ports
- **Geolocation not working** → Configure Cloudflare Permissions-Policy header (see above)

---

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🎉 Credits

**Built with love for the Christmas light community**

**Technologies:**
- [Next.js](https://nextjs.org/) - React framework
- [Falcon Player](https://github.com/FalconChristmas/fpp) - Light show controller
- [Ollama](https://ollama.ai/) - AI for Santa letters
- [Cloudflare](https://www.cloudflare.com/) - Public access and security
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [SQLite](https://www.sqlite.org/) - Database

**Special Thanks:**
- Falcon Christmas community
- All contributors and testers

---

## 🎄 Happy Holidays!

**Made with ❤️ by Joe Ally**

Star ⭐ this repo if you found it helpful!

**Questions?** Open an [issue](https://github.com/joeally06/FPP-Control-Center/issues) or [discussion](https://github.com/joeally06/FPP-Control-Center/discussions).
