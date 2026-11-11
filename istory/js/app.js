/* =====================================================================
   iStory screens: the timeline (Story), Loose Pages, and an open scene, loose page or beat chain.
   ===================================================================== */
(() => {
'use strict';
const Store = window.Store, Google = window.Google, Pad = window.Pad;
const BUILD = 'Nov 10 · r3a';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kfmt = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
const LINK_LABEL = { but: 'but', therefore: 'therefore', and: 'and then' };
const NEXT_LINK = { but: 'therefore', therefore: 'and', and: 'but', '': 'but' };
const ICON = {
  doc: '<svg class="i" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  more: '<svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  notes: '<svg class="i" viewBox="0 0 24 24"><path d="M5 5h14v10l-4 4H5z"/><path d="M15 19v-4h4M8 9h8M8 12h5"/></svg>',
  mic: '<svg class="i" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>',
  stop: '<svg class="i" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>'
};

/* =====================================================================
   where you are
   A scene has two steps: Beats (work the chain out) and Pages (the page and the pad, nothing else).
   In Pages the beats wait off the left edge: swipe in, or tap the small bar, to peek at them.
   ===================================================================== */
let view = 'story', item = null;   // item: { kind: 'scene' | 'writing' | 'beats', id, from, step: 'beats' | 'pages' }
let peek = false;
function go(v) {
  if (view === 'item') leaveItem();
  view = v; item = v === 'item' ? item : null;
  $('story').hidden = v !== 'story'; $('loose').hidden = v !== 'loose'; $('item').hidden = v !== 'item';
  if (v !== 'item') Store.setUi({ view: v, last: null });
  paintTop(); render();
}
// leaving what's open: whatever is still in the pad goes into the draft; a loose page left completely empty isn't kept
function leaveItem() {
  const was = item; setPeek(false); Player.stop();
  Pad.pause().then(() => { if (was && !(view === 'item' && item && item.id === was.id)) tidy(was); });
}
function tidy(it) {
  if (it.kind === 'scene') return;
  const l = Store.looseItem(it.id); if (!l || l.title || l.memo || Pad.held(l.id)) return;
  if (l.beats.some(b => b.text.trim() || b.notes.trim() || b.dialogue.length)) return;
  if ((Store.data.ms[l.id] && Store.data.ms[l.id].text || '').trim()) return;
  Store.deleteLoose(l.id);
}
// a scene opens on the step it was last left on; one never opened starts on its beats until it has some
function stepFor(kind, id) {
  if (kind === 'beats') return 'beats';
  if (kind === 'writing') return 'pages';
  const was = (Store.ui().steps || {})[id];
  if (was === 'beats' || was === 'pages') return was;
  const s = Store.scene(id);
  return s.beats.some(b => b.text) || Store.text(id).trim() ? 'pages' : 'beats';
}
function openItem(kind, id, from, step) {
  const exists = kind === 'scene' ? Store.scene(id) : Store.looseItem(id);
  if (!exists) { go(from || 'story'); return; }
  const origin = from || (view === 'loose' ? 'loose' : view === 'item' && item ? item.from : 'story');
  if (view === 'item' && item && item.id !== id) leaveItem();
  view = 'item'; item = { kind, id, from: origin, step: kind === 'scene' && (step === 'beats' || step === 'pages') ? step : stepFor(kind, id) };
  peek = false;
  $('story').hidden = true; $('loose').hidden = true; $('item').hidden = false; $('viewing').hidden = true;
  Store.touchRecent(kind === 'scene' ? 'scene' : 'loose', id); Store.setUi({ lastFrom: item.from });
  layoutItem();
  if (kind !== 'beats') Pad.open(id, headLabel());
  renderChain(); paintTop();
}
function headLabel() {
  if (!item) return '';
  if (item.kind === 'scene') { const s = Store.scene(item.id); return s ? Store.sceneLabel(s) : ''; }
  const l = Store.looseItem(item.id); return l ? l.title || '' : '';
}
function layoutItem() {
  if (!item) return;
  const pages = item.step === 'pages', hasBeats = item.kind !== 'writing';
  document.body.classList.toggle('step-beats', !pages);
  document.body.classList.toggle('step-pages', pages);
  document.body.classList.toggle('peek', pages && peek);
  $('beatPanel').hidden = !hasBeats; $('beatPanel').inert = pages && !peek;
  $('peekTab').hidden = !(pages && hasBeats);
  $('desk').hidden = !pages;
  if (pages) Pad.layout();
}
function leaveView() { if (!$('viewing').hidden) { $('viewing').hidden = true; Pad.unview(); } }
function setStep(step) {
  if (!item || item.kind !== 'scene' || item.step === step) return;
  if (item.step === 'pages') { leaveView(); Pad.pause(); }
  item.step = step; peek = false;
  // remembered for this scene (the 300 most recent)
  const st = { ...(Store.ui().steps || {}) }; delete st[item.id]; st[item.id] = step;
  const keys = Object.keys(st); for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete st[k];
  Store.setUi({ steps: st });
  layoutItem(); renderChain(); paintTop();
}
$('stepSeg').onclick = (e) => { const b = e.target.closest('[data-step]'); if (b) setStep(b.dataset.step); };

/* ---------- peeking at the beats from the page ---------- */
function setPeek(on) {
  on = !!(on && item && item.kind === 'scene' && item.step === 'pages');
  if (peek === on) return;
  peek = on; document.body.classList.toggle('peek', on); $('beatPanel').inert = !!(item && item.step === 'pages' && !on);
  if (on) { renderChain(); const cur = $('chain').querySelector('.beat.cur'); if (cur) cur.scrollIntoView({ block: 'center' }); }
  else if (document.activeElement && document.activeElement.closest('#beatPanel')) document.activeElement.blur();
}
$('peekTab').onclick = () => setPeek(true);
// a finger sliding in from the left edge opens them; sliding them back, touching the page, or writing puts them away
(() => {
  let sx = 0, sy = 0, mode = '';
  $('item').addEventListener('touchstart', (e) => {
    mode = '';
    if (e.touches.length !== 1 || !item || item.kind !== 'scene' || item.step !== 'pages') return;
    const t = e.touches[0]; if (t.touchType === 'stylus') return;
    if (!peek && t.clientX <= 28) mode = 'open'; else if (peek && e.target.closest('#beatPanel')) mode = 'close'; else return;
    sx = t.clientX; sy = t.clientY;
  }, { passive: true });
  $('item').addEventListener('touchmove', (e) => {
    if (!mode) return;
    const t = e.touches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
    if (mode === 'open' && dx > 44 && dy < 70) { mode = ''; setPeek(true); }
    else if (mode === 'close' && dx < -60 && dy < 50) { mode = ''; setPeek(false); }
  }, { passive: true });
})();
document.addEventListener('pointerdown', (e) => { if (peek && !e.target.closest('#beatPanel, #layer')) setPeek(false); }, true);
Pad.onWrite = () => setPeek(false);

/* ---------- previous / next scene, in timeline order (loose scenes step through Loose Pages): swipe the top bar ---------- */
function sceneRun(s) {
  if (!s.seqId) return Store.looseFor().filter(x => x.kind === 'scene').map(x => x.item);
  const out = [], bid = Store.where(s.seqId).book.id;
  for (const p of Store.partsOf(bid)) for (const a of Store.actsOf(p.id)) for (const q of Store.seqsOf(a.id)) out.push(...Store.scenesOf(q.id));
  return out;
}
function neighbours(s) { const run = sceneRun(s), i = run.indexOf(s); return { prev: run[i - 1], next: run[i + 1] }; }
function hop(dir) {
  const s = item && item.kind === 'scene' && Store.scene(item.id); if (!s) return;
  const t = neighbours(s)[dir]; if (!t) return;
  leaveView();
  openItem('scene', t.id, item.from, item.step);   // stay on the step you're on: beats to beats, pages to pages
}
(() => {
  const el = $('top'); let sx = 0, sy = 0, on = false;
  el.addEventListener('touchstart', (e) => { on = e.touches.length === 1; if (on) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!on || !item || item.kind !== 'scene') return; on = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 2) hop(dx < 0 ? 'next' : 'prev');
  }, { passive: true });
})();
addEventListener('resize', () => { if (view !== 'item') return; layoutItem(); if (item.step === 'pages' && !Pad.editing && !Pad.fixing && $('viewing').hidden) Pad.render(); });   // turning the iPad keeps the end of the draft in view

function paintTop() {
  const inItem = view === 'item';
  $('tabs').hidden = inItem; $('back').hidden = !inItem; $('titleBtn').hidden = !inItem;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-current', String(t.dataset.go === view)));
  $('gapsBtn').hidden = view !== 'story';
  const k = inItem && item.kind;
  const s = k === 'scene' ? Store.scene(item.id) : null, l = k && k !== 'scene' ? Store.looseItem(item.id) : null;
  $('stepSeg').hidden = !s;
  if (inItem) {
    $('backLbl').textContent = item.from === 'loose' ? 'Loose' : 'Story';
    const t = s ? s.title : l ? l.title : '';
    $('titleTxt').textContent = t || (s ? 'Untitled scene' : k === 'beats' ? 'Untitled beats' : 'Untitled page');
    $('titleBtn').classList.toggle('empty', !t);
    document.querySelectorAll('#stepSeg [data-step]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.step === item.step)));
  }
  const ms = inItem ? itemMemos() : [];
  $('memoBtn').hidden = !ms.length;
  if (ms.length) { Player.prime(ms); const on = ms.some(m => m.id === Player.playing); $('memoBtn').innerHTML = (on ? ICON.stop : ICON.play) + `<span>${on ? 'Stop' : ms.length > 1 ? ms.length + ' voice' : clock(ms[0].dur)}</span>`; $('memoBtn').setAttribute('aria-label', on ? 'Stop the recording' : 'Play the recording'); }
  $('calChip').hidden = !calOnly || view !== 'story';
  const n = Store.looseFor().length; $('looseN').textContent = n ? String(n) : '';
}
document.querySelectorAll('.tab').forEach(t => t.onclick = () => go(t.dataset.go));
$('back').onclick = () => go(item ? item.from : 'story');
$('titleBtn').onclick = () => {
  if (!item) return;
  if (item.kind === 'scene') { const s = Store.scene(item.id); if (s) sceneSheet(s); }
  else { const l = Store.looseItem(item.id); if (l) looseSheet(l); }
};

/* =====================================================================
   layer: menus, sheets and the rare question
   ===================================================================== */
const layer = $('layer');
let onClose = null;
function closeLayer() { const f = onClose; onClose = null; layer.innerHTML = ''; f && f(); }
function scrim(close = true) { const d = document.createElement('div'); d.id = 'scrim'; if (close) d.onclick = closeLayer; layer.append(d); }
// items: { label, small, checked, act, danger, confirm, head, note, hr, bad }
function menu(anchor, items) {
  closeLayer(); scrim();
  const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu');
  for (const it of items) {
    if (!it) continue;
    if (it.hr) { m.append(document.createElement('hr')); continue; }
    if (it.head) { const h = document.createElement('div'); h.className = 'head'; h.textContent = it.head; m.append(h); continue; }
    if (it.note) { const h = document.createElement('div'); h.className = 'note' + (it.bad ? ' bad' : ''); h.textContent = it.note; m.append(h); continue; }
    if (it.ver) { const h = document.createElement('div'); h.className = 'ver'; h.textContent = it.ver; m.append(h); continue; }
    if (it.info) { const h = document.createElement('div'); h.className = 'info'; h.innerHTML = it.info; m.append(h); continue; }
    const b = document.createElement('button'); b.setAttribute('role', it.checked !== undefined ? 'menuitemradio' : 'menuitem');
    if (it.checked !== undefined) b.setAttribute('aria-checked', String(!!it.checked));
    b.innerHTML = esc(it.label) + (it.small ? `<small>${esc(it.small)}</small>` : '');
    b.onclick = () => {
      if (it.confirm && !b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = it.confirm; return; }
      closeLayer(); it.act && it.act();
    };
    m.append(b);
  }
  layer.append(m);
  const r = anchor.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = Math.min(W - mw - 10, Math.max(10, r.right - mw)), y = r.bottom + 6;
  if (y + mh > H - 10) y = Math.max(10, r.top - mh - 6);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  return m;
}
function sheet(title, cls, build, opts = {}) {
  closeLayer(); scrim(opts.scrimClose !== false);
  const s = document.createElement('div'); s.className = 'sheet ' + (cls || 'center');
  s.innerHTML = `<div class="sh-head"><h2>${esc(title)}</h2>${opts.extra || ''}<button class="btn quiet" data-close>${esc(opts.done || 'Done')}</button></div><div class="sh-body"></div>`;
  s.querySelector('[data-close]').onclick = closeLayer;
  layer.append(s);
  build(s.querySelector('.sh-body'), s);
  onClose = opts.onClose || null;
  return s;
}
function ask(title, body, buttons) {
  return new Promise((res) => {
    closeLayer(); scrim(false);
    const s = document.createElement('div'); s.className = 'sheet center ask';
    s.innerHTML = `<div class="sh-head"><h2>${esc(title)}</h2></div><div class="sh-body"><p>${esc(body)}</p><div class="row2">${buttons.map((b, i) => `<button class="btn ${i === 0 ? 'primary' : 'quiet'}" data-i="${i}">${esc(b)}</button>`).join('')}</div></div>`;
    s.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { layer.innerHTML = ''; onClose = null; res(+b.dataset.i); } };
    layer.append(s);
  });
}
Google.ask = ask;
function promptSheet(title, value, placeholder) {
  return new Promise((res) => {
    let done = false;
    sheet(title, 'center', (body) => {
      body.innerHTML = `<div class="field"><input id="pIn" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}" autocomplete="off"></div><div class="row2" style="display:flex;justify-content:flex-end;gap:10px"><button class="btn primary" id="pOk">Save</button></div>`;
      const inp = body.querySelector('#pIn');
      const ok = () => { done = true; const v = inp.value; closeLayer(); res(v); };
      body.querySelector('#pOk').onclick = ok;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
    }, { done: 'Cancel', onClose: () => { if (!done) res(null); } });
  });
}
function banner(msg) { if (!msg) { $('banner').hidden = true; return; } $('bannerMsg').textContent = msg; $('banner').hidden = false; }
$('bannerX').onclick = () => banner('');


