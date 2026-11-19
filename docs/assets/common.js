// 三花投票共用：選項、裝置代號、API、長條圖
const CFG = window.SANHUA_CONFIG;
// 插畫（Codex 生圖）放在 assets/img/；用 common.js 自己的位置算路徑，子資料夾頁面也對得到
const IMG_BASE = new URL('img/', document.currentScript ? document.currentScript.src : location.href).href;
const imgOf = id => IMG_BASE + id + '.webp';

const FLOWERS = [
  { id: 'ju', flower: '菊', who: '陶淵明', tag: '隱逸', quote: '菊，花之隱逸者也', line: '不為五斗米折腰，回家種田，過自己的日子。' },
  { id: 'mudan', flower: '牡丹', who: '楊貴妃', tag: '富貴', quote: '牡丹，花之富貴者也', line: '花就是要美、要被看見；大家都愛，就是好。' },
  { id: 'lian', flower: '蓮', who: '周敦頤', tag: '君子', quote: '蓮，花之君子者也', line: '人在淤泥裡，也可以不被染。' },
];
const THINK = { id: 'think', flower: '想', who: '我還在想', tag: '', line: '聽了大家的想法，還沒決定。' };
const FLOWER = Object.fromEntries([...FLOWERS, THINK].map(f => [f.id, f]));
const nameOf = id => id === 'think' ? '還在想' : FLOWER[id].flower;

function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; }
}

// 匿名裝置代號：只存在這支手機的瀏覽器，不含任何個人資料
function deviceId() {
  let d = store('sanhua_device');
  if (!d || !/^[A-Za-z0-9_-]{16,64}$/.test(d)) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    d = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
    store('sanhua_device', d);
  }
  return d;
}

async function api(path, opts = {}) {
  let r;
  try {
    r = await fetch(CFG.API + path, {
      method: opts.body ? 'POST' : 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new Error('連不上投票伺服器，請檢查網路後再試');
  }
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(data.message || `伺服器回應 ${r.status}`); e.code = data.error; throw e; }
  return data;
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

// 三個選項按鈕；onPick(id)。trio＝寬螢幕排成三欄直式卡
function renderOptions(box, onPick, selected, withThink) {
  box.replaceChildren();
  box.classList.toggle('trio', !withThink);
  for (const f of withThink ? [...FLOWERS, THINK] : FLOWERS) {
    const pic = f.id === 'think'
      ? el('div', { class: 'pic' }, el('div', { class: 'seal' }, '？'))
      : el('div', { class: 'pic' },
          el('img', { src: imgOf(f.id), alt: `${f.who}與${f.flower}的插畫`, width: '480', height: '480', loading: 'lazy', decoding: 'async' }),
          el('span', { class: 'badge' }, f.flower));
    const b = el('button', { class: `opt c-${f.id}`, type: 'button', 'aria-pressed': String(selected === f.id) },
      pic,
      el('div', {},
        el('div', { class: 'who' }, f.who, el('span', {}, f.tag)),
        f.quote ? el('div', { class: 'quote' }, f.quote) : null,
        el('div', { class: 'line' }, `「${f.line}」`)),
      el('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'));
    b.addEventListener('click', () => {
      box.querySelectorAll('.opt').forEach(o => o.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onPick(f.id);
    });
    box.append(b);
  }
}

// 名字前的小標：花用頭像，「還在想」用色塊
const nameIcon = f => f.id === 'think' ? el('i') : el('img', { class: 'ava', src: imgOf(f.id), alt: '', width: '26', height: '26' });

const total = c => (c.ju || 0) + (c.mudan || 0) + (c.lian || 0) + (c.think || 0);
const pct = (n, t) => t ? Math.round((n / t) * 100) : 0;

// groups: [{ label, counts, cls }]；一朵花一列，每組一條
function renderBars(box, groups) {
  box.replaceChildren();
  const wrap = el('div', { class: 'bars' });
  const rows = groups.some(g => g.counts.think) ? [...FLOWERS, THINK] : FLOWERS;
  const label = f => f.id === 'think' ? f.who : `${f.flower}・${f.who}`;
  for (const f of rows) {
    const row = el('div', { class: `bar-row c-${f.id}` });
    if (groups.length === 1) {
      const g = groups[0], t = total(g.counts), n = g.counts[f.id] || 0;
      const fill = el('div', { class: 'fill' });
      row.append(
        el('div', { class: 'bar-head' },
          el('span', { class: 'name' }, nameIcon(f), label(f)),
          el('span', { class: 'num' }, `${pct(n, t)}%　${n.toLocaleString()} 票`)),
        el('div', { class: 'track' }, fill));
      requestAnimationFrame(() => { fill.style.width = pct(n, t) + '%'; });
    } else {
      row.append(el('div', { class: 'bar-head' }, el('span', { class: 'name' }, nameIcon(f), label(f))));
      for (const g of groups) {
        const t = total(g.counts), n = g.counts[f.id] || 0;
        const fill = el('div', { class: 'fill ' + (g.cls || '') });
        row.append(el('div', { class: 'sub' },
          el('span', {}, g.label), el('div', { class: 'track' }, fill),
          el('span', { class: 'num' }, `${pct(n, t)}%（${n}）`)));
        requestAnimationFrame(() => { fill.style.width = pct(n, t) + '%'; });
      }
    }
    wrap.append(row);
  }
  box.append(wrap);
}

function qrImg(text, cell = 8) {
  const q = qrcode(0, 'M');
  q.addData(text); q.make();
  const img = new Image();
  img.src = q.createDataURL(cell, 2);
  img.alt = 'QR code：' + text;
  return img;
}
