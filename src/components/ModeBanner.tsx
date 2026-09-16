import { useEffect, useState } from 'react';
import { useAuth } from '../services/authService';
import { onOfflineChange } from '../services/sessionService';

/**
 * Discloses which persistence path is live, and only when it matters.
 *
 * With Supabase configured and reachable this renders nothing at all — a
 * working app should not explain its own plumbing. The local store still has to
 * announce itself, because sessions kept only in one browser profile are a real
 * difference to the user; the configuration detail behind it belongs in the
 * README, not on the screen.
 */
export default function ModeBanner() {
  const { mode } = useAuth();
  const [offline, setOffline] = useState(false);

  useEffect(() => onOfflineChange(setOffline), []);

  if (mode === 'supabase' && !offline) return null;

  return (
    <div className="wrap">
      <div className={`mode-banner${offline ? ' offline' : ''}`} role="status">
        <span className="badge badge-demo">{offline ? 'OFFLINE' : 'LOCAL DEMO MODE'}</span>
        <p className="micro">
          {offline
            ? 'Supabase is unreachable. Sessions are being saved in this browser and will be sent when the connection returns.'
            : 'Sessions are stored in this browser only, and stay on this device.'}
        </p>
      </div>
    </div>
  );
}
