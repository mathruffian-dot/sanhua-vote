// 〈三花之戰〉投票 API（Cloudflare Worker + D1）
// 全網：POST /api/vote、GET /api/results
// 課堂：POST /api/room、GET /api/room/:code、POST /api/room/:code/vote、
//       GET /api/room/:code/teacher、POST /api/room/:code/advance、POST /api/room/:code/hide

const CHOICES = ['ju', 'mudan', 'lian'];
const ROUND2 = [...CHOICES, 'think']; // 第二輪多一個「我還在想」
const PHASES = ['r1', 'r1_result', 'r2', 'r2_result'];
const REASON_MAX = 60;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status, cors);
      console.error(e);
      return json({ error: 'server', message: '伺服器出錯，請稍後再試' }, 500, cors);
    }
  },
  // 每天自動清除：超過 ROOM_DAYS 天的課堂房間、遊戲（含學生作答）與舊的次數紀錄
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env).then(r => console.log('cleanup', JSON.stringify(r))));
  },
};

async function cleanup(env) {
  const cutoff = Date.now() - Number(env.ROOM_DAYS || 30) * 86400000;
  const hour = Math.floor(Date.now() / 3600000);
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM game_answers WHERE code IN (SELECT code FROM games WHERE created_at < ?1)').bind(cutoff),
    env.DB.prepare('DELETE FROM game_players WHERE code IN (SELECT code FROM games WHERE created_at < ?1)').bind(cutoff),
    env.DB.prepare('DELETE FROM games WHERE created_at < ?1').bind(cutoff),
    env.DB.prepare('DELETE FROM room_votes WHERE code IN (SELECT code FROM rooms WHERE created_at < ?1)').bind(cutoff),
    env.DB.prepare('DELETE FROM rooms WHERE created_at < ?1').bind(cutoff),
    env.DB.prepare('DELETE FROM rate WHERE hour < ?1').bind(hour - 48),
  ]);
  const n = res.map(r => r.meta.changes);
  return { games: n[2], gameRows: n[0] + n[1], rooms: n[4], roomVotes: n[3], rate: n[5] };
}

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return ok ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  } : { 'Vary': 'Origin' };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

async function body(req) {
  try { return await req.json(); } catch { throw new HttpError(400, 'bad_json', '資料格式錯誤'); }
}

function checkDevice(d) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(d)) throw new HttpError(400, 'bad_device', '裝置代號錯誤，請重新整理頁面');
  return d;
}
function checkChoice(c) {
  if (!CHOICES.includes(c)) throw new HttpError(400, 'bad_choice', '請選一朵花');
  return c;
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ipHash(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  const day = new Date().toISOString().slice(0, 10);
  return (await sha256(`${ip}|${day}|${env.IP_SALT || 'dev-salt'}`)).slice(0, 32);
}

// 每小時次數上限；超過丟 429
async function rateLimit(env, key, limit) {
  const hour = Math.floor(Date.now() / 3600000);
  const row = await env.DB.prepare(
    `INSERT INTO rate (key, hour, n) VALUES (?1, ?2, 1)
     ON CONFLICT(key, hour) DO UPDATE SET n = n + 1 RETURNING n`
  ).bind(key, hour).first();
  if (row && row.n > limit) throw new HttpError(429, 'rate', '這個網路投票次數太多，請一小時後再試');
}

async function verifyTurnstile(req, env, token) {
  if (!env.TURNSTILE_SECRET) return; // 沒設就不檢查（本機測試）
  if (!token) throw new HttpError(400, 'turnstile', '請等「確認你是真人」的小框打勾後再投');
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = req.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await r.json();
  if (!out.success) throw new HttpError(400, 'turnstile', '真人確認沒有通過，請重新整理再試一次');
}

async function publicCounts(env) {
  const { results } = await env.DB.prepare('SELECT choice, n FROM public_counts').all();
  const c = { ju: 0, mudan: 0, lian: 0 };
  for (const r of results) c[r.choice] = r.n;
  return c;
}

async function route(req, env) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '');
  const m = p.match(/^\/api\/room\/(\d{6})(?:\/(vote|teacher|advance|hide))?$/);

  if (p === '/api/vote' && req.method === 'POST') return publicVote(req, env);
  if (p === '/api/results' && req.method === 'GET') return publicResults(url, env);
  if (p === '/api/room' && req.method === 'POST') return createRoom(req, env);
  if (m) {
    const [, code, action] = m;
    if (!action && req.method === 'GET') return roomState(url, env, code);
    if (action === 'vote' && req.method === 'POST') return roomVote(req, env, code);
    if (action === 'teacher' && req.method === 'GET') return teacherView(url, env, code);
    if (action === 'advance' && req.method === 'POST') return advance(req, env, code);
    if (action === 'hide' && req.method === 'POST') return hideReason(req, env, code);
  }
  if (p === '/api/game' && req.method === 'POST') return createGame(req, env);
  const g = p.match(/^\/api\/game\/(\d{6})(?:\/(join|answer|teacher|advance))?$/);
  if (g) {
    const [, code, action] = g;
    if (!action && req.method === 'GET') return gameState(url, env, code);
    if (action === 'join' && req.method === 'POST') return gameJoin(req, env, code);
    if (action === 'answer' && req.method === 'POST') return gameAnswer(req, env, code);
    if (action === 'teacher' && req.method === 'GET') return gameTeacher(url, env, code);
    if (action === 'advance' && req.method === 'POST') return gameAdvance(req, env, code);
  }
  if (p === '' || p === '/api/health') return json({ ok: true });
  throw new HttpError(404, 'not_found', '找不到這個網址');
}

