/* =====================================================================
   iStory and Google: sign-in, iStory's own copy in Drive (a hidden app folder), earlier copies,
   voice memos, and one live Google Doc per sequence that syncs both ways.
   ===================================================================== */
(function (root) {
'use strict';
const Store = root.Store;
const CLIENT_ID = '746584309009-0ifbot96l5pdrmdifm6oid3670l109pr.apps.googleusercontent.com';   // the Story Studio Google project
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';
const GDOC = 'application/vnd.google-apps.document', GFOLDER = 'application/vnd.google-apps.folder';
const DATA = 'istory-data.json', STUDIO = 'studio-manifest.json';
const TOK = 'istory2_tok', CFG = 'istory2_google';
const DEVICE = (() => { try { let d = localStorage.getItem('istory2_device'); if (!d) { d = Store.uid('dev-'); localStorage.setItem('istory2_device', d); } return d; } catch (e) { return 'dev'; } })();
const jsonHead = { 'Content-Type': 'application/json; charset=UTF-8' };
const fail = (msg, extra) => Object.assign(new Error(msg), extra || {});
const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG) || '{}'); } catch (e) { return {}; } };
const setCfg = (p) => { try { localStorage.setItem(CFG, JSON.stringify({ ...cfg(), ...p })); } catch (e) {} };

/* ---------- status (shown as a small dot; words only when something is wrong) ---------- */
const listeners = new Set();
let state = { mode: cfg().signedIn ? 'idle' : 'signedout', msg: '', lastOk: 0 };
function setState(mode, msg) { state = { ...state, mode, msg: msg || '' }; if (mode === 'idle') state.lastOk = Date.now(); for (const f of listeners) try { f(state); } catch (e) {} }

