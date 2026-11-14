// Where console clips land on this computer, and how they get into the Clipfarm inbox.
//
//   Xbox  → OneDrive (console setting) → the OneDrive app's Videos folder.               automatic
//   PS5   → PlayStation App (console setting) → saved to the phone → iCloud Photos / AirDrop /
//           Google Drive → this computer.                                                 one tap per clip
//   Either → a USB drive (PS5: Media Gallery → Copy to USB) → plugged in here.
//   PC    → Xbox Game Bar's Captures folder.
//
// pull() copies new game clips from the sources that are switched on into <home>/inbox (keeping their original
// dates) and remembers what it copied, so nothing is copied twice. Copies, never moves: the originals stay put.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { probe, VIDEO_EXT, workspace } from './ff.mjs';

const HOME = homedir();
const MAC = platform() === 'darwin';
const WIN = platform() === 'win32';

const ls = (dir) => { try { return readdirSync(dir); } catch { return []; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** Every place clips can arrive, with the folders that exist on this computer right now. */
export function listSources() {
  const cloud = join(HOME, 'Library', 'CloudStorage');
  const onedrive = [
    ...ls(cloud).filter((n) => n.startsWith('OneDrive')).map((n) => join(cloud, n, 'Videos')),
    ...[process.env.OneDrive, process.env.OneDriveConsumer].filter(Boolean).map((p) => join(p, 'Videos')),
    join(HOME, 'OneDrive', 'Videos'),
  ];
  const drives = MAC
    ? ls('/Volumes').filter((n) => !['Macintosh HD', 'Recovery', 'Preboot', 'VM', 'Data'].includes(n)).map((n) => join('/Volumes', n))
    : WIN ? 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\`).filter((p) => p !== `${(process.env.SystemDrive || 'C:')}\\`) : [];
  const usb = drives.flatMap((d) => [join(d, 'PS5', 'CREATE'), join(d, 'PS4', 'SHARE'), join(d, 'Captures'), join(d, 'Xbox Captures')]);
  const gdrive = ls(cloud).filter((n) => n.startsWith('GoogleDrive')).map((n) => join(cloud, n, 'My Drive'));
  const photosLib = join(HOME, 'Pictures', 'Photos Library.photoslibrary');

  const all = [
    { id: 'onedrive', label: 'Xbox → OneDrive', auto: true, paths: onedrive,
      missing: 'Install OneDrive on this computer and sign in with the Microsoft account your Xbox uses.' },
    { id: 'usb', label: 'USB drive', auto: true, paths: usb,
      missing: 'Plug in a USB drive with clips copied from the console (PS5: Media Gallery → select → Copy to USB).' },
    { id: 'pc', label: 'PC captures (Game Bar)', auto: true, paths: WIN ? [join(HOME, 'Videos', 'Captures')] : [],
      missing: 'Only on Windows: Xbox Game Bar saves to Videos\\Captures.' },
    { id: 'photos', label: MAC ? 'Phone → iCloud Photos' : 'Phone → iCloud Photos (Windows)', auto: false,
      paths: MAC ? (existsSync(photosLib) ? [photosLib] : []) : [join(HOME, 'Pictures', 'iCloud Photos', 'Photos')],
      photosApp: MAC,
      missing: 'Turn on iCloud Photos on the phone and on this computer; clips saved from the PlayStation or Xbox app then show up here.' },
    { id: 'downloads', label: MAC ? 'AirDrop / Downloads' : 'Downloads (Quick Share, browser)', auto: false, paths: [join(HOME, 'Downloads')],
      missing: 'AirDrop (Mac) or Quick Share (Windows) clips from the phone; they land in Downloads.' },
    { id: 'gdrive', label: 'Google Drive', auto: false, paths: gdrive,
      missing: 'Install Google Drive for desktop; clips the phone uploads to Drive then show up here.' },
  ];
  for (const s of all) s.found = s.paths.filter((p) => isDir(p));
  return all;
}

/** Which sources to pull from: the automatic ones, plus whatever the user switched on (`clips --use`). */
export function settings() {
  const file = join(workspace(), 'settings.json');
  let saved = {};
  try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first run */ }
  return { file, use: saved.use ?? [], ...saved };
}

export function saveSettings(next) {
  mkdirSync(workspace(), { recursive: true });
  const { file, ...rest } = { ...settings(), ...next };
  writeFileSync(file, JSON.stringify(rest, null, 2) + '\n');
}

export function enabled(source, s = settings()) {
  return source.auto ? !(s.off ?? []).includes(source.id) : s.use.includes(source.id);
}

/** Does this look like a console or PC game capture? Landscape, about 16:9, at least 720p, 3 s or longer. */
export function looksLikeCapture(meta) {
  if (!meta) return false;
  const r = meta.width / meta.height;
  return r > 1.6 && r < 1.9 && meta.height >= 700 && meta.duration >= 3 && meta.duration <= 4 * 3600;
}

/** Video files in a folder (recursive), changed after `since` (ms), newest first. */
export function recentFiles(dir, since, depth = 0) {
  const out = [];
  for (const name of ls(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (depth < 5) out.push(...recentFiles(p, since, depth + 1)); continue; }
    if (!VIDEO_EXT.has(extname(name).toLowerCase()) || st.size < 500_000) continue;
    const t = Math.max(st.mtimeMs, st.birthtimeMs || 0);
    if (t >= since) out.push({ path: p, size: st.size, mtime: st.mtimeMs, t });
  }
  return out.sort((a, b) => b.t - a.t);
}

// ---- iCloud Photos on a Mac, through the Photos app (macOS asks once to allow it) ----

function jxa(code, timeoutMs = 180_000) {
  const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', code], { encoding: 'utf8', timeout: timeoutMs });
  if (r.status !== 0) {
    const msg = (r.stderr || r.error?.message || '').trim();
    if (/-1743|not allowed|Not authorized/i.test(msg)) {
      throw new Error('macOS blocked access to Photos. Allow it in System Settings → Privacy & Security → Automation (your terminal or Claude → Photos), then try again.');
    }
    throw new Error(`Photos: ${msg || 'no answer'}`);
  }
  return r.stdout.trim();
}

/**
 * Videos added to Photos since `since` (ms) that look like clips saved from the PlayStation or Xbox app:
 * landscape 16:9, an .mp4 (the phone's own camera records .mov) and no GPS location. [{ id, name, w, h, date }]
 */
export function photosVideos(since) {
  const out = jxa(`
    const P = Application('Photos');
    const since = new Date(${Math.floor(since)});
    const items = P.mediaItems.whose({ date: { _greaterThan: since } })();
    const found = [];
    for (const it of items) {
      const name = it.filename();
      if (!/\\.(mp4|m4v)$/i.test(name)) continue;
      const w = it.width(), h = it.height();
      if (!(w > h && h >= 700 && w / h > 1.6 && w / h < 1.9)) continue;
      let loc = null;
      try { loc = it.location(); } catch (e) { loc = null; }
      if (loc && loc.length && loc[0] != null) continue;
      found.push({ id: it.id(), name, w, h, date: it.date().toISOString() });
    }
    JSON.stringify(found);`);
  return JSON.parse(out || '[]');
}

function exportFromPhotos(id, dir) {
  jxa(`
    const P = Application('Photos');
    P.export([P.mediaItems.byId(${JSON.stringify(id)})], { to: Path(${JSON.stringify(dir)}), usingOriginals: true });
    'ok';`, 600_000);
  return ls(dir).filter((n) => VIDEO_EXT.has(extname(n).toLowerCase())).map((n) => join(dir, n));
}

// ---- pulling into the inbox ----

function ledger() {
  const file = join(workspace(), 'inbox', '.pulled.json');
  let seen = {};
  try { seen = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
  return { seen, save: () => writeFileSync(file, JSON.stringify(seen, null, 1) + '\n') };
}

function inboxName(inbox, sourceId, name) {
  const base = `${sourceId}-${basename(name).replace(/[^\w.\- ]+/g, '_')}`;
  let candidate = base;
  for (let i = 2; existsSync(join(inbox, candidate)); i++) candidate = base.replace(/(\.[^.]+)$/, `-${i}$1`);
  return candidate;
}

/**
 * Copy new game clips from every switched-on source into the inbox.
 * Returns [{ source, from, to }] for what it copied. `log` gets one line per clip.
 */
export function pull({ sinceHours = 72, only, log = () => {} } = {}) {
  const inbox = join(workspace(), 'inbox');
  mkdirSync(inbox, { recursive: true });
  const since = Date.now() - sinceHours * 3600e3;
  const s = settings();
  const { seen, save } = ledger();
  const copied = [];
  for (const src of listSources()) {
    if (only ? !only.includes(src.id) : !enabled(src, s)) continue;
    if (src.photosApp) {
      if (!src.found.length) continue;
      for (const v of photosVideos(since)) {
        const key = `photos:${v.id}`;
        if (seen[key]) continue;
        const tmp = join(tmpdir(), `clipfarm-photos-${process.pid}-${Date.now()}`);
        mkdirSync(tmp, { recursive: true });
        for (const f of exportFromPhotos(v.id, tmp)) {
          const meta = probe(f);
          if (!looksLikeCapture(meta)) continue;
          const to = join(inbox, inboxName(inbox, src.id, v.name));
          copyFileSync(f, to);
          const when = new Date(v.date);
          utimesSync(to, when, when);
          seen[key] = basename(to);
          copied.push({ source: src.id, from: `Photos: ${v.name}`, to });
          log(`  + ${basename(to)}  (from Photos, ${v.date.slice(0, 16).replace('T', ' ')})`);
        }
        if (!seen[key]) seen[key] = '-';
        rmSync(tmp, { recursive: true, force: true });
      }
      continue;
    }
    for (const dir of src.found) {
      for (const f of recentFiles(dir, since)) {
        const key = `${f.path}|${f.size}`;
        if (seen[key]) continue;
        const meta = probe(f.path);
        if (!looksLikeCapture(meta)) { seen[key] = '-'; continue; } // not a game capture: don't look again
        const to = join(inbox, inboxName(inbox, src.id, f.path));
        copyFileSync(f.path, to);
        utimesSync(to, new Date(f.mtime), new Date(f.mtime));
        seen[key] = basename(to);
        copied.push({ source: src.id, from: f.path, to });
        log(`  + ${basename(to)}  (from ${src.label})`);
      }
    }
  }
  save();
  return copied;
}
