
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { useFppProgress } from '@/hooks/useFppProgress';
import { useAudienceCount } from '@/hooks/useAudienceCount';
import { useTheme } from '@/lib/themes/theme-context';
import ThemedJukeboxWrapper from '@/components/ThemedJukeboxWrapper';
import LetterToSantaModal from '@/components/LetterToSantaModal';
import TriviaModal from '@/components/trivia/TriviaModal';
import LocationPermissionModal, {
  getCachedLocation,
  getStoredPermissionStatus
} from '@/components/LocationPermissionModal';
import LocationStatusBadge, { type LocationStatus } from '@/components/LocationStatusBadge';
import Toast from '@/components/Toast';
import JukeboxBanner from '@/components/JukeboxBanner';
import AudioSyncPlayer from '@/components/AudioSyncPlayer';
import Footer from '@/components/Footer';
import RadioBar from '@/components/jukebox/RadioBar';
import RadioBarAdminSlot from '@/components/jukebox/RadioBarAdminSlot';
import { NowPlayingAdminActions, QueueItemAdminActions } from '@/components/jukebox/AdminQueueActions';
import { SantaCard, TriviaCard } from '@/components/jukebox/ChristmasCards';
import PastShowsSection from '@/components/jukebox/PastShowsSection';
import ShowHero from '@/components/jukebox/ShowHero';
import CourtesyCard from '@/components/jukebox/CourtesyCard';
import NowPlayingCard, { type NowPlayingInfo } from '@/components/jukebox/NowPlayingCard';
import UpNextList from '@/components/jukebox/UpNextList';
import SongCatalog from '@/components/jukebox/SongCatalog';
import PlaylistPicker from '@/components/jukebox/PlaylistPicker';
import RequestConfirmModal from '@/components/jukebox/RequestConfirmModal';
import ShowSpecsCard from '@/components/jukebox/ShowSpecsCard';
import { formatDateTime } from '@/lib/time-utils';
import { getBrowserLocation, type UserLocation } from '@/lib/location-utils';
import {
  buildQueueView,
  currentSongName,
  playbackProgress,
  playlistDetailsLine,
  showStatus,
  type CatalogSong,
  type PublicQueueItem,
  type ShowSpec,
  type VisitorPlaylist,
} from '@/lib/jukebox-display';
import { TIMING } from '@/lib/constants';

import type { CurrentlyPlaying, ScheduleStatus, SequenceMetadata, YouTubeVideo } from '@/lib/jukebox-page-types';

