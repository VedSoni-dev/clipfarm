---
name: clipfarm
description: Turns gameplay captures into vertical clips for Reels, Shorts and TikTok. Finds the best moments in Xbox, PS5 or PC recordings (made for GTA 6, works with any game), edits them with Remotion (slow push-in, punch-in and half speed on the payoff, a hook on a white card), and hands posting to Instagram and YouTube to Claude in Chrome. Use when someone wants to clip, edit or post gameplay ("find my best moments", "make clips from my GTA footage", "turn my captures into reels", "/clipfarm").
---

# Clipfarm

You find the moments, judge them with your own eyes, and write the edit. The engine does the listening, the cutting
and the rendering. `ENGINE` below means the `engine/` folder in this skill's base directory (the folder this
SKILL.md is in); use its absolute path in commands.

The whole flow, start to finish: install once → scan → look at the frame grids and pick → write `edit.json` →
render → read the check images and fix → show the user → post only if they ask.

## 0. First run (once)
Skip this if `ENGINE/node_modules` already exists.
```bash
cd ENGINE && npm install
```
That installs Remotion and a bundled ffmpeg (a system ffmpeg is used when there is one). The first render also
downloads a headless Chrome (about 140 MB, once). Remotion is free for individuals and companies of up to
3 people; bigger companies need a Remotion licence.

## 1. Get the clips onto this computer
The scan looks in the Clipfarm inbox (`~/Movies/Clipfarm/inbox` on a Mac, `~/Videos/Clipfarm/inbox` on Windows)
and in OneDrive's `Videos` folder. Only ask where the clips are if the scan finds nothing. If they ask how to set it up:

- **Xbox Series X|S:** Settings → Preferences → Capture & share → Automatic uploads → OneDrive. New clips go to
  OneDrive's `Videos` folder, which syncs to this computer. Record at 1080p SDR: 4K or HDR clips may not upload
  automatically. To capture: press the Xbox button, then X (saves the last 30 s; make it longer in Capture & share).
- **PS5:** link the console to the PlayStation App, then Settings → Captures and Broadcasts → Captures → Auto-Upload
  (Rest Mode needs "Stay connected to the internet"). In the PS App: Game Captures → select → Download (they're kept
  14 days). AirDrop, Nearby Share, iCloud or Google Photos them into the inbox, or copy them from the PS5's Media
  Gallery to a USB drive. To capture: Create button → Save Recent Gameplay.
- **PC:** point the scan at the capture folder (Xbox Game Bar saves to `~/Videos/Captures`; OBS and NVIDIA have their own).

## 2. Scan
```bash
node ENGINE/bin/scan.mjs [folder or files…] [--since 24] [--top 10]
```
Use `--since <hours>` on a big folder. Long recordings get more moments (about one a minute per file, and up
to 24 in all); `--top N` sets the number yourself. It prints `RUN <folder>`, then `REPORT <report.html>`, then one line per
moment, best first (`m1  score 0.82  file.mp4  0:41.3–0:50.3 (peak 0:47.3)  sheets/m1.jpg`). Below, `RUN` means
that folder. Each scan gets a new one in `~/Movies/Clipfarm/runs/<date_time>` (`~/Videos/Clipfarm` on Windows);
`--out <dir>` picks it yourself, and the `CLIPFARM_HOME` environment variable moves the whole Clipfarm folder.
Equal scores are normal when two moments are similarly loud. Peaks are always at least 8 s apart, but their windows can overlap.

How it scores, so you can explain it: every half second it measures sudden loudness (a crash, a shot, an explosion,
the player yelling), overall loudness, and how much the picture changes. Stretches with black bars (usually
cutscenes) and black frames score close to zero. A window opens 6 s before each peak and closes 3 s after it.

## 3. Look and pick (your job)
Read every `RUN/sheets/mN.jpg`. Each is 8 frames from the moment, left to right then top to bottom; their exact
times are in `RUN/moments.json` → `moments[].sheetTimes`. The signals are hints; your eyes decide.

