import React from 'react';
import { Composition } from 'remotion';
import { Clip } from './Clip';
import { FPS, HEIGHT, WIDTH, plan, type ClipProps } from './timeline';

const sample: ClipProps = {
  src: 'sample.mp4',
  duration: 9,
  aspect: 16 / 9,
  impact: 6,
  slowmo: true,
  focusX: 0.5,
  layout: 'frame',
  hook: 'He did not see that coming',
  sub: 'wait for it',
  gameVolume: 1,
  music: null,
  musicVolume: 0.5,
  accent: '#ff4f8b',
};

export const Root: React.FC = () => (
  <Composition
    id="Clip"
    component={Clip}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={plan(sample).total}
    defaultProps={sample}
    calculateMetadata={({ props }) => ({ durationInFrames: plan(props).total })}
  />
);
