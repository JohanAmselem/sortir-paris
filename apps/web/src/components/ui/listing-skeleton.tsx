/** Route-level skeleton: keeps the layout stable instead of a full-page spinner. */
export function ListingSkeleton() {
  return (
    <div className="px-4 pt-6" role="status" aria-label="Chargement">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton mt-3 h-12 w-2/3 max-w-md rounded" />
      <div className="mt-6 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-10 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i}>
            <div className="skeleton aspect-[3/2] rounded-lg" />
            <div className="skeleton mt-3 h-4 w-1/3 rounded" />
            <div className="skeleton mt-2 h-5 w-5/6 rounded" />
            <div className="skeleton mt-2 h-4 w-1/2 rounded" />
          </div>
        ))}
      </div>
      <span className="sr-only">Chargement des sorties…</span>
    </div>
  )
}
