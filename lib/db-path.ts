import path from 'path';

/** Where votes.db lives: VOTES_DB_PATH if set, otherwise ./votes.db. The one place that decides. */
export function getVotesDbPath(): string {
  return process.env.VOTES_DB_PATH || path.join(process.cwd(), 'votes.db');
}
