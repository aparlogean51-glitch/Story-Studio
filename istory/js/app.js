/* =====================================================================
   iStory screens: the timeline (Story), Loose Pages, and an open scene, loose page or beat chain.
   ===================================================================== */
(() => {
'use strict';
const Store = window.Store, Google = window.Google, Pad = window.Pad;
const BUILD = 'Nov 8 · 21c1f';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kfmt = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
const LINK_LABEL = { but: 'but', therefore: 'therefore', and: 'and then' };
const NEXT_LINK = { but: 'therefore', therefore: 'and', and: 'but', '': 'but' };
const ICON = {
  doc: '<svg class="i" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  more: '<svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  notes: '<svg class="i" viewBox="0 0 24 24"><path d="M5 5h14v10l-4 4H5z"/><path d="M15 19v-4h4M8 9h8M8 12h5"/></svg>',
  mic: '<svg class="i" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>'
};

/* =====================================================================
   where you are
   ===================================================================== */
let view = 'story', item = null;   // item: { kind: 'scene' | 'writing' | 'beats', id, from }
const portrait = () => innerHeight > innerWidth;
function go(v) {
  if (view === 'item') Pad.settle();
  view = v; item = v === 'item' ? item : null;
  $('story').hidden = v !== 'story'; $('loose').hidden = v !== 'loose'; $('item').hidden = v !== 'item';
  if (v !== 'item') Store.setUi({ view: v, last: null });
  paintTop(); render();
}
function openItem(kind, id, from) {
  const exists = kind === 'scene' ? Store.scene(id) : Store.looseItem(id);
  if (!exists) { go(from || 'story'); return; }
  if (view === 'item' && item && item.id !== id) Pad.settle();
  view = 'item'; item = { kind, id, from: from || (view === 'loose' ? 'loose' : 'story') };
  $('story').hidden = true; $('loose').hidden = true; $('item').hidden = false;
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
  const k = item && item.kind, panelKey = portrait() ? 'panelP' : 'panelL', ui = Store.ui();
  const open = k === 'scene' ? (ui[panelKey] === undefined ? !portrait() : ui[panelKey]) : k === 'beats';
  document.body.classList.toggle('portrait', portrait());
  document.body.classList.toggle('chain-only', k === 'beats');
  document.body.classList.toggle('no-panel', !open || k === 'writing');
  $('beatPanel').hidden = !(open && k !== 'writing');
  $('desk').hidden = k === 'beats';
  $('beatsBtn').setAttribute('aria-pressed', String(open));
  Pad.layout();
}
$('beatsBtn').onclick = () => { const key = portrait() ? 'panelP' : 'panelL', ui = Store.ui(); const cur = ui[key] === undefined ? !portrait() : ui[key]; Store.setUi({ [key]: !cur }); layoutItem(); };
addEventListener('resize', () => { if (view === 'item') layoutItem(); });

function paintTop() {
  const inItem = view === 'item';
  $('tabs').hidden = inItem; $('back').hidden = !inItem; $('itemTitle').hidden = !inItem;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-current', String(t.dataset.go === view)));
  $('gapsBtn').hidden = view !== 'story';
  const k = inItem && item.kind;
  const s = k === 'scene' ? Store.scene(item.id) : null, l = k && k !== 'scene' ? Store.looseItem(item.id) : null;
  $('stageBtn').hidden = !s; $('detailsBtn').hidden = !s; $('beatsBtn').hidden = !s;
  $('chainSceneBtn').hidden = k !== 'beats';
  $('fileBtn').hidden = !(l || (s && !s.seqId));
  const q = s && s.seqId ? Store.seq(s.seqId) : null;
  $('docBtn').hidden = !(q && q.doc);
  if (inItem) {
    $('backLbl').textContent = item.from === 'loose' ? 'Loose' : 'Story';
    const t = s ? s.title : l ? l.title : '';
    if (document.activeElement !== $('itemTitle')) $('itemTitle').value = t;
    $('itemTitle').placeholder = s ? 'Untitled scene' : k === 'beats' ? 'Untitled beats' : 'Untitled page';
    $('itemTitle').size = Math.max(8, Math.min(40, (t || $('itemTitle').placeholder).length + 1));
    if (s) $('stageBtn').textContent = Store.stageLabel(s.stage);
  }
  const n = Store.looseFor().length; $('looseN').textContent = n ? String(n) : '';
}
document.querySelectorAll('.tab').forEach(t => t.onclick = () => go(t.dataset.go));
$('back').onclick = () => go(item ? item.from : 'story');
let titleT = 0;
$('itemTitle').addEventListener('input', () => {
  clearTimeout(titleT);
  const v = $('itemTitle').value;
  titleT = setTimeout(() => {
    if (!item) return;
    if (item.kind === 'scene') { const s = Store.scene(item.id); if (s) { s.title = v.trim(); Store.touchScene(s, { title: true }); } }
    else { const l = Store.looseItem(item.id); if (l) { l.title = v.trim(); l.updated = Date.now(); Store.changed({ loose: true }, 'title'); } }
    Pad.title(headLabel());
  }, 350);
});
$('itemTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('itemTitle').blur(); } });

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
Store.onError = banner;

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
function sceneCard(s, N, light) {
  const bs = s.beats, done = bs.filter(b => b.done).length, w = Store.wordsOf(s.id), weak = bs.slice(1).filter(b => b.link === 'and').length;
  let g = '', gt = '';
  if (!bs.length) { g = 'g-nobeats'; gt = 'no beats'; } else if (!w) { g = 'g-nopages'; gt = 'no pages'; } else if (weak) { g = 'g-weak'; gt = weak + ' and then'; }
  const dots = bs.length > 14 ? `${done}/${bs.length}` : bs.map(b => `<i class="${b.done ? 'on' : ''}"></i>`).join('');
  const first = (s.summary || '').split('\n')[0];
  return `<div class="card ${light ? 'light' : ''} ${g}" data-scene="${s.id}"><span class="gap">${gt}</span>
    <span class="no">${light ? '<span class="kind">Scene</span>' : (N.scene.get(s.id) || '')}</span>
    <div class="t ${s.title ? '' : 'empty'}">${esc(s.title || 'Untitled')}</div>${first ? `<div class="s">${esc(first)}</div>` : ''}
    <div class="f"><span class="bdots">${dots}</span><span class="w">${w ? kfmt(w) : ''}</span></div></div>`;
}
function looseCard(x) {
  if (x.kind === 'scene') return sceneCard(x.item, null, true);
  const l = x.item;
  if (l.kind === 'beats') { const f = l.beats.find(b => b.text); return `<div class="card light" data-loose="${l.id}"><span class="no"><span class="kind">Beats</span></span><div class="t ${l.title || f ? '' : 'empty'}">${esc(l.title || (f && f.text) || 'Untitled')}</div><div class="f">${l.beats.length} beat${l.beats.length === 1 ? '' : 's'}</div></div>`; }
  const t = Store.text(l.id), first = t.split('\n').find(z => z.trim()) || '';
  return `<div class="card light" data-loose="${l.id}"><span class="no"><span class="kind">Writing</span></span><div class="t ${l.title || first ? '' : 'empty'}">${esc(l.title || first || 'Untitled')}</div><div class="f"><span class="w">${kfmt(Store.words(t))}</span></div></div>`;
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
          <span class="seq-tools">${q.doc ? `<button class="tb" data-seq-doc="${q.id}" title="Google Doc">${ICON.doc}</button>` : ''}<button class="tb" data-seq-menu="${q.id}">${ICON.more}</button></span></div>
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
}
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
    menu(el, [{ label: 'Open', act: () => openItem('scene', s.id, view) },
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
      return `<div class="lcard" data-kind="scene" data-id="${s.id}"><div class="kind scene">Scene</div><div class="t">${esc(s.title || 'Untitled')}</div><div class="p">${esc(s.summary || '')}</div></div>`;
    }
    const l = x.item;
    if (l.kind === 'beats') return `<div class="lcard" data-kind="beats" data-id="${l.id}"><div class="kind beats">Beats</div>${l.title ? `<div class="t">${esc(l.title)}</div>` : ''}<div class="p beats">${l.beats.filter(b => b.text).map((b, i) => '<div>' + (i && b.link ? `<span class="lk ${b.link}">${LINK_LABEL[b.link]}</span>` : '') + esc(b.text) + '</div>').join('')}</div></div>`;
    const t = Store.text(l.id);
    return `<div class="lcard" data-kind="writing" data-id="${l.id}"><div class="kind">Writing${l.memo ? ' · voice' : ''}</div>${l.title ? `<div class="t">${esc(l.title)}</div>` : ''}<div class="p">${esc(t.slice(0, 400))}</div></div>`;
  }).join('') : '<div class="empty-note">Nothing loose.</div>';
}
document.querySelector('.loose-add').onclick = (e) => {
  const k = e.target.closest('[data-new]'); if (!k) return;
  if (k.dataset.new === 'scene') { const s = Store.addScene({ title: '' }, null); openItem('scene', s.id, 'loose'); setTimeout(() => $('itemTitle').focus(), 80); }
  else { const l = Store.addLoose(k.dataset.new); openItem(l.kind, l.id, 'loose'); if (k.dataset.new === 'beats') setTimeout(() => { const t = document.querySelector('#chain textarea'); t && t.focus(); }, 80); }
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
  let opened = null;
  if (kind === 'scene') { if (t.seq) Store.moveScene(id, t.seq); }
  else if (t.scene) { Store.fileInto(id, t.scene); opened = t.scene; }
  else if (t.seq) { const s = kind === 'beats' ? Store.chainToScene(id, t.seq) : Store.writingToScene(id, t.seq); opened = s && s.id; }
  if (view === 'item' && item && item.id === id) { if (opened) openItem('scene', opened, 'story'); else { paintTop(); render(); } }
  else render();
}
$('fileBtn').onclick = () => { if (!item) return; Pad.settle(); fileIn(item.kind, item.id); };
$('chainSceneBtn').onclick = async () => {
  if (!item) return;
  const t = await pick({ seqs: true, loose: true, title: 'Make a scene in' }); if (!t) return;
  const s = Store.chainToScene(item.id, t.seq || null); if (s) openItem('scene', s.id, t.seq ? 'story' : 'loose');
};

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
function renderChain(focus) {
  const bs = chain(); if (!bs) return;
  const cur = bs.findIndex(b => !b.done), done = bs.filter(b => b.done).length;
  $('beatCnt').textContent = bs.length ? `${done}/${bs.length}` : '';
  let h = '';
  bs.forEach((b, i) => {
    if (i > 0) h += `<li class="lk-row"><button class="lk ${b.link || 'and'}" data-link="${i}">${LINK_LABEL[b.link || 'and']}</button></li>`;
    const has = b.notes.trim() || b.dialogue.length;
    h += `<li class="beat ${b.done ? 'done' : ''} ${i === cur && item.kind === 'scene' ? 'cur' : ''}" data-i="${i}"><button class="tick" data-tick="${i}" aria-label="Written">✓</button>
      <textarea rows="1" data-bt="${i}" placeholder="Beat">${esc(b.text)}</textarea><button class="nb ${has ? 'has' : ''}" data-notes="${i}" aria-label="Notes and dialogue">${ICON.notes}</button></li>`;
  });
  h += `<li><button class="add-beat" data-add-beat="1">+ Beat</button></li>`;
  $('chain').innerHTML = h;
  $('chain').querySelectorAll('textarea').forEach(grow);
  if (focus != null) { const t = $('chain').querySelector(`[data-bt="${focus}"]`); if (t) { t.focus(); const n = t.value.length; t.setSelectionRange(n, n); t.scrollIntoView({ block: 'nearest' }); } }
}
$('chain').addEventListener('input', (e) => {
  const t = e.target.closest('[data-bt]'); if (!t) return;
  const bs = chain(), b = bs[+t.dataset.bt]; if (!b) return;
  if (/\n/.test(t.value)) t.value = t.value.replace(/\n+/g, ' ');
  b.text = t.value; grow(t); chainChanged();
});
$('chain').addEventListener('keydown', (e) => {
  const t = e.target.closest('[data-bt]'); if (!t || e.isComposing) return;
  const bs = chain(), i = +t.dataset.bt;
  if (e.key === 'Enter') { e.preventDefault(); bs.splice(i + 1, 0, Store.newBeat({ link: 'and' })); fixLinks(bs); chainChanged(); renderChain(i + 1); }
  else if (e.key === 'Backspace' && !t.value && bs.length > 1) { e.preventDefault(); bs.splice(i, 1); fixLinks(bs); chainChanged(); renderChain(Math.max(0, i - 1)); }
});
$('chain').addEventListener('click', (e) => {
  const bs = chain(); if (!bs) return;
  const lk = e.target.closest('[data-link]'), nb = e.target.closest('[data-notes]'), add = e.target.closest('[data-add-beat]');
  if (lk) { const b = bs[+lk.dataset.link]; b.link = NEXT_LINK[b.link || 'and']; chainChanged(); renderChain(); }
  else if (nb) openNotes(+nb.dataset.notes);
  else if (add) { bs.push(Store.newBeat({ link: bs.length ? 'and' : '' })); fixLinks(bs); chainChanged(); renderChain(bs.length - 1); }
});
pressDrag($('chain'), '.beat', {
  handle: '.tick', scroller: () => $('chain'),
  tap: (el) => {
    const bs = chain(), i = +el.dataset.i, b = bs[i]; if (!b) return;
    b.done = !b.done; chainChanged(); renderChain();
    if (b.done) { const nx = $('chain').querySelector('.beat.cur'); if (nx) nx.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  },
  menu: (el) => openNotes(+el.dataset.i),
  move: (x, y, st) => {
    document.querySelectorAll('#chain .ins-y').forEach(z => z.remove());
    const rows = [...$('chain').querySelectorAll('.beat')].filter(r => r !== st.el);
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
   a scene: details, stage, Doc
   ===================================================================== */
$('detailsBtn').onclick = () => {
  const s = Store.scene(item.id); if (!s) return;
  const w = s.seqId ? Store.where(s.seqId) : null;
  sheet('Details', 'center', (body) => {
    body.innerHTML = `<div class="field"><label>Summary</label><textarea id="dSum" rows="3">${esc(s.summary)}</textarea></div>
      <div class="grid2"><div class="field"><label>POV</label><input id="dPov" value="${esc(s.pov)}" autocomplete="off"></div><div class="field"><label>Location</label><input id="dLoc" value="${esc(s.location)}" autocomplete="off"></div></div>
      <div class="field"><label>Date</label><input id="dDate" value="${esc(s.date)}" autocomplete="off"></div>
      <div class="field"><label>Status</label><div class="seg" id="dSt">${Store.STATUSES.map(([k, l]) => `<button data-st="${k}" aria-pressed="${s.status === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><label>Where</label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="font:15px var(--serif);color:var(--muted)">${w ? esc(Store.seqLabel(w.seq)) : 'Loose Pages'}</span>
        <button class="btn quiet" id="dMove">${w ? 'Move…' : 'File in…'}</button>${w ? '<button class="btn quiet" id="dLoose">Move to Loose</button>' : ''}</div></div>
      <button class="btn danger" id="dDel" style="align-self:flex-start">Delete scene</button>`;
    body.querySelectorAll('textarea').forEach(grow);
    const set = (k, v) => { s[k] = v; Store.touchScene(s, { details: true }); };
    body.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'dSum') { set('summary', e.target.value); grow(e.target); } else if (id === 'dPov') set('pov', e.target.value); else if (id === 'dLoc') set('location', e.target.value); else if (id === 'dDate') set('date', e.target.value);
    });
    body.addEventListener('click', (e) => {
      const st = e.target.closest('[data-st]');
      if (st) { set('status', st.dataset.st); body.querySelectorAll('[data-st]').forEach(b => b.setAttribute('aria-pressed', String(b === st))); }
      if (e.target.id === 'dMove') { closeLayer(); fileIn('scene', s.id).then(paintTop); }
      if (e.target.id === 'dLoose') { closeLayer(); Store.moveScene(s.id, null); item.from = 'loose'; paintTop(); }
      if (e.target.id === 'dDel') { if (!e.target.classList.contains('armed')) { e.target.classList.add('armed'); e.target.textContent = 'Tap again to delete'; return; } closeLayer(); deleteScene(s); }
    });
  });
};
$('stageBtn').onclick = () => {
  const s = Store.scene(item.id); if (!s) return;
  const vers = Store.ms(s.id).versions.slice().reverse();
  const when = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  menu($('stageBtn'), [{ head: 'Stage' },
    ...Store.STAGES.map(([k, l]) => ({ label: l, checked: s.stage === k, confirm: s.stage === k ? null : 'Start ' + l, act: () => { if (s.stage !== k) { Pad.settle().then(() => { Store.setStage(s.id, k); paintTop(); }); } } })),
    vers.length ? { hr: true } : null, vers.length ? { head: 'Earlier' } : null,
    ...vers.map(v => ({ label: Store.stageLabel(v.stage), small: when(v.at), act: () => viewVersion(v) }))]);
};
function viewVersion(v) {
  Pad.settle();
  const label = Store.stageLabel(v.stage) + ' · ' + new Date(v.at).toLocaleDateString([], { month: 'short', day: 'numeric' });
  Pad.view(label, v.text); $('viewingLbl').textContent = label; $('viewing').hidden = false;
}
$('viewingBack').onclick = () => { $('viewing').hidden = true; Pad.unview(); };
$('docBtn').onclick = () => { const s = Store.scene(item.id), q = s && s.seqId && Store.seq(s.seqId), u = q && Google.Docs.url(q); if (u) window.open(u, '_blank'); };

/* =====================================================================
   Write, Capture, Recent
   ===================================================================== */
$('writeBtn').onclick = () => {
  if (view === 'item' && item.kind !== 'beats') { $('viewing').hidden = true; Pad.unview(); $('scribble').focus({ preventScroll: true }); return; }
  const l = Store.addLoose('writing'); openItem('writing', l.id, view === 'item' ? item.from : view);
};
$('recentBtn').onclick = () => {
  const r = Store.recent().slice(0, 10);
  menu($('recentBtn'), r.length ? r.map(x => {
    if (x.kind === 'scene') { const s = Store.scene(x.id); return { label: Store.sceneLabel(s), small: s.seqId ? '' : 'Loose', act: () => openItem('scene', s.id, s.seqId ? 'story' : 'loose') }; }
    const l = Store.looseItem(x.id), t = l.kind === 'beats' ? (l.title || (l.beats.find(b => b.text) || {}).text || 'Beats') : (l.title || (Store.text(l.id).split('\n').find(z => z.trim()) || 'Writing'));
    return { label: t.slice(0, 48), small: l.kind === 'beats' ? 'Beats' : 'Writing', act: () => openItem(l.kind, l.id, 'loose') };
  }) : [{ note: 'Nothing yet.' }]);
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
      if (kind === 'scene') { const lines = text.split('\n'); Store.addScene({ title: lines[0].slice(0, 120), summary: lines.slice(1).join('\n').trim() }, null); }
      else if (kind === 'beats') { const lines = text.split('\n').map(x => x.trim()).filter(Boolean); Store.addLoose('beats', { beats: lines.map((t, i) => ({ text: t, link: i ? 'and' : '' })) }); }
      else {
        const l = Store.addLoose('writing', { text });
        if (memo) { const id = Store.uid('m-'); await Google.Memos.put(id, memo.blob); l.memo = { id, mime: memo.mime, dur: memo.dur, driveId: '' }; Store.changed({ loose: true }); }
      }
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
  menu($('menuBtn'), [{ head: 'Book' },
    ...Store.data.books.map(b => ({ label: Store.bookLabel(b), checked: b.id === cur, act: () => { Store.setBook(b.id); go('story'); } })),
    { label: 'New book…', act: async () => { const v = await promptSheet('New book', '', 'Name'); if (v !== null) { const b = Store.addBook(v); Store.setBook(b.id); go('story'); } } },
    { label: 'Rename this book…', act: async () => { const b = Store.book(cur); const v = await promptSheet('Book', b.name, 'Name'); if (v !== null) Store.rename('book', b.id, v); render(); } },
    { hr: true }, { head: 'Google' }, ...gl,
    { hr: true },
    { label: 'Earlier copies…', act: copiesSheet },
    { label: 'Writing pad…', act: padSheet },
    { label: 'Export this book', act: exportBook },
    { label: 'Download a backup', act: () => saveFile(`istory-backup-${stamp()}.json`, Store.exportJSON(), 'application/json') },
    { label: 'Restore a backup…', act: () => $('restoreIn').click() },
    empty ? { label: 'Bring in Story Studio…', act: bringStudio } : null,
    { ver: 'iStory · ' + BUILD }]);
};
function copiesSheet() {
  Google.Copies.list().then(list => {
    sheet('Earlier copies', 'center', (body) => {
      if (!list.length) { body.innerHTML = '<div class="empty-note">None yet.</div>'; return; }
      body.innerHTML = list.map((c, i) => `<div class="set-row"><span style="font:15px var(--serif)">${new Date(c.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<br><small style="color:var(--faint);font:12.5px var(--ui)">${esc(c.reason)} · ${c.scenes} scenes · ${kfmt(c.words || 0)} words</small></span><button class="btn" data-i="${i}">Put back</button></div>`).join('');
      body.onclick = async (e) => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again'; return; }
        closeLayer(); await Google.Copies.putBack(+b.dataset.i); go('story');
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
Google.onState((s) => {
  const d = $('syncDot'); d.className = 'dot' + (s.mode === 'error' ? ' bad' : ['reconnect', 'offline', 'conflict'].includes(s.mode) ? ' warn' : '');
  if (s.mode === 'error' && s.msg) banner(s.msg);
});
document.addEventListener('pointerdown', () => Google.gesture(), true);
addEventListener('pagehide', () => { Pad.settle(); Store.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { Pad.settle(); Store.flush(); } });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && layer.children.length) closeLayer(); });

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
    navigator.serviceWorker.addEventListener('controllerchange', async () => { if (had && !reloading) { reloading = true; await Pad.settle(); await Store.flush(); location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { reg.update().catch(() => {}); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }); }).catch(() => {});
  }
  window.__istory = { go, openItem, render, get view() { return view; }, get item() { return item; } };
})();
})();
