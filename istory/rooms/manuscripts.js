/* =====================================================================
   iStory manuscripts: the writing room's text, kept in the studio's typewriter format.
   Every manuscript lives in the 'underwood-quiet-v1' store as sheets of typed letters
   (the same records the laptop's writing room, word counts, Google Docs and Drive sync use).
   Reading: pageRows() below is copied unchanged from the typewriter, so iStory reads a sheet
   exactly the way the laptop does. Writing: typeset() strikes the text onto sheets the way the
   typewriter would (word wrap at the right margin, 1.5 spacing, a new sheet at the bottom margin).
   Saving keeps every leading sheet whose text is unchanged and re-sets only the rest, so sheets
   typed on the laptop stay as they were unless you edit them.
   ===================================================================== */
(function (root) {
'use strict';
const PAPER_W = 8 * 72, PAPER_H = 11 * 72, TOP = 72, BOTTOM = PAPER_H - 72;
const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20], MARGINS = [36, 54, 72, 90, 108, 126, 144];
const FACE_IDS = ['imprint', 'pica'];
const HARD = 0, SOFT = 1, WRAP = 2;
const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
const DEFAULT_INDENT = 5;   // the typewriter's first tab stop

/* ---------- reading a sheet ---------- */
function unpackPage(p) {
  return {
    id: p.id, w: p.w, h: p.h, loaded: p.loaded !== false,
    left: Number.isFinite(p.left) ? p.left : undefined,
    cursor: { x: +(p.cursor && p.cursor.x) || 72, y: +(p.cursor && p.cursor.y) || 72 },
    breaks: (p.breaks || []).map(b => { const o = { y: b[0] / 100, kind: b[1] === 2 ? 'wrap' : b[1] ? 'soft' : 'hard' }; if (b[2] >= 0) o.endX = b[2] / 100; if (b[3] >= 0) o.next = b[3] / 100; return o; }),
    impressions: (p.imps || []).map(a => ({ ch: a[0], x: a[1] / 100, y: a[2] / 100, fs: a[3] / 10, adv: a[4] / 100, face: FACE_IDS[a[5]] || 'imprint', red: !!a[6] }))
  };
}
// ---- copied from the typewriter (Story Studio writing room), unchanged ----
function pageRows(pg) {
    const lines = new Map(),
        starts = new Map();
    for (const imp of pg.impressions) {
        const ky = imp.y.toFixed(2);
        if (!lines.has(ky)) lines.set(ky, {
            y: imp.y,
            items: [],
            min: Infinity
        });
        const ln = lines.get(ky);
        ln.items.push(imp);
        ln.min = Math.min(ln.min, imp.x);
    }
    for (const br of pg.breaks) {
        const ky = br.y.toFixed(2);
        if (!lines.has(ky)) lines.set(ky, {
            y: br.y,
            items: [],
            min: Infinity
        });
    }
    for (const ln of lines.values())
        if (ln.items.length) {
            const k = Math.round(ln.min * 2) / 2;
            starts.set(k, (starts.get(k) || 0) + 1);
        }
    let margin = 72,
        best = 0;
    for (const [k, n] of starts)
        if (n > best || n === best && k < margin) {
            best = n;
            margin = k;
        }
    const sortedBreaks = [...pg.breaks].sort((a, b) => a.y - b.y);
    const marginAt = y => {
        let m = null;
        for (const b of sortedBreaks)
            if (b.y < y - .4) m = b;
        return m && Number.isFinite(m.next) ? m.next : Number.isFinite(pg.left) && !m ? pg.left : margin;
    };
    return [...lines.values()].sort((a, b) => a.y - b.y).map(ln => {
        const cells = new Map();
        for (const i of ln.items) {
            const k = i.x.toFixed(2);
            const prev = cells.get(k);
            if (i.ch === ' ' && prev && prev.ch !== '\0' && prev.ch !== ' ') continue;
            cells.set(k, i);
        }
        const imps = [...cells.values()].sort((a, b) => a.x - b.x);
        let raw = '',
            last = null;
        for (const i of imps) {
            if (last) {
                const gap = Math.max(0, Math.round((i.x - last.x - last.adv) / last.adv));
                raw += ' '.repeat(Math.min(100, gap));
            } else {
                const indent = Math.max(0, Math.round((i.x - marginAt(ln.y)) / i.adv));
                raw += ' '.repeat(Math.min(100, indent));
            }
            raw += i.ch === '\0' ? ' ' : i.ch;
            last = i;
        }
        const br = pg.breaks.filter(b => Math.abs(b.y - ln.y) < .4).at(-1);
        // a whole-word wrap is a space in the text, even when the line ended right on a letter
        if (br?.kind === 'wrap' && !/\s$/u.test(raw)) raw += ' ';
        return {
            y: ln.y,
            raw,
            hard: br ? br.kind === 'hard' : true
        };
    });
}

// ---- end of the typewriter's code ----
// a sheet's text, the way the typewriter's own cleanText() joins it
function pageText(packed) {
  let out = '';
  for (const r of pageRows(unpackPage(packed))) { out += r.hard ? r.raw.replace(/\s+$/u, '') : r.raw; if (r.hard) out += '\n'; }
  return out;
}

/* ---------- the paper and the type ---------- */
function geometry(settings) {
  const s = settings || {};
  const fs = FONT_SIZES.includes(+s.fontPt) ? +s.fontPt : 16;
  const left = MARGINS.includes(+s.left) ? +s.left : 72, right = MARGINS.includes(+s.right) ? +s.right : 72;
  return { fs, adv: fs * 0.6, lh: fs * 1.5, left, right: PAPER_W - right };
}
function hash01(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

/* ---------- setting text onto sheets ----------
   raw: lines separated by \n; leading spaces are indentation (the carriage moves, nothing is struck).
   ids: sheet ids to reuse, in order (keeps Drive sync from re-uploading under new names). */
function typeset(raw, g, ids) {
  ids = (ids || []).slice();
  const pages = []; let pg = null, x = 0, y = 0, n = 0;
  const open = () => { pg = { id: ids.length ? ids.shift() : uid(), w: PAPER_W, h: PAPER_H, loaded: false, cursor: null, breaks: [], left: g.left, imps: [] }; pages.push(pg); x = g.left; y = TOP; };
  const brk = (kind) => {
    pg.breaks.push([Math.round(y * 100), kind, Math.round(x * 100), Math.round(g.left * 100)]);
    x = g.left; y += g.lh;
    if (y > BOTTOM + .01) { pg.cursor = { x: g.left, y: BOTTOM }; open(); }
  };
  const put = (ch) => {
    const h = hash01(ch + (n++));
    pg.imps.push([ch, Math.round(x * 100), Math.round(y * 100), Math.round(g.fs * 10), Math.round(g.adv * 100), 0, 0, 0, 0, 0, Math.round((0.76 + 0.18 * h) * 1e3), Math.round(h * 997) % 1000]);
    x += g.adv;
  };
  const fits = (k) => x + k * g.adv <= g.right + .01;
  const cols = Math.max(1, Math.floor((g.right - g.left) / g.adv + .001));
  open();
  const lines = String(raw).split('\n');
  lines.forEach((line, li) => {
    const lead = line.match(/^ */)[0].length;
    x = g.left + Math.min(lead, cols - 1) * g.adv;
    for (const t of line.slice(lead).replace(/\s+$/u, '').match(/ +|[^ ]+/g) || []) {
      if (t[0] === ' ') {
        if (fits(t.length)) for (let k = 0; k < t.length; k++) put(' ');
        else brk(WRAP);                                   // a space at the margin ends the line
      } else {
        const chars = [...t];
        if (fits(chars.length)) chars.forEach(put);
        else if (chars.length <= cols && x > g.left + .01) { brk(WRAP); chars.forEach(put); }   // carry the word down
        else for (const ch of chars) { if (!fits(1)) brk(SOFT); put(ch); }                       // a word longer than the line
      }
    }
    if (li < lines.length - 1) brk(HARD);
  });
  pg.cursor = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  pg.loaded = true;
  return pages;
}

/* ---------- a manuscript's lines ---------- */
// raw text -> [{ ind, text }] (ind = leading spaces)
function parse(raw) { return String(raw || '').split('\n').map(l => { const ind = l.match(/^ */)[0].length; return { ind, text: l.slice(ind).replace(/\s+$/u, '') }; }); }
function serialize(lines) { return lines.map(l => (l.text ? ' '.repeat(l.ind | 0) : '') + l.text.replace(/\s+$/u, '')).join('\n').replace(/\n+$/u, ''); }
function words(raw) { return (String(raw).match(/\S+/g) || []).length; }
// the indentation most paragraphs use (a new paragraph gets the same)
function usualIndent(lines) {
  const c = new Map(); let best = DEFAULT_INDENT, bn = 0;
  for (const l of lines) if (l.text) c.set(l.ind, (c.get(l.ind) || 0) + 1);
  for (const [k, v] of c) if (v > bn || (v === bn && k < best)) { best = k; bn = v; }
  return c.size ? best : DEFAULT_INDENT;
}

/* ---------- reading and writing the store ---------- */
function sceneEntry(meta, sceneId) { return meta && (meta.manuscripts || []).find(m => m.sceneId === sceneId) || null; }
// → { entry, texts: [per-sheet text], raw }
function readEntry(entry, pages) {
  const texts = (entry ? entry.pageIds || [] : []).map(id => pages[id] ? pageText(pages[id]) : '');
  return { entry, texts, raw: texts.join('').replace(/\n+$/u, '') };
}
// work out the new sheets for a manuscript whose text becomes newRaw
function plan(entry, pages, newRaw, settings) {
  const ids = (entry.pageIds || []).filter(id => pages[id]);
  const texts = ids.map(id => pageText(pages[id]));
  let k = 0, at = 0;
  // keep leading sheets whose text is unchanged; the last sheet is always re-set, so new writing continues on it
  while (k < ids.length - 1 && newRaw.startsWith(texts[k], at)) { at += texts[k].length; k++; }
  const fresh = typeset(newRaw.slice(at), geometry(settings), ids.slice(k));
  const keep = ids.slice(0, k);
  const used = new Set([...keep, ...fresh.map(p => p.id)]);
  // any earlier sheet that was in the machine is out of it now
  return { pageIds: [...keep, ...fresh.map(p => p.id)], fresh, removed: (entry.pageIds || []).filter(id => !used.has(id)), kept: k };
}

root.IStoryMS = { PAPER_W, PAPER_H, geometry, typeset, pageText, pageRows, unpackPage, parse, serialize, words, usualIndent, sceneEntry, readEntry, plan, uid, DEFAULT_INDENT };
})(typeof window !== 'undefined' ? window : globalThis);
