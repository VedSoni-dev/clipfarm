#!/usr/bin/env node
// clipfarm clips: get console clips onto this computer and into the Clipfarm inbox.
//
//   node bin/clips.mjs                       what's connected, and what's new (default: the last 72 h)
//   node bin/clips.mjs --pull [--since 72]   copy new game clips from every connected source into the inbox
//   node bin/clips.mjs --wait [--timeout 900] wait for the next clip to arrive anywhere, then pull it
//   node bin/clips.mjs --use photos,downloads switch on sources that need a yes (phone transfers)
//   node bin/clips.mjs --off onedrive         switch a source off
//
// Sources: Xbox → OneDrive, USB drives (PS5 "Copy to USB"), PC Game Bar captures, and from a phone (PlayStation
// or Xbox app → saved to the phone): iCloud Photos, AirDrop/Downloads, Google Drive. Only landscape 16:9 videos of
// 720p or more count as game clips; everything else is left alone.
import { join } from 'node:path';
import { workspace } from '../lib/ff.mjs';
import { enabled, listSources, photosVideos, pull, recentFiles, saveSettings, settings } from '../lib/sources.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const tilde = (p) => p.replace(process.env.HOME || '~', '~');
const inbox = join(workspace(), 'inbox');
const log = (s) => process.stderr.write(s + '\n');

if (flag('-h') || flag('--help')) {
  console.log('Usage: node bin/clips.mjs [--pull] [--wait] [--since HOURS] [--timeout SECONDS] [--use ids] [--off ids]\nSource ids: onedrive, usb, pc, photos, downloads, gdrive');
  process.exit(0);
}

const ids = new Set(listSources().map((s) => s.id));
const list = (f) => (val(f, '') || '').split(',').map((x) => x.trim()).filter(Boolean);
for (const id of [...list('--use'), ...list('--off')]) if (!ids.has(id)) { log(`Unknown source "${id}". Use: ${[...ids].join(', ')}`); process.exit(1); }
if (list('--use').length || list('--off').length) {
  const s = settings();
  const use = new Set(s.use);
  const off = new Set(s.off ?? []);
  for (const id of list('--use')) { use.add(id); off.delete(id); }
  for (const id of list('--off')) { use.delete(id); off.add(id); }
  saveSettings({ use: [...use], off: [...off] });
}

const sinceHours = +val('--since', 72);

if (flag('--wait')) {
  const timeout = +val('--timeout', 900) * 1000;
  const start = Date.now() - 5 * 60e3;
  const deadline = Date.now() + timeout;
  const on = listSources().filter((s) => enabled(s) && s.found.length);
  if (!on.length) { log('No sources are connected. Run without --wait to see what to set up.'); process.exit(2); }
  log(`Waiting for a new clip (${on.map((s) => s.label).join(', ')})… capture one now. Xbox uploads can take a few minutes.`);
  const sizes = new Map();
  let lastPhotos = 0;
  while (Date.now() < deadline) {
    let ready = false;
    for (const s of on) {
      if (s.photosApp) {
        if (Date.now() - lastPhotos > 15_000) { lastPhotos = Date.now(); try { if (photosVideos(start).length) ready = true; } catch (e) { log(e.message); process.exit(1); } }
        continue;
      }
      for (const dir of s.found) for (const f of recentFiles(dir, start)) {
        const prev = sizes.get(f.path);
        sizes.set(f.path, f.size);
        if (prev === f.size) ready = true; // same size twice in a row: the upload or copy has finished
      }
    }
    if (ready) {
      const got = pull({ sinceHours: (Date.now() - start) / 3600e3 + 0.05, log });
      if (got.length) {
        for (const g of got) console.log(`NEW ${g.to}`);
        console.log(`INBOX ${inbox}`);
        process.exit(0);
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  log(`Nothing new arrived in ${Math.round(timeout / 60000)} min.`);
  process.exit(3);
}

if (flag('--pull')) {
  log(`Pulling new clips from the last ${sinceHours} h into ${tilde(inbox)}`);
  let got = [];
  try { got = pull({ sinceHours, log }); } catch (e) { log(e.message); process.exit(1); }
  for (const g of got) console.log(`NEW ${g.to}`);
  if (!got.length) log('  nothing new');
  console.log(`INBOX ${inbox}`);
  process.exit(0);
}

// Status.
const s = settings();
const since = Date.now() - sinceHours * 3600e3;
let inboxCount = 0;
inboxCount = recentFiles(inbox, 0).length;
console.log(`Inbox: ${tilde(inbox)} (${inboxCount} video${inboxCount === 1 ? '' : 's'})\n`);
for (const src of listSources()) {
  if (src.id === 'pc' && !src.paths.length) continue;
  const on = enabled(src, s);
  const mark = !src.found.length ? '✗' : on ? '✓' : '·';
  let detail;
  if (!src.found.length) detail = src.missing;
  else if (!on) detail = `found, off (switch on: --use ${src.id})`;
  else if (src.photosApp) detail = 'on (checked when you pull; macOS asks once to allow Photos)';
  else {
    const n = src.found.reduce((k, d) => k + recentFiles(d, since).length, 0);
    detail = `${src.found.map(tilde).join(', ')} · ${n} video${n === 1 ? '' : 's'} in the last ${sinceHours} h`;
  }
  console.log(`  ${mark} ${src.label.padEnd(26)} ${detail}`);
}
console.log('\n✓ connected  · found but off  ✗ not set up on this computer');
