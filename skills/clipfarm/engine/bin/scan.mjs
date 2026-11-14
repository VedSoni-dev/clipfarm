#!/usr/bin/env node
// clipfarm scan: listen to and skim gameplay captures, score every half second, and keep the moments worth clipping.
// Writes <run>/moments.json, one frame grid per moment (<run>/sheets/m1.jpg …) and <run>/report.html.
//
//   node bin/scan.mjs [files or folders…] [--since 48] [--top 10] [--out <dir>] [--pre 6] [--post 3]
//
// With no paths it first pulls new clips from every connected source into the Clipfarm inbox (Xbox → OneDrive,
// USB drives, and the phone sources switched on with bin/clips.mjs), then scans the inbox.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { findVideos, probe, run, workspace } from '../lib/ff.mjs';
import { pull } from '../lib/sources.mjs';
import { writeReport } from '../lib/report.mjs';

const BIN = 0.5; // seconds per score bin

const argv = process.argv.slice(2);
const opt = { top: 0, pre: 6, post: 3, gap: 8, since: 0, maxFiles: 40, out: '' };
const paths = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--top') opt.top = +next();
  else if (a === '--pre') opt.pre = +next();
  else if (a === '--post') opt.post = +next();
  else if (a === '--gap') opt.gap = +next();
  else if (a === '--since') opt.since = +next();
  else if (a === '--max-files') opt.maxFiles = +next();
  else if (a === '--out') opt.out = next();
  else if (a === '-h' || a === '--help') { console.log(readHelp()); process.exit(0); }
  else paths.push(a);
}

const home = workspace();
const inbox = join(home, 'inbox');
mkdirSync(inbox, { recursive: true });
if (!paths.length) {
  try {
    const got = pull({ sinceHours: opt.since || 72, log: (l) => log(l) });
    if (got.length) log(`Pulled ${got.length} new clip${got.length > 1 ? 's' : ''} into the inbox.`);
  } catch (e) { log(`(Couldn't pull new clips: ${e.message})`); }
}
const sources = paths.length ? paths : [inbox];
const runDir = resolve(opt.out || join(home, 'runs', stamp()));
const files = findVideos(sources, { sinceHours: opt.since, skip: [join(home, 'runs')] }).slice(0, opt.maxFiles);

if (!files.length) {
  console.log(JSON.stringify({ ok: false, reason: 'no videos found', looked_in: sources }, null, 2));
  console.error(`\nNo gameplay videos found. Run bin/clips.mjs to see what's connected, drop clips into ${inbox}, or pass a folder.`);
  process.exit(2);
}

mkdirSync(join(runDir, 'sheets'), { recursive: true });
log(`Clipfarm: scanning ${files.length} video${files.length > 1 ? 's' : ''} → ${runDir}`);

