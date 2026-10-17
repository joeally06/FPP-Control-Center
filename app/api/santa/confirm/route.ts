// API Route: Confirm a letter to Santa (the button on the page linked from the confirmation email)

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/database';
import { getClientIP } from '@/lib/rate-limit';
import { allowConfirmAttempt, confirmLetter, isConfirmTokenShape } from '@/lib/santa-confirmation';

export async function POST(request: NextRequest) {
  try {
    if (!allowConfirmAttempt(getClientIP(request))) {
      return NextResponse.json(
        { error: 'Too many tries. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const { token } = await request.json().catch(() => ({ token: null }));
    const result = isConfirmTokenShape(token) ? confirmLetter(db, token) : 'invalid';

    if (result === 'confirmed' || result === 'already_confirmed') {
      return NextResponse.json({ success: true, result });
    }
    if (result === 'expired') {
      return NextResponse.json(
        { error: 'This link has expired. Please write a new letter to Santa.', result },
        { status: 410 }
      );
    }
    return NextResponse.json(
      { error: "This link isn't valid. Please check you copied the whole link from the email.", result },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error confirming Santa letter:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }
}
