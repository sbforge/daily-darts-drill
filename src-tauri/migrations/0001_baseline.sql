-- Baseline: the schema D³ had before migrations existed. A new install creates everything; an existing
-- database already has it all, so this is only recorded as version 1.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pause_seconds INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  routine_id TEXT,
  routine_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'completed');

CREATE TABLE IF NOT EXISTS game_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  ended_early INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  values_json TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS darts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_result_id TEXT NOT NULL REFERENCES game_results(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  dart_index INTEGER NOT NULL,
  kind TEXT NOT NULL,
  number INTEGER,
  zone TEXT,
  score INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  radius REAL NOT NULL,
  bouncer INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  method TEXT);

CREATE INDEX IF NOT EXISTS idx_results_game ON game_results(game_id, started_at);
CREATE INDEX IF NOT EXISTS idx_darts_result ON darts(game_result_id);
