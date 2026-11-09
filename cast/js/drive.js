/* =====================================================================
   Cast and Google Drive: one hidden copy of the cast (plus a file per portrait) in the
   app folder Story Studio and iStory already use. Signing in here also signs iStory in, and back.
   ===================================================================== */
(function (root) {
'use strict';
const D = root.Cast;
const CLIENT_ID = '746584309009-0ifbot96l5pdrmdifm6oid3670l109pr.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';   // same as iStory, so one sign-in serves both
const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';
const DATA = 'cast-data.json', IMG = 'cast-img-';
const TOK = 'istory2_tok', CFG = 'cast_google', SY = 'cast_sync';
const fail = (msg, extra) => Object.assign(new Error(msg), extra || {});
const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
const lset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const cfg = () => ls(CFG, {}), setCfg = (p) => lset(CFG, { ...cfg(), ...p });
const sy = () => ls(SY, {}), setSy = (p) => lset(SY, { ...sy(), ...p });

const listeners = new Set();
let state = { mode: cfg().signedIn ? 'idle' : 'signedout', msg: '', lastOk: 0 };
function setState(mode, msg) { state = { ...state, mode, msg: msg || '' }; if (mode === 'idle') state.lastOk = Date.now(); for (const f of listeners) try { f(state); } catch (e) {} }

/* ---------- sign-in (token shared with iStory) ---------- */
let client = null, pending = null, gisP = null, needTap = false;
function tok() { const t = ls(TOK, null); return t && t.scope === SCOPES && t.exp > Date.now() + 60000 ? t.t : null; }
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
  const t = tok(); if (t) return t;
  if (!interactive) { needTap = true; throw fail('sign in again', { needTap: true }); }
  await gis();
  return new Promise((res, rej) => {
    if (!client) client = root.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPES,
      callback: (r) => {
        const p = pending; pending = null; if (!p) return;
        if (!r || r.error) { p.rej(fail(r && r.error ? 'Google said: ' + r.error : 'Sign-in was cancelled')); return; }
        lset(TOK, { t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000, scope: SCOPES });
        needTap = false; setCfg({ signedIn: true }); p.res(r.access_token);
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
  if (r.status === 401) { try { localStorage.removeItem(TOK); } catch (e) {} needTap = true; throw fail('sign in again', { needTap: true }); }
  if (!r.ok) { let b = ''; try { b = await r.text(); } catch (e) {} throw fail('Google Drive said ' + r.status + (b ? ': ' + b.slice(0, 200) : ''), { status: r.status }); }
  return r;
}
async function list(q) {
  const out = []; let pt = '';
  do {
    const j = await (await api(`${API}/files?spaces=appDataFolder&q=${encodeURIComponent(q)}&pageSize=500&fields=${encodeURIComponent('nextPageToken,files(id,name,md5Checksum,modifiedTime)')}` + (pt ? '&pageToken=' + pt : ''))).json();
    out.push(...(j.files || [])); pt = j.nextPageToken;
  } while (pt);
  return out;
}
function multipart(meta, blob, type) {
  const b = 'cast' + Math.random().toString(36).slice(2);
  return { ct: `multipart/related; boundary=${b}`, body: new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${type}\r\n\r\n`, blob, `\r\n--${b}--`]) };
}
async function put(name, blob, existing, type) {
  const m = multipart(existing ? {} : { name, parents: ['appDataFolder'] }, blob, type || 'application/octet-stream');
  const url = existing ? `${UP}/files/${existing.id}?uploadType=multipart&fields=id,name,md5Checksum,modifiedTime` : `${UP}/files?uploadType=multipart&fields=id,name,md5Checksum,modifiedTime`;
  return (await api(url, { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': m.ct }, body: m.body })).json();
}
const getBlob = async (f) => (await api(`${API}/files/${f.id}?alt=media`)).blob();

/* ---------- earlier copies on this iPad ---------- */
const Copies = {
  async keep(reason) {
    try { const l = (await D.kv.get('copies')) || []; l.unshift({ at: Date.now(), reason, n: D.data.chars.length, data: JSON.parse(D.exportJSON()) }); await D.kv.put('copies', l.slice(0, 6)); } catch (e) {}
  },
  async list() { try { return (await D.kv.get('copies')) || []; } catch (e) { return []; } },
  async keepData(reason, data) { try { const l = (await D.kv.get('copies')) || []; l.unshift({ at: Date.now(), reason, n: data.chars.length, data }); await D.kv.put('copies', l.slice(0, 6)); } catch (e) {} },
  async putBack(i) { const l = await Copies.list(), c = l[i]; if (!c) return; await Copies.keep('before putting back an earlier copy'); await D.replace(c.data, 'restore'); setSy({ dirty: true }); Sync.soon(500); }
};

/* ---------- sync ---------- */
let timer = 0, running = false, again = false;
const Sync = {
  soon(ms = 4000) { if (!cfg().signedIn) return; clearTimeout(timer); timer = setTimeout(() => Sync.cycle(), ms); },
  async cycle(why) {
    if (!cfg().signedIn) return;
    if (running) { again = true; return; }
    if (!navigator.onLine) { setState('offline'); return; }
    running = true;
    const run = async () => {
      try {
        setState('syncing');
        const files = await list(`name='${DATA}'`);
        const remote = files.sort((a, b) => a.modifiedTime < b.modifiedTime ? 1 : -1)[0] || null;
        const s = sy();
        if (!remote) await upload(null);
        else if (remote.md5Checksum === s.base) { if (s.dirty) await upload(remote); }
        else {
          const theirs = D.normalize(JSON.parse(await (await getBlob(remote)).text()));
          const mine = D.data;
          let take = true;
          if (!s.base && mine.chars.length && theirs.chars.length) {
            const i = await G.ask('Two copies of your cast', `This iPad has ${mine.chars.length} character${mine.chars.length === 1 ? '' : 's'} and Google Drive has ${theirs.chars.length}. Which should Cast keep? The other is saved under Earlier copies.`, ['Use the Drive copy', 'Use this iPad’s']);
            take = i === 0;
          } else if (s.dirty && mine.chars.length) {
            const i = await G.ask('Changed in two places', 'Characters were changed here and on another device since they last synced. Which should Cast keep? The other is saved under Earlier copies.', ['Keep this iPad’s', 'Keep the other device’s']);
            take = i === 1;
          }
          if (take) { await Copies.keep('before taking the Drive copy'); await D.replace(theirs, 'cloud'); setSy({ base: remote.md5Checksum, dirty: false }); }
          else { await Copies.keepData('the Drive copy, not kept', theirs); await upload(remote, true); }
        }
        await images();
        setState('idle');
      } catch (e) {
        if (e.race) again = true;
        else setState(e.needTap ? 'reconnect' : e.offline ? 'offline' : 'error', e.needTap ? 'Tap to reconnect Google' : e.offline ? '' : e.message);
      } finally {
        running = false;
        if (again) { again = false; Sync.soon(1500); }
      }
    };
    if (navigator.locks && navigator.locks.request) await navigator.locks.request('cast-sync', { ifAvailable: true }, (lock) => lock ? run() : (running = false));
    else await run();
  }
};
async function upload(existing, force) {
  const rev = D.data.rev;
  if (existing && !force) { const now = (await list(`name='${DATA}'`)).find(f => f.id === existing.id); if ((now ? now.md5Checksum : null) !== existing.md5Checksum) throw fail('changed elsewhere', { race: true }); }
  const f = await put(DATA, new Blob([D.exportJSON()], { type: 'application/json' }), existing, 'application/json');
  setSy({ base: f.md5Checksum, dirty: D.data.rev !== rev });
}
async function images() {
  const remote = new Map((await list(`name contains '${IMG}'`)).map(f => [f.name.slice(IMG.length), f]));
  for (const c of D.data.chars) {
    const id = c.portrait && c.portrait.id; if (!id) continue;
    const here = await D.img.has(id);
    if (here && !remote.has(id)) { const b = await D.img.get(id); await put(IMG + id, b, null, b.type || 'image/jpeg'); }
    else if (!here && remote.has(id)) { await D.img.put(id, await getBlob(remote.get(id))); D.changed({ char: c.id, portrait: true, quiet: true }, 'cloud'); }
  }
}
D.subscribe((info, src) => { if (src === 'cloud' || info.view) return; setSy({ dirty: true }); Sync.soon(); });

const G = {
  get state() { return state; },
  get signedIn() { return !!cfg().signedIn; },
  onState(f) { listeners.add(f); f(state); return () => listeners.delete(f); },
  async signIn() { try { setState('syncing'); await getToken(true); setState('idle'); Sync.soon(0); } catch (e) { setState(cfg().signedIn ? 'reconnect' : 'signedout', e.message); throw e; } },
  signOut() { setCfg({ signedIn: false }); setState('signedout'); },
  gesture() { if (!needTap || !cfg().signedIn || pending) return; getToken(true).then(() => { setState('idle'); Sync.soon(0); }).catch(() => {}); },
  ask: async () => 1,
  start() {
    Sync.soon(800);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.soon(300); });
    addEventListener('online', () => Sync.soon(300));
    setInterval(() => { if (document.visibilityState === 'visible') Sync.soon(0); }, 90000);
  },
  Sync, Copies
};
root.CastDrive = G;
})(window);
