-- Migration 025: remove the tables of the old shared (multiplayer) trivia game.
-- Trivia is now solo (trivia_games, migration 024); nothing reads or writes these three tables.
-- trivia_players and trivia_answers kept visitors' IP addresses, so they are dropped rather than
-- left behind. Their indexes go with them. trivia_questions (the question bank) is not touched.
-- Safe to run more than once.

DROP TABLE IF EXISTS trivia_answers;
DROP TABLE IF EXISTS trivia_players;
DROP TABLE IF EXISTS trivia_sessions;
