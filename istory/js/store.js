/* =====================================================================
   iStory data: Part → Act → Sequence → Scene → Beat, Loose Pages, and each scene's working draft.
   Everything lives in one record ("data") kept in this iPad's IndexedDB and synced to Google Drive.
   ===================================================================== */
(function (root) {
'use strict';
const DB = 'istory2';
const KEEP = 'keep-before-rebuild';
const STAGES = [['rough', 'Rough'], ['structural', 'Structural'], ['line', 'Line edit'], ['polish', 'Polish'], ['final', 'Final']];
const STATUSES = [['open', 'Open'], ['leaning', 'Leaning'], ['locked', 'Locked']];
const LINKS = ['but', 'therefore', 'and'];
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const str = (v) => (v == null ? '' : String(v)).trim();
const txt = (v) => (v == null ? '' : String(v)).replace(/\r\n?/g, '\n');
const words = (t) => (String(t || '').match(/\S+/g) || []).length;

/* ---------- shapes ---------- */
/* The story's year: holidays and events by month (month 0 = every month or week). One list you can edit; scenes only point at it. */
const DEFAULT_HOLIDAYS = [
  ['h-newmoon', 0, 'New moon', 'day 1 of every month (trumpet blast)', 'mosaic'],
  ['h-sabbath', 0, 'Sabbath', 'every 7th day', 'mosaic'],
  ['h-turning', 1, 'The Turning', 'civil new year, solstice sunrise', 'nephite'],
  ['h-leap', 3, 'Leap-month decision', 'Watchers check the barley and the equinox', 'nephite'],
  ['h-passover', 4, 'Passover', 'day 14', 'mosaic'],
  ['h-unleavened', 4, 'Unleavened Bread', 'days 15–21', 'mosaic'],
  ['h-firstfruits', 4, 'Barley Firstfruits', 'day after the Sabbath in that week', 'mosaic'],
  ['h-latepassover', 5, 'Late Passover', 'day 14', 'mosaic'],
  ['h-zenith', 5, 'First zenith sun', 'about May 10; planting signal', 'nephite'],
  ['h-weeks', 6, 'Feast of Weeks', '50 days after Firstfruits', 'mosaic'],
  ['h-fast5', 8, 'Fifth-month fast', 'Mulekite folk mourning', 'nephite'],
  ['h-trumpets', 10, 'Trumpets', 'day 1', 'mosaic'],
  ['h-atonement', 10, 'Day of Atonement', 'day 10', 'mosaic'],
  ['h-tabernacles', 10, 'Tabernacles', 'days 15–21, then the assembly on day 22', 'mosaic'],
  ['h-muster', 11, 'Muster', 'armies assemble after covenant renewal', 'nephite'],
  ['h-storehouse', 12, 'Storehouse count', 'grain tallied, supply sent to the front', 'nephite']
].map(([id, month, name, when, type]) => ({ id, month, name, when, type }));
const monthOf = (v) => { const m = Math.round(+v || 0); return m >= 1 && m <= 12 ? m : 0; };
function normCalendar(c) {
  const list = c && Array.isArray(c.holidays) ? c.holidays : null;
  if (!list) return { holidays: DEFAULT_HOLIDAYS.map(h => ({ ...h })) };
  const seen = new Set();
  return { holidays: list.filter(h => h && str(h.name)).map(h => {
    let id = str(h.id) || uid('h-'); if (seen.has(id)) id = uid('h-'); seen.add(id);
    return { id, month: monthOf(h.month), name: str(h.name), when: str(h.when), type: h.type === 'nephite' ? 'nephite' : h.type === 'mosaic' ? 'mosaic' : 'other' };
  }) };
}
// a voice recording: the sound itself is kept apart (on this iPad, and in Drive); this is the note of it
const normMemo = (m) => m && /^[\w-]+$/.test(String(m.id || '')) ? { id: String(m.id), mime: str(m.mime), dur: +m.dur || 0, driveId: str(m.driveId), at: +m.at || 0 } : null;
function blank() {
  const b = { id: uid('bk-'), name: '' }, p = { id: uid('pt-'), bookId: b.id, name: '' }, a = { id: uid('a-'), partId: p.id, name: '' };
  return { app: 'istory', v: 2, rev: 0, books: [b], parts: [p], acts: [a], seqs: [], scenes: [], loose: [], ms: {}, drive: { folders: {} }, calendar: normCalendar(null) };
}
function normBeat(b) {
  b = b || {};
  return { id: str(b.id) || uid('b-'), text: txt(b.text).replace(/\n+/g, ' ').trim(), link: LINKS.includes(b.link) ? b.link : '', done: !!b.done, notes: txt(b.notes),
    dialogue: (Array.isArray(b.dialogue) ? b.dialogue : []).filter(Boolean).map(d => ({ id: str(d.id) || uid('d-'), speaker: str(d.speaker), line: txt(d.line).trim() })) };
}
function normScene(s) {
  return { id: str(s.id) || uid('s-'), bookId: str(s.bookId), seqId: s.seqId ? String(s.seqId) : null, title: str(s.title), summary: txt(s.summary).trim(),
    pov: str(s.pov), location: str(s.location), date: str(s.date), month: monthOf(s.month), holiday: str(s.holiday), labels: normLabels(s.labels),
    memos: (Array.isArray(s.memos) ? s.memos : []).map(normMemo).filter(Boolean), status: STATUSES.some(x => x[0] === s.status) ? s.status : 'open',
    stage: STAGES.some(x => x[0] === s.stage) ? s.stage : 'rough', beats: (Array.isArray(s.beats) ? s.beats : []).map(normBeat),
    created: +s.created || Date.now(), updated: +s.updated || Date.now() };
}
// labels: short words on a scene, no repeats (compared without regard to capitals)
function normLabels(v) {
  const out = [], seen = new Set();
  for (const x of (Array.isArray(v) ? v : [])) { const t = str(x).replace(/\s+/g, ' ').slice(0, 40), k = t.toLowerCase(); if (t && !seen.has(k)) { seen.add(k); out.push(t); } }
  return out;
}
function normLoose(l) {
  return { id: str(l.id) || uid('l-'), bookId: str(l.bookId), kind: l.kind === 'beats' ? 'beats' : 'writing', title: str(l.title),
    beats: (Array.isArray(l.beats) ? l.beats : []).map(normBeat), created: +l.created || Date.now(), updated: +l.updated || Date.now(),
    ...(normMemo(l.memo) ? { memo: normMemo(l.memo) } : {}) };
}
function normDoc(d) {
  if (!d || typeof d !== 'object' || !/^[\w-]+$/.test(String(d.id || ''))) return null;
  const pairs = (o) => { const out = {}; for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) if (v && typeof v === 'object') out[k] = { doc: str(v.doc), app: str(v.app) }; return out; };
  return { id: String(d.id), ver: str(d.ver), head: { doc: str(d.head && d.head.doc), app: str(d.head && d.head.app) }, scenes: pairs(d.scenes),
    order: (Array.isArray(d.order) ? d.order : []).map(String), titles: Object.fromEntries(Object.entries(d.titles && typeof d.titles === 'object' ? d.titles : {}).map(([k, v]) => [k, str(v)])),
    folder: str(d.folder), name: str(d.name), at: +d.at || 0 };
}
function normalize(d) {
  if (!d || d.app !== 'istory') throw new Error('this is not an iStory save');
  const o = blank(); o.books = []; o.parts = []; o.acts = [];
  o.rev = +d.rev || 0;
  const seen = new Set(), keep = (x, p) => { let id = str(x.id) || uid(p); if (seen.has(id)) id = uid(p); seen.add(id); return id; };
  o.books = (d.books || []).filter(Boolean).map(b => ({ id: keep(b, 'bk-'), name: str(b.name) }));
  if (!o.books.length) o.books.push({ id: uid('bk-'), name: '' });
  const bk = new Set(o.books.map(b => b.id));
  o.parts = (d.parts || []).filter(p => p && bk.has(String(p.bookId))).map(p => ({ id: keep(p, 'pt-'), bookId: String(p.bookId), name: str(p.name) }));
  const pt = new Set(o.parts.map(p => p.id));
  o.acts = (d.acts || []).filter(a => a && pt.has(String(a.partId))).map(a => ({ id: keep(a, 'a-'), partId: String(a.partId), name: str(a.name) }));
  const ac = new Set(o.acts.map(a => a.id));
  o.seqs = (d.seqs || []).filter(q => q && ac.has(String(q.actId))).map(q => ({ id: keep(q, 'q-'), actId: String(q.actId), name: str(q.name), idea: str(q.idea), doc: normDoc(q.doc), ...(q.noDoc && !q.doc ? { noDoc: true } : {}) }));
  const sq = new Set(o.seqs.map(q => q.id));
  o.scenes = (d.scenes || []).filter(Boolean).map(s => { const n = normScene(s); n.id = keep(n, 's-'); if (n.seqId && !sq.has(n.seqId)) n.seqId = null; return n; });
  // a scene in a sequence belongs to that sequence's book; a loose scene keeps the book it was made in
  for (const s of o.scenes) { if (s.seqId) s.bookId = bookOfSeq(o, s.seqId); if (!bk.has(s.bookId)) s.bookId = o.books[0].id; }
  o.loose = (d.loose || []).filter(Boolean).map(l => { const n = normLoose(l); n.id = keep(n, 'l-'); if (!bk.has(n.bookId)) n.bookId = o.books[0].id; return n; });
  for (const [k, v] of Object.entries(d.ms && typeof d.ms === 'object' ? d.ms : {})) {
    if (!v || typeof v !== 'object') continue;
    o.ms[k] = { text: txt(v.text), versions: (Array.isArray(v.versions) ? v.versions : []).filter(x => x && typeof x.text === 'string').map(x => ({ stage: STAGES.some(s => s[0] === x.stage) ? x.stage : 'rough', text: txt(x.text), at: +x.at || 0 })) };
  }
  o.drive = { folders: d.drive && d.drive.folders && typeof d.drive.folders === 'object' ? { ...d.drive.folders } : {} };
  o.calendar = normCalendar(d.calendar);
  const hs = new Set(o.calendar.holidays.map(h => h.id));
  for (const s of o.scenes) if (s.holiday && !hs.has(s.holiday)) s.holiday = '';
  if (!d.calendar) readWhen(o);
  return o;
}
// scenes brought over from Story Studio carried their holiday as words in the date ("63 BC · Passover"); the date is left as it is
function readWhen(o) {
  const byName = new Map(o.calendar.holidays.map(h => [h.name.toLowerCase(), h]));
  for (const s of o.scenes) {
    if (s.month || s.holiday || !s.date) continue;
    for (const part of s.date.split('·').map(x => x.trim())) {
      const h = byName.get(part.toLowerCase()), m = /^month\s+(\d{1,2})$/i.exec(part);
      if (h && !s.holiday) { s.holiday = h.id; if (h.month) s.month = h.month; }
      else if (m && !s.month) s.month = monthOf(m[1]);
    }
  }
}
function bookOfSeq(o, seqId) {
  const q = o.seqs.find(x => x.id === seqId), a = q && o.acts.find(x => x.id === q.actId), p = a && o.parts.find(x => x.id === a.partId);
  return p ? p.bookId : '';
}

/* ---------- IndexedDB ---------- */
const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('memos'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function kvGet(k, store = 'kv') { const d = await db(); return rq(d.transaction(store).objectStore(store).get(k)); }
async function kvPut(k, v, store = 'kv') {
  const d = await db();
  await new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
}
async function kvDel(k, store = 'kv') {
  const d = await db();
  await new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); });
}

