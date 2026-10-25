# Santa Letter Dual Rate Limiting

## Overview

The FPP Control Center implements **dual rate limiting** for Santa letters to prevent abuse while ensuring fair access for all users.

## Why Dual Rate Limiting?

Traditional rate limiting only checks one dimension (e.g., email address). This allows abuse scenarios:

- **Email Hopping**: User creates multiple email accounts to send more letters
- **VPN Bypass**: User changes IP addresses to bypass IP-only limits

**Solution**: Track BOTH email address AND IP address. Whichever limit is hit first blocks the user.

---

## How It Works

### 1. Rate Limit Check

When a user submits a Santa letter, the system checks:

```typescript
checkSantaRateLimit(email, ipAddress)
```

This function:
- Counts letters sent today from **this email address**
- Counts letters sent today from **this IP address**
- Compares both counts against the daily limit (from admin settings)
- Returns whichever count is higher

### 2. IP Address Detection

The system uses Cloudflare-aware IP detection:

```typescript
getClientIP(request)
```

Priority order:
1. `cf-connecting-ip` (Cloudflare Tunnel)
2. `x-real-ip` (Reverse proxy)
3. `x-forwarded-for` (Load balancer)
4. Direct socket connection (fallback)

### 3. Database Tracking

Every letter is stored with:
- `parent_email` - Email address
- `ip_address` - Client IP
- `created_at` - Timestamp

Index for fast queries:
```sql
CREATE INDEX idx_santa_ip_date 
ON santa_letters(ip_address, created_at);
```

---

## User Experience

### Before Limit

```
Letters today: 0/1 (1 remaining)
```

### At Limit (Email)

```
Error: You've already sent 1 letter(s) today from this email address.
Daily limit is 1.

We track letters by both email address and location to ensure fair access.
```

### At Limit (IP)

```
Error: You've already sent 1 letter(s) today from this location.
Daily limit is 1.

We track letters by both email address and location to ensure fair access.
```

---

## Email Confirmation and Daily Cap

The per-visitor limits alone don't stop a stranger from making the show's mail account write to
someone else's address, so two more checks apply (`lib/santa-confirmation.ts`):

1. **The parent confirms first.** `POST /api/santa/send-letter` saves the letter and emails a
   fixed-text confirmation (nothing the sender typed is in it) with a link to `/santa/confirm`.
   The parent presses the button on that page (`POST /api/santa/confirm`, 10 tries per IP per
   10 minutes). Only then does the queue processor write and send Santa's reply. Links expire
   after 72 hours and work once; only a SHA-256 of the token is stored
   (`santa_letter_confirmations`, migration 022). If the confirmation email can't be sent, the
   letter is removed so it doesn't use up the parent's daily allowance.
2. **Daily cap for all visitors.** Santa letters → Settings tab → Santa Letter Configuration → *Daily Letter Cap*
   (`santa_daily_cap`, default 50, 1–1000). Once that many letters arrive in a UTC day, new ones
   get "Santa's mailbag is full for today" (429, `reason: 'daily_cap'`).

The *Enable Santa Letter Submissions* switch is enforced too: when off, the form is refused (403).

The Santa Letters admin page marks waiting letters "awaiting parent" (or "link expired");
the queue skips them. Letters submitted before this existed are answered as before.
An admin can also **Reject** a letter that hasn't been answered yet — the queue never answers it
(**Restore** undoes that).

---

## Technical Implementation

### File: `lib/santa-rate-limit.ts`

```typescript
export interface RateLimitResult {
  allowed: boolean;
  emailCount: number;
  ipCount: number;
  limit: number;
  reason?: 'email_limit' | 'ip_limit';
}

export function checkSantaRateLimit(
  email: string, 
  ipAddress: string
): RateLimitResult
```

**Returns:**
- `allowed`: `true` if user can send, `false` if limit reached
- `emailCount`: Letters sent today from this email
- `ipCount`: Letters sent today from this IP
- `limit`: Daily limit from admin settings
- `reason`: Which limit was exceeded (if any)

### API Endpoints

#### `/api/santa/send-letter`

**Before:**
```typescript
// Only checked duplicate within 24 hours (weak protection)
```

**After:**
```typescript
const rateLimitResult = checkSantaRateLimit(email, clientIP);

if (!rateLimitResult.allowed) {
  return NextResponse.json({
    error: "Rate limit exceeded",
    emailCount: rateLimitResult.emailCount,
    ipCount: rateLimitResult.ipCount,
    limit: rateLimitResult.limit,
    reason: rateLimitResult.reason
  }, { status: 429 });
}
```

#### `/api/santa/check-limit`

**Before:**
```typescript
// Only counted by email
SELECT COUNT(*) FROM santa_letters WHERE parent_email = ?
```

**After:**
```typescript
const result = checkSantaRateLimit(email, clientIP);

return {
  emailCount: result.emailCount,
  ipCount: result.ipCount,
  count: Math.max(emailCount, ipCount), // Show higher count
  limit: result.limit,
  allowed: result.allowed
}
```

### Frontend: `LetterToSantaModal.tsx`

