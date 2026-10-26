#  FPP Control Center - Complete Installation Guide

This guide walks you through **every step** of installing and configuring FPP Control Center on **Linux or macOS** systems.

> **Note:** FPP Control Center is designed for Linux (Raspberry Pi, Ubuntu, Debian, CentOS, Fedora) and macOS environments where FPP runs.

**Estimated Time:**
- **Local Network Setup:** 15-20 minutes
- **Public Internet Setup:** 30-40 minutes (includes Cloudflare Tunnel)

---

## 📑 Table of Contents

1. [Prerequisites](#-prerequisites)
2. [Installation Methods](#-installation-methods)
3. [Step-by-Step Setup](#-step-by-step-setup)
4. [Google OAuth Configuration](#-google-oauth-configuration)
5. [Spotify API Configuration](#-spotify-api-configuration)
6. [Email Configuration](#-email-configuration-optional)
7. [Cloudflare Tunnel Setup](#-cloudflare-tunnel-setup-public-access)
8. [Post-Installation](#-post-installation)
9. [Troubleshooting](#-troubleshooting)
10. [Advanced Configuration](#-advanced-configuration)

---

##  Prerequisites

Before installing FPP Control Center, ensure you have the required software installed.

> **Supported Platforms:** Linux (Raspberry Pi, Ubuntu, Debian, CentOS, Fedora) and macOS

### Required Software

#### 1 **Node.js 20+ and npm**

Node.js is the runtime environment. npm (Node Package Manager) is included automatically.

**Check if already installed:**
```bash
node --version   # Should show v20.0.0 or higher
npm --version    # Should show 10.0.0 or higher
```

**Installation by Platform:**

<details>
<summary><strong>macOS</strong></summary>

**Option 1: Homebrew (Recommended)**
```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 20
brew install node@20
brew link --overwrite node@20
```

**Option 2: Official Installer**
1. Download from [nodejs.org](https://nodejs.org/) (LTS version)
2. Run the installer
3. Follow prompts

**Verify:**
```bash
node --version
npm --version
```
</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

> ** The setup wizard can install this automatically!** Just run `./setup.sh` and it will detect missing Node.js and offer to install it.

**Manual installation:**
```bash
# Remove old versions
sudo apt-get remove -y nodejs npm

# Add NodeSource repository for Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```
</details>

<details>
<summary><strong>Linux (CentOS/RHEL/Fedora)</strong></summary>

> ** The setup wizard can install this automatically!** Just run `./setup.sh` and it will detect missing Node.js and offer to install it.

**Manual installation:**
```bash
# Remove old versions
sudo yum remove -y nodejs npm

# Add NodeSource repository
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -

# Install Node.js
sudo yum install -y nodejs

# Verify
node --version
npm --version
```
</details>

---

#### 2 **Git**

Git is used to download the code and receive updates.

**Check if already installed:**
```bash
git --version
```

**Installation by Platform:**

<details>
<summary><strong>macOS</strong></summary>

**Option 1: Homebrew**
```bash
brew install git
```

**Option 2: Xcode Command Line Tools**
```bash
xcode-select --install
```

**Verify:**
```bash
git --version
```
</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

> ** The setup wizard can install this automatically!**

**Manual installation:**
```bash
sudo apt-get update
sudo apt-get install -y git
git --version
```
</details>

<details>
<summary><strong>Linux (CentOS/RHEL/Fedora)</strong></summary>

> ** The setup wizard can install this automatically!**

**Manual installation:**
```bash
sudo yum install -y git
git --version
```
</details>

---

### Optional Software

#### 3 **PM2 (Production Only)**

PM2 keeps your application running 24/7, auto-restarts on crashes, and starts on system boot.

**When needed:** Production servers only. Not needed for development.

**Installation:**
```bash
sudo npm install -g pm2
pm2 --version
```

---

#### 4 **Ollama (AI Santa Letters - Optional)**

Ollama provides local AI for generating personalized Santa letter responses.

**When needed:** Only if you want AI-powered Santa letters.

**Installation:**

<details>
<summary><strong>macOS</strong></summary>

1. Download from [ollama.ai](https://ollama.ai/)
2. Install and run Ollama
3. Download model:
   ```bash
   ollama pull llama3.2
   ```
</details>

<details>
<summary><strong>Linux</strong></summary>

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Download model
ollama pull llama3.2

# Start service
ollama serve
```
</details>

---

###  Verify Prerequisites

Before continuing, verify everything is ready:

```bash
# Required
node --version   # Must be v20.0.0+
npm --version    # Must be 10.0.0+
git --version    # Any version

# Optional
pm2 --version    # Production only
ollama --version # AI letters only
```

**All commands should return version numbers.** If "command not found", revisit that section above.

---

##  Installation Methods

Choose your preferred installation method:

### **Method 1: Automated Setup Wizard**  **Recommended**

**Best for:** Everyone, especially first-time users

**Pros:**
-  Fastest (10-15 minutes)
-  Walks through each step
-  Auto-installs missing dependencies (Linux/Mac)
-  Validates configuration

**Continue to:** [Automated Setup](#method-1-automated-setup-wizard-1)

---

### **Method 2: Manual Installation**

**Best for:** Developers, advanced users, custom configurations

**Pros:**
-  Full control
-  Understand each step
-  Easier troubleshooting

**Continue to:** [Manual Installation](#method-2-manual-installation-1)

---

##  Step-by-Step Setup

### Method 1: Automated Setup Wizard

#### **Step 1: Clone Repository**

```bash
# Navigate to install location
cd ~

# Clone repository
git clone https://github.com/joeally06/FPP-Control-Center.git

# Enter directory
cd FPP-Control-Center
```

---

#### **Step 2: Run Setup Wizard**

```bash
chmod +x setup.sh
./setup.sh
```

---

#### **Step 3: Follow Wizard Prompts**

The wizard guides you through 8 steps. Here's what to expect:

<details>
<summary><strong>Step 1/8: System Check</strong></summary>

```
Step 1/8: System Requirements


 Operating system: linux 
 Node.js v20.11.0 
 npm 10.2.4 
 git 2.39.2 
```

**If dependencies missing:**
- The wizard detects them
- Offers automatic installation (Linux/Mac)
- You can decline and install manually

**Action:** Press Enter to continue
</details>

<details>
<summary><strong>Step 2/8: Installation Type</strong></summary>

```
Step 2/8: Choose Installation Type


How do you plan to access FPP Control Center?

1) Local Network Only (home network)
2) Public Internet (Cloudflare Tunnel)

Enter choice (1 or 2):
```

**Choose:**
- `1` for home displays (access from local network)
- `2` for public displays (access from anywhere)

**Action:** Enter `1` or `2`
</details>

<details>
<summary><strong>Step 3/8: Dependencies</strong></summary>

```
Step 3/8: Installing Dependencies


 Installing npm packages...
```

Automatically installs ~200MB of packages (2-3 minutes).

**Action:** Wait for completion
</details>

<details>
<summary><strong>Step 4/8: Database Setup</strong></summary>

```
Step 4/8: Database Setup


 Initializing SQLite database...
 Database created
 Migrations applied
 Indexes optimized
```

Automatic - no input needed.

**Action:** Wait for completion
</details>

<details>
<summary><strong>Step 5/8: Google OAuth</strong></summary>

```
Step 5/8: Google OAuth Configuration


Google OAuth is required for admin authentication.

Do you want to configure OAuth now? (y/n):
```

**Recommended:** Choose `y` and configure now  
**Alternative:** Choose `n` to skip (configure later)

See [Google OAuth Configuration](#-google-oauth-configuration) for detailed setup.

**Action:** Enter `y` or `n`
</details>

<details>
<summary><strong>Step 6/8: Environment Variables</strong></summary>

The wizard asks for:

**Admin Email:**
```
Enter your admin email (for admin access):
```
Example: `yourname@gmail.com`

**Google OAuth (if Step 5 was Yes):**
```
Enter Google Client ID:
Enter Google Client Secret:
```
Paste the credentials from Google Console.

**FPP Server IP:**
```
Enter your FPP server IP address:
```
Example: `192.168.1.100`

**Timezone:**
```
Select timezone:
1) America/New_York (Eastern)
2) America/Chicago (Central)
3) America/Denver (Mountain)
4) America/Los_Angeles (Pacific)
...
```
Choose your number.

**Email (Optional):**
```
Configure email for Santa letters and alerts? (y/n):
```

If Yes, provide:
- SMTP host (e.g., `smtp.gmail.com`)
- SMTP port (e.g., `587`)
- Email address
- App password (see [Email Configuration](#-email-configuration-optional))

**Domain (Public Only):**
```
Enter your domain name:
```
Example: `lightshow.example.com`

**Action:** Answer each prompt carefully
</details>

<details>
<summary><strong>Step 7/8: Build Application</strong></summary>

```
Step 7/8: Building Application


 Compiling Next.js for production...
```

Creates optimized production build (2-5 minutes).

**Action:** Wait for completion
</details>

<details>
<summary><strong>Step 8/8: Start Application</strong></summary>

```
Step 8/8: Starting Application


 Starting with PM2...
 Application started

Access your FPP Control Center:
  Local:   http://localhost:3000
  Network: http://192.168.1.100:3000
```

**Action:** Note the URLs
</details>

---

#### **Step 4: Access Your Site**

Open browser and visit:
- **This computer:** `http://localhost:3000`
- **Other devices:** `http://YOUR_IP:3000`

 **Setup complete!**

---

### Method 2: Manual Installation

<details>
<summary><strong>Click to expand manual installation steps</strong></summary>

#### **Step 1: Clone Repository**

```bash
cd ~
git clone https://github.com/joeally06/FPP-Control-Center.git
cd FPP-Control-Center
```

#### **Step 2: Install Dependencies**

```bash
npm install
```

#### **Step 3: Create Configuration**

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Admin email
ADMIN_EMAILS=yourname@gmail.com

# FPP server
FPP_URL=http://192.168.1.100

# Timezone
NEXT_PUBLIC_TIMEZONE=America/Chicago

# Google OAuth (see OAuth section)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# NextAuth secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=your-app-password
```

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

#### **Step 4: Initialize Database**

```bash
npm run setup
```

#### **Step 5: Build Application**

```bash
npm run build
```

#### **Step 6: Start Application**

**Development:**
```bash
npm run dev
```

**Production (with PM2):**
```bash
pm2 start npm --name "fpp-control" -- start
pm2 save
pm2 startup
```

</details>

---

##  Google OAuth Configuration

Google OAuth provides secure admin authentication without managing passwords.

### **Why Google OAuth?**

-  **Secure** - Industry-standard authentication
-  **No Passwords** - No need to store or manage credentials  
-  **Email Whitelist** - Only approved admins can access
-  **Free** - No cost for personal use

### **Step-by-Step Setup**

#### **Step 1: Create Google Cloud Project**

1. **Go to Google Cloud Console:**  
   [console.cloud.google.com](https://console.cloud.google.com/)

2. **Create a new project:**
   - Click "Select a project"  "New Project"
   - **Project name:** `FPP Control Center`
   - **Organization:** Leave as "No organization"
   - Click **Create**
   - Wait for project creation (~30 seconds)

3. **Select your project:**
   - Click "Select a project"
   - Choose "FPP Control Center"

---

#### **Step 2: Configure OAuth Consent Screen**

1. **Navigate to OAuth consent screen:**
   - Left sidebar  **APIs & Services**  **OAuth consent screen**

2. **Choose user type:**
   - Select **External**
   - Click **Create**

3. **Fill in App Information:**
   - **App name:** `FPP Control Center`
   - **User support email:** Your email address
   - **App logo:** (Optional - skip for now)
   - **Application home page:** `http://localhost:3000` (or your domain if public)
   - **Developer contact information:** Your email address

4. **Click Save and Continue**

5. **Scopes (Step 2):**
   - Click **Save and Continue** (no changes needed)

6. **Test users (Step 3):**
   - Click **+ Add Users**
   - Add your admin email address(es)
   - Click **Save and Continue**

7. **Summary (Step 4):**
   - Review and click **Back to Dashboard**

---

#### **Step 3: Create OAuth Credentials**

1. **Navigate to Credentials:**
   - Left sidebar  **Credentials**

2. **Create OAuth Client ID:**
   - Click **+ Create Credentials**  **OAuth client ID**

3. **Configure OAuth Client:**
   - **Application type:** Web application
   - **Name:** `FPP Control`

4. **Add Authorized Redirect URIs:**

   **For Local Network Installation:**
   ``
   http://localhost:3000/api/auth/callback/google
   http://YOUR_SERVER_IP:3000/api/auth/callback/google
   ``
   
   Replace `YOUR_SERVER_IP` with your actual IP (e.g., `192.168.1.100`)

   **For Public Installation (Cloudflare Tunnel):**
   ``
   https://yourdomain.com/api/auth/callback/google
   ``
   
   Replace `yourdomain.com` with your actual domain

5. **Click Create**

---

#### **Step 4: Copy Credentials**

After creation, you'll see a dialog with:

- **Client ID:** `414031818307-xxxxxxxx.apps.googleusercontent.com`
- **Client Secret:** `GOCSPX-xxxxxxxxxxxxxxxxx`

** Copy both values** - you'll need them for configuration.

---

#### **Step 5: Update .env.local**

Add your OAuth credentials to `.env.local`:

``env
# Google OAuth
GOOGLE_CLIENT_ID=414031818307-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxx

# Admin email(s) - comma-separated
ADMIN_EMAILS=yourname@gmail.com,othername@gmail.com
``

---

#### **Step 6: Restart Application**

``bash
# If using PM2:
pm2 restart fpp-control

# If using npm run dev:
# Press Ctrl+C, then:
npm run dev
``

---

#### **Step 7: Test OAuth Login**

1. Visit your site
2. Click **Admin Login**
3. You should be redirected to Google
4. Sign in with an email from `ADMIN_EMAILS`
5. Grant permissions
6. You should be redirected back and logged in as admin

 **OAuth is now configured!**

---

### **Troubleshooting OAuth**

<details>
<summary><strong>Error: Redirect URI mismatch</strong></summary>

**Cause:** The redirect URI doesn't match what you configured.

**Solution:**
1. Go to Google Cloud Console  Credentials
2. Edit your OAuth client
3. Verify redirect URIs match exactly:
   - For local: `http://localhost:3000/api/auth/callback/google`
   - For public: `https://yourdomain.com/api/auth/callback/google`
4. Save changes
5. Clear browser cookies and try again
</details>

<details>
<summary><strong>Error: Access blocked</strong></summary>

**Cause:** Your email is not in the `ADMIN_EMAILS` list.

**Solution:**
1. Edit `.env.local`
2. Add your email to `ADMIN_EMAILS`
3. Restart application
4. Try logging in again
</details>

<details>
<summary><strong>Error: This app hasn't been verified</strong></summary>

**Cause:** App is in testing mode (normal for personal use).

**Solution:**
1. Click **Advanced**
2. Click **Go to FPP Control Center (unsafe)**
3. Grant permissions

This warning only appears the first time and is safe to ignore for personal projects.
</details>

---

## 🎵 Spotify API Configuration

Spotify API is **REQUIRED** for the jukebox feature to fetch song metadata (artist, album, cover art, etc.).

### **Why Spotify API?**

- ✅ **Rich Metadata** - Artist names, album info, cover art
- ✅ **Free Tier** - No cost for API usage
- ✅ **No Limits** - Sufficient quota for personal use
- ✅ **Fast Lookup** - Quick song information retrieval

### **Step-by-Step Setup**

#### **Step 1: Create Spotify Developer Account**

1. **Go to Spotify Developer Dashboard:**  
   [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)

2. **Log in:**
   - Use your existing Spotify account (Free or Premium)
   - Or create a new Spotify account (free)

---

#### **Step 2: Create an App**

1. **Click "Create App"**

2. **Fill in App Information:**
   - **App name:** `FPP Control Center`
   - **App description:** `Christmas light show jukebox and control system`
   - **Redirect URI:** `http://localhost:3000` (required but not used)
   - **Which API/SDKs are you planning to use?** Select **Web API**

3. **Agree to Terms:** Check the boxes

4. **Click "Save"**

---

#### **Step 3: Get Your Credentials**

1. **Click "Settings"** (top right of your app page)

2. **Copy Your Credentials:**
   - **Client ID:** `e18f418eb4b94dce909022ffea242dcf` (example)
   - **Client Secret:** Click "View client secret" → Copy the value

⚠️ **Keep your Client Secret private!** Don't share it publicly.

---

#### **Step 4: Update .env.local**

Add your Spotify credentials to `.env.local`:

```env
# Spotify API
SPOTIFY_CLIENT_ID=e18f418eb4b94dce909022ffea242dcf
SPOTIFY_CLIENT_SECRET=f84316021d314effb08f637972994ccd
```

---

#### **Step 5: Restart Application**

```bash
# If using PM2:
pm2 restart fpp-control

# If using npm run dev:
# Press Ctrl+C, then:
npm run dev
```

---

#### **Step 6: Test Spotify Integration**

1. Visit your jukebox page: `http://localhost:3000/jukebox`
2. Browse sequences
3. Song metadata (artist, album, artwork) should appear
4. If you see placeholder images or "Unknown Artist", check your credentials

✅ **Spotify is now configured!**

---

### **Troubleshooting Spotify**

<details>
<summary><strong>No song metadata appearing</strong></summary>

**Cause:** Invalid or missing Spotify credentials.

**Solution:**
1. Verify credentials in `.env.local`
2. Check for typos in Client ID/Secret
3. Ensure no extra spaces or quotes
4. Restart application
5. Check logs: `pm2 logs fpp-control | grep -i spotify`
</details>

<details>
<summary><strong>Rate limit errors</strong></summary>

**Cause:** Too many API requests (unlikely for personal use).

**Solution:**
- Spotify API has generous limits (thousands of requests per day)
- If you hit limits, caching is already built-in
- Check for infinite loops in code
</details>

<details>
<summary><strong>"Invalid client" error</strong></summary>

**Cause:** Client Secret is incorrect.

**Solution:**
1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click your app → Settings
3. Click "View client secret"
4. Copy the ENTIRE secret (including any = signs at the end)
5. Update `.env.local`
6. Restart application
</details>

---

### **Spotify API Limits**

**Free Tier Limits:**
- ✅ **Rate Limit:** Extended Mode (default)
- ✅ **Requests:** Unlimited for Web API
- ✅ **Cost:** Free forever

**Your Usage:**
- ~1 API call per song lookup
- Cached after first lookup
- Typical usage: 10-50 requests per day
- **Well within free limits** 🎉

---

## 📧 Email Configuration (Optional)

Email enables Santa letter delivery and device alerts.

### **Gmail Setup (Recommended)**

#### **Step 1: Enable 2-Factor Authentication**

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Find **2-Step Verification**
3. Click **Get Started**
4. Follow the prompts to enable 2FA

---

#### **Step 2: Create App Password**

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. **Select app:** Other (custom name)
3. **Name:** `FPP Control Center`
4. Click **Generate**
5. **Copy the 16-character password** (looks like: `abcd efgh ijkl mnop`)

 **This password is shown only once!** Save it somewhere safe.

---

#### **Step 3: Update .env.local**

Add email configuration to `.env.local`:

``env
# Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourname@gmail.com
SMTP_PASS=abcdefghijklmnop    # App password (no spaces)
``

---

#### **Step 4: Test Email**

``bash
# Restart application
pm2 restart fpp-control

# Test from admin panel:
# Settings  Email  Send Test Email
``

---

### **Other Email Providers**

<details>
<summary><strong>Outlook / Office 365</strong></summary>

``env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourname@outlook.com
SMTP_PASS=your-password
``

No app password needed - use your regular password.
</details>

<details>
<summary><strong>Yahoo Mail</strong></summary>

``env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourname@yahoo.com
SMTP_PASS=your-app-password
``

Create app password at [login.yahoo.com/account/security](https://login.yahoo.com/account/security)
</details>

---

##  Cloudflare Tunnel Setup (Public Access)

Cloudflare Tunnel allows public internet access **without port forwarding**.

### **Benefits:**

-  **Free HTTPS** - Automatic SSL/TLS certificates
-  **No Port Forwarding** - No router configuration needed
-  **DDoS Protection** - Built-in security
-  **Hide Your IP** - Your home IP stays private

### **Prerequisites:**

1. **Domain Name** - Must be pointed to Cloudflare DNS
2. **Cloudflare Account** - Free at [cloudflare.com](https://www.cloudflare.com/)

---

### **Quick Setup**

Run the automated script:

```bash
./scripts/setup-cloudflare-tunnel.sh
```

The script will:
1. Install `cloudflared`
2. Authenticate with Cloudflare
3. Create a tunnel
4. Configure DNS routing
5. Install as a system service

---

### **Headless Server Setup (SSH/No GUI)**

If setting up via SSH without a browser:

The script **automatically detects** this and displays an authentication URL:

``

  IMPORTANT: Authentication URL Coming Up!                
                                                           
  1. Copy the URL that appears below                      
  2. Paste it into a browser on ANY device                
     (your phone, laptop, etc.)                            
  3. Log in to Cloudflare                                  
  4. Authorize the connection                              
  5. Come back here - setup continues automatically       


 COPY THIS URL:
https://dash.cloudflare.com/argotunnel?callback=...

 Open this URL on your phone or laptop
``

**Full documentation:** [CLOUDFLARE-TUNNEL.md](docs/CLOUDFLARE-TUNNEL.md)

---

### **Post-Setup Configuration**

After tunnel is set up:

#### **1. Update .env.local**

``env
# Change from localhost to your domain
NEXTAUTH_URL=https://yourdomain.com
``

---

#### **2. Update Google OAuth Redirect URIs**

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth Client ID
3. Add redirect URI:
   ``
   https://yourdomain.com/api/auth/callback/google
   ``
4. Save changes

---

#### **3. Restart Application**

``bash
pm2 restart fpp-control
``

---

#### **4. Verify Deployment**

``bash
# Test HTTPS access
curl https://yourdomain.com

# Check tunnel status
cloudflared tunnel list
``

 **Your site is now publicly accessible!**

---

##  Post-Installation

### **Access Your Control Center**

**Local Network:**
``
http://localhost:3000        # From the server
http://192.168.1.100:3000    # From other devices
``

**Public (Cloudflare):**
``
https://yourdomain.com
``

---

### **Admin Login**

1. Visit your site
2. Click **Admin Login** (top right)
3. Sign in with Google using an admin email
4. Grant permissions
5. You're now logged in! 

---

### **Useful Commands**

**Application Management:**
``bash
pm2 status                 # Check status
pm2 logs fpp-control       # View logs
pm2 restart fpp-control    # Restart
pm2 stop fpp-control       # Stop
pm2 start fpp-control      # Start
``

After editing `.env.local` you can also restart from the admin UI: **Settings → Updates → Restart Services**
restarts `fpp-control` and `fpp-poller` so they read the new values. Changed `NEXT_PUBLIC_*` values still need a rebuild.

**Database:**
``bash
npm run backup    # Manual backup
npm run db:stats  # View statistics
``

---

### **Next Steps**

1.  **Configure Your Display**
   - Admin Panel  Settings  FPP Configuration
   - Verify FPP server IP

2.  **Add Sequences**
   - Admin Panel  Sequences
   - Import from FPP or add manually

3.  **Customize Theme**
   - Admin Panel  Settings  Theme
   - Choose colors, logo, display name

4.  **Set Monitoring Hours**
   - Admin Panel  Settings  Monitoring
   - Configure when device-offline alert emails are sent (devices are checked all day)

5.  **Test Features**
   - Visit `/jukebox` - Request a song
   - Visit `/santa` - Submit a test letter
   - Check admin dashboard analytics

---

##  Troubleshooting

### **Common Issues**

<details>
<summary><strong>Setup wizard won't run</strong></summary>

``bash
chmod +x setup.sh
./setup.sh

# If still fails:
bash setup.sh
``
</details>

<details>
<summary><strong>Node.js version too old</strong></summary>

``bash
node --version

# If less than v20.0.0:
# Uninstall old Node.js
# Install Node.js 20+ from nodejs.org
# Restart terminal
``
</details>

<details>
<summary><strong>Port 3000 already in use</strong></summary>

```bash
lsof -i :3000
kill -9 <PID>
```
</details>

<details>
<summary><strong>Database errors</strong></summary>

```bash
# Backup and reinitialize
cp votes.db votes-backup.db
rm votes.db
npm run setup
```
</details>

<details>
<summary><strong>FPP connection failed</strong></summary>

``bash
# Test FPP API
curl http://YOUR_FPP_IP/api/playlists

# Check:
# 1. FPP is powered on
# 2. IP address is correct in .env.local
# 3. Both on same network
# 4. Firewall isn't blocking
``
</details>

<details>
<summary><strong>Email not sending</strong></summary>

**Check:**
1.  Wrong app password (not regular password for Gmail)
2.  2FA not enabled (required for Gmail app passwords)
3.  Incorrect SMTP port (587 for TLS)
4.  Firewall blocking outbound SMTP

**Test from admin panel:**
Settings  Email  Send Test Email
</details>

<details>
<summary><strong>Update failed or stuck</strong></summary>

**Check update logs:**
```bash
tail -f logs/update.log
```

**If the log says "Local changes to tracked files would be lost by the update":**
someone edited files on the show machine. Nothing was changed and the site keeps running.
Review the listed files with `git diff`, then commit them or discard them
(`git checkout -- <file>`) and run the update again. Audio mappings (`data/audio-mapping.json`)
and uploaded display images (`public/uploads/`) are not in git and are never touched by updates.

**If update is stuck:**
```bash
# Check if daemon is running
ps aux | grep update-daemon

# Remove stale lock file (if >30 min old)
rm logs/update.lock logs/update.pid
```

**If only one PM2 app running:**
```bash
pm2 stop all
pm2 start ecosystem.config.js
pm2 save
pm2 status  # Both fpp-control and fpp-poller should be online
```

**Manual update:**
```bash
cd ~/FPP-Website
git pull origin master
npm install
npm run build
pm2 stop all
pm2 start ecosystem.config.js
```

**Clear build cache (if build fails):**
```bash
rm -rf .next
npm run build
```
</details>

---

##  Advanced Configuration

### **Custom Port**

Edit `package.json`:

``json
{
  "scripts": {
    "dev": "next dev -p 3001",
    "start": "next start -p 3001"
  }
}
``

Update `.env.local`:

``env
NEXTAUTH_URL=http://localhost:3001
``

---

### **Multiple Admin Emails**

``env
ADMIN_EMAILS=admin1@gmail.com,admin2@gmail.com,admin3@yahoo.com
``

**No spaces between emails!**

---

### **Automatic Backups**

Set up daily backups with cron:

``bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/FPP-Website && npm run backup

# Add weekly cleanup (keep only 30 days)
0 3 * * 0 find /path/to/FPP-Website/backups/ -name "*.db" -mtime +30 -delete
``

---

### **Environment Variables Reference**

Complete list:

```env
# === REQUIRED ===

# Admin access (comma-separated, no spaces)
ADMIN_EMAILS=admin@example.com

# FPP device
FPP_URL=http://192.168.1.100

# Timezone (IANA format)
NEXT_PUBLIC_TIMEZONE=America/Chicago

# NextAuth (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Spotify API (REQUIRED for jukebox metadata)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret


# === OPTIONAL ===

# Email (for Santa letters and alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourname@gmail.com
SMTP_PASS=your-app-password

# Monitoring schedule (24-hour format)
MONITORING_START_TIME=16:00
MONITORING_END_TIME=22:00

# Ollama AI (for Santa letters)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Only if cloudflared (or another proxy) runs on a DIFFERENT machine than this app:
# its address(es), comma-separated, so visitor IPs are taken from Cloudflare's header.
# cloudflared on this same machine needs nothing. See docs/CLOUDFLARE-TUNNEL.md.
# TRUSTED_PROXY_IPS=192.168.1.20
```

---

##  Congratulations!

Your FPP Control Center is now fully installed and configured!

### **What's Next?**

-  **Add Sequences** - Import your light show sequences
-  **Customize Theme** - Make it match your display
-  **Monitor Analytics** - Track visitor engagement
-  **Enable Santa Letters** - Set up Ollama for AI responses
-  **Go Public** - Set up Cloudflare Tunnel for internet access

### **Need Help?**

-  [README.md](README.md) - Feature documentation
-  [SECURITY.md](SECURITY.md) - Security guide
-  [CLOUDFLARE-TUNNEL.md](docs/CLOUDFLARE-TUNNEL.md) - Public deployment
-  [GitHub Issues](https://github.com/joeally06/FPP-Control-Center/issues) - Report bugs
-  [Discussions](https://github.com/joeally06/FPP-Control-Center/discussions) - Ask questions

**Happy holidays! **
