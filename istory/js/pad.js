/* =====================================================================
   Scribe Pad at the desk: the manuscript rises above a fixed writing pad, nothing below it.
   Writes plain paragraphs into the open scene's working draft (or a loose page of writing).
   ===================================================================== */
(function (root) {
'use strict';
const Store = root.Store;
const $ = (id) => document.getElementById(id);
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const DEFAULTS = { auto: true, pause: 2.5, spause: 0.25, pencilOnly: true, rules: true, ink: 2.5, size: 21, engine: 'scribble' };

const P = {
  set: Object.assign({}, DEFAULTS, LS.get('istory2_pad', {})),
  box: LS.get('istory2_box', null),
  id: null, lines: [], readOnly: null, strokes: [], live: new Map(), queue: [], seq: 0, history: [], dirty: false, title: ''
};
let box, desk, docEl, wrap, cv, ctx, sb, textEl, dpr = 1, saveT = 0, fuseT = 0, composing = false, edEl = null;

/* ---------- layout ---------- */
function deskSize() { const r = desk.getBoundingClientRect(); return { W: r.width, H: r.height }; }
function defaultBox() {
  const { W, H } = deskSize();
  const w = Math.round(Math.min(W - 40, 1000)), h = Math.round(Math.min(Math.max(H * .34, 220), 400));
  return { x: Math.round((W - w) / 2), y: Math.round(H * .44), w, h };
}
function layout() {
  if (!desk || !desk.offsetParent) return;
  if (!P.box) P.box = defaultBox();
  const { W, H } = deskSize(), b = P.box;
  b.w = Math.max(280, Math.min(b.w, W - 16)); b.h = Math.max(170, Math.min(b.h, H - 60));
  b.x = Math.max(8, Math.min(b.x, W - b.w - 8)); b.y = Math.max(40, Math.min(b.y, H - b.h - 8));
  box.style.left = b.x + 'px'; box.style.top = b.y + 'px'; box.style.width = b.w + 'px'; box.style.height = b.h + 'px';
  if (P.readOnly || P.editing) { docEl.style.bottom = '0px'; }
  else docEl.style.bottom = Math.max(0, H - b.y + 12) + 'px';
  const col = docEl.firstElementChild; const wide = P.readOnly || P.editing;
  col.style.marginLeft = (wide ? Math.max(8, (W - Math.min(W - 40, 760)) / 2) : b.x) + 'px'; col.style.width = (wide ? Math.min(W - 40, 760) : b.w) + 'px';
  sizeCanvas();
}
function applySettings() {
  document.body.classList.toggle('no-rules', !P.set.rules);
  document.documentElement.style.setProperty('--doc-size', P.set.size + 'px');
  document.body.classList.toggle('mode-scribble', mode() === 'scribble');
  paintAuto();
}
const mode = () => P.set.engine === 'google' ? 'ink' : 'scribble';

/* ---------- ink ---------- */
function sizeCanvas() {
  dpr = root.devicePixelRatio || 1;
  const r = wrap.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  redraw();
}
const strokeColor = () => getComputedStyle(document.documentElement).getPropertyValue('--stroke').trim() || '#c9d6f7';
function seg(c, a, b, scale, base) { c.lineWidth = base * (0.55 + 0.9 * (b[3] ?? .5)) * scale; c.beginPath(); c.moveTo(a[0] * scale, a[1] * scale); c.lineTo(b[0] * scale, b[1] * scale); c.stroke(); }
function drawStroke(c, st, scale, base) { const p = st.pts; if (p.length === 1) { c.beginPath(); c.arc(p[0][0] * scale, p[0][1] * scale, base * .7 * scale, 0, 7); c.fill(); return; } for (let i = 1; i < p.length; i++) seg(c, p[i - 1], p[i], scale, base); }
function prep(c, color) { c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color; c.fillStyle = color; }
function redraw() { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); prep(ctx, strokeColor()); for (const st of P.strokes) drawStroke(ctx, st, dpr, P.set.ink); for (const st of P.live.values()) drawStroke(ctx, st, dpr, P.set.ink); }
const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.timeStamp || performance.now(), e.pressure || .5]; };
const accepts = (e) => !P.set.pencilOnly || e.pointerType === 'pen' || e.pointerType === 'mouse';
function stopFuse() { clearTimeout(fuseT); fuseT = 0; }
function runFuse(ms, fn) { stopFuse(); fuseT = setTimeout(fn, ms); }
function startFuse() { stopFuse(); if (!P.strokes.length || !P.set.auto) return; runFuse(P.set.pause * 1000, flushInk); }

