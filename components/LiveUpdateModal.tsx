'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, X, CheckCircle, AlertCircle } from 'lucide-react';

interface LiveUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Terminal statuses that indicate update completion
const TERMINAL_STATUSES = ['COMPLETED', 'SUCCESS', 'UP_TO_DATE', 'FAILED'];

/**
 * LiveUpdateModal - Displays live update progress with terminal output
 * Uses Server-Sent Events (SSE) to stream real-time log output
 */
export default function LiveUpdateModal({ isOpen, onClose }: LiveUpdateModalProps) {
  const [output, setOutput] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [autoCloseCountdown, setAutoCloseCountdown] = useState<number | null>(null);
  
  const outputEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start auto-reload countdown
  const startAutoReloadCountdown = () => {
    let countdown = 5;
    setAutoCloseCountdown(countdown);

    countdownIntervalRef.current = setInterval(() => {
      countdown--;
      setAutoCloseCountdown(countdown);

      if (countdown <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
        window.location.reload();
      }
    }, 1000);
  };

  // Connect to SSE stream for live updates
  const connectToStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('[LiveUpdateModal] Connecting to update stream...');
    const eventSource = new EventSource('/api/admin/update-stream');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[LiveUpdateModal] Stream connected');
    };

    eventSource.addEventListener('log', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.isInitial) {
          setOutput(data.lines || []);
        } else {
          setOutput(prev => [...prev, ...(data.lines || [])]);
        }
      } catch (error) {
        console.error('[LiveUpdateModal] Failed to parse log event:', error);
      }
    });

    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        const status = data.status?.toUpperCase() || 'IDLE';
        
        // Add status update to output
        if (TERMINAL_STATUSES.includes(status)) {
          const isSuccess = status === 'COMPLETED' || status === 'SUCCESS' || status === 'UP_TO_DATE';
          setIsComplete(true);
          setHasError(!isSuccess);
          
          if (isSuccess) {
            setOutput(prev => [...prev, '', '✅ Update completed successfully!']);
            startAutoReloadCountdown();
          } else {
            setOutput(prev => [...prev, '', '❌ Update failed. Check logs for details.']);
          }
        }
      } catch (error) {
        console.error('[LiveUpdateModal] Failed to parse status event:', error);
      }
    });

    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[LiveUpdateModal] Update complete:', data);
        
        setIsComplete(true);
        setHasError(!data.success);
        
        if (data.success) {
          setOutput(prev => [...prev, '', '✅ Update completed successfully!']);
          startAutoReloadCountdown();
        } else {
          setOutput(prev => [...prev, '', '❌ Update failed. Check logs for details.']);
        }
        
        // Close stream
        eventSource.close();
        eventSourceRef.current = null;
      } catch (error) {
        console.error('[LiveUpdateModal] Failed to parse complete event:', error);
      }
    });

    eventSource.addEventListener('error', () => {
      console.log('[LiveUpdateModal] Stream error or closed');
    });

    eventSource.onerror = () => {
      // Connection may close during PM2 restart - that's expected
      console.log('[LiveUpdateModal] Stream error - may be restarting');
    };
  }, []);

  // Effect: Connect to stream when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Reset state
    setOutput(['🔄 Connecting to update stream...', '']);
    setIsComplete(false);
    setHasError(false);
    setAutoCloseCountdown(null);

    // Connect to SSE stream
    connectToStream();

    return () => {
      if (eventSourceRef.current) {
        console.log('[LiveUpdateModal] Closing stream');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isOpen, connectToStream]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-linear-to-br from-gray-900 via-purple-900 to-gray-900 rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-3">
            <Terminal className="w-6 h-6 text-green-400" />
            <h2 className="text-2xl font-bold text-white">
              {isComplete 
                ? (hasError ? '❌ Update Failed' : '✅ Update Complete') 
                : '🔄 Installing Update...'}
            </h2>
          </div>
          
          {isComplete && !autoCloseCountdown && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          )}
        </div>

        {/* Terminal Output */}
        <div className="h-[500px] overflow-y-auto bg-black/50 p-6 font-mono text-sm">
          <div className="space-y-1">
            {output.map((line, index) => (
              <div
                key={index}
                className={`whitespace-pre-wrap wrap-break-word ${
                  line.includes('✅') || line.includes('SUCCESS') ? 'text-green-400' :
                  line.includes('❌') || line.includes('ERROR') || line.includes('FAILED') ? 'text-red-400' :
                  line.includes('⚠️') || line.includes('WARNING') ? 'text-yellow-400' :
                  line.includes('🚀') || line.includes('🔄') ? 'text-blue-400' :
                  'text-green-400'
                }`}
                style={{
                  textShadow: '0 0 5px rgba(34, 197, 94, 0.5)',
                }}
              >
                {line || '\u00A0'}
              </div>
            ))}
            {!isComplete && (
              <div className="flex items-center gap-2 text-green-400 animate-pulse">
                <span>▊</span>
                <span className="text-white/50">Processing...</span>
              </div>
            )}
          </div>
          <div ref={outputEndRef} />
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-black/30">
          {autoCloseCountdown !== null && (
            <div className="flex items-center justify-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-white">
                Page will reload in <span className="font-bold text-green-400 text-xl">{autoCloseCountdown}</span> seconds...
              </p>
            </div>
          )}
          
          {hasError && !autoCloseCountdown && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <p className="text-white">
                  Update failed. Check the output above for details.
                </p>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-red-500/80 hover:bg-red-600 text-white rounded-lg transition-colors font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          
          {!isComplete && (
            <div className="flex items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-green-400 border-t-transparent"></div>
              <p className="text-white/70">
                Update in progress... <span className="font-semibold text-yellow-400">Do not close this window.</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