/* =====================================================================
   press and drag: a tap opens, a press-and-hold lifts (then drag, or let go for its menu)
   ===================================================================== */
function pressDrag(root, sel, h) {
  let st = null, raf = 0;
  const reset = () => { if (!st) return; clearTimeout(st.timer); cancelAnimationFrame(raf); if (st.ghost) st.ghost.remove(); st.el.classList.remove('lifted'); h.end && h.end(st); st = null; };
  root.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || st) return;
    const el = e.target.closest(sel); if (!el || !root.contains(el)) return;
    if (h.handle ? !e.target.closest(h.handle) : e.target.closest('input, textarea, button, [contenteditable]')) return;
    st = { el, id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), type: e.pointerType, drag: false, moved: false, lx: e.clientX, ly: e.clientY };
    if (e.pointerType !== 'mouse') st.timer = setTimeout(() => { if (st && !st.moved) begin(); }, 380);
  });
  function begin() {
    st.drag = true; st.bx = st.lx; st.by = st.ly;
    const r = st.el.getBoundingClientRect(), g = st.el.cloneNode(true);
    g.classList.add('ghost'); g.style.width = r.width + 'px'; g.style.height = r.height + 'px'; g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
    st.dx = st.lx - r.left; st.dy = st.ly - r.top; st.ghost = g; document.body.append(g);
    st.el.classList.add('lifted');
    try { root.setPointerCapture(st.id); } catch (e) {}
    h.start && h.start(st);
    const scroller = h.scroller && h.scroller();
    const loop = () => {
      if (!st || !st.drag) return;
      if (scroller) {
        const r2 = scroller.getBoundingClientRect(), m = 60;
        if (st.lx < r2.left + m) scroller.scrollLeft -= 14; else if (st.lx > r2.right - m) scroller.scrollLeft += 14;
        if (st.ly < r2.top + m) scroller.scrollTop -= 12; else if (st.ly > r2.bottom - m) scroller.scrollTop += 12;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  root.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    st.lx = e.clientX; st.ly = e.clientY;
    if (!st.drag) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { st.moved = true; if (st.type === 'mouse') begin(); else { clearTimeout(st.timer); st = null; } }
      return;
    }
    e.preventDefault();
    if (Math.hypot(e.clientX - st.bx, e.clientY - st.by) > 6) st.travelled = true;
    st.ghost.style.left = (e.clientX - st.dx) + 'px'; st.ghost.style.top = (e.clientY - st.dy) + 'px';
    h.move && h.move(e.clientX, e.clientY, st);
  });
  root.addEventListener('pointerup', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    if (s.drag) { if (s.travelled) { try { h.drop && h.drop(s.lx, s.ly, s); } finally { reset(); } } else { reset(); h.menu && h.menu(s.el); } }
    else { clearTimeout(s.timer); st = null; if (!s.moved && Date.now() - s.t < 380) h.tap && h.tap(s.el, e); }
  });
  root.addEventListener('pointercancel', (e) => { if (st && e.pointerId === st.id) reset(); });
  root.addEventListener('contextmenu', (e) => { const el = e.target.closest(sel); if (el && h.menu && !e.target.closest('input, textarea')) { e.preventDefault(); h.menu(el); } });
  document.addEventListener('touchmove', (e) => { if (st && st.drag) e.preventDefault(); }, { passive: false });
}

/* =====================================================================
   Story: the timeline
   ===================================================================== */
