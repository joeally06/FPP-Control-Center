// API Route: Send Letter to Santa

import { NextRequest, NextResponse } from 'next/server';
import db, {
  insertSantaLetter,
} from '@/lib/database';
import { sendSantaConfirmation } from '@/lib/email-service';
import { validateAndSanitizeSantaLetter } from '@/lib/input-sanitization';
import {
  confirmationUrl,
  createLetterConfirmation,
  DEFAULT_SANTA_DAILY_CAP,
  deleteUnconfirmedLetter,
  lettersToday,
  parseSantaDailyCap,
} from '@/lib/santa-confirmation';
import { checkSantaRateLimit, getClientIP } from '@/lib/santa-rate-limit';
import { getSetting, getSettingBoolean } from '@/lib/settings';
import { hashEmail } from '@/lib/privacy-utils';

interface SendLetterRequest {
  childName: string;
  childAge?: number;
  parentEmail: string;
  letterContent: string;
}

/**
 * Sanitize email headers to prevent injection
 */
function sanitizeEmailHeader(input: string): string {
  return input.replace(/[\r\n]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const body: SendLetterRequest = await request.json();
    
    console.log('📬 Received a Santa letter');

    if (!getSettingBoolean('santa_letters_enabled', true)) {
      return NextResponse.json(
        { error: "Santa's mailbox is closed right now. Please check back later! 🎄" },
        { status: 403 }
      );
    }

    // Get client IP for rate limiting
    const clientIP = getClientIP(request);
    
    // Sanitize email headers to prevent injection
    const sanitizedEmail = sanitizeEmailHeader(body.parentEmail || '');
    
    // ✅ DUAL RATE LIMITING: Check both email and IP address
    const rateLimitResult = checkSantaRateLimit(sanitizedEmail, clientIP);
    
    if (!rateLimitResult.allowed) {
      const errorMessage = rateLimitResult.reason === 'email_limit'
        ? `You've already sent ${rateLimitResult.emailCount} letter(s) today from this email address. Daily limit is ${rateLimitResult.limit}.`
        : `You've already sent ${rateLimitResult.ipCount} letter(s) today from this location. Daily limit is ${rateLimitResult.limit}.`;
      
      console.warn(`[SECURITY] Rate limit exceeded for ${hashEmail(sanitizedEmail)} / ${clientIP} (${rateLimitResult.reason})`);
      
      return NextResponse.json({ 
        error: errorMessage,
        emailCount: rateLimitResult.emailCount,
        ipCount: rateLimitResult.ipCount,
        limit: rateLimitResult.limit,
        reason: rateLimitResult.reason
      }, { status: 429 });
    }

    // ✅ Cap on letters from all visitors together, which bounds how much email the form can trigger
    const dailyCap = parseSantaDailyCap(getSetting('santa_daily_cap')) ?? DEFAULT_SANTA_DAILY_CAP;
    if (lettersToday(db) >= dailyCap) {
      return NextResponse.json({
        error: "Santa's mailbag is full for today! Please try again tomorrow. 🎅",
        reason: 'daily_cap'
      }, { status: 429 });
    }

    // ✅ SECURITY: Validate and sanitize ALL inputs
    const validation = validateAndSanitizeSantaLetter(
      body.childName || '',
      body.childAge || null,
      sanitizedEmail,
      body.letterContent || ''
    );

    if (!validation.isValid) {
      console.log('❌ Validation failed:', validation.errors);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid input. Please check your letter and try again.',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    // Use sanitized values from this point forward
    const sanitized = validation.sanitized!;

    // The confirmation link must point at the public site, never at the request's Host header
    const baseUrl = process.env.NEXTAUTH_URL;
    if (!baseUrl) {
      console.error('[Santa] NEXTAUTH_URL is not set - cannot build the confirmation link');
      return NextResponse.json(
        { error: 'Santa letters are not available right now. Please try again later.' },
        { status: 500 }
      );
    }

    // Insert the letter ('queued') with its confirmation; the queue processor only answers
    // it after the parent clicks the link in the confirmation email
    const { letterId, token } = db.transaction(() => {
      const result = insertSantaLetter.run(
        sanitized.childName,
        sanitized.childAge,
        sanitized.parentEmail,
        sanitized.letterContent,
        clientIP
      );
      const id = result.lastInsertRowid as number;
      return { letterId: id, token: createLetterConfirmation(db, id) };
    })();
    console.log('✅ Letter saved to database with ID:', letterId);

    const emailSent = await sendSantaConfirmation({
      parentEmail: sanitized.parentEmail,
      confirmUrl: confirmationUrl(baseUrl, token),
      siteName: getSetting('site_name') ?? '',
    });
    if (!emailSent) {
      deleteUnconfirmedLetter(db, letterId);
      return NextResponse.json(
        { error: "We couldn't send the confirmation email right now. Please try again in a few minutes." },
        { status: 503 }
      );
    }
    console.log('📬 Confirmation email sent for letter ID:', letterId);

    return NextResponse.json({
      success: true,
      letterId,
      message: "Almost there! 🎅 Check your email and click the link within 3 days to send your letter to the North Pole. Santa's reply will come to the same address."
    });
    
  } catch (error) {
    console.error('Error processing Santa letter:', error);
    return NextResponse.json(
      { error: 'Failed to send letter to Santa. Please try again later.' },
      { status: 500 }
    );
  }
}
