'use client';

import { useState, useEffect } from 'react';
import { getUtcNow } from '@/lib/time-utils';
import Link from 'next/link';

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      // Show banner after a short delay for better UX
      setTimeout(() => setShowBanner(true), 1000);
    } else {
      // Apply saved preferences
      applyConsent(JSON.parse(consent));
    }
  }, []);

  const applyConsent = (consent: any) => {
    if (consent.analytics === false) {
      // Disable analytics tracking
      if (typeof window !== 'undefined') {
        (window as any).disableAnalytics = true;
      }
    }
  };

  const handleAcceptAll = () => {
    const consent = {
      necessary: true,
      analytics: true,
      functional: true,
      timestamp: getUtcNow()
    };
    localStorage.setItem('cookie-consent', JSON.stringify(consent));
    applyConsent(consent);
    setShowBanner(false);
  };

  const handleDeclineOptional = () => {
    const consent = {
      necessary: true,
      analytics: false,
      functional: false,
      timestamp: getUtcNow()
    };
    localStorage.setItem('cookie-consent', JSON.stringify(consent));
    applyConsent(consent);
    setShowBanner(false);
  };

  const handleCustomize = () => {
    setShowDetails(!showDetails);
  };

  const handleSavePreferences = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const consent = {
      necessary: true, // Always required
      analytics: formData.get('analytics') === 'on',
      functional: formData.get('functional') === 'on',
      timestamp: getUtcNow()
    };
    localStorage.setItem('cookie-consent', JSON.stringify(consent));
    applyConsent(consent);
    setShowBanner(false);
    setShowDetails(false);
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-9998" />

      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-9999 p-4 md:p-6">
        <div className="max-w-6xl mx-auto bg-linear-to-br from-purple-900/95 via-blue-900/95 to-indigo-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border-2 border-white/20 overflow-hidden">
          
          {!showDetails ? (
            // Simple Banner
            <div className="p-6 md:p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="text-4xl">🍪</div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    We Value Your Privacy
                  </h2>
                  <p className="text-white/90 text-sm md:text-base leading-relaxed">
                    We use cookies and similar technologies to enhance your experience, analyze site traffic, 
                    and remember your preferences. By clicking &quot;Accept All&quot;, you consent to our use of cookies.
                  </p>
                  <p className="text-white/70 text-sm mt-2">
                    Read our{' '}
                    <Link href="/privacy" className="text-blue-300 hover:text-blue-200 underline">
                      Privacy Policy
                    </Link>
                    {' '}to learn more about how we handle your data.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleAcceptAll}
                  className="flex-1 px-6 py-3 bg-linear-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all font-semibold shadow-lg"
                >
                  ✓ Accept All Cookies
                </button>
                <button
                  onClick={handleDeclineOptional}
                  className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all font-semibold border border-white/30"
                >
                  Essential Only
                </button>
                <button
                  onClick={handleCustomize}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all font-semibold border border-white/30"
                >
                  ⚙️ Customize
                </button>
              </div>
            </div>
          ) : (
            // Detailed Preferences
            <form onSubmit={handleSavePreferences} className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  🍪 Cookie Preferences
                </h2>
                <button
                  type="button"
                  onClick={handleCustomize}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto pr-2">
                {/* Necessary Cookies */}
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">✅</span>
                      <h3 className="text-lg font-semibold text-white">Necessary Cookies</h3>
                    </div>
                    <span className="text-sm text-green-300 font-medium">Always Active</span>
                  </div>
                  <p className="text-white/70 text-sm">
                    Essential for the website to function properly. These cookies enable basic features like 
                    page navigation, security, and access to secure areas. The website cannot function properly 
                    without these cookies.
                  </p>
                  <p className="text-white/50 text-xs mt-2">
                    Examples: Authentication tokens, session management, security features
                  </p>
                </div>

                {/* Analytics Cookies */}
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📊</span>
                      <h3 className="text-lg font-semibold text-white">Analytics Cookies</h3>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="analytics"
                        defaultChecked
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                  </div>
                  <p className="text-white/70 text-sm">
                    Help us understand how visitors interact with our website by collecting and reporting 
                    information anonymously. This helps us improve the user experience.
                  </p>
                  <p className="text-white/50 text-xs mt-2">
                    Examples: Page views, visitor counts, popular content, user flow analysis
                  </p>
                </div>

                {/* Functional Cookies */}
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚙️</span>
                      <h3 className="text-lg font-semibold text-white">Functional Cookies</h3>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="functional"
                        defaultChecked
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                  </div>
                  <p className="text-white/70 text-sm">
                    Enable enhanced functionality and personalization, such as remembering your theme preferences, 
                    jukebox favorites, and settings.
                  </p>
                  <p className="text-white/50 text-xs mt-2">
                    Examples: Theme settings, language preferences, remembered choices
                  </p>
                </div>

                {/* Data Collection Info */}
                <div className="bg-blue-500/20 rounded-lg p-4 border border-blue-500/30">
                  <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                    ℹ️ What We Collect
                  </h4>
                  <ul className="text-white/80 text-sm space-y-1">
                    <li>• IP addresses (for analytics and security)</li>
                    <li>• Browser and device information</li>
                    <li>• Pages visited and time spent</li>
                    <li>• Jukebox song requests (anonymous)</li>
                    <li>• Admin login credentials (Google OAuth - encrypted)</li>
                  </ul>
                  <p className="text-white/70 text-xs mt-3">
                    We DO NOT sell your data. We DO NOT share it with third parties except as required for 
                    service operation (Google OAuth for admin login).
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-linear-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all font-semibold shadow-lg"
                >
                  💾 Save Preferences
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all font-semibold border border-white/30"
                >
                  Accept All
                </button>
              </div>

              <p className="text-center text-white/50 text-xs mt-4">
                You can change your preferences at any time in the{' '}
                <Link href="/privacy#cookie-settings" className="text-blue-300 hover:text-blue-200 underline">
                  Privacy Settings
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
