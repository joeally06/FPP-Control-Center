// API Route: Resend Santa Email

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getSantaLetter, updateSantaLetterStatus } from '@/lib/database';
import { sendSantaReply } from '@/lib/email-service';
import { isAdminSession } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { letterId } = await request.json();

    if (!letterId) {
      return NextResponse.json(
        { error: 'Missing letter ID' },
        { status: 400 }
      );
    }

    // Get letter details
    const letter = getSantaLetter.get(letterId) as any;

    if (!letter) {
      return NextResponse.json(
        { error: 'Letter not found' },
        { status: 404 }
      );
    }

    if (!letter.santa_reply) {
      return NextResponse.json(
        { error: 'No Santa reply to send' },
        { status: 400 }
      );
    }

    // Send email
    const emailSent = await sendSantaReply({
      parentEmail: letter.parent_email,
      childName: letter.child_name,
      santaReply: letter.santa_reply,
    });

    if (emailSent) {
      // Update status to sent
      updateSantaLetterStatus.run('sent', null, letterId);

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error resending email:', error);
    return NextResponse.json(
      { error: 'Failed to resend email' },
      { status: 500 }
    );
  }
}