const scanned = [];
let all = [];
for (const [i, f] of files.entries()) {
  const meta = probe(f.path);
  if (!meta || meta.duration < 3) { log(`  skip ${basename(f.path)} (unreadable or too short)`); continue; }
  log(`  ${i + 1}/${files.length} ${basename(f.path)} (${clock(meta.duration)}${meta.audio ? '' : ', no audio'})`);
  const t0 = Date.now();
  const [audio, video] = await Promise.all([
    meta.audio ? analyseAudio(f.path) : Promise.resolve([]),
    analyseVideo(f.path),
  ]);
  const curve = score(meta, audio, video);
  const picks = peaks(curve, meta, f.path);
  scanned.push({
    path: f.path,
    name: basename(f.path),
    ...meta,
    curve: curve.map((c) => +c.score.toFixed(3)),
    cutscene: curve.map((c) => (c.letterbox > 0.5 ? 1 : 0)),
    bin: BIN,
  });
  all.push(...picks);
  log(`     ${picks.length} moment${picks.length === 1 ? '' : 's'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// Default: 10 moments, more for long recordings (about one per 4 minutes of footage, up to 24).
const footage = scanned.reduce((s, f) => s + f.duration, 0);
const top = opt.top || Math.min(24, Math.max(10, Math.ceil(footage / 240)));
all = all.sort((a, b) => b.score - a.score).slice(0, top);
all.forEach((m, i) => { m.id = `m${i + 1}`; });

log(`  drawing ${all.length} frame grids…`);
await pool(all, 3, async (m) => {
  const len = m.end - m.start;
  const first = m.start + len / 16;
  m.sheet = `sheets/${m.id}.jpg`;
  m.sheetTimes = Array.from({ length: 8 }, (_, k) => +(first + (k * len) / 8).toFixed(2));
  await run([
    '-ss', first.toFixed(3), '-t', len.toFixed(3), '-i', m.file, '-an',
    '-vf', `select='gte(t,selected_n*${(len / 8).toFixed(5)}-0.004)',scale=384:216:force_original_aspect_ratio=decrease,pad=384:216:(ow-iw)/2:(oh-ih)/2:color=black,tile=4x2:margin=6:padding=6:color=0x111111`,
    '-frames:v', '1', '-q:v', '3', join(runDir, m.sheet),
  ]);
});

const result = {
  tool: 'clipfarm',
  version: 1,
  created: new Date().toISOString(),
  run: runDir,
  files: scanned,
  moments: all,
  next: 'Look at every sheet (8 frames, left→right, top→bottom, times in sheetTimes), pick the best, write edit.json in this folder, then run bin/render.mjs on this folder.',
};
writeFileSync(join(runDir, 'moments.json'), JSON.stringify(result, null, 2));
writeReport(runDir);

// What the agent reads: short, one line per moment.
console.log(`RUN ${runDir}`);
console.log(`REPORT ${join(runDir, 'report.html')}`);
for (const m of result.moments) {
  const flags = [m.signals.cutscene ? 'black bars: maybe a cutscene' : '', m.signals.spikeDb >= 12 ? `+${m.signals.spikeDb} dB spike` : '']
    .filter(Boolean).join(', ');
  console.log(`${m.id}  score ${m.score.toFixed(2)}  ${m.name}  ${clock(m.start)}–${clock(m.end)} (peak ${clock(m.peak)})  ${m.sheet}${flags ? '  [' + flags + ']' : ''}`);
}

// ---------------------------------------------------------------------------------------------------------------

/** Loudness every 0.1 s (RMS dBFS of a mono mix). */
async function analyseAudio(file) {
  const out = [];
  let t = 0;
  await run([
    '-i', file, '-vn',
    '-af', 'aresample=48000,aformat=channel_layouts=mono,asetnsamples=n=4800:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '-',
  ], {
    onStdoutLine(line) {
      if (line.startsWith('frame:')) { const m = line.match(/pts_time:([\d.]+)/); if (m) t = +m[1]; }
      else if (line.startsWith('lavfi.astats.Overall.RMS_level=')) {
        const v = line.split('=')[1];
        out.push({ t, db: v.includes('inf') ? -90 : Math.max(-90, +v) });
      }
    },
  });
  return out;
}

/** Five frames a second: how much the picture changes (scene score) and whether it has black bars or is black. */
async function analyseVideo(file) {
  const graph = "fps=5,scale=256:144:force_original_aspect_ratio=disable,cropdetect=limit=0.1:round=2:reset=1,select='gte(scene\\,0)',metadata=print:file=-";
  const attempt = async (hw) => {
    const out = [];
    let cur = null;
    await run([...(hw ? ['-hwaccel', 'auto'] : []), '-i', file, '-an', '-vf', graph, '-f', 'null', '-'], {
      onStdoutLine(line) {
        if (line.startsWith('frame:')) {
          const m = line.match(/pts_time:([\d.]+)/);
          cur = { t: m ? +m[1] : 0 };
          out.push(cur);
        } else if (cur && line.startsWith('lavfi.')) {
          const [k, v] = line.split('=');
          cur[k.slice(k.lastIndexOf('.') + 1)] = +v;
        }
      },
    });
    return out;
  };
  try { return await attempt(true); } catch { return attempt(false); }
}

/** One score per half second: sudden loudness + loudness + motion, zeroed for black bars and black frames. */
function score(meta, audio, video) {
  const n = Math.max(1, Math.ceil(meta.duration / BIN));
  const bins = Array.from({ length: n }, (_, i) => ({ t: i * BIN, db: -90, motion: 0, letterbox: 0, black: 0, frames: 0 }));
  for (const a of audio) {
    const b = bins[Math.min(n - 1, Math.floor(a.t / BIN))];
    b.db = Math.max(b.db, a.db);
  }
  const W = 256;
  const H = 144;
  for (const v of video) {
    const b = bins[Math.min(n - 1, Math.floor(v.t / BIN))];
    b.frames++;
    b.motion += v.scene_score ?? 0;
    const y1 = v.y1 ?? 0;
    const y2 = v.y2 ?? H - 1;
    const h = y2 - y1 + 1;
    // Black, or a small card on black (menus, loading and results screens).
    if (h < H * 0.2 || (v.w ?? W) < W * 0.2 || h * (v.w ?? W) < H * W * 0.3) { b.black++; continue; }
    const top = y1;
    const bottom = H - 1 - y2;
    const fullWidth = (v.x1 ?? 0) <= W * 0.03 && (v.x2 ?? W - 1) >= W * 0.97;
    if (fullWidth && top >= H * 0.07 && bottom >= H * 0.07 && Math.abs(top - bottom) <= H * 0.035) b.letterbox++;
  }
  for (const b of bins) {
    if (b.frames) { b.motion /= b.frames; b.letterbox /= b.frames; b.black /= b.frames; }
  }
  const loudR = rank(bins.map((b) => b.db));
  const motionR = rank(bins.map((b) => b.motion));
  const raw = bins.map((b, i) => {
    const before = bins.slice(Math.max(0, i - 4), i).map((x) => x.db);
    const base = before.length ? median(before) : b.db;
    b.spike = Math.max(0, b.db - base);
    const rise = Math.min(1, b.spike / 15);
    const s = meta.audio ? 0.45 * rise + 0.3 * loudR[i] + 0.25 * motionR[i] : motionR[i];
    return s * (1 - b.letterbox * 0.85) * (1 - b.black);
  });
  return bins.map((b, i) => ({
    ...b,
    score: 0.25 * (raw[i - 1] ?? raw[i]) + 0.5 * raw[i] + 0.25 * (raw[i + 1] ?? raw[i]),
  }));
}

/** The best non-overlapping peaks in one file, each turned into a window that starts before the action. */
function peaks(curve, meta, file) {
  const max = Math.max(...curve.map((c) => c.score));
  const order = curve.map((c, i) => i).sort((a, b) => curve[b].score - curve[a].score);
  const taken = [];
  for (const i of order) {
    if (curve[i].score < Math.max(0.3, max * 0.45)) break;
    const t = curve[i].t + BIN / 2;
    if (taken.some((p) => Math.abs(p - t) < opt.gap)) continue;
    taken.push(t);
    if (taken.length >= Math.max(6, Math.ceil(meta.duration / 60))) break; // a short capture: up to 6; a long recording: about one a minute
  }
  return taken.map((peak) => {
    let start = peak - opt.pre;
    let end = peak + opt.post;
    if (start < 0) { end = Math.min(meta.duration, end - start); start = 0; }
    if (end > meta.duration) { start = Math.max(0, start - (end - meta.duration)); end = meta.duration; }
    const inside = curve.filter((c) => c.t >= start && c.t < end);
    const at = curve[Math.min(curve.length - 1, Math.floor(peak / BIN))];
    const lb = inside.reduce((s, c) => s + c.letterbox, 0) / Math.max(1, inside.length);
    return {
      file,
      name: basename(file),
      peak: +peak.toFixed(2),
      start: +start.toFixed(2),
      end: +end.toFixed(2),
      score: +at.score.toFixed(3),
      signals: {
        loudestDb: +Math.max(...inside.map((c) => c.db)).toFixed(1),
        spikeDb: +Math.max(...inside.map((c) => c.spike ?? 0)).toFixed(1),
        motion: +(inside.reduce((s, c) => s + c.motion, 0) / Math.max(1, inside.length)).toFixed(3),
        cutscene: lb > 0.5,
        audio: meta.audio,
      },
    };
  });
}

function rank(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length - 1 || 1;
  return values.map((v) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
    return lo / n;
  });
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

function clock(s) {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function log(s) { process.stderr.write(s + '\n'); }

function readHelp() {
  return 'Usage: node bin/scan.mjs [files or folders…] [--since HOURS] [--top N] [--pre S] [--post S] [--gap S] [--out DIR]';
}
