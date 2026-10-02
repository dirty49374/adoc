/** _Change_Base_Picker_: chooses the base version of the change view among the versions the server holds. */
export function ChangeBasePicker({ versions, base, onPick }: { versions: Array<{ version: string; seenAt: string }>; base?: string; onPick: (version: string) => void }) {
  if (versions.length === 0) return null;
  return (
    <select className="change-base-picker" value={base ?? ''} onChange={(e) => e.target.value && onPick(e.target.value)} data-testid="change-base-picker" title="Compare with this version">
      {!base && <option value="">compare with…</option>}
      {versions.map((v) => (
        <option key={v.version} value={v.version}>
          since {new Date(v.seenAt).toLocaleTimeString()} · {v.version.slice(0, 7)}
        </option>
      ))}
    </select>
  );
}
