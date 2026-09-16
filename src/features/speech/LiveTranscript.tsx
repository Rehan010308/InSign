import { useEffect, useRef } from 'react';

export default function LiveTranscript({
  final, interim, listening,
}: {
  final: string;
  interim: string;
  listening: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [final, interim]);

  return (
    <div
      className="transcript"
      ref={ref}
      aria-live="polite"
      aria-atomic="false"
      aria-label="Live transcript"
      data-testid="transcript"
    >
      {final || interim ? (
        <p>
          {final}
          {interim && <span className="interim"> {interim}</span>}
        </p>
      ) : (
        <p className="placeholder">
          {listening
            ? 'Listening — start speaking whenever you are ready.'
            : 'Your words will appear here as you speak.'}
        </p>
      )}
    </div>
  );
}
