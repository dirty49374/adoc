import { GitCompare } from 'lucide-react';

/** _Change_Toggle_: switches the body between the current version and the changes since this browser looked last. */
export function ChangeToggle({ state, on, onToggle }: { state: 'none' | 'available' | 'unavailable'; on: boolean; onToggle: () => void }) {
  if (state === 'none') return null;
  if (state === 'unavailable') return <span className="adoc-chip change-toggle unavailable" data-testid="change-toggle">changes unavailable (older than this server run)</span>;
  return (
    <button className={`adoc-chip change-toggle${on ? ' on' : ''}`} onClick={onToggle} data-testid="change-toggle" title="Changes since the version this browser showed last">
      <GitCompare />
      {on ? 'showing changes' : 'show changes'}
    </button>
  );
}
