import type { SummaryEntry } from '../api.js';

/** An order of the _Document_List_Pane_. */
export type DocumentSort = 'updated' | 'key' | 'title' | 'status';

const SORTS: Array<{ value: DocumentSort; label: string }> = [
  { value: 'updated', label: 'last update' },
  { value: 'key', label: 'key' },
  { value: 'title', label: 'title' },
  { value: 'status', label: 'status' },
];

export const isDocumentSort = (value: unknown): value is DocumentSort => SORTS.some((s) => s.value === value);

const titleOf = (entry: SummaryEntry) => entry.summary?.title ?? entry.key;
const byKey = (a: SummaryEntry, b: SummaryEntry) => a.key.localeCompare(b.key);
const compare: Record<DocumentSort, (a: SummaryEntry, b: SummaryEntry) => number> = {
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byKey(a, b),
  key: byKey,
  title: (a, b) => titleOf(a).localeCompare(titleOf(b)) || byKey(a, b),
  status: (a, b) => (a.summary?.status ?? '').localeCompare(b.summary?.status ?? '') || byKey(a, b),
};

/** The entries in the given order; the key breaks ties. */
export function sortEntries(entries: SummaryEntry[], sort: DocumentSort): SummaryEntry[] {
  return [...entries].sort(compare[sort]);
}

/** _Document_Sort_Picker_: chooses the order of the _Document_List_Pane_. */
export function DocumentSortPicker({ sort, onPick }: { sort: DocumentSort; onPick: (sort: DocumentSort) => void }) {
  return (
    <select className="document-sort-picker" value={sort} onChange={(e) => isDocumentSort(e.target.value) && onPick(e.target.value)} data-testid="document-sort-picker" title="Order of the documents">
      {SORTS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
