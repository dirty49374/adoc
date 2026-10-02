import { TriangleAlert } from 'lucide-react';

/** _Warning_Link_: the number of check entries; hidden at zero; opens the _Warning_Panel_. */
export function WarningLink({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <button className="warning-link" onClick={onOpen} data-testid="warning-link">
      <TriangleAlert />
      {count} {count === 1 ? 'warning' : 'warnings'}
    </button>
  );
}
