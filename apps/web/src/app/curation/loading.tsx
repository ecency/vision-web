/** Eight fixed-height skeleton rows, the height of a compact desk row, so the list paints without layout shift. */
export default function CurationLoading() {
  return (
    <div className="bg-white dark:bg-dark-200 rounded-2xl overflow-hidden" aria-busy="true">
      <div className="h-[56px] border-b border-[--border-color] animate-pulse bg-gray-100 dark:bg-dark-default/40" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-2 h-[72px] border-b border-[--border-color]">
          <div className="w-[4.5rem] h-4 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
          <div className="size-16 rounded-lg animate-pulse bg-gray-200 dark:bg-dark-default" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-4 w-3/4 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
            <div className="h-3 w-1/2 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
          </div>
        </div>
      ))}
    </div>
  );
}