Clips people watch to the end:
- **Cause and effect you can read in a second:** a crash, an explosion, a ragdoll, a jump that lands (or doesn't), a getaway.
- **A reversal or a near miss:** escaping at the last second, the cops getting wrecked, the plan going wrong.
- **Funny or strange:** NPC reactions, physics doing something absurd, a fail.
- **One subject, big enough on a phone.** Action that's tiny in a corner doesn't work vertically.
- **It fits an everyday joke.** The clips that travel are chaos you can caption as something ordinary: a shortcut,
  being late, a delivery, a parent's warning, finally losing the cops. If you can already hear the caption, pick it.

Skip:
- **Cutscenes**: no HUD or minimap, cinematic framing, black bars. Rockstar takes down isolated cutscenes, and they spoil the story.
- Menus, maps, the in-game phone, loading, pause and race-results screens.
- **Story spoilers**: mission endings, deaths of main characters, reveals. If you're unsure, leave it out or ask.
- Moments that are just loud (music, a menu sound) with nothing happening on screen.

Pick 3 unless the user asked for something else. If nothing is good, say so; don't dress up a dull clip.

**Pin the payoff to the tenth of a second** before writing `impact`. The grid's tiles are about a second apart, so
take a close-up of the 2 seconds around it (8 frames, a quarter second apart):
```bash
node ENGINE/bin/frames.mjs RUN m2 44.5 46.5
```
It prints `SHEET <jpg>` and the 8 frame `TIMES`. Read the sheet and use the time of the first frame where the hit,
the blast or the landing is visible. The sound usually lands with the hit, so the payoff is at the moment's `peak`
or a few tenths before it.

## 4. Write `RUN/edit.json`
```json
{
  "clips": [
    {
      "id": "m2",
      "in": 38.6,
      "out": 47.4,
      "impact": 45.1,
      "focusX": 0.55,
      "layout": "frame",
      "hook": "POV: you finally lost the cops 💀",
      "sub": "wait for it",
      "title": "They always come back 😭",
      "caption": "Lost a 5-star chase to a lamppost. What's the worst way you've been caught?",
      "hashtags": ["#GTA6", "#GTAVI", "#gaming", "#gta"]
    }
  ],
  "audio": { "game": 1 }
}
```
- `id`: the moment (`m1`…). Times are seconds in the **source file** (the same clock as `moments.json`).
- `in`: frame 0 must already be moving and loud. Start at most 2 s before the action, never on a calm stretch.
  `out`: 0.5–1.5 s after the payoff, so it ends on the hit and loops straight back to the start (no end card).
  6–20 s in total; the moment decides, and a short moment stays short. The finished clip runs about 1 s longer than
  `out − in` (the half-speed second). If the footage is shorter than that, use what's there (at least 3 s).
- `impact`: the exact second of the payoff (the hit, the blast, the landing). The edit pushes in slowly until then,
  then punches in with a flash and a short shake and plays one second at half speed. `"slowmo": false` keeps the
  punch-in at full speed; `"impact": null` turns the effects off (for a moment that's funny rather than loud).
- `focusX`: where the action is, from 0 (left) through 0.5 (centre) to 1 (right). `"frame"` shows about 76 % of the
  width in a window with a blurred fill; `"fill"` crops to the whole screen and shows about 32 %, so use it only
  when the action stays in one spot (first person, a close-up). Vertical sources always fill.
- `hook`: the caption on the white card, on screen the whole time. Write it as the **setup of a joke** and let the
  clip be the punchline: frame the chaos as something ordinary. Don't describe what happens. The formats behind
  most viral GTA clips (see `WHAT-WORKS.md`):
  - A quote, then who answers it. `\n` starts the second line: `"“Drive safe, it's a rental”\nMe:"`,
    `"“Five more minutes, I'm close”\nMe:"`.
  - `POV:` plus a moment: `"POV: you finally lost the cops 💀"`.
  - A label for what we're watching: `"Every Uber driver ever:"`.
  - Confidence the clip breaks: `"This will definitely work"`, `"He thought that was the end of it"`.
  Up to about 10 words, sentence case, at most one emoji at the end (💀 😭 😂), no spoilers, and the clip must pay
  it off. Write a new one every time; never reuse a caption you've seen on someone else's clip. Avoid all caps,
  "Part 1" and describing the clip ("Car flips off a cliff").
- `sub` (optional): "wait for it" when the payoff comes late. It leaves as the payoff lands.
- `title` (optional, the YouTube title): a second short joke, not the hook again. Up to 6 words plus one emoji:
  "Took the scenic route 😭", "Right on time 😂". Without it the title is the hook.
- `caption`: one line in the player's voice, then a question that invites people to add their own version of the
  joke (that's what the top comments on viral clips do). Say which game it is. `hashtags`: 3–5.
- `audio.game`: 1 by default. If a licensed song is clearly playing (the car radio), tell the user that Instagram
  may mute it and YouTube may claim it, and offer `"game": 0.3` with a track of their own in `"music"` (a file path),
  `"musicVolume": 0.5`.

## 5. Render and check
```bash
node ENGINE/bin/render.mjs RUN            # all clips
node ENGINE/bin/render.mjs RUN --only m2  # one clip again after a fix
```
It prints `OUT <mp4>` and a `check:` image per clip. **Read every check image** and fix before showing the user. Its
three frames are 0.7 s in, 0.15 s after the payoff (the punch-in, during the half-speed second) and 0.6 s before the
end.
- The middle frame shows the moment **before** the hit → `impact` is too early: move it later. It shows the
  aftermath → move it earlier. Re-check with `frames.mjs` if unsure.
- The action is cut off at the side → move `focusX` towards it (or use `"layout": "frame"`).
- The first frame is already mid-action, or the end drags → move `in` / `out`.

Then open `RUN/report.html` for them. It's a local file: `open <path>` on a Mac or `start <path>` on Windows shows it
in their default browser. The clips play there with their captions, over a map of where the action was. Tell them
the file paths too.

## 6. Post (only when they say so)
Posting is public and it's their account. Ask before each post and each platform, and never post anything they
haven't seen.
- **Claude in Chrome is available:** follow `POSTING.md` next to this file.
- **Otherwise:** open https://www.instagram.com and https://studio.youtube.com in their browser, tell them which
  file to drop in, and give them the caption to paste.

## Rights (say it once, briefly, the first time)
Rockstar allows non-commercial fan videos that don't spoil the story, and takes down isolated cutscenes; that policy
doesn't cover making money from the footage. Songs on the in-game radio aren't licensed for their uploads.
