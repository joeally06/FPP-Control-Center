'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/lib/themes/theme-context';
import { getBrowserLocation, UserLocation } from '@/lib/location-utils';

// Storage keys for localStorage persistence
const STORAGE_KEYS = {
  PERMISSION_STATUS: 'fpp-location-permission-status',
  USER_LOCATION: 'fpp-user-location',
  LOCATION_TIMESTAMP: 'fpp-location-timestamp',
  REMEMBER_DEVICE: 'fpp-remember-location-device'
};

// Location cache duration: 30 minutes
const LOCATION_MAX_AGE = 30 * 60 * 1000;

interface LocationPermissionModalProps {
  /** Called when user grants permission and location is obtained */
  onLocationGranted: (location: UserLocation) => void;
  /** Called when user denies location permission */
  onLocationDenied: () => void;
  /** Called when user skips/dismisses the modal */
  onSkip: () => void;
  /** If true, modal is shown immediately (lazy trigger from action) */
  isOpen?: boolean;
  /** Called when modal should close */
  onClose?: () => void;
}

/**
 * Detect device type for tailored instructions
 */
function getDeviceType(): 'ios' | 'android' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  
  const ua = navigator.userAgent.toLowerCase();
  
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Check if there's a valid cached location in storage
 */
export function getCachedLocation(): UserLocation | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.USER_LOCATION);
    const timestamp = localStorage.getItem(STORAGE_KEYS.LOCATION_TIMESTAMP);
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp);
      if (age < LOCATION_MAX_AGE) {
        return JSON.parse(cached);
      }
      // Expired - clear it
      localStorage.removeItem(STORAGE_KEYS.USER_LOCATION);
      localStorage.removeItem(STORAGE_KEYS.LOCATION_TIMESTAMP);
    }
  } catch (e) {
    console.error('[Location] Error reading cached location:', e);
  }
  return null;
}

/**
 * Get stored permission status
 */
export function getStoredPermissionStatus(): 'granted' | 'denied' | 'skipped' | null {
  if (typeof window === 'undefined') return null;
  
  const status = localStorage.getItem(STORAGE_KEYS.PERMISSION_STATUS);
  if (status === 'granted' || status === 'denied' || status === 'skipped') {
    return status;
  }
  return null;
}

/**
 * Clear all location permission data (for reset)
 */
export function clearLocationPermission(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(STORAGE_KEYS.PERMISSION_STATUS);
  localStorage.removeItem(STORAGE_KEYS.USER_LOCATION);
  localStorage.removeItem(STORAGE_KEYS.LOCATION_TIMESTAMP);
  localStorage.removeItem(STORAGE_KEYS.REMEMBER_DEVICE);
  // Also clear session storage for backwards compatibility
  sessionStorage.removeItem('location-permission-requested');
  sessionStorage.removeItem('user-location');
  sessionStorage.removeItem('user-location-timestamp');
}

