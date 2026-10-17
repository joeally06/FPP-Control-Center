export type TriviaPhase = 'none' | 'lobby' | 'question' | 'reveal' | 'ended';

export interface TriviaChoiceTally {
  choiceIndex: number;
  count: number;
}

export interface TriviaPlayerSummary {
  displayName: string;
  score: number;
}

export interface TriviaQuestionPublic {
  id: number;
  category: string;
  questionText: string;
  choices: string[];
}

/** Broadcast over SSE to both the TV (/display) and every phone (/trivia). */
export interface TriviaBroadcastState {
  phase: TriviaPhase;
  sessionId: number | null;
  sessionName: string | null;
  questionNumber: number | null; // 1-based
  totalQuestions: number | null;
  question: TriviaQuestionPublic | null;
  correctIndex: number | null;   // present only once phase is 'reveal' or 'ended'
  questionEndsAt: string | null; // ISO timestamp, 'question' phase only
  secondsPerQuestion: number | null;
  playersJoined: number;
  answeredCount: number;         // answers received for the current question
  tally: TriviaChoiceTally[] | null;    // per-choice answer counts, 'reveal'/'ended' only
  leaderboard: TriviaPlayerSummary[];   // top scorers, 'reveal'/'ended' only
  joinUrl: string;               // absolute URL for the TV's QR code
}

/** Response for GET /api/trivia/me — a player's personal result, fetched on reveal. */
export interface TriviaPersonalResult {
  joined: boolean;
  displayName: string | null;
  totalScore: number;
  rank: number | null;
  lastAnswer: {
    questionId: number;
    choiceIndex: number;
    isCorrect: boolean;
    pointsAwarded: number;
  } | null;
}

export interface TriviaQuestionRow {
  id: number;
  category: string;
  questionText: string;
  choices: string[];
  correctIndex: number;
  points: number;
  createdAt: string;
  updatedAt: string;
}

export type TriviaSessionStatus = 'draft' | 'active' | 'ended';

export interface TriviaSessionRow {
  id: number;
  name: string;
  status: TriviaSessionStatus;
  questionIds: number[];
  currentIndex: number;
  phase: TriviaPhase;
  questionStartedAt: string | null;
  questionEndsAt: string | null;
  secondsPerQuestion: number;
  createdAt: string;
  updatedAt: string;
}
