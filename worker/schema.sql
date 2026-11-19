-- 〈三花之戰〉投票：全網統計＋老師課堂房間
-- 全網票：一台裝置一票；票數另存計數表，讀結果不用掃全部票
CREATE TABLE IF NOT EXISTS public_votes (
  device     TEXT PRIMARY KEY,
  choice     TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS public_counts (
  choice TEXT PRIMARY KEY,
  n      INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO public_counts (choice, n) VALUES ('ju', 0), ('mudan', 0), ('lian', 0);

-- 同一網路每小時的次數（學校全班共用 IP，所以上限放寬）
CREATE TABLE IF NOT EXISTS rate (
  key  TEXT NOT NULL,
  hour INTEGER NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, hour)
);

-- 課堂房間：phase = r1 → r1_result → r2 → r2_result
CREATE TABLE IF NOT EXISTS rooms (
  code       TEXT PRIMARY KEY,
  key_hash   TEXT NOT NULL,
  phase      TEXT NOT NULL DEFAULT 'r1',
  label      TEXT NOT NULL DEFAULT '',
  global_r1  TEXT,               -- 公布第一輪那一刻的全網票數（JSON）
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_votes (
  code       TEXT NOT NULL,
  round      INTEGER NOT NULL,
  device     TEXT NOT NULL,
  choice     TEXT NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (code, round, device)
);

-- ===== 「今天，你是哪朵花？」情境投票遊戲 =====
-- stage: lobby（等人進來）→ q（作答中）→ reveal（揭曉）→ … → end（花箋）
CREATE TABLE IF NOT EXISTS games (
  code TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  deck TEXT NOT NULL,            -- JSON：這局抽到的題目代號，照順序
  qi INTEGER NOT NULL DEFAULT -1,
  stage TEXT NOT NULL DEFAULT 'lobby',
  padlet TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_players (
  code TEXT NOT NULL,
  device TEXT NOT NULL,
  seat INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (code, device)
);
CREATE UNIQUE INDEX IF NOT EXISTS game_players_seat ON game_players (code, seat);
CREATE TABLE IF NOT EXISTS game_answers (
  code TEXT NOT NULL,
  qi INTEGER NOT NULL,
  device TEXT NOT NULL,
  choice TEXT NOT NULL,
  guess TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (code, qi, device)
);