export default function JukeboxPage() {
  // Track visitor engagement
  useVisitorTracking('/jukebox');

  const { data: session } = useSession();
  const { theme } = useTheme();
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
  const [showTriviaModal, setShowTriviaModal] = useState(false);
  const isChristmasTheme = theme.id === 'christmas';
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [, setLoadingYouTubeVideos] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus | null>(null);
  const [, setLoadingSchedule] = useState(true);
  const [jukeboxRateLimit, setJukeboxRateLimit] = useState<number>(3);
  const [requestsRemaining, setRequestsRemaining] = useState<number | null>(null);
  const [siteName, setSiteName] = useState('');
  const [fmFrequency, setFmFrequency] = useState('');
  const [courtesyLines, setCourtesyLines] = useState<string[]>([]);
  const [showSpecs, setShowSpecs] = useState<ShowSpec[]>([]);
  const [audienceEnabled, setAudienceEnabled] = useState(false);
  const audienceCount = useAudienceCount(audienceEnabled);
  const [listening, setListening] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const [confirmSong, setConfirmSong] = useState<CatalogSong | null>(null);
  const [playlists, setPlaylists] = useState<VisitorPlaylist[]>([]);
  const [confirmPlaylist, setConfirmPlaylist] = useState<VisitorPlaylist | null>(null);
  // Playback position reported by the FPP poller cache; a new song refreshes the title and queue
  const fetchDataRef = useRef<(() => Promise<void>) | null>(null);
  const { fppProgress, nowTick } = useFppProgress(() => { fetchDataRef.current?.(); });
  const [, setLocationError] = useState<string | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<'granted' | 'denied' | 'skipped' | null>(null);
  const [distanceFromShow, setDistanceFromShow] = useState<number | null>(null);
  // The server decides if the visitor is in range; the show's coordinates never reach the browser
  const [withinRange, setWithinRange] = useState<boolean | null>(null);
  const [showLocation, setShowLocation] = useState<{ maxDistance: number } | null>(null);
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
    if (userLocation && showLocation && distanceFromShow !== null && withinRange !== null) {
      return withinRange ? 'granted' : 'out-of-range';
    }

    // Return null for all other states - badge won't show
    return null;
  }, [userLocation, showLocation, distanceFromShow, withinRange, locationRestrictionsEnabled]);

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
    } catch (error) {
      setCheckingLocation(false);
      console.log('[Location] Silent location fetch failed:', error instanceof Error ? error.message : String(error));

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

  // Ask the server how far the visitor is from the show (it keeps the show's coordinates private)
  useEffect(() => {
    if (!userLocation || !showLocation) return;

    let cancelled = false;
    // Don't keep showing the old badge for a position that has changed
    setDistanceFromShow(null);
    setWithinRange(null);
    (async () => {
      try {
        const response = await fetch('/api/location-restrictions/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: userLocation.lat, lng: userLocation.lng })
        });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !data.enabled) return;
        setDistanceFromShow(data.distanceMiles);
        setWithinRange(Boolean(data.withinRange));
        console.log(`[Location] Distance from show: ${data.distanceMiles} miles (max: ${data.maxDistance})`);
      } catch (error) {
        console.error('Failed to check distance from the show:', error);
      }
    })();

    return () => { cancelled = true; };
  }, [userLocation, showLocation]);

  useEffect(() => {
    fetchAvailableSequences();
    fetchPlaylists();
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
        fetchRequestStatus();
      }
    }, TIMING.POLL_INTERVAL_MEDIUM);

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
      if (cacheRefreshInterval) clearInterval(cacheRefreshInterval);
    };
  }, [isAdmin]);

  // Latest fetchData for the song-change refresh above, which lives in a mount-once effect
  useEffect(() => {
    fetchDataRef.current = fetchData;
  });

  // Bring the player into view when it opens (it sits under Now Playing, which may be below the fold)
  useEffect(() => {
    if (!listening) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    playerRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [listening]);

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
        await fetchRequestStatus();
      }
    } catch (error) {
      console.error('Failed to fetch jukebox settings:', error);
      // Keep defaults on error
    }
  };

  const fetchRequestStatus = async () => {
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
        const isEnabled = Boolean(data.enabled && data.configured);
        setLocationRestrictionsEnabled(isEnabled);

        if (isEnabled) {
          setShowLocation({
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

  // Playlists tagged with the active theme (re-read on page load)
  const fetchPlaylists = async () => {
    try {
      const response = await fetch('/api/jukebox/playlists');
      if (response.ok) {
        const data = await response.json();
        setPlaylists(Array.isArray(data.playlists) ? data.playlists : []);
      }
    } catch (error) {
      console.error('[Jukebox] Error fetching playlists:', error);
    }
  };

  // Helper function to submit a request (can be called directly or as pending action)
  // locationOverride is passed when called from handleLocationGranted (before state updates)
  const submitRequest = async (sequenceName: string, requesterNameValue: string, locationOverride?: UserLocation, isPlaylist = false) => {
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
          [isPlaylist ? 'playlist_name' : 'sequence_name']: sequenceName,
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
    } catch {
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

  // Same flow for a whole playlist
  const confirmPlaylistRequest = async () => {
    if (!confirmPlaylist) return;
    const capturedPlaylist = confirmPlaylist.name;
    const capturedName = requesterName.trim();
    setConfirmPlaylist(null);

    const hasLocation = await ensureLocationPermission((location?: UserLocation) => submitRequest(capturedPlaylist, capturedName, location, true));
    if (!hasLocation) return;

    await submitRequest(capturedPlaylist, capturedName, undefined, true);
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

  // ── Derived display state ──────────────────────────────────────────────────
  // Progress applies only when FPP is playing the song the card shows
  const progress = playbackProgress(fppProgress, currentlyPlaying ? currentlyPlaying.sequence_name : null, nowTick);
  const currentRemainingSec = progress ? Math.max(0, progress.total - progress.elapsed) : null;
  const currentSequenceName = currentSongName(currentlyPlaying?.sequence_name, fppProgress);

  // Queue titles and wait estimates from the catalog
  const queueView = buildQueueView(queue, availableSongs, playlists, currentRemainingSec);

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
          waitSec={queueView.newRequestWait}
          requesterName={requesterName}
          onRequesterNameChange={setRequesterName}
          onConfirm={confirmRequest}
          onCancel={() => setConfirmSong(null)}
        />
      )}

      {confirmPlaylist && (
        <RequestConfirmModal
          song={{
            name: confirmPlaylist.name,
            title: confirmPlaylist.name,
            artist: playlistDetailsLine({ itemCount: confirmPlaylist.itemCount, durationSeconds: null }),
            durationSeconds: confirmPlaylist.durationSeconds,
            category: null,
          }}
          heading="Request this playlist?"
          position={queue.length + 1}
          currentRemainingSec={currentRemainingSec}
          waitSec={queueView.newRequestWait}
          requesterName={requesterName}
          onRequesterNameChange={setRequesterName}
          onConfirm={confirmPlaylistRequest}
          onCancel={() => setConfirmPlaylist(null)}
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
        adminSlot={
          <RadioBarAdminSlot
            signedIn={Boolean(session)}
            isAdmin={isAdmin}
            userName={session?.user?.name}
            onSignIn={() => signIn()}
            onOpenDashboard={() => router.push('/')}
            onSignOut={() => signOut({ callbackUrl: '/jukebox' })}
          />
        }
      />

      {/* Clears the fixed radio bar and the string lights hanging under it */}
      <div className="mx-auto max-w-6xl px-4 pb-4" style={{ paddingTop: 'calc(5.75rem + env(safe-area-inset-top))' }}>
        <ShowHero
          siteName={siteName || 'Light Show Jukebox'}
          fmFrequency={fmFrequency}
          status={showStatus({
            isActive: Boolean(scheduleStatus?.isActive),
            currentShowEndTime: scheduleStatus?.currentShowEndTime ?? null,
            nextShowDay: scheduleStatus?.nextShowDay ?? null,
            nextShowStartTime: scheduleStatus?.nextShowStartTime ?? null,
            countdown: scheduleStatus?.countdown ?? null,
          })}
          showActions={Boolean(showInteractiveFeatures)}
          listening={listening}
          onToggleListen={() => setListening((v) => !v)}
          audienceCount={audienceEnabled ? audienceCount : null}
        />

        {/* minmax(0, …) columns keep long song titles from stretching a column past the screen */}
        <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-5">
          {/* Off-season message, when the admin has switched it on */}
          <JukeboxBanner />

          {/* Admin Override Notice */}
          {isAdmin && !scheduleStatus?.isActive && (
            <p className="rounded-xl border border-blue-400/40 bg-blue-600/25 px-4 py-3 text-center text-sm text-white">
              🔧 <span className="font-semibold">Admin mode:</span> the show is inactive, but you can still test requests.
            </p>
          )}

          <div className={`grid grid-cols-[minmax(0,1fr)] gap-5 ${showInteractiveFeatures ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]' : ''}`}>
            {/* Now Playing, with the in-browser player (opened from the hero) right under it */}
            <div className="grid content-start gap-5">
              <NowPlayingCard
                info={nowPlayingInfo}
                progress={progress}
                adminActions={
                  isAdmin && currentlyPlaying?.id ? (
                    <NowPlayingAdminActions
                      onComplete={() => updateStatus(currentlyPlaying.id as number, 'completed')}
                      onSkip={() => updateStatus(currentlyPlaying.id as number, 'skipped')}
                    />
                  ) : undefined
                }
              />

              {listening && showInteractiveFeatures && (
                <div ref={playerRef} className="scroll-mt-28">
                  <AudioSyncPlayer onClose={() => setListening(false)} />
                </div>
              )}
            </div>

            {/* Requests - only while the show is active (or for admins) */}
            {showInteractiveFeatures && (
              <UpNextList
                items={queue}
                titles={queueView.titles}
                waits={queueView.waits}
                renderAdminActions={
                  isAdmin
                    ? (item) => (
                        <QueueItemAdminActions
                          onPlayNow={() => updateStatus(item.id, 'playing')}
                          onRemove={() => updateStatus(item.id, 'skipped')}
                        />
                      )
                    : undefined
                }
              />
            )}
          </div>

          <div className={`grid grid-cols-[minmax(0,1fr)] gap-5 ${showInteractiveFeatures ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]' : ''}`}>
            {showInteractiveFeatures && (
              <SongCatalog
                songs={availableSongs}
                loading={loadingSequences}
                message={checkingLocation ? '📍 Getting your location…' : message}
                currentSequence={currentSequenceName}
                queuedNames={queueView.queuedSongNames}
                requestsRemaining={requestsRemaining}
                rateLimit={jukeboxRateLimit}
                busy={loading || checkingLocation}
                onRequest={setConfirmSong}
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
            )}

            {/* Side column; a row of cards when requests are closed */}
            <div className={`grid content-start gap-5 ${showInteractiveFeatures ? '' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
              {showInteractiveFeatures && playlists.length > 0 && (
                <PlaylistPicker
                  playlists={playlists}
                  playingPlaylist={currentlyPlaying?.playlist_name ?? null}
                  queuedPlaylists={queueView.queuedPlaylists}
                  requestsRemaining={requestsRemaining}
                  busy={loading || checkingLocation}
                  onRequest={setConfirmPlaylist}
                />
              )}
              {/* Write to Santa (Christmas theme only) */}
              {isChristmasTheme && <SantaCard onOpen={() => setShowSantaModal(true)} />}

              {/* The trivia game is Christmas trivia */}
              {isChristmasTheme && <TriviaCard onOpen={() => setShowTriviaModal(true)} />}

              <CourtesyCard lines={courtesyLines} />

              {/* Behind the Pixels - admin-entered display facts (shown even when the show is off) */}
              <ShowSpecsCard specs={showSpecs} />
            </div>
          </div>

          {/* Past light show videos (the section hides itself when there are none) */}
          <PastShowsSection videos={youtubeVideos} />
        </div>
      </div>

      {/* Letter to Santa Modal */}
      <LetterToSantaModal isOpen={showSantaModal} onClose={() => setShowSantaModal(false)} />

      {/* Trivia Modal */}
      {showTriviaModal && <TriviaModal onClose={() => setShowTriviaModal(false)} />}

      {/* Footer - inside themed wrapper for seamless background */}
      <Footer siteName={siteName || 'Light Show Jukebox'} />
    </ThemedJukeboxWrapper>
  );
}


