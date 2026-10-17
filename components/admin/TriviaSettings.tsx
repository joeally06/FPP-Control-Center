'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TriviaBroadcastState, TriviaQuestionRow, TriviaSessionRow } from '@/types/trivia';

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
    return <p className="text-white/60">Loading trivia settings…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['bank', 'sessions', 'host'] as SubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              subTab === tab ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10'
            }`}
          >
            {tab === 'bank' ? '📚 Question Bank' : tab === 'sessions' ? '🗂️ Sessions' : '🎙️ Host Controls'}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-500/20 border border-green-400/40 text-green-300'
              : 'bg-red-500/20 border border-red-400/40 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {subTab === 'bank' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
            <h3 className="text-white font-bold">{editingId ? 'Edit Question' : 'New Question'}</h3>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Category (e.g. Movies, Carols)"
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 text-sm"
            />
            <textarea
              value={form.questionText}
              onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
              placeholder="Question text"
              rows={2}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 text-sm"
            />
            <div className="space-y-2">
              {form.choices.map((choice, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctIndex"
                    checked={form.correctIndex === idx}
                    onChange={() => setForm((f) => ({ ...f, correctIndex: idx }))}
                    title="Correct answer"
                  />
                  <input
                    type="text"
                    value={choice}
                    onChange={(e) => updateChoice(idx, e.target.value)}
                    placeholder={`Choice ${idx + 1}`}
                    className="flex-1 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 text-sm"
                  />
                  {form.choices.length > 2 && (
                    <button onClick={() => removeChoice(idx)} className="text-white/40 hover:text-red-300 px-1">✕</button>
                  )}
                </div>
              ))}
              {form.choices.length < 6 && (
                <button onClick={addChoice} className="text-white/60 hover:text-white text-sm">+ Add choice</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-white/60 text-sm">Base points</label>
              <input
                type="number"
                value={form.points}
                onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) }))}
                min={100}
                max={5000}
                step={50}
                className="w-28 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveQuestion}
                disabled={saving || !form.questionText.trim() || form.choices.some((c) => !c.trim())}
                className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-500 text-white rounded-lg font-semibold text-sm"
              >
                {saving ? 'Saving…' : editingId ? 'Update Question' : 'Add Question'}
              </button>
              {editingId && (
                <button onClick={resetForm} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm">
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h3 className="text-white font-bold mb-3">Question Bank ({questions.length})</h3>
            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {questions.map((q) => (
                <div key={q.id} className="bg-white/5 rounded-lg p-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-white/50 text-xs">{q.category} · {q.points} pts</p>
                    <p className="text-white text-sm font-medium">{q.questionText}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(q)} className="text-white/50 hover:text-white text-xs px-2 py-1">Edit</button>
                    <button onClick={() => deleteQuestion(q.id)} className="text-white/50 hover:text-red-300 text-xs px-2 py-1">Delete</button>
                  </div>
                </div>
              ))}
              {questions.length === 0 && <p className="text-white/40 text-sm">No questions yet - add your first one.</p>}
            </div>
          </div>
        </div>
      )}

      {subTab === 'sessions' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
            <h3 className="text-white font-bold">Build a Session</h3>
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Session name (e.g. Christmas Eve Trivia)"
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 text-sm"
            />
            <div className="flex items-center gap-2">
              <label className="text-white/60 text-sm">Seconds per question</label>
              <input
                type="number"
                value={secondsPerQuestion}
                onChange={(e) => setSecondsPerQuestion(Number(e.target.value))}
                min={5}
                max={120}
                className="w-24 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
              />
            </div>
            <p className="text-white/60 text-sm">Select questions ({selectedQuestionIds.length} chosen), then reorder:</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {questions.map((q) => (
                <label key={q.id} className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={selectedQuestionIds.includes(q.id)}
                    onChange={() => toggleQuestionSelection(q.id)}
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
                    <div key={id} className="flex items-center justify-between bg-white/5 rounded px-2 py-1 text-sm text-white/80">
                      <span>{i + 1}. {q?.questionText}</span>
                      <div className="flex gap-1">
                        <button onClick={() => moveSelected(id, -1)} className="text-white/50 hover:text-white">↑</button>
                        <button onClick={() => moveSelected(id, 1)} className="text-white/50 hover:text-white">↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={createSession}
              disabled={creatingSession || !newSessionName.trim() || selectedQuestionIds.length === 0}
              className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-500 text-white rounded-lg font-semibold text-sm"
            >
              {creatingSession ? 'Creating…' : 'Create Session'}
            </button>
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h3 className="text-white font-bold mb-3">All Sessions</h3>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-white text-sm font-medium">{s.name}</p>
                    <p className="text-white/50 text-xs">{s.questionIds.length} questions · {s.status}</p>
                  </div>
                  {s.status === 'draft' && (
                    <button
                      onClick={() => activateSession(s.id)}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold shrink-0"
                    >
                      Activate
                    </button>
                  )}
                  {s.status === 'active' && <span className="text-green-300 text-xs font-semibold shrink-0">● Live</span>}
                </div>
              ))}
              {sessions.length === 0 && <p className="text-white/40 text-sm">No sessions yet.</p>}
            </div>
          </div>
        </div>
      )}

      {subTab === 'host' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-4">
            <p className="text-white/50 text-xs">
              Trivia runs itself once a session is activated - the first phone to tap Play Trivia starts the round,
              questions auto-advance on a timer, and it resets itself for the next group when it ends. The buttons
              below are just manual overrides if you need to step in.
            </p>
            {!activeSession ? (
              <p className="text-white/60 text-sm">No session is active. Activate one from the Sessions tab to arm it.</p>
            ) : (
              <>
                <div>
                  <p className="text-white font-bold">{activeSession.name}</p>
                  <p className="text-white/60 text-sm">
                    Phase: <span className="font-semibold">{triviaLive?.phase ?? activeSession.phase}</span>
                    {triviaLive?.questionNumber && ` · Question ${triviaLive.questionNumber}/${triviaLive.totalQuestions}`}
                  </p>
                  <p className="text-white/60 text-sm">
                    {triviaLive?.playersJoined ?? 0} joined
                    {triviaLive?.phase === 'question' && ` · ${triviaLive.answeredCount} answered`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => hostAction('start')}
                    disabled={hostBusy || (triviaLive?.phase ?? activeSession.phase) !== 'lobby'}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                  >
                    ▶ Force Start
                  </button>
                  <button
                    onClick={() => hostAction('reveal')}
                    disabled={hostBusy || (triviaLive?.phase ?? activeSession.phase) !== 'question'}
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                  >
                    👁 Reveal Now
                  </button>
                  <button
                    onClick={() => hostAction('next')}
                    disabled={hostBusy || (triviaLive?.phase ?? activeSession.phase) !== 'reveal'}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                  >
                    ⏭ Next Question
                  </button>
                  <button
                    onClick={() => hostAction('end')}
                    disabled={hostBusy || (triviaLive?.phase ?? activeSession.phase) === 'ended'}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                  >
                    ⏹ End &amp; Deactivate
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl overflow-hidden border border-white/20 bg-black" style={{ aspectRatio: '16/9', position: 'relative' }}>
            <iframe src="/display" className="absolute inset-0 w-full h-full border-0" title="TV display live preview" />
          </div>
        </div>
      )}
    </div>
  );
}