export default function LocationPermissionModal({ 
  onLocationGranted, 
  onLocationDenied,
  onSkip,
  isOpen = false,
  onClose
}: LocationPermissionModalProps) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [stage, setStage] = useState<'explain' | 'requesting' | 'error'>('explain');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('desktop');

  // Detect device type on mount
  useEffect(() => {
    setDeviceType(getDeviceType());
  }, []);

  // Handle visibility based on isOpen prop (lazy trigger)
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setStage('explain');
      setErrorMessage(null);
    }
  }, [isOpen]);

  const closeModal = useCallback(() => {
    setIsVisible(false);
    onClose?.();
  }, [onClose]);

  const handleAllow = async () => {
    setStage('requesting');
    setErrorMessage(null);
    
    console.log('[Modal] User clicked Allow - requesting location...');
    
    try {
      const location = await getBrowserLocation();
      console.log('[Modal] Location granted successfully:', location);
      
      // Store in localStorage for persistence across sessions
      localStorage.setItem(STORAGE_KEYS.PERMISSION_STATUS, 'granted');
      localStorage.setItem(STORAGE_KEYS.USER_LOCATION, JSON.stringify(location));
      localStorage.setItem(STORAGE_KEYS.LOCATION_TIMESTAMP, Date.now().toString());
      localStorage.setItem(STORAGE_KEYS.REMEMBER_DEVICE, rememberDevice ? 'true' : 'false');
      
      // Also store in sessionStorage for backwards compatibility
      sessionStorage.setItem('location-permission-requested', 'granted');
      sessionStorage.setItem('user-location', JSON.stringify(location));
      sessionStorage.setItem('user-location-timestamp', Date.now().toString());
      
      closeModal();
      onLocationGranted(location);
    } catch (error: any) {
      console.error('[Modal] Location request failed:', error);
      setStage('error');
      setErrorMessage(error.message || 'Location permission was denied');
    }
  };

  const handleDeny = () => {
    localStorage.setItem(STORAGE_KEYS.PERMISSION_STATUS, 'denied');
    sessionStorage.setItem('location-permission-requested', 'denied');
    closeModal();
    onLocationDenied();
  };

  const handleSkip = () => {
    // Skipped is temporary - don't persist to localStorage
    sessionStorage.setItem('location-permission-requested', 'skipped');
    closeModal();
    onSkip();
  };

  const handleTryAgain = () => {
    setStage('explain');
    setErrorMessage(null);
  };

  if (!isVisible) return null;

  // Device-specific help instructions
  const deviceInstructions = {
    ios: {
      title: '📱 iPhone/iPad Instructions',
      steps: [
        'Open Settings app on your device',
        'Scroll down and tap Safari (or your browser)',
        'Tap "Location"',
        'Select "Ask" or "Allow"',
        'Come back here and tap "Allow" again'
      ],
      extra: 'Note: iOS may also require Location Services to be enabled in Settings → Privacy & Security → Location Services'
    },
    android: {
      title: '📱 Android Instructions',
      steps: [
        'When the browser prompt appears, tap "Allow"',
        'If you previously blocked it: tap the 🔒 icon in the address bar',
        'Tap "Permissions" or "Site settings"',
        'Find "Location" and change to "Allow"',
        'Refresh the page and try again'
      ],
      extra: 'Tip: Make sure Location is enabled in your device settings (Settings → Location)'
    },
    desktop: {
      title: '💻 Desktop Browser Instructions',
      steps: [
        'Look for the 🔒 icon in your browser\'s address bar',
        'Click it and find "Site settings" or "Permissions"',
        'Find "Location" in the list',
        'Change it from "Block" to "Allow"',
        'Refresh the page and try again'
      ],
      extra: 'Works with Chrome, Firefox, Safari, and Edge'
    }
  };

  const instructions = deviceInstructions[deviceType];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div 
        className={`
          max-w-lg w-full rounded-2xl shadow-2xl border-2 overflow-hidden max-h-[90vh] overflow-y-auto
          ${theme.id === 'christmas' 
            ? 'bg-linear-to-br from-red-900/95 to-green-900/95 border-yellow-400' 
            : theme.id === 'halloween'
            ? 'bg-linear-to-br from-purple-900/95 to-orange-900/95 border-orange-500'
            : 'bg-linear-to-br from-blue-900/95 to-purple-900/95 border-blue-400'
          }
          animate-scale-in
        `}
      >
        {/* Header */}
        <div className="bg-white/10 p-5 border-b border-white/20">
          <div className="flex items-center gap-4">
            <div className="text-5xl">
              {stage === 'requesting' ? (
                <span className="animate-pulse">📍</span>
              ) : stage === 'error' ? (
                '⚠️'
              ) : (
                '📍'
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">
                {stage === 'error' 
                  ? 'Location Access Issue' 
                  : stage === 'requesting'
                  ? 'Getting Your Location...'
                  : 'Enable Location for Song Requests'}
              </h2>
              <p className="text-white/80 text-sm">
                {stage === 'error'
                  ? 'We couldn\'t get your location'
                  : stage === 'requesting'
                  ? 'Please allow when your browser asks'
                  : 'Quick one-tap setup to participate'}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          
          {/* STAGE: Explaining why we need location */}
          {stage === 'explain' && (
            <>
              {/* Simple explanation */}
              <div className="bg-white/10 rounded-xl p-4 border border-white/20">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🎵</span>
                    <div>
                      <p className="text-white font-semibold">Request Songs & Vote</p>
                      <p className="text-white/70 text-sm">
                        We verify you&apos;re at the light show so only on-site visitors can participate
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🔒</span>
                    <div>
                      <p className="text-white font-semibold">Your Privacy is Protected</p>
                      <p className="text-white/70 text-sm">
                        We only check your distance – your exact location is never stored or shared
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* What happens next */}
              <div className="bg-blue-500/20 border border-blue-400/40 rounded-xl p-4">
                <p className="text-blue-100 text-sm font-medium mb-2">📱 What happens when you tap &quot;Allow&quot;:</p>
                <ol className="text-blue-100/90 text-sm space-y-1 list-decimal list-inside pl-2">
                  <li>Your browser will show a permission popup</li>
                  <li>Tap <strong>&quot;Allow&quot;</strong> in that popup</li>
                  <li>That&apos;s it! You&apos;re ready to request songs</li>
                </ol>
              </div>

              {/* Remember device checkbox */}
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-white/40 bg-white/10 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                />
                <div>
                  <p className="text-white font-medium text-sm">Remember this device</p>
                  <p className="text-white/60 text-xs">Don&apos;t ask again on future visits</p>
                </div>
              </label>
            </>
          )}

          {/* STAGE: Requesting location (loading state) */}
          {stage === 'requesting' && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4 animate-bounce">📍</div>
              <p className="text-white text-lg font-medium mb-2">Waiting for permission...</p>
              <p className="text-white/70 text-sm">
                {deviceType === 'ios' 
                  ? 'Tap "Allow" when Safari asks for your location'
                  : deviceType === 'android'
                  ? 'Tap "Allow" when Chrome asks for your location'
                  : 'Click "Allow" when your browser asks for location access'}
              </p>
              
              {/* Visual browser prompt hint */}
              <div className="mt-6 bg-black/30 rounded-lg p-4 mx-auto max-w-xs">
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <p className="text-white text-xs mb-2">
                    {deviceType === 'desktop' ? '🌐 Browser Prompt:' : '📱 Device Prompt:'}
                  </p>
                  <p className="text-white/90 text-sm mb-3">
                    &quot;This site wants to know your location&quot;
                  </p>
                  <div className="flex gap-2">
                    <span className="bg-gray-600 text-white/60 px-3 py-1 rounded text-xs">Block</span>
                    <span className="bg-blue-600 text-white px-3 py-1 rounded text-xs animate-pulse">Allow ← Tap this!</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STAGE: Error occurred */}
          {stage === 'error' && (
            <>
              <div className="bg-red-500/20 border-2 border-red-500/50 rounded-xl p-4">
                <p className="text-red-100 text-sm mb-3">{errorMessage}</p>
              </div>

              {/* Device-specific recovery instructions */}
              <div className="bg-white/10 rounded-xl p-4 border border-white/20">
                <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                  {instructions.title}
                </h3>
                <ol className="text-white/90 text-sm space-y-2 list-decimal list-inside">
                  {instructions.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {instructions.extra && (
                  <p className="text-white/60 text-xs mt-3 italic">{instructions.extra}</p>
                )}
              </div>

              {/* iOS-specific Settings shortcut hint */}
              {deviceType === 'ios' && (
                <div className="bg-yellow-500/20 border border-yellow-400/40 rounded-xl p-4">
                  <p className="text-yellow-100 text-sm">
                    <strong>🍎 iOS Tip:</strong> If you see &quot;Location access is blocked,&quot; you&apos;ll need to enable it in your iPhone&apos;s Settings app under Privacy & Security → Location Services → Safari.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="bg-white/10 p-5 border-t border-white/20 flex flex-col sm:flex-row gap-3">
          {stage === 'explain' && (
            <>
              <button
                onClick={handleAllow}
                className={`
                  flex-1 py-4 px-6 rounded-xl font-bold text-white text-lg
                  transition-all transform hover:scale-[1.02] active:scale-[0.98]
                  ${theme.id === 'christmas'
                    ? 'bg-linear-to-r from-green-600 to-red-600 hover:from-green-500 hover:to-red-500'
                    : theme.id === 'halloween'
                    ? 'bg-linear-to-r from-orange-600 to-purple-600 hover:from-orange-500 hover:to-purple-500'
                    : 'bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500'
                  }
                  shadow-lg hover:shadow-xl
                `}
              >
                <span className="flex items-center justify-center gap-2">
                  ✓ Allow Location
                </span>
              </button>
              
              <button
                onClick={handleSkip}
                className="sm:w-auto py-3 px-5 rounded-xl font-medium text-white/80 bg-white/5 hover:bg-white/15 border border-white/20 transition-all text-sm"
              >
                Maybe Later
              </button>
            </>
          )}

          {stage === 'requesting' && (
            <button
              onClick={handleSkip}
              className="flex-1 py-3 px-6 rounded-xl font-medium text-white/80 bg-white/10 hover:bg-white/20 border border-white/20 transition-all"
            >
              Cancel
            </button>
          )}

          {stage === 'error' && (
            <>
              <button
                onClick={handleTryAgain}
                className={`
                  flex-1 py-4 px-6 rounded-xl font-bold text-white text-lg
                  transition-all transform hover:scale-[1.02] active:scale-[0.98]
                  ${theme.id === 'christmas'
                    ? 'bg-linear-to-r from-green-600 to-red-600'
                    : theme.id === 'halloween'
                    ? 'bg-linear-to-r from-orange-600 to-purple-600'
                    : 'bg-linear-to-r from-blue-600 to-purple-600'
                  }
                  shadow-lg
                `}
              >
                🔄 Try Again
              </button>
              
              <button
                onClick={handleDeny}
                className="sm:w-auto py-3 px-5 rounded-xl font-medium text-white/80 bg-white/5 hover:bg-white/15 border border-white/20 transition-all text-sm"
              >
                Skip for Now
              </button>
            </>
          )}
        </div>

        {/* Consequences notice - only show on explain stage */}
        {stage === 'explain' && (
          <div className="bg-yellow-500/15 border-t border-yellow-500/30 px-5 py-3">
            <p className="text-yellow-100/80 text-xs text-center">
              Without location access, you can still browse the queue and watch videos, but won&apos;t be able to request songs or vote.
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
