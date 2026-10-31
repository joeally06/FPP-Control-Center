'use client';

import { useState, useEffect, FormEvent } from 'react';
import { X } from 'lucide-react';

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
    } catch {
      setSubmitStatus({
        type: 'error',
        message: 'Failed to send letter. Please check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = 'sp-input mt-1.5 w-full rounded-xl px-3 py-2.5';
  const required = <span className="sp-highlight" aria-hidden="true">*</span>;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="santa-dialog-title"
        className="sp-modal w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-[1.25rem] p-5 shadow-2xl"
      >
        <div className="-mr-2 -mt-2 flex justify-end">
          <button
            onClick={onClose}
            aria-label="Close"
            className="sp-muted grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Header */}
        <div>
          <span className="sp-eyebrow">North Pole mail</span>
          <h2 id="santa-dialog-title" className="sp-display sp-h2">Write to Santa</h2>
          <p className="sp-muted mt-1 text-sm">Send your Christmas wishes to the North Pole!</p>

          {/* Letter Count Display */}
          {!loadingLimit && parentEmail && parentEmail.includes('@') && (
            <p className="sp-chip mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold">
              Letters today: <span className="sp-highlight">{letterCount}/{dailyLimit}</span>
              {letterCount < dailyLimit && <span> ({dailyLimit - letterCount} remaining)</span>}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Success/Error Message */}
          {submitStatus.type && (
            <div className="sp-row p-3" role={submitStatus.type === 'error' ? 'alert' : 'status'}>
              <p className={`whitespace-pre-line text-center font-semibold ${submitStatus.type === 'success' ? 'sp-soft' : 'text-red-300'}`}>
                {submitStatus.message}
              </p>
            </div>
          )}

          {/* Child Name */}
          <div>
            <label htmlFor="childName" className="block text-sm font-semibold">
              Child&apos;s Name {required}
            </label>
            <input
              type="text"
              id="childName"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
              maxLength={100}
              className={inputClass}
              placeholder="Enter child's name"
              disabled={isSubmitting}
            />
          </div>

          {/* Child Age */}
          <div>
            <label htmlFor="childAge" className="block text-sm font-semibold">
              Child&apos;s Age <span className="sp-muted font-normal">(optional)</span>
            </label>
            <input
              type="number"
              id="childAge"
              value={childAge}
              onChange={(e) => setChildAge(e.target.value)}
              min="1"
              max="18"
              className={inputClass}
              placeholder="Enter child's age"
              disabled={isSubmitting}
            />
          </div>

          {/* Parent Email */}
          <div>
            <label htmlFor="parentEmail" className="block text-sm font-semibold">
              Parent&apos;s Email {required}
            </label>
            <input
              type="email"
              id="parentEmail"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              required
              className={inputClass}
              placeholder="Santa will send a reply here!"
              disabled={isSubmitting}
            />
            <p className="sp-muted mt-1 text-xs">
              We&apos;ll email you a link to confirm first, then Santa&apos;s magical reply comes here! 📧✨
            </p>
          </div>

          {/* Letter Content */}
          <div>
            <label htmlFor="letterContent" className="block text-sm font-semibold">
              Your Letter to Santa {required}
            </label>
            <textarea
              id="letterContent"
              value={letterContent}
              onChange={(e) => setLetterContent(e.target.value)}
              required
              maxLength={2000}
              rows={8}
              className={`${inputClass} resize-none`}
              placeholder="Dear Santa,&#10;&#10;This year I have been very good! I would like to tell you about..."
              disabled={isSubmitting}
            />
            <p className="sp-muted mt-1 text-xs tabular-nums">
              {letterContent.length} / 2000 characters
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || letterCount >= dailyLimit}
            className="sp-btn-accent flex min-h-12 w-full items-center justify-center rounded-full px-6 font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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

          {/* Footer note */}
          <div className="sp-row sp-muted space-y-1.5 p-3 text-center text-xs">
            <p className="text-sm">
              {submitStatus.type === 'success' ? (
                letterCount < dailyLimit ? (
                  <span className="sp-soft font-semibold">
                    🎄 Thank you! You can send {dailyLimit - letterCount} more letter{(dailyLimit - letterCount) > 1 ? 's' : ''} today. 🎄
                  </span>
                ) : (
                  <span className="sp-highlight font-semibold">
                    🎄 You&apos;ve sent {dailyLimit} letter{dailyLimit > 1 ? 's' : ''} today. Come back tomorrow for more! 🎄
                  </span>
                )
              ) : letterCount >= dailyLimit ? (
                <span className="sp-highlight font-semibold">
                  🎄 You&apos;ve sent {dailyLimit} letter{dailyLimit > 1 ? 's' : ''} today. Come back tomorrow for more! 🎄
                </span>
              ) : (
                <span>
                  🎄 Santa reads every letter carefully! You can send{' '}
                  {dailyLimit > 1 ? `up to ${dailyLimit} letters` : 'one letter'} per day. 🎄
                </span>
              )}
            </p>
            <p>
              ✉️ Click the link in the confirmation email and your letter goes to Santa&apos;s workshop. He&apos;ll send a personalized reply soon after!
            </p>
            <p>
              🔒 We track letters by both email address and location to ensure fair access for all children.
            </p>
          </div>
        </form>

        <p className="sp-muted mt-4 text-center text-xs">
          ✨ Magical delivery powered by Santa&apos;s elves at the North Pole! ✨
        </p>
      </div>
    </div>
  );
}