Displays:
- Current letter count (max of email/IP)
- Remaining letters available
- Security notice about dual tracking
- Specific error messages indicating which limit was hit

---

## Admin Configuration

Admins can configure the daily limit:

1. Go to **Admin Panel** → **Santa Letters**
2. Click **Settings** tab
3. Set **Daily Limit per User**
4. Save changes

Default: 1 letter per day

---

## Security Considerations

### Abuse Prevention

✅ **Multiple Emails**: Blocked (same IP address)
✅ **VPN Hopping**: Blocked (same email address)  
✅ **Proxy/Tor**: Detected via IP tracking  
✅ **Cloudflare Tunnel**: Proper IP extraction via `cf-connecting-ip`

### Privacy

- IP addresses are stored in the database
- Only admins can view IP addresses
- IP addresses are NOT displayed to end users
- Compliant with GDPR (legitimate interest: abuse prevention)

### Legitimate Use Cases

The system allows:
- Multiple children in same household (different emails, same IP) ✅
- Same child from school and home (same email, different IPs) ✅
- Family sharing device (different emails, same IP) ✅

Each unique email/IP combination gets the full daily limit.

---

## Testing

### Test Scenarios

1. **Email Limit**
   - Send letter from `test1@example.com`
   - Try again from `test2@example.com` (same IP)
   - Expected: **Blocked** (IP limit reached)

2. **IP Limit**
   - Send letter from `test@example.com` (IP: 1.2.3.4)
   - Change VPN to different IP (IP: 5.6.7.8)
   - Try again from `test@example.com`
   - Expected: **Blocked** (email limit reached)

3. **Legitimate Use**
   - Send from `child1@example.com` (IP: 1.2.3.4)
   - Send from `child2@example.com` (IP: 5.6.7.8)
   - Expected: **Both allowed** (different email + different IP)

### Manual Testing

```bash
# Test email limit
curl -X POST http://localhost:3000/api/santa/check-limit \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Response:
{
  "emailCount": 1,
  "ipCount": 1,
  "count": 1,
  "limit": 1,
  "allowed": false,
  "reason": "email_limit"
}
```

---

## Troubleshooting

### Issue: IP Always Shows as 127.0.0.1

**Cause**: Running behind reverse proxy without proper headers

**Solution**: Configure proxy to forward IP headers:

**Nginx:**
```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

**Cloudflare Tunnel:**
```yaml
# No configuration needed - cf-connecting-ip header automatically added
```

### Issue: Users Blocked Unexpectedly

**Cause**: Multiple users sharing same network/NAT

**Solution**: 
1. Increase daily limit in admin settings
2. Or: Educate users about the limit
3. Or: Whitelist specific IPs (future feature)

### Issue: VPNs Still Bypass Limit

**Cause**: User using different email + different VPN IP each time

**Solution**: This is expected behavior. Each unique combination gets the limit. To prevent completely:
1. Require email verification before sending
2. Implement CAPTCHA
3. Track by browser fingerprint (privacy concerns)

---

## Database Queries

### Check Email Count

```sql
SELECT COUNT(*) FROM santa_letters 
WHERE parent_email = 'test@example.com' 
AND DATE(created_at) = DATE('now');
```

### Check IP Count

```sql
SELECT COUNT(*) FROM santa_letters 
WHERE ip_address = '1.2.3.4' 
AND DATE(created_at) = DATE('now');
```

### View All Letters from IP

```sql
SELECT child_name, parent_email, created_at 
FROM santa_letters 
WHERE ip_address = '1.2.3.4' 
ORDER BY created_at DESC;
```

---

## Performance

### Index Usage

The `idx_santa_ip_date` index ensures fast queries:

```
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM santa_letters 
WHERE ip_address = '1.2.3.4' 
AND DATE(created_at) = DATE('now');

-- Uses index: idx_santa_ip_date
-- Scan time: <1ms for 10,000 records
```

### Scalability

- **Daily limit check**: O(1) - uses indexed queries
- **IP extraction**: O(1) - header lookup
- **No external API calls**: All checks are local
- **Database size**: IP addresses add ~15 bytes per letter

---

## Future Enhancements

Potential improvements:

1. **Sliding Window**: Instead of daily reset at midnight, use 24-hour rolling window
2. ~~**Email Verification**~~: done — see *Email Confirmation and Daily Cap*
3. **CAPTCHA**: Add CAPTCHA for additional bot protection
4. **Whitelist/Blacklist**: Admin ability to whitelist schools or blacklist IPs
5. **Analytics**: Dashboard showing abuse attempts and IP patterns
6. **Geo-blocking**: Optional country/region restrictions
7. **Browser Fingerprinting**: Additional layer (privacy trade-off)

---

## Summary

The dual rate limiting system provides robust protection against abuse while maintaining a great user experience. By tracking both email addresses and IP addresses, we ensure:

✅ Fair access for legitimate users  
✅ Prevention of email-hopping abuse  
✅ Prevention of VPN-hopping abuse  
✅ Cloudflare Tunnel compatibility  
✅ Fast performance with database indexes  
✅ Clear error messages for users  

No system is perfect, but this approach strikes an excellent balance between security and usability.
