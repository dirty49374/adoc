import type { ReferenceInfo } from '../api.js';

/** _Reference_Tooltip_: "title (status)" and a table of free fields, or the broken state. */
export function ReferenceTooltip({ top, left, target, info }: { top: number; left: number; target: string; info?: ReferenceInfo }) {
  return (
    <div className="reference-tooltip floating" style={{ top, left }} data-testid="reference-tooltip">
      <div className="tooltip-key">{target}</div>
      {!info && <div className="muted">Loading…</div>}
      {info && !info.found && <div className="error">{info.key} does not exist.</div>}
      {info?.found && info.summary && (
        <>
          <div className="tooltip-title">
            {info.summary.title} <span className="status">{info.summary.status}</span>
            {info.archived && <span className="adoc-chip adoc-tone-accent">archived</span>}
          </div>
          {info.summary.fields && Object.keys(info.summary.fields).length > 0 && (
            <table>
              <tbody>
                {Object.entries(info.summary.fields).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {info?.found && info.error && <div className="error">summary failed: {info.error}</div>}
    </div>
  );
}
