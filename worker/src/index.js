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
};

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
