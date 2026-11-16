import { calculateRouteDensity, type DensityTrack } from '../core/routeDensity';

self.onmessage = ({ data }: MessageEvent<DensityTrack[]>) => {
  try {
    self.postMessage({ result: calculateRouteDensity(data) });
  } catch {
    self.postMessage({ error: 'Failed to calculate route density' });
  }
};