// how far along a scene is, as one mark: 0 nothing yet · 1 beats · 2 pages begun · 3 written (every beat written, or past the rough stage)
function progress(s) {
  const bs = s.beats.filter(b => b.text), w = Store.wordsOf(s.id);
  if (w && ((bs.length && bs.every(b => b.done)) || s.stage !== 'rough')) return 3;
  if (w) return 2;
  return bs.length ? 1 : 0;
}
const PROGRESS = ['Nothing yet', 'Beats', 'Pages begun', 'Written'];
const mark = (n) => `<svg class="pm p${n}" viewBox="0 0 16 16" aria-label="${PROGRESS[n]}"><circle class="ring" cx="8" cy="8" r="6.2"/>${n ? `<circle class="pie" cx="8" cy="8" r="3.1" stroke-dasharray="${(n / 3 * 19.48).toFixed(2)} 19.48" transform="rotate(-90 8 8)"/>` : ''}</svg>`;
// the year filter: { month } or { holiday }; scenes that don't match fade
let calOnly = null;
const calHit = (s) => !calOnly || (calOnly.holiday ? s.holiday === calOnly.holiday : s.month === calOnly.month);
function sceneCard(s, N, light) {
  const bs = s.beats, w = Store.wordsOf(s.id), weak = bs.slice(1).filter(b => b.link === 'and').length;
  let g = '', gt = '';
  if (!bs.length) { g = 'g-nobeats'; gt = 'no beats'; } else if (!w) { g = 'g-nopages'; gt = 'no pages'; } else if (weak) { g = 'g-weak'; gt = weak + ' and then'; }
  return `<div class="card ${light ? 'light' : ''} ${g} ${calHit(s) ? '' : 'dim'}" data-scene="${s.id}"><span class="gap">${gt}</span>
    <span class="no">${light ? '<span class="kind">Scene</span>' : (N.scene.get(s.id) || '')}</span>
    <div class="t ${s.title ? '' : 'empty'}">${esc(s.title || 'Untitled')}</div>${mark(progress(s))}</div>`;
}
function looseCard(x) {
  if (x.kind === 'scene') return sceneCard(x.item, null, true);
  const l = x.item, dim = calOnly ? 'dim' : '';
  if (l.kind === 'beats') { const f = l.beats.find(b => b.text); return `<div class="card light ${dim}" data-loose="${l.id}"><span class="no"><span class="kind">Beats</span></span><div class="t ${l.title || f ? '' : 'empty'}">${esc(l.title || (f && f.text) || 'Untitled')}</div></div>`; }
  const first = Store.text(l.id).split('\n').find(z => z.trim()) || '';
  return `<div class="card light ${dim}" data-loose="${l.id}"><span class="no"><span class="kind">Writing</span></span><div class="t ${l.title || first ? '' : 'empty'}">${esc(l.title || first || 'Untitled')}</div></div>`;
}
// what a press on a card shows above its actions: everything the card itself leaves out
function sceneInfo(s) {
  const no = Store.sceneNo(s), bs = s.beats.filter(b => b.text), done = bs.filter(b => b.done).length, w = Store.wordsOf(s.id);
  const who = [s.pov, s.location].filter(Boolean).join(' · '), when = Store.whenText(s);
  const facts = [bs.length ? `${bs.length} beat${bs.length === 1 ? '' : 's'}${done ? ', ' + done + ' written' : ''}` : 'no beats', w ? kfmt(w) + ' words' : 'no pages', Store.stageLabel(s.stage), (Store.STATUSES.find(x => x[0] === s.status) || [])[1]].filter(Boolean).join(' · ');
  return `<div class="it">${no ? 'Scene ' + no + ' · ' : ''}${esc(s.title || 'Untitled')}</div>${s.summary ? `<p>${esc(s.summary)}</p>` : ''}
    ${who ? `<div class="im">${esc(who)}</div>` : ''}${when ? `<div class="im">${esc(when)}</div>` : ''}
    ${(s.labels || []).length ? `<div class="chips">${s.labels.map(l => `<span class="chip2">${esc(l)}</span>`).join('')}</div>` : ''}
    <div class="im dimmer">${esc(facts)}${(s.memos || []).length ? ' · voice' : ''}</div>`;
}
function renderBoard() {
  const bid = Store.bookId, N = Store.numbers(bid);
  let h = '';
  for (const p of Store.partsOf(bid)) {
    h += `<div class="part"><div class="part-head"><button class="lbl-btn" data-part="${p.id}">Part ${N.part.get(p.id)}${p.name ? ' · <b>' + esc(p.name) + '</b>' : ''}</button></div>`;
    for (const a of Store.actsOf(p.id)) {
      h += `<div class="row"><div class="act-lbl"><span class="no">Act ${N.act.get(a.id)}</span><button class="nm ${a.name ? '' : 'empty'}" data-act="${a.id}">${esc(a.name || 'Untitled')}</button></div><div class="track">`;
      for (const q of Store.seqsOf(a.id)) {
        const sc = Store.scenesOf(q.id);
        h += `<div class="seq" data-seq="${q.id}"><div class="seq-head"><span class="seq-no">${N.seq.get(q.id)}</span><button class="seq-name ${q.name ? '' : 'empty'}" data-seq-name="${q.id}">${esc(q.name || 'Untitled')}</button>
          <span class="seq-tools"><button class="tb" data-seq-menu="${q.id}">${ICON.more}</button></span></div>
          <button class="seq-idea ${q.idea ? '' : 'empty'}" data-seq-idea="${q.id}">${esc(q.idea || 'idea')}</button>
          <div class="cards" data-cards="${q.id}">${sc.map(s => sceneCard(s, N)).join('')}<button class="add-card" data-add-scene="${q.id}" aria-label="New scene">+</button></div></div>`;
      }
      h += `<button class="add-seq" data-add-seq="${a.id}">+ Sequence</button></div></div>`;
    }
    h += `<button class="add-act" data-add-act="${p.id}">+ Act</button></div>`;
  }
  h += `<button class="add-part" data-add-part="1">+ Part</button>`;
  const loose = Store.looseFor(bid);
  if (loose.length) h += `<div class="loose-row" data-loose-row="1"><div class="act-lbl"><span class="no">Loose</span></div><div class="track">${loose.map(looseCard).join('')}</div></div>`;
  const b = $('board'), x = b.scrollLeft, y = b.scrollTop;
  b.innerHTML = h; b.scrollLeft = x; b.scrollTop = y;
  paintCal();
}
function paintCal() {
  const c = $('calChip'); c.hidden = !calOnly || view !== 'story'; if (!calOnly) return;
  const h = calOnly.holiday ? Store.holiday(calOnly.holiday) : null;
  if (calOnly.holiday && !h) { calOnly = null; c.hidden = true; return; }
  const n = Store.data.scenes.filter(s => s.bookId === Store.bookId && calHit(s)).length;
  c.querySelector('span').textContent = (h ? h.name : 'Month ' + calOnly.month) + ' · ' + n;
}
function setCal(f) { calOnly = f; renderSync(); if (f) { const hit = document.querySelector('#board .card[data-scene]:not(.dim)'); if (hit) hit.scrollIntoView({ block: 'center', inline: 'center' }); } }
$('calChip').onclick = () => setCal(null);
// edit a label in place
function inline(el, value, commit, opts = {}) {
  const inp = document.createElement(opts.multi ? 'textarea' : 'input');
  inp.value = value || ''; inp.placeholder = opts.placeholder || '';
  const cs = getComputedStyle(el);
  inp.style.cssText = `font:${cs.font};color:var(--ink);background:var(--card);border:0;border-radius:8px;padding:4px 8px;width:${Math.max(160, el.offsetWidth + 40)}px;max-width:520px;resize:none;-webkit-user-select:text;user-select:text`;
  if (opts.multi) inp.rows = 2;
  el.replaceWith(inp); inp.focus(); inp.select && inp.select();
  let done = false; editing = inp;
  const fin = (save) => { if (done) return; done = true; editing = null; if (save) commit(inp.value.trim()); render(); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fin(true); } else if (e.key === 'Escape') fin(false); });
  inp.addEventListener('blur', () => fin(true));
}
$('board').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.addSeq) { const q = Store.addSeq(d.addSeq, ''); renderSync(); const el = document.querySelector(`[data-seq-name="${q.id}"]`); if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); inline(el, '', v => { q.name = v; Store.changed({ structure: true, seq: q.id }); }, { placeholder: 'Sequence' }); } }
  else if (d.addAct) { const a = Store.addAct(d.addAct, ''); renderSync(); const el = document.querySelector(`[data-act="${a.id}"]`); if (el) inline(el, '', v => Store.rename('act', a.id, v), { placeholder: 'Act' }); }
  else if (d.addPart) { const p = Store.addPart(Store.bookId, ''); Store.addAct(p.id, '', true); Store.changed({ structure: true }); render(); }
  else if (d.addScene) {
    const s = Store.addScene({ title: '' }, d.addScene); renderSync();
    const el = document.querySelector(`[data-scene="${s.id}"] .t`);
    if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); inline(el, '', v => { s.title = v; Store.touchScene(s, { title: true }); }, { placeholder: 'Scene' }); }
  }
  else if (d.seqName) { const q = Store.seq(d.seqName); inline(t, q.name, v => { q.name = v; Store.changed({ structure: true, seq: q.id }); }, { placeholder: 'Sequence' }); }
  else if (d.seqIdea) { const q = Store.seq(d.seqIdea); inline(t, q.idea, v => { q.idea = v; Store.changed({ structure: true, seq: q.id }); }, { placeholder: 'The idea in a line', multi: true }); }
  else if (d.act) { const a = Store.act(d.act); inline(t, a.name, v => Store.rename('act', a.id, v), { placeholder: 'Act' }); }
  else if (d.part) {
    const p = Store.part(d.part), empty = !Store.actsOf(p.id).some(a => Store.seqsOf(a.id).length);
    menu(t, [{ label: 'Rename', act: async () => { const v = await promptSheet('Part', p.name, 'Name'); if (v !== null) Store.rename('part', p.id, v); render(); } },
      empty && Store.partsOf(Store.bookId).length > 1 ? { label: 'Delete', confirm: 'Tap again to delete', act: () => { for (const a of Store.actsOf(p.id)) Store.removeEmpty('act', a.id); Store.removeEmpty('part', p.id); render(); } } : null]);
  }
  else if (d.seqDoc) { const q = Store.seq(d.seqDoc); const u = Google.Docs.url(q); if (u) window.open(u, '_blank'); }
  else if (d.seqMenu) seqMenu(t, Store.seq(d.seqMenu));
});
$('board').addEventListener('contextmenu', (e) => {
  const a = e.target.closest('[data-act]');
  if (a) { e.preventDefault(); const act = Store.act(a.dataset.act); if (!Store.seqsOf(act.id).length) menu(a, [{ label: 'Delete act', confirm: 'Tap again to delete', act: () => { Store.removeEmpty('act', act.id); render(); } }]); }
});
function seqMenu(anchor, q) {
  const url = Google.Docs.url(q), empty = !Store.scenesOf(q.id).length;
  menu(anchor, [
    url ? { label: 'Open Google Doc', act: () => window.open(url, '_blank') } : Google.signedIn ? { label: 'Make its Google Doc', act: () => Google.Docs.make(q).then(render).catch(e => banner('Couldn’t make the Doc: ' + e.message)) } : null,
    { label: 'Rename', act: () => { const el = document.querySelector(`[data-seq-name="${q.id}"]`); if (el) inline(el, q.name, v => { q.name = v; Store.changed({ structure: true, seq: q.id }); }); } },
    { label: q.idea ? 'Edit the idea' : 'Add an idea', act: () => { const el = document.querySelector(`[data-seq-idea="${q.id}"]`); if (el) inline(el, q.idea, v => { q.idea = v; Store.changed({ structure: true, seq: q.id }); }, { multi: true }); } },
    { label: 'Move to another act…', act: () => moveSeq(q) },
    empty ? { label: 'Delete sequence', confirm: 'Tap again to delete', act: () => { Store.removeEmpty('seq', q.id); render(); } } : null
  ]);
}
async function moveSeq(q) {
  const t = await pick({ acts: true, title: 'Move to' }); if (!t || !t.act) return;
  const i = Store.data.seqs.indexOf(q); Store.data.seqs.splice(i, 1);
  q.actId = t.act; const last = Store.data.seqs.map(x => x.actId).lastIndexOf(t.act);
  Store.data.seqs.splice(last >= 0 ? last + 1 : Store.data.seqs.length, 0, q);
  for (const s of Store.scenesOf(q.id)) s.bookId = Store.where(q.id).book.id;
  Store.changed({ structure: true, seq: q.id }); render();
}

// drag on the board: scenes move between sequences; loose pieces get filed
let dropAt = null;
function clearDrop() { document.querySelectorAll('.ins').forEach(x => x.remove()); document.querySelectorAll('.target, .seq.drop').forEach(x => x.classList.remove('target', 'drop')); dropAt = null; }
pressDrag($('board'), '.card', {
  scroller: () => $('board'),
  tap: (el) => { if (el.dataset.scene) openItem('scene', el.dataset.scene, 'story'); else { const l = Store.looseItem(el.dataset.loose); if (l) openItem(l.kind, l.id, 'story'); } },
  menu: (el) => cardMenu(el),
  move: (x, y, st) => {
    clearDrop();
    const under = document.elementFromPoint(x, y); if (!under) return;
    const isScene = !!st.el.dataset.scene;
    const card = under.closest('.card[data-scene]');
    if (!isScene && card && card.closest('.seq')) { card.classList.add('target'); dropAt = { scene: card.dataset.scene }; return; }
    const seq = under.closest('.seq');
    if (seq) {
      const cardsEl = seq.querySelector('.cards'), list = [...cardsEl.querySelectorAll('.card')].filter(c => c !== st.el);
      let idx = list.length;
      for (let i = 0; i < list.length; i++) { const r = list[i].getBoundingClientRect(); if (x < r.left + r.width / 2) { idx = i; break; } }
      const ref = list[idx] || cardsEl.querySelector('.add-card'), rr = ref.getBoundingClientRect(), cr = cardsEl.getBoundingClientRect();
      const bar = document.createElement('div'); bar.className = 'ins'; bar.style.left = (rr.left - cr.left - 7) + 'px'; cardsEl.append(bar);
      dropAt = { seq: seq.dataset.seq, index: idx }; return;
    }
    if (isScene && under.closest('[data-loose-row]')) dropAt = { loose: true };
  },
  drop: (x, y, st) => {
    const d = dropAt; clearDrop(); if (!d) return;
    const sid = st.el.dataset.scene, lid = st.el.dataset.loose;
    if (sid) { if (d.seq) Store.moveScene(sid, d.seq, d.index); else if (d.loose) Store.moveScene(sid, null); }
    else if (lid) {
      const l = Store.looseItem(lid); if (!l) return;
      if (d.scene) Store.fileInto(lid, d.scene);
      else if (d.seq) { if (l.kind === 'beats') Store.chainToScene(lid, d.seq, d.index); else Store.writingToScene(lid, d.seq, d.index); }
    }
    render();
  },
  end: () => clearDrop()
});
function cardMenu(el) {
  if (el.dataset.scene) {
    const s = Store.scene(el.dataset.scene); if (!s) return;
    menu(el, [{ info: sceneInfo(s) }, { hr: true }, { label: 'Open', act: () => openItem('scene', s.id, view) },
      { label: 'Details…', act: () => sceneSheet(s) },
      s.seqId ? { label: 'Move to Loose', act: () => { Store.moveScene(s.id, null); render(); } } : { label: 'File in…', act: () => fileIn('scene', s.id) },
      { label: 'Delete scene', confirm: 'Tap again to delete', act: () => deleteScene(s) }]);
  } else {
    const l = Store.looseItem(el.dataset.loose); if (!l) return;
    menu(el, [{ label: 'Open', act: () => openItem(l.kind, l.id, view) }, { label: 'File in…', act: () => fileIn(l.kind, l.id) },
      { label: 'Delete', confirm: 'Tap again to delete', act: async () => { await Google.Copies.keep('before deleting a loose page'); Store.deleteLoose(l.id); render(); } }]);
  }
}
async function deleteScene(s) {
  await Google.Copies.keep('before deleting “' + (s.title || 'Untitled') + '”');
  Store.deleteScene(s.id);
  if (view === 'item' && item && item.id === s.id) go(item.from); else render();
}
$('gapsBtn').onclick = () => { const on = !document.body.classList.contains('gaps'); document.body.classList.toggle('gaps', on); $('gapsBtn').setAttribute('aria-pressed', String(on)); Store.setUi({ gaps: on }); };

/* =====================================================================
   Loose Pages
   ===================================================================== */
