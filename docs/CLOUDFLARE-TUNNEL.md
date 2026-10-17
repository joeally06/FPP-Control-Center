# Cloudflare Tunnel Setup Guide

## Overview

Cloudflare Tunnel provides secure, public HTTPS access to your FPP Control Center **without opening ports on your router** or exposing your home IP address.

### Benefits

- ✅ **No Port Forwarding**: No need to configure router or firewall
- ✅ **Free HTTPS**: Automatic SSL/TLS certificates
- ✅ **DDoS Protection**: Built-in Cloudflare security
- ✅ **Custom Domain**: Use your own domain name
- ✅ **Zero Trust**: Traffic goes through Cloudflare's network

---

## Prerequisites

1. **Domain Name**: You need a domain registered with Cloudflare
   - If you don't have one, register at [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)
   - Or transfer your existing domain to Cloudflare

2. **Cloudflare Account**: Free account at [cloudflare.com](https://www.cloudflare.com/)

3. **FPP Control Center**: Already installed and running locally

---

## Quick Setup

### Linux/Mac

```bash
./scripts/setup-cloudflare-tunnel.sh
```

The wizard will guide you through:
1. Installing `cloudflared`
2. Authenticating with Cloudflare
3. Creating a tunnel
4. Configuring your domain
5. Setting up DNS
6. Configuring geolocation permission header (required for voting/requests)
7. Installing as a system service

---

## Headless Server Setup (SSH/No GUI)

If you're setting up on a server accessed via SSH (no web browser available):

### The Problem

When you run `cloudflared tunnel login`, it generates an authentication URL that needs to be opened in a browser. On a headless server, there's no browser available.

### The Solution

The setup script **automatically detects** headless environments and displays the authentication URL prominently:

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║  IMPORTANT: Authentication URL Coming Up!                ║
║                                                           ║
║  Since you're on a server without a web browser:         ║
║                                                           ║
║  1. Copy the URL that appears below                      ║
║  2. Paste it into a browser on ANY device                ║
║     (your phone, laptop, etc.)                            ║
║  3. Log in to Cloudflare (or create free account)        ║
║  4. Authorize the connection                              ║
║  5. Come back here - setup will continue automatically   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

👉 COPY THIS URL:
https://dash.cloudflare.com/argotunnel?callback=https%3A%2F%2Flogin.cloudflareaccess.org%2F...

📱 Open this URL on your phone, laptop, or any device with a browser
```

### Steps

1. **Run the setup script** on your headless server:
   ```bash
   ./scripts/setup-cloudflare-tunnel.sh
   ```

2. **Copy the URL** when it appears

3. **Open on ANY device**:
   - Your phone
   - Your laptop
   - Any computer with a browser

4. **Log in to Cloudflare**:
   - Use existing account or create free account
   - Authorize the tunnel connection

5. **Return to terminal**:
   - The script automatically detects when authentication completes
   - Setup continues automatically

The script waits up to 5 minutes for authentication. You'll see dots (`.`) while waiting.

---

## Manual Setup

If you prefer to set up manually:

### 1. Install cloudflared

**Debian/Ubuntu:**
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

**RHEL/CentOS/Fedora:**
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm
sudo rpm -i cloudflared-linux-x86_64.rpm
```

**macOS:**
```bash
brew install cloudflare/cloudflare/cloudflared
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

On headless servers, copy the URL and open it on another device.

### 3. Create Tunnel

```bash
cloudflared tunnel create fpp-control
```

Save the Tunnel ID that's displayed.

### 4. Create Configuration

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/youruser/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: fpp.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 5. Configure DNS

```bash
cloudflared tunnel route dns fpp-control fpp.yourdomain.com
```

### 6. Install as Service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

---

## Post-Setup Configuration

### 1. Update .env.local

Edit `.env.local` and update:

```env
NEXTAUTH_URL=https://fpp.yourdomain.com
```

### 2. Update Google OAuth

Add the new redirect URI to your Google OAuth app:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   ```
   https://fpp.yourdomain.com/api/auth/callback/google
   ```
4. Save changes

### 3. Restart Application

```bash
pm2 restart fpp-control
```

Or if running directly:

```bash
npm run build
npm start
```

---

## Visitor IP Addresses

Rate limits (votes, song requests, Santa letters, trivia) are counted per visitor IP. `npm start`
runs `server.js`, which takes each visitor's IP from the connection itself and believes Cloudflare's
`CF-Connecting-IP` header **only when the connection comes from cloudflared on this same machine**.
Anyone reaching port 3000 directly (home network, port forwarding) can't fake their address by
sending that header or `X-Forwarded-For`.

- **cloudflared on the same machine as the app** (what `setup-cloudflare-tunnel.sh` sets up): nothing to do.
- **cloudflared on a different machine:** add its address to `.env.local`, e.g.
  `TRUSTED_PROXY_IPS=192.168.1.20` (comma-separated for several), then restart. Until you do, every
  visitor shares that machine's IP and the limits feel much stricter.
- **Another proxy (e.g. nginx) on the same machine in front of the app:** it is trusted like
  cloudflared, so it must not pass on a `CF-Connecting-IP` header sent by visitors.
- Always start the app with `npm start` (not `next start`); otherwise the app logs
  "visitor IPs come from headers that can be faked".

---

## Geolocation Permission Header (Required)

FPP Control Center uses geolocation to restrict voting and song requests to users near your light show. Cloudflare needs to set a header to allow the browser to access geolocation APIs.

### Why This Is Needed

When traffic goes through Cloudflare, the `Permissions-Policy` header must be explicitly set to allow geolocation. Without this, browsers will deny geolocation requests and users won't be able to vote or request songs.

### Configure Transform Rule

1. **Go to Cloudflare Dashboard**: https://dash.cloudflare.com

2. **Select your domain**

3. **Navigate to**: Rules → Transform Rules → Modify Response Header

4. **Click**: "+ Create rule"

5. **Configure the rule**:

   | Setting | Value |
   |---------|-------|
   | **Rule name** | Allow Geolocation |
   | **When incoming requests match** | All incoming requests |
   | **Then** | Set static |
   | **Header name** | `Permissions-Policy` |
   | **Value** | `camera=(), microphone=(), geolocation=(self)` |

6. **Click Deploy**

### What This Header Does

- `camera=()` - Disables camera access (not needed)
- `microphone=()` - Disables microphone access (not needed)  
- `geolocation=(self)` - **Allows** geolocation for your domain only

### Verify It's Working

After deploying the rule, you can verify it's working:

```bash
curl -I https://yourdomain.com | grep -i permissions-policy
```

You should see:
```
permissions-policy: camera=(), microphone=(), geolocation=(self)
```

### Troubleshooting Geolocation

**"Geolocation permission denied" errors:**
- Verify the Transform Rule is deployed and active in Cloudflare
- Check the header name is exactly `Permissions-Policy` (capital P)
- Clear browser cache and try again
- Make sure you're accessing via HTTPS (geolocation requires HTTPS)

**Rule not appearing:**
- Make sure you're in the correct domain in Cloudflare Dashboard
- The rule may take a few minutes to propagate
- Try accessing the site in an incognito/private window

---

## Troubleshooting

### Tunnel Not Working

**Check status:**
```bash
sudo systemctl status cloudflared
```

**View logs:**
```bash
sudo journalctl -u cloudflared -f
```

**Common issues:**
- DNS not propagated (wait 2-5 minutes)
- Application not running on port 3000
- Firewall blocking localhost connections

### Authentication Failed

**On headless servers:**
- Make sure you copied the entire URL
- Try again: `rm -rf ~/.cloudflared && ./scripts/setup-cloudflare-tunnel.sh`
- Check internet connectivity on both server and device

**Certificate issues:**
```bash
# Remove old certificates
rm -rf ~/.cloudflared
# Run setup again
./scripts/setup-cloudflare-tunnel.sh
```

### 502 Bad Gateway

This means the tunnel is working, but your application isn't running:

```bash
# Check if app is running
pm2 status

# Check port 3000
netstat -tulpn | grep 3000

# Restart app
pm2 restart fpp-control
```

### DNS Not Updating

**Check DNS record:**
```bash
cloudflared tunnel route dns fpp-control fpp.yourdomain.com
```

**Manual DNS setup:**
1. Go to Cloudflare Dashboard
2. Select your domain
3. DNS → Add record:
   - Type: `CNAME`
   - Name: `fpp` (or your subdomain)
   - Target: `YOUR_TUNNEL_ID.cfargotunnel.com`
   - Proxy status: Proxied (orange cloud)

---

## Useful Commands

### Tunnel Management

```bash
# List all tunnels
cloudflared tunnel list

# Get tunnel info
cloudflared tunnel info TUNNEL_NAME

# Delete tunnel
cloudflared tunnel delete TUNNEL_NAME

# Run tunnel manually (for testing)
cloudflared tunnel run TUNNEL_NAME
```

### Service Management

```bash
# Check status
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -f

# Restart service
sudo systemctl restart cloudflared

# Stop service
sudo systemctl stop cloudflared

# Start service
sudo systemctl start cloudflared

# Disable auto-start
sudo systemctl disable cloudflared
```

### Testing

```bash
# Test from command line
curl -I https://fpp.yourdomain.com

# Check DNS resolution
dig fpp.yourdomain.com

# Test tunnel connectivity
cloudflared tunnel info TUNNEL_NAME
```

---

## Security Best Practices

### 1. Use Cloudflare Access (Optional)

Add an extra layer of authentication:

1. Go to Cloudflare Dashboard → Zero Trust
2. Create an Access policy for your domain
3. Require email verification or other authentication

### 2. Enable Rate Limiting

Protect against brute force attacks:

1. Cloudflare Dashboard → Security → WAF
2. Create rate limiting rule for login endpoints

### 3. Monitor Logs

Regularly check logs for suspicious activity:

```bash
sudo journalctl -u cloudflared -f
```

### 4. Keep cloudflared Updated

```bash
# Debian/Ubuntu
sudo apt update && sudo apt upgrade cloudflared

# RHEL/CentOS
sudo yum update cloudflared
```

---

## Advanced Configuration

### Multiple Hostnames

Edit `~/.cloudflared/config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/youruser/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: fpp.yourdomain.com
    service: http://localhost:3000
  - hostname: admin.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Then route both domains:
```bash
cloudflared tunnel route dns TUNNEL_NAME fpp.yourdomain.com
cloudflared tunnel route dns TUNNEL_NAME admin.yourdomain.com
```

### Custom Headers

```yaml
ingress:
  - hostname: fpp.yourdomain.com
    service: http://localhost:3000
    originRequest:
      httpHostHeader: fpp.yourdomain.com
      noTLSVerify: true
```

### WebSocket Support

WebSockets work automatically, no special configuration needed!

---

## Migration from Port Forwarding

If you're currently using port forwarding:

1. **Set up Cloudflare Tunnel** (don't disable port forwarding yet)
2. **Update OAuth redirect URIs** to include both URLs
3. **Test the tunnel** thoroughly
4. **Update NEXTAUTH_URL** to tunnel URL
5. **Disable port forwarding** on your router
6. **Remove old redirect URI** from OAuth (optional)

---

## Cost

**Cloudflare Tunnel is FREE** for personal use with no bandwidth limits!

Optional paid features:
- Cloudflare Access (advanced authentication) - $3/user/month
- Advanced DDoS protection - Included in Pro plan ($20/month)

For home/hobby use, the free tier is more than sufficient.

---

## Support

### Official Documentation

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Tunnel Guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/)

### FPP Control Center

- Create an issue on [GitHub](https://github.com/joeally06/FPP-Control-Center/issues)
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## FAQ

### Q: Do I need to keep my computer on?

**A:** Yes, the tunnel connects to your local application. Your server/computer running FPP Control Center must be on and connected to the internet.

### Q: Can I use this with a dynamic IP?

**A:** Yes! That's one of the main benefits. Your home IP can change freely; the tunnel handles it automatically.

### Q: Is my data secure?

**A:** Yes! All traffic is encrypted (HTTPS) and goes through Cloudflare's secure network. Your home IP is never exposed.

### Q: Can I use my existing domain?

**A:** Yes, but it must be managed by Cloudflare. You can transfer your domain to Cloudflare for free.

### Q: What if Cloudflare goes down?

**A:** Your local access (http://localhost:3000) still works. Only external access would be affected. Cloudflare has 99.99%+ uptime.

### Q: Can I use this for other applications?

**A:** Yes! You can route multiple services through the same tunnel. See "Advanced Configuration" above.

---

## Next Steps

After setting up your tunnel:

1. ✅ Verify access at `https://yourdomain.com`
2. ✅ Test Google OAuth login
3. ✅ Update bookmarks/favorites
4. ✅ Share your new URL!
5. ✅ Consider setting up [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) for extra security

Enjoy your publicly accessible, secure FPP Control Center! 🎉
