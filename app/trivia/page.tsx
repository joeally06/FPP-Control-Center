'use client';

import { useEffect, useRef, useState } from 'react';
import type { TriviaBroadcastState, TriviaPersonalResult } from '@/types/trivia';
import { ANSWER_STYLES } from '@/lib/trivia-answer-style';

const TOKEN_KEY = 'triviaClientToken';
const NAME_KEY = 'triviaDisplayName';

function useCountdown(endsAt: string | null) {
  const [msRemaining, setMsRemaining] = useState(() =>
    endsAt ? Math.max(0, new Date(endsAt).getTime() - Date.now()) : 0
  );
  useEffect(() => {
    if (!endsAt) return;
    const target = new Date(endsAt).getTime();
    const id = setInterval(() => setMsRemaining(Math.max(0, target - Date.now())), 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return Math.ceil(msRemaining / 1000);
}

export default function TriviaPage() {
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [trivia, setTrivia] = useState<TriviaBroadcastState | null>(null);
  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState<TriviaPersonalResult | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [answeringChoice, setAnsweringChoice] = useState<number | null>(null);
  const [answerError, setAnswerError] = useState('');
  const lastQuestionId = useRef<number | null>(null);

  // Establish (or reuse) this device's anonymous identity
  useEffect(() => {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, token);
    }
    setClientToken(token);
    setNameInput(localStorage.getItem(NAME_KEY) || '');
  }, []);

  // Live broadcast feed
  useEffect(() => {
    let es: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/trivia/stream');
      es.onopen = () => setConnected(true);
      es.onmessage = (event) => {
        try {
          setTrivia(JSON.parse(event.data as string));
        } catch {
          // ignore malformed frames
        }
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      es?.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  // Refresh personal result whenever the session or phase changes
  useEffect(() => {
    if (!clientToken || !trivia?.sessionId) return;
    fetch(`/api/trivia/me?clientToken=${encodeURIComponent(clientToken)}`)
      .then((res) => res.json())
      .then(setMe)
      .catch(() => {});
  }, [clientToken, trivia?.sessionId, trivia?.phase]);

  // Reset the locked-in answer UI whenever a new question appears
  useEffect(() => {
    if (trivia?.question?.id !== lastQuestionId.current) {
      lastQuestionId.current = trivia?.question?.id ?? null;
      setAnsweringChoice(null);
      setAnswerError('');
    }
  }, [trivia?.question?.id]);

  const secondsLeft = useCountdown(trivia?.phase === 'question' ? trivia.questionEndsAt : null);

  async function handleJoin() {
    if (!clientToken || !nameInput.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch('/api/trivia/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientToken, displayName: nameInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error || 'Failed to join');
        return;
      }
      localStorage.setItem(NAME_KEY, nameInput.trim());
      if (data.state) setTrivia(data.state); // don't wait for the next SSE tick
      const meRes = await fetch(`/api/trivia/me?clientToken=${encodeURIComponent(clientToken)}`);
      setMe(await meRes.json());
    } catch {
      setJoinError('Failed to join. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  async function handleAnswer(choiceIndex: number) {
    if (!clientToken || !trivia?.question || answeringChoice !== null) return;
    setAnsweringChoice(choiceIndex);
    setAnswerError('');
    try {
      const res = await fetch('/api/trivia/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientToken, questionId: trivia.question.id, choiceIndex }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAnswerError(data.error || 'Failed to submit answer');
      }
    } catch {
      setAnswerError('Failed to submit answer.');
    }
  }

  const alreadyAnsweredThisQuestion =
    answeringChoice !== null ||
    (me?.lastAnswer && trivia?.question && me.lastAnswer.questionId === trivia.question.id);
  const pickedChoice =
    answeringChoice ?? (alreadyAnsweredThisQuestion ? me?.lastAnswer?.choiceIndex ?? null : null);

  return (
    <div className="min-h-screen bg-linear-to-br from-red-950 via-green-950 to-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {!trivia || !connected ? (
          <p className="text-white/60 text-center text-lg">Connecting…</p>
        ) : trivia.phase === 'none' ? (
          <div className="text-center">
            <p className="text-5xl mb-4">🎄</p>
            <h1 className="text-white text-2xl font-bold mb-2">No trivia right now</h1>
            <p className="text-white/60">Check back later to play!</p>
          </div>
        ) : !me?.joined ? (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <h1 className="text-white text-2xl font-bold mb-1 text-center">🎅 Christmas Trivia</h1>
            <p className="text-white/60 text-center mb-5">
              {trivia.phase === 'lobby' ? trivia.sessionName : `${trivia.sessionName} - a round is in progress, jump in!`}
            </p>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Your name"
              maxLength={30}
              className="w-full px-4 py-3 bg-white/10 border-2 border-white/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/60 mb-3"
              autoFocus
            />
            {joinError && <p className="text-red-300 text-sm mb-3">{joinError}</p>}
            <button
              onClick={handleJoin}
              disabled={joining || !nameInput.trim()}
              className="w-full px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all"
            >
              {joining ? 'Starting…' : '▶ Play Trivia'}
            </button>
          </div>
        ) : trivia.phase === 'lobby' ? (
          <div className="text-center">
            <p className="text-5xl mb-4">🙌</p>
            <h1 className="text-white text-2xl font-bold mb-2">You&apos;re in, {me.displayName}!</h1>
            <p className="text-white/60">Get ready…</p>
          </div>
        ) : trivia.phase === 'question' && trivia.question ? (
          <div>
            <div className="flex items-center justify-between text-white/70 text-sm font-semibold mb-4">
              <span>Q{trivia.questionNumber} / {trivia.totalQuestions}</span>
              <span className="tabular-nums">{secondsLeft}s</span>
            </div>
            <h2 className="text-white text-xl font-bold text-center mb-6">{trivia.question.questionText}</h2>
            {alreadyAnsweredThisQuestion ? (
              <div className="text-center bg-white/10 rounded-xl p-6">
                <p className="text-white text-lg font-bold">✅ Answer locked in!</p>
                <p className="text-white/60 mt-1">Watch the TV for the reveal…</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {trivia.question.choices.map((choice, idx) => {
                  const style = ANSWER_STYLES[idx % ANSWER_STYLES.length];
                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      className="rounded-xl p-4 flex flex-col items-center gap-2 shadow-lg active:scale-95 transition-transform"
                      style={{ backgroundColor: style.bg }}
                    >
                      <span className="text-3xl">{style.symbol}</span>
                      <span className="text-white font-semibold text-sm leading-tight">{choice}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {answerError && <p className="text-red-300 text-sm text-center mt-3">{answerError}</p>}
          </div>
        ) : trivia.phase === 'reveal' ? (
          <div className="text-center bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            {pickedChoice !== null && trivia.correctIndex !== null ? (
              pickedChoice === trivia.correctIndex ? (
                <>
                  <p className="text-5xl mb-3">🎉</p>
                  <p className="text-green-300 text-2xl font-bold">Correct!</p>
                </>
              ) : (
                <>
                  <p className="text-5xl mb-3">❄️</p>
                  <p className="text-red-300 text-2xl font-bold">Not quite</p>
                </>
              )
            ) : (
              <p className="text-white/70 text-xl">Time&apos;s up!</p>
            )}
            {me?.lastAnswer && me.lastAnswer.questionId === trivia.question?.id && (
              <p className="text-white/70 mt-2">+{me.lastAnswer.pointsAwarded} points</p>
            )}
            <div className="mt-5 pt-5 border-t border-white/20">
              <p className="text-white/60 text-sm">Your total score</p>
              <p className="text-white text-3xl font-black">{me?.totalScore ?? 0}</p>
              {me?.rank && <p className="text-white/60 mt-1">Rank #{me.rank}</p>}
            </div>
          </div>
        ) : trivia.phase === 'ended' ? (
          <div className="text-center bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <p className="text-5xl mb-3">🏆</p>
            <h1 className="text-white text-2xl font-bold mb-1">Game Over!</h1>
            <p className="text-white/60 mb-4">{trivia.sessionName}</p>
            <p className="text-white/60 text-sm">Your final score</p>
            <p className="text-white text-4xl font-black">{me?.totalScore ?? 0}</p>
            {me?.rank && <p className="text-white/60 mt-1">Finished #{me.rank}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
