import { useEffect, useState } from 'react';

const MINUTE = 60_000;
/** How often relative times are renewed. */
const TICK = 10_000;
/** A change younger than this counts as recent and is highlighted. */
const RECENT = 5 * MINUTE;

/** A past time relative to `now`, in words: "just now", "5 min ago", "2 h ago", "3 d ago", or the date after a month. */
export function relativeTime(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < 60 * MINUTE) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < 24 * 60 * MINUTE) return `${Math.floor(elapsed / (60 * MINUTE))} h ago`;
  if (elapsed < 30 * 24 * 60 * MINUTE) return `${Math.floor(elapsed / (24 * 60 * MINUTE))} d ago`;
  return `on ${new Date(iso).toLocaleDateString()}`;
}

/** Whether a past time is recent enough to be highlighted. */
export function isRecent(iso: string, now: number): boolean {
  return now - Date.parse(iso) < RECENT;
}

/** The current time, renewed every ten seconds, so that relative times stay right while the page is open. */
export function useClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
