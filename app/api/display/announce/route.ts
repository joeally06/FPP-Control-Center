import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { updateSettings } from '@/lib/settings';

/** POST /api/display/announce — admin only. Body: { text, durationSeconds } */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const text = String(body.text ?? '').trim().substring(0, 200);
    if (!text) {
      return NextResponse.json({ error: 'Announcement text is required' }, { status: 400 });
    }

    const durationSeconds = Math.max(10, Math.min(600, parseInt(String(body.durationSeconds ?? '60'), 10)));
    const expires = Math.floor(Date.now() / 1000) + durationSeconds;

    updateSettings({
      display_announcement_text:    text,
      display_announcement_expires: String(expires),
    });

    return NextResponse.json({ success: true, expiresIn: durationSeconds });
  } catch (error) {
    console.error('Announce error:', error);
    return NextResponse.json({ error: 'Failed to send announcement' }, { status: 500 });
  }
}

/** DELETE /api/display/announce — clears active announcement */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    updateSettings({
      display_announcement_text:    '',
      display_announcement_expires: '0',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Announce clear error:', error);
    return NextResponse.json({ error: 'Failed to clear announcement' }, { status: 500 });
  }
}