function renderLoose() {
  const list = Store.looseFor();
  $('looseGrid').innerHTML = list.length ? list.map(x => {
    if (x.kind === 'scene') {
      const s = x.item;
      return `<div class="lcard" data-kind="scene" data-id="${s.id}"><div class="kind scene">Scene${(s.memos || []).length ? ' · voice' : ''}</div><div class="t">${esc(s.title || 'Untitled')}</div><div class="p">${esc(s.summary || '')}</div></div>`;
    }
    const l = x.item;
    if (l.kind === 'beats') return `<div class="lcard" data-kind="beats" data-id="${l.id}"><div class="kind beats">Beats${l.memo ? ' · voice' : ''}</div>${l.title ? `<div class="t">${esc(l.title)}</div>` : ''}<div class="p beats">${l.beats.filter(b => b.text).map((b, i) => '<div>' + (i && b.link ? `<span class="lk ${b.link}">${LINK_LABEL[b.link]}</span>` : '') + esc(b.text) + '</div>').join('')}</div></div>`;
    const t = Store.text(l.id);
    return `<div class="lcard" data-kind="writing" data-id="${l.id}"><div class="kind">Writing${l.memo ? ' · voice' : ''}</div>${l.title ? `<div class="t">${esc(l.title)}</div>` : ''}<div class="p">${esc(t.slice(0, 400))}</div></div>`;
  }).join('') : '<div class="empty-note">Nothing loose.</div>';
}
document.querySelector('.loose-add').onclick = (e) => {
  const k = e.target.closest('[data-new]'); if (!k) return;
  if (k.dataset.new === 'scene') { const s = Store.addScene({ title: '' }, null); openItem('scene', s.id, 'loose'); }
  else { const l = Store.addLoose(k.dataset.new); openItem(l.kind, l.id, 'loose'); }
};
pressDrag($('looseGrid'), '.lcard', {
  scroller: () => $('loose'),
  tap: (el) => openItem(el.dataset.kind, el.dataset.id, 'loose'),
  menu: (el) => {
    const kind = el.dataset.kind, id = el.dataset.id;
    menu(el, [{ label: 'Open', act: () => openItem(kind, id, 'loose') }, { label: 'File in…', act: () => fileIn(kind, id) },
      { label: 'Delete', confirm: 'Tap again to delete', act: async () => { await Google.Copies.keep('before deleting a loose page'); if (kind === 'scene') Store.deleteScene(id); else Store.deleteLoose(id); render(); } }]);
  },
  move: (x, y, st) => {
    document.querySelectorAll('.lcard.target').forEach(c => c.classList.remove('target'));
    const c = document.elementFromPoint(x, y); const card = c && c.closest('.lcard');
    st.over = card && card !== st.el ? card : null;
    if (st.over) st.over.style.outline = '';
  },
  drop: (x, y, st) => {
    if (!st.over) return;
    const ids = [...document.querySelectorAll('#looseGrid .lcard')].map(c => c.dataset.id), from = ids.indexOf(st.el.dataset.id);
    ids.splice(from, 1);
    const r = st.over.getBoundingClientRect(); let to = ids.indexOf(st.over.dataset.id); if (x > r.left + r.width / 2) to++;
    ids.splice(to, 0, st.el.dataset.id);
    Store.setLooseOrder(ids); render();
  }
});

/* ---------- File in…: choose where a loose piece (or a scene) goes ---------- */
function pick(opts) {
  return new Promise((res) => {
    let chosen = null;
    sheet(opts.title || 'File in', 'center', (body) => {
      const bid = Store.bookId, N = Store.numbers(bid);
      let h = '<div class="pick-list">';
      if (opts.loose) h += `<button class="pick seqpick" data-loose="1">Loose Pages</button>`;
      for (const p of Store.partsOf(bid)) for (const a of Store.actsOf(p.id)) {
        if (opts.acts) { h += `<button class="pick" data-act="${a.id}"><span class="no">${N.act.get(a.id)}</span>${esc(Store.actLabel(a))}</button>`; continue; }
        const seqs = Store.seqsOf(a.id); if (!seqs.length) continue;
        h += `<div class="pick-grp">${esc(Store.actLabel(a))}</div>`;
        for (const q of seqs) {
          if (opts.seqs) h += `<button class="pick seqpick" data-seq="${q.id}">${opts.scenes ? 'New scene in ' : ''}${esc(Store.seqLabel(q))}</button>`;
          if (opts.scenes) for (const s of Store.scenesOf(q.id)) if (s.id !== opts.except) h += `<button class="pick" data-scene="${s.id}"><span class="no">${N.scene.get(s.id)}</span>${esc(s.title || 'Untitled')}</button>`;
        }
      }
      body.innerHTML = h + '</div>';
      body.onclick = (e) => { const b = e.target.closest('.pick'); if (!b) return; chosen = { ...b.dataset }; closeLayer(); };
    }, { done: 'Cancel', onClose: () => res(chosen) });
  });
}
async function fileIn(kind, id) {
  const t = await pick(kind === 'scene' ? { seqs: true, title: 'Move to' } : { seqs: true, scenes: true, title: 'File in' });
  if (!t) return;
  // filed from its own screen, you follow it to the scene it went into (the loose piece itself is gone by then)
  const wasOpen = view === 'item' && item && item.id === id;
  let opened = null;
  if (kind === 'scene') { if (t.seq) Store.moveScene(id, t.seq); }
  else if (t.scene) { Store.fileInto(id, t.scene); opened = t.scene; }
  else if (t.seq) { const s = kind === 'beats' ? Store.chainToScene(id, t.seq) : Store.writingToScene(id, t.seq); opened = s && s.id; }
  if (wasOpen && opened) openItem('scene', opened, 'story');
  else { paintTop(); render(); }
}
async function makeScene(id) {
  const t = await pick({ seqs: true, loose: true, title: 'Make a scene in' }); if (!t) return;
  const s = Store.chainToScene(id, t.seq || null); if (s) openItem('scene', s.id, t.seq ? 'story' : 'loose');
}

/* =====================================================================
   the beat chain (a scene's, or a loose chain)
   ===================================================================== */
function chain() { if (!item) return null; if (item.kind === 'scene') { const s = Store.scene(item.id); return s && s.beats; } const l = Store.looseItem(item.id); return l && l.beats; }
function chainChanged(info = {}) {
  if (item.kind === 'scene') { const s = Store.scene(item.id); s.updated = Date.now(); Store.changed({ scene: s.id, seq: s.seqId, beats: true, ...info }, 'chain'); }
  else { const l = Store.looseItem(item.id); l.updated = Date.now(); Store.changed({ loose: true, ...info }, 'chain'); }
}
function fixLinks(bs) { bs.forEach((b, i) => { if (i === 0) b.link = ''; else if (!b.link) b.link = 'and'; }); }
function grow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
const linkRow = (b, i) => `<li class="lk-row"><button class="lk ${b.link || 'and'}" data-link="${i}">${LINK_LABEL[b.link || 'and']}</button></li>`;
// the last line is always an empty one waiting to be written on: writing there makes the next beat
const newRow = (any) => `<li class="beat new"><button class="tick" tabindex="-1" aria-hidden="true">✓</button><textarea rows="1" data-bt="new" placeholder="${any ? 'Next beat' : 'First beat'}"></textarea><button class="nb" tabindex="-1" aria-hidden="true">${ICON.notes}</button></li>`;
function countBeats(bs) { $('beatCnt').textContent = bs.length ? `${bs.filter(b => b.done).length}/${bs.length}` : ''; }
function renderChain(focus) {
  const bs = chain(); if (!bs) return;
  const cur = bs.findIndex(b => !b.done);
  countBeats(bs);
  let h = '';
  bs.forEach((b, i) => {
    if (i > 0) h += linkRow(b, i);
    const has = b.notes.trim() || b.dialogue.length;
    h += `<li class="beat ${b.done ? 'done' : ''} ${i === cur && item.kind === 'scene' ? 'cur' : ''}" data-i="${i}"><button class="tick" data-tick="${i}" aria-label="Written">✓</button>
      <textarea rows="1" data-bt="${i}" placeholder="Beat">${esc(b.text)}</textarea><button class="nb ${has ? 'has' : ''}" data-notes="${i}" aria-label="Notes and dialogue">${ICON.notes}</button></li>`;
  });
  h += newRow(bs.length > 0);
  $('chain').innerHTML = h;
  $('chain').querySelectorAll('textarea').forEach(grow);
  if (focus != null) { const t = $('chain').querySelector(`[data-bt="${focus}"]`); if (t) { t.focus(); const n = t.value.length; t.setSelectionRange(n, n); t.scrollIntoView({ block: 'nearest' }); } }
}
$('chain').addEventListener('input', (e) => {
  const t = e.target.closest('[data-bt]'); if (!t) return;
  const bs = chain(); if (!bs) return;
  if (/\n/.test(t.value)) t.value = t.value.replace(/\n+/g, ' ');
  if (t.dataset.bt === 'new') {
    grow(t);
    if (!t.value.trim()) return;
    // the waiting line becomes a beat where it stands, so the pencil never loses its place, and a fresh one opens under it
    const i = bs.length, b = Store.newBeat({ text: t.value, link: i ? 'and' : '' }); bs.push(b);
    const li = t.closest('li'), tick = li.querySelector('.tick'), nb = li.querySelector('.nb');
    li.classList.remove('new'); li.dataset.i = i; t.dataset.bt = i; t.placeholder = 'Beat';
    tick.dataset.tick = i; tick.removeAttribute('tabindex'); tick.removeAttribute('aria-hidden'); tick.setAttribute('aria-label', 'Written');
    nb.dataset.notes = i; nb.removeAttribute('tabindex'); nb.removeAttribute('aria-hidden'); nb.setAttribute('aria-label', 'Notes and dialogue');
    if (i > 0) li.insertAdjacentHTML('beforebegin', linkRow(b, i));
    li.insertAdjacentHTML('afterend', newRow(true));
    countBeats(bs); chainChanged(); return;
  }
  const b = bs[+t.dataset.bt]; if (!b) return;
  b.text = t.value; grow(t); chainChanged();
});
$('chain').addEventListener('keydown', (e) => {
  const t = e.target.closest('[data-bt]'); if (!t || e.isComposing) return;
  const bs = chain(), fresh = t.dataset.bt === 'new', i = fresh ? bs.length : +t.dataset.bt;
  const waiting = () => { const n = $('chain').querySelector('[data-bt="new"]'); if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); } };
  if (e.key === 'Enter') {
    e.preventDefault();
    if (fresh) return;
    if (i === bs.length - 1) { waiting(); return; }
    bs.splice(i + 1, 0, Store.newBeat({ link: 'and' })); fixLinks(bs); chainChanged(); renderChain(i + 1);
  }
  else if (e.key === 'Backspace' && !t.value) {
    if (fresh) { if (bs.length) { e.preventDefault(); renderChain(bs.length - 1); } return; }
    if (bs[i].notes.trim() || bs[i].dialogue.length) return;
    e.preventDefault(); bs.splice(i, 1); fixLinks(bs); chainChanged();
    if (i > 0) renderChain(i - 1); else { renderChain(); waiting(); }
  }
});
$('chain').addEventListener('click', (e) => {
  const bs = chain(); if (!bs) return;
  const lk = e.target.closest('[data-link]'), nb = e.target.closest('[data-notes]');
  if (lk) { const b = bs[+lk.dataset.link]; b.link = NEXT_LINK[b.link || 'and']; chainChanged(); renderChain(); }
  else if (nb) openNotes(+nb.dataset.notes);
});
pressDrag($('chain'), '.beat:not(.new)', {
  handle: '.tick', scroller: () => $('chain'),
  tap: (el) => {
    const bs = chain(), i = +el.dataset.i, b = bs[i]; if (!b) return;
    b.done = !b.done; chainChanged(); renderChain();
    if (b.done) { const nx = $('chain').querySelector('.beat.cur'); if (nx) nx.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  },
  menu: (el) => openNotes(+el.dataset.i),
  move: (x, y, st) => {
    const rows = [...$('chain').querySelectorAll('.beat:not(.new)')].filter(r => r !== st.el);
    let to = rows.length; for (let k = 0; k < rows.length; k++) { const r = rows[k].getBoundingClientRect(); if (y < r.top + r.height / 2) { to = k; break; } }
    st.to = to;
  },
  drop: (x, y, st) => {
    const bs = chain(), from = +st.el.dataset.i; if (st.to == null) return;
    const [b] = bs.splice(from, 1); bs.splice(st.to, 0, b); fixLinks(bs); chainChanged(); renderChain();
  }
});

/* ---------- a beat's notes and dialogue, in their own panel ---------- */
function openNotes(i) {
  const bs = chain(), b = bs[i]; if (!b) return;
  sheet('Beat ' + (i + 1), 'side', (body) => {
    const draw = () => {
      body.innerHTML = `<div class="field"><label>Notes</label><textarea id="nNotes" rows="5">${esc(b.notes)}</textarea></div>
        <div class="field"><label>Dialogue</label>${b.dialogue.map((d, k) => `<div class="dl" data-k="${k}"><input data-sp value="${esc(d.speaker)}" placeholder="Who"><textarea data-ln rows="2" placeholder="Line">${esc(d.line)}</textarea><button data-x aria-label="Remove line">×</button></div>`).join('')}
        <button class="btn quiet" id="nAdd" style="align-self:flex-start">+ Line</button></div>
        <button class="btn danger" id="nDel" style="align-self:flex-start;margin-top:12px">Delete beat</button>`;
      body.querySelectorAll('textarea').forEach(grow);
    };
    draw();
    body.addEventListener('input', (e) => {
      if (e.target.id === 'nNotes') b.notes = e.target.value;
      const row = e.target.closest('.dl');
      if (row) { const d = b.dialogue[+row.dataset.k]; if (e.target.matches('[data-sp]')) d.speaker = e.target.value; else d.line = e.target.value; }
      if (e.target.tagName === 'TEXTAREA') grow(e.target);
      chainChanged();
    });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'nAdd') { b.dialogue.push({ id: Store.uid('d-'), speaker: '', line: '' }); chainChanged(); draw(); body.querySelector('.dl:last-of-type [data-sp]').focus(); }
      else if (e.target.closest('[data-x]')) { b.dialogue.splice(+e.target.closest('.dl').dataset.k, 1); chainChanged(); draw(); }
      else if (e.target.id === 'nDel') {
        if (!e.target.classList.contains('armed')) { e.target.classList.add('armed'); e.target.textContent = 'Tap again to delete'; return; }
        bs.splice(bs.indexOf(b), 1); fixLinks(bs); chainChanged(); closeLayer();
      }
    });
  }, { onClose: () => renderChain() });
}


