// report.html: the moment map. Every scanned video as a timeline, every moment as a frame grid, and (after a render)
// the finished vertical clips with their captions. Self-contained apart from the run folder's own images and videos.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clock = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

export function writeReport(runDir) {
  const moments = readJson(join(runDir, 'moments.json'));
  if (!moments) return;
  const edit = readJson(join(runDir, 'edit.json'));
  const outputs = readJson(join(runDir, 'out', 'manifest.json'))?.clips ?? [];
  const picked = new Map((edit?.clips ?? []).map((c, i) => [c.id, { ...c, rank: i + 1 }]));

  const totalSec = moments.files.reduce((s, f) => s + f.duration, 0);
  const stats = [
    [moments.files.length, moments.files.length === 1 ? 'video' : 'videos'],
    [clock(totalSec), 'of footage'],
    [moments.moments.length, 'moments'],
    ...(picked.size ? [[picked.size, 'picked']] : []),
  ];

  const timelines = moments.files.map((f) => {
    const W = 1000;
    const H = 120;
    const n = f.curve.length;
    const x = (i) => (i / Math.max(1, n - 1)) * W;
    const y = (v) => H - 8 - v * (H - 22);
    // Long recordings have thousands of points: draw the loudest of each group so the spikes stay readable.
    const step = Math.max(1, Math.ceil(n / 400));
    const pts = [];
    for (let i = 0; i < n; i += step) pts.push([Math.min(n - 1, i + step / 2), Math.max(...f.curve.slice(i, i + step))]);
    const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${W},${H}L0,${H}Z`;
    const bars = [];
    let s = -1;
    f.cutscene.forEach((c, i) => {
      if (c && s < 0) s = i;
      if ((!c || i === n - 1) && s >= 0) { bars.push([s, c ? i : i - 1]); s = -1; }
    });
    const ms = moments.moments.filter((m) => m.file === f.path);
    const marks = ms.map((m) => {
      const px = (m.peak / f.duration) * W;
      const v = pts[Math.floor(Math.min(n - 1, Math.floor(m.peak / f.bin)) / step)]?.[1] ?? 0;
      const on = picked.has(m.id);
      const x0 = (m.start / f.duration) * W;
      const x1 = (m.end / f.duration) * W;
      return `<rect x="${x0.toFixed(1)}" y="0" width="${(x1 - x0).toFixed(1)}" height="${H}" class="win${on ? ' on' : ''}"/>
        <circle cx="${px.toFixed(1)}" cy="${y(v).toFixed(1)}" r="${on ? 7 : 5}" class="dot${on ? ' on' : ''}"/>
        <text x="${px.toFixed(1)}" y="${Math.max(12, y(v) - 12).toFixed(1)}" class="lbl${on ? ' on' : ''}">${esc(m.id)}</text>`;
    }).join('');
    return `<section class="file">
      <div class="file-head"><span class="fname">${esc(f.name)}</span><span class="muted">${clock(f.duration)} · ${f.width}×${f.height} · ${Math.round(f.fps)} fps${f.audio ? '' : ' · no audio'}</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="tl" role="img" aria-label="Moment score over time for ${esc(f.name)}">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".55"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" fill="#ffffff22"/></pattern></defs>
        ${bars.map(([a, b]) => `<rect x="${x(a).toFixed(1)}" y="0" width="${Math.max(2, x(b) - x(a)).toFixed(1)}" height="${H}" fill="url(#hatch)"/>`).join('')}
        <path d="${area}" fill="url(#g)"/><path d="${line}" class="curve"/>
        ${marks}
      </svg>
      <div class="axis"><span>0:00</span><span>${clock(f.duration)}</span></div>
    </section>`;
  }).join('');

  const cards = moments.moments.map((m) => {
    const p = picked.get(m.id);
    const chips = [
      m.signals.spikeDb >= 6 ? `+${m.signals.spikeDb} dB spike` : '',
      m.signals.audio ? `${m.signals.loudestDb} dB peak` : 'no audio',
      m.signals.cutscene ? 'black bars' : '',
    ].filter(Boolean);
    return `<article class="card${p ? ' picked' : ''}">
      <div class="sheet"><img src="${esc(m.sheet)}" alt="Eight frames from ${esc(m.name)} between ${clock(m.start)} and ${clock(m.end)}" loading="lazy"/>${p ? `<span class="badge">Pick ${p.rank}</span>` : ''}</div>
      <div class="meta">
        <div class="row"><b>${esc(m.id)}</b><span class="muted">${esc(m.name)} · ${clock(m.start)}–${clock(m.end)}</span></div>
        <div class="bar"><i style="width:${Math.round(m.score * 100)}%"></i></div>
        <div class="chips">${chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        ${p?.hook ? `<p class="hook">“${esc(p.hook)}”</p>` : ''}
      </div>
    </article>`;
  }).join('');

  const clips = outputs.length ? `<section class="clips"><h2>Your clips</h2><div class="clip-row">${outputs.map((c, i) => `
      <figure class="clip"><video src="${esc(c.video)}" controls playsinline loop muted ${i === 0 ? 'autoplay' : ''} preload="metadata"></video>
      <figcaption><b>${esc(c.hook)}</b><span class="muted">${(c.seconds ?? 0).toFixed(1)} s · ${esc(c.video)}</span>
      ${c.caption || c.hashtags?.length ? `<textarea readonly rows="3" aria-label="Caption for clip ${i + 1}">${esc([c.caption, (c.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n'))}</textarea>` : ''}</figcaption></figure>`).join('')}
    </div></section>` : '';

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clipfarm run</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
:root{--bg:#0b0b0d;--panel:#141418;--line:#25252c;--text:#f3f3f5;--muted:#9a9aa6;--accent:#ff4f8b;--accent2:#ffb347}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:500 15px/1.45 "Inter Tight",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1180px;margin:0 auto;padding:40px 24px 80px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;margin-bottom:28px}
.brand{font-weight:800;font-size:28px;letter-spacing:-.02em}.brand i{font-style:normal;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;color:transparent}
.stats{display:flex;gap:28px}.stats div{display:flex;flex-direction:column}.stats b{font-size:26px;font-weight:800;letter-spacing:-.02em}.stats span,.muted{color:var(--muted);font-size:13px}
h2{font-size:15px;font-weight:600;color:var(--muted);margin:36px 0 14px;letter-spacing:.01em}
.file{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px 10px;margin-bottom:12px;animation:rise .5s cubic-bezier(.22,1,.36,1) both}
.file-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px}.fname{font-weight:600}
.tl{width:100%;height:120px;display:block;overflow:visible}.curve{fill:none;stroke:var(--accent);stroke-width:2;vector-effect:non-scaling-stroke}
.win{fill:#ffffff08}.win.on{fill:#ff4f8b1f}.dot{fill:var(--bg);stroke:var(--text);stroke-width:2;vector-effect:non-scaling-stroke}.dot.on{fill:var(--accent);stroke:#fff}
.lbl{fill:var(--muted);font:600 11px "JetBrains Mono",monospace;text-anchor:middle}.lbl.on{fill:#fff}
.axis{display:flex;justify-content:space-between;color:var(--muted);font:500 11px "JetBrains Mono",monospace;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;animation:rise .5s cubic-bezier(.22,1,.36,1) both;transition:transform .18s cubic-bezier(.22,1,.36,1),border-color .18s}
.card:hover{transform:translateY(-2px)}.card.picked{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent),0 18px 40px -18px #ff4f8b66}
.sheet{position:relative;background:#000}.sheet img{width:100%;display:block}
.badge{position:absolute;top:10px;left:10px;background:var(--accent);color:#fff;font-weight:800;font-size:12px;padding:4px 10px;border-radius:999px}
.meta{padding:12px 14px 14px}.row{display:flex;gap:10px;align-items:baseline;margin-bottom:8px}.row b{font-family:"JetBrains Mono",monospace}
.bar{height:6px;border-radius:6px;background:var(--line);overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.chips span{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:2px 9px}
.hook{margin:10px 0 0;font-weight:600}
.clip-row{display:flex;gap:16px;overflow-x:auto;padding-bottom:6px}
.clip{margin:0;flex:0 0 260px;background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.clip video{width:100%;aspect-ratio:9/16;display:block;background:#000}.clip figcaption{padding:12px;display:flex;flex-direction:column;gap:6px}
.clip textarea{width:100%;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px;font:500 12px/1.4 "Inter Tight",sans-serif;resize:vertical}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media (max-width:600px){main{padding:24px 16px 60px}.stats{gap:18px}.grid{grid-template-columns:1fr}}
</style></head><body><main>
<header><div class="brand"><i>Clipfarm</i> run</div><div class="stats">${stats.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div></header>
${clips}
<h2>Where the action is</h2>${timelines}
<h2>Moments, best first</h2><div class="grid">${cards}</div>
</main></body></html>`;
  writeFileSync(join(runDir, 'report.html'), html);
}