/* ---------- sign-in ---------- */
let token = null, tokenExp = 0, client = null, pending = null, gisP = null, needTap = false;
try { const t = JSON.parse(localStorage.getItem(TOK) || 'null'); if (t && t.exp > Date.now() + 60000 && t.scope === SCOPES) { token = t.t; tokenExp = t.exp; } } catch (e) {}
const tokenOk = () => token && Date.now() < tokenExp - 60000;
function gis() {
  if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
  if (!gisP) gisP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => { gisP = null; rej(fail('Google sign-in could not load. Check the connection.', { offline: true })); };
    document.head.append(s);
  });
  return gisP;
}
async function getToken(interactive) {
  if (tokenOk()) return token;
  if (!interactive) { needTap = true; throw fail('sign in again', { needTap: true }); }
  await gis();
  return new Promise((res, rej) => {
    if (!client) client = root.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPES,
      callback: (r) => {
        const p = pending; pending = null; if (!p) return;
        if (!r || r.error) { p.rej(fail(r && r.error ? 'Google said: ' + r.error : 'Sign-in was cancelled')); return; }
        token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; needTap = false;
        try { localStorage.setItem(TOK, JSON.stringify({ t: token, exp: tokenExp, scope: SCOPES })); } catch (e) {}
        setCfg({ signedIn: true });
        p.res(token);
      },
      error_callback: (e) => { const p = pending; pending = null; p && p.rej(fail(e && e.type === 'popup_closed' ? 'Sign-in was closed' : 'Sign-in didn’t finish')); }
    });
    pending = { res, rej };
    client.requestAccessToken({ prompt: cfg().signedIn ? '' : 'consent' });
  });
}
async function api(url, opts = {}) {
  const t = await getToken(false);
  let r;
  try { r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } }); }
  catch (e) { throw fail('offline', { offline: true }); }
  if (r.status === 401) { token = null; tokenExp = 0; try { localStorage.removeItem(TOK); } catch (e) {} needTap = true; throw fail('sign in again', { needTap: true }); }
  if (!r.ok) { let b = ''; try { b = await r.text(); } catch (e) {} throw fail('Google Drive said ' + r.status + (b ? ': ' + b.slice(0, 200) : ''), { status: r.status }); }
  return r;
}
const G = {
  get state() { return state; },
  get signedIn() { return !!cfg().signedIn; },
  onState(f) { listeners.add(f); f(state); return () => listeners.delete(f); },
  async signIn() {
    try { setState('syncing'); await getToken(true); setState('idle'); Sync.soon(0); Docs.soon(1500); }
    catch (e) { setState(cfg().signedIn ? 'reconnect' : 'signedout', e.message); throw e; }
  },
  signOut() {
    try { if (token && root.google && root.google.accounts) root.google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; tokenExp = 0; try { localStorage.removeItem(TOK); } catch (e) {}
    setCfg({ signedIn: false }); setState('signedout');
  },
  // any tap: if Google needs the person to reconnect, a tap is the moment it's allowed to ask
  gesture() {
    if (!needTap || !cfg().signedIn || pending) return;
    getToken(true).then(() => { setState('idle'); Sync.soon(0); Docs.soon(500); }).catch(() => {});
  },
  api, device: DEVICE
};

/* ---------- small Drive helpers ---------- */
async function listAppData(names) {
  const out = new Map(); let pt = '';
  do {
    const q = encodeURIComponent(names.map(n => `name='${n}'`).join(' or '));
    const j = await (await api(`${API}/files?spaces=appDataFolder&q=${q}&pageSize=200&fields=${encodeURIComponent('nextPageToken,files(id,name,md5Checksum,modifiedTime,appProperties)')}` + (pt ? '&pageToken=' + pt : ''))).json();
    for (const f of j.files || []) { const had = out.get(f.name); if (!had || had.modifiedTime < f.modifiedTime) out.set(f.name, f); }
    pt = j.nextPageToken;
  } while (pt);
  return out;
}
async function gz(text) {
  if (!root.CompressionStream) return new Blob([text], { type: 'application/json' });
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
async function gunzip(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return blob.text();
}
function multipart(meta, blob, type) {
  const b = 'istory' + Math.random().toString(36).slice(2);
  return { ct: `multipart/related; boundary=${b}`, body: new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${type}\r\n\r\n`, blob, `\r\n--${b}--`]) };
}
async function putAppFile(name, blob, existing, props) {
  const meta = existing ? { appProperties: props || {} } : { name, parents: ['appDataFolder'], appProperties: props || {} };
  const m = multipart(meta, blob, 'application/octet-stream');
  const url = existing ? `${UP}/files/${existing.id}?uploadType=multipart&fields=id,name,md5Checksum,modifiedTime,appProperties` : `${UP}/files?uploadType=multipart&fields=id,name,md5Checksum,modifiedTime,appProperties`;
  return (await api(url, { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': m.ct }, body: m.body })).json();
}
const getFile = async (f) => (await api(`${API}/files/${f.id}?alt=media`)).blob();
const hash = (s) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); };
G.hash = hash;
// one sync at a time across open copies of iStory
async function exclusive(name, fn) {
  if (navigator.locks && navigator.locks.request) return navigator.locks.request(name, { ifAvailable: true }, (lock) => lock ? fn() : null);
  return fn();
}

/* ---------- earlier copies on this iPad (taken before anything from outside replaces your work) ---------- */
const Copies = {
  async keep(reason) {
    try {
      const list = (await Store.kv.get('copies')) || [];
      list.unshift({ at: Date.now(), reason, scenes: Store.data.scenes.length, words: Object.values(Store.data.ms).reduce((n, m) => n + Store.words(m.text), 0), data: JSON.parse(Store.exportJSON()) });
      await Store.kv.put('copies', list.slice(0, 6));
    } catch (e) {}
  },
  async list() { try { return (await Store.kv.get('copies')) || []; } catch (e) { return []; } },
  async putBack(i) {
    const list = await Copies.list(); const c = list[i]; if (!c) return false;
    await Copies.keep('before putting back an earlier copy');
    await Store.replace(c.data, 'restore');
    Sync.markDirty(); return true;
  }
};
G.Copies = Copies;

/* =====================================================================
   iStory's copy in Drive: one file in the hidden app folder. A device sends its copy when it has changes;
   when another device has sent a newer one, this one takes it (keeping an earlier copy first).
   ===================================================================== */
const Sync = (() => {
  let st = { base: null, dirty: false, fileId: null }, timer = 0, busy = false, again = false, loaded = false, asking = false;
  async function load() { if (loaded) return; loaded = true; try { st = { ...st, ...((await Store.kv.get('sync')) || {}) }; } catch (e) {} }
  const save = () => Store.kv.put('sync', st).catch(() => {});
  function soon(ms = 6000) { clearTimeout(timer); timer = setTimeout(() => cycle('soon'), ms); }
  function markDirty() { st.dirty = true; save(); if (cfg().signedIn) { setState('waiting'); soon(); } }
  const hasContent = () => Store.data.scenes.length > 0 || Store.data.loose.length > 0 || Object.values(Store.data.ms).some(m => m.text.trim());
  async function upload(existing) {
    const now = (await listAppData([DATA])).get(DATA);
    if ((now ? now.md5Checksum : null) !== (existing ? existing.md5Checksum : null)) throw fail('changed elsewhere', { race: true });
    const out = await putAppFile(DATA, await gz(Store.exportJSON()), existing, { device: DEVICE, rev: String(Store.data.rev) });
    st.base = out.md5Checksum; st.fileId = out.id; st.dirty = false; await save();
  }
  async function take(remote, reason) {
    const d = JSON.parse(await gunzip(await getFile(remote)));
    if (hasContent()) await Copies.keep(reason);
    await Store.replace(d, 'cloud');
    st.base = remote.md5Checksum; st.fileId = remote.id; st.dirty = false; await save();
  }
  async function cycle(why) {
    if (!cfg().signedIn) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      await load();
      await exclusive('istory2-sync', async () => {
        setState('syncing');
        const files = await listAppData([DATA, STUDIO]);
        const remote = files.get(DATA);
        if (!remote) {
          // a first sign-in with nothing of iStory's in Drive yet: offer the Story Studio copy if this iPad has nothing
          if (!hasContent() && files.get(STUDIO) && !asking) {
            asking = true;
            const pick = await G.ask('Bring in Story Studio?', 'Your Story Studio story is in your Google Drive. iStory can start from a copy of it. Story Studio itself is left as it is.', ['Bring it in', 'Start empty']);
            asking = false;
            if (pick === 0) await importStudio(files.get(STUDIO));
          }
          await upload(null);
        } else if (remote.md5Checksum === st.base) {
          if (st.dirty) await upload(remote);
        } else if (!st.base) {
          // this iPad has never synced: if it has its own work, ask which copy to keep
          if (hasContent() && !asking) {
            asking = true;
            const pick = await G.ask('Two copies of your story', 'This iPad has work on it, and your Google Drive has an iStory copy from another device.', ['Use the Drive copy', 'Use this iPad’s', 'Decide later']);
            asking = false;
            if (pick === 0) await take(remote, 'before using the Drive copy');
            else if (pick === 1) await upload(remote);
            else { setState('conflict', 'Choose which copy to keep'); return; }
          } else await take(remote, 'before the first sync');
        } else if (!st.dirty) await take(remote, 'before a newer copy came from another device');
        else if (!asking) {
          asking = true;
          const pick = await G.ask('Changed in two places', 'Your story changed on this iPad and on another device since they last matched. The copy you don’t keep is saved under Earlier copies.', ['Keep this iPad’s', 'Keep the other device’s', 'Decide later']);
          asking = false;
          if (pick === 0) { await Copies.keepRemote(remote); await upload(remote); }
          else if (pick === 1) await take(remote, 'before taking the other device’s copy');
          else { setState('conflict', 'Choose which copy to keep'); return; }
        }
        await Memos.sync();
        setState('idle');
      });
    } catch (e) {
      if (e.race) { again = true; }
      else if (e.needTap) setState('reconnect', 'Tap anywhere to reconnect to Google');
      else if (e.offline || !navigator.onLine) setState('offline', 'Offline. Your work is safe on this iPad.');
      else setState('error', e.message);
    } finally {
      busy = false;
      if (again) { again = false; soon(1500); }
      else if (st.dirty && state.mode === 'idle') soon(4000);
    }
  }
  return { soon, cycle, markDirty, get dirty() { return st.dirty; } };
})();
Copies.keepRemote = async (remote) => {
  try { const d = JSON.parse(await gunzip(await getFile(remote))); const list = (await Store.kv.get('copies')) || []; list.unshift({ at: Date.now(), reason: 'the other device’s copy', scenes: (d.scenes || []).length, words: Object.values(d.ms || {}).reduce((n, m) => n + Store.words(m.text), 0), data: d }); await Store.kv.put('copies', list.slice(0, 6)); } catch (e) {}
};
G.Sync = Sync;

/* ---------- Story Studio's Drive copy → iStory (read only) ---------- */
async function importStudio(manifestFile) {
  const m = JSON.parse(await gunzip(await getFile(manifestFile)));
  if (!m || m.app !== 'kotw-cloud' || !m.story) throw fail('The Story Studio copy in Drive could not be read.');
  const names = Object.entries(m.pages || {}).map(([id, h]) => 'p_' + id + '_' + h + '.gz');
  const files = new Map(); let pt = '';
  do {
    const j = await (await api(`${API}/files?spaces=appDataFolder&pageSize=1000&fields=${encodeURIComponent('nextPageToken,files(id,name)')}` + (pt ? '&pageToken=' + pt : ''))).json();
    for (const f of j.files || []) files.set(f.name, f);
    pt = j.nextPageToken;
  } while (pt);
  const pages = {}, ids = Object.keys(m.pages || {});
  for (let i = 0; i < ids.length; i += 4) {
    await Promise.all(ids.slice(i, i + 4).map(async (id) => { const f = files.get('p_' + id + '_' + m.pages[id] + '.gz'); if (f) pages[id] = JSON.parse(await gunzip(await getFile(f))); }));
  }
  void names;
  const data = Store.fromStudio(m.story, m.meta, pages);
  await Store.replace(data, 'import');
}
G.importStudio = async () => { const f = (await listAppData([STUDIO])).get(STUDIO); if (!f) throw fail('There is no Story Studio copy in this Google Drive.'); await importStudio(f); Sync.markDirty(); };

/* ---------- voice memos: kept on this iPad, and in Drive for other devices ---------- */
const Memos = {
  async put(id, blob) { await Store.kv.put(id, blob, 'memos'); },
  async get(item) {
    const m = item && item.memo; if (!m) return null;
    let b = await Store.kv.get(m.id, 'memos').catch(() => null);
    if (!b && m.driveId && cfg().signedIn) { try { b = await getFile({ id: m.driveId }); await Store.kv.put(m.id, b, 'memos'); } catch (e) {} }
    return b;
  },
  async sync() {
    for (const l of Store.data.loose) {
      if (!l.memo || l.memo.driveId) continue;
      const b = await Store.kv.get(l.memo.id, 'memos').catch(() => null); if (!b) continue;
      const out = await putAppFile('istory-memo-' + l.memo.id, b, null, {});
      l.memo.driveId = out.id; Store.changed({ loose: true, quiet: true }, 'cloud-memo');
    }
  }
};
G.Memos = Memos;

/* =====================================================================
   One live Google Doc per sequence.
   The Doc reads top to bottom: the sequence's name and idea, then each scene (a Heading 2 "Scene 3 · Title"),
   its details, its beats (BUT / THEREFORE / AND THEN lines), and its manuscript.
   Both sides are compared scene by scene against how they looked when they last matched, so a change on
   one side flows to the other; only a scene changed on both sides needs you to choose.
   ===================================================================== */
const LINK_WORD = { but: 'BUT', therefore: 'THEREFORE', and: 'AND THEN', '': '•' };
const DETAIL = [['pov', 'POV'], ['location', 'Location'], ['date', 'Date'], ['status', 'Status'], ['stage', 'Stage'], ['summary', 'Summary']];
const norm = (t) => String(t || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// what a scene looks like for the Doc (and for comparing)
function sceneView(s) {
  return {
    title: norm(s.title), pov: norm(s.pov), location: norm(s.location), date: norm(s.date),
    status: (Store.STATUSES.find(x => x[0] === s.status) || Store.STATUSES[0])[1], stage: Store.stageLabel(s.stage), summary: norm(String(s.summary || '').replace(/\n+/g, ' ')),
    beats: s.beats.map((b, i) => ({ text: norm(b.text), link: i === 0 ? '' : (b.link || 'and'), done: !!b.done, notes: norm(String(b.notes || '').replace(/\n+/g, ' ')), dialogue: b.dialogue.filter(d => norm(d.line) || norm(d.speaker)).map(d => [norm(d.speaker), norm(d.line)]) })),
    text: String(Store.text(s.id) || '').split('\n').map(norm).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  };
}
const sigOf = (v) => hash(JSON.stringify(v));
function appView(q) {
  const scenes = Store.scenesOf(q.id);
  return { head: { name: norm(q.name), idea: norm(q.idea), order: scenes.map(s => s.id) }, scenes: Object.fromEntries(scenes.map(s => [s.id, sceneView(s)])) };
}
const headSig = (h) => sigOf({ name: h.name, idea: h.idea, order: h.order });
function docName(q) { const n = Store.numbers(Store.where(q.id).book.id).seq.get(q.id); return `Sequence ${n} · ${q.name || 'Untitled'}`; }

function buildHtml(q) {
  const v = appView(q), N = Store.numbers(Store.where(q.id).book.id).scene;
  const P = (t, style) => `<p${style ? ` style="${style}"` : ''}>${esc(t)}</p>`;
  let h = `<html><head><meta charset="utf-8"></head><body style="font-family:Georgia,serif">`;
  h += `<h1>${esc(q.name || 'Untitled sequence')}</h1>` + (v.head.idea ? P(v.head.idea, 'font-style:italic;color:#555555') : '');
  for (const id of v.head.order) {
    const s = v.scenes[id], n = N.get(id);
    h += `<h2>${esc(`Scene ${n || ''} · ${s.title || 'Untitled'}`)}</h2>`;
    for (const [k, label] of DETAIL) h += `<p style="color:#555555;font-size:10pt"><b>${label}:</b> ${esc(s[k])}</p>`;
    h += `<h3>Beats</h3>`;
    s.beats.forEach((b) => {
      h += `<p>${b.done ? '✓ ' : ''}<b>${LINK_WORD[b.link]}</b> ${esc(b.text)}</p>`;
      if (b.notes) h += `<p style="color:#555555;margin-left:24pt"><i>Note:</i> ${esc(b.notes)}</p>`;
      for (const [sp, ln] of b.dialogue) h += `<p style="color:#555555;margin-left:24pt"><i>Dialogue:</i> ${esc(sp)} — ${esc(ln)}</p>`;
    });
    h += `<h3>Manuscript</h3>`;
    for (const para of (s.text ? s.text.split('\n') : [])) h += para ? `<p style="line-height:1.5">${esc(para)}</p>` : '<p></p>';
  }
  return h + '</body></html>';
}

// the exported Doc → { head: { name, idea, titles }, scenes: [ { heading, title, fields… } ] }
function parseHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = [];
  const textOf = (el) => { const c = el.cloneNode(true); c.querySelectorAll('br').forEach(b => b.replaceWith('\n')); return c.textContent.replace(/ /g, ' '); };
  (function walk(parent) {
    for (const el of parent.children) {
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) blocks.push({ h: +tag[1], t: norm(textOf(el)) });
      else if (tag === 'p') { for (const line of textOf(el).split('\n')) blocks.push({ h: 0, t: line.replace(/[ \t]+/g, ' ').trim() }); }
      else if (tag === 'ul' || tag === 'ol') for (const li of el.querySelectorAll('li')) blocks.push({ h: 0, t: norm(textOf(li)) });
      else if (tag === 'table') for (const p of el.querySelectorAll('p')) blocks.push({ h: 0, t: norm(textOf(p)) });
      else if (tag === 'div') walk(el);
    }
  })(doc.body);
  const out = { name: '', idea: '', scenes: [] };
  let cur = null, sec = null, ideaLines = [];
  const finishLine = () => {};
  void finishLine;
  for (const b of blocks) {
    if (b.h === 1 && !cur && !out.name) { out.name = b.t; continue; }
    if (b.h === 1 || b.h === 2) {
      cur = { heading: b.t, title: b.t.replace(/^\s*scene\s*\d*\s*[·•:.\-–—|]?\s*/i, '').trim(), pov: '', location: '', date: '', status: '', stage: '', summary: '', beats: [], lines: [] };
      if (/^\s*scene\s*\d*\s*$/i.test(b.t) || /^untitled$/i.test(cur.title)) cur.title = '';
      out.scenes.push(cur); sec = 'details'; continue;
    }
    if (b.h >= 3) { if (cur) sec = /beat/i.test(b.t) ? 'beats' : /manuscript|pages|writing/i.test(b.t) ? 'text' : 'other'; continue; }
    const t = b.t;
    if (!cur) { if (t) ideaLines.push(t); continue; }
    if (sec === 'details') {
      if (!t) continue;
      const m = t.match(/^(POV|Location|Date|Status|Stage|Summary)\s*:\s*(.*)$/i);
      if (m) { const k = m[1].toLowerCase(); cur[k === 'pov' ? 'pov' : k] = norm(m[2]); }
      else cur.summary = norm(cur.summary ? cur.summary + ' ' + t : t);
    } else if (sec === 'beats') {
      if (!t) continue;
      let m;
      if ((m = t.match(/^note\s*:\s*(.*)$/i)) && cur.beats.length) { const b0 = cur.beats[cur.beats.length - 1]; b0.notes = norm(b0.notes ? b0.notes + ' ' + m[1] : m[1]); continue; }
      if ((m = t.match(/^dialogue\s*:\s*(.*)$/i)) && cur.beats.length) { const d = m[1].split(/\s+[—–]\s+|\s+-\s+/); const sp = d.length > 1 ? d.shift() : ''; cur.beats[cur.beats.length - 1].dialogue.push([norm(sp), norm(d.join(' — '))]); continue; }
      m = t.match(/^(✓|✔|☑)?\s*(BUT|THEREFORE|AND\s+THEN|•|-|\*)?\s*[:—–-]?\s*(.*)$/i);
      const w = (m[2] || '').toUpperCase().replace(/\s+/g, ' ');
      cur.beats.push({ text: norm(m[3]), link: w === 'BUT' ? 'but' : w === 'THEREFORE' ? 'therefore' : (w === 'AND THEN' || !w) ? 'and' : '', done: !!m[1], notes: '', dialogue: [] });
    } else if (sec === 'text') cur.lines.push(t);
  }
  if (/^untitled sequence$/i.test(out.name)) out.name = '';
  out.idea = norm(ideaLines.join(' '));
  for (const s of out.scenes) {
    if (s.beats[0]) s.beats[0].link = '';
    while (s.lines.length && !s.lines[0]) s.lines.shift();
    while (s.lines.length && !s.lines[s.lines.length - 1]) s.lines.pop();
    s.text = s.lines.join('\n').replace(/\n{3,}/g, '\n\n'); delete s.lines;
    s.status = s.status || 'Open'; s.stage = s.stage || 'Rough';
  }
  return out;
}
// a parsed Doc scene, shaped like sceneView for comparing
function docSceneView(d) {
  const st = Store.STATUSES.find(x => x[1].toLowerCase() === d.status.toLowerCase()) || Store.STATUSES[0];
  const sg = Store.STAGES.find(x => x[1].toLowerCase() === d.stage.toLowerCase() || x[0] === d.stage.toLowerCase()) || Store.STAGES[0];
  return { title: d.title, pov: d.pov, location: d.location, date: d.date, status: st[1], stage: sg[1], summary: d.summary,
    beats: d.beats.map((b, i) => ({ text: b.text, link: i === 0 ? '' : (b.link || 'and'), done: b.done, notes: b.notes, dialogue: b.dialogue })), text: d.text };
}
// which app scene each Doc heading is: same title as last time first, then by position among the rest
function matchScenes(parsed, rec) {
  const ids = (rec.order || []).slice(), titles = rec.titles || {};
  const used = new Set(), out = parsed.scenes.map(() => null);
  const byTitle = (t) => ids.find(id => !used.has(id) && ((titles[id] || '').toLowerCase() === t || (Store.scene(id) && norm(Store.scene(id).title).toLowerCase() === t)));
  parsed.scenes.forEach((d, i) => { const id = d.title ? byTitle(d.title.toLowerCase()) : null; if (id) { out[i] = id; used.add(id); } });
  const rest = ids.filter(id => !used.has(id));
  parsed.scenes.forEach((d, i) => { if (!out[i] && rest.length) { const id = rest.shift(); out[i] = id; used.add(id); } });
  return out;
}
const docHeadSig = (parsed) => sigOf({ name: norm(parsed.name), idea: parsed.idea, titles: parsed.scenes.map(d => d.title.toLowerCase()) });

const Docs = (() => {
  const running = new Set(); let timer = 0, lastEdit = new Map(), busy = false;
  Store.subscribe((info, src) => {
    if (src === 'doc' || src === 'cloud' || info.view || info.quiet) return;
    const ids = new Set([info.seq, info.from].filter(Boolean));
    if (info.structure && !info.seq) for (const q of Store.data.seqs) ids.add(q.id);
    for (const id of ids) lastEdit.set(id, Date.now());
    if (ids.size) soon(info.text ? 20000 : 8000);
  });
  function soon(ms = 8000) { clearTimeout(timer); timer = setTimeout(() => tick('soon'), ms); }
  // folders in Drive: iStory / Book / Part / Act
  async function folder(key, name, parent) {
    const F = Store.data.drive.folders, rec = F[key];
    if (rec && rec.id) {
      if (rec.name !== name) { try { await api(`${API}/files/${rec.id}?fields=id`, { method: 'PATCH', headers: jsonHead, body: JSON.stringify({ name }) }); rec.name = name; } catch (e) { if (e.status !== 404) throw e; delete F[key]; return folder(key, name, parent); } }
      return rec.id;
    }
    const meta = { name, mimeType: GFOLDER }; if (parent) meta.parents = [parent];
    const r = await (await api(`${API}/files?fields=id`, { method: 'POST', headers: jsonHead, body: JSON.stringify(meta) })).json();
    F[key] = { id: r.id, name };
    Store.changed({ quiet: true }, 'doc');
    return r.id;
  }
  async function actFolder(q) {
    const w = Store.where(q.id);
    const root = await folder('root', 'iStory', null);
    const b = await folder('b:' + w.book.id, Store.bookLabel(w.book).replace(/:/, ' ·'), root);
    const p = await folder('p:' + w.part.id, Store.partLabel(w.part).replace(/:/, ' ·'), b);
    return folder('a:' + w.act.id, Store.actLabel(w.act).replace(/:/, ' ·'), p);
  }
  async function exportHtml(id) { return (await api(`${API}/files/${id}/export?mimeType=text%2Fhtml`)).text(); }
  async function meta(id) { try { return await (await api(`${API}/files/${id}?fields=id,version,trashed,name,parents`)).json(); } catch (e) { if (e.status === 404) return null; throw e; } }
  async function upload(id, html, metaObj) {
    const m = multipart(metaObj, new Blob([html], { type: 'text/html' }), 'text/html');
    return (await api(id ? `${UP}/files/${id}?uploadType=multipart&fields=id,version` : `${UP}/files?uploadType=multipart&fields=id,version`, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': m.ct }, body: m.body })).json();
  }
  // record what both sides look like right now
  async function settle(q, docId) {
    const parsed = parseHtml(await exportHtml(docId)), m = await meta(docId), v = appView(q);
    const ids = parsed.scenes.length === v.head.order.length ? v.head.order.slice() : matchScenes(parsed, { order: v.head.order, titles: {} });
    const scenes = {}, titles = {};
    parsed.scenes.forEach((d, i) => { const id = ids[i]; if (!id) return; scenes[id] = { doc: sigOf(docSceneView(d)), app: v.scenes[id] ? sigOf(v.scenes[id]) : '' }; titles[id] = d.title; });
    q.doc = { id: docId, ver: String(m.version), head: { doc: docHeadSig(parsed), app: headSig(v.head) }, scenes, order: ids.filter(Boolean), titles, folder: (m.parents || [])[0] || '', name: m.name, at: Date.now() };
    Store.changed({ quiet: true }, 'doc');
  }
  async function create(q) {
    const parent = await actFolder(q);
    const r = await upload(null, buildHtml(q), { name: docName(q), mimeType: GDOC, parents: [parent] });
    await settle(q, r.id);
  }
  async function push(q) {
    const r = q.doc;
    const parent = await actFolder(q);
    const metaObj = { mimeType: GDOC, name: docName(q) };
    let url = r.id;
    const out = await upload(url, buildHtml(q), metaObj);
    if (r.folder && r.folder !== parent) { try { await api(`${API}/files/${r.id}?addParents=${parent}&removeParents=${r.folder}&fields=id`, { method: 'PATCH', headers: jsonHead, body: '{}' }); } catch (e) {} }
    void out;
    await settle(q, r.id);
  }
  // bring a Doc scene into the app
  function applyScene(s, d) {
    const st = Store.STATUSES.find(x => x[1].toLowerCase() === d.status.toLowerCase());
    const sg = Store.STAGES.find(x => x[1].toLowerCase() === d.stage.toLowerCase() || x[0] === d.stage.toLowerCase());
    s.title = d.title || s.title; s.pov = d.pov; s.location = d.location; s.date = d.date; s.summary = d.summary;
    if (st) s.status = st[0];
    if (sg && sg[0] !== s.stage) { const m = Store.ms(s.id); if (m.text.trim()) m.versions.push({ stage: s.stage, text: m.text, at: Date.now() }); s.stage = sg[0]; }
    const old = s.beats;
    s.beats = d.beats.map((b, i) => { const o = old[i] || {}; return { id: o.id || Store.uid('b-'), text: b.text, link: i === 0 ? '' : b.link || 'and', done: b.done, notes: b.notes, dialogue: b.dialogue.map(([speaker, line], k) => ({ id: (o.dialogue && o.dialogue[k] && o.dialogue[k].id) || Store.uid('d-'), speaker, line })) }; });
    Store.ms(s.id).text = d.text;
    s.updated = Date.now();
  }
  async function syncSeq(q, version, why) {
    if (running.has(q.id)) return;
    running.add(q.id);
    try {
      const r = q.doc;
      const m = version === undefined ? await meta(r.id) : { version, trashed: false };
      if (!m || m.trashed) { q.doc = null; q.noDoc = true; Store.changed({ quiet: true, seq: q.id }, 'doc'); return; }
      const v = appView(q), recIds = Object.keys(r.scenes);
      const sceneAppChanged = (id) => !r.scenes[id] || !v.scenes[id] || sigOf(v.scenes[id]) !== r.scenes[id].app;
      const headAppChanged = headSig(v.head) !== r.head.app;
      const appChanged = headAppChanged || v.head.order.some(sceneAppChanged) || recIds.some(id => !v.scenes[id]);
      let docChanged = String(m.version) !== r.ver, parsed = null, ids = null;
      if (docChanged) {
        parsed = parseHtml(await exportHtml(r.id));
        ids = matchScenes(parsed, r);
        // Drive's version also moves for a rename or a move: only a change in what the Doc says counts
        const same = docHeadSig(parsed) === r.head.doc && parsed.scenes.length === recIds.length && parsed.scenes.every((d, i) => ids[i] && r.scenes[ids[i]] && sigOf(docSceneView(d)) === r.scenes[ids[i]].doc);
        if (same) { r.ver = String(m.version); Store.changed({ quiet: true }, 'doc'); docChanged = false; }
      }
      if (!docChanged && !appChanged) return;
      if (!docChanged) {
        const quietFor = Date.now() - (lastEdit.get(q.id) || 0);
        if (why !== 'now' && why !== 'leave' && quietFor < 15000) { soon(15000 - quietFor + 500); return; }
        await push(q); return;
      }
      // the Doc changed: go through it scene by scene
      const headDocChanged = docHeadSig(parsed) !== r.head.doc;
      const take = [], conflicts = [], revive = [];
      parsed.scenes.forEach((d, i) => {
        const id = ids[i], dv = docSceneView(d), dChanged = !id || !r.scenes[id] || sigOf(dv) !== r.scenes[id].doc;
        if (!id) { take.push({ d, id: null, i }); return; }                       // a scene written into the Doc
        const s = Store.scene(id);
        if (!s) { if (dChanged) revive.push({ d }); return; }                     // deleted here; comes back (to Loose Pages) only if the Doc changed it
        if (!dChanged) return;
        if (s.seqId !== q.id) { take.push({ d, id, i, stay: true }); return; }     // moved elsewhere here, edited in the Doc: the edits follow it
        if (!sceneAppChanged(id) || JSON.stringify(v.scenes[id]) === JSON.stringify(dv)) take.push({ d, id, i });
        else conflicts.push({ d, id, i });
      });
      let keepApp = false;
      if (conflicts.length) {
        const names = conflicts.map(c => '“' + (Store.scene(c.id).title || 'Untitled') + '”').join(', ');
        const pick = await G.ask('Changed in both places', `${names} changed in iStory and in the Google Doc for “${q.name || 'this sequence'}”. The version you don’t keep is saved under Earlier copies.`, ['Keep the Doc', 'Keep iStory', 'Decide later']);
        if (pick === 2) return;
        keepApp = pick === 1;
        if (!keepApp) take.push(...conflicts);
      }
      await Copies.keep('before changes from the Google Doc for “' + (q.name || 'a sequence') + '”');
      // scenes taken out of the Doc (and not changed here) go to Loose Pages; nothing is deleted
      const inDoc = new Set(ids.filter(Boolean));
      for (const id of recIds) {
        const s = Store.scene(id);
        if (s && s.seqId === q.id && !inDoc.has(id) && !sceneAppChanged(id)) { Store.data.scenes = Store.data.scenes.filter(x => x !== s); s.seqId = null; Store.data.scenes.push(s); }
      }
      for (const t of take) {
        if (t.id) applyScene(Store.scene(t.id), t.d);
        else { const s = Store.addScene({ title: t.d.title || 'Untitled' }, q.id); applyScene(s, t.d); ids[t.i] = s.id; }
      }
      for (const t of revive) { const s = Store.addScene({ title: t.d.title || 'Untitled', bookId: Store.where(q.id).book.id }, null); applyScene(s, t.d); }
      if (headDocChanged && !headAppChanged) {
        q.name = parsed.name || q.name; q.idea = parsed.idea;
        // the Doc's scene order
        const mine = ids.filter(id => id && Store.scene(id) && Store.scene(id).seqId === q.id).map(id => Store.scene(id));
        for (const s of Store.scenesOf(q.id)) if (!mine.includes(s)) mine.push(s);
        const first = Math.min(...mine.map(s => Store.data.scenes.indexOf(s)));
        const others = Store.data.scenes.filter(s => !mine.includes(s));
        const at = others.filter(s => Store.data.scenes.indexOf(s) < first).length;
        Store.data.scenes = [...others.slice(0, at), ...mine, ...others.slice(at)];
      }
      Store.changed({ structure: true, seq: q.id, text: true }, 'doc');
      // does the Doc still lack something from iStory?
      const missing = keepApp || headAppChanged
        || v.head.order.some(id => sceneAppChanged(id) && !take.some(t => t.id === id))
        || recIds.some(id => !v.scenes[id] && inDoc.has(id))
        || take.some(t => t.stay);
      if (missing) await push(q); else await settle(q, r.id);
    } finally { running.delete(q.id); }
  }
  async function tick(why) {
    if (!cfg().signedIn || busy) return;
    if (document.visibilityState !== 'visible' && why !== 'leave') return;
    busy = true;
    try {
      await exclusive('istory2-docs', async () => {
        // every sequence gets its Doc (a few at a time)
        let made = 0;
        for (const q of Store.data.seqs) if (!q.doc && !q.noDoc && Store.where(q.id) && made < 3) { await create(q); made++; }
        if (made === 3) soon(4000);
        // one look at all the Docs' versions
        const linked = Store.data.seqs.filter(q => q.doc);
        if (!linked.length) return;
        const vers = new Map(); let pt = '';
        do {
          const qy = encodeURIComponent(`mimeType='${GDOC}' and trashed=false`);
          const j = await (await api(`${API}/files?q=${qy}&pageSize=1000&fields=${encodeURIComponent('nextPageToken,files(id,version)')}` + (pt ? '&pageToken=' + pt : ''))).json();
          for (const f of j.files || []) vers.set(f.id, String(f.version));
          pt = j.nextPageToken;
        } while (pt);
        for (const q of linked) await syncSeq(q, vers.has(q.doc.id) ? vers.get(q.doc.id) : undefined, why);
      });
    } catch (e) {
      if (e.needTap) setState('reconnect', 'Tap anywhere to reconnect to Google');
      else if (!(e.offline || !navigator.onLine)) setState('error', 'Google Docs: ' + e.message);
    } finally { busy = false; }
  }
  function start() {
    setInterval(() => tick('timer'), 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(800); else tick('leave'); });
    soon(5000);
  }
  return { soon, tick, start, url: (q) => q && q.doc ? `https://docs.google.com/document/d/${q.doc.id}/edit` : null, make: async (q) => { q.noDoc = false; await create(q); }, buildHtml, parseHtml };
})();
G.Docs = Docs;
G.Sync = Sync;
G.buildHtml = buildHtml; G.parseHtml = parseHtml; G.appView = appView; G.docSceneView = docSceneView; G.sceneView = sceneView;

// the app's own changes mark the Drive copy as needing an update
Store.subscribe((info, src) => { if (src === 'cloud' || info.view) return; Sync.markDirty(); });
G.start = () => {
  if (cfg().signedIn) { Sync.soon(1500); }
  Docs.start();
  setInterval(() => { if (cfg().signedIn && document.visibilityState === 'visible') Sync.cycle('timer'); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!cfg().signedIn) return; if (document.visibilityState === 'visible') Sync.soon(500); else if (Sync.dirty) Sync.cycle('leave'); });
  addEventListener('online', () => { if (cfg().signedIn) Sync.soon(500); });
};
// a dialog is supplied by the app
G.ask = async () => 2;
root.Google = G;
})(window);
