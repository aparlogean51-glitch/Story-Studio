/* =====================================================================
   iStory engine: the story, the manuscripts, voice memos and Google Drive sync.
   Ported from Story Studio (Story-Studio/board/index.html) so iStory reads and writes
   the very same story, manuscripts and Drive copy as the Scene Board and the laptop studio.
   Changes from the original: UI_KEY is iStory's own, "Sync to File" is a stub,
   and the cloud button is painted by the iStory shell (window.paintCloud / window.placeMenu).
   Google Docs Publish and Doc links are not part of iStory (yet); their data is kept untouched.
   ===================================================================== */
/* =====================================================================
   The story: one shared save for every view.
   Acts → Sequences → Scenes. The scenes array is always kept in story order:
   by act, then sequence, then position in the sequence; unfiled scenes come last.
   Scenes are numbered with one running count (WIP and archived scenes get no number);
   sequences are numbered with one running count across all acts.
   ===================================================================== */
const STORY_DB = 'kotw_story';
const OLD_BOARD_KEY = 'kotw_scene_blocking_v1';
const OLD_BOARD_KEYS = ['kotw_scene_board_novel_data_v4', 'kotw_scene_board_novel_data_v3', 'kotw_scene_board_novel_data_v2', 'storyplot_board_novel_data_v1'];
const OLD_BEATS_DB = 'kotw_beat_sheet';
const OLD_BEAT_OPS_KEY = 'kotw_beat_updates';
const UI_KEY = 'istory_ui';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const str = (v) => (v === null || v === undefined) ? '' : String(v).trim();
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const $ = (id) => document.getElementById(id);
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const WIN = uid();

function idbOpen(name, create) {
  return new Promise((resolve, reject) => {
    const r = create ? indexedDB.open(name, 1) : indexedDB.open(name);
    r.onupgradeneeded = () => { if (create) r.result.createObjectStore('kv'); else r.transaction.abort(); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('could not open ' + name));
  });
}
async function idbGet(db, key) {
  if (!db.objectStoreNames.contains('kv')) return undefined;
  return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbPut(db, key, val) {
  return new Promise((res, rej) => {
    const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key);
    t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('save aborted'));
  });
}

