
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, LogIn, LogOut } from 'lucide-react';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { useTheme } from '@/lib/themes/theme-context';
import ThemedJukeboxWrapper from '@/components/ThemedJukeboxWrapper';
import LetterToSantaModal from '@/components/LetterToSantaModal';
import LocationPermissionModal, {
  getCachedLocation,
  getStoredPermissionStatus,
  clearLocationPermission
} from '@/components/LocationPermissionModal';
import LocationStatusBadge, { type LocationStatus } from '@/components/LocationStatusBadge';
import Toast from '@/components/Toast';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import JukeboxBanner from '@/components/JukeboxBanner';
import AudioSyncPlayer from '@/components/AudioSyncPlayer';
import Footer from '@/components/Footer';
import RadioBar from '@/components/jukebox/RadioBar';
import ShowStatusStrip from '@/components/jukebox/ShowStatusStrip';
import CourtesyCard from '@/components/jukebox/CourtesyCard';
import NowPlayingCard, { type NowPlayingInfo } from '@/components/jukebox/NowPlayingCard';
import UpNextList from '@/components/jukebox/UpNextList';
import SongCatalog from '@/components/jukebox/SongCatalog';
import RequestConfirmModal from '@/components/jukebox/RequestConfirmModal';
import ShowSpecsCard from '@/components/jukebox/ShowSpecsCard';
import { getThemeAccent, CARD } from '@/components/jukebox/theme-accent';
import { formatDateTime } from '@/lib/time-utils';
import { getBrowserLocation, getDistanceInMiles, type UserLocation } from '@/lib/location-utils';
import { estimateWaits, stripFseq, type CatalogSong, type PublicQueueItem, type ShowSpec } from '@/lib/jukebox-display';
import { TIMING } from '@/lib/constants';

interface CurrentlyPlaying {
  id: number | null; // null when the song comes from the FPP schedule, not the request queue
  sequence_name: string; // Original sequence name without .fseq extension
  media_name?: string | null; // MP3/media filename for Spotify matching
  requester_name?: string | null;
  played_at?: string | null;
  cached?: boolean; // Whether data is from cache or direct FPP query
  cache_age_seconds?: number; // Age of cached data in seconds
}

interface SequenceMetadata {
  sequence_name: string; // Now contains sequence names without .fseq extension
  song_title: string;
  artist: string;
  album: string;
  release_year: number | null;
  album_cover_url: string | null;
  spotify_id: string | null;
  spotify_url: string | null; // Spotify external URL for "Listen on Spotify" button
  cached: boolean;
}

interface YouTubeVideo {
  id: number;
  title: string;
  videoId: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string;
  theme?: string;
  youtubeUrl?: string;
  embedUrl?: string;
}

interface ScheduleStatus {
  isActive: boolean;
  currentPlaylist: string | null;
  status: string;
  message: string;
  nextShowTime: string | null;
  nextShowDate: string | null;
  nextShowDay: string | null;
  nextShowStartTime: string | null;
  nextShowEndTime: string | null;
  countdown: string | null;
  lastChecked: string;
}

/** Playback position reported by the FPP poller cache (/api/fpp/cached-status) */
interface FppProgress {
  sequence: string | null;
  played: number;
  remaining: number;
  fetchedAt: number;
}

const ADMIN_BUTTON = 'min-h-11 rounded-xl px-3 text-sm font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
// Radio-bar buttons: a square icon on phones, the label from sm up, never wrapping
const BAR_BUTTON = 'flex min-w-11 items-center justify-center whitespace-nowrap';

