/* =====================================================================
   Cast: the characters (kept on this iPad, copied to Google Drive), portraits,
   and a read-only look at iStory's story on the same iPad.
   Shaped so it can move into iStory later as its own part of the data.
   ===================================================================== */
(function (root) {
'use strict';
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const str = (v) => typeof v === 'string' ? v : v == null ? '' : String(v);
const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

const ROLES = ['Protagonist', 'Antagonist', 'Ally', 'Mentor', 'Family', 'Supporting', 'Minor'];
const SECTIONS = [['want', 'Want'], ['need', 'Need'], ['wound', 'Wound'], ['lie', 'Lie they believe']];
const LOOKS = [['height', 'Height'], ['build', 'Build'], ['hair', 'Hair'], ['eyes', 'Eyes'], ['skin', 'Skin'], ['face', 'Face'],
  ['marks', 'Scars and marks'], ['clothing', 'Clothing'], ['carries', 'Carries'], ['voice', 'Voice'], ['speech', 'Way of speaking'], ['moves', 'Mannerisms']];

function blank() { return { app: 'cast', v: 1, rev: 0, chars: [], rels: [], trash: [] }; }
function normChar(c) {
  const looks = {}; for (const [k] of LOOKS) looks[k] = str(c.looks && c.looks[k]);
  return { id: str(c.id) || uid('c-'), name: str(c.name), aka: str(c.aka), role: ROLES.includes(c.role) ? c.role : '', age: str(c.age), people: str(c.people), line: str(c.line),
    want: str(c.want), need: str(c.need), wound: str(c.wound), lie: str(c.lie), arcFrom: str(c.arcFrom), arcTo: str(c.arcTo), look: str(c.look), looks, notes: str(c.notes),
    portrait: c.portrait && c.portrait.id ? { id: str(c.portrait.id), at: +c.portrait.at || 0 } : null, created: +c.created || Date.now(), updated: +c.updated || Date.now() };
}
function normalize(d) {
  const o = blank();
  if (!d || typeof d !== 'object') return o;
  o.rev = +d.rev || 0;
  o.chars = (Array.isArray(d.chars) ? d.chars : []).map(normChar);
  const ids = new Set(o.chars.map(c => c.id));
  o.rels = (Array.isArray(d.rels) ? d.rels : []).filter(r => ids.has(r.a) && ids.has(r.b) && r.a !== r.b).map(r => ({ id: str(r.id) || uid('r-'), a: r.a, b: r.b, ab: str(r.ab), ba: str(r.ba) }));
  o.trash = (Array.isArray(d.trash) ? d.trash : []).filter(t => t && t.char).slice(0, 40).map(t => ({ at: +t.at || Date.now(), char: normChar(t.char), rels: Array.isArray(t.rels) ? t.rels : [] }));
  return o;
}

/* ---------- this iPad's copy ---------- */
let db = null, saveT = 0;
const listeners = new Set();
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('cast', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); if (!d.objectStoreNames.contains('img')) d.createObjectStore('img'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('storage is unavailable'));
    r.onblocked = () => rej(new Error('Cast is open somewhere else; close it there'));
  });
}
const kv = {
  get: (k) => rq(db.transaction('kv').objectStore('kv').get(k)),
  put: (k, v) => new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('not saved')); })
};
const D = {
  ROLES, SECTIONS, LOOKS, uid, data: blank(), kv,
  onError: null,
  async init() {
    db = await open();
    try { await navigator.storage.persist(); } catch (e) {}
    D.data = normalize(await kv.get('data'));
  },
  subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
  changed(info = {}, src = 'app') {
    D.data.rev++;
    clearTimeout(saveT); saveT = setTimeout(D.flush, 300);
    for (const f of listeners) try { f(info, src); } catch (e) { console.error(e); }
  },
  async flush() {
    clearTimeout(saveT);
    try { await kv.put('data', D.data); } catch (e) { D.onError && D.onError('Couldn’t save on this iPad: ' + e.message); }
  },
  async replace(d, src) { D.data = normalize(d); await D.flush(); for (const f of listeners) try { f({ all: true }, src); } catch (e) {} },
  exportJSON() { return JSON.stringify(D.data); },
  normalize,

  char: (id) => D.data.chars.find(c => c.id === id),
  addChar(f = {}) { const c = normChar({ ...f, id: uid('c-') }); D.data.chars.push(c); D.changed({ char: c.id }); return c; },
  touch(c, info = {}) { c.updated = Date.now(); D.changed({ char: c.id, ...info }); },
  deleteChar(id) {
    const c = D.char(id); if (!c) return;
    const rels = D.data.rels.filter(r => r.a === id || r.b === id);
    D.data.trash.unshift({ at: Date.now(), char: JSON.parse(JSON.stringify(c)), rels });
    D.data.trash = D.data.trash.slice(0, 40);
    D.data.chars = D.data.chars.filter(x => x !== c);
    D.data.rels = D.data.rels.filter(r => !rels.includes(r));
    D.changed({ structure: true });
  },
  restoreChar(i) {
    const t = D.data.trash[i]; if (!t) return null;
    D.data.trash.splice(i, 1);
    const c = normChar(t.char); D.data.chars.push(c);
    const ids = new Set(D.data.chars.map(x => x.id));
    for (const r of t.rels) if (ids.has(r.a) && ids.has(r.b)) D.data.rels.push(r);
    D.changed({ structure: true }); return c;
  },
  relsOf(id) { return D.data.rels.filter(r => r.a === id || r.b === id).map(r => r.a === id ? { r, other: r.b, label: r.ab, back: r.ba, side: 'ab' } : { r, other: r.a, label: r.ba || r.ab, back: r.ab, side: 'ba' }); },
  addRel(a, b, label) { const r = { id: uid('r-'), a, b, ab: str(label), ba: '' }; D.data.rels.push(r); D.changed({ rels: true }); return r; },
  deleteRel(id) { D.data.rels = D.data.rels.filter(r => r.id !== id); D.changed({ rels: true }); },
  names(c) { return [c.name, ...c.aka.split(',')].map(s => s.trim()).filter(s => s.length > 1); },

  /* ---------- portraits ---------- */
  img: {
    urls: new Map(),
    async put(id, blob) { await new Promise((res, rej) => { const t = db.transaction('img', 'readwrite'); t.objectStore('img').put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async get(id) { try { return await rq(db.transaction('img').objectStore('img').get(id)); } catch (e) { return null; } },
    async has(id) { try { return (await rq(db.transaction('img').objectStore('img').count(id))) > 0; } catch (e) { return false; } },
    async url(id) {
      if (!id) return '';
      if (D.img.urls.has(id)) return D.img.urls.get(id);
      const b = await D.img.get(id); if (!b) return '';
      const u = URL.createObjectURL(b); D.img.urls.set(id, u); return u;
    }
  },

  /* ---------- iStory's story on this iPad (read only) ---------- */
  async readStory() {
    const sdb = await new Promise((res) => {
      let r; try { r = indexedDB.open('istory2'); } catch (e) { res(null); return; }
      r.onupgradeneeded = () => { r.transaction.abort(); };   // iStory isn't on this iPad: don't create its storage
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    });
    if (!sdb) return null;
    try { return sdb.objectStoreNames.contains('kv') ? await rq(sdb.transaction('kv').objectStore('kv').get('data')) : null; }
    catch (e) { return null; } finally { sdb.close(); }
  }
};

/* ---------- where each character turns up in the story ---------- */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function nameRx(names) { return names.length ? new RegExp('(^|[^\\p{L}])(' + names.map(esc).join('|') + ')(?![\\p{L}])', 'iu') : null; }
D.appearances = function (story, c) {
  const out = { scenes: [], lines: [], acts: [], books: new Set() };
  if (!story || !Array.isArray(story.scenes)) return out;
  const names = D.names(c), rx = nameRx(names); if (!rx) return out;
  const isName = (s) => { const t = str(s).trim().toLowerCase(); return !!t && names.some(n => n.toLowerCase() === t || t.split(/\s*[,&/]\s*|\s+and\s+/).includes(n.toLowerCase())); };
  const ms = story.ms || {};
  const books = story.books || [], parts = story.parts || [], acts = story.acts || [], seqs = story.seqs || [];
  for (const b of books) {
    let n = 0;   // scenes are numbered within each book, as in iStory
    for (const p of parts.filter(x => x.bookId === b.id)) for (const a of acts.filter(x => x.partId === p.id)) {
      const act = { book: b, act: a, no: 0, scenes: 0, pov: 0 }; out.acts.push(act);
      for (const q of seqs.filter(x => x.actId === a.id)) for (const s of story.scenes.filter(x => x.seqId === q.id)) {
        n++;
        const pov = isName(s.pov);
        const beats = s.beats || [];
        const said = [];
        for (const bt of beats) for (const d of bt.dialogue || []) if (isName(d.speaker) && str(d.line).trim()) said.push(d.line.trim());
        const hay = [s.title, s.summary, s.location, ...beats.map(x => x.text + ' ' + x.notes), (ms[s.id] && ms[s.id].text) || ''].join('\n');
        if (!pov && !said.length && !rx.test(hay)) continue;
        out.scenes.push({ id: s.id, no: n, title: str(s.title), seq: str(q.name), act: a, book: b, pov });
        for (const l of said) out.lines.push({ line: l, no: n, title: str(s.title) });
        act.scenes++; if (pov) act.pov++; out.books.add(b.id);
      }
    }
  }
  // number acts within each book
  const seen = new Map(); for (const x of out.acts) { const k = x.book.id; seen.set(k, (seen.get(k) || 0) + 1); x.no = seen.get(k); }
  return out;
};
root.Cast = D;
})(window);
