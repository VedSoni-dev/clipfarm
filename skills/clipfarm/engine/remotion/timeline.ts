// The clip's timing: normal speed into the payoff, half speed through it, normal speed out.
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export type ClipProps = {
  /** The trimmed source clip, a file in the render's public folder. */
  src: string;
  /** Seconds in the trimmed clip. */
  duration: number;
  /** Source width / height. */
  aspect: number;
  /** The payoff, in seconds from the start of the trimmed clip. null = no punch-in. */
  impact: number | null;
  slowmo: boolean;
  /** 0..1: where the action is, left to right. The vertical crop keeps it in frame. */
  focusX: number;
  /** "frame": the game in a window with blurred fill above and below. "fill": cropped to fill the whole screen. */
  layout: 'frame' | 'fill';
  hook: string;
  /** Optional small line under the game ("wait for it"); it leaves when the payoff lands. */
  sub?: string | null;
  gameVolume: number;
  music?: string | null;
  musicVolume?: number;
  accent?: string;
};

export type Segment = { from: number; to: number; rate: number; start: number; len: number };

export function plan(p: Pick<ClipProps, 'duration' | 'impact' | 'slowmo'>) {
  const d = Math.max(0.5, p.duration);
  const raw: Omit<Segment, 'start' | 'len'>[] = [];
  let slowFrom = -1;
  let slowTo = -1;
  if (p.impact != null && p.slowmo && p.impact > 0 && p.impact < d) {
    slowFrom = Math.max(0, p.impact - 0.35);
    slowTo = Math.min(d, p.impact + 0.65);
    raw.push({ from: 0, to: slowFrom, rate: 1 }, { from: slowFrom, to: slowTo, rate: 0.5 }, { from: slowTo, to: d, rate: 1 });
  } else {
    raw.push({ from: 0, to: d, rate: 1 });
  }
  let f = 0;
  const segments: Segment[] = raw
    .filter((s) => s.to - s.from > 0.02)
    .map((s) => {
      const len = Math.max(1, Math.round(((s.to - s.from) / s.rate) * FPS));
      const seg = { ...s, start: f, len };
      f += len;
      return seg;
    });
  /** Output frame for a time in the trimmed clip. */
  const toFrame = (t: number) => {
    for (const s of segments) if (t <= s.to) return s.start + ((t - s.from) / s.rate) * FPS;
    return f;
  };
  return {
    segments,
    total: f,
    impactFrame: p.impact != null && p.impact > 0 && p.impact < d ? toFrame(p.impact) : null,
    slowEndFrame: slowTo > 0 ? toFrame(slowTo) : null,
  };
}
