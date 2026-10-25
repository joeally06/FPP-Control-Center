'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TriviaBroadcastState, TriviaQuestionRow, TriviaSessionRow } from '@/types/trivia';
import { X, ChevronUp, ChevronDown, Play, Eye, SkipForward, Square } from 'lucide-react';
import { insetBox, button, accentButton, dangerButton, smallButton, field, sizedField, textLink, notice, badge, tabClass } from '@/components/admin/ui-classes';

type SubTab = 'bank' | 'sessions' | 'host';

const EMPTY_FORM = {
  category: 'General',
  questionText: '',
  choices: ['', '', '', ''],
  correctIndex: 0,
  points: 1000,
};

export default function TriviaSettings() {
  const [subTab, setSubTab] = useState<SubTab>('bank');
  const [questions, setQuestions] = useState<TriviaQuestionRow[]>([]);
  const [sessions, setSessions] = useState<TriviaSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [newSessionName, setNewSessionName] = useState('');
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(20);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [creatingSession, setCreatingSession] = useState(false);

  const [triviaLive, setTriviaLive] = useState<TriviaBroadcastState | null>(null);
  const [hostBusy, setHostBusy] = useState(false);

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (subTab !== 'host') return;
    const es = new EventSource('/api/trivia/stream');
    es.onmessage = (event) => {
      try {
        setTriviaLive(JSON.parse(event.data as string));
      } catch {
        // ignore malformed frames
      }
    };
    return () => es.close();
  }, [subTab]);

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function refreshAll() {
    setLoading(true);
    try {
      const [qRes, sRes] = await Promise.all([fetch('/api/trivia/questions'), fetch('/api/trivia/sessions')]);
      setQuestions(qRes.ok ? await qRes.json() : []);
      setSessions(sRes.ok ? await sRes.json() : []);
    } catch {
      flash('error', 'Failed to load trivia data');
    } finally {
      setLoading(false);
    }
  }

  const activeSession = useMemo(() => sessions.find((s) => s.status === 'active') ?? null, [sessions]);

  // ─── Question bank ─────────────────────────────────────────────────────

  function startEdit(q: TriviaQuestionRow) {
    setEditingId(q.id);
    setForm({
      category: q.category,
      questionText: q.questionText,
      choices: q.choices,
      correctIndex: q.correctIndex,
      points: q.points,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function updateChoice(idx: number, value: string) {
    setForm((f) => ({ ...f, choices: f.choices.map((c, i) => (i === idx ? value : c)) }));
  }

  function addChoice() {
    setForm((f) => (f.choices.length >= 6 ? f : { ...f, choices: [...f.choices, ''] }));
  }

  function removeChoice(idx: number) {
    setForm((f) => {
      if (f.choices.length <= 2) return f;
      const choices = f.choices.filter((_, i) => i !== idx);
      const correctIndex = f.correctIndex >= choices.length ? 0 : f.correctIndex === idx ? 0 : f.correctIndex;
      return { ...f, choices, correctIndex };
    });
  }

  async function saveQuestion() {
    setSaving(true);
    try {
      const url = editingId ? `/api/trivia/questions/${editingId}` : '/api/trivia/questions';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('error', data.error || 'Failed to save question');
        return;
      }
      flash('success', editingId ? 'Question updated' : 'Question added');
      resetForm();
      await refreshAll();
    } catch {
      flash('error', 'Failed to save question');
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(id: number) {
    if (!confirm('Delete this question from the bank?')) return;
    try {
      const res = await fetch(`/api/trivia/questions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        flash('error', data.error || 'Failed to delete question');
        return;
      }
      setSelectedQuestionIds((ids) => ids.filter((i) => i !== id));
      await refreshAll();
    } catch {
      flash('error', 'Failed to delete question');
    }
  }

  // ─── Sessions ───────────────────────────────────────────────────────────

  function toggleQuestionSelection(id: number) {
    setSelectedQuestionIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  function moveSelected(id: number, dir: -1 | 1) {
    setSelectedQuestionIds((ids) => {
      const idx = ids.indexOf(id);
      const newIdx = idx + dir;
      if (idx < 0 || newIdx < 0 || newIdx >= ids.length) return ids;
      const copy = [...ids];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  async function createSession() {
    if (!newSessionName.trim() || selectedQuestionIds.length === 0) return;
    setCreatingSession(true);
    try {
      const res = await fetch('/api/trivia/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSessionName.trim(), questionIds: selectedQuestionIds, secondsPerQuestion }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('error', data.error || 'Failed to create session');
        return;
      }
      flash('success', 'Session created');
      setNewSessionName('');
      setSelectedQuestionIds([]);
      await refreshAll();
    } catch {
      flash('error', 'Failed to create session');
    } finally {
      setCreatingSession(false);
    }
  }

  async function activateSession(id: number) {
    try {
      const res = await fetch(`/api/trivia/sessions/${id}/activate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        flash('error', data.error || 'Failed to activate session');
        return;
      }
      flash('success', 'Session activated - it will start itself as soon as someone taps Play Trivia on their phone');
      setSubTab('host');
      await refreshAll();
    } catch {
      flash('error', 'Failed to activate session');
    }
  }

  // ─── Host controls ──────────────────────────────────────────────────────

  async function hostAction(action: 'start' | 'reveal' | 'next' | 'end') {
    setHostBusy(true);
    try {
      const res = await fetch(`/api/trivia/host/${action}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        flash('error', data.error || `Failed to ${action}`);
      }
      await refreshAll();
    } catch {
      flash('error', `Failed to ${action}`);
    } finally {
      setHostBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-adm-muted">Loading trivia settings…</p>;
  }

  const panelTitle = 'mb-3 text-[15px] font-semibold text-adm-text';

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-adm-line">
        {(['bank', 'sessions', 'host'] as SubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            aria-pressed={subTab === tab}
            className={tabClass(subTab === tab)}
          >
            {tab === 'bank' ? 'Question Bank' : tab === 'sessions' ? 'Sessions' : 'Host Controls'}
          </button>
        ))}
      </div>

      {message && (
        <p className={message.type === 'success' ? notice.ok : notice.danger}>
          {message.text}
        </p>
      )}

      {subTab === 'bank' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${insetBox} space-y-3`}>
            <h3 className={panelTitle}>{editingId ? 'Edit Question' : 'New Question'}</h3>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Category (e.g. Movies, Carols)"
              aria-label="Category"
              className={field}
            />
            <textarea
              value={form.questionText}
              onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
              placeholder="Question text"
              aria-label="Question text"
              rows={2}
              className={field}
            />
            <div className="space-y-2">
              <p className="text-xs text-adm-muted">Choices (select the correct answer)</p>
              {form.choices.map((choice, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctIndex"
                    checked={form.correctIndex === idx}
                    onChange={() => setForm((f) => ({ ...f, correctIndex: idx }))}
                    title="Correct answer"
                    aria-label={`Choice ${idx + 1} is the correct answer`}
                    className="h-4.5 w-4.5 shrink-0 accent-adm-accent"
                  />
                  <input
                    type="text"
                    value={choice}
                    onChange={(e) => updateChoice(idx, e.target.value)}
                    placeholder={`Choice ${idx + 1}`}
                    aria-label={`Choice ${idx + 1}`}
                    className={`${field} flex-1`}
                  />
                  {form.choices.length > 2 && (
                    <button
                      onClick={() => removeChoice(idx)}
                      aria-label={`Remove choice ${idx + 1}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-adm-muted hover:bg-adm-danger-bg hover:text-adm-danger"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {form.choices.length < 6 && (
                <button onClick={addChoice} className={textLink}>+ Add choice</button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="trivia-points" className="text-sm text-adm-soft">Base points</label>
              <input
                id="trivia-points"
                type="number"
                value={form.points}
                onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) }))}
                min={100}
                max={5000}
                step={50}
                className={`${sizedField} w-28`}
              />
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={saveQuestion}
                disabled={saving || !form.questionText.trim() || form.choices.some((c) => !c.trim())}
                className={`${accentButton} flex-1`}
              >
                {saving ? 'Saving…' : editingId ? 'Update Question' : 'Add Question'}
              </button>
              {editingId && (
                <button onClick={resetForm} className={button}>
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className={insetBox}>
            <h3 className={panelTitle}>Question Bank ({questions.length})</h3>
            <div className="max-h-[28rem] space-y-2 overflow-y-auto">
              {questions.map((q) => (
                <div key={q.id} className="flex items-start justify-between gap-2 rounded-lg border border-adm-line bg-adm-surface p-3">
                  <div className="min-w-0">
                    <p className="text-xs text-adm-muted">{q.category} · {q.points} pts</p>
                    <p className="text-sm font-medium text-adm-text">{q.questionText}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(q)} className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-adm-soft hover:bg-adm-hover hover:text-adm-text">Edit</button>
                    <button onClick={() => deleteQuestion(q.id)} className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-adm-soft hover:bg-adm-danger-bg hover:text-adm-danger">Delete</button>
                  </div>
                </div>
              ))}
              {questions.length === 0 && <p className="text-sm text-adm-muted">No questions yet - add your first one.</p>}
            </div>
          </div>
        </div>
      )}

      {subTab === 'sessions' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${insetBox} space-y-3`}>
            <h3 className={panelTitle}>Build a Session</h3>
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Session name (e.g. Christmas Eve Trivia)"
              aria-label="Session name"
              className={field}
            />
            <div className="flex items-center gap-3">
              <label htmlFor="trivia-seconds" className="text-sm text-adm-soft">Seconds per question</label>
              <input
                id="trivia-seconds"
                type="number"
                value={secondsPerQuestion}
                onChange={(e) => setSecondsPerQuestion(Number(e.target.value))}
                min={5}
                max={120}
                className={`${sizedField} w-24`}
              />
            </div>
            <p className="text-sm text-adm-muted">Select questions ({selectedQuestionIds.length} chosen), then reorder:</p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {questions.map((q) => (
                <label key={q.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-adm-soft hover:bg-adm-hover">
                  <input
                    type="checkbox"
                    checked={selectedQuestionIds.includes(q.id)}
                    onChange={() => toggleQuestionSelection(q.id)}
                    className="h-4 w-4 shrink-0 accent-adm-accent"
                  />
                  {q.questionText}
                </label>
              ))}
            </div>
            {selectedQuestionIds.length > 0 && (
              <div className="space-y-1">
                {selectedQuestionIds.map((id, i) => {
                  const q = questions.find((qq) => qq.id === id);
                  return (
                    <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-adm-line bg-adm-surface px-2.5 py-1 text-sm">
                      <span className="text-adm-soft">{i + 1}. {q?.questionText}</span>
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => moveSelected(id, -1)} aria-label="Move up" className="grid h-8 w-8 place-items-center rounded-lg text-adm-muted hover:bg-adm-hover hover:text-adm-text">
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button onClick={() => moveSelected(id, 1)} aria-label="Move down" className="grid h-8 w-8 place-items-center rounded-lg text-adm-muted hover:bg-adm-hover hover:text-adm-text">
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={createSession}
              disabled={creatingSession || !newSessionName.trim() || selectedQuestionIds.length === 0}
              className={`${accentButton} w-full`}
            >
              {creatingSession ? 'Creating…' : 'Create Session'}
            </button>
          </div>

          <div className={insetBox}>
            <h3 className={panelTitle}>All Sessions</h3>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-adm-line bg-adm-surface p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-adm-text">{s.name}</p>
                    <p className="text-xs text-adm-muted">{s.questionIds.length} questions · {s.status}</p>
                  </div>
                  {s.status === 'draft' && (
                    <button
                      onClick={() => activateSession(s.id)}
                      className={`${smallButton} shrink-0`}
                    >
                      Activate
                    </button>
                  )}
                  {s.status === 'active' && <span className={`${badge.ok} shrink-0`}>Live</span>}
                </div>
              ))}
              {sessions.length === 0 && <p className="text-sm text-adm-muted">No sessions yet.</p>}
            </div>
          </div>
        </div>
      )}

      {subTab === 'host' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${insetBox} space-y-4`}>
            <p className="text-xs text-adm-muted">
              Trivia runs itself once a session is activated - the first phone to tap Play Trivia starts the round,
              questions auto-advance on a timer, and it resets itself for the next group when it ends. The buttons
              below are just manual overrides if you need to step in.
            </p>
            {!activeSession ? (
              <p className="text-sm text-adm-soft">No session is active. Activate one from the Sessions tab to arm it.</p>
            ) : (
              <>
                <div>
                  <p className="font-semibold text-adm-text">{activeSession.name}</p>
                  <p className="text-sm text-adm-muted">
                    Phase: <span className="font-semibold text-adm-text">{triviaLive?.phase ?? activeSession.phase}</span>
                    {triviaLive?.questionNumber && ` · Question ${triviaLive.questionNumber}/${triviaLive.totalQuestions}`}
                  </p>
                  <p className="text-sm text-adm-muted">
                    {triviaLive?.playersJoined ?? 0} joined
                    {triviaLive?.phase === 'question' && ` · ${triviaLive.answeredCount} answered`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => hostAction('start')}
                    disabled={hostBusy || (triviaLive?.phase ?? activeSession.phase) !== 'lobby'}
                    className={accentButton}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Force Start
                  </button>
                  <button
                    onClick={() => hostAction('reveal')}
                    disabled={hostBusy || (triviaLive?.phase ?? activeSession.phase) !== 'question'}
                    className={button}
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Reveal Now
                  </button>
                  <button
                    onClick={() => hostAction('next')}
                    disabled={hostBusy || (triviaLive?.phase ?? activeSession.phase) !== 'reveal'}
                    className={button}
                  >
                    <SkipForward className="h-4 w-4" aria-hidden="true" />
                    Next Question
                  </button>
                  <button
                    onClick={() => hostAction('end')}
                    disabled={hostBusy || (triviaLive?.phase ?? activeSession.phase) === 'ended'}
                    className={dangerButton}
                  >
                    <Square className="h-4 w-4" aria-hidden="true" />
                    End &amp; Deactivate
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-adm-line bg-black" style={{ aspectRatio: '16/9', position: 'relative' }}>
            <iframe src="/display" className="absolute inset-0 w-full h-full border-0" title="TV display live preview" />
          </div>
        </div>
      )}
    </div>
  );
}