// ---------- 全網 ----------
async function publicVote(req, env) {
  const b = await body(req);
  const device = checkDevice(b.device);
  const choice = checkChoice(b.choice);

  const existing = await env.DB.prepare('SELECT choice FROM public_votes WHERE device = ?1').bind(device).first();
  if (existing) return json({ ok: true, already: true, choice: existing.choice, counts: await publicCounts(env) });

  await verifyTurnstile(req, env, b.token);
  const ih = await ipHash(req, env);
  await rateLimit(env, 'pub:' + ih, Number(env.PUBLIC_PER_HOUR || 120));

  const ins = await env.DB.prepare(
    'INSERT OR IGNORE INTO public_votes (device, choice, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4)'
  ).bind(device, choice, ih, Date.now()).run();
  if (ins.meta.changes === 1) {
    await env.DB.prepare('UPDATE public_counts SET n = n + 1 WHERE choice = ?1').bind(choice).run();
  }
  return json({ ok: true, already: false, choice, counts: await publicCounts(env) });
}

// 投過才給看票數
async function publicResults(url, env) {
  const device = checkDevice(url.searchParams.get('device'));
  const v = await env.DB.prepare('SELECT choice FROM public_votes WHERE device = ?1').bind(device).first();
  if (!v) return json({ voted: false });
  return json({ voted: true, choice: v.choice, counts: await publicCounts(env) });
}

// ---------- 課堂房間 ----------
function randomDigits(n) {
  const a = new Uint32Array(n); crypto.getRandomValues(a);
  return [...a].map(x => x % 10).join('');
}
function randomKey() {
  const a = new Uint8Array(18); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getRoom(env, code) {
  const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?1').bind(code).first();
  const days = Number(env.ROOM_DAYS || 30);
  if (!room || Date.now() - room.created_at > days * 86400000) throw new HttpError(404, 'no_room', '找不到這個房間（代號錯了，或房間已超過 30 天關閉）');
  return room;
}

async function requireTeacher(env, code, key) {
  const room = await getRoom(env, code);
  if (!key || (await sha256(key)) !== room.key_hash) throw new HttpError(403, 'not_teacher', '老師控制網址不正確');
  return room;
}

async function createRoom(req, env) {
  const b = await body(req);
  const label = String(b.label || '').trim().slice(0, 20);
  const ih = await ipHash(req, env);
  await rateLimit(env, 'room:' + ih, Number(env.ROOMS_PER_HOUR || 20));
  const key = randomKey();
  const keyHash = await sha256(key);
  for (let i = 0; i < 8; i++) {
    const code = randomDigits(6);
    const old = await env.DB.prepare('SELECT created_at FROM rooms WHERE code = ?1').bind(code).first();
    const days = Number(env.ROOM_DAYS || 30);
    if (old && Date.now() - old.created_at <= days * 86400000) continue;
    if (old) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM room_votes WHERE code = ?1').bind(code),
        env.DB.prepare('DELETE FROM rooms WHERE code = ?1').bind(code),
      ]);
    }
    await env.DB.prepare('INSERT INTO rooms (code, key_hash, phase, label, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(code, keyHash, 'r1', label, Date.now()).run();
    return json({ ok: true, code, key });
  }
  throw new HttpError(503, 'busy', '房間代號用完了，請再按一次');
}

