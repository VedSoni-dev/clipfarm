# Clipfarm

**Your console clips, turned into Reels and Shorts by Claude or ChatGPT.** Clipfarm finds the best moments in your
Xbox, PS5 or PC gameplay recordings, edits them into vertical clips (slow push-in, then a punch-in, a flash and
half speed on the payoff, with a hook on a white card), and can post them to Instagram and YouTube through your own
signed-in browser. It was made for GTA 6 and works with any game.

It's a plugin for **Claude Code** (including the Code tab in the Claude desktop app) and **Codex**, so it runs on your
Claude or ChatGPT plan, on your own computer. Your footage never leaves it until you post.

> Not affiliated with Rockstar Games or Take-Two Interactive. Grand Theft Auto is their trademark.

## Install

**Claude** (Claude Code, or the Code tab in the Claude desktop app):
```
/plugin marketplace add VedSoni-dev/clipfarm
/plugin install clipfarm@clipfarm
```

**ChatGPT** (Codex):
```bash
codex plugin marketplace add VedSoni-dev/clipfarm
```
Then install **Clipfarm** from the Plugins Directory in the ChatGPT desktop app. (The Codex side follows OpenAI's
plugin format but hasn't been tested yet; if something breaks, open an issue.)

The first run installs the editor (Remotion and ffmpeg) and, on the first render, a headless Chrome (about 140 MB). Node 20 or newer.

## Use it
First, once:
```
Use clipfarm to connect my Xbox
```
(or "connect my PS5"). It checks this computer, walks you through the console settings, then waits while you save a
clip and tells you when it lands. After that:
```
Use clipfarm: find the 3 best moments in today's GTA clips and make them into reels.
```
It pulls in your new clips, scans them, looks at each moment, writes the edit, renders, checks its own frames and
opens a report with the finished clips and their captions. Then, if you want:
```
post clip 1 to my Instagram and YouTube. Show me before you press Share.
```

## How clips get from your console to your computer
| | Set up once | Then |
|---|---|---|
| **Xbox Series X\|S** | OneDrive app on your computer, and on the Xbox: Settings → Preferences → Capture & share → upload to OneDrive. Record at 1080p SDR (4K/HDR clips don't auto-upload). | Automatic. Every clip you save lands in OneDrive's `Videos` folder and Clipfarm pulls it in. |
| **PS5** | Settings → Captures and Broadcasts → Captures → Auto-Upload, with the console linked to the PlayStation App. | One tap: download the clip in the PlayStation App. With iCloud Photos on a Mac it arrives by itself; otherwise AirDrop it, or use Google Drive. Clipfarm pulls it in. |
| **Either** | Nothing. | Copy clips to a USB drive (PS5: Media Gallery → Copy to USB) and plug it in. |
| **PC** | Any recorder (Xbox Game Bar, OBS, NVIDIA). | Point Clipfarm at the folder (Game Bar's is found automatically on Windows). |

`node skills/clipfarm/engine/bin/clips.mjs` shows what's connected. Only landscape 16:9 game-size videos are picked
up, so your personal videos stay where they are, and clips are copied, never moved. Sony only sends PS5 clips to
your phone, which is why the PS5 needs that one tap.

Save the moment right after it happens: Xbox button then X on Xbox, Create → Save Recent Gameplay on PS5.

## How it works
1. **Pull in and listen** (`engine/bin/clips.mjs`, `engine/bin/scan.mjs`). New clips are copied in from OneDrive,
   your phone's transfers and USB drives. Then ffmpeg scores every half second of every video: sudden loudness
   (crashes, gunfire, explosions, you yelling), overall loudness and how much the picture changes. Black-bar
   stretches (cutscenes) and black frames are dropped. The best peaks become moments, each with a grid of 8 frames.
2. **Judge** (the AI). Claude or ChatGPT looks at every grid: real action that's readable on a phone, no menus, no
   cutscenes, no story spoilers. It picks the best ones and writes `edit.json`: in and out points, the exact
   payoff second, where the action is, a hook and a caption. The hooks follow what the most-watched real GTA clips
   do: a joke setup on top, the clip as the punchline ([what works](skills/clipfarm/WHAT-WORKS.md)).
3. **Edit** (`engine/bin/render.mjs`, Remotion). 1080×1920 at 30 fps. Then it checks three frames of every clip
   and fixes the crop or timing before you see it.
4. **Post** (optional, `skills/clipfarm/POSTING.md`). Claude in Chrome uploads to Instagram and YouTube Studio in
   your own browser and stops before the final button. No API keys and no developer accounts. Instagram's and
   YouTube's posting APIs need app reviews that a personal tool can't get.

Everything lands in `~/Movies/Clipfarm` (`~/Videos/Clipfarm` on Windows): `inbox/` for clips you drop in,
`runs/<date>/` for each run's report, frame grids and finished clips.

## Before you post
- Rockstar's policy allows non-commercial fan videos that don't spoil the story, and takes down isolated
  cutscenes. It doesn't cover making money from the footage. Clipfarm skips cutscenes and keeps hooks spoiler-free.
- Songs on the in-game radio aren't licensed for your uploads: Instagram may mute them and YouTube may claim them.
  Clipfarm can turn the game audio down under a track of your own.

## Credits
Built with [Remotion](https://www.remotion.dev) (free for individuals and companies of up to 3 people; larger
companies need a [Remotion licence](https://www.remotion.dev/license)) and [ffmpeg](https://ffmpeg.org).
Made by [@vedanttalksai](https://instagram.com/vedanttalksai). MIT licence.
