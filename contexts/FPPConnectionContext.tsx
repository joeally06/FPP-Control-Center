'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TIMING } from '@/lib/constants';

interface FPPConnectionState {
  isOnline: boolean;
  isChecking: boolean;
  lastCheck: number | null;
  error: string | null;
  retryCount: number;
  nextRetryIn: number;
}

interface FPPConnectionContextType extends FPPConnectionState {
  checkConnection: () => Promise<void>;
  resetRetry: () => void;
}

const FPPConnectionContext = createContext<FPPConnectionContextType | null>(null);

// Exponential backoff from centralized constants
const RETRY_DELAYS = TIMING.RETRY_DELAYS;

export function FPPConnectionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FPPConnectionState>({
    isOnline: true,
    isChecking: false,
    lastCheck: null,
    error: null,
    retryCount: 0,
    nextRetryIn: 0
  });

  const [retryTimer, setRetryTimer] = useState<NodeJS.Timeout | null>(null);
  const [countdownTimer, setCountdownTimer] = useState<NodeJS.Timeout | null>(null);

  const checkConnection = useCallback(async () => {
    setState(prev => ({ ...prev, isChecking: true }));

    try {
      const response = await fetch('/api/fpp/health', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });

      const data = await response.json();

      if (data.online) {
        // Connection restored
        setState({
          isOnline: true,
          isChecking: false,
          lastCheck: Date.now(),
          error: null,
          retryCount: 0,
          nextRetryIn: 0
        });

        // Clear timers
        if (retryTimer) {
          clearTimeout(retryTimer);
          setRetryTimer(null);
        }
        if (countdownTimer) {
          clearInterval(countdownTimer);
          setCountdownTimer(null);
        }
      } else {
        throw new Error(data.error || 'FPP is offline');
      }
    } catch (error) {
      const newRetryCount = state.retryCount + 1;
      const delay = RETRY_DELAYS[Math.min(newRetryCount - 1, RETRY_DELAYS.length - 1)];

      setState(prev => ({
        ...prev,
        isOnline: false,
        isChecking: false,
        lastCheck: Date.now(),
        error: error instanceof Error ? error.message : null,
        retryCount: newRetryCount,
        nextRetryIn: Math.floor(delay / 1000) // Convert to seconds
      }));

      // Clear existing timers
      if (retryTimer) clearTimeout(retryTimer);
      if (countdownTimer) clearInterval(countdownTimer);

      // Schedule next retry
      const timer = setTimeout(() => {
        checkConnection();
      }, delay);
      setRetryTimer(timer);

      // Countdown timer to update UI every second
      const countdown = setInterval(() => {
        setState(prev => ({
          ...prev,
          nextRetryIn: Math.max(0, prev.nextRetryIn - 1)
        }));
      }, 1000);
      setCountdownTimer(countdown);
    }
  }, [state.retryCount, retryTimer, countdownTimer]);

  const resetRetry = useCallback(() => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      setRetryTimer(null);
    }
    if (countdownTimer) {
      clearInterval(countdownTimer);
      setCountdownTimer(null);
    }
    setState(prev => ({
      ...prev,
      retryCount: 0,
      nextRetryIn: 0
    }));
    checkConnection();
  }, [retryTimer, countdownTimer, checkConnection]);

  // Initial health check
  useEffect(() => {
    checkConnection();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (countdownTimer) clearInterval(countdownTimer);
    };
  }, [retryTimer, countdownTimer]);

  return (
    <FPPConnectionContext.Provider value={{ ...state, checkConnection, resetRetry }}>
      {children}
    </FPPConnectionContext.Provider>
  );
}

export function useFPPConnection() {
  const context = useContext(FPPConnectionContext);
  if (!context) {
    throw new Error('useFPPConnection must be used within FPPConnectionProvider');
  }
  return context;
}
