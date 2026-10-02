import { useEffect, useState } from 'react';

const MINUTE = 60_000;

/** A past time relative to `now`, in words: "just now", "5 min ago", "2 h ago", "3 d ago", or the date after a month. */
export function relativeTime(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < 60 * MINUTE) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < 24 * 60 * MINUTE) return `${Math.floor(elapsed / (60 * MINUTE))} h ago`;
  if (elapsed < 30 * 24 * 60 * MINUTE) return `${Math.floor(elapsed / (24 * 60 * MINUTE))} d ago`;
  return `on ${new Date(iso).toLocaleDateString()}`;
}

/** The current time, renewed every minute, so that relative times stay right while the page is open. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
