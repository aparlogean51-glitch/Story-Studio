/* =====================================================================
   Cast screens: the cast, and one character.
   ===================================================================== */
(() => {
'use strict';
const D = window.Cast, G = window.CastDrive;
const BUILD = 'Nov 9 · da0e3';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ini = (c) => esc((c.name.trim()[0] || '·').toUpperCase());
const ICON_CAM = '<svg class="i" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const UIK = 'cast_ui';
const ui = () => { try { return JSON.parse(localStorage.getItem(UIK) || '{}'); } catch (e) { return {}; } };
const setUi = (p) => { try { localStorage.setItem(UIK, JSON.stringify({ ...ui(), ...p })); } catch (e) {} };

let view = 'list', cur = null, story = null, order = [];
const narrow = () => innerWidth < 900;

/* ---------- layer: menus, sheets, the rare question ---------- */
const layer = $('layer');
let onClose = null;
function closeLayer() { const f = onClose; onClose = null; layer.innerHTML = ''; f && f(); }
function scrim(close = true) { const d = document.createElement('div'); d.id = 'scrim'; if (close) d.onclick = closeLayer; layer.append(d); }
function menu(anchor, items) {
  closeLayer(); scrim();
  const m = document.createElement('div'); m.className = 'menu';
  for (const it of items) {
    if (!it) continue;
    if (it.hr) { m.append(document.createElement('hr')); continue; }
    if (it.head || it.note || it.ver) { const h = document.createElement('div'); h.className = it.head ? 'head' : it.ver ? 'ver' : 'note' + (it.bad ? ' bad' : ''); h.textContent = it.head || it.note || it.ver; m.append(h); continue; }
    const b = document.createElement('button');
    if (it.checked !== undefined) b.setAttribute('aria-checked', String(!!it.checked));
    b.innerHTML = esc(it.label) + (it.small ? `<small>${esc(it.small)}</small>` : '');
    b.onclick = () => { if (it.confirm && !b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = it.confirm; return; } closeLayer(); it.act && it.act(); };
    m.append(b);
  }
  layer.append(m);
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let x = Math.min(innerWidth - mw - 10, Math.max(10, r.right - mw)), y = r.bottom + 6;
  if (x + mw > innerWidth - 10 || r.left < innerWidth / 2) x = Math.max(10, Math.min(r.left, innerWidth - mw - 10));
  if (y + mh > innerHeight - 10) y = Math.max(10, r.top - mh - 6);
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
function sheet(title, build, opts = {}) {
  closeLayer(); scrim(opts.scrimClose !== false);
  const s = document.createElement('div'); s.className = 'sheet ' + (opts.cls || '');
  s.innerHTML = `<div class="sh-head"><h2>${esc(title)}</h2>${opts.extra || ''}<button class="btn quiet" data-close>${esc(opts.done || 'Done')}</button></div><div class="sh-body"></div>`;
  s.querySelector('[data-close]').onclick = closeLayer;
  layer.append(s); build(s.querySelector('.sh-body'), s); onClose = opts.onClose || null;
  return s;
}
function ask(title, body, buttons) {
  return new Promise((res) => {
    closeLayer(); scrim(false);
    const s = document.createElement('div'); s.className = 'sheet';
    s.innerHTML = `<div class="sh-head"><h2>${esc(title)}</h2></div><div class="sh-body"><p>${esc(body)}</p><div class="row2">${buttons.map((b, i) => `<button class="btn ${i === 0 ? 'primary' : 'quiet'}" data-i="${i}">${esc(b)}</button>`).join('')}</div></div>`;
    s.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { layer.innerHTML = ''; onClose = null; res(+b.dataset.i); } };
    layer.append(s);
  });
}
G.ask = ask;
function banner(msg) { if (!msg) { $('banner').hidden = true; return; } $('bannerMsg').textContent = msg; $('banner').hidden = false; }
$('bannerX').onclick = () => banner('');
D.onError = banner;
const grow = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
async function fillImgs(root) {
  for (const img of root.querySelectorAll('img[data-pid]')) { const u = await D.img.url(img.dataset.pid); if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('span'), { className: 'ini', textContent: img.dataset.ini || '' })); }
}
const thumb = (c) => c.portrait ? `<img data-pid="${c.portrait.id}" data-ini="${ini(c)}" alt="">` : `<span class="ini">${ini(c)}</span>`;

