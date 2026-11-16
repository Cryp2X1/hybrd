import { useEffect, useState } from 'react';
/** Re-render every `ms` while `on` (live timers). */
export function useNow(ms: number, on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return; setNow(Date.now()); const t = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(t); }, [ms, on]);
  return now;
}
