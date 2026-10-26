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

/** Response for POST /api/trivia/play/question - the current question, never its answer. */
export interface TriviaServedQuestion {
  questionNumber: number;        // 1-based
  totalQuestions: number;
  secondsPerQuestion: number;
  msRemaining: number;           // measured on the server, so the phone's clock doesn't matter
  score: number;
  question: TriviaQuestionPublic;
}

/** Response for POST /api/trivia/play/answer. */
export interface TriviaAnswerResult {
  correct: boolean;
  timedOut: boolean;
  correctIndex: number;
  pointsAwarded: number;
  score: number;
  correctCount: number;
  totalQuestions: number;
  finished: boolean;
  rank?: number;                          // tonight, last answer only
  leaderboard?: TriviaPlayerSummary[];    // tonight's top scores, last answer only
}

/** A finished game, for the admin Scores tab (GET /api/trivia/scores). */
export interface TriviaScoreRow {
  id: number;
  displayName: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  finishedAt: string;            // 'YYYY-MM-DD HH:MM:SS' UTC
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