/* =====================================================================
   everything about a scene, in one sheet opened from its title
   ===================================================================== */
function sceneSheet(s) {
  const no = Store.sceneNo(s), when = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  sheet(no ? 'Scene ' + no : 'Scene', 'center', (body) => {
    const w = s.seqId ? Store.where(s.seqId) : null;
    body.innerHTML = `<div class="field"><label>Title</label><input id="dTitle" value="${esc(s.title)}" placeholder="Untitled scene" autocomplete="off"></div>
      <div class="field"><label>Summary</label><textarea id="dSum" rows="2">${esc(s.summary)}</textarea></div>
      <div class="grid2"><div class="field"><label>POV</label><input id="dPov" value="${esc(s.pov)}" autocomplete="off"></div><div class="field"><label>Location</label><input id="dLoc" value="${esc(s.location)}" autocomplete="off"></div></div>
      <div class="grid3"><div class="field"><label>Date</label><input id="dDate" value="${esc(s.date)}" autocomplete="off"></div>
        <div class="field"><label>Month</label><select id="dMonth"></select></div><div class="field"><label>Holiday or event</label><select id="dHol"></select></div></div>
      <div class="field"><label>Labels</label><div class="chips" id="dLabels"></div><input id="dLabel" placeholder="Add a label" autocomplete="off" autocapitalize="none" enterkeyhint="done"><div class="chips" id="dSug"></div></div>
      <div class="field"><label>Status</label><div class="seg" id="dSt">${Store.STATUSES.map(([k, l]) => `<button data-st="${k}" aria-pressed="${s.status === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><label>Stage</label><div class="seg" id="dSg"></div><div class="vers" id="dVers"></div></div>
      <div class="field"><label>Where</label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="font:15px var(--serif);color:var(--muted)">${w ? esc(Store.seqLabel(w.seq)) : 'Loose Pages'}</span>
        <button class="btn quiet" id="dMove">${w ? 'Move…' : 'File in…'}</button>${w ? '<button class="btn quiet" id="dLoose">Move to Loose</button>' : ''}</div></div>
      <div class="field" id="dMemos"></div>
      <div style="display:flex;gap:10px;align-items:center"><button class="btn quiet" id="dHist">History of the pages…</button><span style="flex:1"></span><button class="btn danger" id="dDel">Delete scene</button></div>`;
    body.querySelectorAll('textarea').forEach(grow);
    const set = (k, v) => { s[k] = v; Store.touchScene(s, { details: true }); };
    // a holiday that belongs to one month sets the month; an every-month one (or none) leaves the month to you
    const year = () => {
      const hs = Store.holidays(), h = Store.holiday(s.holiday), fixed = !!(h && h.month);
      const opt = (x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.when ? ' — ' + esc(x.when) : ''}</option>`;
      body.querySelector('#dMonth').innerHTML = '<option value="0">—</option>' + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Month ${i + 1}</option>`).join('');
      let o = '<option value="">—</option>';
      if (hs.some(x => !x.month)) o += `<optgroup label="Every month">${hs.filter(x => !x.month).map(opt).join('')}</optgroup>`;
      for (let m = 1; m <= 12; m++) if (hs.some(x => x.month === m)) o += `<optgroup label="Month ${m}">${hs.filter(x => x.month === m).map(opt).join('')}</optgroup>`;
      body.querySelector('#dHol').innerHTML = o;
      body.querySelector('#dMonth').value = String(s.month || 0); body.querySelector('#dMonth').disabled = fixed; body.querySelector('#dHol').value = s.holiday || '';
    };
    const memos = () => { body.querySelector('#dMemos').innerHTML = memoRows(s.memos || []); };
    year(); memos();
    body.addEventListener('change', (e) => {
      if (e.target.id === 'dMonth') set('month', +e.target.value || 0);
      else if (e.target.id === 'dHol') { const h = Store.holiday(e.target.value); s.holiday = h ? h.id : ''; if (h && h.month) s.month = h.month; Store.touchScene(s, { details: true }); year(); }
    });
    const labels = () => {
      const mine = s.labels || [], low = new Set(mine.map(x => x.toLowerCase()));
      body.querySelector('#dLabels').innerHTML = mine.map((l, i) => `<button class="chip2" data-unlabel="${i}">${esc(l)}<i>×</i></button>`).join('');
      body.querySelector('#dSug').innerHTML = Store.labelsOf(s.bookId).filter(l => !low.has(l.toLowerCase())).slice(0, 12).map(l => `<button class="chip2 sug" data-label="${esc(l)}">${esc(l)}</button>`).join('');
    };
    const addLabel = (v) => { const next = Store.normLabels([...(s.labels || []), ...String(v).split(',')]); if (next.length !== (s.labels || []).length) set('labels', next); labels(); };
    const stages = (armed) => {
      body.querySelector('#dSg').innerHTML = Store.STAGES.map(([k, l]) => `<button data-sg="${k}" aria-pressed="${s.stage === k}" class="${armed === k ? 'armed' : ''}">${armed === k ? 'Start ' + l : l}</button>`).join('');
      const vers = Store.ms(s.id).versions;
      body.querySelector('#dVers').innerHTML = vers.map((v, i) => `<button data-ver="${i}"><span>As it was at the end of ${esc(Store.stageLabel(v.stage))}</span><small>${when(v.at)}</small></button>`).reverse().join('');
    };
    labels(); stages();
    body.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'dTitle') { s.title = e.target.value.trim(); Store.touchScene(s, { title: true }); Pad.title(headLabel()); paintTop(); }
      else if (id === 'dSum') { set('summary', e.target.value); grow(e.target); } else if (id === 'dPov') set('pov', e.target.value); else if (id === 'dLoc') set('location', e.target.value); else if (id === 'dDate') set('date', e.target.value);
      else if (id === 'dLabel' && /,/.test(e.target.value)) { addLabel(e.target.value); e.target.value = ''; }
    });
    body.addEventListener('keydown', (e) => { if (e.target.id === 'dLabel' && e.key === 'Enter') { e.preventDefault(); addLabel(e.target.value); e.target.value = ''; } });
    body.addEventListener('focusout', (e) => { if (e.target.id === 'dLabel' && e.target.value.trim()) { addLabel(e.target.value); e.target.value = ''; } });
    body.addEventListener('click', (e) => {
      const x = e.target.closest('button'); if (!x) return;
      const d = x.dataset;
      if (d.st) { set('status', d.st); body.querySelectorAll('[data-st]').forEach(b => b.setAttribute('aria-pressed', String(b === x))); }
      else if (d.play) { const m = (s.memos || []).find(z => z.id === d.play); if (m) Player.toggle(m).then(memos); }
      else if (d.unmemo) { if (!x.classList.contains('armed')) { x.classList.add('armed'); x.textContent = 'Tap again'; return; } Player.stop(); s.memos = (s.memos || []).filter(z => z.id !== d.unmemo); Store.touchScene(s, { details: true }); memos(); paintTop(); }
      else if (d.unlabel != null) { const next = (s.labels || []).slice(); next.splice(+d.unlabel, 1); set('labels', next); labels(); }
      else if (d.label) addLabel(d.label);
      else if (d.sg) {
        // a new stage keeps the draft as it stood at the end of the old one, so it takes a second tap
        if (d.sg === s.stage) { stages(); return; }
        if (!x.classList.contains('armed')) { stages(d.sg); return; }
        Pad.settle().then(() => { Store.setStage(s.id, d.sg); stages(); });
      }
      else if (d.ver != null) { const v = Store.ms(s.id).versions[+d.ver]; closeLayer(); if (v) viewVersion(v); }
      else if (x.id === 'dHist') { closeLayer(); historySheet(s.id); }
      else if (x.id === 'dMove') { closeLayer(); fileIn('scene', s.id).then(paintTop); }
      else if (x.id === 'dLoose') { closeLayer(); Store.moveScene(s.id, null); if (item) item.from = 'loose'; paintTop(); }
      else if (x.id === 'dDel') { if (!x.classList.contains('armed')) { x.classList.add('armed'); x.textContent = 'Tap again to delete'; return; } closeLayer(); deleteScene(s); }
    });
  }, { onClose: () => { paintTop(); render(); } });
}
// a recording, in a sheet: play it, or take it off
const clock = (sec) => { const n = Math.max(0, Math.round(sec || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
const memoRows = (list) => list.length ? `<label>Voice</label>` + list.map(m => `<div class="set-row"><button class="btn" data-play="${m.id}">${Player.playing === m.id ? ICON.stop + 'Stop' : ICON.play + clock(m.dur)}</button><button class="btn quiet" data-unmemo="${m.id}">Remove</button></div>`).join('') : '';
// a loose page or loose beats: its title, where it goes, or throw it away
function looseSheet(l) {
  sheet(l.kind === 'beats' ? 'Loose beats' : 'Loose page', 'center', (body) => {
    body.innerHTML = `<div class="field"><label>Title</label><input id="lTitle" value="${esc(l.title)}" placeholder="${l.kind === 'beats' ? 'Untitled beats' : 'Untitled page'}" autocomplete="off"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="lFile">File in…</button>${l.kind === 'beats' ? '<button class="btn" id="lScene">Make a scene…</button>' : ''}</div>
      <div class="field" id="lMemos">${memoRows(l.memo ? [l.memo] : [])}</div>
      <div style="display:flex;gap:10px;align-items:center">${l.kind === 'writing' ? '<button class="btn quiet" id="lHist">History of the page…</button>' : ''}<span style="flex:1"></span><button class="btn danger" id="lDel">Delete</button></div>`;
    body.querySelector('#lTitle').addEventListener('input', (e) => { l.title = e.target.value.trim(); l.updated = Date.now(); Store.changed({ loose: true }, 'title'); Pad.title(headLabel()); paintTop(); });
    body.addEventListener('click', async (e) => {
      const x = e.target.closest('button'); if (!x) return;
      const redraw = () => { body.querySelector('#lMemos').innerHTML = memoRows(l.memo ? [l.memo] : []); };
      if (x.dataset.play) { if (l.memo) Player.toggle(l.memo).then(redraw); }
      else if (x.dataset.unmemo) { if (!x.classList.contains('armed')) { x.classList.add('armed'); x.textContent = 'Tap again'; return; } Player.stop(); delete l.memo; l.updated = Date.now(); Store.changed({ loose: true }); redraw(); paintTop(); }
      else if (x.id === 'lHist') { closeLayer(); historySheet(l.id); }
      else if (x.id === 'lFile') { closeLayer(); await Pad.settle(); fileIn(l.kind, l.id); }
      else if (x.id === 'lScene') { closeLayer(); makeScene(l.id); }
      else if (x.id === 'lDel') {
        if (!x.classList.contains('armed')) { x.classList.add('armed'); x.textContent = 'Tap again to delete'; return; }
        closeLayer(); await Pad.settle(); await Google.Copies.keep('before deleting a loose page'); Store.deleteLoose(l.id); go(item ? item.from : 'loose');
      }
    });
  });
}
// read an earlier text of what's open (the end of a stage, or a moment from its history); it can be put back
let viewingText = null;
async function viewText(label, text) {
  if (!item || item.kind === 'beats') return;
  if (item.kind === 'scene' && item.step !== 'pages') setStep('pages');
  await Pad.settle();
  viewingText = text; const put = $('viewingPut'); put.classList.remove('armed'); put.textContent = 'Put this back';
  Pad.view(label, text); $('viewingLbl').textContent = label; $('viewing').hidden = false;
}
const viewVersion = (v) => viewText('End of ' + Store.stageLabel(v.stage) + ' · ' + new Date(v.at).toLocaleDateString([], { month: 'short', day: 'numeric' }), v.text);
$('viewingBack').onclick = leaveView;
// putting an earlier text back keeps the present one in the history first, so this can itself be undone
$('viewingPut').onclick = async () => {
  const put = $('viewingPut'); if (!item || viewingText == null) return;
  if (!put.classList.contains('armed')) { put.classList.add('armed'); put.textContent = 'Tap again to put it back'; return; }
  const id = item.id, text = viewingText; viewingText = null;
  leaveView(); await Pad.settle();
  Store.setText(id, text, 'restore');
  await Pad.open(id, headLabel());
};
function historySheet(id) {
  Store.history(id).then((list) => {
    sheet('History', 'center', (body) => {
      const day = (t) => new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      if (!list.length) { body.innerHTML = '<div class="empty-note">Nothing yet. Each time you come back to these pages, iStory keeps how they stood before you changed them.</div>'; return; }
      body.innerHTML = `<div class="vers">${list.map((h, i) => `<button data-h="${i}"><span>${day(h.at)}</span><small>${kfmt(Store.words(h.text))} words</small></button>`).join('')}</div>`;
      body.onclick = (e) => { const b = e.target.closest('[data-h]'); if (!b) return; const h = list[+b.dataset.h]; closeLayer(); viewText('As it stood ' + day(h.at), h.text); };
    });
  });
}

/* =====================================================================
   Capture, and playing back what was recorded
   ===================================================================== */
// The sound is fetched ahead of the tap (when the piece opens), so the tap itself can start it: an iPad only plays what a touch asks for.
const Player = (() => {
  const urls = new Map(); let audio = null, cur = '';
  async function prime(list) { for (const m of list) if (!urls.has(m.id)) { const b = await Google.Memos.blob(m).catch(() => null); if (b && !urls.has(m.id)) urls.set(m.id, URL.createObjectURL(b)); } }
  function stop() { if (audio) { try { audio.pause(); } catch (e) {} audio = null; } if (cur) { cur = ''; paintTop(); } }
  async function toggle(m) {
    if (cur === m.id) { stop(); return; }
    stop();
    if (!urls.has(m.id)) await prime([m]);
    const u = urls.get(m.id); if (!u) { banner('That recording isn’t on this iPad. Connect to Google to fetch it.'); return; }
    const a = new Audio(u); audio = a; cur = m.id;
    a.onended = () => { if (audio === a) stop(); };
    a.onerror = () => { if (audio === a) { stop(); banner('That recording couldn’t be played.'); } };
    paintTop();
    try { await a.play(); } catch (e) { if (audio === a) stop(); }
  }
  return { prime, toggle, stop, get playing() { return cur; } };
})();
// the recordings on what's open
function itemMemos() {
  if (!item) return [];
  if (item.kind === 'scene') { const s = Store.scene(item.id); return s ? s.memos || [] : []; }
  const l = Store.looseItem(item.id); return l && l.memo ? [l.memo] : [];
}
$('memoBtn').onclick = () => {
  const list = itemMemos(); if (!list.length) return;
  if (Player.playing || list.length === 1) { const m = list.find(x => x.id === Player.playing) || list[0]; Player.toggle(m); return; }
  menu($('memoBtn'), list.map((m, i) => ({ label: 'Voice ' + (i + 1), small: clock(m.dur), act: () => Player.toggle(m) })));
};
// voice: the iPad's recorder, with a plain backup recorder for iPads whose recorder gives silence
const Rec = (() => {
  let mr = null, stream = null, chunks = [], ac = null, src = null, proc = null, pcm = [], pcmLen = 0, sr = null, t0 = 0, tick = 0, level = 0, onText = null, mime = '', finals = '';
  const RATE = 16000;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function wav() {
    const buf = new ArrayBuffer(44 + pcmLen * 2), v = new DataView(buf), w = (o, t) => { for (let k = 0; k < t.length; k++) v.setUint8(o + k, t.charCodeAt(k)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcmLen * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcmLen * 2, true);
    let o = 44; for (const c of pcm) for (let k = 0; k < c.length; k++, o += 2) v.setInt16(o, c[k], true);
    return new Blob([buf], { type: 'audio/wav' });
  }
  async function start(textCb, tickCb) {
    onText = textCb; finals = '';
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = []; pcm = []; pcmLen = 0; t0 = Date.now();
    try { mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m)) || ''; mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); }; mr.start(1000); } catch (e) { mr = null; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)(); src = ac.createMediaStreamSource(stream); proc = ac.createScriptProcessor(4096, 1, 1);
      const step = ac.sampleRate / RATE; let carry = 0, acc = 0, accN = 0;
      proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0), out = new Int16Array(Math.ceil(d.length / step) + 2); let n = 0, pk = 0;
        for (let k = 0; k < d.length; k++) { const x = d[k]; pk = Math.max(pk, Math.abs(x)); acc += x; accN++; carry += 1; if (carry >= step) { carry -= step; const y = Math.max(-1, Math.min(1, acc / accN)); out[n++] = y < 0 ? y * 0x8000 : y * 0x7fff; acc = 0; accN = 0; } }
        if (n) { pcm.push(out.subarray(0, n)); pcmLen += n; } level = Math.max(pk, level * .85);
      };
      src.connect(proc); proc.connect(ac.destination);
    } catch (e) { proc = null; }
    if (SR) { try { sr = new SR(); sr.continuous = true; sr.interimResults = true; sr.lang = navigator.language || 'en-US';
      sr.onresult = (e) => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finals += (finals ? ' ' : '') + r[0].transcript.trim(); else interim += r[0].transcript; } onText && onText(finals, interim.trim()); };
      sr.onerror = () => {}; sr.start(); } catch (e) { sr = null; } }
    tick = setInterval(() => tickCb && tickCb(Date.now() - t0, level), 200);
  }
  async function stop() {
    clearInterval(tick);
    try { sr && sr.stop(); } catch (e) {} sr = null;
    let blob = null;
    if (mr && mr.state !== 'inactive') { await new Promise(r => { mr.onstop = r; mr.stop(); }); blob = new Blob(chunks, { type: mime || 'audio/mp4' }); }
    try { proc && proc.disconnect(); src && src.disconnect(); ac && ac.close(); } catch (e) {}
    stream && stream.getTracks().forEach(t => t.stop());
    const dur = (Date.now() - t0) / 1000;
    if ((!blob || blob.size < 2000) && pcmLen > RATE / 2) blob = wav();
    mr = null; stream = null; proc = null; src = null; ac = null;
    return blob && blob.size > 1000 ? { blob, dur, mime: blob.type } : null;
  }
  return { start, stop, get ok() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); } };
})();
$('captureBtn').onclick = () => {
  let kind = 'writing', memo = null, recording = false;
  sheet('Capture', 'top', (body) => {
    body.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="seg" id="cKind" style="flex:0 1 auto">${[['writing', 'Writing'], ['beats', 'Beat'], ['scene', 'Scene']].map(([k, l]) => `<button data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join('')}</div>
      <span class="spacer" style="flex:1"></span>${Rec.ok ? `<div class="rec" id="cRec" hidden><span class="tm" id="cTm">0:00</span><span class="lvl"><i id="cLvl"></i></span></div><button class="btn" id="cMic">${ICON.mic}Voice</button>` : ''}<button class="btn primary" id="cSave">Save</button></div>
      <div class="field"><textarea id="capText" placeholder=""></textarea></div><div id="cAudio"></div>`;
    const ta = body.querySelector('#capText');
    setTimeout(() => ta.focus(), 60);
    let base = '';
    body.querySelector('#cKind').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; body.querySelectorAll('#cKind button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
    const mic = body.querySelector('#cMic');
    if (mic) mic.onclick = async () => {
      if (!recording) {
        try {
          base = ta.value.trim();
          await Rec.start((fin, interim) => { ta.value = [base, fin, interim].filter(Boolean).join(base ? '\n' : ' ').trim(); },
            (ms, lvl) => { const s = Math.round(ms / 1000); body.querySelector('#cTm').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); body.querySelector('#cLvl').style.width = Math.min(100, lvl * 160) + '%'; });
          recording = true; mic.classList.add('rec-on'); mic.innerHTML = ICON.mic + 'Stop'; body.querySelector('#cRec').hidden = false;
        } catch (e) { banner('The microphone isn’t available: ' + (e.message || 'permission was refused')); }
      } else {
        recording = false; mic.classList.remove('rec-on'); mic.innerHTML = ICON.mic + 'Voice'; body.querySelector('#cRec').hidden = true;
        memo = await Rec.stop();
        if (memo) { const a = document.createElement('audio'); a.controls = true; a.src = URL.createObjectURL(memo.blob); body.querySelector('#cAudio').replaceChildren(a); }
      }
    };
    body.querySelector('#cSave').onclick = async () => {
      if (recording) { recording = false; memo = await Rec.stop(); }
      const text = ta.value.trim();
      if (!text && !memo) { closeLayer(); return; }
      // the sound is stored first, so a recording is never dropped; with no words to go by, the piece is named for what it is
      let m = null;
      if (memo) { const id = Store.uid('m-'); await Google.Memos.put(id, memo.blob); m = { id, mime: memo.mime, dur: memo.dur, driveId: '', at: Date.now() }; }
      const named = text ? '' : 'Voice note · ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (kind === 'scene') { const lines = text.split('\n'); Store.addScene({ title: lines[0].slice(0, 120) || named, summary: lines.slice(1).join('\n').trim(), memos: m ? [m] : [] }, null); }
      else if (kind === 'beats') { const lines = text.split('\n').map(x => x.trim()).filter(Boolean); Store.addLoose('beats', { title: named, beats: lines.map((t, i) => ({ text: t, link: i ? 'and' : '' })), ...(m ? { memo: m } : {}) }); }
      else Store.addLoose('writing', { title: named, text, ...(m ? { memo: m } : {}) });
      if (m) Google.Sync.markDirty && Google.Sync.markDirty();
      closeLayer(); render();
    };
  }, { done: 'Cancel', onClose: () => { if (recording) Rec.stop(); } });
};

/* =====================================================================
   the menu: book, Google, copies, pad, backup
   ===================================================================== */
const agoTxt = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
$('menuBtn').onclick = () => {
  const st = Google.state, cur = Store.bookId;
  const gl = !Google.signedIn ? [{ label: 'Sign in to Google', act: () => Google.signIn().catch(e => banner(e.message)) }]
    : [st.mode === 'error' || st.mode === 'conflict' || st.mode === 'offline' || st.mode === 'reconnect' ? { note: st.msg || st.mode, bad: st.mode === 'error' } : { note: st.lastOk ? 'Synced ' + agoTxt(st.lastOk) : 'Signed in' },
      { label: 'Sync now', act: () => { Google.gesture(); Google.Sync.cycle('now'); Google.Docs.tick('now'); } }, { label: 'Sign out of Google', act: () => Google.signOut() }];
  const empty = !Store.data.scenes.length && !Store.data.loose.length;
  const onPage = view === 'item' && item && item.step === 'pages' && $('viewing').hidden;
  menu($('menuBtn'), [onPage ? { label: 'Type on the page', act: () => Pad.type() } : null, onPage ? { hr: true } : null, { head: 'Book' },
    ...Store.data.books.map(b => ({ label: Store.bookLabel(b), checked: b.id === cur, act: () => { Store.setBook(b.id); go('story'); } })),
    { label: 'New book…', act: async () => { const v = await promptSheet('New book', '', 'Name'); if (v !== null) { const b = Store.addBook(v); Store.setBook(b.id); go('story'); } } },
    { label: 'Rename this book…', act: async () => { const b = Store.book(cur); const v = await promptSheet('Book', b.name, 'Name'); if (v !== null) Store.rename('book', b.id, v); render(); } },
    { label: 'The year…', act: yearSheet },
    { hr: true }, { head: 'Google' }, ...gl,
    { hr: true },
    { label: 'Saving…', act: saveSheet },
    { label: 'Earlier copies…', act: copiesSheet },
    { label: 'Writing pad…', act: padSheet },
    { label: 'Export this book', act: exportBook },
    { label: 'Download a backup', act: () => saveFile(`istory-backup-${stamp()}.json`, Store.exportJSON(), 'application/json') },
    { label: 'Restore a backup…', act: () => $('restoreIn').click() },
    empty ? { label: 'Bring in Story Studio…', act: bringStudio } : null,
    { ver: 'iStory · ' + BUILD }]);
};
/* ---------- the story's year: twelve months, their holidays and events, and which ones your scenes have used ---------- */
function yearSheet() {
  let draft = null;   // while the list is being edited: a working copy, saved or dropped as a whole
  sheet('The year', 'center wide', (body) => {
    const show = () => {
      const hs = Store.holidays(), sc = Store.data.scenes.filter(s => s.bookId === Store.bookId);
      const byH = new Map(), byM = new Map();
      for (const s of sc) { if (s.holiday) byH.set(s.holiday, (byH.get(s.holiday) || 0) + 1); if (s.month) byM.set(s.month, (byM.get(s.month) || 0) + 1); }
      const chip = (h) => { const n = byH.get(h.id) || 0; return `<button class="yh ${n ? 'used' : ''}" data-h="${esc(h.id)}"><b>${esc(h.name)}</b>${n ? `<i>${n}</i>` : ''}${h.when ? `<small>${esc(h.when)}</small>` : ''}</button>`; };
      const every = hs.filter(h => !h.month);
      body.innerHTML = `<div class="yr">${Array.from({ length: 12 }, (_, k) => { const m = k + 1, n = byM.get(m) || 0;
          return `<div class="ym"><button class="ymh ${n ? 'used' : ''}" data-m="${m}">Month ${m}${n ? `<i>${n}</i>` : ''}</button>${hs.filter(h => h.month === m).map(chip).join('')}</div>`; }).join('')}</div>
        ${every.length ? `<div class="field"><label>Every month</label><div class="yev">${every.map(chip).join('')}</div></div>` : ''}
        <div style="display:flex"><button class="btn quiet" id="yEdit" style="margin-left:auto">Edit the list</button></div>`;
    };
    const edit = () => {
      const months = (cur) => `<option value="0" ${cur ? '' : 'selected'}>Every month</option>` + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${cur === i + 1 ? 'selected' : ''}>Month ${i + 1}</option>`).join('');
      const types = (cur) => [['mosaic', 'Mosaic'], ['nephite', 'Nephite'], ['other', 'Other']].map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
      body.innerHTML = `<div class="yedit">${draft.map((h, i) => `<div class="yrow" data-i="${i}"><select data-f="month">${months(h.month)}</select><input data-f="name" value="${esc(h.name)}" placeholder="Name" autocomplete="off"><input data-f="when" value="${esc(h.when)}" placeholder="When" autocomplete="off"><select data-f="type">${types(h.type)}</select><button class="tb" data-del="${i}" aria-label="Remove">✕</button></div>`).join('')}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="yAdd">Add a holiday or event</button><button class="btn quiet" id="yReset">Put back the built-in list</button><span style="flex:1"></span><button class="btn quiet" id="yCancel">Cancel</button><button class="btn primary" id="ySave">Save</button></div>`;
    };
    const draw = () => (draft ? edit() : show());
    draw();
    body.addEventListener('input', (e) => { const r = e.target.closest('.yrow'); if (!r || !draft) return; const h = draft[+r.dataset.i], f = e.target.dataset.f; if (h && f) h[f] = f === 'month' ? +e.target.value || 0 : e.target.value; });
    body.addEventListener('click', (e) => {
      const x = e.target.closest('button'); if (!x) return;
      if (x.dataset.h) { closeLayer(); if (view !== 'story') go('story'); setCal({ holiday: x.dataset.h }); }
      else if (x.dataset.m) { closeLayer(); if (view !== 'story') go('story'); setCal({ month: +x.dataset.m }); }
      else if (x.id === 'yEdit') { draft = Store.holidays().map(h => ({ ...h })); draw(); }
      else if (x.dataset.del != null) { draft.splice(+x.dataset.del, 1); draw(); }
      else if (x.id === 'yAdd') { draft.push({ id: Store.uid('h-'), month: 0, name: '', when: '', type: 'other' }); draw(); const ins = body.querySelectorAll('.yrow input[data-f="name"]'); ins.length && ins[ins.length - 1].focus(); }
      else if (x.id === 'yReset') { if (!x.classList.contains('armed')) { x.classList.add('armed'); x.textContent = 'Tap again'; return; } draft = Store.defaultHolidays(); draw(); }
      else if (x.id === 'yCancel') { draft = null; draw(); }
      else if (x.id === 'ySave') { Store.setHolidays(draft.map(h => ({ ...h, name: h.name.trim(), when: h.when.trim() })).filter(h => h.name)); draft = null; draw(); render(); }
    });
  });
}
function copiesSheet() {
  Promise.all([Google.Copies.list(), Store.kept()]).then(([list, kept]) => {
    sheet('Earlier copies', 'center', (body) => {
      const day = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const count = (d) => `${(d.scenes || []).length} scenes · ${kfmt(Object.values(d.ms || {}).reduce((n, m) => n + Store.words(m && m.text), 0))} words`;
      if (!list.length && !kept) { body.innerHTML = '<div class="empty-note">None yet.</div>'; return; }
      body.innerHTML = list.map((c, i) => `<div class="set-row"><span style="font:15px var(--serif)">${day(c.at)}<br><small style="color:var(--faint);font:12.5px var(--ui)">${esc(c.reason)} · ${c.scenes} scenes · ${kfmt(c.words || 0)} words</small></span><button class="btn" data-i="${i}">Put back</button></div>`).join('')
        + (kept ? `<div class="set-row"><span style="font:15px var(--serif)">${day(kept.at)}<br><small style="color:var(--faint);font:12.5px var(--ui)">your story as it was before the rebuild · ${count(kept.data)} · always kept</small></span><button class="btn" data-i="kept">Put back</button></div>` : '');
      body.onclick = async (e) => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again'; return; }
        closeLayer();
        if (b.dataset.i === 'kept') { await Pad.settle(); await Google.Copies.keep('before putting back the copy from before the rebuild'); await Store.replace(kept.data, 'restore'); Google.Sync.markDirty(); }
        else await Google.Copies.putBack(+b.dataset.i);
        go('story');
      };
    });
  });
}
function padSheet() {
  const s = Pad.settings.get();
  sheet('Writing pad', 'center', (body) => {
    body.innerHTML = `<div class="field"><label>Reader</label><div class="seg" id="pEng"><button data-e="scribble" aria-pressed="${s.engine === 'scribble'}">Apple Scribble</button><button data-e="google" aria-pressed="${s.engine === 'google'}">Google</button></div></div>
      <label class="set-row"><span>Send automatically</span><input type="checkbox" class="sw" id="pAuto" ${s.auto ? 'checked' : ''}></label>
      <label class="set-row"><span>Scribble pause</span><output id="pSpO">${s.spause} s</output><input type="range" id="pSp" min="0.25" max="3" step="0.25" value="${s.spause}"></label>
      <label class="set-row"><span>Ink pause</span><output id="pPO">${s.pause} s</output><input type="range" id="pP" min="1" max="5" step="0.5" value="${s.pause}"></label>
      <label class="set-row"><span>Apple Pencil only</span><input type="checkbox" class="sw" id="pPen" ${s.pencilOnly ? 'checked' : ''}></label>
      <label class="set-row"><span>Guide lines</span><input type="checkbox" class="sw" id="pRules" ${s.rules ? 'checked' : ''}></label>
      <label class="set-row"><span>Ink</span><output id="pInkO">${s.ink}</output><input type="range" id="pInk" min="1.5" max="5" step="0.5" value="${s.ink}"></label>
      <label class="set-row"><span>Text size</span><output id="pSzO">${s.size}</output><input type="range" id="pSz" min="16" max="32" step="1" value="${s.size}"></label>
      <button class="btn quiet" id="pReset" style="align-self:flex-start">Reset pad</button>`;
    body.addEventListener('input', () => {
      const v = (id) => body.querySelector('#' + id);
      Pad.settings.set({ auto: v('pAuto').checked, spause: +v('pSp').value, pause: +v('pP').value, pencilOnly: v('pPen').checked, rules: v('pRules').checked, ink: +v('pInk').value, size: +v('pSz').value });
      v('pSpO').textContent = v('pSp').value + ' s'; v('pPO').textContent = v('pP').value + ' s'; v('pInkO').textContent = v('pInk').value; v('pSzO').textContent = v('pSz').value;
    });
    body.querySelector('#pEng').onclick = (e) => { const b = e.target.closest('[data-e]'); if (!b) return; Pad.settings.set({ engine: b.dataset.e }); body.querySelectorAll('#pEng button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
    body.querySelector('#pReset').onclick = () => Pad.settings.resetBox();
  });
}
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
async function saveFile(name, text, type) {
  const file = new File([text], name, { type });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportBook() {
  const b = Store.book(Store.bookId), N = Store.numbers(b.id); let out = Store.bookLabel(b).toUpperCase() + '\n\n';
  for (const p of Store.partsOf(b.id)) { out += '\n' + Store.partLabel(p).toUpperCase() + '\n'; for (const a of Store.actsOf(p.id)) { out += '\n' + Store.actLabel(a) + '\n'; for (const q of Store.seqsOf(a.id)) {
    out += '\n' + Store.seqLabel(q) + '\n';
    for (const s of Store.scenesOf(q.id)) { const t = Store.text(s.id).trim(); out += `\nScene ${N.scene.get(s.id)} · ${s.title || 'Untitled'}\n\n${t ? t + '\n' : ''}`; }
  } } }
  saveFile((b.name || 'book').replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.txt', out, 'text/plain');
}
const restoreIn = document.createElement('input'); restoreIn.type = 'file'; restoreIn.accept = '.json,application/json'; restoreIn.id = 'restoreIn'; restoreIn.hidden = true; document.body.append(restoreIn);
restoreIn.onchange = async () => {
  const f = restoreIn.files[0]; restoreIn.value = ''; if (!f) return;
  try {
    const raw = JSON.parse(await f.text());
    let data;
    if (raw.app === 'istory') data = raw;
    else if (raw.app === 'kotw-studio-backup' && raw.story) data = Store.fromStudio(raw.story, raw.meta, raw.pages || {});
    else if (raw.app === 'kotw-story') data = Store.fromStudio(raw, null, {});
    else throw new Error('this isn’t an iStory or Story Studio backup');
    const pickI = await ask('Restore', `Replace what’s here with “${f.name}”? What’s here now is kept under Earlier copies.`, ['Replace', 'Cancel']);
    if (pickI !== 0) return;
    await Google.Copies.keep('before restoring a backup');
    await Store.replace(data, 'restore'); go('story');
  } catch (e) { banner('“' + f.name + '” couldn’t be restored: ' + e.message); }
};
async function bringStudio() {
  try {
    const local = await Store.readStudioLocal();
    if (local && local.story && (local.story.scenes || []).length) { await Store.replace(Store.fromStudio(local.story, local.meta, local.pages), 'import'); go('story'); return; }
    if (!Google.signedIn) await Google.signIn();
    await Google.importStudio(); go('story');
  } catch (e) { banner('Story Studio couldn’t be brought in: ' + e.message); }
}

/* =====================================================================
   keeping the screen in step
   ===================================================================== */
let rT = 0, editing = null;
function render() { cancelAnimationFrame(rT); rT = requestAnimationFrame(renderNow); }
function renderSync() { cancelAnimationFrame(rT); renderNow(); }
function renderNow() {
  if (view === 'story') { if (!editing || !editing.isConnected) { editing = null; renderBoard(); } }
  else if (view === 'loose') renderLoose();
  paintTop();
}
Store.subscribe((info, src) => {
  if (src === 'chain' || src === 'pad' || src === 'title') { if (view !== 'item') render(); else { const n = Store.looseFor().length; $('looseN').textContent = n ? String(n) : ''; } return; }
  if (info.quiet && view === 'item') return;
  if (view === 'item' && item) {
    const exists = item.kind === 'scene' ? Store.scene(item.id) : Store.looseItem(item.id);
    if (!exists) { go(item.from || 'story'); return; }
    if (src === 'doc' || src === 'cloud' || src === 'restore' || src === 'import') { Pad.external(); if (!document.activeElement || !document.activeElement.closest('#chain')) renderChain(); Pad.title(headLabel()); }
  }
  render();
});
/* ---------- the saved mark: on this iPad, and in Drive ---------- */
let slowT = 0, slow = false, saveErr = false;
function saveState() {
  const m = Google.state.mode, signed = Google.signedIn;
  const local = saveErr || Store.blocked ? 'bad' : slow ? 'slow' : 'ok';
  const drive = !signed ? 'off' : m === 'error' ? 'bad' : m === 'offline' ? 'offline' : m === 'reconnect' ? 'reconnect' : m === 'conflict' ? 'conflict' : m === 'idle' && !Google.Sync.dirty ? 'ok' : 'soon';
  return { local, drive };
}
function paintSave() {
  const el = $('saveMark'), s = saveState();
  const d = { off: '', ok: ' · Drive', soon: ' · Drive soon', offline: ' · offline', reconnect: ' · reconnect', conflict: ' · choose a copy', bad: ' · Drive problem' }[s.drive];
  el.textContent = s.local === 'bad' ? 'Not saved' : (s.local === 'slow' ? 'Saving…' : 'Saved') + d;
  el.className = 'tb' + (s.local === 'bad' || s.drive === 'bad' ? ' bad' : ['reconnect', 'conflict'].includes(s.drive) ? ' warn' : '');
}
// "Saving…" only shows if a save is still going after two seconds; an ordinary save is too quick to be worth a flicker
Store.onSaving = () => { clearTimeout(slowT); if (Store.unsaved) slowT = setTimeout(() => { slow = Store.unsaved; paintSave(); }, 2000); else { if (slow || saveErr) { slow = false; saveErr = false; } paintSave(); } };
Store.onError = (m) => { saveErr = true; paintSave(); banner(m); };
$('saveMark').onclick = saveSheet;
function saveSheet() {
  sheet('Saving', 'center', (body) => {
    const at = (t) => t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + (new Date(t).toDateString() === new Date().toDateString() ? '' : ' on ' + new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })) : '';
    const draw = () => {
      const s = saveState(), g = Google.state, M = Google.Mirror, url = M.url();
      const local = s.local === 'bad' ? ['bad', 'Not saved on this iPad', 'Something is stopping iStory from saving here. Use Download a backup in the menu now.'] : ['', 'Saved on this iPad', (Store.unsaved ? 'Saving now.' : 'Everything you have written is stored here' + (Store.savedAt ? ', last at ' + at(Store.savedAt) : '') + '.') + ' It works with no connection.'];
      const drive = { off: ['', 'Google Drive: not connected', 'Sign in and your story is also kept in your Google Drive.', 'Sign in to Google', 'in'],
        ok: ['', 'Saved in Google Drive', 'Matches this iPad' + (g.lastOk ? ', checked at ' + at(g.lastOk) : '') + '.', 'Check again now', 'sync'],
        soon: ['', 'Google Drive: sending soon', 'Your latest changes go to Drive a few seconds after you stop.', 'Send now', 'sync'],
        offline: ['', 'Google Drive: offline', 'Your work is safe on this iPad and goes to Drive when you are back online.', 'Try now', 'sync'],
        reconnect: ['warn', 'Google Drive: reconnect', 'Google needs you to sign in again before anything more can be sent.', 'Reconnect', 'in'],
        conflict: ['warn', 'Google Drive: choose a copy', 'This iPad and Drive have different copies. Nothing is lost; pick which to keep.', 'Choose now', 'sync'],
        bad: ['bad', 'Google Drive: a problem', g.msg || 'Drive could not be reached.', 'Try again', 'sync'] }[s.drive];
      body.innerHTML = `<div class="sv ${local[0]}"><b>${local[1]}</b><span>${esc(local[2])}</span></div>
        <div class="sv ${drive[0]}"><b>${drive[1]}</b><span>${esc(drive[2])}</span><button class="btn" data-do="${drive[4]}">${drive[3]}</button></div>
        ${s.drive === 'off' ? '' : `<div class="sv"><b>A copy you can see</b><span>In your Drive, in the folder <i>iStory</i>: “${esc(M.name)}”${M.at ? ', updated at ' + at(M.at) : ', not made yet'}. The sequence Docs are in the same folder. Restore a backup… in the menu reads this file back.</span>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-do="mirror">Update it now</button>${url ? `<a class="btn quiet" href="${url}" target="_blank" rel="noopener" style="margin-top:8px;display:inline-flex;align-items:center;text-decoration:none">Open the folder</a>` : ''}</div></div>`}
        <div class="sv"><b>Earlier copies and history</b><span>Whole-story copies are under Earlier copies. Each scene keeps a history of its pages, opened from the scene’s title.</span><button class="btn" data-do="copies">Earlier copies…</button></div>`;
    };
    draw();
    const off = Google.onState(() => { if (body.isConnected) draw(); else off(); });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-do]'); if (!b) return; const d = b.dataset.do;
      if (d === 'in') { try { await Google.signIn(); } catch (err) { banner(err.message); } draw(); }
      else if (d === 'sync') { Google.gesture(); await Pad.pause(); await Store.flush(); Google.Sync.cycle('now'); Google.Docs.tick('now'); }
      else if (d === 'mirror') { b.textContent = 'Updating…'; try { await Pad.pause(); await Store.flush(); await Google.Mirror.run(true); } catch (err) { banner(err.needTap ? 'Tap anywhere to reconnect to Google, then try again.' : err.offline ? 'Offline. The copy will update when you are back online.' : err.message); } draw(); }
      else if (d === 'copies') { closeLayer(); copiesSheet(); }
    });
  });
}
Google.onState((s) => {
  paintSave();
  const d = $('syncDot'); d.className = 'dot' + (s.mode === 'error' ? ' bad' : ['reconnect', 'offline', 'conflict'].includes(s.mode) ? ' warn' : '');
  if (s.mode === 'error' && s.msg) banner(s.msg);
});
document.addEventListener('pointerdown', () => Google.gesture(), true);
addEventListener('pagehide', () => { Pad.pause(); Store.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { Pad.pause(); Store.flush(); } });
document.addEventListener('gesturestart', (e) => e.preventDefault());
// a keyboard: Escape closes what's open; on the page, the first key puts the cursor in the draft and types there.
// Keys that arrive in the pad's own field are left alone: Apple's Scribble sends its gestures (scratch out, join,
// new line) as key presses there, and they must act on the writing in the pad, not send it to the page.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (layer.children.length) closeLayer(); else if (peek) setPeek(false); return; }
  if (view !== 'item' || !item || item.step !== 'pages' || layer.children.length || !$('viewing').hidden) return;
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || Pad.editing) return;
  const t = e.target, field = t && t.closest && t.closest('input, textarea, select, [contenteditable]');
  if (field) return;
  const first = e.key.length === 1 ? e.key : e.key === 'Enter' ? '\n' : e.key === 'Backspace' ? '\b' : null;
  if (first == null) return;
  if (t && t.closest && t.closest('button') && (first === ' ' || first === '\n')) return;
  e.preventDefault(); setPeek(false); Pad.type(first);
});

