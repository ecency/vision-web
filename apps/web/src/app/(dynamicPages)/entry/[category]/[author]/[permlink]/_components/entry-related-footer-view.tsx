import { EntryRelatedRow } from "./entry-related-row";
import { RelatedColumn } from "./entry-related-item";

/** The footer grid. No hooks, so the server footer and the refill share it. */
export function EntryRelatedFooterView({ columns }: { columns: RelatedColumn[] }) {
  if (columns.length === 0) {
    return null;
  }

  // Static class strings (Tailwind can't see interpolated ones).
  const colsClass =
    columns.length === 1
      ? "md:grid-cols-1"
      : columns.length === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-3";

  return (
    <div className="entry-related-footer reading-surface rounded-xl my-4 lg:mb-8 p-3 md:p-4 border border-[--border-color]">
      <div className={`grid grid-cols-1 ${colsClass} gap-x-8 gap-y-4`}>
        {columns.map((col) => (
          <div key={col.title} className="min-w-0">
            <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-200 mb-2 pb-1.5 border-b border-[--border-color]">
              {col.title}
            </div>
            <div>
              {col.items.map((it) => (
                <EntryRelatedRow key={`${it.author}/${it.permlink}`} item={it} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
