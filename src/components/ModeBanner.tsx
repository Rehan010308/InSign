import { useEffect, useState } from 'react';
import { useAuth } from '../services/authService';
import { onOfflineChange } from '../services/sessionService';

/**
 * Always discloses which persistence path is live. The local demo store must
 * never be able to pass itself off as the real Supabase path.
 */
export default function ModeBanner() {
  const { mode, modeReason } = useAuth();
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
            : `Sessions are stored in this browser only. ${modeReason ?? ''}`}
        </p>
      </div>
    </div>
  );
}
