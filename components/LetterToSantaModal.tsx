'use client';

import { useState, useEffect, FormEvent } from 'react';

interface LetterToSantaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LetterToSantaModal({ isOpen, onClose }: LetterToSantaModalProps) {
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [letterContent, setLetterContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });
  const [letterCount, setLetterCount] = useState<number>(0);
  const [emailCount, setEmailCount] = useState<number>(0);
  const [ipCount, setIpCount] = useState<number>(0);
  const [dailyLimit, setDailyLimit] = useState<number>(1);
  const [loadingLimit, setLoadingLimit] = useState(true);

  // Fetch daily limit when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchDailyLimit();
    }
  }, [isOpen]);

  // Check letter count when email changes
  useEffect(() => {
    if (isOpen && parentEmail && parentEmail.includes('@')) {
      checkLetterCount();
    }
  }, [isOpen, parentEmail]);

  const fetchDailyLimit = async () => {
    try {
      // Use public endpoint instead of admin-only settings
      const response = await fetch('/api/santa/settings');
      if (response.ok) {
        const data = await response.json();
        setDailyLimit(data.limit || 1);
        console.log('[Santa Modal] Daily limit fetched:', data.limit);
      } else {
        console.warn('[Santa Modal] Failed to fetch limit, using default');
        setDailyLimit(1);
      }
    } catch (error) {
      console.error('[Santa Modal] Failed to fetch daily limit:', error);
      setDailyLimit(1);
    } finally {
      setLoadingLimit(false);
    }
  };

  const checkLetterCount = async () => {
    if (!parentEmail || !parentEmail.includes('@')) return;

    try {
      const response = await fetch('/api/santa/check-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parentEmail }),
      });

      if (response.ok) {
        const data = await response.json();
        setEmailCount(data.emailCount || 0);
        setIpCount(data.ipCount || 0);
        setLetterCount(data.count || 0); // Use the max of email/IP counts
        
        // Use limit from check-limit response if available
        if (typeof data.limit === 'number') {
          setDailyLimit(data.limit);
        }
      }
    } catch (error) {
      console.error('Failed to check letter count:', error);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    // Check if limit reached
    if (letterCount >= dailyLimit) {
      setSubmitStatus({
        type: 'error',
        message: `You've already sent ${dailyLimit} letter${dailyLimit > 1 ? 's' : ''} today. Please try again tomorrow! 🎄`,
      });
      return;
    }
    
    setIsSubmitting(true);
    setSubmitStatus({ type: null, message: '' });

    try {
      const response = await fetch('/api/santa/send-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          childName,
          childAge: childAge ? parseInt(childAge) : undefined,
          parentEmail,
          letterContent,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Increment letter count immediately
        const newCount = letterCount + 1;
        setLetterCount(newCount);
        
        setSubmitStatus({
          type: 'success',
          message: data.message || "Santa has received your letter! 🎅✨",
        });
        
        // Reset form
        setChildName('');
        setChildAge('');
        setLetterContent('');
        
        // Keep email to show updated count for this email
        // Don't reset: setParentEmail('');
        
        // Verify count from server (optional, for accuracy)
        await checkLetterCount();
        
        // Auto-close after 10 seconds (long enough to read the "check your email" note)
        setTimeout(() => {
          onClose();
          setSubmitStatus({ type: null, message: '' });
        }, 10000);
      } else {
        // Handle rate limit errors with dual limit info
        if (response.status === 429 && (data.reason === 'email_limit' || data.reason === 'ip_limit')) {
          const limitType = data.reason === 'email_limit' ? 'email address' : 'location';
          setSubmitStatus({
            type: 'error',
            message: `${data.error}\n\nWe limit letters by both email address and location to ensure everyone gets a fair chance! 🎄`,
          });
        } else {
          setSubmitStatus({
            type: 'error',
            message: data.error || 'Failed to send letter. Please try again.',
          });
        }
      }
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message: 'Failed to send letter. Please check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-linear-to-br from-red-50 via-white to-green-50 rounded-2xl shadow-2xl border-4 border-red-600">
        {/* Snowflakes decoration */}
        <div className="absolute top-4 left-4 text-4xl animate-pulse">❄️</div>
        <div className="absolute top-4 right-4 text-4xl animate-pulse" style={{ animationDelay: '0.5s' }}>❄️</div>
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-600 hover:text-gray-900 text-3xl font-bold z-10"
          aria-label="Close"
        >
          ×
        </button>

        {/* Header */}
        <div className="bg-linear-to-r from-red-600 to-green-600 text-white p-8 text-center border-b-4 border-yellow-400">
          <h2 className="text-4xl font-bold mb-2" style={{ fontFamily: 'cursive' }}>
            🎅 Write to Santa! 🎄
          </h2>
          <p className="text-lg">Send your Christmas wishes to the North Pole!</p>
          
          {/* Letter Count Display */}
          {!loadingLimit && parentEmail && parentEmail.includes('@') && (
            <div className="mt-4 inline-block bg-white/20 backdrop-blur-sm px-6 py-2 rounded-full">
              <span className="text-sm font-semibold">
                Letters today: {' '}
                <span className={letterCount >= dailyLimit ? 'text-yellow-300' : 'text-green-200'}>
                  {letterCount}/{dailyLimit}
                </span>
                {letterCount < dailyLimit && (
                  <span className="ml-2 text-green-200">
                    ({dailyLimit - letterCount} remaining)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Success/Error Message */}
          {submitStatus.type && (
            <div
              className={`p-4 rounded-lg border-2 ${
                submitStatus.type === 'success'
                  ? 'bg-green-100 border-green-500 text-green-800'
                  : 'bg-red-100 border-red-500 text-red-800'
              }`}
            >
              <p className="font-semibold text-center">{submitStatus.message}</p>
            </div>
          )}

          {/* Child Name */}
          <div>
            <label htmlFor="childName" className="block text-lg font-semibold text-gray-800 mb-2">
              Child's Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              id="childName"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
              maxLength={100}
              className="w-full px-4 py-3 border-2 border-red-300 rounded-lg focus:outline-none focus:border-red-500 bg-white text-gray-900"
              placeholder="Enter child's name"
              disabled={isSubmitting}
            />
          </div>

          {/* Child Age */}
          <div>
            <label htmlFor="childAge" className="block text-lg font-semibold text-gray-800 mb-2">
              Child's Age (optional)
            </label>
            <input
              type="number"
              id="childAge"
              value={childAge}
              onChange={(e) => setChildAge(e.target.value)}
              min="1"
              max="18"
              className="w-full px-4 py-3 border-2 border-red-300 rounded-lg focus:outline-none focus:border-red-500 bg-white text-gray-900"
              placeholder="Enter child's age"
              disabled={isSubmitting}
            />
          </div>

          {/* Parent Email */}
          <div>
            <label htmlFor="parentEmail" className="block text-lg font-semibold text-gray-800 mb-2">
              Parent's Email <span className="text-red-600">*</span>
            </label>
            <input
              type="email"
              id="parentEmail"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border-2 border-red-300 rounded-lg focus:outline-none focus:border-red-500 bg-white text-gray-900"
              placeholder="Santa will send a reply here!"
              disabled={isSubmitting}
            />
            <p className="text-sm text-gray-600 mt-1">
              We&apos;ll email you a link to confirm first, then Santa&apos;s magical reply comes here! 📧✨
            </p>
          </div>

          {/* Letter Content */}
          <div>
            <label htmlFor="letterContent" className="block text-lg font-semibold text-gray-800 mb-2">
              Your Letter to Santa <span className="text-red-600">*</span>
            </label>
            <textarea
              id="letterContent"
              value={letterContent}
              onChange={(e) => setLetterContent(e.target.value)}
              required
              maxLength={2000}
              rows={8}
              className="w-full px-4 py-3 border-2 border-red-300 rounded-lg focus:outline-none focus:border-red-500 bg-white text-gray-900 resize-none"
              placeholder="Dear Santa,&#10;&#10;This year I have been very good! I would like to tell you about..."
              disabled={isSubmitting}
            />
            <p className="text-sm text-gray-600 mt-1">
              {letterContent.length} / 2000 characters
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-center pt-4">
            <button
              type="submit"
              disabled={isSubmitting || letterCount >= dailyLimit}
              className="px-8 py-4 bg-linear-to-r from-red-600 to-green-600 text-white text-xl font-bold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending to the North Pole...
                </span>
              ) : letterCount >= dailyLimit ? (
                '🎄 Daily Limit Reached 🎄'
              ) : (
                '🎁 Send to Santa! 🎁'
              )}
            </button>
          </div>

          {/* Footer note */}
          <div className="text-center text-sm text-gray-600 pt-4 border-t-2 border-red-200">
            <p className="mb-1">
              {submitStatus.type === 'success' ? (
                letterCount < dailyLimit ? (
                  <span className="text-green-600 font-semibold">
                    🎄 Thank you! You can send {dailyLimit - letterCount} more letter{(dailyLimit - letterCount) > 1 ? 's' : ''} today. 🎄
                  </span>
                ) : (
                  <span className="text-orange-600 font-semibold">
                    🎄 You've sent {dailyLimit} letter{dailyLimit > 1 ? 's' : ''} today. Come back tomorrow for more! 🎄
                  </span>
                )
              ) : letterCount >= dailyLimit ? (
                <span className="text-orange-600 font-semibold">
                  🎄 You've sent {dailyLimit} letter{dailyLimit > 1 ? 's' : ''} today. Come back tomorrow for more! 🎄
                </span>
              ) : (
                <span>
                  🎄 Santa reads every letter carefully! You can send{' '}
                  {dailyLimit > 1 ? `up to ${dailyLimit} letters` : 'one letter'} per day. 🎄
                </span>
              )}
            </p>
            <p className="text-xs">
              ✉️ Click the link in the confirmation email and your letter goes to Santa's workshop. He'll send a personalized reply soon after!
            </p>
            <p className="text-xs text-gray-500 mt-2">
              🔒 We track letters by both email address and location to ensure fair access for all children.
            </p>
          </div>
        </form>

        {/* Decorative footer */}
        <div className="bg-linear-to-r from-red-600 to-green-600 p-4 text-center text-white text-sm">
          ✨ Magical delivery powered by Santa's elves at the North Pole! ✨
        </div>
      </div>
    </div>
  );
}
