#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

confirm() {
    while true; do
        read -p "$1 (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            return 0
        elif [[ $REPLY =~ ^[Nn]$ ]]; then
            return 1
        else
            print_warning "Please answer 'y' or 'n'"
        fi
    done
}

clear
print_header "☁️  Cloudflare Tunnel Setup"

echo "This wizard will set up Cloudflare Tunnel to provide secure,"
echo "public HTTPS access to your FPP Control Center without"
echo "opening ports on your router."
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    print_step "Installing Cloudflare Tunnel (cloudflared)..."
    
    # Detect OS and install
    if [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
    elif [[ -f /etc/redhat-release ]]; then
        # RHEL/CentOS/Fedora
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm
        sudo rpm -i cloudflared-linux-x86_64.rpm
        rm cloudflared-linux-x86_64.rpm
    else
        print_error "Unsupported Linux distribution"
        echo "Please install cloudflared manually from:"
        echo "https://github.com/cloudflare/cloudflared"
        exit 1
    fi
    
    print_success "Cloudflared installed"
else
    print_success "Cloudflared already installed"
fi

# Check for existing tunnel
if [ -d "$HOME/.cloudflared" ] && [ -f "$HOME/.cloudflared/cert.pem" ]; then
    print_warning "Existing Cloudflare authentication found"
    if confirm "Use existing authentication?"; then
        print_info "Using existing Cloudflare account"
    else
        print_info "Removing old authentication..."
        rm -rf "$HOME/.cloudflared"
    fi
fi

# Authenticate with Cloudflare
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    print_header "Step 1: Authenticate with Cloudflare"
    
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                           ║${NC}"
    echo -e "${CYAN}║  IMPORTANT: Authentication URL Coming Up!                ║${NC}"
    echo -e "${CYAN}║                                                           ║${NC}"
    echo -e "${CYAN}║  Since you're on a server without a web browser:         ║${NC}"
    echo -e "${CYAN}║                                                           ║${NC}"
    echo -e "${CYAN}║  1. Copy the URL that appears below                      ║${NC}"
    echo -e "${CYAN}║  2. Paste it into a browser on ANY device                ║${NC}"
    echo -e "${CYAN}║     (your phone, laptop, etc.)                            ║${NC}"
    echo -e "${CYAN}║  3. Log in to Cloudflare (or create free account)        ║${NC}"
    echo -e "${CYAN}║  4. Authorize the connection                              ║${NC}"
    echo -e "${CYAN}║  5. Come back here - setup will continue automatically   ║${NC}"
    echo -e "${CYAN}║                                                           ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    read -p "Press Enter to generate your authentication URL..."
    echo ""
    
    print_info "Generating authentication URL..."
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Run cloudflared login and capture output
    cloudflared tunnel login 2>&1 | while IFS= read -r line; do
        # Highlight the URL
        if [[ $line == *"https://"* ]]; then
            echo -e "${YELLOW}👉 COPY THIS URL:${NC}"
            echo -e "${GREEN}$line${NC}"
            echo ""
            echo -e "${CYAN}📱 Open this URL on your phone, laptop, or any device with a browser${NC}"
        else
            echo "$line"
        fi
    done
    
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Wait for authentication to complete
    print_info "Waiting for you to complete authentication in your browser..."
    
    # Check if cert.pem was created (with timeout)
    TIMEOUT=300  # 5 minutes
    ELAPSED=0
    while [ ! -f "$HOME/.cloudflared/cert.pem" ] && [ $ELAPSED -lt $TIMEOUT ]; do
        sleep 2
        ELAPSED=$((ELAPSED + 2))
        echo -n "."
    done
    echo ""
    
    if [ -f "$HOME/.cloudflared/cert.pem" ]; then
        print_success "Authentication successful!"
    else
        print_error "Authentication timed out or failed"
        echo ""
        echo "Please try again or visit:"
        echo "https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/"
        exit 1
    fi
fi

# Get domain name
print_header "Step 2: Configure Your Domain"

echo "Enter the domain you want to use for your FPP Control Center."
echo ""
echo "Examples:"
echo "  • lights.yourdomain.com"
echo "  • fpp.yourdomain.com"
echo "  • christmas.yourdomain.com"
echo ""
echo -e "${YELLOW}Note: Domain must already exist in your Cloudflare account${NC}"
echo ""

while true; do
    read -p "Enter your domain: " DOMAIN
    # Trim whitespace and any special characters
    DOMAIN=$(echo "$DOMAIN" | xargs | tr -d '[:space:]' | tr -d '\r\n')
    
    if [[ $DOMAIN =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        # Confirm the domain with the user
        echo ""
        echo -e "${CYAN}You entered: $DOMAIN${NC}"
        if confirm "Is this correct?"; then
            break
        fi
    else
        print_error "Invalid domain format. Please try again."
    fi
done

# Create tunnel
print_header "Step 3: Creating Tunnel"

# Check for existing tunnels
print_step "Checking for existing tunnels..."

EXISTING_TUNNELS=$(cloudflared tunnel list 2>/dev/null | grep -E "fpp-control" || true)

if [ -n "$EXISTING_TUNNELS" ]; then
    echo ""
    print_warning "Found existing FPP Control tunnels:"
    echo ""
    cloudflared tunnel list | grep -E "ID|fpp-control"
    echo ""
    
    # Count tunnels
    TUNNEL_COUNT=$(echo "$EXISTING_TUNNELS" | wc -l)
    
    if [ "$TUNNEL_COUNT" -gt 1 ]; then
        print_warning "Multiple tunnels found! You should only have one."
        echo ""
        if confirm "Would you like to clean up old tunnels and create a new one?"; then
            # Show tunnels with numbers
            echo ""
            print_info "Existing tunnels:"
            cloudflared tunnel list | grep -E "fpp-control" | nl -w2 -s'. '
            echo ""
            
            # Delete all old tunnels
            print_step "Deleting old tunnels..."
            while IFS= read -r line; do
                TUNNEL_ID=$(echo "$line" | awk '{print $1}')
                TUNNEL_NAME=$(echo "$line" | awk '{print $2}')
                print_info "Deleting tunnel: $TUNNEL_NAME ($TUNNEL_ID)"
                cloudflared tunnel delete "$TUNNEL_ID" 2>/dev/null || print_warning "Could not delete $TUNNEL_ID (may be in use)"
            done <<< "$EXISTING_TUNNELS"
            
            print_success "Old tunnels cleaned up"
            REUSE_TUNNEL=false
        else
            print_info "Keeping existing tunnels"
            REUSE_TUNNEL=false
        fi
    else
        # Only one tunnel exists
        EXISTING_TUNNEL_ID=$(echo "$EXISTING_TUNNELS" | awk '{print $1}')
        EXISTING_TUNNEL_NAME=$(echo "$EXISTING_TUNNELS" | awk '{print $2}')
        
        echo ""
        if confirm "Reuse existing tunnel '$EXISTING_TUNNEL_NAME'?"; then
            TUNNEL_ID="$EXISTING_TUNNEL_ID"
            TUNNEL_NAME="$EXISTING_TUNNEL_NAME"
            REUSE_TUNNEL=true
            print_success "Using existing tunnel: $TUNNEL_NAME"
        else
            print_step "Deleting old tunnel..."
            cloudflared tunnel delete "$EXISTING_TUNNEL_ID" 2>/dev/null || print_warning "Could not delete tunnel"
            REUSE_TUNNEL=false
        fi
    fi
else
    REUSE_TUNNEL=false
fi

# Create new tunnel if not reusing
if [ "$REUSE_TUNNEL" = false ]; then
    TUNNEL_NAME="fpp-control-$(date +%s)"
    
    print_step "Creating new tunnel: $TUNNEL_NAME"
    cloudflared tunnel create $TUNNEL_NAME
    
    # Get tunnel ID
    TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')
    
    if [ -z "$TUNNEL_ID" ]; then
        print_error "Failed to create tunnel"
        exit 1
    fi
    
    print_success "Tunnel created: $TUNNEL_ID"
fi

# Create config file
print_step "Creating tunnel configuration..."

mkdir -p ~/.cloudflared

CLOUDFLARED_HOME="$HOME/.cloudflared"
cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: $CLOUDFLARED_HOME/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:3000
  - service: http_status:404
EOF

print_success "Configuration created"

# Create DNS record
print_header "Step 4: Configuring DNS"

print_info "Setting up DNS record for $DOMAIN..."

# Try to create DNS route, but don't fail if it already exists
if cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN 2>&1 | grep -q "record.*already exists"; then
    print_warning "DNS record already exists - skipping creation"
    print_info "Existing DNS record will be used"
elif cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN; then
    print_success "DNS record created"
else
    print_warning "DNS routing encountered an issue"
    echo ""
    echo "You may need to configure DNS manually in Cloudflare dashboard:"
    echo "  1. Go to your domain in Cloudflare"
    echo "  2. DNS → Add record"
    echo "  3. Type: CNAME"
    echo "  4. Name: $(echo $DOMAIN | cut -d. -f1)"
    echo "  5. Target: $TUNNEL_ID.cfargotunnel.com"
    echo "  6. Proxy status: Proxied (orange cloud)"
    echo ""
    if ! confirm "Continue anyway?"; then
        exit 1
    fi
fi

# Update .env.local
print_header "Step 5: Updating Environment Configuration"

if [ -f ".env.local" ]; then
    # Backup existing .env.local
    cp .env.local .env.local.backup-$(date +%Y%m%d_%H%M%S)
    
    # Update NEXTAUTH_URL
    if grep -q "NEXTAUTH_URL=" .env.local; then
        sed -i.bak "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://$DOMAIN|" .env.local
        rm -f .env.local.bak
        print_success "Updated NEXTAUTH_URL to https://$DOMAIN"
    else
        echo "NEXTAUTH_URL=https://$DOMAIN" >> .env.local
        print_success "Added NEXTAUTH_URL to .env.local"
    fi
else
    print_warning ".env.local not found - you'll need to set NEXTAUTH_URL=https://$DOMAIN manually"
fi

# Configure Geolocation Permissions Policy
print_header "Step 6: Configure Geolocation Permission (Required)"

echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║                                                                   ║${NC}"
echo -e "${YELLOW}║  🌍 IMPORTANT: Geolocation Permission Header Required            ║${NC}"
echo -e "${YELLOW}║                                                                   ║${NC}"
echo -e "${YELLOW}║  FPP Control Center uses geolocation to restrict voting/requests ║${NC}"
echo -e "${YELLOW}║  to users near your light show. You MUST configure this rule.    ║${NC}"
echo -e "${YELLOW}║                                                                   ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Follow these steps in the Cloudflare Dashboard:${NC}"
echo ""
echo "  1. Go to: https://dash.cloudflare.com"
echo ""
echo "  2. Select your domain ($(echo $DOMAIN | rev | cut -d. -f1-2 | rev))"
echo ""
echo "  3. Navigate to: Rules → Transform Rules → Modify Response Header"
echo ""
echo "  4. Click: '+ Create rule'"
echo ""
echo "  5. Configure the rule:"
echo ""
echo -e "     ${GREEN}Rule name:${NC}        Allow Geolocation"
echo ""
echo -e "     ${GREEN}When incoming requests match:${NC}"
echo "                        Select 'All incoming requests'"
echo ""
echo -e "     ${GREEN}Then → Set static:${NC}"
echo -e "       Header name:   ${CYAN}Permissions-Policy${NC}"
echo -e "       Value:         ${CYAN}camera=(), microphone=(), geolocation=(self)${NC}"
echo ""
echo "  6. Click 'Deploy' to save the rule"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Wait for user to complete the step
while true; do
    echo -e "${CYAN}Have you configured the geolocation header rule in Cloudflare?${NC}"
    read -p "(y = yes, done / s = skip for now / ? = show steps again) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_success "Geolocation permission header configured"
        break
    elif [[ $REPLY =~ ^[Ss]$ ]]; then
        print_warning "Skipped - Remember to configure this later!"
        echo ""
        echo -e "${RED}⚠️  Without this rule, geolocation-based features will NOT work!${NC}"
        echo "   Users will be unable to vote or request songs."
        echo ""
        sleep 2
        break
    elif [[ $REPLY == "?" ]]; then
        echo ""
        echo -e "${CYAN}Quick Reference:${NC}"
        echo "  Dashboard:     https://dash.cloudflare.com"
        echo "  Navigate to:   Rules → Transform Rules → Modify Response Header"
        echo "  Rule name:     Allow Geolocation"
        echo "  Match:         All incoming requests"
        echo "  Action:        Set static header"
        echo "  Header name:   Permissions-Policy"
        echo "  Value:         camera=(), microphone=(), geolocation=(self)"
        echo ""
    else
        print_warning "Please answer 'y' (yes), 's' (skip), or '?' (help)"
    fi
done

# Install as service
print_header "Step 7: Installing Tunnel Service"

print_step "Installing cloudflared as a system service..."

# Uninstall existing service if present (to avoid conflicts)
if systemctl is-active --quiet cloudflared 2>/dev/null; then
    print_step "Stopping existing cloudflared service..."
    sudo systemctl stop cloudflared 2>/dev/null || true
fi

if systemctl is-enabled --quiet cloudflared 2>/dev/null; then
    print_step "Uninstalling existing cloudflared service..."
    sudo cloudflared service uninstall 2>/dev/null || true
fi

# Copy credentials and config to /etc/cloudflared so the system service
# (which runs as root) can reliably find them regardless of home directory.
print_step "Installing configuration for system service..."
sudo mkdir -p /etc/cloudflared

# Copy the credentials JSON to the system config dir
CREDS_SRC="$HOME/.cloudflared/$TUNNEL_ID.json"
if [ -f "$CREDS_SRC" ]; then
    sudo cp "$CREDS_SRC" "/etc/cloudflared/$TUNNEL_ID.json"
    sudo chmod 600 "/etc/cloudflared/$TUNNEL_ID.json"
    print_success "Credentials copied to /etc/cloudflared/"
else
    print_error "Credentials file not found: $CREDS_SRC"
    exit 1
fi

# Write the system config with an absolute credentials path
sudo tee /etc/cloudflared/config.yml > /dev/null << EOF
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:3000
  - service: http_status:404
EOF

print_success "System config written to /etc/cloudflared/config.yml"

# Install service pointing at the system config
print_step "Installing cloudflared system service..."
sudo cloudflared --config /etc/cloudflared/config.yml service install

print_success "Service installed"

# Start the tunnel
print_step "Starting tunnel..."
sudo systemctl daemon-reload
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Verify it actually started
sleep 3
if systemctl is-active --quiet cloudflared; then
    print_success "Tunnel started and enabled"
else
    print_error "Tunnel service failed to start"
    echo ""
    echo -e "${YELLOW}Run these commands to diagnose:${NC}"
    echo "  sudo systemctl status cloudflared"
    echo "  sudo journalctl -xeu cloudflared --no-pager | tail -30"
    exit 1
fi

# Final instructions
clear
print_header "🎉 Cloudflare Tunnel Setup Complete!"

echo ""
echo -e "${GREEN}Your FPP Control Center is now accessible at:${NC}"
echo ""
echo -e "    ${CYAN}https://$DOMAIN${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Update Google OAuth${NC}"
echo ""
echo "You need to add this redirect URI to your Google OAuth app:"
echo ""
echo -e "    ${CYAN}https://$DOMAIN/api/auth/callback/google${NC}"
echo ""
echo "Steps:"
echo "  1. Go to: https://console.cloud.google.com/apis/credentials"
echo "  2. Select your OAuth 2.0 Client ID"
echo "  3. Add the redirect URI above to 'Authorized redirect URIs'"
echo "  4. Save changes"
echo ""
echo -e "${YELLOW}🌍 Geolocation Header:${NC}"
echo ""
echo "  Make sure you've configured the Permissions-Policy header in Cloudflare!"
echo "  Rules → Transform Rules → Modify Response Header"
echo "  Header: Permissions-Policy = camera=(), microphone=(), geolocation=(self)"
echo ""
echo -e "${CYAN}📋 Useful Commands:${NC}"
echo ""
echo "  • Check status:    sudo systemctl status cloudflared"
echo "  • View logs:       sudo journalctl -u cloudflared -f"
echo "  • Restart tunnel:  sudo systemctl restart cloudflared"
echo "  • Stop tunnel:     sudo systemctl stop cloudflared"
echo ""
echo -e "${CYAN}📊 Tunnel Details:${NC}"
echo ""
echo "  • Tunnel ID:   $TUNNEL_ID"
echo "  • Tunnel Name: $TUNNEL_NAME"
echo "  • Domain:      $DOMAIN"
echo "  • Local Port:  3000"
echo ""

# Smart application restart
echo ""
print_header "Application Restart"

if command -v pm2 &> /dev/null; then
    # Check if PM2 has fpp-control process
    if pm2 list | grep -q "fpp-control"; then
        # Process exists, ask to restart
        if confirm "Restart FPP Control Center now to apply changes?"; then
            pm2 restart fpp-control
            print_success "Application restarted"
            echo ""
            print_info "Application is running with PM2"
            echo "  • View status: pm2 status"
            echo "  • View logs:   pm2 logs fpp-control"
        fi
    else
        # Process doesn't exist in PM2
        print_warning "FPP Control Center is not running in PM2"
        echo ""
        echo "To start your application with PM2:"
        echo ""
        echo -e "  ${CYAN}cd $(pwd)${NC}"
        echo -e "  ${CYAN}npm run build${NC}"
        echo -e "  ${CYAN}pm2 start npm --name fpp-control -- start${NC}"
        echo -e "  ${CYAN}pm2 save${NC}"
        echo ""
        
        if confirm "Would you like to start it now?"; then
            print_step "Building application..."
            npm run build
            
            print_step "Starting with PM2..."
            pm2 start npm --name fpp-control -- start
            pm2 save
            
            print_success "Application started with PM2"
        fi
    fi
else
    # PM2 not installed
    print_warning "PM2 is not installed"
    echo ""
    
    # Check if node/npm process is running on port 3000
    if lsof -i:3000 &> /dev/null; then
        print_info "Application appears to be running on port 3000"
        echo ""
        echo "Please restart your application manually to apply changes:"
        echo "  • Stop current process (Ctrl+C in terminal)"
        echo "  • Run: npm run build"
        echo "  • Run: npm start"
    else
        print_warning "Application is not running"
        echo ""
        echo "To start your application:"
        echo ""
        echo -e "  ${CYAN}cd $(pwd)${NC}"
        echo -e "  ${CYAN}npm run build${NC}"
        echo -e "  ${CYAN}npm start${NC}"
        echo ""
        
        if confirm "Would you like to build and get start command?"; then
            print_step "Building application..."
            npm run build
            
            print_success "Build complete!"
            echo ""
            echo "Start your application with:"
            echo -e "  ${CYAN}npm start${NC}"
            echo ""
            echo "Or for production with PM2 (recommended):"
            echo -e "  ${CYAN}sudo npm install -g pm2${NC}"
            echo -e "  ${CYAN}pm2 start npm --name fpp-control -- start${NC}"
            echo -e "  ${CYAN}pm2 save${NC}"
        fi
    fi
fi

echo ""
print_success "Setup complete! Your site should be live at https://$DOMAIN in a few moments."
echo ""
