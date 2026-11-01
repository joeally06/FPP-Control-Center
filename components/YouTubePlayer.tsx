'use client';

import { useEffect, useRef, useState } from 'react';

// The parts of the YouTube IFrame Player API this component uses
// (https://developers.google.com/youtube/iframe_api_reference); the API script adds window.YT at runtime
interface YouTubePlayerApi {
  destroy(): void;
  loadVideoById(videoId: string): void;
  pauseVideo(): void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayerApi;
  data: number;
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number | string | undefined>;
      events: {
        onReady: (event: YouTubePlayerEvent) => void;
        onStateChange: (event: YouTubePlayerEvent) => void;
        onError: (event: YouTubePlayerEvent) => void;
      };
    }
  ) => YouTubePlayerApi;
}

interface YouTubePlayerProps {
  videoId: string;
  onStateChange?: (state: number) => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
  width?: string;
  height?: string;
  className?: string;
  fallbackToIframe?: boolean; // New prop to enable iframe fallback
}

/**
 * YouTube Player Component
 * Embeds YouTube videos with programmatic control
 * Uses YouTube Player API for enhanced functionality
 */
export function YouTubePlayer({
  videoId,
  onStateChange,
  onReady,
  onError,
  width = '100%',
  height = '100%',
  className = '',
  fallbackToIframe = true
}: YouTubePlayerProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayerApi | null>(null);
  const [isAPIReady, setIsAPIReady] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const apiLoadTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load YouTube API
  useEffect(() => {
    // Check if API is already loaded
    if (window.YT && window.YT.Player) {
      // Start after this render, not during the effect body (React flags state updates made synchronously in an effect)
      const id = setTimeout(() => setIsAPIReady(true), 0);
      return () => clearTimeout(id);
    }

    // Check if script is already loading
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      // Script is loading, wait for it
      const checkAPI = () => {
        if (window.YT && window.YT.Player) {
          setIsAPIReady(true);
          if (apiLoadTimeout.current) {
            clearTimeout(apiLoadTimeout.current);
            apiLoadTimeout.current = null;
          }
        } else {
          setTimeout(checkAPI, 100);
        }
      };
      checkAPI();
      return;
    }

    // Set timeout for API loading
    const timeout = setTimeout(() => {
      console.error('[YouTube Player] YouTube API failed to load within 10 seconds');
      setLoadError('YouTube API failed to load. Please check your internet connection and try refreshing the page.');
    }, 10000);
    apiLoadTimeout.current = timeout;

    // Load YouTube API script
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onload = () => {
      // Wait for the API to be ready
      const checkAPI = () => {
        if (window.YT && window.YT.Player) {
          setIsAPIReady(true);
          if (timeout) clearTimeout(timeout);
          apiLoadTimeout.current = null;
        } else {
          setTimeout(checkAPI, 100);
        }
      };
      checkAPI();
    };
    script.onerror = () => {
      console.error('[YouTube Player] Failed to load YouTube API script');
      setLoadError('Failed to load YouTube API script. Please check your internet connection.');
      if (timeout) clearTimeout(timeout);
      apiLoadTimeout.current = null;
      onError?.('Failed to load YouTube API');
    };
    document.head.appendChild(script);

    // Set up global callback as backup
    window.onYouTubeIframeAPIReady = () => {
      setIsAPIReady(true);
      if (timeout) clearTimeout(timeout);
      apiLoadTimeout.current = null;
    };

    // Cleanup
    return () => {
      if (timeout) clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady) {
        delete window.onYouTubeIframeAPIReady;
      }
    };
  }, [onError]);

  // Initialize player when API is ready
  useEffect(() => {
    if (!isAPIReady || !playerRef.current || !videoId) return;

    // Destroy existing player if it exists
    if (player.current && typeof player.current.destroy === 'function') {
      try {
        player.current.destroy();
      } catch (error) {
        console.warn('[YouTube Player] Error destroying existing player:', error);
      }
      player.current = null;
      setIsPlayerReady(false);
    }

    try {
      const YT = window.YT;
      if (!YT) throw new Error('YouTube API is not loaded');
      player.current = new YT.Player(playerRef.current, {
        videoId,
        width,
        height,
        playerVars: {
          autoplay: 0, // Don't autoplay
          controls: 1, // Show controls
          rel: 0, // Don't show related videos
          modestbranding: 1, // Minimal YouTube branding
          fs: 1, // Allow fullscreen
          iv_load_policy: 3, // Hide annotations
          cc_load_policy: 0, // Hide closed captions
          origin: typeof window !== 'undefined' ? window.location.origin : undefined, // Specify origin to reduce CORS warnings
        },
        events: {
          onReady: (event: YouTubePlayerEvent) => {
            console.log('[YouTube Player] Player ready for video:', videoId);
            setIsPlayerReady(true);
            
            // Explicitly pause the video to prevent autoplay
            try {
              event.target.pauseVideo();
              console.log('[YouTube Player] Video paused on ready to prevent autoplay');
            } catch (error) {
              console.warn('[YouTube Player] Could not pause video:', error);
            }
            
            onReady?.();
          },
          onStateChange: (event: YouTubePlayerEvent) => {
            console.log('[YouTube Player] State changed:', event.data);
            onStateChange?.(event.data);
          },
          onError: (event: YouTubePlayerEvent) => {
            console.error('[YouTube Player] Player error:', event.data);
            onError?.(event.data);
          }
        }
      });
    } catch (error) {
      console.error('[YouTube Player] Failed to initialize:', error);
      onError?.(error);
    }

    // Cleanup function
    return () => {
      if (player.current && typeof player.current.destroy === 'function') {
        try {
          player.current.destroy();
        } catch (error) {
          console.warn('[YouTube Player] Error destroying player:', error);
        }
      }
      player.current = null;
      setIsPlayerReady(false);
      if (apiLoadTimeout.current) {
        clearTimeout(apiLoadTimeout.current);
        apiLoadTimeout.current = null;
      }
    };
  }, [isAPIReady, videoId, width, height, onReady, onStateChange, onError]);

  // Update video when videoId changes
  useEffect(() => {
    if (isPlayerReady && player.current && videoId) {
      try {
        console.log('[YouTube Player] Loading video:', videoId);
        player.current.loadVideoById(videoId);
      } catch (error) {
        console.error('[YouTube Player] Error loading video:', error);
        onError?.(error);
      }
    }
  }, [videoId, isPlayerReady, onError]);

  return (
    <div className={`youtube-player w-full h-full ${className}`} style={{ width, height }}>
      {loadError && fallbackToIframe && videoId ? (
        <div className="relative w-full h-full">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0`}
            className="w-full h-full rounded-lg"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={`YouTube video ${videoId}`}
          />
          <div className="absolute top-2 right-2 bg-yellow-500/90 text-black px-2 py-1 rounded text-xs font-medium">
            Fallback Player
          </div>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 w-full h-full">
          <div className="text-center p-4">
            <div className="text-red-600 dark:text-red-400 mb-2">
              <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">YouTube Player Error</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      ) : (
        <>
          <div ref={playerRef} className="w-full h-full" />
          {!isAPIReady && (
            <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg w-full h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading YouTube Player...</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">This may take a few seconds</p>
              </div>
            </div>
          )}
          {isAPIReady && !isPlayerReady && videoId && (
            <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg w-full h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Initializing video player...</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Loading video: {videoId}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// YouTube Player API types (for TypeScript)
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Player state constants
export const YouTubePlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;