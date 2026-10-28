// API Route: Admin Santa Letters Management

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getAllSantaLetters,
  getSantaLetter,
  updateSantaReply,
  updateSantaLetterStatus,
} from '@/lib/database';
import { sendSantaReply } from '@/lib/email-service';
import { isAdminSession } from '@/lib/auth-helpers';

// GET: Fetch all letters (admin only)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const letters = getAllSantaLetters.all();
    return NextResponse.json(letters);
  } catch (error) {
    console.error('Error fetching Santa letters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch letters' },
      { status: 500 }
    );
  }
}

// PUT: Update letter status (admin only)
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { letterId, status, adminNotes } = await request.json();

    if (!letterId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Reject = never answer this letter; pending = restore a rejected letter
    const validStatuses = ['pending', 'rejected'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const letter = getSantaLetter.get(letterId) as { status: string; queue_status: string } | undefined;
    if (!letter) {
      return NextResponse.json({ error: 'Letter not found' }, { status: 404 });
    }

    // A reply that has gone out (or is going out right now) can't be taken back
    if (status === 'rejected' && (letter.status === 'sent' || letter.queue_status === 'processing')) {
      return NextResponse.json(
        { error: "This letter has already been answered, so it can't be rejected" },
        { status: 409 }
      );
    }

    updateSantaLetterStatus.run(status, adminNotes || null, letterId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating letter status:', error);
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}

// PATCH: Update Santa's reply (admin only)
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { letterId, santaReply } = await request.json();

    if (!letterId || typeof santaReply !== 'string' || !santaReply.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Saves the text only; "Resend Email" sends it
    const result = updateSantaReply.run(santaReply, letterId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Letter not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating reply:', error);
    return NextResponse.json(
      { error: 'Failed to update reply' },
      { status: 500 }
    );
  }
}