const Story = (() => {
  let data = null, db = null, saveTimer = null, saving = null, again = false, blocked = false, numCache = null;
  const subs = new Set();

  const emptyLanes = () => ({ cols: { type: 'off', label: '', items: [] }, rows: { type: 'off', label: '', items: [] } });
  /* The story's year: holidays and events by month (month 0 = recurring every month or week). One editable list; scenes only point at it. */
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
  function normCalendar(c) {
    const list = c && Array.isArray(c.holidays) ? c.holidays : null;
    if (!list) return { holidays: DEFAULT_HOLIDAYS.map(h => ({ ...h })) };
    const seen = new Set();
    return { holidays: list.filter(h => h && str(h.name)).map(h => {
      let id = str(h.id) || 'h-' + uid(); if (seen.has(id)) id = 'h-' + uid(); seen.add(id);
      const m = Math.round(num(h.month));
      return { id, month: m >= 0 && m <= 12 ? m : 0, name: str(h.name), when: str(h.when), type: h.type === 'nephite' ? 'nephite' : h.type === 'mosaic' ? 'mosaic' : 'other' };
    }) };
  }
  function blank() {
    return { app: 'kotw-story', version: 2, rev: 0, books: [], parts: [], acts: [], sequences: [], scenes: [], links: [], lanes: emptyLanes(),
             board: { view: { x: 80, y: 80, zoom: 1 }, showNumbers: true }, templates: [], drafts: {}, gdocs: {}, calendar: normCalendar(null) };
  }
  function normBeat(b) {
    return {
      id: str(b.id) || 'b-' + uid(), label: str(b.label), prompt: str(b.prompt), text: String(b.text ?? ''), done: !!b.done, notes: String(b.notes ?? ''),
      dialogue: (Array.isArray(b.dialogue) ? b.dialogue : []).filter(Boolean).map(x => ({ id: str(x.id) || 'd-' + uid(), speaker: str(x.speaker), line: String(x.line ?? '') })),
      images: (Array.isArray(b.images) ? b.images : []).filter(x => x && /^data:image\//.test(x.src)).map(x => ({ id: str(x.id) || 'i-' + uid(), src: x.src, caption: str(x.caption), ...(x.sketch ? { sketch: true } : {}) })),
      memo: b.memo && typeof b.memo === 'object' && /^[\w-]+$/.test(String(b.memo.id || '')) ? { id: String(b.memo.id), mime: str(b.memo.mime), dur: num(b.memo.dur), at: String(b.memo.at || ''), size: num(b.memo.size) } : null
    };
  }
  function normScene(s) {
    return { id: str(s.id) || 's-' + uid(), title: str(s.title) || 'Untitled Scene', pov: str(s.pov), location: str(s.location),
      objective: str(s.objective), summary: String(s.summary ?? '').trim(), wip: !!s.wip, archived: !!s.archived, keystone: !!s.keystone,
      seqId: s.seqId ? String(s.seqId) : null, bookId: s.bookId ? String(s.bookId) : null, x: num(s.x), y: num(s.y), type: str(s.type) || 'free',
      // planning status (OPEN / LEANING / LOCKED), the date inside the story, when and why it was locked, and an attached voice memo
      status: ['open', 'leaning', 'locked'].includes(s.status) ? s.status : 'open',
      storyDate: str(s.storyDate),
      // month of the story's year (1–12, 0 = not set) and the holiday or event it falls on
      month: (() => { const m = Math.round(num(s.month)); return m >= 1 && m <= 12 ? m : 0; })(),
      holiday: str(s.holiday),
      lock: s.lock && typeof s.lock === 'object' && s.lock.at ? { at: String(s.lock.at), note: str(s.lock.note) } : null,
      lockLog: (Array.isArray(s.lockLog) ? s.lockLog : []).filter(x => x && x.at).slice(-20).map(x => ({ at: String(x.at), note: str(x.note), action: x.action === 'unlocked' ? 'unlocked' : 'locked' })),
      memo: s.memo && typeof s.memo === 'object' && /^[\w-]+$/.test(String(s.memo.id || '')) ? { id: String(s.memo.id), mime: str(s.memo.mime), dur: num(s.memo.dur), at: String(s.memo.at || ''), size: num(s.memo.size) } : null,
      beats: (Array.isArray(s.beats) ? s.beats : []).filter(Boolean).map(normBeat) };
  }
  // keeps ids unique within a list
  function uniq(list, prefix) {
    const seen = new Set();
    return list.map(x => { let id = str(x.id) || prefix + uid(); if (seen.has(id)) id = prefix + uid(); seen.add(id); return { ...x, id }; });
  }
  function normalize(d) {
    if (!d || !Array.isArray(d.scenes)) throw new Error('no scene list found');
    const o = blank();
    o.rev = num(d.rev);
    o.books = uniq((Array.isArray(d.books) ? d.books : []).filter(Boolean), 'bk-').map(b => ({ id: b.id, name: str(b.name) }));
    // a story saved before books existed becomes Book 1
    if (!o.books.length) o.books.push({ id: 'bk-' + uid(), name: '' });
    const bookIds = new Set(o.books.map(b => b.id));
    o.parts = uniq((Array.isArray(d.parts) ? d.parts : []).filter(p => p && bookIds.has(String(p.bookId))), 'pt-').map(p => ({ id: p.id, bookId: String(p.bookId), name: str(p.name) }));
    const partIds = new Set(o.parts.map(p => p.id));
    let fallbackPart = null;
    const partFor = () => {
      if (!fallbackPart) { fallbackPart = { id: 'pt-' + uid(), bookId: o.books[0].id, name: '' }; o.parts.unshift(fallbackPart); partIds.add(fallbackPart.id); }
      return fallbackPart.id;
    };
    // acts saved before parts existed go into Part 1 of Book 1
    o.acts = uniq((Array.isArray(d.acts) ? d.acts : []).filter(Boolean), 'a-').map(a => ({ id: a.id, partId: partIds.has(String(a.partId)) ? String(a.partId) : partFor(), name: str(a.name) }));
    const actIds = new Set(o.acts.map(a => a.id));
    o.sequences = uniq((Array.isArray(d.sequences) ? d.sequences : []).filter(q => q && actIds.has(String(q.actId))), 'q-').map(q => ({ id: q.id, actId: String(q.actId), name: str(q.name) }));
    const seqIds = new Set(o.sequences.map(q => q.id));
    const ids = new Set();
    o.scenes = d.scenes.filter(Boolean).map(s => {
      const n = normScene(s);
      if (ids.has(n.id)) n.id = 's-' + uid();
      ids.add(n.id);
      if (n.seqId && !seqIds.has(n.seqId)) n.seqId = null;
      if (!n.bookId || !bookIds.has(n.bookId)) n.bookId = o.books[0].id;
      return n;
    });
    const seen = new Set();
    o.links = (Array.isArray(d.links) ? d.links : []).filter(l => l && ids.has(l.from) && ids.has(l.to) && l.from !== l.to && !seen.has(l.from + '>' + l.to) && seen.add(l.from + '>' + l.to))
      .map(l => ({ id: str(l.id) || 'l-' + uid(), from: l.from, to: l.to, label: str(l.label) }));
    if (d.lanes && typeof d.lanes === 'object') o.lanes = d.lanes;
    o.calendar = normCalendar(d.calendar);
    if (d.board && typeof d.board === 'object') {
      const v = d.board.view || {};
      o.board = { view: { x: num(v.x, 80), y: num(v.y, 80), zoom: Math.min(2.5, Math.max(0.2, num(v.zoom, 1))) }, showNumbers: d.board.showNumbers !== false };
    }
    o.templates = (Array.isArray(d.templates) ? d.templates : []).filter(t => t && str(t.name) && Array.isArray(t.beats))
      .map(t => ({ id: str(t.id) || 'tpl-' + uid(), name: str(t.name), desc: str(t.desc) || 'Your template', custom: true, beats: t.beats.map(b => ({ label: str(b.label), prompt: str(b.prompt) })) }));
    if (d.drafts && typeof d.drafts === 'object') for (const [k, v] of Object.entries(d.drafts)) if (Number.isFinite(+v)) o.drafts[k] = +v;
    // scenes kept in step with a Google Doc: the Doc, and what both sides looked like when they last matched
    if (d.gdocs && typeof d.gdocs === 'object') for (const [k, v] of Object.entries(d.gdocs)) if (v && typeof v === 'object' && /^[\w-]+$/.test(String(v.id || ''))) o.gdocs[k] = { id: String(v.id), ver: String(v.ver || ''), docSig: String(v.docSig || ''), appSig: String(v.appSig || ''), at: +v.at || 0 };
    sortAll(o);
    return o;
  }

  /* ---------- order and numbering ----------
     Book → Part → Act → Sequence → Scene. Everything is kept in story order.
     Within a book: filed scenes by part, act, sequence and position; that book's unfiled scenes come last.
     Parts are numbered within their book, acts within their part; sequences and scenes run through each book. */
  function sortAll(d = data) {
    const stable = (list, key) => list.map((x, i) => [x, i]).sort((a, b) => (key(a[0]) - key(b[0])) || (a[1] - b[1])).map(x => x[0]);
    const bIdx = new Map(d.books.map((b, i) => [b.id, i]));
    d.parts = stable(d.parts, p => bIdx.get(p.bookId) ?? 1e9);
    const pIdx = new Map(d.parts.map((p, i) => [p.id, i]));
    d.acts = stable(d.acts, a => pIdx.get(a.partId) ?? 1e9);
    const aIdx = new Map(d.acts.map((a, i) => [a.id, i]));
    d.sequences = stable(d.sequences, q => aIdx.get(q.actId) ?? 1e9);
    const qIdx = new Map(d.sequences.map((q, i) => [q.id, i]));
    // a filed scene belongs to its sequence's book
    const bookOfSeq = new Map(d.sequences.map(q => { const a = d.acts.find(x => x.id === q.actId); const p = a && d.parts.find(x => x.id === a.partId); return [q.id, p ? p.bookId : null]; }));
    d.scenes.forEach(s => { if (s.seqId && bookOfSeq.get(s.seqId)) s.bookId = bookOfSeq.get(s.seqId); });
    d.scenes = d.scenes.map((s, i) => [s, i]).sort((a, b) => {
      const ka = (bIdx.get(a[0].bookId) ?? 1e9) * 1e6 + (a[0].seqId && qIdx.has(a[0].seqId) ? qIdx.get(a[0].seqId) : 999999);
      const kb = (bIdx.get(b[0].bookId) ?? 1e9) * 1e6 + (b[0].seqId && qIdx.has(b[0].seqId) ? qIdx.get(b[0].seqId) : 999999);
      return (ka - kb) || (a[1] - b[1]);
    }).map(x => x[0]);
    numCache = null;
  }
  function numbers() {
    if (numCache && numCache.rev === data.rev && numCache.len === data.scenes.length) return numCache;
    const book = new Map(), part = new Map(), act = new Map(), seq = new Map(), scene = new Map();
    data.books.forEach((b, i) => book.set(b.id, i + 1));
    const count = new Map(), next = (k) => { const n = (count.get(k) || 0) + 1; count.set(k, n); return n; };
    data.parts.forEach(p => part.set(p.id, next('p:' + p.bookId)));
    data.acts.forEach(a => act.set(a.id, next('a:' + a.partId)));
    const bookOfAct = new Map(data.acts.map(a => [a.id, (data.parts.find(p => p.id === a.partId) || {}).bookId]));
    data.sequences.forEach(q => seq.set(q.id, next('q:' + bookOfAct.get(q.actId))));
    data.scenes.forEach(s => { if (!s.archived && !s.wip) scene.set(s.id, next('s:' + s.bookId)); });
    numCache = { rev: data.rev, len: data.scenes.length, book, part, act, seq, scene };
    return numCache;
  }
  const book = (id) => data.books.find(b => b.id === id) || null;
  const part = (id) => data.parts.find(p => p.id === id) || null;
  const act = (id) => data.acts.find(a => a.id === id) || null;
  const seq = (id) => data.sequences.find(q => q.id === id) || null;
  const scene = (id) => data.scenes.find(s => s.id === id) || null;
  const named = (word, n, name) => `${word} ${n}${name ? ': ' + name : ''}`;
  function bookLabel(b) { return named('Book', numbers().book.get(b.id), b.name); }
  function partLabel(p) { return named('Part', numbers().part.get(p.id), p.name); }
  function actLabel(a) { return named('Act', numbers().act.get(a.id), a.name); }
  function seqLabel(q) { return named('Sequence', numbers().seq.get(q.id), q.name); }
  const partOfAct = (a) => a ? part(a.partId) : null;
  const bookOfPart = (p) => p ? book(p.bookId) : null;
  function where(s) {
    const q = s && s.seqId ? seq(s.seqId) : null;
    if (!q) return null;
    const a = act(q.actId), p = partOfAct(a), b = bookOfPart(p), N = numbers();
    return { book: b, part: p, act: a, seq: q, bookNo: N.book.get(b.id), partNo: N.part.get(p.id), actNo: N.act.get(a.id), seqNo: N.seq.get(q.id) };
  }
  // the book this window is working on (each window can show a different one)
  let currentBook = null;
  function bookId() {
    if (currentBook && book(currentBook)) return currentBook;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}').book; } catch (e) {}
    currentBook = saved && book(saved) ? saved : data.books[0].id;
    return currentBook;
  }
  function setBook(id) {
    if (!book(id) || id === bookId()) return;
    currentBook = id;
    try { const u = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); u.book = id; localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch (e) {}
    for (const fn of [...subs]) { try { fn('shell', { book: true }); } catch (e) { console.error(e); } }
  }
  const scenesOf = (bId = bookId()) => data.scenes.filter(s => s.bookId === bId);
  function tree(bId = bookId()) {
    const N = numbers();
    return {
      book: book(bId),
      parts: data.parts.filter(p => p.bookId === bId).map(p => ({ part: p, no: N.part.get(p.id),
        acts: data.acts.filter(a => a.partId === p.id).map(a => ({ act: a, no: N.act.get(a.id),
          sequences: data.sequences.filter(q => q.actId === a.id).map(q => ({ seq: q, no: N.seq.get(q.id), scenes: data.scenes.filter(s => s.seqId === q.id && !s.archived) })) })) })),
      unfiled: data.scenes.filter(s => s.bookId === bId && !s.seqId && !s.archived),
      archived: data.scenes.filter(s => s.bookId === bId && s.archived)
    };
  }
  function filingOptions(bId = bookId()) {
    const N = numbers();
    return data.sequences.filter(q => { const p = partOfAct(act(q.actId)); return p && p.bookId === bId; })
      .map(q => { const a = act(q.actId), p = part(a.partId); return { value: q.id, label: `Part ${N.part.get(p.id)} › Act ${N.act.get(a.id)} › ${N.seq.get(q.id)}. ${q.name || 'Untitled sequence'}` }; });
  }

  /* ---------- changes ---------- */
  function changed(source, info = {}) {
    data.rev++;
    numCache = null;
    save();
    for (const fn of [...subs]) { try { fn(source, info); } catch (e) { console.error(e); } }
  }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  const S = { structure: true };
  const SO = { structure: true, order: true };
  const moveIn = (list, item, dir, sameGroup) => {
    const group = list.filter(sameGroup), i = group.indexOf(item), j = i + dir;
    if (i < 0 || j < 0 || j >= group.length) return false;
    const a = list.indexOf(item), b = list.indexOf(group[j]);
    list.splice(a, 1); list.splice(b, 0, item);
    return true;
  };

  // books
  function addBook(name, source) {
    const b = { id: 'bk-' + uid(), name: str(name) };
    data.books.push(b);
    data.parts.push({ id: 'pt-' + uid(), bookId: b.id, name: '' });
    sortAll(); changed(source, S); return b;
  }
  function renameBook(id, name, source) { const b = book(id); if (!b) return; b.name = str(name); changed(source, S); }
  function moveBook(id, dir, source) { const b = book(id); if (b && moveIn(data.books, b, dir, () => true)) { sortAll(); changed(source, SO); } }
  // its scenes move to the first other book, unfiled
  function deleteBook(id, source) {
    const b = book(id); if (!b || data.books.length < 2) return null;
    const i = data.books.indexOf(b), to = data.books.find(x => x.id !== id).id;
    const parts = data.parts.filter(p => p.bookId === id), pIds = new Set(parts.map(p => p.id));
    const acts = data.acts.filter(a => pIds.has(a.partId)), aIds = new Set(acts.map(a => a.id));
    const seqs = data.sequences.filter(q => aIds.has(q.actId));
    const moved = data.scenes.filter(s => s.bookId === id).map(s => [s, s.seqId]);
    moved.forEach(([s]) => { s.seqId = null; s.bookId = to; });
    data.books.splice(i, 1);
    data.parts = data.parts.filter(p => !pIds.has(p.id)); data.acts = data.acts.filter(a => !aIds.has(a.id)); data.sequences = data.sequences.filter(q => !seqs.includes(q));
    if (currentBook === id) currentBook = null;
    sortAll(); changed(source, SO);
    return () => { data.books.splice(i, 0, b); data.parts.push(...parts); data.acts.push(...acts); data.sequences.push(...seqs); moved.forEach(([s, q]) => { s.bookId = id; s.seqId = q; }); sortAll(); changed(source, SO); };
  }
  // parts
  function addPart(bookIdArg, name, source) {
    if (!book(bookIdArg)) return null;
    const p = { id: 'pt-' + uid(), bookId: bookIdArg, name: str(name) };
    data.parts.push(p); sortAll(); changed(source, S); return p;
  }
  function renamePart(id, name, source) { const p = part(id); if (!p) return; p.name = str(name); changed(source, S); }
  function movePart(id, dir, source) { const p = part(id); if (p && moveIn(data.parts, p, dir, x => x.bookId === p.bookId)) { sortAll(); changed(source, SO); } }
  function deletePart(id, source) {
    const p = part(id); if (!p) return null;
    const i = data.parts.indexOf(p), acts = data.acts.filter(a => a.partId === id), aIds = new Set(acts.map(a => a.id));
    const seqs = data.sequences.filter(q => aIds.has(q.actId)), qIds = new Set(seqs.map(q => q.id));
    const moved = data.scenes.filter(s => qIds.has(s.seqId)).map(s => [s, s.seqId]);
    moved.forEach(([s]) => { s.seqId = null; });
    data.parts.splice(i, 1); data.acts = data.acts.filter(a => !aIds.has(a.id)); data.sequences = data.sequences.filter(q => !qIds.has(q.id));
    sortAll(); changed(source, SO);
    return () => { data.parts.splice(i, 0, p); data.acts.push(...acts); data.sequences.push(...seqs); moved.forEach(([s, q]) => { s.seqId = q; }); sortAll(); changed(source, SO); };
  }
  // acts
  function addAct(partId, name, source) {
    if (!part(partId)) return null;
    const a = { id: 'a-' + uid(), partId, name: str(name) };
    data.acts.push(a); sortAll(); changed(source, S); return a;
  }
  function renameAct(id, name, source) { const a = act(id); if (!a) return; a.name = str(name); changed(source, S); }
  function moveAct(id, dir, source) { const a = act(id); if (a && moveIn(data.acts, a, dir, x => x.partId === a.partId)) { sortAll(); changed(source, SO); } }
  function moveActToPart(id, partId, source) {
    const a = act(id); if (!a || !part(partId) || a.partId === partId) return;
    data.acts.splice(data.acts.indexOf(a), 1); a.partId = partId; data.acts.push(a);
    sortAll(); changed(source, SO);
  }
  function deleteAct(id, source) {
    const a = act(id); if (!a) return null;
    const i = data.acts.indexOf(a), qs = data.sequences.filter(q => q.actId === id), qIds = new Set(qs.map(q => q.id));
    const moved = data.scenes.filter(s => qIds.has(s.seqId)).map(s => [s, s.seqId]);
    moved.forEach(([s]) => { s.seqId = null; });
    data.acts.splice(i, 1); data.sequences = data.sequences.filter(q => !qIds.has(q.id));
    sortAll(); changed(source, SO);
    return () => { data.acts.splice(i, 0, a); data.sequences.push(...qs); moved.forEach(([s, q]) => { s.seqId = q; }); sortAll(); changed(source, SO); };
  }
  // sequences
  function addSequence(actId, name, source) {
    if (!act(actId)) return null;
    const q = { id: 'q-' + uid(), actId, name: str(name) };
    data.sequences.push(q); sortAll(); changed(source, S); return q;
  }
  function renameSequence(id, name, source) { const q = seq(id); if (!q) return; q.name = str(name); changed(source, S); }
  // put a sequence into an act (any part), before another sequence or at the end of the act
  function moveSequence(id, actId, beforeId, source) {
    const q = seq(id); if (!q || !act(actId) || beforeId === id) return;
    data.sequences.splice(data.sequences.indexOf(q), 1);
    q.actId = actId;
    const b = beforeId ? data.sequences.findIndex(x => x.id === beforeId) : -1;
    if (b >= 0) data.sequences.splice(b, 0, q); else data.sequences.push(q);
    sortAll(); changed(source, SO);
  }
  const seqBook = (q) => { const p = partOfAct(act(q.actId)); return p ? p.bookId : null; };
  // a new number moves it into the place of the sequence that has that number now (within its book)
  function setSequenceNumber(id, n, source) {
    const q = seq(id); if (!q) return;
    const list = data.sequences.filter(x => seqBook(x) === seqBook(q)), cur = list.indexOf(q) + 1;
    n = Math.max(1, Math.min(list.length, Math.round(n)));
    if (n === cur) return;
    const target = list[n - 1];
    if (n > cur) { const after = list[n]; moveSequence(id, target.actId, after && after.actId === target.actId ? after.id : null, source); }
    else moveSequence(id, target.actId, target.id, source);
  }
  function deleteSequence(id, source) {
    const q = seq(id); if (!q) return null;
    const i = data.sequences.indexOf(q), moved = data.scenes.filter(s => s.seqId === id);
    moved.forEach(s => { s.seqId = null; });
    data.sequences.splice(i, 1); sortAll(); changed(source, SO);
    return () => { data.sequences.splice(i, 0, q); moved.forEach(s => { s.seqId = id; }); sortAll(); changed(source, SO); };
  }
  // scenes: file into a sequence (null = unfiled in its book, or in bookIdArg), before another scene or at the end
  function moveScene(id, seqId, beforeId, source, bookIdArg) {
    const s = scene(id); if (!s || beforeId === id) return;
    if (seqId && !seq(seqId)) seqId = null;
    data.scenes.splice(data.scenes.indexOf(s), 1);
    s.seqId = seqId || null;
    if (!s.seqId && bookIdArg && book(bookIdArg)) s.bookId = bookIdArg;
    const b = beforeId ? data.scenes.findIndex(x => x.id === beforeId) : -1;
    if (b >= 0) data.scenes.splice(b, 0, s); else data.scenes.push(s);
    sortAll(); changed(source, SO);
  }
  function setSceneNumber(id, n, source) {
    const s = scene(id); if (!s || s.wip || s.archived) return;
    const list = data.scenes.filter(x => !x.wip && !x.archived && x.bookId === s.bookId), cur = list.indexOf(s) + 1;
    n = Math.max(1, Math.min(list.length, Math.round(n)));
    if (n === cur) return;
    const target = list[n - 1];
    if (n > cur) {
      const all = data.scenes, ti = all.indexOf(target), nx = all.slice(ti + 1).find(x => x.seqId === target.seqId && x.bookId === target.bookId);
      moveScene(id, target.seqId, nx ? nx.id : null, source, target.bookId);
    } else moveScene(id, target.seqId, target.id, source, target.bookId);
  }
  // new scenes join the end of their sequence, or their book's Unfiled in board order (top to bottom)
  function addScene(fields, opts = {}, source) {
    const s = normScene({ ...fields, id: fields.id || 's-' + uid() });
    s.bookId = opts.bookId && book(opts.bookId) ? opts.bookId : bookId();
    if (fields.x === undefined && fields.y === undefined) {
      const vis = data.scenes.filter(x => !x.archived && x.bookId === s.bookId);
      s.x = vis.length ? Math.min(...vis.map(x => x.x)) : 0;
      s.y = vis.length ? Math.max(...vis.map(x => x.y)) + 260 : 0;
    }
    s.seqId = opts.seqId && seq(opts.seqId) ? opts.seqId : null;
    if (opts.beforeId && scene(opts.beforeId)) data.scenes.splice(data.scenes.indexOf(scene(opts.beforeId)), 0, s);
    else if (!s.seqId && opts.byPosition) {
      const band = (c) => Math.round(c.y / 40);
      const later = data.scenes.find(x => !x.seqId && !x.archived && x.bookId === s.bookId && ((band(x) - band(s)) || (x.x - s.x)) > 0);
      if (later) data.scenes.splice(data.scenes.indexOf(later), 0, s); else data.scenes.push(s);
    } else data.scenes.push(s);
    sortAll(); changed(source, SO);
    return s;
  }
  // returns an undo function
  function deleteScenes(ids, source) {
    const set = new Set(ids);
    const removed = data.scenes.map((s, i) => [s, i]).filter(([s]) => set.has(s.id));
    const links = data.links.filter(l => set.has(l.from) || set.has(l.to));
    if (!removed.length) return null;
    data.scenes = data.scenes.filter(s => !set.has(s.id));
    data.links = data.links.filter(l => !set.has(l.from) && !set.has(l.to));
    sortAll(); changed(source, { structure: true, order: true, deleted: ids });
    return () => {
      removed.forEach(([s, i]) => { if (!scene(s.id)) data.scenes.splice(Math.min(i, data.scenes.length), 0, s); });
      links.forEach(l => { if (!data.links.some(x => x.id === l.id)) data.links.push(l); });
      sortAll(); changed(source, SO);
    };
  }
  function setArchived(id, on, source) { const s = scene(id); if (!s) return; s.archived = !!on; sortAll(); changed(source, SO); }
  function setDraftWords(sceneId, words, source) {
    if (!sceneId || data.drafts[sceneId] === words) return;
    data.drafts[sceneId] = words; changed(source, { drafts: true });
  }
  function setGdoc(sceneId, rec, source) {
    if (!sceneId) return;
    if (rec) data.gdocs[sceneId] = { id: String(rec.id), ver: String(rec.ver || ''), docSig: String(rec.docSig || ''), appSig: String(rec.appSig || ''), at: +rec.at || Date.now() };
    else if (data.gdocs[sceneId]) delete data.gdocs[sceneId]; else return;
    changed(source, { gdocs: true });
  }
  const newBeat = (f = {}) => normBeat({ ...f, id: 'b-' + uid() });

  /* ---------- saving ---------- */
  function setStatus(kind, text) { $('dot').className = 'dot' + (kind === 'saving' ? ' saving' : kind === 'error' ? ' error' : ''); $('statusText').textContent = text; }
  function save() {
    if (blocked) return;
    setStatus('saving', 'Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  }
  async function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (blocked || !db) return;
    if (saving) { again = true; return saving; }
    saving = (async () => {
      try {
        const stored = await idbGet(db, 'story');
        if (stored && stored.rev > data.rev && stored.win !== WIN) data.rev = stored.rev + 1; // another window saved meanwhile
        await idbPut(db, 'story', { ...JSON.parse(JSON.stringify(data)), win: WIN, savedAt: Date.now() });
        setStatus('ok', FileSync.status() || 'Saved');
        try { channel && channel.postMessage({ rev: data.rev, win: WIN }); } catch (e) {}
        FileSync.soon();
      } catch (e) {
        setStatus('error', 'Not saved — use Backup');
      } finally { saving = null; }
      if (again) { again = false; return flush(); }
    })();
    return saving;
  }

  // other windows of the studio
  let channel = null;
  try {
    channel = new BroadcastChannel('kotw_story');
    channel.onmessage = async (e) => {
      if (!e.data || e.data.win === WIN || !(e.data.rev > data.rev)) return;
      try {
        const stored = await idbGet(db, 'story');
        if (stored && stored.rev > data.rev) { data = normalize(stored); data.rev = stored.rev; numCache = null; for (const fn of [...subs]) fn('remote', { structure: true, order: true }); }
      } catch (err) {}
    };
  } catch (e) {}

  /* ---------- first open: bring in the Scene Board and Beat Sheet ---------- */
  async function migrate() {
    const d = blank();
    let board = null;
    try {
      for (const k of [OLD_BOARD_KEY, ...OLD_BOARD_KEYS]) { const raw = localStorage.getItem(k); if (raw) { board = JSON.parse(raw); break; } }
    } catch (e) {}
    let beats = null;
    try { const bdb = await idbOpen(OLD_BEATS_DB, false); beats = await idbGet(bdb, 'state'); bdb.close(); } catch (e) {}
    const report = { scenes: 0, beats: 0 };
    if (board && Array.isArray(board.cards)) {
      const cards = board.cards.filter(c => c && c.id && c.status !== 'benched');
      const band = (c) => Math.round(num(c.y) / 40);
      cards.sort((a, b) => (band(a) - band(b)) || (num(a.x) - num(b.x)) || (num(a.y) - num(b.y)));
      d.scenes = cards.map(c => normScene({ id: String(c.id), title: c.title, pov: c.pov, location: c.location, objective: c.objective ?? c.focus,
        summary: c.summary ?? c.desc, wip: c.wip === true, x: c.x, y: c.y }));
      d.links = Array.isArray(board.links) ? board.links : (Array.isArray(board.connections) ? board.connections : []);
      if (board.lanes) d.lanes = board.lanes;
      const v = board.view || { x: board.pan?.x, y: board.pan?.y, zoom: board.zoom };
      d.board = { view: { x: num(v?.x, 80), y: num(v?.y, 80), zoom: num(v?.zoom, 1) }, showNumbers: true };
    }
    if (beats && Array.isArray(beats.scenes)) {
      // edits made in the writing room that the Beat Sheet hadn't applied yet
      try {
        const ops = JSON.parse(localStorage.getItem(OLD_BEAT_OPS_KEY) || '[]').filter(u => u && (+u.at || 0) > num(beats.opsApplied)).sort((a, b) => a.at - b.at);
        ops.forEach(u => applyOldOp(beats.scenes, u));
      } catch (e) {}
      const byId = new Map(d.scenes.map(s => [s.id, s]));
      let extraY = d.scenes.length ? Math.max(...d.scenes.map(s => s.y)) + 300 : 0;
      for (const bs of beats.scenes) {
        if (!bs || !bs.id) continue;
        let s = byId.get(String(bs.id));
        if (!s) {
          if (bs.linked) continue; // a scene that was removed from the board
          s = normScene({ id: bs.id, title: bs.title, pov: bs.pov, location: bs.location, objective: bs.objective, summary: bs.summary, wip: bs.wip, x: 0, y: extraY });
          extraY += 220; d.scenes.push(s); byId.set(s.id, s);
        }
        s.beats = (bs.beats || []).filter(Boolean).map(normBeat);
        s.type = str(bs.type) || 'free';
        s.archived = !!bs.archived;
      }
      d.templates = Array.isArray(beats.templates) ? beats.templates : [];
    }
    report.scenes = d.scenes.length;
    report.beats = d.scenes.reduce((n, s) => n + s.beats.length, 0);
    return { story: normalize(d), report, found: !!(board || beats) };
  }
  function applyOldOp(scenes, u) {
    const sc = scenes.find(x => x.id === u.sceneId); if (!sc) return;
    sc.beats = sc.beats || [];
    const b = sc.beats.find(x => x.id === u.beatId), op = u.op || 'done';
    if (op === 'done' && b) b.done = !!u.done;
    else if (op === 'set' && b && ['label', 'text', 'notes'].includes(u.field)) b[u.field] = String(u.value ?? '');
    else if (op === 'dlg' && b && Array.isArray(u.dialogue)) b.dialogue = u.dialogue;
    else if (op === 'add' && u.beat && !sc.beats.some(x => x.id === u.beat.id)) {
      let i = u.after === '__start' ? 0 : u.after ? sc.beats.findIndex(x => x.id === u.after) + 1 : sc.beats.length;
      if (u.after && u.after !== '__start' && i === 0) i = sc.beats.length;
      sc.beats.splice(i, 0, { id: u.beat.id, label: u.beat.label || '', text: u.beat.text || '', prompt: '', done: false, notes: '', dialogue: [], images: [] });
    } else if (op === 'del') sc.beats = sc.beats.filter(x => x.id !== u.beatId);
    else if (op === 'order' && Array.isArray(u.ids)) { const pos = new Map(u.ids.map((id, i) => [id, i])); sc.beats.sort((a, c) => (pos.get(a.id) ?? 1e9) - (pos.get(c.id) ?? 1e9)); }
  }

  async function init() {
    try { db = await idbOpen(STORY_DB, true); }
    catch (e) { blocked = true; setStatus('error', 'This browser cannot save'); data = blank(); return { error: e }; }
    let stored = null;
    try { stored = await idbGet(db, 'story'); } catch (e) {}
    if (stored) {
      try { data = normalize(stored); data.rev = num(stored.rev); setStatus('ok', 'Saved'); return {}; }
      catch (e) {
        blocked = true; data = blank(); setStatus('error', 'Saving paused');
        return { unreadable: e, raw: stored };
      }
    }
    const m = await migrate();
    data = m.story;
    data.rev = 1;
    await flush();
    return { migrated: m.found ? m.report : null };
  }

  function replace(d, source) {
    data = normalize(d); blocked = false; numCache = null;
    changed(source, { structure: true, order: true, replaced: true });
  }
  const serialize = () => JSON.stringify({ ...data, app: 'kotw-story', savedAt: new Date().toISOString() }, null, 1);

  return {
    get data() { return data; }, init, subscribe, changed, flush, replace, serialize, normalize,
    numbers, book, part, act, seq, scene, bookLabel, partLabel, actLabel, seqLabel, partOfAct, bookOfPart, where, tree, filingOptions, scenesOf,
    get bookId() { return bookId(); }, setBook, sortAll: () => { sortAll(); },
    addBook, renameBook, moveBook, deleteBook, addPart, renamePart, movePart, deletePart,
    addAct, renameAct, moveAct, moveActToPart, deleteAct, addSequence, renameSequence, moveSequence, setSequenceNumber, deleteSequence,
    defaultHolidays: () => DEFAULT_HOLIDAYS.map(h => ({ ...h })),
    addScene, moveScene, setSceneNumber, deleteScenes, setArchived, setDraftWords, setGdoc, newBeat, normBeat,
    setStatus, get blocked() { return blocked; }
  };
})();

const CLOUD_CLIENT_ID = '746584309009-0ifbot96l5pdrmdifm6oid3670l109pr.apps.googleusercontent.com';
// 'studio' = the full studio on a computer; 'ipad' = the installable iPad app
const APP_MODE = 'ipad' === 'ipad' ? 'ipad' : 'studio';
window.APP_MODE = APP_MODE;


/* ---------- iStory has no "Sync to File": Google Drive sync and Backup cover it ---------- */
const FileSync = { status: () => '', soon() {}, restore() {}, click() {} };

/* ---------- The writing room's own storage (the typewriter manuscripts) ---------- */
const WritingStore = (() => {
  const NAME = 'underwood-quiet-v1';
  const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(NAME, 2);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('state')) d.createObjectStore('state'); if (!d.objectStoreNames.contains('pages')) d.createObjectStore('pages'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('close other copies of the studio first'));
    });
  }
  // → { meta, pages: {id: page} } for everything the typewriter has stored here
  async function read() {
    const db = await open();
    try {
      const meta = await rq(db.transaction('state').objectStore('state').get('meta'));
      if (!meta || meta.format !== 6) return { meta: null, pages: {} };
      const ids = (meta.manuscripts || []).flatMap(m => m.pageIds || []);
      const store = db.transaction('pages').objectStore('pages');
      const got = await Promise.all(ids.map(id => rq(store.get(id))));
      const pages = {}; ids.forEach((id, i) => { if (got[i]) pages[id] = got[i]; });
      return { meta, pages };
    } finally { db.close(); }
  }
  async function write(meta, pages, removeIds, clearMeta) {
    const db = await open();
    try {
      await new Promise((res, rej) => {
        const t = db.transaction(['state', 'pages'], 'readwrite'), s = t.objectStore('state'), p = t.objectStore('pages');
        if (meta) s.put(meta, 'meta'); else if (clearMeta) s.delete('meta');
        for (const id of Object.keys(pages || {})) p.put(pages[id], id);
        for (const id of (removeIds || [])) p.delete(id);
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('could not write the manuscripts'));
      });
    } finally { db.close(); }
  }
  // a short fingerprint of some text (to tell whether a sheet changed)
  function hash(s) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '.' + s.length.toString(36);
  }
  return { read, write, hash };
})();

