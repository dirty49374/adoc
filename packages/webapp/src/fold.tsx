import { Pin, PinOff } from 'lucide-react';
import { useState } from 'react';
import { readStored, writeStored } from './storage.js';

/**
 * Pin and fold, one mechanism for every foldable region: a region with the `foldable` class and, when not pinned,
 * the `unpinned` class shows its `fold-closed` part and unfolds to its `fold-open` part while the pointer is on it
 * or a text input in it has focus (the rule lives in app.css). The pin is kept per browser under `key`.
 */
export function usePinned(key: string): [boolean, (pinned: boolean) => void] {
  const [pinned, setPinned] = useState(() => readStored(key, false));
  return [
    pinned,
    (next) => {
      setPinned(next);
      writeStored(key, next || undefined);
    },
  ];
}

export function PinButton({ pinned, onPin, what, testId }: { pinned: boolean; onPin: (pinned: boolean) => void; what: string; testId: string }) {
  return (
    <button className="quiet" onClick={() => onPin(!pinned)} title={pinned ? `Unpin: fold the ${what} when the pointer leaves it` : `Pin: keep the ${what} open`} data-testid={testId}>
      {pinned ? <PinOff /> : <Pin />}
    </button>
  );
}