/* ---------- the store ---------- */
const subs = new Set();
let saveT = 0, saving = null, dirtyLocal = false, blocked = false;
const S = {
  data: blank(), STAGES, STATUSES, LINKS, uid, words,
  get blocked() { return blocked; },

  async init() {
    let stored = null;
    try { stored = await kvGet('data'); } catch (e) { blocked = true; throw e; }
    if (stored) {
      // the first time a rebuilt iStory opens, keep the story exactly as it was (never rotated out, never changed)
      try { if (!(await kvGet(KEEP))) await kvPut(KEEP, { at: Date.now(), data: JSON.parse(JSON.stringify(stored)) }); } catch (e) { console.error(e); }
    }
    if (stored) { try { S.data = normalize(stored); return { fresh: false }; } catch (e) { blocked = true; throw new Error('the saved story could not be read (' + e.message + ')'); } }
    // first open: bring in Story Studio from this iPad if it is here
    const studio = await readStudioLocal().catch(() => null);
    if (studio && studio.story && (studio.story.scenes || []).length) {
      S.data = fromStudio(studio.story, studio.meta, studio.pages);
      await S.save();
      return { fresh: true, imported: S.data.scenes.length };
    }
    S.data = blank();
    await S.save();
    return { fresh: true, imported: 0 };
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  // something changed: save soon, tell the screens and the sync
  changed(info = {}, src = 'app') {
    S.data.rev++;
    dirtyLocal = true;
    clearTimeout(saveT); saveT = setTimeout(() => S.save(), 400);
    for (const f of subs) { try { f(info, src); } catch (e) { console.error(e); } }
  },
  async save() {
    clearTimeout(saveT);
    if (blocked) return;
    if (saving) { await saving; if (!dirtyLocal) return; }
    dirtyLocal = false;
    saving = kvPut('data', JSON.parse(JSON.stringify(S.data))).catch((e) => { dirtyLocal = true; S.onError && S.onError('Couldn’t save on this iPad: ' + e.message); }).finally(() => { saving = null; });
    return saving;
  },
  flush() { return S.save(); },
  replace(d, src = 'replace') { S.data = normalize(d); S.changed({ all: true }, src); return S.save(); },
  kv: { get: kvGet, put: kvPut, del: kvDel },
  async kept() { try { return (await kvGet(KEEP)) || null; } catch (e) { return null; } },
  normLabels,
  /* ----- the year ----- */
  holidays() { return S.data.calendar.holidays; },
  holiday(id) { return (id && S.data.calendar.holidays.find(h => h.id === id)) || null; },
  defaultHolidays() { return DEFAULT_HOLIDAYS.map(h => ({ ...h })); },
  // a new list: scenes that pointed at a holiday no longer in it keep their month and let go of the holiday
  setHolidays(list) {
    S.data.calendar = normCalendar({ holidays: list });
    const ids = new Set(S.data.calendar.holidays.map(h => h.id));
    for (const s of S.data.scenes) { if (s.holiday && !ids.has(s.holiday)) s.holiday = ''; const h = S.holiday(s.holiday); if (h && h.month) s.month = h.month; }
    S.changed({ structure: true });
  },
  // "63 BC · Month 4 · Passover", without saying twice what the date already says in words
  whenText(s) {
    const h = S.holiday(s.holiday), d = (s.date || '').toLowerCase();
    return [s.date, s.month && !new RegExp('month\\s+' + s.month + '\\b').test(d) ? 'Month ' + s.month : '', h && !d.includes(h.name.toLowerCase()) ? h.name : ''].filter(Boolean).join(' · ');
  },
  // every label used in a book, most used first
  labelsOf(bookId = S.bookId) {
    const n = new Map();
    for (const s of S.data.scenes) if (s.bookId === bookId) for (const l of s.labels || []) { const k = l.toLowerCase(), e = n.get(k) || { label: l, n: 0 }; e.n++; n.set(k, e); }
    return [...n.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map(e => e.label);
  },

  /* ----- books and structure ----- */
  get bookId() { const id = ui().book; return S.data.books.some(b => b.id === id) ? id : S.data.books[0].id; },
  setBook(id) { setUi({ book: id }); S.changed({ book: true, view: true }); },
  book(id) { return S.data.books.find(b => b.id === id) || null; },
  partsOf(bookId) { return S.data.parts.filter(p => p.bookId === bookId); },
  actsOf(partId) { return S.data.acts.filter(a => a.partId === partId); },
  seqsOf(actId) { return S.data.seqs.filter(q => q.actId === actId); },
  scenesOf(seqId) { return S.data.scenes.filter(s => s.seqId === seqId); },
  seq(id) { return S.data.seqs.find(q => q.id === id) || null; },
  act(id) { return S.data.acts.find(a => a.id === id) || null; },
  part(id) { return S.data.parts.find(p => p.id === id) || null; },
  scene(id) { return S.data.scenes.find(s => s.id === id) || null; },
  looseItem(id) { return S.data.loose.find(l => l.id === id) || null; },
  where(seqId) { const q = S.seq(seqId), a = q && S.act(q.actId), p = a && S.part(a.partId); return q && a && p ? { seq: q, act: a, part: p, book: S.book(p.bookId) } : null; },
  // story order for a book: every sequence in order, with its scenes
  order(bookId = S.bookId) {
    const out = [];
    for (const p of S.partsOf(bookId)) for (const a of S.actsOf(p.id)) for (const q of S.seqsOf(a.id)) out.push(q);
    return out;
  },
  numbers(bookId = S.bookId) {
    const sc = new Map(), sq = new Map(), pt = new Map(), ac = new Map();
    let n = 0, m = 0, k = 0;
    // parts, sequences and scenes count through the whole book; acts start again at 1 in each part
    for (const p of S.partsOf(bookId)) { pt.set(p.id, ++k); let j = 0; for (const a of S.actsOf(p.id)) { ac.set(a.id, ++j); for (const q of S.seqsOf(a.id)) { sq.set(q.id, ++m); for (const s of S.scenesOf(q.id)) sc.set(s.id, ++n); } } }
    return { scene: sc, seq: sq, part: pt, act: ac };
  },
  bookLabel(b) { const n = S.data.books.indexOf(b) + 1; return `Book ${n}${b.name ? ': ' + b.name : ''}`; },
  partLabel(p) { const n = S.numbers(p.bookId).part.get(p.id); return `Part ${n || ''}${p.name ? ': ' + p.name : ''}`; },
  actLabel(a) { const p = S.part(a.partId), n = p ? S.numbers(p.bookId).act.get(a.id) : 0; return `Act ${n || ''}${a.name ? ': ' + a.name : ''}`; },
  seqLabel(q) { const w = S.where(q.id), n = w ? S.numbers(w.book.id).seq.get(q.id) : 0; return `Sequence ${n || ''}${q.name ? ': ' + q.name : ''}`; },
  sceneNo(s) { return s.seqId ? S.numbers(s.bookId).scene.get(s.id) || 0 : 0; },
  sceneLabel(s) { const n = S.sceneNo(s); return (n ? `Scene ${n}` : 'Scene') + ' · ' + (s.title || 'Untitled'); },

  addBook(name) { const b = { id: uid('bk-'), name: str(name) }; S.data.books.push(b); const p = S.addPart(b.id, '', true); S.addAct(p.id, '', true); S.changed({ structure: true }); return b; },
  addPart(bookId, name, quiet) { const p = { id: uid('pt-'), bookId, name: str(name) }; const last = lastIndex(S.data.parts, x => x.bookId === bookId); S.data.parts.splice(last + 1, 0, p); if (!quiet) S.changed({ structure: true }); return p; },
  addAct(partId, name, quiet) { const a = { id: uid('a-'), partId, name: str(name) }; const last = lastIndex(S.data.acts, x => x.partId === partId); S.data.acts.splice(last + 1, 0, a); if (!quiet) S.changed({ structure: true }); return a; },
  addSeq(actId, name, quiet) { const q = { id: uid('q-'), actId, name: str(name), idea: '', doc: null }; const last = lastIndex(S.data.seqs, x => x.actId === actId); S.data.seqs.splice(last + 1, 0, q); if (!quiet) S.changed({ structure: true, seq: q.id }); return q; },
  rename(kind, id, name) { const list = { book: 'books', part: 'parts', act: 'acts', seq: 'seqs' }[kind]; const x = S.data[list].find(o => o.id === id); if (x) { x.name = str(name); S.changed({ structure: true, seq: kind === 'seq' ? id : null }); } },
  removeEmpty(kind, id) {
    // parts, acts and sequences are only removed when nothing is in them; scenes are never thrown away by this
    if (kind === 'seq') { if (S.scenesOf(id).length) return false; S.data.seqs = S.data.seqs.filter(q => q.id !== id); }
    else if (kind === 'act') { if (S.seqsOf(id).length) return false; S.data.acts = S.data.acts.filter(a => a.id !== id); }
    else if (kind === 'part') { if (S.actsOf(id).length) return false; S.data.parts = S.data.parts.filter(p => p.id !== id); }
    else if (kind === 'book') {
      if (S.data.books.length < 2) return false;
      const parts = S.partsOf(id).map(p => p.id), acts = S.data.acts.filter(a => parts.includes(a.partId)).map(a => a.id);
      if (S.data.seqs.some(q => acts.includes(q.actId)) || S.data.scenes.some(s => s.bookId === id && !s.seqId) || S.data.loose.some(l => l.bookId === id)) return false;
      S.data.acts = S.data.acts.filter(a => !acts.includes(a.id)); S.data.parts = S.data.parts.filter(p => !parts.includes(p.id)); S.data.books = S.data.books.filter(b => b.id !== id);
    }
    S.changed({ structure: true }); return true;
  },

  /* ----- scenes ----- */
  newBeat(f) { return normBeat({ link: 'and', ...(f || {}) }); },
  addScene(fields, seqId, index) {
    const s = normScene({ ...fields, id: uid('s-'), seqId: seqId || null, bookId: seqId ? bookOfSeq(S.data, seqId) : (fields && fields.bookId) || S.bookId, created: Date.now(), updated: Date.now() });
    placeScene(s, seqId || null, index);
    S.changed({ structure: true, scene: s.id, seq: seqId || null });
    return s;
  },
  // move a scene into a sequence (or out to Loose Pages with seqId null), at an index among that sequence's scenes
  moveScene(id, seqId, index) {
    const s = S.scene(id); if (!s) return;
    const from = s.seqId;
    S.data.scenes = S.data.scenes.filter(x => x !== s);
    s.seqId = seqId || null; if (seqId) s.bookId = bookOfSeq(S.data, seqId);
    placeScene(s, s.seqId, index);
    s.updated = Date.now();
    S.changed({ structure: true, scene: id, seq: seqId || from, from });
  },
  deleteScene(id) {
    const s = S.scene(id); if (!s) return null;
    const i = S.data.scenes.indexOf(s), ms = S.data.ms[id];
    S.data.scenes.splice(i, 1); delete S.data.ms[id];
    S.changed({ structure: true, seq: s.seqId });
    return () => { S.data.scenes.splice(Math.min(i, S.data.scenes.length), 0, s); if (ms) S.data.ms[id] = ms; S.changed({ structure: true, seq: s.seqId }); };
  },
  touchScene(s, info = {}) { s.updated = Date.now(); S.changed({ scene: s.id, seq: s.seqId, ...info }); },

  /* ----- loose pages ----- */
  looseFor(bookId = S.bookId) {
    const scenes = S.data.scenes.filter(s => !s.seqId && s.bookId === bookId).map(s => ({ kind: 'scene', id: s.id, item: s, at: s.updated }));
    const other = S.data.loose.filter(l => l.bookId === bookId).map(l => ({ kind: l.kind, id: l.id, item: l, at: l.updated }));
    const order = ui().looseOrder || [];
    const all = [...scenes, ...other];
    // your own arrangement first, then newest
    return all.sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); if (ia >= 0 && ib >= 0) return ia - ib; if (ia >= 0) return -1; if (ib >= 0) return 1; return b.at - a.at; });
  },
  setLooseOrder(ids) { setUi({ looseOrder: ids }); },
  addLoose(kind, fields) {
    const l = normLoose({ ...(fields || {}), kind, id: uid('l-'), bookId: S.bookId, created: Date.now(), updated: Date.now() });
    S.data.loose.unshift(l);
    if (kind === 'writing') S.data.ms[l.id] = { text: txt(fields && fields.text), versions: [] };
    S.changed({ loose: true });
    return l;
  },
  deleteLoose(id) {
    const i = S.data.loose.findIndex(l => l.id === id); if (i < 0) return null;
    const l = S.data.loose[i], ms = S.data.ms[id];
    S.data.loose.splice(i, 1); delete S.data.ms[id];
    S.changed({ loose: true });
    return () => { S.data.loose.splice(i, 0, l); if (ms) S.data.ms[id] = ms; S.changed({ loose: true }); };
  },
  // a loose beat chain becomes a scene (in a sequence, or loose)
  chainToScene(id, seqId, index) {
    const l = S.looseItem(id); if (!l) return null;
    const s = S.addScene({ title: l.title, beats: l.beats.filter(b => b.text || b.notes || b.dialogue.length), bookId: l.bookId, memos: l.memo ? [l.memo] : [] }, seqId, index);
    if (s.beats[0]) s.beats[0].link = '';
    S.data.loose = S.data.loose.filter(x => x !== l);
    S.changed({ loose: true, structure: true, scene: s.id, seq: seqId });
    return s;
  },
  // file a loose piece into a scene: beats join its chain, writing joins its manuscript
  fileInto(looseId, sceneId) {
    const l = S.looseItem(looseId), s = S.scene(sceneId); if (!l || !s) return false;
    if (l.kind === 'beats') {
      const add = l.beats.filter(b => b.text || b.notes || b.dialogue.length).map(b => ({ ...b }));
      if (add[0] && s.beats.length && !add[0].link) add[0].link = 'and';
      s.beats.push(...add);
    } else {
      const t = (S.data.ms[l.id] && S.data.ms[l.id].text || '').trim();
      if (t) { const m = S.ms(s.id); m.text = m.text.trim() ? m.text.replace(/\s+$/, '') + '\n' + t : t; }
    }
    if (l.memo) s.memos.push(l.memo);
    S.data.loose = S.data.loose.filter(x => x !== l); delete S.data.ms[l.id];
    s.updated = Date.now();
    S.changed({ loose: true, scene: s.id, seq: s.seqId, text: true });
    return true;
  },

  /* ----- the working draft ----- */
  ms(id) { if (!S.data.ms[id]) S.data.ms[id] = { text: '', versions: [] }; return S.data.ms[id]; },
  text(id) { return (S.data.ms[id] && S.data.ms[id].text) || ''; },
  setText(id, t, src = 'app') {
    const m = S.ms(id); t = txt(t);
    if (m.text === t) return;
    m.text = t;
    const s = S.scene(id); if (s) s.updated = Date.now(); const l = S.looseItem(id); if (l) l.updated = Date.now();
    S.changed({ text: true, scene: s ? s.id : null, seq: s ? s.seqId : null, loose: !!l }, src);
  },
  // a page of loose writing becomes a scene with that writing as its draft
  writingToScene(id, seqId, index) {
    const l = S.looseItem(id); if (!l || l.kind !== 'writing') return null;
    const text = S.text(id), first = text.split('\n').find(x => x.trim()) || '';
    const s = S.addScene({ title: l.title || first.split(/\s+/).slice(0, 6).join(' '), bookId: l.bookId, memos: l.memo ? [l.memo] : [] }, seqId, index);
    S.data.ms[s.id] = { text, versions: [] };
    S.data.loose = S.data.loose.filter(x => x !== l); delete S.data.ms[id];
    S.changed({ loose: true, structure: true, scene: s.id, seq: seqId, text: true });
    return s;
  },
  // a new stage keeps the draft as it was at the end of the old one; writing goes on in the same text
  setStage(sceneId, stage) {
    const s = S.scene(sceneId); if (!s || s.stage === stage || !STAGES.some(x => x[0] === stage)) return;
    const m = S.ms(sceneId);
    if (m.text.trim()) m.versions.push({ stage: s.stage, text: m.text, at: Date.now() });
    s.stage = stage; s.updated = Date.now();
    S.changed({ scene: s.id, seq: s.seqId, stage: true });
  },
  wordsOf(id) { return words(S.text(id)); },
  stageLabel(id) { return (STAGES.find(x => x[0] === id) || STAGES[0])[1]; },

  /* ----- recent work (this iPad) ----- */
  recent() { return (ui().recent || []).filter(r => r.kind === 'scene' ? S.scene(r.id) : S.looseItem(r.id)); },
  touchRecent(kind, id) { const r = (ui().recent || []).filter(x => x.id !== id); r.unshift({ kind, id, at: Date.now() }); setUi({ recent: r.slice(0, 12), last: { kind, id } }); },
  get last() { return ui().last || null; },

  /* ----- backup ----- */
  exportJSON() { return JSON.stringify({ ...S.data, savedAt: new Date().toISOString() }); },
  normalize, fromStudio, readStudioLocal
};
function lastIndex(list, f) { for (let i = list.length - 1; i >= 0; i--) if (f(list[i])) return i; return list.length - 1; }
function placeScene(s, seqId, index) {
  const list = S.data.scenes, siblings = list.filter(x => x.seqId === seqId && (seqId || x.bookId === s.bookId));
  let at;
  if (index == null || index >= siblings.length) at = siblings.length ? list.indexOf(siblings[siblings.length - 1]) + 1 : insertPoint(seqId);
  else at = list.indexOf(siblings[Math.max(0, index)]);
  list.splice(at, 0, s);
}
// where a first scene of a sequence goes in the list: after the scenes of the sequences before it
function insertPoint(seqId) {
  if (!seqId) return S.data.scenes.length;
  const order = S.order(bookOfSeq(S.data, seqId)), i = order.findIndex(q => q.id === seqId);
  for (let k = i - 1; k >= 0; k--) { const sc = S.scenesOf(order[k].id); if (sc.length) return S.data.scenes.indexOf(sc[sc.length - 1]) + 1; }
  for (let k = i + 1; k < order.length; k++) { const sc = S.scenesOf(order[k].id); if (sc.length) return S.data.scenes.indexOf(sc[0]); }
  return S.data.scenes.length;
}
function ui() { try { return JSON.parse(localStorage.getItem('istory2_ui') || '{}'); } catch (e) { return {}; } }
function setUi(p) { try { localStorage.setItem('istory2_ui', JSON.stringify({ ...ui(), ...p })); } catch (e) {} }
S.ui = ui; S.setUi = setUi;