async function roomCounts(env, code, round) {
  const { results } = await env.DB.prepare(
    'SELECT choice, COUNT(*) AS n FROM room_votes WHERE code = ?1 AND round = ?2 GROUP BY choice'
  ).bind(code, round).all();
  const c = { ju: 0, mudan: 0, lian: 0, think: 0 };
  for (const r of results) c[r.choice] = r.n;
  return c;
}

// 學生畫面輪詢：目前階段＋自己投過沒＋（公布時）票數
async function roomState(url, env, code) {
  const room = await getRoom(env, code);
  const device = url.searchParams.get('device');
  const out = { code, phase: room.phase, label: room.label, voted: { 1: null, 2: null } };
  if (device) {
    checkDevice(device);
    const { results } = await env.DB.prepare('SELECT round, choice FROM room_votes WHERE code = ?1 AND device = ?2')
      .bind(code, device).all();
    for (const r of results) out.voted[r.round] = r.choice;
  }
  if (room.phase !== 'r1') {
    out.class1 = await roomCounts(env, code, 1);
    out.global = room.global_r1 ? JSON.parse(room.global_r1) : await publicCounts(env);
  }
  if (room.phase === 'r2_result') out.class2 = await roomCounts(env, code, 2);
  return json(out);
}

async function roomVote(req, env, code) {
  const room = await getRoom(env, code);
  const b = await body(req);
  const device = checkDevice(b.device);
  const round = room.phase === 'r1' ? 1 : room.phase === 'r2' ? 2 : 0;
  const choice = round === 2 && b.choice === 'think' ? 'think' : checkChoice(b.choice);
  if (!round) throw new HttpError(409, 'closed', '這一輪已經截止，等老師開下一輪');
  if (Number(b.round) !== round) throw new HttpError(409, 'wrong_round', '老師那邊的步驟跟你不一樣，請重新整理');
  const reason = round === 2 ? String(b.reason || '').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX) : '';
  const ins = await env.DB.prepare(
    'INSERT OR IGNORE INTO room_votes (code, round, device, choice, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
  ).bind(code, round, device, choice, reason, Date.now()).run();
  return json({ ok: true, already: ins.meta.changes === 0, round });
}

// 老師畫面：人數、兩輪票數、改票流向、理由
async function teacherView(url, env, code) {
  const room = await requireTeacher(env, code, url.searchParams.get('key'));
  const { results: votes } = await env.DB.prepare(
    'SELECT rowid AS id, round, device, choice, reason, hidden, created_at FROM room_votes WHERE code = ?1 ORDER BY created_at'
  ).bind(code).all();
  const r1 = new Map(), r2 = new Map();
  for (const v of votes) (v.round === 1 ? r1 : r2).set(v.device, v);
  const cnt = m => { const c = { ju: 0, mudan: 0, lian: 0, think: 0 }; for (const v of m.values()) c[v.choice]++; return c; };
  const flow = {};
  for (const a of CHOICES) { flow[a] = {}; for (const b of ROUND2) flow[a][b] = 0; }
  const flowNew = { ju: 0, mudan: 0, lian: 0, think: 0 };
  for (const [d, v2] of r2) {
    const v1 = r1.get(d);
    if (v1) flow[v1.choice][v2.choice]++; else flowNew[v2.choice]++;
  }
  // 理由不帶裝置代號，只給序號
  const reasons = [...r2.values()].filter(v => v.reason).map(v => ({
    id: v.id, choice: v.choice,
    from: r1.get(v.device)?.choice || null, reason: v.reason, hidden: !!v.hidden,
  }));
  return json({
    code, phase: room.phase, label: room.label, created_at: room.created_at,
    n1: r1.size, n2: r2.size, class1: cnt(r1), class2: cnt(r2), flow, flowNew, reasons,
    global: room.global_r1 ? JSON.parse(room.global_r1) : await publicCounts(env),
    globalLive: await publicCounts(env),
  });
}

