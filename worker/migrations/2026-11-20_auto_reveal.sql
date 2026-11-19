-- 遊戲加「全員答完自動揭曉」開關（1＝自動、0＝老師按揭曉）；只要跑一次
ALTER TABLE games ADD COLUMN auto_reveal INTEGER NOT NULL DEFAULT 1;
