import { Link } from 'react-router';
import { pluginOf, type SummaryEntry } from '../api.js';

/** _Document_Row_: title, status and key of one summary list entry; parse errors show the key and the error. */
export function DocumentRow({ entry, selected }: { entry: SummaryEntry; selected: boolean }) {
  return (
    <Link to={`/p/${pluginOf(entry.key)}/${entry.key}`} className={`document-row${selected ? ' selected' : ''}${entry.error ? ' parse-error' : ''}`} data-key={entry.key}>
      {entry.summary ? (
        <>
          <div className="row-title">{entry.summary.title}</div>
          <div className="row-meta">
            <span className="badge">{entry.summary.status}</span>
            <span className="row-key">{entry.key}</span>
          </div>
        </>
      ) : (
        <>
          <div className="row-title">{entry.key}</div>
          <div className="row-meta error">{entry.error}</div>
        </>
      )}
    </Link>
  );
}
