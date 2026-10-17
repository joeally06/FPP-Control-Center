'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ 
  message, 
  type = 'success', 
  isVisible, 
  onClose, 
  duration = 3000 
}: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };

  const colors = {
    success: 'from-green-500/90 to-emerald-500/90 border-green-400/50',
    error: 'from-red-500/90 to-rose-500/90 border-red-400/50',
    info: 'from-blue-500/90 to-indigo-500/90 border-blue-400/50'
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          transition={{ type: 'spring', duration: 0.5 }}
          // Below the jukebox's fixed radio bar (z-50, ~4 rem tall) and above everything else;
          // full width on phones, top-right from sm up
          className="fixed inset-x-4 z-[70] sm:left-auto sm:right-4"
          style={{ top: 'calc(4.75rem + env(safe-area-inset-top))' }}
          role={type === 'error' ? 'alert' : 'status'}
        >
          <div className={`backdrop-blur-md bg-linear-to-r ${colors[type]} border rounded-xl shadow-2xl px-6 py-4 sm:min-w-[300px] sm:max-w-md`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">{icons[type]}</span>
              <p className="text-white font-semibold flex-1">{message}</p>
              <button
                onClick={onClose}
                aria-label="Dismiss"
                className="text-white/80 hover:text-white transition-colors ml-2"
              >
                ✕
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