/* ---------- opening ---------- */
(async () => {
  Pad.init();
  try { await Store.init(); }
  catch (e) { $('loading').remove(); banner('Your story couldn’t be opened: ' + e.message + '. Nothing was changed. Restore a backup from the menu.'); return; }
  document.body.classList.toggle('gaps', !!Store.ui().gaps); $('gapsBtn').setAttribute('aria-pressed', String(!!Store.ui().gaps));
  $('loading').remove();
  // pick up where you left off
  const last = Store.last, ui = Store.ui();
  if (last && (last.kind === 'scene' ? Store.scene(last.id) : Store.looseItem(last.id))) {
    const kind = last.kind === 'scene' ? 'scene' : Store.looseItem(last.id).kind;
    view = ui.lastFrom === 'loose' ? 'loose' : 'story';
    openItem(kind, last.id, ui.lastFrom || 'story');
  } else go(ui.view === 'loose' ? 'loose' : 'story');
  Google.start();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const had = !!navigator.serviceWorker.controller; let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', async () => { if (had && !reloading) { reloading = true; await Pad.pause(); await Store.flush(); location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { reg.update().catch(() => {}); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }); }).catch(() => {});
  }
  window.__istory = { go, openItem, render, get view() { return view; }, get item() { return item; } };
})();
})();