async function advance(req, env, code) {
  const b = await body(req);
  const room = await requireTeacher(env, code, b.key);
  const to = b.to;
  const i = PHASES.indexOf(room.phase), j = PHASES.indexOf(to);
  if (j < 0) throw new HttpError(400, 'bad_phase', '階段錯誤');
  if (j !== i + 1 && j !== i - 1) throw new HttpError(409, 'bad_step', '只能往下一步或退回上一步');
  if (to === 'r1_result' && !room.global_r1) {
    const g = await publicCounts(env);
    await env.DB.prepare('UPDATE rooms SET phase = ?1, global_r1 = ?2 WHERE code = ?3').bind(to, JSON.stringify(g), code).run();
  } else {
    await env.DB.prepare('UPDATE rooms SET phase = ?1 WHERE code = ?2').bind(to, code).run();
  }
  return json({ ok: true, phase: to });
}

// 老師把某則理由從投影畫面藏起來
async function hideReason(req, env, code) {
  const b = await body(req);
  await requireTeacher(env, code, b.key);
  await env.DB.prepare('UPDATE room_votes SET hidden = ?1 WHERE code = ?2 AND round = 2 AND rowid = ?3')
    .bind(b.hidden ? 1 : 0, code, Number(b.id)).run();
  return json({ ok: true });
}

// ---------- 遊戲「今天，你是哪朵花？」 ----------
// 題目內容在前端 docs/game/scenes.js；這裡只認題目代號
const GAME_IDS = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10'];
const SEAT_MAX = 60;

async function getGame(env, code) {
  const game = await env.DB.prepare('SELECT * FROM games WHERE code = ?1').bind(code).first();
  const days = Number(env.ROOM_DAYS || 30);
  if (!game || Date.now() - game.created_at > days * 86400000) throw new HttpError(404, 'no_game', '找不到這個遊戲（代號錯了，或已超過 30 天關閉）');
  game.deck = JSON.parse(game.deck);
  return game;
}

async function requireGameTeacher(env, code, key) {
  const game = await getGame(env, code);
  if (!key || (await sha256(key)) !== game.key_hash) throw new HttpError(403, 'not_teacher', '老師控制網址不正確');
  return game;
}

function cleanPadlet(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  let x;
  try { x = new URL(u); } catch { throw new HttpError(400, 'bad_padlet', 'Padlet 網址格式不對，要用 https:// 開頭'); }
  if (x.protocol !== 'https:') throw new HttpError(400, 'bad_padlet', 'Padlet 網址要用 https:// 開頭');
  return x.href.slice(0, 300);
}

async function createGame(req, env) {
  const b = await body(req);
  const label = String(b.label || '').trim().slice(0, 20);
  let deck = Array.isArray(b.deck) ? [...new Set(b.deck.filter(id => GAME_IDS.includes(id)))] : [];
  if (deck.length < 3) throw new HttpError(400, 'bad_deck', '至少要選 3 題');
  const padlet = cleanPadlet(b.padlet);
  const ih = await ipHash(req, env);
  await rateLimit(env, 'game:' + ih, Number(env.ROOMS_PER_HOUR || 20));
  const key = randomKey();
  const keyHash = await sha256(key);
  const days = Number(env.ROOM_DAYS || 30);
  for (let i = 0; i < 8; i++) {
    const code = randomDigits(6);
    const old = await env.DB.prepare('SELECT created_at FROM games WHERE code = ?1').bind(code).first();
    if (old && Date.now() - old.created_at <= days * 86400000) continue;
    if (old) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM game_answers WHERE code = ?1').bind(code),
        env.DB.prepare('DELETE FROM game_players WHERE code = ?1').bind(code),
        env.DB.prepare('DELETE FROM games WHERE code = ?1').bind(code),
      ]);
    }
    await env.DB.prepare('INSERT INTO games (code, key_hash, label, deck, padlet, auto_reveal, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(code, keyHash, label, JSON.stringify(deck), padlet, b.auto === false ? 0 : 1, Date.now()).run();
    return json({ ok: true, code, key });
  }
  throw new HttpError(503, 'busy', '遊戲代號用完了，請再按一次');
}

