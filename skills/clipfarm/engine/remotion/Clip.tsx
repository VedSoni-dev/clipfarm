// One vertical clip: the game in a framed window over a blurred copy of itself, a hook on a white card,
// a slow push-in that builds tension, then on the payoff a punch-in, a flash, a short shake and half-speed.
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/InterTight';
import { FPS, HEIGHT, WIDTH, plan, type ClipProps, type Segment } from './timeline';

const { fontFamily } = loadFont('normal', { weights: ['600', '800'], subsets: ['latin'] });
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const FRAME_H = 800; // the game window's height in the "frame" layout
const FRAME_TOP = Math.round((HEIGHT - FRAME_H) / 2);

/** The source, cut into its speed segments. */
const Footage: React.FC<{ p: ClipProps; segments: Segment[]; muted?: boolean; style: React.CSSProperties }> = ({ p, segments, muted, style }) => (
  <>
    {segments.map((s) => (
      <Sequence key={s.start} from={s.start} durationInFrames={s.len} layout="none">
        <OffthreadVideo
          src={staticFile(p.src)}
          trimBefore={Math.round(s.from * FPS)}
          playbackRate={s.rate}
          muted={muted}
          volume={muted ? 0 : p.gameVolume}
          style={style}
        />
      </Sequence>
    ))}
  </>
);

export const Clip: React.FC<ClipProps> = (p) => {
  const frame = useCurrentFrame();
  const { segments, total, impactFrame, slowEndFrame } = plan(p);
  const accent = p.accent || '#ff4f8b';
  const fill = p.layout === 'fill' || p.aspect < 1;

  // Camera: a slow push-in until the payoff, a springy punch-in on it, then settle back a little.
  const hit = impactFrame ?? -1;
  const pre = impactFrame != null ? interpolate(frame, [0, hit], [1, 1.035], clamp) : interpolate(frame, [0, total], [1, 1.06], clamp);
  const punch = impactFrame != null ? spring({ frame: frame - hit, fps: FPS, config: { damping: 13, stiffness: 190, mass: 0.7 } }) : 0;
  const settle = slowEndFrame != null ? interpolate(frame, [slowEndFrame, slowEndFrame + 14], [0, 1], { ...clamp, easing: easeOut }) : 0;
  const zoom = pre * (1 + 0.17 * punch - 0.11 * settle);
  const k = frame - hit;
  const shakeAmp = impactFrame != null && k >= 0 && k < 9 ? 11 * (1 - k / 9) : 0;
  const shakeX = Math.sin(k * 2.7) * shakeAmp;
  const shakeY = Math.cos(k * 3.3) * shakeAmp * 0.7;
  const flash = impactFrame != null && frame >= hit ? interpolate(frame, [hit, hit + 6], [0.5, 0], clamp) : 0;

  // The game picture, sized for the layout and panned so the action stays in frame.
  const boxH = fill ? HEIGHT : FRAME_H;
  const vidH = boxH;
  const vidW = Math.max(WIDTH, vidH * p.aspect);
  const left = -(vidW - WIDTH) * Math.min(1, Math.max(0, p.focusX));
  const videoStyle: React.CSSProperties = {
    position: 'absolute',
    height: vidH,
    width: vidW,
    left,
    top: 0,
    objectFit: 'cover',
    transform: `scale(${zoom})`,
    transformOrigin: `${(p.focusX * 100).toFixed(1)}% 50%`,
  };

  // Hook card: readable on frame 0 (it's the default cover), settles with a small overshoot, its text a beat later,
  // and it bumps once on the payoff.
  const inS = spring({ frame, fps: FPS, config: { damping: 12, stiffness: 170, mass: 0.8 } });
  const textIn = spring({ frame: frame - 2, fps: FPS, config: { damping: 16, stiffness: 160 } });
  const bump = impactFrame != null ? spring({ frame: frame - hit, fps: FPS, config: { damping: 9, stiffness: 260 } }) : 0;
  const bumpScale = 1 + 0.05 * Math.sin(Math.min(1, bump) * Math.PI) * (frame >= hit ? 1 : 0);
  const cardScale = interpolate(inS, [0, 1], [0.94, 1]) * bumpScale;

  const subOut = impactFrame != null ? interpolate(frame, [hit - 4, hit + 2], [1, 0], clamp) : 1;
  const subIn = interpolate(frame, [8, 16], [0, 1], { ...clamp, easing: easeOut });
  const progress = frame / Math.max(1, total - 1);

  return (
    <AbsoluteFill style={{ backgroundColor: '#050506', fontFamily }}>
      {/* Blurred fill behind the window. */}
      {!fill && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Footage
            p={p}
            segments={segments}
            muted
            style={{ position: 'absolute', inset: 0, width: WIDTH, height: HEIGHT, objectFit: 'cover', transform: 'scale(1.25)', filter: 'blur(42px) brightness(0.5) saturate(1.25)' }}
          />
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(5,5,6,.55) 0%, rgba(5,5,6,.1) 35%, rgba(5,5,6,.1) 65%, rgba(5,5,6,.6) 100%)' }} />
        </AbsoluteFill>
      )}

      {/* The game. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: fill ? 0 : FRAME_TOP,
          width: WIDTH,
          height: boxH,
          overflow: 'hidden',
          borderRadius: fill ? 0 : 30,
          boxShadow: fill ? undefined : '0 40px 90px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.08)',
          transform: `translate(${shakeX}px, ${shakeY}px)`,
        }}
      >
        <Footage p={p} segments={segments} style={videoStyle} />
        <AbsoluteFill style={{ backgroundColor: '#fff', opacity: flash }} />
        {!fill && (
          <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: `${progress * 100}%`, background: accent }} />
        )}
      </div>

      {/* Hook. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: fill ? 250 : 0,
          height: fill ? undefined : FRAME_TOP,
          display: 'flex',
          alignItems: fill ? 'flex-start' : 'flex-end',
          justifyContent: 'center',
          paddingBottom: fill ? 0 : 40,
        }}
      >
        <div
          style={{
            maxWidth: 880,
            background: '#fff',
            color: '#0b0b0d',
            borderRadius: 22,
            padding: '20px 30px 22px',
            boxShadow: '0 18px 40px -12px rgba(0,0,0,.55)',
            transform: `scale(${cardScale})`,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              // "\n" starts a new line: the '"quote" / Dad:' setup most viral clips use.
              fontSize: Math.max(...p.hook.split('\n').map((l) => l.length)) > 34 ? 60 : 72,
              lineHeight: 1.06,
              letterSpacing: '-0.015em',
              textAlign: 'center',
              textWrap: 'balance',
              whiteSpace: 'pre-line',
              transform: `translateY(${interpolate(textIn, [0, 1], [6, 0])}px)`,
            }}
          >
            {p.hook}
          </div>
        </div>
      </div>

      {/* "wait for it" under the window, gone once the payoff lands. */}
      {p.sub ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: fill ? 1330 : FRAME_TOP + FRAME_H + 34,
            textAlign: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: 46,
            letterSpacing: '-0.01em',
            textShadow: '0 2px 18px rgba(0,0,0,.8)',
            opacity: subIn * subOut,
            transform: `translateY(${interpolate(subIn, [0, 1], [8, 0])}px)`,
          }}
        >
          {p.sub}
        </div>
      ) : null}

      {p.music ? <Audio src={staticFile(p.music)} volume={p.musicVolume ?? 0.5} /> : null}
    </AbsoluteFill>
  );
};
