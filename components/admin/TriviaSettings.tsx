'use client';

import { useEffect, useState } from 'react';
import type { TriviaQuestionRow } from '@/types/trivia';
import { X } from 'lucide-react';
import { insetBox, button, accentButton, field, sizedField, textLink, notice, tabClass } from '@/components/admin/ui-classes';
import { TRIVIA_SETTING_LIMITS } from '@/lib/trivia-logic';

type SubTab = 'bank' | 'game';

const { trivia_questions_per_game: QUESTIONS_LIMITS, trivia_seconds_per_question: SECONDS_LIMITS } = TRIVIA_SETTING_LIMITS;

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
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [questionsPerGame, setQuestionsPerGame] = useState<number>(QUESTIONS_LIMITS.default);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState<number>(SECONDS_LIMITS.default);
  const [savingGame, setSavingGame] = useState(false);

  useEffect(() => {
    void refreshAll();
  }, []);

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function refreshAll() {
    setLoading(true);
    try {
      const [qRes, sRes] = await Promise.all([fetch('/api/trivia/questions'), fetch('/api/settings')]);
      setQuestions(qRes.ok ? await qRes.json() : []);
      const settings: Record<string, string> = sRes.ok ? (await sRes.json()).settings ?? {} : {};
      setQuestionsPerGame(parseInt(settings.trivia_questions_per_game || String(QUESTIONS_LIMITS.default), 10));
      setSecondsPerQuestion(parseInt(settings.trivia_seconds_per_question || String(SECONDS_LIMITS.default), 10));
    } catch {
      flash('error', 'Failed to load trivia data');
    } finally {
      setLoading(false);
    }
  }

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
      await refreshAll();
    } catch {
      flash('error', 'Failed to delete question');
    }
  }

  // ─── Game settings ─────────────────────────────────────────────────────

  async function saveGameSettings() {
    setSavingGame(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            trivia_questions_per_game: String(questionsPerGame),
            trivia_seconds_per_question: String(secondsPerQuestion),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('error', data.error || 'Failed to save game settings');
        return;
      }
      flash('success', 'Game settings saved');
    } catch {
      flash('error', 'Failed to save game settings');
    } finally {
      setSavingGame(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-adm-muted">Loading trivia settings…</p>;
  }

  const panelTitle = 'mb-3 text-[15px] font-semibold text-adm-text';

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-adm-line">
        {(['bank', 'game'] as SubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            aria-pressed={subTab === tab}
            className={tabClass(subTab === tab)}
          >
            {tab === 'bank' ? 'Question Bank' : 'Game'}
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

      {subTab === 'game' && (
        <div className={`${insetBox} max-w-xl space-y-4`}>
          <p className="text-sm text-adm-soft">
            Visitors play on their own phone from the Christmas trivia card on the jukebox page (or directly at{' '}
            <a href="/trivia" target="_blank" rel="noopener noreferrer" className={textLink}>/trivia</a>), whenever they like. Each game draws random questions from the bank, gives a timer for each one, and shows
            right or wrong straight away. The end screen shows tonight&apos;s top 10 scores.
          </p>
          <div className="flex items-center gap-3">
            <label htmlFor="trivia-questions-per-game" className="text-sm text-adm-soft">Questions per game</label>
            <input
              id="trivia-questions-per-game"
              type="number"
              value={questionsPerGame}
              onChange={(e) => setQuestionsPerGame(Number(e.target.value))}
              min={QUESTIONS_LIMITS.min}
              max={QUESTIONS_LIMITS.max}
              className={`${sizedField} w-24`}
            />
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="trivia-seconds" className="text-sm text-adm-soft">Seconds per question</label>
            <input
              id="trivia-seconds"
              type="number"
              value={secondsPerQuestion}
              onChange={(e) => setSecondsPerQuestion(Number(e.target.value))}
              min={SECONDS_LIMITS.min}
              max={SECONDS_LIMITS.max}
              className={`${sizedField} w-24`}
            />
          </div>
          {questions.length < questionsPerGame && (
            <p className="text-xs text-adm-muted">
              The bank has {questions.length} question{questions.length === 1 ? '' : 's'}, so games will use all of them.
            </p>
          )}
          <button onClick={saveGameSettings} disabled={savingGame} className={accentButton}>
            {savingGame ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
