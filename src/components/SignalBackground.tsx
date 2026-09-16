import { useEffect, useRef } from 'react';
import { startSignalBackground } from '../lib/landing/signalBackground';

/**
 * The drifting signal lines behind the landing page.
 * Mounted only on the landing route — the app routes stay calm.
 */
export default function SignalBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return startSignalBackground(ref.current);
  }, []);
  return <canvas id="bg" ref={ref} aria-hidden="true" />;
}