/* ---------- where each character appears (from iStory on this iPad) ---------- */
const apCache = new Map();
function appear(c) {
  const k = c.id + '|' + c.name + '|' + c.aka;
  const hit = apCache.get(c.id);
  if (hit && hit.k === k) return hit.v;
  const v = D.appearances(story, c); apCache.set(c.id, { k, v }); return v;
}
async function loadStory() { story = await D.readStory(); apCache.clear(); }

/* =====================================================================
   the cast
   ===================================================================== */
function groups() {
  const q = $('search').value.trim().toLowerCase();
  const all = D.data.chars.filter(c => !q || [c.name, c.aka, c.line, c.people, c.role].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.name || '~').localeCompare(b.name || '~'));
  const out = [];
  if ((ui().group || 'role') === 'role') {
    for (const r of [...D.ROLES, '']) { const cs = all.filter(c => c.role === r); if (cs.length) out.push([r || 'No role', cs]); }
  } else {
    const books = (story && story.books) || [];
    books.forEach((b, i) => { const cs = all.filter(c => appear(c).books.has(b.id)); if (cs.length) out.push([`Book ${i + 1}${b.name ? ': ' + b.name : ''}`, cs]); });
    const none = all.filter(c => !appear(c).books.size); if (none.length) out.push([story ? 'Not in a scene yet' : 'iStory isn’t on this iPad', none]);
  }
  return out;
}
function renderList() {
  const gs = groups(), seen = new Set();
  order = []; for (const [, cs] of gs) for (const c of cs) if (!seen.has(c.id)) { seen.add(c.id); order.push(c.id); }
  $('list').innerHTML = gs.length ? gs.map(([t, cs]) => `<h2 class="grp">${esc(t)} <span>${cs.length}</span></h2><div class="grid">${cs.map(c =>
    `<button class="cc" data-id="${c.id}"><div class="ph">${thumb(c)}</div><div class="nm ${c.name ? '' : 'empty'}">${esc(c.name || 'Unnamed')}</div>${c.role ? `<div class="rl">${esc(c.role)}${c.people ? ' · ' + esc(c.people) : ''}</div>` : c.people ? `<div class="rl">${esc(c.people)}</div>` : ''}${c.line ? `<div class="ln">${esc(c.line)}</div>` : ''}</button>`).join('')}</div>`).join('')
    : `<div class="empty-note">${D.data.chars.length ? 'No one matches.' : 'No characters yet.'}</div>`;
  fillImgs($('list'));
}
$('list').addEventListener('click', (e) => { const c = e.target.closest('.cc'); if (c) openChar(c.dataset.id); });
$('search').addEventListener('input', renderList);
document.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { setUi({ group: b.dataset.group }); paintTop(); renderList(); });

/* =====================================================================
   one character
   ===================================================================== */
