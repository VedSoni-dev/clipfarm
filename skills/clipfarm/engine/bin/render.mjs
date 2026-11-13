#!/usr/bin/env node
// clipfarm render: turn the picks in <run>/edit.json into finished vertical clips (1080×1920, 30 fps, H.264).
//
//   node bin/render.mjs <run folder> [--only m3]
//
// Writes <run>/out/<n>-<hook>.mp4, a caption .txt next to each, out/manifest.json, a check image per clip
// (out/checks/<n>.jpg: three frames side by side) and refreshes <run>/report.html.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe, run } from '../lib/ff.mjs';
import { writeReport } from '../lib/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const runDir = resolve(argv.find((a) => !a.startsWith('--')) ?? '.');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

const moments = readJson(join(runDir, 'moments.json'), 'moments.json (run bin/scan.mjs first)');
const edit = readJson(join(runDir, 'edit.json'), 'edit.json (write your picks first; see SKILL.md)');
const byId = new Map(moments.moments.map((m) => [m.id, m]));
const media = join(runDir, 'media');
const outDir = join(runDir, 'out');
mkdirSync(media, { recursive: true });
mkdirSync(join(outDir, 'checks'), { recursive: true });

// 1. Validate the picks and trim each one out of its source (re-encoded, so the cut is frame-exact).
const jobs = [];
for (const [i, c] of (edit.clips ?? []).entries()) {
  if (only && c.id !== only) continue;
  const m = byId.get(c.id);
  const file = c.file ?? m?.file;
  if (!file || !existsSync(file)) fail(`clip ${i + 1}: no source file (id "${c.id}" isn't in moments.json and no "file" given)`);
  const meta = probe(file);
  const tin = Math.max(0, num(c.in, m?.start ?? 0));
  const tout = Math.min(meta.duration, num(c.out, m?.end ?? tin + 9));
  if (tout - tin < 2) fail(`clip ${i + 1} (${c.id}): in/out leave less than 2 s`);
  if (tout - tin > 60) fail(`clip ${i + 1} (${c.id}): longer than 60 s; keep clips short (7–15 s is the sweet spot)`);
  const impact = c.impact == null ? null : num(c.impact, null);
  jobs.push({
    n: i + 1,
    id: c.id ?? `clip${i + 1}`,
    file,
    meta,
    tin,
    tout,
    impact: impact != null && impact > tin && impact < tout ? impact - tin : null,
    c,
  });
}
if (!jobs.length) fail('edit.json has no clips to render');

log(`Clipfarm: trimming ${jobs.length} clip${jobs.length > 1 ? 's' : ''}…`);
for (const j of jobs) {
  j.src = `${j.n}-${j.id}.mp4`;
  await run([
    '-ss', j.tin.toFixed(3), '-i', j.file, '-t', (j.tout - j.tin).toFixed(3),
    '-vf', "scale='min(1920,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p',
    ...(j.meta.audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-movflags', '+faststart', join(media, j.src),
  ]);
}

let music = null;
if (edit.audio?.music) {
  const m = resolve(edit.audio.music);
  if (!existsSync(m)) fail(`audio.music not found: ${m}`);
  music = `music${extname(m)}`;
  copyFileSync(m, join(media, music));
}

// 2. Bundle the Remotion project once, then render every clip.
log('Bundling the editor…');
const { bundle } = await import('@remotion/bundler');
const { renderMedia, selectComposition } = await import('@remotion/renderer');
const serveUrl = await bundle({ entryPoint: join(here, '..', 'remotion', 'index.ts'), publicDir: media });

const manifest = existsSync(join(outDir, 'manifest.json')) ? JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) : { clips: [] };
for (const j of jobs) {
  const inputProps = {
    src: j.src,
    duration: j.tout - j.tin,
    aspect: j.meta.width / j.meta.height,
    impact: j.impact,
    slowmo: j.c.slowmo !== false && j.impact != null,
    focusX: clamp01(num(j.c.focusX, 0.5)),
    layout: j.c.layout === 'fill' ? 'fill' : 'frame',
    hook: String(j.c.hook ?? '').trim() || 'Wait for it',
    sub: j.c.sub ?? null,
    gameVolume: num(edit.audio?.game, 1),
    music,
    musicVolume: num(edit.audio?.musicVolume, 0.5),
    accent: edit.accent ?? '#ff4f8b',
  };
  const name = `${j.n}-${slug(inputProps.hook)}.mp4`;
  const output = join(outDir, name);
  const composition = await selectComposition({ serveUrl, id: 'Clip', inputProps });
  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 18,
    audioCodec: 'aac',
    outputLocation: output,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) { last = pct; log(`  ${name}: ${pct}%`); }
    },
  });

  // A check image: just after the hook lands, the payoff, and near the end.
  const seconds = composition.durationInFrames / composition.fps;
  const hitAt = j.impact != null ? Math.min(seconds - 0.3, framesToImpact(inputProps) / 30 + 0.15) : seconds / 2;
  const checks = [0.7, hitAt, Math.max(0.8, seconds - 0.6)];
  await run([
    ...checks.flatMap((t) => ['-ss', t.toFixed(2), '-i', output]),
    '-filter_complex', `${checks.map((_, k) => `[${k}:v]scale=360:640,trim=end_frame=1[v${k}]`).join(';')};${checks.map((_, k) => `[v${k}]`).join('')}hstack=inputs=3`,
    '-frames:v', '1', '-q:v', '3', join(outDir, 'checks', `${j.n}.jpg`),
  ]);

  const caption = String(j.c.caption ?? '').trim();
  const oneLine = inputProps.hook.replace(/\s*\n\s*/g, ' / ');
  const title = String(j.c.title ?? '').trim() || oneLine;
  const hashtags = (j.c.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`));
  writeFileSync(output.replace(/\.mp4$/, '.txt'), [`Title: ${title}`, caption, hashtags.join(' ')].filter(Boolean).join('\n\n') + '\n');
  manifest.clips = manifest.clips.filter((x) => x.id !== j.id);
  manifest.clips.push({ n: j.n, id: j.id, video: `out/${name}`, path: output, hook: oneLine, title, caption, hashtags, seconds: +seconds.toFixed(2), check: `out/checks/${j.n}.jpg` });
}
manifest.clips.sort((a, b) => a.n - b.n);
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeReport(runDir);

console.log(`REPORT ${join(runDir, 'report.html')}`);
for (const c of manifest.clips) console.log(`OUT ${c.path}  ${c.seconds} s  "${c.hook}"  check: ${join(runDir, c.check)}`);

// ---------------------------------------------------------------------------------------------------------------

function framesToImpact(p) {
  // Same maths as remotion/timeline.ts: the slow segment starts 0.35 s before the payoff at half speed.
  if (p.impact == null) return 0;
  if (!p.slowmo) return p.impact * 30;
  const a = Math.max(0, p.impact - 0.35);
  return a * 30 + ((p.impact - a) / 0.5) * 30;
}

function readJson(p, what) {
  if (!existsSync(p)) fail(`missing ${what}: ${p}`);
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { fail(`${basename(p)} isn't valid JSON: ${e.message}`); }
}
function num(v, d) { const n = Number(v); return v === undefined || v === null || v === '' || Number.isNaN(n) ? d : n; }
function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'clip'; }
function log(s) { process.stderr.write(s + '\n'); }
function fail(msg) { console.error(`clipfarm render: ${msg}`); process.exit(1); }
