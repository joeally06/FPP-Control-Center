# Security Audit - FPP Control Center

**Date:** November 7, 2025  
**Status:** In Progress  
**Goal:** Secure all admin routes while maintaining public functionality

---

## 📊 Current State

### ✅ Already Secured (12 routes)
- `/api/devices/status` - Device management (requireAdmin)
- `/api/devices/manage` - Device CRUD (requireAdmin)
- `/api/devices/schedule` - Device scheduling (requireAdmin)
- `/api/system/check-updates` - System updates (requireAdmin)
- `/api/system/update` - Apply updates (requireAdmin)
- `/api/system/update-status` - Update status (requireAdmin)
- `/api/update` - Legacy update (requireAdmin)
- `/api/web/[...slug]` - Web proxy (requireAdmin)
- `/api/models/import` - Model import (requireAdmin)
- `/api/santa/admin-letters` - Admin letter management (getServerSession)
- `/api/santa/resend-email` - Resend emails (getServerSession)
- `/api/database/maintenance` - DB maintenance (getServerSession)

### ✅ Correctly Public (11 routes)
- `/api/jukebox/queue` - View/request songs (PUBLIC - no auth)
- `/api/jukebox/popular` - Popular songs (PUBLIC - no auth)
- `/api/jukebox/sequences` - Available sequences (PUBLIC - no auth)
- `/api/jukebox/metadata` - Song metadata (PUBLIC - no auth)
- `/api/votes` - Voting system (PUBLIC - rate limited by IP)
- `/api/santa/send-letter` - Submit letter (PUBLIC - rate limited)
- `/api/santa/check-limit` - Check rate limit (PUBLIC)
- `/api/health` - Health check (PUBLIC)
- `/api/version` - App version (PUBLIC)
- `/api/analytics/track` - Track page views (PUBLIC)
- `/api/auth/[...nextauth]` - Authentication (PUBLIC - NextAuth)

### ⚠️ Needs Review (Mixed Auth)
- `/api/theme` - GET public, POST admin (getServerSession)
- `/api/jukebox/status` - GET public, PUT admin (requireAdminWithRateLimit)
- `/api/settings` - GET/POST admin (getServerSession)
- `/api/spotify/metadata/[name]` - GET/PUT admin (getServerSession)
- `/api/fpp/sync` - POST admin (getServerSession)

### ❌ Needs Securing (23 routes)

#### **Critical Priority (Admin Management)**
1. `/api/models` - Model CRUD (GET/POST/PUT/DELETE)
2. `/api/models/[id]` - Individual model operations
3. `/api/settings/santa-letters` - Santa settings
4. `/api/fpp/playlists` - FPP playlist management
5. `/api/fpp/sequences` - FPP sequence management
6. `/api/fpp/health` - FPP health monitoring

#### **High Priority (Background Operations)**
7. `/api/jukebox/process-queue` - Queue processor (admin background job)
8. `/api/jukebox/refresh-cache` - Cache refresh (admin operation)
9. `/api/santa/process-queue` - Santa queue processor
10. `/api/santa/trigger-queue` - Manual queue trigger
11. `/api/devices/check` - Device health check

#### **Medium Priority (Analytics - Admin Only)**
12. `/api/analytics` - Analytics dashboard data
13. `/api/analytics/votes` - Vote analytics
14. `/api/analytics/export` - Export analytics
15. `/api/analytics/requests` - Request analytics
16. `/api/analytics/alerts` - Analytics alerts
17. `/api/analytics/sequence/[name]` - Sequence analytics
18. `/api/admin/analytics` - Admin analytics

#### **Low Priority (Proxy Routes)**
19. `/api/fppd/[...slug]` - FPPD proxy (admin access to FPP daemon)
20. `/api/spotify/search` - Spotify search (admin media library)
21. `/api/spotify/metadata/[name]/override` - Override metadata
22. `/api/system/update/stream` - Update stream (SSE)

---

## 🎯 Implementation Plan

### Phase 1: Audit Complete ✅
- [x] Inventory all routes
- [x] Categorize by access level
- [x] Identify already secured routes
- [x] Document public routes (must stay public)

### Phase 2: Batch 1 - Critical Admin Routes (Task 4)
**Routes to secure:**
- `/api/models` (GET, POST)
- `/api/models/[id]` (GET, PUT, DELETE)
- `/api/settings/santa-letters` (GET, POST)
- `/api/fpp/playlists` (GET, POST)
- `/api/fpp/sequences` (GET)
- `/api/fpp/health` (GET)

