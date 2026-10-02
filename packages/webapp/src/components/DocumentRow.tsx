import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { pluginOf, type SummaryEntry } from '../api.js';
import { isRecent, relativeTime } from '../time.js';

/**
 * _Document_Row_: status and last update (relative to `now`, highlighted when recent), title (the whole of a cut one on
 * hover) and key of one summary list entry, each on one line; a parse error shows the error in place of the key.
 */
export function DocumentRow({ entry, selected, now }: { entry: SummaryEntry; selected: boolean; now: number }) {
  const [cut, setCut] = useState<{ top: number; left: number; width: number }>();
  const title = entry.summary ? entry.summary.title : entry.key;
  // fixed position, so the card is not clipped by the scrolling list; shown only when the ellipsis cuts the title
  const onTitleEnter = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return;
    const rect = el.getBoundingClientRect();
    setCut({ top: rect.top, left: rect.left, width: rect.width });
  };

  return (
    <Link to={`/p/${pluginOf(entry.key)}/${entry.key}`} className={`document-row${selected ? ' selected' : ''}${entry.error ? ' parse-error' : ''}`} data-key={entry.key}>
      <div className="row-meta">
        {entry.summary ? <span className="status">{entry.summary.status}</span> : <span className="error">ERROR</span>}
        <span className={`row-updated${isRecent(entry.updatedAt, now) ? ' recent' : ''}`} title={`updated ${new Date(entry.updatedAt).toLocaleString()}`}>
          {relativeTime(entry.updatedAt, now)}
        </span>
      </div>
      <div className="row-title" onMouseEnter={onTitleEnter} onMouseLeave={() => setCut(undefined)}>
        {title}
      </div>
      {cut && (
        <div className="row-title-tooltip floating" style={{ top: cut.top, left: cut.left, width: cut.width }} data-testid="row-title-tooltip">
          {title}
        </div>
      )}
      <div className="row-meta">{entry.summary ? <span className="row-key">{entry.key}</span> : <span className="error">{entry.error}</span>}</div>
    </Link>
  );
}
