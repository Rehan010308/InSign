import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState =
  | 'idle'
  | 'requesting'
  | 'live'
  | 'denied'
  | 'no-device'
  | 'busy'
  | 'error';

export interface CameraError {
  state: CameraState;
  message: string;
  /** what the user can actually do about it */
  action: string;
}

const MESSAGES: Record<string, CameraError> = {
  NotAllowedError: {
    state: 'denied',
    message: 'Camera access was blocked.',
    action: 'Open the padlock in your browser’s address bar, allow the camera for this site, then press Retry.',
  },
  NotFoundError: {
    state: 'no-device',
    message: 'No camera was found on this device.',
    action: 'Connect a camera and press Retry. The rest of InSign works without one.',
  },
  NotReadableError: {
    state: 'busy',
    message: 'The camera is already in use by another app.',
    action: 'Close the other app using the camera (video calls are the usual culprit), then press Retry.',
  },
  OverconstrainedError: {
    state: 'error',
    message: 'This camera cannot provide the requested video format.',
    action: 'Press Retry — InSign will ask for a lower resolution.',
  },
};

export interface UseCamera {
  state: CameraState;
  error: CameraError | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enable: () => Promise<void>;
  stop: () => void;
  /** live track count, for the cleanup assertions in the test suite */
  activeTracks: () => number;
}

/**
 * getUserMedia, requested only when the user asks for it — never on page load —
 * and torn down on unmount so the camera light never stays on after a route
 * change. The test suite asserts the tracks actually end.
 */
export function useCamera(): UseCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState<CameraError | null>(null);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setState(s => (s === 'live' || s === 'requesting' ? 'idle' : s));
  }, []);

  useEffect(() => stop, [stop]);

  const enable = useCallback(async () => {
    if (streamRef.current) return;
    setError(null);
    setState('requesting');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError({
        state: 'error',
        message: 'This browser does not expose camera access to web pages.',
        action: 'Try Chrome or Edge — the speech companion works here regardless.',
      });
      setState('error');
      return;
    }

    const attempts: MediaStreamConstraints[] = [
      { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ];

    let lastErr: unknown = null;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          try { await video.play(); } catch { /* autoplay policy — the poster stays */ }
        }
        setState('live');
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    const name = lastErr instanceof DOMException ? lastErr.name : 'error';
    const described = MESSAGES[name] ?? {
      state: 'error' as CameraState,
      message: 'The camera could not be started.',
      action: 'Press Retry. If it keeps failing, check whether another app is using the camera.',
    };
    setError(described);
    setState(described.state);
  }, []);

  const activeTracks = useCallback(
    () => (streamRef.current?.getTracks().filter(t => t.readyState === 'live').length ?? 0),
    []
  );

  return { state, error, videoRef, enable, stop, activeTracks };
}