const field = (k, label, c, opts = {}) => `<div class="f ${opts.wide ? 'wide' : ''}"><label>${label}</label>${opts.area ? `<textarea rows="1" data-k="${k}">${esc(c[k])}</textarea>` : `<input data-k="${k}" value="${esc(c[k])}" autocomplete="off">`}</div>`;
const sec = (k, label, c) => `<div class="sec"><h3>${label}</h3><textarea rows="1" data-k="${k}">${esc(c[k])}</textarea></div>`;
function renderChar() {
  const c = D.char(cur); if (!c) { go('list'); return; }
  const lookOpen = ui().looks || D.LOOKS.some(([k]) => c.looks[k]);
  const ap = appear(c);
  let h = `<div class="wrap"><div class="hero">
    <button class="portrait" id="portrait" aria-label="Portrait">${c.portrait ? `<img data-pid="${c.portrait.id}" data-ini="${ini(c)}" alt="">` : ICON_CAM}</button>
    <div class="facts">
      <div class="f"><label>Role</label><button class="role ${c.role ? '' : 'empty'}" id="roleBtn">${esc(c.role || '—')}</button></div>
      ${field('age', 'Age', c)}${field('people', 'People', c)}
      ${field('aka', 'Also called', c, { wide: true })}
      ${field('line', 'In a line', c, { wide: true, area: true })}
    </div></div>
  <div class="cols"><div class="col">
    ${D.SECTIONS.map(([k, l]) => sec(k, l, c)).join('')}
    <div class="sec"><h3>Arc</h3><div class="arc"><textarea rows="1" data-k="arcFrom" aria-label="Start">${esc(c.arcFrom)}</textarea><span class="to">→</span><textarea rows="1" data-k="arcTo" aria-label="End">${esc(c.arcTo)}</textarea></div></div>
    <div class="sec"><h3>Look<button class="more" id="moreBtn" aria-pressed="${lookOpen}">More detail</button></h3><textarea rows="1" data-k="look">${esc(c.look)}</textarea>
      <div class="looks" id="looks" ${lookOpen ? '' : 'hidden'}>${D.LOOKS.map(([k, l]) => `<div class="f"><label>${l}</label><input data-l="${k}" value="${esc(c.looks[k])}" autocomplete="off"></div>`).join('')}</div></div>
    ${sec('notes', 'Notes', c)}
  </div><div class="col side">
    <div class="sec"><h3>Relationships</h3>${relsHtml(c)}<button class="add" id="addRel">+ Relationship</button></div>
    ${storyHtml(c, ap)}
  </div></div></div>`;
  const el = $('char'), y = cur === el.dataset.id ? el.scrollTop : 0;
  el.innerHTML = h; el.dataset.id = cur; el.scrollTop = y;
  el.querySelectorAll('textarea').forEach(grow);
  fillImgs(el);
}
function relsHtml(c) {
  return D.relsOf(c.id).map(x => { const o = D.char(x.other); if (!o) return '';
    return `<div class="rel" data-rel="${x.r.id}" data-side="${x.side}"><span class="th">${thumb(o)}</span><button class="who" data-open="${o.id}">${esc(o.name || 'Unnamed')}</button>
      <input data-rl value="${esc(x.side === 'ab' ? x.r.ab : x.r.ba)}" autocomplete="off"><button class="x" data-xrel aria-label="Remove">×</button></div>`; }).join('');
}
function storyHtml(c, ap) {
  if (!story) return `<div class="sec"><h3>In the story</h3><div class="quiet">iStory isn’t on this iPad.</div></div>`;
  if (!D.names(c).length) return '';
  if (!ap.scenes.length) return `<div class="sec"><h3>In the story</h3><div class="quiet">Not in a scene yet.</div></div>`;
  const pov = ap.scenes.filter(s => s.pov).length, max = Math.max(1, ...ap.acts.map(a => a.scenes));
  const books = [...new Set(ap.acts.map(a => a.book))];
  let acts = '';
  for (const b of books) {
    if (books.length > 1) acts += `<div class="bookhd">Book ${story.books.indexOf(b) + 1}${b.name ? ': ' + esc(b.name) : ''}</div>`;
    for (const a of ap.acts.filter(x => x.book === b)) acts += `<div class="actrow ${a.scenes ? '' : 'zero'}"><span class="nm">Act ${a.no}${a.act.name ? ' · ' + esc(a.act.name) : ''}</span><span class="bar"><i class="p" style="width:${a.pov / max * 100}%"></i><i style="width:${(a.scenes - a.pov) / max * 100}%"></i></span><span class="n">${a.scenes}${a.pov ? ' · ' + a.pov + ' POV' : ''}</span></div>`;
  }
  const multi = books.length > 1;
  return `<div class="sec"><h3>In the story</h3><div class="tally">${ap.scenes.length} scene${ap.scenes.length === 1 ? '' : 's'}${pov ? ` · ${pov} as POV` : ''}</div><div class="acts">${acts}</div></div>
    <div class="sec"><h3>Scenes</h3><div class="scenes">${ap.scenes.map(s => `<div class="sc"><span class="no">${multi ? 'B' + (story.books.indexOf(s.book) + 1) + '·' : ''}${s.no}</span><span>${esc(s.title || 'Untitled')}<small>${esc(s.seq || '')}</small></span><span class="pov">${s.pov ? 'POV' : ''}</span></div>`).join('')}</div></div>
    ${ap.lines.length ? `<div class="sec"><h3>Lines</h3><div class="lines">${ap.lines.slice(0, 40).map(l => `<div class="ql">${esc(l.line)}<small>Scene ${l.no}${l.title ? ' · ' + esc(l.title) : ''}</small></div>`).join('')}</div></div>` : ''}`;
}
$('char').addEventListener('input', (e) => {
  const c = D.char(cur); if (!c) return;
  const t = e.target;
  if (t.tagName === 'TEXTAREA') grow(t);
  if (t.dataset.k) { c[t.dataset.k] = t.value; D.touch(c, { field: t.dataset.k }); if (t.dataset.k === 'aka') scheduleSide(); }
  else if (t.dataset.l) { c.looks[t.dataset.l] = t.value; D.touch(c, { field: 'looks' }); }
  else if (t.dataset.rl != null) { const row = t.closest('.rel'), r = D.data.rels.find(x => x.id === row.dataset.rel); if (r) { r[row.dataset.side] = t.value; D.changed({ rels: true, field: 'rel' }); } }
});
let sideT = 0;
function scheduleSide() { clearTimeout(sideT); sideT = setTimeout(() => { const c = D.char(cur); const side = $('char').querySelector('.col.side'); if (!c || !side) return; const keep = document.activeElement && side.contains(document.activeElement); if (keep) return; side.innerHTML = `<div class="sec"><h3>Relationships</h3>${relsHtml(c)}<button class="add" id="addRel">+ Relationship</button></div>${storyHtml(c, appear(c))}`; fillImgs(side); }, 600); }
$('char').addEventListener('click', (e) => {
  const c = D.char(cur); if (!c) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'portrait') portraitMenu(b, c);
  else if (b.id === 'roleBtn') menu(b, [...D.ROLES.map(r => ({ label: r, checked: c.role === r, act: () => { c.role = r; D.touch(c, { field: 'role' }); b.textContent = r; b.classList.remove('empty'); } })),
    { hr: true }, { label: 'None', act: () => { c.role = ''; D.touch(c, { field: 'role' }); b.textContent = '—'; b.classList.add('empty'); } }]);
  else if (b.id === 'moreBtn') { const open = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(open)); $('looks').hidden = !open; setUi({ looks: open }); }
  else if (b.id === 'addRel') addRel(c);
  else if (b.dataset.open) openChar(b.dataset.open);
  else if (b.dataset.xrel != null) { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.style.color = '#f0a090'; return; } D.deleteRel(b.closest('.rel').dataset.rel); renderChar(); }
});
function addRel(c) {
  const taken = new Set(D.relsOf(c.id).map(x => x.other));
  sheet('Relationship', (body) => {
    body.innerHTML = `<div class="f"><input id="relQ" placeholder="Name" autocomplete="off" autocorrect="off"></div><div id="relList" style="display:flex;flex-direction:column;gap:2px"></div>`;
    const q = body.querySelector('#relQ'), listEl = body.querySelector('#relList');
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const cs = D.data.chars.filter(o => o.id !== c.id && !taken.has(o.id) && (!s || (o.name + ' ' + o.aka).toLowerCase().includes(s))).sort((a, b) => a.name.localeCompare(b.name));
      listEl.innerHTML = cs.map(o => `<button class="pick" data-id="${o.id}"><span class="th">${thumb(o)}</span>${esc(o.name || 'Unnamed')}</button>`).join('') +
        (q.value.trim() && !D.data.chars.some(o => o.name.trim().toLowerCase() === s) ? `<button class="pick" data-new="1"><span class="th">+</span>New: ${esc(q.value.trim())}</button>` : '');
      fillImgs(listEl);
    };
    q.addEventListener('input', draw); draw();
    listEl.onclick = (e) => {
      const p = e.target.closest('.pick'); if (!p) return;
      let id = p.dataset.id;
      if (p.dataset.new) id = D.addChar({ name: q.value.trim() }).id;
      const r = D.addRel(c.id, id, ''); closeLayer(); renderChar();
      const inp = $('char').querySelector(`.rel[data-rel="${r.id}"] input`); inp && inp.focus();
    };
    setTimeout(() => q.focus(), 60);
  }, { done: 'Cancel' });
}

