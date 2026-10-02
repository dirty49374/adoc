import { X } from 'lucide-react';
import type { CheckEntry } from '../api.js';

/** _Warning_Panel_: the same entries as adoc check. */
export function WarningPanel({ entries, onClose }: { entries: CheckEntry[]; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="warning-panel floating" onClick={(e) => e.stopPropagation()} data-testid="warning-panel">
        <div className="panel-header">
          <h2>Warnings and errors</h2>
          <button className="quiet" onClick={onClose} title="Close">
            <X />
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="muted">Nothing to report.</p>
        ) : (
          <ul className="warning-list">
            {entries.map((e, i) => (
              <li key={i} className={`adoc-block ${e.level === 'error' ? 'adoc-tone-error' : 'adoc-tone-warning'}`}>
                <span className="level">{e.level}</span>
                <span className="kind">{e.kind}</span>
                <span className="message">{e.message}</span>
                {e.path && <span className="path">{e.path}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