**Testing checklist after Batch 1:**
- [ ] Admin can access models page
- [ ] Admin can create/edit/delete models
- [ ] Admin can manage Santa settings
- [ ] Public jukebox still works (vote, request, view)
- [ ] Public Santa letters still work

### Phase 3: Batch 2 - Background Operations (Task 6)
**Routes to secure:**
- `/api/jukebox/process-queue` (POST)
- `/api/jukebox/refresh-cache` (POST)
- `/api/santa/process-queue` (POST)
- `/api/santa/trigger-queue` (GET, POST)
- `/api/devices/check` (GET)

**Testing checklist after Batch 2:**
- [ ] Background queue processing works
- [ ] Cache refresh works (admin only)
- [ ] Device monitoring works
- [ ] No 401 errors in browser console for public users

### Phase 4: Batch 3 - Analytics & Remaining (Task 7)
**Routes to secure:**
- `/api/analytics/*` (all except /track)
- `/api/admin/analytics` (GET)
- `/api/spotify/search` (GET)
- `/api/spotify/metadata/[name]/override` (POST)
- `/api/fppd/[...slug]` (GET, POST, etc.)
- `/api/system/update/stream` (GET - SSE)

**Testing checklist after Batch 3:**
- [ ] Analytics dashboard loads for admin
- [ ] Spotify search works in media library
- [ ] FPP proxy works for admin
- [ ] Public analytics tracking still works (/api/analytics/track)

### Phase 5: Standardize Mixed Auth Routes
**Routes to review:**
- `/api/theme` - Already has POST admin check (✅ correct)
- `/api/jukebox/status` - GET public, PUT admin (✅ correct)
- `/api/settings` - Already has admin check (verify POST/GET both protected)
- `/api/spotify/metadata/[name]` - Already has admin check (verify all methods)
- `/api/fpp/sync` - Already has admin check (verify POST protected)

---

## 🔒 Security Standards

### requireAdmin() Pattern
```typescript
import { requireAdmin } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    
    // ... admin operation ...
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message.includes('Authentication required')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    if (error.message.includes('Admin access required')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Public Route Pattern (Document Only)
```typescript
/**
 * PUBLIC ROUTE: No authentication required
 * Rate limited by IP address to prevent abuse
 */