// 每一題三朵花各幾票、作答人數、多數是哪朵、猜中幾人
async function gameTallies(env, game) {
  const { results } = await env.DB.prepare('SELECT qi, device, choice, guess FROM game_answers WHERE code = ?1').bind(game.code).all();
  const per = game.deck.map(() => ({ ju: 0, mudan: 0, lian: 0 }));
  const answered = game.deck.map(() => 0);
  const guessOk = game.deck.map(() => 0);
  for (const r of results) if (per[r.qi]) { per[r.qi][r.choice]++; answered[r.qi]++; }
  const majority = per.map(c => {
    const m = Math.max(c.ju, c.mudan, c.lian);
    return m ? CHOICES.filter(f => c[f] === m) : [];
  });
  for (const r of results) if (majority[r.qi] && majority[r.qi].includes(r.guess)) guessOk[r.qi]++;
  const revealedUpTo = game.stage === 'end' ? game.deck.length - 1 : game.stage === 'reveal' ? game.qi : game.qi - 1;
  return { per, answered, guessOk, majority, revealedUpTo, rows: results };
}

async function playerCount(env, code) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM game_players WHERE code = ?1').bind(code).first();
  return r ? r.n : 0;
}

// 學生畫面輪詢（揭曉過的題目才給票數）
async function gameState(url, env, code) {
  const game = await getGame(env, code);
  const device = url.searchParams.get('device');
  const { results: players } = await env.DB.prepare('SELECT seat, device FROM game_players WHERE code = ?1').bind(code).all();
  const t = await gameTallies(env, game);
  const out = {
    code, label: game.label, stage: game.stage, qi: game.qi, deck: game.deck, auto: !!game.auto_reveal,
    joined: players.length, answered: game.qi >= 0 ? t.answered[game.qi] || 0 : 0,
    seats: players.map(p => p.seat).sort((a, b) => a - b),
    padlet: game.stage === 'end' ? game.padlet : '',
    results: t.per.map((c, i) => (i <= t.revealedUpTo ? c : null)),
    me: null,
  };
  if (device) {
    checkDevice(device);
    const p = players.find(r => r.device === device);
    if (p) {
      const answers = {};
      for (const r of t.rows) if (r.device === device) answers[r.qi] = { choice: r.choice, guess: r.guess };
      out.me = { seat: p.seat, answers };
    }
  }
  return json(out);
}

async function gameJoin(req, env, code) {
  const game = await getGame(env, code);
  const b = await body(req);
  const device = checkDevice(b.device);
  const seat = Number(b.seat);
  if (!Number.isInteger(seat) || seat < 1 || seat > SEAT_MAX) throw new HttpError(400, 'bad_seat', `座號要在 1 到 ${SEAT_MAX} 之間`);
  if (game.stage === 'end') throw new HttpError(409, 'ended', '這一局已經結束了');
  const taken = await env.DB.prepare('SELECT device FROM game_players WHERE code = ?1 AND seat = ?2').bind(code, seat).first();
  if (taken && taken.device !== device) throw new HttpError(409, 'seat_taken', `${seat} 號已經有人選了，請確認你的座號`);
  await env.DB.prepare(
    `INSERT INTO game_players (code, device, seat, joined_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(code, device) DO UPDATE SET seat = excluded.seat`
  ).bind(code, device, seat, Date.now()).run();
  return json({ ok: true, seat });
}

async function gameAnswer(req, env, code) {
  const game = await getGame(env, code);
  const b = await body(req);
  const device = checkDevice(b.device);
  const choice = checkChoice(b.choice);
  if (!CHOICES.includes(b.guess)) throw new HttpError(400, 'bad_guess', '還要猜一下全班最多人選哪個');
  if (game.stage !== 'q') throw new HttpError(409, 'closed', '這一題已經截止了');
  if (Number(b.qi) !== game.qi) throw new HttpError(409, 'wrong_q', '老師已經換題了，畫面會自動更新');
  const p = await env.DB.prepare('SELECT seat FROM game_players WHERE code = ?1 AND device = ?2').bind(code, device).first();
  if (!p) throw new HttpError(409, 'not_joined', '請先選座號加入');
  await env.DB.prepare(
    `INSERT INTO game_answers (code, qi, device, choice, guess, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(code, qi, device) DO UPDATE SET choice = excluded.choice, guess = excluded.guess`
  ).bind(code, game.qi, device, choice, b.guess, Date.now()).run();
  // 全部的人都答完 → 自動揭曉
  const done = await env.DB.prepare('SELECT COUNT(*) AS n FROM game_answers WHERE code = ?1 AND qi = ?2').bind(code, game.qi).first();
  const joined = await playerCount(env, code);
  let revealed = false;
  if (game.auto_reveal && joined > 0 && done.n >= joined) {
    const u = await env.DB.prepare("UPDATE games SET stage = 'reveal' WHERE code = ?1 AND stage = 'q' AND qi = ?2").bind(code, game.qi).run();
    revealed = u.meta.changes === 1;
  }
  return json({ ok: true, revealed });
}

