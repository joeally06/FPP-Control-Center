import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/database';
import type { ScheduleActionType } from '@/types/display';

function db() { return getDb(); }

function adminOnly(): Promise<boolean> {
  return getServerSession(authOptions).then(
    (s) => s?.user?.role === 'admin'
  );
}

/** GET /api/display/schedule — admin: list all rules */
export async function GET() {
  if (!(await adminOnly())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = db().prepare(
    `SELECT * FROM display_schedule ORDER BY priority ASC, created_at ASC`
  ).all();
  return NextResponse.json({ rules: rows });
}

/** POST /api/display/schedule — admin: create a rule */
export async function POST(req: NextRequest) {
  if (!(await adminOnly())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, enabled, days, startTime, endTime, actionType, actionPayload, priority } = body;

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const ALLOWED_ACTIONS: ScheduleActionType[] = ['slideshow', 'theme', 'announcement', 'custom_display'];
  if (!ALLOWED_ACTIONS.includes(actionType)) {
    return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 });
  }

  const result = db().prepare(`
    INSERT INTO display_schedule (name, enabled, days, start_time, end_time, action_type, action_payload, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim().substring(0, 100),
    enabled !== false ? 1 : 0,
    typeof days === 'string' ? days : '0,1,2,3,4,5,6',
    typeof startTime === 'string' ? startTime : '00:00',
    typeof endTime === 'string' ? endTime : '23:59',
    actionType,
    typeof actionPayload === 'string' ? actionPayload : JSON.stringify(actionPayload ?? {}),
    typeof priority === 'number' ? Math.max(1, Math.min(100, priority)) : 10,
  );

  const rule = db().prepare(`SELECT * FROM display_schedule WHERE id = ?`).get(result.lastInsertRowid);
  return NextResponse.json({ rule }, { status: 201 });
}

/** PUT /api/display/schedule — admin: update a rule (id in body) */
export async function PUT(req: NextRequest) {
  if (!(await adminOnly())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, name, enabled, days, startTime, endTime, actionType, actionPayload, priority } = body;

  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  const ALLOWED_ACTIONS: ScheduleActionType[] = ['slideshow', 'theme', 'announcement', 'custom_display'];
  if (actionType && !ALLOWED_ACTIONS.includes(actionType)) {
    return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 });
  }

  db().prepare(`
    UPDATE display_schedule
    SET name = COALESCE(?, name),
        enabled = COALESCE(?, enabled),
        days = COALESCE(?, days),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        action_type = COALESCE(?, action_type),
        action_payload = COALESCE(?, action_payload),
        priority = COALESCE(?, priority)
    WHERE id = ?
  `).run(
    typeof name === 'string' ? name.trim().substring(0, 100) : null,
    typeof enabled === 'boolean' ? (enabled ? 1 : 0) : null,
    typeof days === 'string' ? days : null,
    typeof startTime === 'string' ? startTime : null,
    typeof endTime === 'string' ? endTime : null,
    actionType ?? null,
    typeof actionPayload === 'string' ? actionPayload : (actionPayload != null ? JSON.stringify(actionPayload) : null),
    typeof priority === 'number' ? Math.max(1, Math.min(100, priority)) : null,
    id,
  );

  const rule = db().prepare(`SELECT * FROM display_schedule WHERE id = ?`).get(id);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ rule });
}

/** DELETE /api/display/schedule?id=N — admin: delete a rule */
export async function DELETE(req: NextRequest) {
  if (!(await adminOnly())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

  db().prepare(`DELETE FROM display_schedule WHERE id = ?`).run(id);
  return NextResponse.json({ success: true });
}