export async function GET(request: NextRequest) {
  // Public operation
  return NextResponse.json({ data: results });
}
```

### Mixed Auth Pattern (GET public, POST admin)
```typescript
export async function GET(request: NextRequest) {
  // PUBLIC - no auth check
  return NextResponse.json({ data: results });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    // ADMIN operation
    return NextResponse.json({ success: true });
  } catch (error: any) {
    // Handle auth errors
  }
}
```

---

## 📋 Route Categories

### PUBLIC ROUTES (Must Stay Public)
**Purpose:** Allow anonymous users to interact with jukebox and submit Santa letters

- ✅ `/api/jukebox/queue` (GET, POST) - View/request songs
- ✅ `/api/jukebox/popular` (GET) - Popular songs
- ✅ `/api/jukebox/sequences` (GET) - Available sequences
- ✅ `/api/jukebox/metadata` (GET) - Song metadata
- ✅ `/api/jukebox/status` (GET only) - Currently playing
- ✅ `/api/votes` (GET, POST) - Vote on sequences
- ✅ `/api/santa/send-letter` (POST) - Submit letter to Santa
- ✅ `/api/santa/check-limit` (POST) - Check rate limit
- ✅ `/api/theme` (GET only) - Get active theme
- ✅ `/api/health` (GET) - Health check
- ✅ `/api/version` (GET) - App version
- ✅ `/api/analytics/track` (POST) - Track page views

**Rate Limiting:**
- All public routes should have rate limiting by IP
- Santa letters: 3/day per email + IP
- Votes: 1 per sequence per session
- Song requests: 5/hour per IP

### ADMIN ROUTES (Require Authentication)
**Purpose:** Protect administrative functions and data management

#### Model Management
- `/api/models` (GET, POST, PUT, DELETE)
- `/api/models/[id]` (GET, PUT, DELETE)
- `/api/models/import` (POST) ✅

#### Settings
- `/api/settings` (GET, POST)
- `/api/settings/santa-letters` (GET, POST)
- `/api/theme` (POST only)

#### FPP Management
- `/api/fpp/playlists` (GET, POST)
- `/api/fpp/sequences` (GET)
- `/api/fpp/health` (GET)
- `/api/fpp/sync` (POST)
- `/api/fppd/[...slug]` (all methods)

#### Jukebox Admin
- `/api/jukebox/process-queue` (POST)
- `/api/jukebox/refresh-cache` (POST)
- `/api/jukebox/status` (PUT only)

#### Santa Admin
- `/api/santa/admin-letters` (GET, POST, PUT, PATCH) ✅
- `/api/santa/resend-email` (POST) ✅
- `/api/santa/process-queue` (POST)
- `/api/santa/trigger-queue` (GET, POST)

#### Analytics Admin
- `/api/analytics` (GET)
- `/api/analytics/votes` (GET)
- `/api/analytics/export` (GET)
- `/api/analytics/requests` (GET)
- `/api/analytics/alerts` (GET)
- `/api/analytics/sequence/[name]` (GET, HEAD)
- `/api/admin/analytics` (GET)

#### Device Management
- `/api/devices/status` (GET) ✅
- `/api/devices/manage` (GET, POST, PUT, DELETE) ✅
- `/api/devices/schedule` (GET, POST) ✅
- `/api/devices/check` (GET)

#### System Management
- `/api/system/check-updates` (GET) ✅
- `/api/system/update` (POST) ✅
- `/api/system/update-status` (GET) ✅
- `/api/system/update/stream` (GET - SSE)
- `/api/update` (POST) ✅
- `/api/web/[...slug]` (all methods) ✅

#### Media Library
- `/api/spotify/search` (GET)
- `/api/spotify/metadata/[name]` (GET, PUT)
- `/api/spotify/metadata/[name]/override` (POST)

#### Database
- `/api/database/maintenance` (POST, DELETE) ✅

---

## ⚠️ Risk Assessment

### High Risk (Unprotected Admin Operations)
**Impact:** Anyone could modify data, trigger background jobs, or access sensitive info

1. **Model Management** - Unrestricted CRUD on models database
2. **FPP Control** - Anyone could trigger playlists/sequences
3. **Background Jobs** - Queue processing could be spammed
4. **Analytics** - Sensitive user data exposed

### Medium Risk (Information Disclosure)
**Impact:** Analytics and system information visible to public

1. **Analytics Routes** - Vote patterns, request stats, user behavior
2. **Device Status** - Network topology information
3. **System Status** - Version info, update status

### Low Risk (Already Mitigated)
**Impact:** Rate limited or already secured

1. **Public Jukebox** - Rate limited by IP ✅
2. **Santa Letters** - Rate limited (3/day) ✅
3. **Voting** - Session-based limits ✅

---

## 🧪 Testing Strategy

### Pre-Implementation Testing
1. Document current behavior (screenshot each page)
2. Test public jukebox as anonymous user
3. Test admin features as logged-in admin
4. Record all working features

### Post-Batch Testing (Repeat after each batch)

#### As Anonymous User (Incognito Window)
- [ ] Can view jukebox page
- [ ] Can see currently playing song
- [ ] Can see available songs in dropdown
- [ ] Can request a song (rate limit enforced)
- [ ] Can vote on sequences
- [ ] Can submit Santa letter
- [ ] Can see vote counts
- [ ] Can view active theme
- [ ] **Cannot** access admin pages (redirects to login)
- [ ] **Cannot** call admin API endpoints (401/403 errors)

#### As Logged-In Admin
- [ ] Can access all admin pages
- [ ] Can manage models (CRUD)
- [ ] Can change settings
- [ ] Can manage devices
- [ ] Can view analytics
- [ ] Can trigger system updates
- [ ] Can manage Santa letters
- [ ] Can refresh jukebox cache
- [ ] All admin API calls succeed (200 status)

#### Browser Console Check
- [ ] **No 401 errors** for public user on jukebox page
- [ ] **No 403 errors** for public user on jukebox page
- [ ] **No CORS errors**
- [ ] FPP connection errors acceptable (network-dependent)

---

## 📝 Implementation Checklist

### Batch 1: Critical Admin Routes
- [ ] `/api/models/route.ts` - Add requireAdmin() to POST/PUT/DELETE
- [ ] `/api/models/[id]/route.ts` - Add requireAdmin() to all methods
- [ ] `/api/settings/santa-letters/route.ts` - Add requireAdmin()
- [ ] `/api/fpp/playlists/route.ts` - Add requireAdmin()
- [ ] `/api/fpp/sequences/route.ts` - Add requireAdmin()
- [ ] `/api/fpp/health/route.ts` - Add requireAdmin()
- [ ] Test Batch 1 (admin and public features)
- [ ] Commit: "feat: Secure critical admin routes (models, FPP, Santa settings)"

### Batch 2: Background Operations
- [ ] `/api/jukebox/process-queue/route.ts` - Add requireAdmin()
- [ ] `/api/jukebox/refresh-cache/route.ts` - Add requireAdmin()
- [ ] `/api/santa/process-queue/route.ts` - Add requireAdmin()
- [ ] `/api/santa/trigger-queue/route.ts` - Add requireAdmin()
- [ ] `/api/devices/check/route.ts` - Add requireAdmin()
- [ ] Update `app/jukebox/page.tsx` - Only run admin operations if isAdmin
- [ ] Test Batch 2 (no 401 errors for public users)
- [ ] Commit: "feat: Secure background operations (admin-only triggers)"

### Batch 3: Analytics & Remaining
- [ ] `/api/analytics/route.ts` - Add requireAdmin()
- [ ] `/api/analytics/votes/route.ts` - Add requireAdmin()
- [ ] `/api/analytics/export/route.ts` - Add requireAdmin()
- [ ] `/api/analytics/requests/route.ts` - Add requireAdmin()
- [ ] `/api/analytics/alerts/route.ts` - Add requireAdmin()
- [ ] `/api/analytics/sequence/[name]/route.ts` - Add requireAdmin() to GET/HEAD
- [ ] `/api/admin/analytics/route.ts` - Add requireAdmin()
- [ ] `/api/spotify/search/route.ts` - Standardize to requireAdmin()
- [ ] `/api/spotify/metadata/[name]/override/route.ts` - Add requireAdmin()
- [ ] `/api/fppd/[...slug]/route.ts` - Add requireAdmin()
- [ ] `/api/system/update/stream/route.ts` - Add requireAdmin()
- [ ] Test Batch 3 (comprehensive admin + public tests)
- [ ] Commit: "feat: Secure analytics and proxy routes"

### Batch 4: Standardization
- [ ] Review all routes with getServerSession
- [ ] Standardize to requireAdmin() pattern
- [ ] Add JSDoc comments for public routes
- [ ] Verify error handling consistency
- [ ] Test all routes (final comprehensive test)
- [ ] Commit: "refactor: Standardize auth patterns across all routes"

---

## 🔍 Monitoring & Validation

### Post-Deployment Monitoring
1. Check server logs for authentication errors
2. Monitor rate limit hits (should see some for public routes)
3. Watch for 401/403 errors (should only be malicious attempts)
4. Monitor FPP connection errors (network-dependent, not auth issue)

### Success Criteria
- ✅ All admin routes require authentication
- ✅ All public routes remain accessible
- ✅ No 401 errors for legitimate public users
- ✅ Rate limiting prevents abuse
- ✅ Admin features work correctly
- ✅ Public jukebox fully functional
- ✅ Santa letters work for anonymous users
- ✅ Voting works for anonymous users

### Rollback Plan
If issues occur:
1. Check `git log` for last working commit
2. Create backup branch: `git branch backup-security-$(date +%Y%m%d)`
3. Rollback: `git reset --hard <commit-before-security>`
4. Review what went wrong
5. Fix and retest before redeploying

---

## 📚 References

- [NextAuth.js Documentation](https://next-auth.js.org/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)

---

## 📅 Timeline

- **Phase 1 (Audit):** ✅ Complete - November 7, 2025
- **Phase 2 (Batch 1):** Estimated 1-2 hours
- **Phase 3 (Batch 2):** Estimated 1 hour
- **Phase 4 (Batch 3):** Estimated 1-2 hours
- **Phase 5 (Standardization):** Estimated 30 minutes
- **Total Estimated Time:** 4-6 hours (spread across multiple sessions)

---

**Last Updated:** November 7, 2025  
**Next Review:** After each batch completion