/* ---------- Scribble: Apple's reader fills an always-empty text field ---------- */
function sbSchedule() { stopFuse(); if (!sb.value || !P.set.auto) return; runFuse(P.set.spause * 1000, sbFlush); }
function sbFlush() {
  stopFuse();
  if (composing) { sbSchedule(); return; }
  const v = sb.value; sb.value = '';
  if (!v || !P.id) return;
  v.split('\n').forEach((t, i) => {
    if (i > 0) P.queue.push({ kind: 'break', status: 'done' });
    t = t.replace(/\s+/g, ' ').trim();
    if (t) P.queue.push({ kind: 'ink', status: 'done', text: t });
  });
  drain();
}

/* ---------- writing → manuscript, in the order it was written ---------- */
function flushInk() {
  stopFuse();
  if (!P.strokes.length) return;
  const r = wrap.getBoundingClientRect();
  const item = { kind: 'ink', strokes: P.strokes, w: r.width, h: r.height, status: 'pending', text: '' };
  P.strokes = []; redraw(); P.queue.push(item); render(); recognize(item);
}
function sendNow() { if (mode() === 'scribble') sbFlush(); else flushInk(); }
function addBreak() { if (P.strokes.length) flushInk(); if (sb.value) sbFlush(); P.queue.push({ kind: 'break', status: 'done' }); drain(); }
async function recognize(item) {
  item.status = 'pending'; item.err = null; render(); status('…');
  try { item.text = await google(item); item.status = 'done'; } catch (e) { item.status = 'error'; item.err = e.userMessage || 'Couldn’t read this'; }
  drain();
}
function last() { if (!P.lines.length) P.lines.push(''); return P.lines.length - 1; }
function joinText(a, b) {
  if (!a) return b; if (!b) return a;
  if (/^[.,;:!?)\]”’'"…]/.test(b) && !/^["“]\s?\w/.test(b)) return a + b;
  if (/\w-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
  return a + ' ' + b;
}
function drain() {
  let changed = false;
  while (P.queue.length && P.queue[0].status === 'done') {
    const it = P.queue.shift();
    if (it.kind === 'break') { const i = last(); if (P.lines[i].trim()) { P.lines.push(''); P.history.push({ type: 'break', i: P.lines.length - 1 }); changed = true; } }
    else if (it.text) { const i = last(); P.history.push({ type: 'text', i, prev: P.lines[i] }); P.lines[i] = joinText(P.lines[i], it.text); changed = true; }
  }
  if (changed) touch();
  const errs = P.queue.some(q => q.status === 'error'), pend = P.queue.some(q => q.status === 'pending');
  status(errs ? 'Couldn’t read a line' : pend ? '…' : '', errs);
  render(changed);
}
function undo() {
  if (P.live.size) return;
  if (sb.value) { sb.value = sb.value.replace(/\s*\S+\s*$/, ''); sbSchedule(); return; }
  if (P.strokes.length) { P.strokes.pop(); redraw(); if (P.strokes.length) startFuse(); else stopFuse(); return; }
  const h = P.history.pop(); if (!h) return;
  if (h.type === 'text' && P.lines[h.i] != null) P.lines[h.i] = h.prev;
  if (h.type === 'break' && P.lines[h.i] != null && !P.lines[h.i].trim()) P.lines.splice(h.i, 1);
  touch(); render();
}

/* ---------- Google's reader (ink mode) ---------- */
function bbox(strokes) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const s of strokes) for (const p of s.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return { x0, y0, x1, y1 }; }
function inkImage(item, maxW) {
  const b = bbox(item.strokes), pad = 28, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2, k = Math.min(2, (maxW || 1600) / w);
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w * k)); c.height = Math.max(8, Math.round(h * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.translate((pad - b.x0) * k, (pad - b.y0) * k); prep(g, '#000');
  for (const s of item.strokes) drawStroke(g, s, k, Math.max(2.4, P.set.ink));
  return c;
}
function splitLines(strokes) {
  const rows = [];
  for (const it of strokes.map(s => ({ s, b: bbox([s]) })).sort((a, b) => a.b.y0 - b.b.y0)) {
    const cy = (it.b.y0 + it.b.y1) / 2; let row = rows.find(r => cy >= r.y0 - 6 && cy <= r.y1 + 6);
    if (!row) { row = { y0: it.b.y0, y1: it.b.y1, items: [] }; rows.push(row); }
    row.items.push(it); row.y0 = Math.min(row.y0, it.b.y0); row.y1 = Math.max(row.y1, it.b.y1);
  }
  return rows.sort((a, b) => a.y0 - b.y0).map(r => r.items.map(i => i.s).sort((a, b) => a.pts[0][2] - b.pts[0][2]));
}
const fail = (m) => Object.assign(new Error(m), { userMessage: m });
async function google(item) {
  let out = '', ctxText = P.lines.join(' ').slice(-200);
  for (const line of splitLines(item.strokes)) {
    const t0 = line[0].pts[0][2];
    const ink = line.map(s => [s.pts.map(p => Math.round(p[0])), s.pts.map(p => Math.round(p[1])), s.pts.map(p => Math.round(p[2] - t0))]);
    let res;
    try {
      const r = await fetch('https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: 'enable_pre_space', requests: [{ writing_guide: { writing_area_width: Math.round(item.w), writing_area_height: Math.round(item.h) }, ink, language: 'en', pre_context: ctxText.slice(-20) }] }) });
      res = await r.json();
    } catch (e) { throw fail('Offline'); }
    if (!res || res[0] !== 'SUCCESS') throw fail('Couldn’t read this');
    const cand = (res[1] && res[1][0] && res[1][0][1] && res[1][0][1][0]) || '';
    out = joinText(out, cand.trim()); ctxText = joinText(ctxText, cand.trim());
  }
  return out;
}

/* ---------- the manuscript ---------- */
function el(tag, cls, txt) { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
function render(scroll) {
  if (P.editing) { $('msHead').textContent = P.title || ''; return; }
  $('msHead').textContent = P.readOnly ? P.readOnly.label : P.title || '';
  textEl.textContent = '';
  const lines = P.readOnly ? P.readOnly.text.split('\n') : P.lines;
  let p = null, prevBlank = true;
  for (const l of lines) {
    const t = l.trim();
    const center = /^(#|\*\s?\*\s?\*|~~~|—\s?—\s?—)$/.test(t);
    p = el('p', !t ? 'blank' : center ? 'center' : prevBlank ? '' : 'ind', t);
    textEl.append(p); prevBlank = !t || center;
  }
  if (!P.readOnly) {
    if (!p) { p = el('p'); textEl.append(p); }
    if (lines.length && !lines[lines.length - 1].trim()) { p.className = ''; p.append(el('span', 'para', '¶')); }
    for (const it of P.queue) {
      if (it.kind === 'break') { p = el('p', 'ind'); p.append(el('span', 'para', '¶')); textEl.append(p); continue; }
      if (it.status === 'pending') { const c = el('span', 'chip'), d = el('span', 'dots'); d.append(el('i'), el('i'), el('i')); c.append(d); p.append(c); }
      else if (it.status === 'error') {
        const c = el('span', 'chip err'), img = new Image(); img.alt = ''; img.src = inkImage(it, 360).toDataURL('image/png');
        const retry = el('button', null, 'Retry'), drop = el('button', null, 'Discard');
        retry.onclick = () => recognize(it); drop.onclick = () => { P.queue.splice(P.queue.indexOf(it), 1); drain(); };
        c.append(img, retry, drop); p.append(c);
      } else if (it.text) p.append(document.createTextNode((p.textContent ? ' ' : '') + it.text));
    }
  }
  if (scroll !== false) requestAnimationFrame(() => { docEl.scrollTop = docEl.scrollHeight; });
  P.onRender && P.onRender();
}
function status(msg, warn) { const s = $('padStatus'); s.textContent = msg || ''; s.classList.toggle('warn', !!warn); }

/* ---------- saving into the draft ---------- */
function touch() { P.dirty = true; clearTimeout(saveT); saveT = setTimeout(save, 500); }
function save() {
  clearTimeout(saveT);
  if (!P.dirty || !P.id) return;
  P.dirty = false;
  const t = P.lines.join('\n').replace(/\s+$/, '');
  Store.setText(P.id, t, 'pad');
}
// put anything still in the pad into the manuscript (Scribble text, ink being read)
async function settle() {
  if (P.strokes.length) flushInk();
  if (sb.value) sbFlush();
  for (let i = 0; i < 60 && P.queue.some(q => q.status === 'pending'); i++) await new Promise(r => setTimeout(r, 150));
  P.queue = P.queue.filter(q => q.status === 'done'); drain(); save();
}
/* ---------- review and edit: the whole draft as plain text, keyboard or Scribble, pad put away ---------- */
function growEd() { const y = docEl.scrollTop; edEl.style.height = 'auto'; edEl.style.height = edEl.scrollHeight + 'px'; docEl.scrollTop = y; }
async function edit(on) {
  if (!P.id || on === !!P.editing) return;
  if (on) {
    await settle();
    P.editing = true; P.readOnly = null; box.hidden = true; sb.disabled = true;
    edEl = document.createElement('textarea'); edEl.id = 'editArea'; edEl.spellcheck = true; edEl.setAttribute('autocapitalize', 'sentences');
    edEl.value = P.lines.join('\n').replace(/\s+$/, '');
    edEl.addEventListener('input', () => { P.lines = edEl.value.split('\n'); P.history = []; touch(); growEd(); });
    textEl.hidden = true; textEl.after(edEl);
    docEl.classList.add('editing'); layout(); render(); growEd(); docEl.scrollTop = 0;
  } else {
    if (edEl) { P.lines = edEl.value.split('\n'); edEl.remove(); edEl = null; }
    P.editing = false; textEl.hidden = false; box.hidden = false; sb.disabled = false;
    docEl.classList.remove('editing'); save(); layout(); render();
  }
}
function busy() { return P.dirty || P.queue.length || sb.value || P.strokes.length || P.live.size; }

/* ---------- pad: move, resize, buttons ---------- */
function dragHandle(elm, onMove) {
  let start = null;
  elm.addEventListener('pointerdown', (e) => { e.preventDefault(); start = { x: e.clientX, y: e.clientY, b: { ...P.box }, id: e.pointerId }; try { elm.setPointerCapture(e.pointerId); } catch (_) {} elm.classList.add('on'); });
  elm.addEventListener('pointermove', (e) => { if (!start || e.pointerId !== start.id) return; onMove(start.b, e.clientX - start.x, e.clientY - start.y); layout(); });
  const end = (e) => { if (!start || e.pointerId !== start.id) return; start = null; elm.classList.remove('on'); LS.set('istory2_box', P.box); };
  elm.addEventListener('pointerup', end); elm.addEventListener('pointercancel', end);
}
function paintAuto() { const b = $('padAuto'), on = P.set.auto; b.textContent = on ? 'Auto' : 'Manual'; b.classList.toggle('auto', on); b.setAttribute('aria-pressed', String(on)); }
function setAuto(on) { P.set.auto = on; LS.set('istory2_pad', P.set); paintAuto(); if (on) { if (sb.value) sbSchedule(); else if (P.strokes.length) startFuse(); } else stopFuse(); }

const Pad = {
  init() {
    box = $('box'); desk = $('desk'); docEl = $('doc'); wrap = $('inkWrap'); cv = $('ink'); ctx = cv.getContext('2d'); sb = $('scribble'); textEl = $('text');
    cv.addEventListener('pointerdown', (e) => { if (!accepts(e) || !P.id) return; e.preventDefault(); stopFuse(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} P.live.set(e.pointerId, { pts: [pt(e)] }); redraw(); });
    cv.addEventListener('pointermove', (e) => {
      const st = P.live.get(e.pointerId); if (!st) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; prep(ctx, strokeColor());
      for (const ev of (evs.length ? evs : [e])) { const p = pt(ev), prev = st.pts[st.pts.length - 1]; if (Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) < .4) continue; st.pts.push(p); seg(ctx, prev, p, dpr, P.set.ink); }
    });
    const endStroke = (e) => { const st = P.live.get(e.pointerId); if (!st) return; P.live.delete(e.pointerId); P.strokes.push(st); if (!P.live.size) startFuse(); };
    cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);
    sb.addEventListener('input', sbSchedule);
    sb.addEventListener('compositionstart', () => { composing = true; stopFuse(); });
    sb.addEventListener('compositionend', () => { composing = false; sbSchedule(); });
    sb.addEventListener('touchstart', (e) => { if (!P.set.pencilOnly) return; const ts = Array.from(e.changedTouches); if (ts.length && ts.every(t => t.touchType !== 'stylus')) e.preventDefault(); }, { passive: false });
    dragHandle($('padMove'), (b, dx, dy) => { P.box.x = b.x + dx; P.box.y = b.y + dy; });
    dragHandle($('padSize'), (b, dx, dy) => { P.box.w = b.w + dx; const nh = Math.max(170, b.h - dy); P.box.y = b.y + (b.h - nh); P.box.h = nh; });
    $('padAuto').onclick = () => setAuto(!P.set.auto);
    $('padUndo').onclick = undo;
    $('padPara').onclick = () => { if (P.id) addBreak(); };
    $('padSend').onclick = sendNow;
    new ResizeObserver(() => layout()).observe(desk);
    applySettings();
  },
  // open a scene's draft or a loose page
  async open(id, title) {
    if (P.editing) await edit(false);
    if (P.id && P.id !== id) await settle();
    P.id = id; P.title = title || ''; P.readOnly = null;
    const t = Store.text(id);
    P.lines = t ? t.split('\n') : [];
    P.history = []; P.queue = []; P.dirty = false; P.strokes = []; sb.value = ''; redraw();
    box.hidden = false; sb.disabled = false;
    layout(); render();
  },
  close() { if (P.editing) edit(false); settle(); P.id = null; },
  edit, get editing() { return !!P.editing; },
  view(label, text) { if (P.editing) edit(false); P.readOnly = { label, text }; box.hidden = true; layout(); render(); docEl.scrollTop = 0; },
  unview() { P.readOnly = null; box.hidden = false; layout(); render(); },
  // the draft changed from outside (the Google Doc, another device): show it if nothing is waiting here
  external() {
    if (!P.id || busy() || P.editing) return;
    const t = Store.text(P.id); if (t === P.lines.join('\n').replace(/\s+$/, '')) return;
    P.lines = t ? t.split('\n') : []; P.history = []; render(false);
  },
  title(t) { P.title = t; $('msHead').textContent = t; },
  settle, layout, render, busy,
  get id() { return P.id; },
  get words() { return Store.words(P.lines.join(' ')); },
  settings: {
    get: () => ({ ...P.set }),
    set(patch) { Object.assign(P.set, patch); LS.set('istory2_pad', P.set); if (mode() !== 'scribble' && sb.value) sbFlush(); if (mode() === 'scribble' && P.strokes.length) flushInk(); applySettings(); layout(); },
    resetBox() { P.box = defaultBox(); LS.set('istory2_box', P.box); layout(); }
  },
  set onRender(f) { P.onRender = f; }
};
root.Pad = Pad;
})(window);
