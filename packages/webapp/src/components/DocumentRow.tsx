import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { pluginOf, type SummaryEntry } from '../api.js';

/** _Document_Row_: title (two lines, the whole of a cut one on hover), status and key of one summary list entry; parse errors show the key and the error. */
export function DocumentRow({ entry, selected }: { entry: SummaryEntry; selected: boolean }) {
  const [cut, setCut] = useState<{ top: number; left: number; width: number }>();
  const title = entry.summary ? entry.summary.title : entry.key;
  // fixed position, so the card is not clipped by the scrolling list; shown only when the clamp cuts the title
  const onTitleEnter = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight <= el.clientHeight) return;
    const rect = el.getBoundingClientRect();
    setCut({ top: rect.top, left: rect.left, width: rect.width });
  };

  return (
    <Link to={`/p/${pluginOf(entry.key)}/${entry.key}`} className={`document-row${selected ? ' selected' : ''}${entry.error ? ' parse-error' : ''}`} data-key={entry.key}>
      <div className="row-title" onMouseEnter={onTitleEnter} onMouseLeave={() => setCut(undefined)}>
        {title}
      </div>
      {cut && (
        <div className="row-title-tooltip floating" style={{ top: cut.top, left: cut.left, width: cut.width }} data-testid="row-title-tooltip">
          {title}
        </div>
      )}
      {entry.summary ? (
        <div className="row-meta">
          <span className="status">{entry.summary.status}</span>
          <span className="row-key">{entry.key}</span>
        </div>
      ) : (
        <div className="row-meta error">{entry.error}</div>
      )}
    </Link>
  );
}