// 老師畫面：誰還沒答（只給座號）、每題票數、猜中人數、全班花譜
async function gameTeacher(url, env, code) {
  const game = await requireGameTeacher(env, code, url.searchParams.get('key'));
  const { results: players } = await env.DB.prepare('SELECT seat, device FROM game_players WHERE code = ?1 ORDER BY seat').bind(code).all();
  const t = await gameTallies(env, game);
  const answeredNow = new Set(t.rows.filter(r => r.qi === game.qi).map(r => r.device));
  const totals = { ju: 0, mudan: 0, lian: 0 };
  for (const r of t.rows) totals[r.choice]++;
  return json({
    code, label: game.label, stage: game.stage, qi: game.qi, deck: game.deck, padlet: game.padlet, created_at: game.created_at, auto: !!game.auto_reveal,
    joined: players.length, seats: players.map(p => p.seat),
    waiting: game.stage === 'q' ? players.filter(p => !answeredNow.has(p.device)).map(p => p.seat) : [],
    answered: t.answered, per: t.per, guessOk: t.guessOk, majority: t.majority, totals,
  });
}

async function gameAdvance(req, env, code) {
  const b = await body(req);
  const game = await requireGameTeacher(env, code, b.key);
  if (b.action === 'auto') {
    await env.DB.prepare('UPDATE games SET auto_reveal = ?1 WHERE code = ?2').bind(b.value ? 1 : 0, code).run();
    // 打開自動時，若這題已經全員答完，直接揭曉
    if (b.value && game.stage === 'q') {
      const done = await env.DB.prepare('SELECT COUNT(*) AS n FROM game_answers WHERE code = ?1 AND qi = ?2').bind(code, game.qi).first();
      const joined = await playerCount(env, code);
      if (joined > 0 && done.n >= joined) await env.DB.prepare("UPDATE games SET stage = 'reveal' WHERE code = ?1 AND stage = 'q' AND qi = ?2").bind(code, game.qi).run();
    }
    return json({ ok: true, auto: !!b.value });
  }
  if (b.action === 'padlet') {
    const padlet = cleanPadlet(b.padlet);
    await env.DB.prepare('UPDATE games SET padlet = ?1 WHERE code = ?2').bind(padlet, code).run();
    return json({ ok: true, padlet });
  }
  const last = game.deck.length - 1;
  let stage = game.stage, qi = game.qi;
  if (b.action === 'start') {
    if (stage !== 'lobby') throw new HttpError(409, 'bad_step', '遊戲已經開始了');
    stage = 'q'; qi = 0;
  } else if (b.action === 'reveal') {
    if (stage !== 'q') throw new HttpError(409, 'bad_step', '現在不是作答時間');
    stage = 'reveal';
  } else if (b.action === 'reopen') {
    if (stage !== 'reveal') throw new HttpError(409, 'bad_step', '只有揭曉後才能重開這一題');
    stage = 'q';
  } else if (b.action === 'next') {
    if (stage !== 'reveal') throw new HttpError(409, 'bad_step', '先揭曉這一題');
    if (qi >= last) stage = 'end'; else { stage = 'q'; qi++; }
  } else if (b.action === 'end') {
    stage = 'end';
  } else {
    throw new HttpError(400, 'bad_action', '不認得的動作');
  }
  // 用舊狀態當條件：兩個分頁同時按也只走一步
  const u = await env.DB.prepare('UPDATE games SET stage = ?1, qi = ?2 WHERE code = ?3 AND stage = ?4 AND qi = ?5')
    .bind(stage, qi, code, game.stage, game.qi).run();
  if (u.meta.changes !== 1) throw new HttpError(409, 'raced', '畫面已經被更新，請再看一次');
  return json({ ok: true, stage, qi });
}