/* =====================================================================
   Carry-over from Story Studio (the Scene Board, Beat Sheet and typewriter).
   Read only: the studio's own data on this iPad and in Drive is never changed.
   ===================================================================== */
function openExisting(name) {
  return new Promise((res) => {
    let r; try { r = indexedDB.open(name); } catch (e) { res(null); return; }
    r.onupgradeneeded = () => { r.transaction.abort(); };   // not here: don't create it
    r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
  });
}
async function readStudioLocal() {
  const sdb = await openExisting('kotw_story');
  if (!sdb) return null;
  let story = null, meta = null, pages = {};
  try { if (sdb.objectStoreNames.contains('kv')) story = await rq(sdb.transaction('kv').objectStore('kv').get('story')); } finally { sdb.close(); }
  const wdb = await openExisting('underwood-quiet-v1');
  if (wdb) {
    try {
      if (wdb.objectStoreNames.contains('state') && wdb.objectStoreNames.contains('pages')) {
        meta = await rq(wdb.transaction('state').objectStore('state').get('meta'));
        if (meta && meta.format === 6) {
          const ids = (meta.manuscripts || []).flatMap(m => m.pageIds || []), st = wdb.transaction('pages').objectStore('pages');
          const got = await Promise.all(ids.map(id => rq(st.get(id))));
          ids.forEach((id, i) => { if (got[i]) pages[id] = got[i]; });
        } else meta = null;
      }
    } finally { wdb.close(); }
  }
  return { story, meta, pages };
}
const LINK_WORDS = { but: 'but', therefore: 'therefore', 'and then': 'and', and: 'and', so: 'therefore' };
// typewriter sheets → plain paragraphs (indents dropped, blank lines kept)
function sheetsText(entry, pages) {
  const TW = root.IStoryMS; if (!TW || !entry) return '';
  const raw = (entry.pageIds || []).map(id => pages[id] ? TW.pageText(pages[id]) : '').join('');
  return raw.split('\n').map(l => l.replace(/^\s+/, '').replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function fromStudio(story, meta, pages) {
  const o = blank(); o.books = []; o.parts = []; o.acts = [];
  const books = (story.books || []).filter(Boolean);
  o.books = (books.length ? books : [{ id: uid('bk-'), name: '' }]).map(b => ({ id: str(b.id) || uid('bk-'), name: str(b.name) }));
  const bk = new Set(o.books.map(b => b.id));
  o.parts = (story.parts || []).filter(p => p && bk.has(String(p.bookId))).map(p => ({ id: String(p.id), bookId: String(p.bookId), name: str(p.name) }));
  for (const b of o.books) if (!o.parts.some(p => p.bookId === b.id)) o.parts.push({ id: uid('pt-'), bookId: b.id, name: '' });
  const pt = new Set(o.parts.map(p => p.id));
  o.acts = (story.acts || []).filter(a => a && pt.has(String(a.partId))).map(a => ({ id: String(a.id), partId: String(a.partId), name: str(a.name) }));
  for (const p of o.parts) if (!o.acts.some(a => a.partId === p.id)) o.acts.push({ id: uid('a-'), partId: p.id, name: '' });
  const ac = new Set(o.acts.map(a => a.id));
  o.seqs = (story.sequences || []).filter(q => q && ac.has(String(q.actId))).map(q => ({ id: String(q.id), actId: String(q.actId), name: str(q.name), idea: '', doc: null }));
  const sq = new Set(o.seqs.map(q => q.id));
  o.calendar = normCalendar(story.calendar);
  const holidays = new Set(o.calendar.holidays.map(h => h.id));
  // the studio sorts scenes by its own order; keep each sequence's scenes in that order
  for (const s of (story.scenes || []).filter(Boolean)) {
    const loose = !s.seqId || !sq.has(String(s.seqId)) || s.wip || s.archived;
    const beats = (s.beats || []).map(b => {
      const label = str(b.label), link = LINK_WORDS[label.toLowerCase()];
      let text = txt(b.text).replace(/\s+/g, ' ').trim();
      if (label && !link && text) text = label + ': ' + text;
      else if (label && !link && !text && (str(b.notes) || (b.dialogue || []).length)) text = label;
      return { id: str(b.id) || uid('b-'), text, link: link || 'and', done: !!b.done, notes: txt(b.notes), dialogue: (b.dialogue || []).filter(d => d && (d.line || d.speaker)).map(d => ({ id: str(d.id) || uid('d-'), speaker: str(d.speaker), line: txt(d.line) })) };
    }).filter(b => b.text || b.notes.trim() || b.dialogue.length);
    if (beats[0]) beats[0].link = '';
    const summary = [txt(s.summary).trim(), str(s.objective) ? 'Objective: ' + str(s.objective) : ''].filter(Boolean).join('\n');
    o.scenes.push(normScene({ id: s.id, seqId: loose ? null : String(s.seqId), bookId: bk.has(String(s.bookId)) ? String(s.bookId) : o.books[0].id, title: s.title, summary, pov: s.pov, location: s.location,
      date: str(s.storyDate), month: s.month, holiday: holidays.has(str(s.holiday)) ? str(s.holiday) : '', status: s.status, beats }));
  }
  for (const s of o.scenes) if (s.seqId) s.bookId = bookOfSeq(o, s.seqId);
  // manuscripts: the first one for a scene is its working draft; any others and the loose ones become Loose Pages
  const used = new Set();
  for (const m of (meta && meta.manuscripts) || []) {
    const text = sheetsText(m, pages), sc = m.sceneId && o.scenes.find(s => s.id === m.sceneId);
    if (sc && !used.has(sc.id)) {
      used.add(sc.id);
      o.ms[sc.id] = { text, versions: [] };
      if (STAGES.some(x => x[0] === m.stage)) sc.stage = m.stage;
    } else if (text) {
      const l = normLoose({ kind: 'writing', title: str(m.title), bookId: sc ? sc.bookId : o.books[0].id });
      o.loose.push(l); o.ms[l.id] = { text, versions: [] };
    }
    const lh = m.longhand && Array.isArray(m.longhand.pages) ? m.longhand.pages.map(p => txt(p.text).trim()).filter(Boolean).join('\n\n') : '';
    if (lh) { const l = normLoose({ kind: 'writing', title: 'Longhand' + (m.title ? ' · ' + str(m.title) : ''), bookId: sc ? sc.bookId : o.books[0].id }); o.loose.push(l); o.ms[l.id] = { text: lh, versions: [] }; }
  }
  return o;
}

root.Store = S;
})(window);
