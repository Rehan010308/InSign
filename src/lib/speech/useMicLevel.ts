import { useEffect, useRef } from 'react';

/**
 * A live loudness reading for the listening indicator.
 *
 * Two things make this cheap enough to run beside speech recognition. It never
 * sets React state — the caller is handed a ref that a requestAnimationFrame
 * loop writes into, so the bars move without re-rendering the page on every
 * frame. And it only ever reads the analyser: no audio is recorded, buffered or
 * sent anywhere, and the stream's tracks are stopped the moment listening ends.
 *
 * If the browser refuses a second microphone reader — some do, while speech
 * recognition holds the device — `available` goes false and the caller falls
 * back to a calm indicator rather than a fake one.
 */
export interface MicLevel {
  /** 0–1, smoothed; read inside an animation frame, never rendered directly */
  level: { current: number };
  available: { current: boolean };
}

export function useMicLevel(active: boolean): MicLevel {
  const level = useRef(0);
  const available = useRef(false);

  useEffect(() => {
    if (!active) { level.current = 0; return; }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let cancelled = false;

    const AudioCtor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
      if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      ctx = new AudioCtor();
      const source = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      available.current = true;

      const read = () => {
        analyser.getByteTimeDomainData(buffer);
        // Root mean square around the 128 silence midpoint, scaled so ordinary
        // speech sits near the top of the range rather than at a tenth of it.
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const next = Math.min(1, rms * 4);
        // Rise quickly, fall slowly: the bars follow the voice instead of
        // flickering on every frame of a consonant.
        level.current = next > level.current
          ? level.current + (next - level.current) * 0.5
          : level.current + (next - level.current) * 0.12;
        raf = requestAnimationFrame(read);
      };
      raf = requestAnimationFrame(read);
    }).catch(() => {
      available.current = false;
    });

    return () => {
      cancelled = true;
      available.current = false;
      level.current = 0;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      ctx?.close().catch(() => { /* already closed */ });
    };
  }, [active]);

  return { level, available };
}