export default function JukeboxPage() {
  // Track visitor engagement
  useVisitorTracking('/jukebox');

  const { data: session } = useSession();
  const { theme } = useTheme();
  const accent = getThemeAccent(theme.id);
  const isAdmin = session?.user?.role === 'admin';
  const router = useRouter();
  const [queue, setQueue] = useState<PublicQueueItem[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<CurrentlyPlaying | null>(null);
  const [currentMetadata, setCurrentMetadata] = useState<SequenceMetadata | null>(null);
  const [availableSongs, setAvailableSongs] = useState<CatalogSong[]>([]);
  const [requesterName, setRequesterName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [loadingSequences, setLoadingSequences] = useState(true);
  const [showSantaModal, setShowSantaModal] = useState(false);
  const isChristmasTheme = theme.id === 'christmas';
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [selectedYouTubeVideo, setSelectedYouTubeVideo] = useState<YouTubeVideo | null>(null);
  const [loadingYouTubeVideos, setLoadingYouTubeVideos] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [jukeboxRateLimit, setJukeboxRateLimit] = useState<number>(3);
  const [requestsRemaining, setRequestsRemaining] = useState<number | null>(null);
  const [siteName, setSiteName] = useState('');
  const [fmFrequency, setFmFrequency] = useState('');
  const [courtesyLines, setCourtesyLines] = useState<string[]>([]);
  const [showSpecs, setShowSpecs] = useState<ShowSpec[]>([]);
  const [audienceEnabled, setAudienceEnabled] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [confirmSong, setConfirmSong] = useState<CatalogSong | null>(null);
  const [fppProgress, setFppProgress] = useState<FppProgress | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [locationError, setLocationError] = useState<string | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<'granted' | 'denied' | 'skipped' | null>(null);
  const [distanceFromShow, setDistanceFromShow] = useState<number | null>(null);
  const [showLocation, setShowLocation] = useState<{ lat: number; lng: number; maxDistance: number } | null>(null);
  const [locationRestrictionsEnabled, setLocationRestrictionsEnabled] = useState<boolean | null>(null); // null = loading, true/false = loaded

  // Lazy location modal state - only show when user tries to take action
  const [showLocationModal, setShowLocationModal] = useState(false);
  // Use a ref for pendingAction to avoid stale closure issues
  const pendingActionRef = useRef<((location?: UserLocation) => void) | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  });

  // Show toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  // Compute location badge status - returns null if restrictions disabled or no location yet
  const getLocationBadgeStatus = useCallback((): LocationStatus | null => {
    // Don't show badge if restrictions are disabled or still loading
    if (locationRestrictionsEnabled === false) return null;
    if (locationRestrictionsEnabled === null) return null; // Still loading

    // Only show badge when we have location and can display the distance
    // Don't show "Enable", "Blocked", or "Checking" states - keep it minimal
    if (userLocation && showLocation && distanceFromShow !== null) {
      if (distanceFromShow > showLocation.maxDistance) {
        return 'out-of-range';
      }
      return 'granted';
    }

    // Return null for all other states - badge won't show
    return null;
  }, [userLocation, showLocation, distanceFromShow, locationRestrictionsEnabled]);

  // Restore cached location from localStorage on mount
  useEffect(() => {
    // Try localStorage first (persistent)
    const cachedLocation = getCachedLocation();
    const storedStatus = getStoredPermissionStatus();

    if (cachedLocation) {
      setUserLocation(cachedLocation);
      setLocationPermissionStatus('granted');
      console.log('[Location] Restored location from localStorage');
    } else if (storedStatus) {
      setLocationPermissionStatus(storedStatus);
    } else {
      // Fall back to sessionStorage for backwards compatibility
      const sessionLocation = sessionStorage.getItem('user-location');
      const sessionTimestamp = sessionStorage.getItem('user-location-timestamp');
      const sessionPermission = sessionStorage.getItem('location-permission-requested');

      if (sessionLocation && sessionTimestamp) {
        try {
          const locationAge = Date.now() - parseInt(sessionTimestamp);
          const LOCATION_MAX_AGE = 30 * 60 * 1000;

          if (locationAge < LOCATION_MAX_AGE) {
            const location = JSON.parse(sessionLocation);
            setUserLocation(location);
            setLocationPermissionStatus('granted');
            console.log(`[Location] Restored cached location from session (${Math.round(locationAge / 60000)} minutes old)`);
          }
        } catch (error) {
          console.error('Failed to parse cached location:', error);
        }
      }

      if (sessionPermission && !cachedLocation) {
        setLocationPermissionStatus(sessionPermission as 'granted' | 'denied' | 'skipped');
      }
    }
  }, []);

  // Check browser's actual geolocation permission on mount (when restrictions enabled)
  useEffect(() => {
    console.log('[Location] Mount effect - locationRestrictionsEnabled:', locationRestrictionsEnabled, 'userLocation:', userLocation ? 'exists' : 'null');

    // ONLY check if restrictions are explicitly ENABLED (true)
    // Don't check if null (loading) or false (disabled)
    if (locationRestrictionsEnabled !== true) {
      console.log('[Location] Skipping auto-check - restrictions not enabled');
      return;
    }

    // Don't check if we already have location
    if (userLocation) {
      console.log('[Location] Already have location - skipping auto-check');
      return;
    }

    console.log('[Location] Starting browser permission check...');
    // Check browser's permission state using Permissions API
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((permissionStatus) => {
        console.log('[Location] Browser permission state:', permissionStatus.state);

        if (permissionStatus.state === 'granted') {
          // Browser already has permission - fetch location silently
          console.log('[Location] Permission already granted by browser - fetching location...');
          getBrowserLocation()
            .then((location) => {
              setUserLocation(location);
              setLocationPermissionStatus('granted'); // Only set after successful fetch

              // Store for persistence
              localStorage.setItem('fpp-user-location', JSON.stringify(location));
              localStorage.setItem('fpp-location-timestamp', Date.now().toString());
              localStorage.setItem('fpp-location-permission-status', 'granted');

              console.log('[Location] Location fetched successfully on mount');
            })
            .catch((error) => {
              console.log('[Location] Failed to fetch location on mount:', error.message);
              // Don't set permission status - leave it null so modal will show on user action
            });
        } else if (permissionStatus.state === 'denied') {
          setLocationPermissionStatus('denied');
          console.log('[Location] Browser permission previously denied');
        } else {
          // 'prompt' state - do nothing, wait for user action
          console.log('[Location] Browser permission not yet requested - will prompt on user action');
        }
      }).catch((error) => {
        console.log('[Location] Permissions API not supported or failed:', error);
      });
    } else {
      console.log('[Location] Permissions API not available in this browser');
    }
  }, [locationRestrictionsEnabled, userLocation]);

  // Location modal callbacks
  const handleLocationGranted = (location: UserLocation) => {
    setUserLocation(location);
    setLocationPermissionStatus('granted');
    setLocationError(null);
    setShowLocationModal(false);

    // localStorage is now handled in the modal itself
    // Also update sessionStorage for backwards compatibility
    sessionStorage.setItem('user-location', JSON.stringify(location));
    sessionStorage.setItem('user-location-timestamp', Date.now().toString());
    sessionStorage.setItem('location-permission-requested', 'granted');

    showToast('✅ Location enabled! Your action will continue...', 'success');

    // Execute pending action if any (using ref to avoid stale closure)
    // IMPORTANT: Pass location directly since React state update is async
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      setTimeout(() => {
        action(location);
      }, 500);
    }
  };

  const handleLocationDenied = () => {
    setLocationPermissionStatus('denied');
    setUserLocation(null);
    setShowLocationModal(false);
    sessionStorage.removeItem('user-location');
    sessionStorage.setItem('location-permission-requested', 'denied');
    pendingActionRef.current = null;

    // Informative toast - let user know they can try again when requesting
    showToast('📍 Location not enabled. You\'ll be asked again when you request a song.', 'info');
  };

  const handleLocationSkipped = () => {
    setLocationPermissionStatus('skipped');
    setShowLocationModal(false);
    sessionStorage.setItem('location-permission-requested', 'skipped');
    pendingActionRef.current = null;

    // Subtle toast - user can still browse, just can't interact
    showToast('📍 You can browse songs. Enable location when you\'re ready to request one!', 'info');
  };

  const resetLocationPermission = () => {
    clearLocationPermission();
    setUserLocation(null);
    setLocationPermissionStatus(null);
    setDistanceFromShow(null);
    setLocationError(null);
    // Show the modal to allow re-granting
    setShowLocationModal(true);
  };

  /**
   * Request location permission lazily - shows modal if permission not yet granted
   * Returns true if location is available (or not required), false if modal was shown
   */
  const ensureLocationPermission = useCallback(async (onSuccess?: (location?: UserLocation) => void): Promise<boolean> => {
    // If location restrictions are disabled, skip the whole flow
    if (locationRestrictionsEnabled === false) {
      console.log('[Location] Restrictions disabled - skipping location check');
      return true;
    }

    // If still loading restriction settings, wait - don't ask for location yet
    if (locationRestrictionsEnabled === null) {
      console.log('[Location] Still loading restriction settings... waiting');
      showToast('⏳ Loading settings...', 'info');
      return false;
    }

    console.log('[Location] Restrictions enabled - checking location availability');

    // Already have location? Great!
    if (userLocation) {
      console.log('[Location] Already have location');
      return true;
    }

    // Clear any previous location errors when showing the modal
    setLocationError(null);

    // Permission was denied? Show modal to let user try again
    if (locationPermissionStatus === 'denied') {
      console.log('[Location] Permission denied - showing modal');
      pendingActionRef.current = onSuccess || null;
      setShowLocationModal(true);
      return false;
    }

    // No previous interaction? Show the explanation modal
    if (locationPermissionStatus === null || locationPermissionStatus === 'skipped') {
      console.log('[Location] No permission yet - showing modal');
      pendingActionRef.current = onSuccess || null;
      setShowLocationModal(true);
      return false;
    }

    // Permission was granted but no location (expired?) - try to get it silently
    console.log('[Location] Permission granted but location missing - fetching silently...');
    setCheckingLocation(true);
    try {
      const location = await getBrowserLocation();
      setUserLocation(location);
      setLocationPermissionStatus('granted');

      // Store in localStorage for persistence
      localStorage.setItem('fpp-user-location', JSON.stringify(location));
      localStorage.setItem('fpp-location-timestamp', Date.now().toString());

      // Also sessionStorage for backwards compatibility
      sessionStorage.setItem('user-location', JSON.stringify(location));
      sessionStorage.setItem('user-location-timestamp', Date.now().toString());

      setCheckingLocation(false);
      console.log('[Location] Location fetched successfully');

      // If there's a pending action callback, call it immediately with the fresh location
      // This prevents race condition where state hasn't updated yet
      if (onSuccess) {
        console.log('[Location] Calling pending action with fresh location');
        await onSuccess(location);
        return false; // Return false to prevent double-execution in caller
      }

      return true;
    } catch (error: any) {
      setCheckingLocation(false);
      console.log('[Location] Silent location fetch failed:', error.message);

      // Browser needs user gesture - show modal to explain and let user try
      pendingActionRef.current = onSuccess || null;
      setShowLocationModal(true);
      return false;
    }
  }, [userLocation, locationPermissionStatus, locationRestrictionsEnabled]);

  // Re-fetch YouTube videos when theme changes
  useEffect(() => {
    fetchYouTubeVideos();
  }, [theme.id]);

  // Calculate distance when user location and show location are both available
  useEffect(() => {
    if (userLocation && showLocation) {
      const distance = getDistanceInMiles(
        userLocation.lat,
        userLocation.lng,
        showLocation.lat,
        showLocation.lng
      );
      setDistanceFromShow(distance);
      console.log(`[Location] Distance from show: ${distance.toFixed(2)} miles (max: ${showLocation.maxDistance})`);
    }
  }, [userLocation, showLocation]);

  useEffect(() => {
    fetchAvailableSequences();
    fetchData();
    fetchYouTubeVideos();
    fetchScheduleStatus(); // Check schedule status
    fetchJukeboxSettings(); // Fetch jukebox rate limit, insert mode, and visitor page settings
    fetchLocationRestrictions(); // Fetch location settings for distance calculation

    const interval = setInterval(fetchData, TIMING.POLL_INTERVAL_FAST);
    const scheduleInterval = setInterval(fetchScheduleStatus, TIMING.POLL_INTERVAL_SLOW);

    // Refresh request status to keep it up to date
    const requestStatusInterval = setInterval(() => {
      if (jukeboxRateLimit > 0) {
        fetchRequestStatus(jukeboxRateLimit);
      }
    }, TIMING.POLL_INTERVAL_MEDIUM);

    // Background queue processor - check every 10 seconds (runs for everyone)
    const queueProcessorInterval = setInterval(async () => {
      try {
        await fetch('/api/jukebox/process-queue', { method: 'POST' });
      } catch (error) {
        console.error('Queue processor failed:', error);
      }
    }, 10000); // 10 seconds

    // Admin-only background operations
    let cacheRefreshInterval: NodeJS.Timeout | undefined;

    if (isAdmin) {
      // Background cache refresh every 10 minutes (admin only)
      cacheRefreshInterval = setInterval(async () => {
        try {
          const response = await fetch('/api/jukebox/refresh-cache', { method: 'POST' });
          const data = await response.json();

          if (data.success) {
            console.log(`[Jukebox] Background cache refresh: ${data.sequencesCached} sequences cached`);
          } else {
            // Only log if not offline (reduce console spam)
            if (data.error !== 'FPP is offline') {
              console.warn('[Jukebox] Background cache refresh failed:', data.error);
            }
          }
        } catch (error) {
          // Silently fail for background refreshes to avoid console spam
          // Only log if it's not a timeout/abort error
          if (error instanceof Error && error.name !== 'AbortError') {
            console.error('Background cache refresh failed:', error);
          }
        }
      }, 10 * 60 * 1000); // 10 minutes
    }

    // ✅ MEMORY LEAK FIX: Clear all intervals on unmount
    return () => {
      clearInterval(interval);
      clearInterval(scheduleInterval);
      clearInterval(requestStatusInterval);
      clearInterval(queueProcessorInterval);
      if (cacheRefreshInterval) clearInterval(cacheRefreshInterval);
    };
  }, [isAdmin]);

  // Playback position for the progress bar - polled from the FPP poller cache while the page is visible
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/fpp/cached-status');
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const played = Number(data.seconds_played);
        const remaining = Number(data.seconds_remaining);
        if (
          data.status === 'playing' &&
          !data.cache?.is_stale &&
          Number.isFinite(played) &&
          Number.isFinite(remaining) &&
          played + remaining > 0
        ) {
          setFppProgress({ sequence: data.current_sequence || null, played, remaining, fetchedAt: Date.now() });
        } else {
          setFppProgress(null);
        }
      } catch {
        // Keep the last known position; the next poll will correct it
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Advance the progress bar smoothly between polls
  useEffect(() => {
    if (!fppProgress) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [fppProgress]);

  // "Online now" counter - only when the admin has switched it on; each poll also counts this visitor
  useEffect(() => {
    if (!audienceEnabled) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/jukebox/audience');
        if (!response.ok || cancelled) return;
        const data = await response.json();
        setAudienceCount(data.enabled && typeof data.count === 'number' ? data.count : null);
      } catch {
        // Keep the last count; the next poll will correct it
      }
    };
    poll();
    const interval = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [audienceEnabled]);

  const fetchData = async () => {
    try {
      const [queueRes, statusRes] = await Promise.all([
        fetch('/api/jukebox/queue'),
        fetch('/api/jukebox/status')
      ]);

      if (queueRes.ok) {
        const queueData = await queueRes.json();
        setQueue(queueData);
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setCurrentlyPlaying(statusData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchYouTubeVideos = async () => {
    try {
      setLoadingYouTubeVideos(true);
      const response = await fetch('/api/jukebox/videos');
      if (response.ok) {
        const data = await response.json();
        const videos = data.videos || [];
        setYoutubeVideos(videos);
        // Don't auto-select - let user choose which video to play
      }
    } catch (error) {
      console.error('Failed to fetch YouTube videos:', error);
    } finally {
      setLoadingYouTubeVideos(false);
    }
  };

  const fetchScheduleStatus = async () => {
    try {
      const response = await fetch('/api/jukebox/schedule-status');
      if (response.ok) {
        const data = await response.json();
        setScheduleStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch schedule status:', error);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const fetchJukeboxSettings = async () => {
    try {
      const response = await fetch('/api/jukebox/settings');
      if (response.ok) {
        const data = await response.json();
        setJukeboxRateLimit(data.rateLimit || 3);
        // Insert mode is used server-side only, visitors don't need to see it
        setSiteName(data.siteName || '');
        setFmFrequency(data.fmFrequency || '');
        setCourtesyLines(data.courtesy?.enabled && Array.isArray(data.courtesy.lines) ? data.courtesy.lines : []);
        setShowSpecs(Array.isArray(data.specs) ? data.specs : []);
        setAudienceEnabled(data.audienceEnabled === true);

        // After getting rate limit, fetch current request status
        await fetchRequestStatus(data.rateLimit || 3);
      }
    } catch (error) {
      console.error('Failed to fetch jukebox settings:', error);
      // Keep defaults on error
    }
  };

  const fetchRequestStatus = async (rateLimit: number) => {
    try {
      // Get user's IP-based request count from the queue
      const response = await fetch('/api/jukebox/request-status');
      if (response.ok) {
        const data = await response.json();
        // Use the requestsRemaining from the API response directly
        // instead of recalculating, to avoid race conditions with rate limit updates
        setRequestsRemaining(data.requestsRemaining);
      }
    } catch (error) {
      console.error('Failed to fetch request status:', error);
    }
  };

  const fetchLocationRestrictions = async () => {
    try {
      const response = await fetch('/api/location-restrictions');
      if (response.ok) {
        const data = await response.json();
        // Track if restrictions are enabled
        const isEnabled = Boolean(data.enabled && data.show_latitude && data.show_longitude);
        setLocationRestrictionsEnabled(isEnabled);

        if (isEnabled) {
          setShowLocation({
            lat: data.show_latitude,
            lng: data.show_longitude,
            maxDistance: data.max_distance_miles || 1
          });
          console.log('[Location] Restrictions enabled - max distance:', data.max_distance_miles, 'miles');
        } else {
          setShowLocation(null);
          console.log('[Location] Restrictions disabled - location not required');
        }
      }
    } catch (error) {
      console.error('Failed to fetch location restrictions:', error);
      setLocationRestrictionsEnabled(false); // Assume disabled on error
    }
  };

  const fetchAvailableSequences = async () => {
    setLoadingSequences(true);
    setMessage('');

    try {
      console.log('[Jukebox] Fetching available sequences from cache...');

      // Always use the public cached sequences endpoint
      const response = await fetch('/api/jukebox/sequences');

      if (response.ok) {
        const data = await response.json();
        setAvailableSongs(Array.isArray(data.songs) ? data.songs : []);

        if (data.sequences.length === 0) {
          setMessage('⚠️ No songs available. Admin needs to refresh the cache.');
        } else {
          console.log(`[Jukebox] Loaded ${data.sequences.length} sequences from cache`);
        }
      } else {
        console.error('[Jukebox] Failed to fetch sequences');
        setAvailableSongs([]);
        setMessage('❌ Failed to load available songs. Please try again.');
      }
    } catch (error) {
      console.error('[Jukebox] Error fetching available sequences:', error);
      setAvailableSongs([]);
      setMessage('❌ Failed to load available songs. Please check your connection.');
    } finally {
      setLoadingSequences(false);
    }
  };

  const refreshSequenceCache = async () => {
    if (!isAdmin) {
      setMessage('⚠️ Only admins can refresh the song cache.');
      return;
    }

    setLoadingSequences(true);
    setMessage('🔄 Refreshing sequence cache from FPP...');

    try {
      const response = await fetch('/api/jukebox/refresh-cache', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✅ Cache refreshed! ${data.sequencesCached} sequences loaded.`);
        // Reload sequences from cache
        await fetchAvailableSequences();
      } else {
        const errorMsg = data.details || data.error || 'Failed to refresh cache';
        if (data.error === 'FPP is offline') {
          setMessage('⚠️ FPP is offline. Cannot refresh cache at this time.');
        } else if (data.error === 'FPP server timeout') {
          setMessage('⏱️ FPP server timeout. The server may be offline or busy.');
        } else {
          setMessage(`❌ ${errorMsg}`);
        }
      }
    } catch (error) {
      console.error('[Jukebox] Error refreshing cache:', error);
      setMessage('❌ Network error while refreshing cache.');
    } finally {
      setLoadingSequences(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // Helper function to submit a request (can be called directly or as pending action)
  // locationOverride is passed when called from handleLocationGranted (before state updates)
  const submitRequest = async (sequenceName: string, requesterNameValue: string, locationOverride?: UserLocation) => {
    setLoading(true);
    setMessage('');
    setLocationError(null);

    // Use override if provided (from pending action), otherwise use state
    // Will be undefined if restrictions are disabled (which is fine)
    const locationToUse = locationOverride || userLocation;

    try {
      const response = await fetch('/api/jukebox/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sequence_name: sequenceName,
          requester_name: requesterNameValue || undefined,
          userLocation: locationToUse
        }),
      });

      const data = await response.json();

      if (response.ok) {
        showToast(data.message || '🎵 Song added to queue!', 'success');

        // Update remaining requests count
        if (typeof data.requestsRemaining === 'number') {
          setRequestsRemaining(data.requestsRemaining);
        }

        fetchData(); // Refresh the queue
      } else {
        if (data.requiresLocation) {
          setLocationError(data.error);
          showToast(data.error, 'error');
        } else if (data.error?.includes('too far')) {
          showToast(`📍 ${data.error}`, 'error');
          setMessage(`📍 ${data.error}`);
        } else {
          setMessage(`❌ ${data.error || 'Failed to add song'}`);
          showToast(data.error || 'Failed to add song', 'error');
        }
      }
    } catch (error) {
      setMessage('❌ Error submitting request');
      showToast('Error submitting request. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Confirm modal → location gate → submit (same flow the old request form used)
  const confirmRequest = async () => {
    if (!confirmSong) return;
    const capturedSong = confirmSong.name;
    const capturedName = requesterName.trim();
    setConfirmSong(null);

    // The callback receives location directly when called from handleLocationGranted
    const hasLocation = await ensureLocationPermission((location?: UserLocation) => submitRequest(capturedSong, capturedName, location));
    if (!hasLocation) {
      // If false is returned, the action was already executed or modal will be shown
      return;
    }

    await submitRequest(capturedSong, capturedName);
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      const response = await fetch('/api/jukebox/status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, status }),
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const fetchMetadata = async (sequenceName: string) => {
    try {
      const response = await fetch(`/api/jukebox/metadata?sequence=${encodeURIComponent(sequenceName)}`);
      if (response.ok) {
        const metadata = await response.json();
        setCurrentMetadata(metadata);
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
      setCurrentMetadata(null);
    }
  };

  useEffect(() => {
    if (currentlyPlaying?.media_name) {
      fetchMetadata(currentlyPlaying.media_name);
    } else if (currentlyPlaying?.sequence_name) {
      // Fallback to sequence name if media name not available
      fetchMetadata(currentlyPlaying.sequence_name);
    } else {
      setCurrentMetadata(null);
    }
  }, [currentlyPlaying?.media_name, currentlyPlaying?.sequence_name]);

  // Determine if interactive features should be shown
  const showInteractiveFeatures = scheduleStatus?.isActive || isAdmin;

  // Format time in both standard and military format
  const formatTime = (timeStr: string) => {
    // timeStr is in HH:MM:SS or HH:MM format
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parts[1];

    // Convert to 12-hour format
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const standardTime = `${hours12}:${minutes} ${period}`;

    // Military time (already in 24-hour format)
    const militaryTime = `${String(hours).padStart(2, '0')}:${minutes}`;

    return `${standardTime} (${militaryTime})`;
  };

  // Format next show time
  const formatNextShowTime = (isoString: string | null) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    const now = new Date();

    // Calculate time until show
    const msUntil = date.getTime() - now.getTime();
    const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
    const minutesUntil = Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60));

    const formattedDate = date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Add countdown if less than 24 hours away
    if (hoursUntil < 24 && hoursUntil >= 0) {
      if (hoursUntil > 0) {
        return `${formattedDate} (in ${hoursUntil}h ${minutesUntil}m)`;
      } else if (minutesUntil > 0) {
        return `${formattedDate} (in ${minutesUntil} minutes!)`;
      } else {
        return `${formattedDate} (Starting soon!)`;
      }
    }

    return formattedDate;
  };

  // ── Derived display state ──────────────────────────────────────────────────
  // Progress applies only when FPP is playing the song the card shows
  const progressMatchesCard =
    fppProgress !== null &&
    (!currentlyPlaying || stripFseq(fppProgress.sequence) === stripFseq(currentlyPlaying.sequence_name));
  const progress = fppProgress && progressMatchesCard
    ? (() => {
        const total = fppProgress.played + fppProgress.remaining;
        const elapsed = Math.min(total, fppProgress.played + Math.max(0, nowTick - fppProgress.fetchedAt) / 1000);
        return { elapsed, total };
      })()
    : null;
  const currentRemainingSec = progress ? Math.max(0, progress.total - progress.elapsed) : null;
  const currentSequenceName = currentlyPlaying?.sequence_name ?? (fppProgress?.sequence ? stripFseq(fppProgress.sequence) : null);

  // Queue titles and wait estimates from the catalog (lengths are known after the admin refreshes the song cache)
  const songByName = new Map(availableSongs.map((song) => [song.name, song]));
  const queueSongs = queue.map((item) => songByName.get(stripFseq(item.sequence_name)));
  const queueTitles = queue.map((item, i) => queueSongs[i]?.title || item.sequence_name);
  const queueDurations = queueSongs.map((song) => song?.durationSeconds ?? null);
  const queueWaits = estimateWaits(currentRemainingSec, queueDurations);
  // A new request joins the end of the queue: its wait is one step past the last queued song
  const newRequestWait = estimateWaits(currentRemainingSec, [...queueDurations, null])[queue.length];

  const nowPlayingInfo: NowPlayingInfo | null = currentlyPlaying
    ? {
        title: currentMetadata?.song_title || currentlyPlaying.media_name || currentlyPlaying.sequence_name,
        artist: currentMetadata?.artist,
        album: currentMetadata?.album,
        coverUrl: currentMetadata?.album_cover_url,
        requesterName: currentlyPlaying.requester_name,
        startedLabel: currentlyPlaying.played_at ? formatDateTime(currentlyPlaying.played_at, 'short') : null,
        spotifyUrl: currentMetadata?.spotify_url,
        cacheAgeSeconds: currentlyPlaying.cached ? currentlyPlaying.cache_age_seconds ?? null : null,
      }
    : null;

  const locationBadgeStatus = getLocationBadgeStatus();

  return (
    <ThemedJukeboxWrapper>
      {/* Location Permission Modal - Lazy triggered */}
      {showLocationModal && (
        <LocationPermissionModal
          isOpen={showLocationModal}
          onClose={() => setShowLocationModal(false)}
          onLocationGranted={handleLocationGranted}
          onLocationDenied={handleLocationDenied}
          onSkip={handleLocationSkipped}
        />
      )}

      {/* Request confirmation */}
      {confirmSong && (
        <RequestConfirmModal
          song={confirmSong}
          position={queue.length + 1}
          currentRemainingSec={currentRemainingSec}
          waitSec={newRequestWait}
          requesterName={requesterName}
          onRequesterNameChange={setRequesterName}
          onConfirm={confirmRequest}
          onCancel={() => setConfirmSong(null)}
          accent={accent}
        />
      )}

      {/* Toast Notifications */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
        duration={4000}
      />

      <RadioBar
        siteName={siteName || 'Light Show Jukebox'}
        fmFrequency={fmFrequency}
        isPlaying={Boolean(currentlyPlaying || fppProgress)}
        showListenButton={Boolean(showInteractiveFeatures)}
        listening={listening}
        onToggleListen={() => setListening((v) => !v)}
        accent={accent}
        adminSlot={
          // Icon-only on phones so the bar fits on one line; words from the sm breakpoint up
          !session ? (
            <button type="button" onClick={() => signIn()} aria-label="Admin sign in" className={`${ADMIN_BUTTON} ${BAR_BUTTON} bg-white/10 hover:bg-white/20`}>
              <LogIn className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          ) : (
            <>
              {isAdmin && (
                <button type="button" onClick={() => router.push('/')} aria-label="Dashboard" className={`${ADMIN_BUTTON} ${BAR_BUTTON} bg-blue-600 hover:bg-blue-500`}>
                  <LayoutDashboard className="h-4 w-4 sm:hidden" aria-hidden="true" />
                  <span className="hidden sm:inline">Dashboard</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/jukebox' })}
                aria-label="Log out"
                title={session.user?.name ? `Signed in as ${session.user.name}` : undefined}
                className={`${ADMIN_BUTTON} ${BAR_BUTTON} bg-white/10 hover:bg-white/20`}
              >
                <LogOut className="h-4 w-4 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </>
          )
        }
      />

      {/* Clears the fixed radio bar, plus the string lights hanging under it in the Christmas theme */}
      <div
        className="mx-auto max-w-6xl space-y-5 pb-4"
        style={{ paddingTop: `calc(${theme.atmosphere === 'winter' ? '5.25rem' : '4.25rem'} + env(safe-area-inset-top))` }}
      >
        {/* In-browser audio, opened from the radio bar */}
        {listening && showInteractiveFeatures && <AudioSyncPlayer />}

        <ShowStatusStrip
          isActive={Boolean(scheduleStatus?.isActive)}
          nextShowDay={scheduleStatus?.nextShowDay ?? null}
          nextShowStartTime={scheduleStatus?.nextShowStartTime ?? null}
          nextShowEndTime={scheduleStatus?.nextShowEndTime ?? null}
          countdown={scheduleStatus?.countdown ?? null}
          audienceCount={audienceEnabled ? audienceCount : null}
          accent={accent}
        />

        {/* Unified Banner System */}
        <JukeboxBanner
          fppStatus={currentlyPlaying ? 'playing' : 'idle'}
          isMonitoringActive={scheduleStatus?.isActive || false}
          timeUntilNextShow={scheduleStatus?.countdown || undefined}
        />

        {/* Admin Override Notice */}
        {isAdmin && !scheduleStatus?.isActive && (
          <p className="rounded-xl border border-blue-400/40 bg-blue-600/25 px-4 py-3 text-center text-sm text-white backdrop-blur-md">
            🔧 <span className="font-semibold">Admin mode:</span> the show is inactive, but you can still test requests.
          </p>
        )}

        <CourtesyCard lines={courtesyLines} />

        {/* Write to Santa (Christmas theme only) */}
        {isChristmasTheme && (
          <section className={`${CARD} flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center`}>
            <div>
              <h2 className="text-xl font-bold text-white themed-font">🎅 Write a letter to Santa!</h2>
              <p className="mt-1 text-sm text-white/80">
                Send your Christmas wishes to the North Pole and get a magical reply from Santa himself.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSantaModal(true)}
              className="min-h-11 shrink-0 rounded-full bg-linear-to-r from-red-600 to-green-600 px-6 font-bold text-white shadow-lg transition hover:shadow-2xl motion-safe:hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              ✉️ Write to Santa
            </button>
          </section>
        )}

        <NowPlayingCard
          info={nowPlayingInfo}
          progress={progress}
          themeIcon={theme.icons.nowPlaying}
          accent={accent}
          adminActions={
            isAdmin && currentlyPlaying?.id ? (
              <>
                <button
                  type="button"
                  onClick={() => updateStatus(currentlyPlaying.id as number, 'completed')}
                  className={`${ADMIN_BUTTON} bg-green-600/90 hover:bg-green-600`}
                >
                  ✓ Mark complete
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(currentlyPlaying.id as number, 'skipped')}
                  className={`${ADMIN_BUTTON} bg-red-600/90 hover:bg-red-600`}
                >
                  ⏭️ Skip
                </button>
              </>
            ) : undefined
          }
        />

        {/* Requests - only while the show is active (or for admins) */}
        {showInteractiveFeatures && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SongCatalog
              songs={availableSongs}
              loading={loadingSequences}
              message={checkingLocation ? '📍 Getting your location…' : message}
              currentSequence={currentSequenceName}
              queuedNames={queue.map((item) => item.sequence_name)}
              requestsRemaining={requestsRemaining}
              rateLimit={jukeboxRateLimit}
              busy={loading || checkingLocation}
              onRequest={setConfirmSong}
              accent={accent}
              headerSlot={
                locationBadgeStatus !== null ? (
                  <LocationStatusBadge
                    status={locationBadgeStatus}
                    distanceFromShow={distanceFromShow}
                    maxDistance={showLocation?.maxDistance}
                    onRequestPermission={() => setShowLocationModal(true)}
                  />
                ) : undefined
              }
            />
            <UpNextList
              items={queue}
              titles={queueTitles}
              waits={queueWaits}
              accent={accent}
              renderAdminActions={
                isAdmin
                  ? (item) => (
                      <>
                        <button
                          type="button"
                          onClick={() => updateStatus(item.id, 'playing')}
                          className={`${ADMIN_BUTTON} bg-blue-600/90 hover:bg-blue-600`}
                        >
                          ▶️ Play now
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(item.id, 'skipped')}
                          className={`${ADMIN_BUTTON} bg-red-600/90 hover:bg-red-600`}
                        >
                          ✕ Remove
                        </button>
                      </>
                    )
                  : undefined
              }
            />
          </div>
        )}

        {/* Behind the Pixels - admin-entered display facts (shown even when the show is off) */}
        <ShowSpecsCard specs={showSpecs} accent={accent} />

        {/* YouTube Videos */}
        {youtubeVideos.length > 0 && (
          <section aria-labelledby="videos-heading" className={`${CARD} p-5`}>
            <h2 id="videos-heading" className="text-xl font-bold text-white themed-font">
              🎬 Watch past light shows
            </h2>
            <p className="mt-1 text-sm text-white/80">Enjoy videos of previous light shows and holiday displays!</p>

            {/* YouTube Player */}
            {selectedYouTubeVideo && (
              <div className="mt-4 space-y-3">
                <div className="aspect-video overflow-hidden rounded-xl bg-black/60">
                  <YouTubePlayer
                    videoId={selectedYouTubeVideo.videoId}
                    width="100%"
                    height="100%"
                  />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="font-semibold text-white">{selectedYouTubeVideo.title}</h3>
                  {selectedYouTubeVideo.description && (
                    <p className="mt-1 text-sm text-white/80">{selectedYouTubeVideo.description}</p>
                  )}
                  <p className="mt-1 text-xs text-white/60">
                    Published {formatDateTime(selectedYouTubeVideo.publishedAt, 'medium')}
                  </p>
                </div>
              </div>
            )}

            {/* Video Thumbnails Grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {youtubeVideos.map((video) => (
                <button
                  type="button"
                  key={video.id}
                  onClick={() => setSelectedYouTubeVideo(video)}
                  aria-pressed={selectedYouTubeVideo?.id === video.id}
                  className={`overflow-hidden rounded-xl border-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                    selectedYouTubeVideo?.id === video.id ? 'border-white shadow-lg' : 'border-white/15 hover:border-white/40'
                  }`}
                >
                  {video.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail
                    <img src={video.thumbnailUrl} alt="" className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center bg-white/10 text-2xl" aria-hidden="true">🎬</div>
                  )}
                  <span className="block truncate bg-black/40 p-2 text-xs font-medium text-white">{video.title}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Letter to Santa Modal */}
      <LetterToSantaModal isOpen={showSantaModal} onClose={() => setShowSantaModal(false)} />

      {/* Footer - inside themed wrapper for seamless background */}
      <Footer />
    </ThemedJukeboxWrapper>
  );
}