/* the whole studio in one object: story + manuscripts (used by Backup, Restore and Cloud) */
async function exportAll() {
  await Story.flush();
  const w = await WritingStore.read();
  return { app: 'kotw-studio-backup', version: 1, savedAt: new Date().toISOString(), story: JSON.parse(Story.serialize()), meta: w.meta, pages: w.pages };
}
async function importAll(raw, source) {
  const story = Story.normalize(raw.story);
  const pages = raw.pages || {};
  const cur = await WritingStore.read();
  replacingWriting();
  await WritingStore.write(raw.meta || null, pages, Object.keys(cur.pages).filter(id => !(id in pages)), !raw.meta);
  replacingWriting();
  Story.replace(story, source || 'shell');
  await Story.flush();
}
function reloadWithToast(msg) { try { sessionStorage.setItem('kotw_toast', msg); } catch (e) {} location.reload(); }
// Before the saved manuscripts are replaced (a newer copy from the cloud, or a restore), stop the open writing room
// from saving its older copy on the way out, and drop its crash-recovery sheet so it cannot be put back after the reload.
function replacingWriting() {
  window.__kotwReplacing = true;
  try { localStorage.removeItem('underwood-quiet-v1.recovery2'); localStorage.removeItem('underwood-quiet-v1.recovery'); } catch (e) {}
}

