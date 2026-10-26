'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { TriviaAnswerResult, TriviaServedQuestion } from '@/types/trivia';

const NAME_KEY = 'triviaDisplayName';

type Stage = 'intro' | 'question' | 'feedback' | 'done';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

interface ChoicesProps {
  choices: string[];
  picked: number | null;
  correctIndex: number | null; // null while the question is still open
  onPick: (idx: number) => void;
}

const LETTERS = 'ABCDEF';

function Choices({ choices, picked, correctIndex, onPick }: ChoicesProps) {
  const locked = picked !== null || correctIndex !== null;
  return (
    <div className="grid gap-2.5">
      {choices.map((choice, idx) => {
        const isCorrect = correctIndex === idx;
        const isPicked = picked === idx;
        const dimmed = correctIndex !== null ? !isCorrect && !isPicked : picked !== null && !isPicked;
        const ring = isCorrect ? 'var(--sp-soft)' : isPicked ? 'var(--sp-glow)' : undefined;
        return (
          <button
            key={idx}
            onClick={() => onPick(idx)}
            disabled={locked}
            className={`sp-btn-quiet flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-semibold transition ${locked ? '' : 'active:scale-[0.98]'} ${dimmed ? 'opacity-45' : ''}`}
            style={ring ? { borderColor: ring, boxShadow: `0 0 0 1px ${ring}` } : undefined}
          >
            <span className="sp-queue-n flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold" aria-hidden="true">
              {LETTERS[idx]}
            </span>
            <span className="min-w-0 flex-1">{choice}</span>
            {isCorrect && <span aria-label="Correct answer">✅</span>}
            {correctIndex !== null && isPicked && !isCorrect && <span aria-label="Your answer">❌</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The solo trivia game: name → timed questions with instant feedback → score and tonight's top 10. */
export default function TriviaGame() {
  const [stage, setStage] = useState<Stage>('intro');
  const [nameInput, setNameInput] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [served, setServed] = useState<TriviaServedQuestion | null>(null);
  const [msLeft, setMsLeft] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<TriviaAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const answered = useRef(false);

  // Remember the visitor's name between games
  useEffect(() => {
    setNameInput(localStorage.getItem(NAME_KEY) || '');
  }, []);

  async function loadQuestion(gameToken: string) {
    setBusy(true);
    setError('');
    try {
      const next = await postJson<TriviaServedQuestion>('/api/trivia/play/question', { token: gameToken });
      answered.current = false;
      setPicked(null);
      setResult(null);
      setMsLeft(next.msRemaining);
      setServed(next);
      setStage('question');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function startGame() {
    const name = nameInput.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      localStorage.setItem(NAME_KEY, name);
      const game = await postJson<{ token: string }>('/api/trivia/play', { displayName: name });
      setToken(game.token);
      await loadQuestion(game.token);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(choiceIndex: number | null) {
    if (!token || !served || answered.current) return;
    answered.current = true;
    setPicked(choiceIndex);
    setError('');
    try {
      const answer = await postJson<TriviaAnswerResult>('/api/trivia/play/answer', {
        token,
        questionId: served.question.id,
        choiceIndex,
      });
      setResult(answer);
      setStage('feedback');
    } catch (err) {
      setError(errorText(err));
    }
  }

  function startOver() {
    setStage('intro');
    setToken(null);
    setServed(null);
    setResult(null);
    setError('');
  }

  const onTimeUp = useEffectEvent(() => {
    void submitAnswer(null);
  });

  // Count down the current question; when it runs out, tell the server so the game moves on
  useEffect(() => {
    if (stage !== 'question' || !served) return;
    const deadline = Date.now() + served.msRemaining;
    const id = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setMsLeft(left);
      if (left === 0) {
        clearInterval(id);
        onTimeUp();
      }
    }, 100);
    return () => clearInterval(id);
  }, [stage, served]);

  const totalMs = (served?.secondsPerQuestion ?? 1) * 1000;
  const timerPct = Math.max(0, Math.min(100, (msLeft / totalMs) * 100));

  const primaryButton = 'sp-btn-accent min-h-12 w-full rounded-full px-6 font-extrabold transition disabled:opacity-60';

  return (
    <div>
      {stage === 'intro' ? (
        <div className="grid gap-3.5">
          <div>
            <span className="sp-eyebrow">Play along</span>
            <h2 className="sp-display sp-h2">Christmas trivia</h2>
            <p className="sp-muted mt-1 text-sm">Beat the clock - the faster you answer, the more points you score.</p>
          </div>
          <label className="block text-sm font-semibold">
            Your name
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startGame()}
              maxLength={30}
              className="sp-input mt-1.5 w-full rounded-xl px-3 py-2.5"
              autoFocus
            />
          </label>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button onClick={startGame} disabled={busy || !nameInput.trim()} className={primaryButton}>
            {busy ? 'Starting…' : 'Play trivia'}
          </button>
        </div>
      ) : stage === 'done' && result ? (
        <div className="grid gap-4 text-center">
          <div>
            <span className="sp-eyebrow">Game over</span>
            <p className="sp-display sp-title mt-1 text-5xl">{result.score}</p>
            <p className="sp-muted mt-1">
              {result.correctCount} of {result.totalQuestions} correct
              {result.rank ? ` · #${result.rank} tonight` : ''}
            </p>
          </div>
          {result.leaderboard && result.leaderboard.length > 0 && (
            <div className="text-left">
              <p className="sp-eyebrow mb-2">Tonight&apos;s top scores</p>
              <ol className="grid gap-1.5">
                {result.leaderboard.map((p, i) => (
                  <li key={i} className="sp-row flex items-center gap-3 px-3 py-2">
                    <span className="sp-queue-n flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.displayName}</span>
                    <span className="sp-highlight shrink-0 font-extrabold tabular-nums">{p.score}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <button onClick={startGame} disabled={busy} className={primaryButton}>
            {busy ? 'Starting…' : 'Play again'}
          </button>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      ) : served ? (
        <div>
          <div className="sp-muted mb-2 flex items-center justify-between text-sm font-semibold tabular-nums">
            <span>Question {served.questionNumber} of {served.totalQuestions}</span>
            <span className="sp-highlight">{result?.score ?? served.score} pts</span>
            {stage === 'question' && <span>{Math.ceil(msLeft / 1000)}s</span>}
          </div>
          <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-white/12">
            <div
              className="sp-progress-fill h-full rounded-full transition-[width] duration-100 ease-linear motion-reduce:transition-none"
              style={{ width: `${stage === 'question' ? timerPct : 0}%` }}
            />
          </div>
          <h2 className="sp-title mb-5 text-xl font-bold leading-snug">{served.question.questionText}</h2>
          <Choices
            choices={served.question.choices}
            picked={picked}
            correctIndex={stage === 'feedback' && result ? result.correctIndex : null}
            onPick={(idx) => void submitAnswer(idx)}
          />
          {stage === 'feedback' && result && (
            <div className="sp-row mt-4 p-4 text-center">
              {result.correct ? (
                <p className="sp-soft text-xl font-extrabold">🎉 Correct! +{result.pointsAwarded}</p>
              ) : result.timedOut ? (
                <p className="sp-muted text-xl font-extrabold">⏰ Time&apos;s up!</p>
              ) : (
                <p className="sp-muted text-xl font-extrabold">❄️ Not quite</p>
              )}
              <button
                onClick={() => (result.finished ? setStage('done') : token && loadQuestion(token))}
                disabled={busy}
                className={`${primaryButton} mt-3`}
              >
                {result.finished ? 'See my score' : busy ? 'Loading…' : 'Next question →'}
              </button>
            </div>
          )}
          {error && (
            <div className="mt-4 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <button onClick={startOver} className="sp-muted mt-2 text-sm underline">Start over</button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