/* ---------- portraits: a photo, or a Pencil sketch ---------- */
let photoFor = null;
function portraitMenu(anchor, c) {
  menu(anchor, [{ label: 'Choose photo', act: () => { photoFor = c.id; $('photoIn').click(); } }, { label: 'Sketch', act: () => sketch(c) },
    c.portrait ? { label: 'Remove portrait', confirm: 'Tap again to remove', act: () => { c.portrait = null; D.touch(c, { portrait: true }); renderChar(); } } : null]);
}
async function setPortrait(c, blob) {
  const id = D.uid('p-'); await D.img.put(id, blob);
  c.portrait = { id, at: Date.now() }; D.touch(c, { portrait: true });
  if (view === 'char' && cur === c.id) renderChar();
}
$('photoIn').onchange = async () => {
  const f = $('photoIn').files[0]; $('photoIn').value = ''; const c = D.char(photoFor); if (!f || !c) return;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(f));
    const s = Math.min(1, 1100 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .86));
    await setPortrait(c, blob);
  } catch (e) { banner('That photo couldn’t be used: ' + e.message); }
};
function sketch(c) {
  sheet('Sketch', (body) => {
    body.innerHTML = `<canvas id="sk" width="800" height="1000"></canvas><div class="sktools"><div class="seg" id="skTool"><button data-t="pen" aria-pressed="true">Pen</button><button data-t="erase" aria-pressed="false">Eraser</button></div>
      <span style="flex:1"></span><button class="btn quiet" id="skUndo">Undo</button><button class="btn quiet" id="skClear">Clear</button><button class="btn primary" id="skSave">Save</button></div>`;
    const cv = body.querySelector('#sk'), g = cv.getContext('2d'), PAPER = '#ece8df';
    g.fillStyle = PAPER; g.fillRect(0, 0, 800, 1000); g.lineCap = 'round'; g.lineJoin = 'round';
    const hist = []; let tool = 'pen', live = null, penSeen = false;
    const snap = () => { hist.push(g.getImageData(0, 0, 800, 1000)); if (hist.length > 25) hist.shift(); };
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 800 / r.width, (e.clientY - r.top) * 1000 / r.height, e.pressure || .5]; };
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') penSeen = true; else if (e.pointerType === 'touch' && penSeen) return;   // the hand resting on the screen doesn't draw
      e.preventDefault(); snap(); live = { id: e.pointerId, last: pt(e) }; try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener('pointermove', (e) => {
      if (!live || e.pointerId !== live.id) return; e.preventDefault();
      for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) {
        const p = pt(ev), a = live.last;
        g.strokeStyle = tool === 'pen' ? '#24221f' : PAPER; g.lineWidth = tool === 'pen' ? 1.2 + p[2] * 4.5 : 34;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(p[0], p[1]); g.stroke(); live.last = p;
      }
    });
    const end = () => { live = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    body.querySelector('#skTool').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tool = b.dataset.t; body.querySelectorAll('#skTool button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
    body.querySelector('#skUndo').onclick = () => { const s = hist.pop(); if (s) g.putImageData(s, 0, 0); };
    body.querySelector('#skClear').onclick = () => { snap(); g.fillStyle = PAPER; g.fillRect(0, 0, 800, 1000); };
    body.querySelector('#skSave').onclick = () => { if (!hist.length) { closeLayer(); return; } cv.toBlob(async (b) => { closeLayer(); await setPortrait(c, b); }, 'image/jpeg', .9); };
  }, { cls: 'sketch', done: 'Cancel', scrimClose: false });
}