/* ---------- Voice memos: audio kept on this device, and in the cloud folder as separate files ---------- */
const MediaStore = (() => {
  const NAME = 'kotw_media';
  const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('memos')) r.result.createObjectStore('memos'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function op(mode, fn) { const db = await open(); try { return await rq(fn(db.transaction('memos', mode).objectStore('memos'))); } finally { db.close(); } }
  // Safari stores Blobs in IndexedDB; keep the bytes and type separately so any browser can read them back
  async function put(id, blob) { const buf = await blob.arrayBuffer(); await op('readwrite', s => s.put({ type: blob.type || '', buf }, id)); }
  async function get(id) { try { const v = await op('readonly', s => s.get(id)); return v ? new Blob([v.buf], { type: v.type || '' }) : null; } catch (e) { return null; } }
  async function del(id) { try { await op('readwrite', s => s.delete(id)); } catch (e) {} }
  return { put, get, del };
})();
// memo ids the story refers to
const memoIds = (story) => [...new Set((story.scenes || []).flatMap(sc => [sc.memo && sc.memo.id, ...(sc.beats || []).map(b => b && b.memo && b.memo.id)]).filter(Boolean))];

/* ---------- Cloud sync: your story and manuscripts, kept in a hidden folder in your own Google Drive ---------- */
const CloudSync = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  // asked for only once a scene is linked to a Google Doc: lets the studio read and update the Docs it made
  const FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const MANIFEST = 'studio-manifest.json';
  const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';
  const CFG_KEY = 'kotw_cloud', TOKEN_KEY = 'kotw_cloud_token';
  // what identifies a version of the cloud file: its content fingerprint (Drive's own version number can rise by itself)
  const stampOf = (f) => f ? (f.md5Checksum ? 'm:' + f.md5Checksum : 'v:' + f.version) : null;
  const pageName = (id, h) => 'p_' + id + '_' + h + '.gz';
  const memoName = (id) => 'a_' + id;
  const LABEL = { signedout: '☁ Sign in', idle: '☁ Synced', syncing: '☁ Syncing…', waiting: '☁ Saving soon…', reconnect: APP_MODE === 'ipad' ? '☁ Tap to sync' : '☁ Reconnect', offline: '☁ Offline · will sync',
    conflict: '☁ Choose version', error: '☁ Sync problem', other: '☁ Other window' };
  const TITLE = { signedout: 'Sign in with Google to keep your story in the cloud', idle: 'Everything is saved to your Google Drive', syncing: 'Syncing with Google Drive…',
    waiting: 'Changes will be saved to Google Drive in a few seconds', reconnect: 'Click to sign in to Google again. Your work is still safe on this computer.',
    offline: 'No connection. Your work is safe on this computer and will sync when you are back online.', conflict: 'The cloud copy and this computer differ. Click to choose.',
    error: 'Something went wrong talking to Google Drive.', other: 'Cloud sync is running in another studio window.' };

  let cfg = {}, token = null, tokenExp = 0, tokenClient = null, pending = null, gis = null, tokenScope = '';
  let st = { base: null, pages: {}, dirty: false, sig: null, lastOk: 0 };
  let cdb = null, mode = 'signedout', busy = false, again = false, timer = null, firstAt = 0, seq = 0, needGesture = false, leader = true, started = false;
  let bc = null, deferred = false, hinted = false;

  /* ----- settings ----- */
  function loadCfg() {
    try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) { cfg = {}; }
    try { const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); if (t && t.exp > Date.now() + 60000) { token = t.t; tokenExp = t.exp; tokenScope = t.s || ''; } } catch (e) {}
  }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function saveTok() { try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ t: token, exp: tokenExp, s: tokenScope })); } catch (e) {} saveCfg(); }
  const scopes = () => cfg.files ? SCOPE + ' ' + FILE_SCOPE : SCOPE;
  const clientId = () => (typeof CLOUD_CLIENT_ID === 'string' && CLOUD_CLIENT_ID) || cfg.clientId || '';
  const signedIn = () => !!(cfg.signedIn && clientId());
  const webOk = () => location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  async function loadSt() {
    try { cdb = await idbOpen(STORY_DB, true); const s = await idbGet(cdb, 'cloud'); if (s && typeof s === 'object') st = { base: s.base ?? null, pages: s.pages || {}, dirty: !!s.dirty, sig: s.sig || null, lastOk: +s.lastOk || 0 }; } catch (e) {}
  }
  async function saveSt() { try { if (!cdb) cdb = await idbOpen(STORY_DB, true); await idbPut(cdb, 'cloud', st); } catch (e) {} }

  // how long ago the last good sync was, in plain words
  function ago(t) {
    if (!t) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    const d = new Date(t), today = new Date().toDateString() === d.toDateString();
    return today ? 'at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function setMode(m, msg) {
    mode = m;
    const b = $('btnCloud'); if (!b) return;
    const label = m === 'idle' && st.lastOk ? 'Synced · ' + ago(st.lastOk) : (LABEL[m] || LABEL.error).replace(/^☁ /, '');
    if (window.paintCloud) window.paintCloud(b, m, label); else b.textContent = label;
    b.classList.toggle('synced', m === 'idle');
    b.classList.toggle('reconnect', ['reconnect', 'conflict', 'error', 'offline'].includes(m));
    b.title = msg || TITLE[m] || '';
  }

  /* ----- Google sign-in (a short-lived key that only opens this app's own folder) ----- */
  const tokenOk = () => token && Date.now() < tokenExp - 60000;
  const needSignIn = (why) => Object.assign(new Error(why || 'Sign in to Google again'), { name: 'NeedSignIn' });
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gis) return gis;
    gis = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { gis = null; rej(new TypeError('offline')); };
      document.head.appendChild(s);
    });
    return gis;
  }
  function requestToken(prompt) {
    if (pending) return pending.promise;
    const p = {}; p.promise = new Promise((res, rej) => { p.res = res; p.rej = rej; }); pending = p;
    (async () => {
      try {
        await loadGis();
        if (!tokenClient) tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId(), scope: scopes(),
          callback: (r) => {
            const q = pending; pending = null; if (!q) return;
            if (!r || r.error) q.rej(needSignIn(r && r.error));
            else { token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; tokenScope = r.scope || scopes(); cfg.signedIn = true; saveTok(); q.res(token); }
          },
          error_callback: (er) => { const q = pending; pending = null; q && q.rej(needSignIn(er && er.type)); }
        });
        tokenClient.requestAccessToken({ prompt });
      } catch (e) { const q = pending; pending = null; q && q.rej(e); }
    })();
    return p.promise;
  }
  async function getToken() {
    if (tokenOk()) return token;
    if (needGesture) throw needSignIn();
    return requestToken('none');
  }

  /* ----- Google Docs permission (for scenes linked to a Google Doc) ----- */
  const hasFile = () => tokenOk() && tokenScope.includes(FILE_SCOPE);
  async function fileToken(interactive) {
    if (hasFile()) return token;
    if (!signedIn()) throw Object.assign(new Error('Sign in with the ☁ button first.'), { name: 'NeedSignIn' });
    if (!cfg.files) { cfg.files = true; saveCfg(); tokenClient = null; }
    if (!interactive && needGesture) throw needSignIn();
    await requestToken(interactive ? '' : 'none');
    if (!tokenScope.includes(FILE_SCOPE)) {
      // the Google Docs box was left unticked: go back to asking for the sync folder alone
      cfg.files = false; saveCfg(); tokenClient = null;
      throw Object.assign(new Error('Google did not give the studio permission to use Google Docs. Try again and leave the Google Docs box ticked.'), { name: 'NoDocs' });
    }
    return token;
  }
  async function fileApi(url, opts = {}, interactive = false, retry = true) {
    const t = await fileToken(interactive);
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
    if (r.status === 401 && retry) { token = null; tokenExp = 0; return fileApi(url, opts, interactive, false); }
    if (!r.ok) { let body = ''; try { body = await r.text(); } catch (e) {} const e = new Error('Google Drive said ' + r.status + (body ? ': ' + body.slice(0, 200) : '')); e.status = r.status; throw e; }
    return r;
  }

  /* ----- Google Drive calls ----- */
  async function api(url, opts = {}, retry = true) {
    const t = await getToken();
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
    if (r.status === 401 && retry) { token = null; tokenExp = 0; return api(url, opts, false); }
    if (!r.ok) { let body = ''; try { body = await r.text(); } catch (e) {} const e = new Error('Google Drive said ' + r.status + (body ? ': ' + body.slice(0, 200) : '')); e.status = r.status; throw e; }
    return r;
  }
  async function listFiles() {
    const out = []; let pt = '';
    do {
      const u = `${API}/files?spaces=appDataFolder&pageSize=1000&fields=${encodeURIComponent('nextPageToken,files(id,name,version,md5Checksum,modifiedTime)')}` + (pt ? '&pageToken=' + encodeURIComponent(pt) : '');
      const j = await (await api(u)).json(); out.push(...(j.files || [])); pt = j.nextPageToken;
    } while (pt);
    // if two computers ever created the manifest at once, use the newest
    out.sort((a, b) => String(a.modifiedTime).localeCompare(String(b.modifiedTime)));
    return new Map(out.map(f => [f.name, f]));
  }
  async function putFile(name, blob, existing) {
    const mime = 'application/octet-stream';
    if (blob.size > 4.5e6) {   // large files go up in Google's resumable way
      const meta = existing ? {} : { name, parents: ['appDataFolder'], mimeType: mime };
      const r = await api(existing ? `${UP}/files/${existing.id}?uploadType=resumable` : `${UP}/files?uploadType=resumable`, { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(blob.size) }, body: JSON.stringify(meta) });
      const loc = r.headers.get('Location'); if (!loc) throw new Error('Google did not accept the large upload');
      const t = await getToken();
      const up = await fetch(loc + (loc.includes('?') ? '&' : '?') + 'fields=id,name,version,md5Checksum', { method: 'PUT', headers: { 'Content-Type': mime, Authorization: 'Bearer ' + t }, body: blob });
      if (!up.ok) { const e = new Error('Google Drive said ' + up.status); e.status = up.status; throw e; }
      return up.json();
    }
    if (existing) return (await api(`${UP}/files/${existing.id}?uploadType=media&fields=id,name,version,md5Checksum`, { method: 'PATCH', headers: { 'Content-Type': mime }, body: blob })).json();
    const b = 'kotw' + Math.random().toString(36).slice(2);
    const head = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: mime });
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${head}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${b}--`]);
    return (await api(`${UP}/files?uploadType=multipart&fields=id,name,version,md5Checksum`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body })).json();
  }
  async function getFile(f) { return (await api(`${API}/files/${f.id}?alt=media`)).blob(); }
  async function gz(text) {
    if (typeof CompressionStream === 'undefined') return new Blob([text]);
    return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  }
  async function gunzip(blob) {
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (head[0] === 0x1f && head[1] === 0x8b) return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return blob.text();
  }
  async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
  }

  /* ----- one sync ----- */
  async function snapshot() {
    await Story.flush();
    const story = JSON.parse(Story.serialize());
    const w = await WritingStore.read();
    const pages = {};
    for (const [id, pg] of Object.entries(w.pages)) { const json = JSON.stringify(pg); pages[id] = { json, hash: WritingStore.hash(json) }; }
    return { story, meta: w.meta, pages };
  }
  // a fingerprint of the real content: story + sheets + settings, ignoring counters and timestamps that change whenever a window opens
  function sigOf(story, meta, pageHashes) {
    const s = { ...story }; delete s.savedAt; delete s.rev; delete s.win;
    if (s.gdocs && !Object.keys(s.gdocs).length) delete s.gdocs;   // no linked Docs reads the same as before Doc links existed
    let m = null;
    if (meta) { m = { ...meta }; delete m.rev; delete m.owner; delete m.savedAt; delete m.pendingActions; m.manuscripts = (m.manuscripts || []).map(x => { const y = { ...x }; delete y.updated; return y; }); }
    return WritingStore.hash(JSON.stringify(s)) + '|' + WritingStore.hash(JSON.stringify(m)) + '|' + WritingStore.hash(JSON.stringify(Object.keys(pageHashes).sort().map(k => [k, pageHashes[k]])));
  }
  const snapSig = (snap) => sigOf(snap.story, snap.meta, Object.fromEntries(Object.entries(snap.pages).map(([id, p]) => [id, p.hash])));
  async function fetchManifest(mf) {
    const m = JSON.parse(await gunzip(await getFile(mf)));
    if (!m || m.app !== 'kotw-cloud' || !m.story) throw new Error('The cloud copy is not a Story Studio save');
    return m;
  }
  async function localHasContent() {
    if (Story.data.scenes.length) return true;
    // a brand-new writing room starts with one empty sheet; that is not content
    try { const w = await WritingStore.read(); return Object.values(w.pages).some(pg => pg && (pg.imps || []).length > 0); } catch (e) { return false; }
  }
  async function push(files, mf, snap0) {
    const mySeq = seq;
    const snap = snap0 || await snapshot();
    const ids = Object.keys(snap.pages);
    const todo = ids.filter(id => !files.has(pageName(id, snap.pages[id].hash)));
    await pool(todo, 3, async (id) => { await putFile(pageName(id, snap.pages[id].hash), await gz(snap.pages[id].json), null); });
    // voice memos go up before the save that mentions them
    const memos = memoIds(snap.story);
    await pool(memos.filter(id => !files.has(memoName(id))), 2, async (id) => { const b = await MediaStore.get(id); if (b) await putFile(memoName(id), b, null); });
    // has another computer saved since we looked?
    const now = (await listFiles()).get(MANIFEST);
    if (stampOf(now) !== stampOf(mf)) throw Object.assign(new Error('changed elsewhere'), { code: 'race' });
    const manifest = { app: 'kotw-cloud', v: 1, savedAt: new Date().toISOString(),
      counts: { scenes: snap.story.scenes.length, manuscripts: ((snap.meta && snap.meta.manuscripts) || []).length },
      story: snap.story, meta: snap.meta, pages: Object.fromEntries(ids.map(id => [id, snap.pages[id].hash])) };
    const out = await putFile(MANIFEST, await gz(JSON.stringify(manifest)), mf);
    // sheets the old cloud copy used that this one no longer does
    const old = st.pages || {}, stale = [];
    for (const id of Object.keys(old)) if (old[id] !== manifest.pages[id]) { const f = files.get(pageName(id, old[id])); if (f) stale.push(f); }
    st.base = stampOf(out); st.pages = manifest.pages; st.sig = snapSig(snap); st.dirty = seq !== mySeq;
    await saveSt();
    // memos no scene uses any more
    for (const [name, f] of files) if (name.startsWith('a_') && !memos.includes(name.slice(2))) stale.push(f);
    for (const f of stale) api(`${API}/files/${f.id}`, { method: 'DELETE' }).catch(() => {});
    if (st.dirty) schedule(1000);
  }
  async function readRemotePages(files, remote) {
    const out = {};
    await pool(Object.keys(remote.pages), 3, async (id) => {
      const f = files.get(pageName(id, remote.pages[id]));
      if (!f) throw Object.assign(new Error('The cloud copy is still being written by another computer. Trying again shortly.'), { code: 'race' });
      const text = await gunzip(await getFile(f));
      if (WritingStore.hash(text) !== remote.pages[id]) throw Object.assign(new Error('The cloud copy changed while reading'), { code: 'race' });
      out[id] = JSON.parse(text);
    });
    return out;
  }
  // this device's copies from before Drive's copy replaced them (newest first, up to 5), so a download can be undone
  const KEEP = 'cloudBefore';
  async function keepBefore(remote) {
    try {
      if (!(await localHasContent())) return;
      if (!cdb) cdb = await idbOpen(STORY_DB, true);
      const list = (await idbGet(cdb, KEEP)) || [];
      list.unshift({ at: Date.now(), from: remote.savedAt || null, data: await exportAll() });
      await idbPut(cdb, KEEP, list.slice(0, 5));
    } catch (e) {}
  }
  async function putBack() {
    let list = [];
    try { if (!cdb) cdb = await idbOpen(STORY_DB, true); list = (await idbGet(cdb, KEEP)) || []; } catch (e) {}
    if (!list.length) { shellToast('There is no earlier copy on this device yet.', 5000); return; }
    // a rough word count of the typed sheets: letters typed / 5.7
    const words = (d) => Math.round(Object.values(d.pages || {}).reduce((n, pg) => n + ((pg && pg.imps) || []).filter(i => i && i[0] && i[0] !== ' ').length, 0) / 5.7);
    const label = (k) => { const d = new Date(k.at); return (new Date().toDateString() === d.toDateString() ? 'Today ' : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ') + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ` · ${(k.data.story.scenes || []).length} scene${(k.data.story.scenes || []).length === 1 ? '' : 's'} · about ${words(k.data).toLocaleString()} words typed`; };
    const shown = list.slice(0, 3);
    const pick = await ask('Put back an earlier copy',
      'These are the copies this device had just before a newer copy came down from your Google Drive. The one you pick replaces what is here now and is then saved to Drive for your other devices.\n\nWhat is here now is downloaded first as a backup, so nothing is lost.',
      [...shown.map(label), 'Cancel']);
    if (pick >= shown.length) return;
    download(JSON.stringify(await exportAll()), `istory-before-putting-back-${stamp()}.json`);
    await importAll(shown[pick].data, 'shell');
    st.dirty = true; await saveSt();
    reloadWithToast('Earlier copy put back. It is being saved to your Google Drive.');
  }
  async function pull(files, remote, mf) {
    await keepBefore(remote);
    const local = await WritingStore.read();
    const have = {}; for (const [id, pg] of Object.entries(local.pages)) have[id] = WritingStore.hash(JSON.stringify(pg));
    const need = Object.keys(remote.pages).filter(id => have[id] !== remote.pages[id]);
    const got = {};
    await pool(need, 3, async (id) => {
      const f = files.get(pageName(id, remote.pages[id]));
      if (!f) throw Object.assign(new Error('The cloud copy is still being written by another computer. Trying again shortly.'), { code: 'race' });
      const text = await gunzip(await getFile(f));
      if (WritingStore.hash(text) !== remote.pages[id]) throw Object.assign(new Error('The cloud copy changed while reading'), { code: 'race' });
      got[id] = JSON.parse(text);
    });
    replacingWriting();
    await WritingStore.write(remote.meta || null, got, Object.keys(local.pages).filter(id => !(id in remote.pages)), false);
    replacingWriting();
    Story.replace(Story.normalize(remote.story), 'cloud');
    await Story.flush();
    st.base = stampOf(mf); st.pages = { ...remote.pages }; st.dirty = false; st.sig = snapSig(await snapshot()); st.lastOk = Date.now();
    await saveSt();
    try { bc && bc.postMessage({ reload: true }); } catch (e) {}
    reloadWithToast('Updated from your Google Drive copy.');
    await new Promise(() => {}); // the page is reloading
  }

  /* ----- when this computer and the cloud disagree ----- */
  function ask(title, body, buttons) {
    return new Promise((res) => {
      $('cdTitle').textContent = title; $('cdBody').textContent = body;
      const row = $('cdRow'); row.innerHTML = '';
      buttons.forEach((label, i) => { const b = document.createElement('button'); b.textContent = label; if (i === 0) b.className = 'primary'; b.onclick = () => { $('cloudDlg').hidden = true; res(i); }; row.appendChild(b); });
      $('cloudDlg').hidden = false; row.firstChild.focus();
    });
  }
  async function resolve(files, mf, remote) {
    const when = remote.savedAt ? new Date(remote.savedAt).toLocaleString() : 'earlier';
    const here = Story.data.scenes.length;
    const n = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
    const c = remote.counts || {};
    const choice = await ask('Two different copies',
      `The cloud copy (saved ${when}) has ${n(c.scenes || 0, 'scene')} and ${n(c.manuscripts || 0, 'manuscript')}.\nThis computer has ${n(here, 'scene')} with changes the cloud has not seen.\n\nWhichever you do not pick is downloaded to your Downloads folder as a backup first, so nothing is lost.`,
      ['Use the cloud copy', 'Keep this computer’s copy', 'Decide later']);
    if (choice === 2) return 'later';
    if (choice === 0) { download(JSON.stringify(await exportAll()), `istory-this-computer-before-cloud-${stamp()}.json`); return 'cloud'; }
    const pages = await readRemotePages(files, remote);
    download(JSON.stringify({ app: 'kotw-studio-backup', version: 1, savedAt: remote.savedAt, story: remote.story, meta: remote.meta, pages }), `istory-cloud-copy-before-overwrite-${stamp()}.json`);
    return 'local';
  }

  async function cycle(reason) {
    if (!leader || !signedIn() || !webOk() || Story.blocked) return;
    if (busy) { again = true; return; }
    busy = true; clearTimeout(timer); firstAt = 0;
    setMode('syncing');
    try {
      if (reason === 'start' && !st.dirty && st.sig && snapSig(await snapshot()) !== st.sig) { st.dirty = true; await saveSt(); }
      const files = await listFiles();
      const mf = files.get(MANIFEST);
      let remote = null;
      if (mf && stampOf(mf) !== st.base) {
        // the file looks different: only a real difference in content counts
        remote = await fetchManifest(mf);
        const rsig = sigOf(remote.story, remote.meta, remote.pages);
        if (st.sig && rsig === st.sig) { st.base = stampOf(mf); await saveSt(); remote = null; }          // same content as last time
        else {
          const snap = await snapshot();
          if (snapSig(snap) === rsig) { st.base = stampOf(mf); st.sig = rsig; st.dirty = false; st.pages = { ...remote.pages }; await saveSt(); remote = null; }   // both sides already match
        }
      }
      if (!mf) { await push(files, null); }
      else if (!remote) {
        if (st.dirty || reason === 'now') {
          const snap = await snapshot();
          if (reason !== 'now' && st.sig && snapSig(snap) === st.sig) { st.dirty = false; await saveSt(); }   // nothing real changed (a window just opened)
          else await push(files, mf, snap);
        }
      }
      else {
        // a computer that has never synced only counts real work; otherwise only content that differs from the last sync
        // counts (the writing room saving itself on opening is not a change)
        const hasLocal = st.base === null ? await localHasContent() : st.dirty && !(st.sig && snapSig(await snapshot()) === st.sig);
        if (!hasLocal) await pull(files, remote, mf);
        else {
          // "Decide later" stays decided until you click the cloud button: no repeat boxes on every edit
          if (deferred && reason !== 'now' && reason !== 'signin') { setMode('conflict'); return; }
          deferred = false;
          const pick = await resolve(files, mf, remote);
          if (pick === 'cloud') await pull(files, remote, mf);
          else if (pick === 'local') await push(files, mf);
          else { deferred = true; setMode('conflict'); return; }
        }
      }
      st.lastOk = Date.now(); await saveSt();
      setMode(st.dirty ? 'waiting' : 'idle', st.dirty ? undefined : 'Saved to your Google Drive ' + new Date().toLocaleTimeString());
    } catch (e) { fail(e); }
    finally { busy = false; if (again) { again = false; schedule(1000); } }
  }
  function fail(e) {
    if (e && e.code === 'race') { schedule(1500); setMode('syncing'); return; }
    if (e && e.name === 'NeedSignIn') {
      needGesture = true; setMode('reconnect');
      if (APP_MODE === 'ipad' && !hinted) { hinted = true; shellToast('Tap anywhere to sync with your Google Drive.', 6000); }
      return;
    }
    if (!navigator.onLine || e instanceof TypeError) { setMode('offline'); schedule(30000); return; }
    setMode('error', (e && e.message) || 'Google Drive problem');
    shellToast('Cloud sync problem: ' + ((e && e.message) || 'unknown'), 9000);
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => { firstAt = 0; cycle('change'); }, ms); }

  /* ----- what the buttons do ----- */
  async function signIn() {
    if (!webOk()) { alert('Cloud sync needs the studio opened from its web address (https://…). A file opened from your computer cannot sign in to Google.'); return; }
    if (!clientId()) {
      const v = prompt('Paste your Google Client ID (it ends in .apps.googleusercontent.com):', '');
      if (!v) return;
      if (!/\.apps\.googleusercontent\.com\s*$/.test(v.trim())) { alert('That does not look like a Client ID. It should end in .apps.googleusercontent.com'); return; }
      cfg.clientId = v.trim(); saveCfg();
    }
    try { await requestToken(''); } catch (e) {
      shellToast('Sign-in was cancelled or blocked. Allow pop-ups for this page and try again.', 7000);
      // a Client ID that was typed in (not built in) may be the wrong one: let it be replaced
      if (!(typeof CLOUD_CLIENT_ID === 'string' && CLOUD_CLIENT_ID) && cfg.clientId && confirm('Sign-in did not complete.\n\nOK = enter a different Google Client ID\nCancel = keep the current one and try again later')) { cfg.clientId = ''; tokenClient = null; saveCfg(); }
      return;
    }
    needGesture = false; cfg.signedIn = true; saveCfg();
    await cycle('signin');
  }
  async function signOut() {
    try { if (token && window.google && google.accounts) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; tokenExp = 0; cfg.signedIn = false; saveCfg(); try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    clearTimeout(timer); needGesture = false; setMode('signedout');
  }
  function menu() {
    const m = $('cloudMenu'), b = $('btnCloud');
    if (!m.hidden) { m.hidden = true; return; }
    if (window.placeMenu) window.placeMenu(m, b); else { const r = b.getBoundingClientRect(); m.style.top = (r.bottom + 6) + 'px'; m.style.right = Math.max(8, innerWidth - r.right) + 'px'; }
    m.hidden = false; m.firstChild.focus();
  }
  function click() {
    if (mode === 'other') { shellToast('Cloud sync is running in another studio window. Use that one, or close it and reload this one.', 6000); return; }
    if (!signedIn() || mode === 'reconnect') { signIn(); return; }
    if (mode === 'conflict') { cycle('now'); return; }
    menu();
  }
  function changed() {
    seq++;
    if (!st.dirty) { st.dirty = true; saveSt(); }
    if (!started || !leader || !signedIn()) return;
    if (!busy) setMode(needGesture ? 'reconnect' : 'waiting');
    if (!firstAt) firstAt = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => { firstAt = 0; cycle('change'); }, Math.min(4000, Math.max(0, 60000 - (Date.now() - firstAt))));
  }

  // any tap: close the cloud menu, and if Google needs a tap to reconnect, use this one
  function gesture(e) {
    const t = e && e.target && e.target.closest ? e.target : null;
    if (!$('cloudMenu').hidden && !(t && t.ownerDocument === document && t.closest('#cloudMenu,#btnCloud'))) $('cloudMenu').hidden = true;
    if (needGesture && mode === 'reconnect' && !pending && !(t && t.ownerDocument === document && t.closest('#cloudDlg,#btnCloud'))) {
      needGesture = false; setMode('syncing');
      requestToken('').then(() => cycle('signin')).catch(() => { needGesture = true; setMode('reconnect'); });
    }
  }
  async function start() {
    loadCfg();
    await loadSt();
    $('btnCloud').onclick = click;
    $('cloudMenu').onclick = (e) => {
      const a = e.target.closest('button'); if (!a) return; $('cloudMenu').hidden = true;
      if (a.dataset.do === 'now') cycle('now'); else if (a.dataset.do === 'back') putBack(); else if (a.dataset.do === 'out') signOut(); else if (a.dataset.do === 'id') { cfg.clientId = ''; saveCfg(); tokenClient = null; signOut(); }
    };
    document.addEventListener('pointerdown', gesture, true);
    try { Story.subscribe((src, info) => {
      if (src === 'cloud') return;
      if (info && Object.keys(info).length && Object.keys(info).every(k => k === 'view')) return;
      changed();
    }); } catch (e) {}
    try { const w = new BroadcastChannel('underwood-quiet-v1'); w.onmessage = (e) => { if (e.data && e.data.owner) changed(); }; } catch (e) {}
    try { bc = new BroadcastChannel('kotw_cloud'); bc.onmessage = (e) => { if (e.data && e.data.reload) location.reload(); }; } catch (e) {}
    window.addEventListener('online', () => { if (signedIn()) cycle('now'); });
    // the iPad app is often resumed rather than reopened: sync then too
    window.addEventListener('pageshow', (e) => { if (e.persisted && signedIn() && !needGesture) cycle('focus'); });
    // keep "Synced · 5 min ago" current
    setInterval(() => { if (mode === 'idle') setMode('idle'); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && signedIn() && !needGesture) cycle('focus'); });
    setInterval(() => { if (document.visibilityState === 'visible' && signedIn() && !needGesture && !busy) cycle('poll'); }, 60000);
    // on opening: get the newest copy from Drive right away (and have Google's sign-in code ready for a tap)
    const begin = () => { started = true; if (!signedIn()) { setMode('signedout'); return; } setMode(st.dirty ? 'waiting' : 'idle'); loadGis().catch(() => {}); cycle('start'); };
    if (navigator.locks) {
      navigator.locks.request('kotw_cloud_sync', { ifAvailable: true }, (lock) => {
        if (!lock) { leader = false; started = true; setMode('other'); return; }
        begin();
        return new Promise(() => {});
      });
    } else begin();
  }
  /* ----- the list of Drive files Publish has made, kept in the same private cloud folder so every computer shares it ----- */
  const PUBMAP = 'studio-publish-map.json';
  async function readMap() {
    const f = (await listFiles()).get(PUBMAP);
    if (!f) return null;
    try { return JSON.parse(await gunzip(await getFile(f))); } catch (e) { return null; }
  }
  async function writeMap(obj) {
    const files = await listFiles();
    await putFile(PUBMAP, await gz(JSON.stringify(obj)), files.get(PUBMAP));
  }
  // a memo recorded on another device: download it the first time it is played
  async function fetchMemo(id) {
    if (!signedIn()) throw new Error('Sign in with the ☁ button to get memos from your other devices.');
    const f = (await listFiles()).get(memoName(id));
    if (!f) throw new Error('That memo is not in the cloud yet. Open the device that recorded it so it can sync.');
    const blob = await getFile(f);
    await MediaStore.put(id, blob);
    return blob;
  }
  return { start, changed, gesture, signIn, signOut, cycle, ask, readMap, writeMap, fetchMemo, fileApi, gis: loadGis, clientId, signedIn, get leader() { return leader; }, get mode() { return mode; }, get state() { return st; } };
})();

function shareFile(blob, name) {
  if (APP_MODE !== 'ipad' || !navigator.share || !navigator.canShare) return false;
  let file; try { file = new File([blob], name, { type: blob.type || 'application/octet-stream' }); } catch (e) { return false; }
  if (!navigator.canShare({ files: [file] })) return false;
  navigator.share({ files: [file], title: name }).catch((e) => { if (e && e.name !== 'AbortError') plainDownload(blob, name); });
  return true;
}
window.shareFile = shareFile;
function download(content, name, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  if (shareFile(blob, name)) return;
  plainDownload(blob, name);
}
function plainDownload(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
let toastTimer = null;
function shellToast(msg, ms = 4500) {
  const t = $('shellToast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.display = 'none'; }, ms);
}

