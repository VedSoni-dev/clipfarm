// ffmpeg helpers: find a binary, probe a file, run a filter graph and stream its printed metadata.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, extname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

let cached;
/** The ffmpeg to use: $CLIPFARM_FFMPEG, then the one on PATH, then the bundled ffmpeg-static. */
export function ffmpegPath() {
  if (cached) return cached;
  const candidates = [process.env.CLIPFARM_FFMPEG, 'ffmpeg'];
  try { candidates.push(require('ffmpeg-static')); } catch { /* not installed yet */ }
  for (const c of candidates) {
    if (!c) continue;
    const r = spawnSync(c, ['-hide_banner', '-version'], { encoding: 'utf8' });
    if (r.status === 0) return (cached = c);
  }
  throw new Error('ffmpeg not found. Run `npm install` in the engine folder, or install ffmpeg (brew install ffmpeg / winget install ffmpeg).');
}

/** Run ffmpeg to completion. Resolves with stderr; rejects with the tail of stderr on failure. */
export function run(args, { onStdoutLine } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-nostats', '-y', ...args]);
    let err = '';
    let buf = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 200_000) err = err.slice(-100_000); });
    p.stdout.on('data', (d) => {
      if (!onStdoutLine) return;
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { onStdoutLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    p.on('error', fail);
    p.on('close', (code) => {
      if (buf && onStdoutLine) onStdoutLine(buf);
      code === 0 ? ok(err) : fail(new Error(`ffmpeg exited ${code}\n${err.slice(-1500)}`));
    });
  });
}

/** Duration, size, fps and whether there's audio, read from ffmpeg's own banner (no ffprobe needed). */
export function probe(file) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const s = r.stderr || '';
  const d = s.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = s.match(/Stream #\d+:\d+[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  const fps = s.match(/Stream #\d+:\d+[^\n]*Video:[^\n]*?(\d+(?:\.\d+)?) fps/);
  const rot = s.match(/rotate\s*:\s*(-?\d+)|rotation of (-?\d+(?:\.\d+)?)/);
  if (!d || !v) return null;
  let width = +v[1];
  let height = +v[2];
  const rotation = rot ? Math.abs(Math.round(+(rot[1] ?? rot[2]))) % 180 : 0;
  if (rotation === 90) [width, height] = [height, width];
  return {
    duration: +d[1] * 3600 + +d[2] * 60 + +d[3],
    width,
    height,
    fps: fps ? +fps[1] : 30,
    audio: /Stream #\d+:\d+[^\n]*Audio:/.test(s),
  };
}

export const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm']);

/** Every video under the given paths (files or folders, recursive), newest first. */
export function findVideos(paths, { sinceHours, skip = [] } = {}) {
  const out = [];
  const cutoff = sinceHours ? Date.now() - sinceHours * 3600e3 : 0;
  const skipAbs = skip.map((p) => resolve(p));
  const walk = (p, depth) => {
    if (skipAbs.some((s) => p.startsWith(s))) return;
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) {
      if (depth > 6) return;
      for (const name of readdirSync(p)) if (!name.startsWith('.')) walk(join(p, name), depth + 1);
    } else if (VIDEO_EXT.has(extname(p).toLowerCase()) && st.size > 500_000 && st.mtimeMs >= cutoff) {
      out.push({ path: p, mtime: st.mtimeMs, size: st.size });
    }
  };
  for (const p of paths) walk(resolve(p), 0);
  return out.sort((a, b) => b.mtime - a.mtime);
}

/** The Clipfarm folder (inbox + runs): ~/Movies/Clipfarm on a Mac, ~/Videos/Clipfarm elsewhere. */
export function workspace() {
  if (process.env.CLIPFARM_HOME) return resolve(process.env.CLIPFARM_HOME);
  return join(homedir(), platform() === 'darwin' ? 'Movies' : 'Videos', 'Clipfarm');
}

/** Folders a console syncs captures to on this computer (Xbox → OneDrive), if they exist. */
export function consoleFolders() {
  const home = homedir();
  const found = [];
  const cloud = join(home, 'Library', 'CloudStorage');
  if (existsSync(cloud)) {
    for (const name of readdirSync(cloud)) if (name.startsWith('OneDrive')) found.push(join(cloud, name, 'Videos'));
  }
  for (const name of ['OneDrive', 'OneDrive - Personal']) found.push(join(home, name, 'Videos'));
  return found.filter((p) => existsSync(p));
}
