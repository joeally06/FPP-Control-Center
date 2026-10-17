'use client';

import { useEffect, useState } from 'react';
import type { TriviaBroadcastState } from '@/types/trivia';
import { ANSWER_STYLES } from '@/lib/trivia-answer-style';
import QRCodeWidget from '@/components/display/QRCodeWidget';

interface Props {
  state: TriviaBroadcastState;
}

function useCountdown(endsAt: string | null, totalSeconds: number | null) {
  const [msRemaining, setMsRemaining] = useState(() =>
    endsAt ? Math.max(0, new Date(endsAt).getTime() - Date.now()) : 0
  );

  useEffect(() => {
    if (!endsAt) return;
    const target = new Date(endsAt).getTime();
    const id = setInterval(() => setMsRemaining(Math.max(0, target - Date.now())), 100);
    return () => clearInterval(id);
  }, [endsAt]);

  const totalMs = (totalSeconds ?? 20) * 1000;
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (msRemaining / totalMs) * 100)) : 0;
  return { secondsLeft: Math.ceil(msRemaining / 1000), pct };
}

function TriviaQuestionView({ state }: Props) {
  const { secondsLeft, pct } = useCountdown(state.questionEndsAt, state.secondsPerQuestion);
  const q = state.question;
  if (!q) return null;

  return (
    <div className="w-full h-full flex flex-col p-8 gap-6">
      <div className="flex items-center justify-between text-white/70 text-xl font-semibold">
        <span>Question {state.questionNumber} / {state.totalQuestions}</span>
        <span>{state.answeredCount} / {state.playersJoined} answered</span>
        <span className="tabular-nums">{secondsLeft}s</span>
      </div>

      <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-400 transition-[width] duration-150 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center text-center px-4">
        <h1 className="text-white font-black leading-tight" style={{ fontSize: 'clamp(1.75rem, 4.5vw, 4rem)' }}>
          {q.questionText}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4" style={{ minHeight: '30%' }}>
        {q.choices.map((choice, idx) => {
          const style = ANSWER_STYLES[idx % ANSWER_STYLES.length];
          return (
            <div
              key={idx}
              className="rounded-2xl flex items-center gap-4 px-6 shadow-2xl"
              style={{ backgroundColor: style.bg }}
            >
              <span className="text-4xl">{style.symbol}</span>
              <span className="text-white font-bold" style={{ fontSize: 'clamp(1.1rem, 2.2vw, 2rem)' }}>
                {choice}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TriviaRevealView({ state }: Props) {
  const q = state.question;
  const maxCount = Math.max(1, ...(state.tally?.map((t) => t.count) ?? [0]));

  return (
    <div className="w-full h-full flex flex-col p-8 gap-6">
      <div className="text-center text-white/70 text-xl font-semibold">
        Question {state.questionNumber} / {state.totalQuestions} — Answer Revealed
      </div>

      {q && (
        <div className="grid grid-cols-2 gap-4" style={{ minHeight: '35%' }}>
          {q.choices.map((choice, idx) => {
            const style = ANSWER_STYLES[idx % ANSWER_STYLES.length];
            const isCorrect = idx === state.correctIndex;
            const count = state.tally?.find((t) => t.choiceIndex === idx)?.count ?? 0;
            return (
              <div
                key={idx}
                className="rounded-2xl flex items-center gap-4 px-6 shadow-2xl relative overflow-hidden"
                style={{ backgroundColor: style.bg, outline: isCorrect ? '6px solid white' : 'none' }}
              >
                <span className="text-4xl">{style.symbol}</span>
                <span className="text-white font-bold flex-1" style={{ fontSize: 'clamp(1.1rem, 2.2vw, 2rem)' }}>
                  {choice}
                </span>
                <span className="text-white/90 font-black text-2xl">{count}</span>
                {isCorrect && <span className="absolute top-2 right-2 text-3xl">✅</span>}
                <div
                  className="absolute bottom-0 left-0 h-1.5 bg-white/70"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1">
        <p className="text-white/70 text-2xl font-semibold text-center mb-3">Leaderboard</p>
        <div className="flex flex-col gap-2 max-w-xl mx-auto">
          {state.leaderboard.map((p, i) => (
            <div key={i} className="flex items-center justify-between bg-white/10 rounded-xl px-5 py-2.5">
              <span className="text-white font-bold text-lg">{i + 1}. {p.displayName}</span>
              <span className="text-emerald-300 font-black text-lg">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TriviaEndedView({ state }: Props) {
  return (
    <div className="w-full h-full flex items-center justify-center gap-12 px-10">
      <div className="text-center flex-1">
        <p className="text-white/60 text-2xl mb-2">🎉 Final Results 🎉</p>
        <h1 className="text-white font-black mb-6" style={{ fontSize: 'clamp(1.75rem, 4vw, 3.5rem)' }}>
          {state.sessionName}
        </h1>
        <div className="flex flex-col gap-3 max-w-xl mx-auto">
          {state.leaderboard.map((p, i) => (
            <div
              key={i}
              className={`flex items-center justify-between rounded-xl px-6 py-3 ${i === 0 ? 'bg-yellow-400/90' : 'bg-white/10'}`}
            >
              <span className={`font-bold text-2xl ${i === 0 ? 'text-black' : 'text-white'}`}>
                {i === 0 ? '🏆' : `${i + 1}.`} {p.displayName}
              </span>
              <span className={`font-black text-2xl ${i === 0 ? 'text-black' : 'text-emerald-300'}`}>{p.score}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0">
        <QRCodeWidget url={state.joinUrl} label="Scan to play a new round!" size={200} />
      </div>
    </div>
  );
}

export default function TriviaDisplay({ state }: Props) {
  return (
    <div className="fixed inset-0 z-[9999] bg-linear-to-br from-red-950 via-green-950 to-slate-950 overflow-hidden">
      {state.phase === 'question' && <TriviaQuestionView state={state} />}
      {state.phase === 'reveal' && <TriviaRevealView state={state} />}
      {state.phase === 'ended' && <TriviaEndedView state={state} />}
    </div>
  );
}
