/** Shared pagination bar for every paginated list/table in the app — DRF's
 * PageNumberPagination returns {count, next, previous, results}; this just
 * needs count/page/pageSize and an onPageChange callback. */
export default function Pagination({ page, pageSize, count, onPageChange, loading = false }) {
  if (count === 0) return null;

  const totalPages = Math.max(1, Math.ceil(count / (pageSize || 20)));
  const rangeStart = (page - 1) * (pageSize || 20) + 1;
  const rangeEnd = Math.min(count, page * (pageSize || 20));

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-100 bg-neutral-50 px-6 py-4 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing <span className="font-medium text-neutral-700">{rangeStart}–{rangeEnd}</span> of{' '}
        <span className="font-medium text-neutral-700">{count}</span>
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-neutral-500">Page {page} of {totalPages}</span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
