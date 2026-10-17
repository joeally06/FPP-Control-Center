'use client';

import { useState } from 'react';
import Link from 'next/link';

type ConfirmState =
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export default function ConfirmSantaLetter({ token }: { token: string }) {
  const [state, setState] = useState<ConfirmState>(
    token ? { kind: 'ready' } : { kind: 'error', message: 'This link is incomplete. Please open the whole link from the email.' }
  );

  const confirm = async () => {
    setState({ kind: 'sending' });
    try {
      const response = await fetch('/api/santa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      setState(response.ok
        ? { kind: 'done' }
        : { kind: 'error', message: data.error || 'Something went wrong. Please try again later.' });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the North Pole. Please check your connection and try again.' });
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-linear-to-b from-[#1a472a] to-[#0f2a19] p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border-4 border-red-600 bg-white text-center shadow-2xl">
        <div className="border-b-4 border-yellow-400 bg-linear-to-r from-red-600 to-green-600 p-6 text-white">
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'cursive' }}>🎅 Letter to Santa</h1>
        </div>

        <div className="space-y-5 p-8 text-gray-800">
          {state.kind === 'done' ? (
            <>
              <p className="text-xl font-semibold text-green-700">Your letter is on its way to the North Pole! ✨</p>
              <p>Santa will read it soon and his reply will arrive by email.</p>
            </>
          ) : state.kind === 'error' ? (
            <p className="rounded-lg border-2 border-red-500 bg-red-50 p-4 font-semibold text-red-800">{state.message}</p>
          ) : (
            <>
              <p className="text-lg">Press the button to send your letter on to Santa.</p>
              <button
                type="button"
                onClick={confirm}
                disabled={state.kind === 'sending'}
                className="rounded-full bg-linear-to-r from-red-600 to-green-600 px-8 py-4 text-xl font-bold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
              >
                {state.kind === 'sending' ? 'Sending to the North Pole…' : '🎁 Send my letter to Santa'}
              </button>
            </>
          )}

          <p className="pt-2 text-sm">
            <Link href="/jukebox" className="text-red-700 underline">Back to the light show</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