/* =====================================================================
   moving around
   ===================================================================== */
function paintTop() {
  const ch = view === 'char';
  $('listBar').hidden = ch; $('appName').hidden = ch;
  $('listBar').style.display = ch ? 'none' : 'contents';
  $('back').hidden = !ch; $('nameIn').hidden = !ch; $('prevBtn').hidden = !ch; $('nextBtn').hidden = !ch; $('addBtn').hidden = ch;
  document.querySelectorAll('[data-group]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.group === (ui().group || 'role'))));
  if (ch) {
    const c = D.char(cur), i = order.indexOf(cur);
    if (document.activeElement !== $('nameIn')) $('nameIn').value = c ? c.name : '';
    $('nameIn').size = Math.max(8, Math.min(34, ($('nameIn').value || 'Name').length + 1));
    $('prevBtn').disabled = i <= 0; $('nextBtn').disabled = i < 0 || i >= order.length - 1;
  }
  document.body.classList.toggle('narrow', narrow());
}
function go(v) { view = v; $('list').hidden = v !== 'list'; $('char').hidden = v !== 'char'; if (v === 'list') { cur = null; setUi({ open: null }); renderList(); } paintTop(); }
function openChar(id) {
  if (!D.char(id)) return;
  if (!order.includes(id)) renderList();
  cur = id; view = 'char'; $('list').hidden = true; $('char').hidden = false; setUi({ open: id });
  $('char').dataset.id = ''; renderChar(); paintTop(); $('char').scrollTop = 0;
}
$('back').onclick = () => go('list');
$('prevBtn').onclick = () => { const i = order.indexOf(cur); if (i > 0) openChar(order[i - 1]); };
$('nextBtn').onclick = () => { const i = order.indexOf(cur); if (i >= 0 && i < order.length - 1) openChar(order[i + 1]); };
$('addBtn').onclick = () => { const c = D.addChar({}); renderList(); openChar(c.id); setTimeout(() => $('nameIn').focus(), 60); };
$('nameIn').addEventListener('input', () => { const c = D.char(cur); if (!c) return; c.name = $('nameIn').value; D.touch(c, { field: 'name' }); $('nameIn').size = Math.max(8, Math.min(34, (c.name || 'Name').length + 1)); scheduleSide(); });
$('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('nameIn').blur(); } });
addEventListener('resize', () => paintTop());

/* ---------- the menu ---------- */
const agoTxt = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
$('menuBtn').onclick = () => {
  const st = G.state, c = view === 'char' && D.char(cur);
  const gl = !G.signedIn ? [{ label: 'Sign in to Google', act: () => G.signIn().catch(e => banner(e.message)) }]
    : [['error', 'offline', 'reconnect'].includes(st.mode) ? { note: st.msg || st.mode, bad: st.mode === 'error' } : { note: st.lastOk ? 'Synced ' + agoTxt(st.lastOk) : 'Signed in' },
      { label: 'Sync now', act: () => { G.gesture(); G.Sync.cycle('now'); } }, { label: 'Sign out of Google', act: () => G.signOut() }];
  menu($('menuBtn'), [
    c ? { label: 'Delete character', confirm: 'Tap again to delete', act: () => { D.deleteChar(c.id); go('list'); } } : null, c ? { hr: true } : null,
    { head: 'Google' }, ...gl, { hr: true },
    D.data.trash.length ? { label: 'Deleted characters…', act: trashSheet } : null,
    { label: 'Earlier copies…', act: copiesSheet },
    { label: 'Download a backup', act: backup },
    { label: 'Restore a backup…', act: () => $('restoreIn').click() },
    { ver: 'Cast · ' + BUILD }]);
};
function trashSheet() {
  sheet('Deleted characters', (body) => {
    body.innerHTML = D.data.trash.map((t, i) => `<div class="cprow"><span>${esc(t.char.name || 'Unnamed')}<small>${new Date(t.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></span><button class="btn" data-i="${i}">Put back</button></div>`).join('');
    body.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const c = D.restoreChar(+b.dataset.i); closeLayer(); if (c) openChar(c.id); };
  });
}
function copiesSheet() {
  G.Copies.list().then(list => sheet('Earlier copies', (body) => {
    if (!list.length) { body.innerHTML = '<p class="quiet">None yet.</p>'; return; }
    body.innerHTML = list.map((c, i) => `<div class="cprow"><span>${new Date(c.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<small>${esc(c.reason)} · ${c.n} characters</small></span><button class="btn" data-i="${i}">Put back</button></div>`).join('');
    body.onclick = async (e) => { const b = e.target.closest('[data-i]'); if (!b) return; if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again'; return; } closeLayer(); await G.Copies.putBack(+b.dataset.i); go('list'); };
  }));
}
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const toDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(''); r.readAsDataURL(b); });
async function backup() {
  const imgs = {};
  for (const c of D.data.chars) if (c.portrait) { const b = await D.img.get(c.portrait.id); if (b) imgs[c.portrait.id] = await toDataUrl(b); }
  const file = new File([JSON.stringify({ app: 'cast-backup', at: Date.now(), data: D.data, imgs })], `cast-backup-${stamp()}.json`, { type: 'application/json' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove();
}
$('restoreIn').onchange = async () => {
  const f = $('restoreIn').files[0]; $('restoreIn').value = ''; if (!f) return;
  try {
    const raw = JSON.parse(await f.text());
    const data = raw.app === 'cast-backup' ? raw.data : raw.app === 'cast' ? raw : null;
    if (!data) throw new Error('this isn’t a Cast backup');
    if (await ask('Restore', `Replace the cast here with “${f.name}”? What’s here now is kept under Earlier copies.`, ['Replace', 'Cancel']) !== 0) return;
    await G.Copies.keep('before restoring a backup');
    for (const [id, u] of Object.entries(raw.imgs || {})) { try { await D.img.put(id, await (await fetch(u)).blob()); } catch (e) {} }
    await D.replace(data, 'restore'); go('list');
  } catch (e) { banner('“' + f.name + '” couldn’t be restored: ' + e.message); }
};

/* ---------- keeping the screen in step ---------- */
let rT = 0;
D.subscribe((info, src) => {
  if (src === 'app') { if (view === 'list') { cancelAnimationFrame(rT); rT = requestAnimationFrame(renderList); } return; }
  cancelAnimationFrame(rT);
  rT = requestAnimationFrame(() => {
    if (view === 'char') { if (!D.char(cur)) { go('list'); return; } if (!document.activeElement || !$('char').contains(document.activeElement)) renderChar(); paintTop(); }
    else renderList();
  });
});
G.onState((s) => { $('syncDot').className = 'dot' + (s.mode === 'error' ? ' bad' : ['reconnect', 'offline'].includes(s.mode) ? ' warn' : ''); if (s.mode === 'error' && s.msg) banner(s.msg); });
document.addEventListener('pointerdown', () => G.gesture(), true);
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') { D.flush(); return; }
  await loadStory();
  if (view === 'list') renderList(); else if (!$('char').contains(document.activeElement)) renderChar();
});
addEventListener('pagehide', () => D.flush());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && layer.children.length) closeLayer(); });
document.addEventListener('gesturestart', (e) => e.preventDefault());

(async () => {
  try { await D.init(); } catch (e) { $('loading').remove(); banner('Cast couldn’t open its storage: ' + e.message); return; }
  await loadStory();
  $('loading').remove();
  renderList();
  const last = ui().open;
  if (last && D.char(last)) openChar(last); else go('list');
  G.start();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const had = !!navigator.serviceWorker.controller; let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', async () => { if (had && !reloading) { reloading = true; await D.flush(); location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { reg.update().catch(() => {}); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }); }).catch(() => {});
  }
  window.__cast = { openChar, go, get view() { return view; }, get cur() { return cur; } };
})();
})();
