#!/usr/bin/env node
// clipfarm frames: a close-up grid of 8 frames between two times, to pin down the exact payoff second.
//
//   node bin/frames.mjs <run folder> <moment id or video file> <from seconds> <to seconds>
//
// Writes <run>/sheets/fine-<id>-<from>-<to>.jpg (left→right, top→bottom) and prints the 8 frame times.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { run } from '../lib/ff.mjs';

const [runArg, target, fromArg, toArg] = process.argv.slice(2);
if (!runArg || !target || fromArg === undefined || toArg === undefined) {
  console.error('Usage: node bin/frames.mjs <run folder> <moment id or video file> <from seconds> <to seconds>');
  process.exit(1);
}
const runDir = resolve(runArg);
let file = target;
let id = basename(target).replace(/\.[^.]+$/, '');
if (!existsSync(target)) {
  const moments = JSON.parse(readFileSync(join(runDir, 'moments.json'), 'utf8'));
  const m = moments.moments.find((x) => x.id === target);
  if (!m) { console.error(`No moment "${target}" in ${join(runDir, 'moments.json')}`); process.exit(1); }
  file = m.file;
  id = m.id;
}
const from = Math.max(0, +fromArg);
const to = Math.max(from + 0.2, +toArg);
const step = (to - from) / 8;
const times = Array.from({ length: 8 }, (_, k) => +(from + step / 2 + k * step).toFixed(2));
mkdirSync(join(runDir, 'sheets'), { recursive: true });
const out = join(runDir, 'sheets', `fine-${id}-${from.toFixed(1)}-${to.toFixed(1)}.jpg`);
await run([
  '-ss', times[0].toFixed(3), '-t', (to - times[0]).toFixed(3), '-i', file, '-an',
  '-vf', `select='gte(t,selected_n*${step.toFixed(5)}-0.004)',scale=384:216:force_original_aspect_ratio=decrease,pad=384:216:(ow-iw)/2:(oh-ih)/2:color=black,tile=4x2:margin=6:padding=6:color=0x111111`,
  '-frames:v', '1', '-q:v', '3', out,
]);
console.log(`SHEET ${out}`);
console.log(`TIMES ${times.join(' ')}`);
