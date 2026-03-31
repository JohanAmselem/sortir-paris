export function SkeletonCard() {
  return (
    <div className="w-[260px] flex-shrink-0 overflow-hidden rounded-2xl bg-surface sm:w-[280px]">
      <div className="skeleton aspect-[3/2]" />
      <div className="p-3.5 space-y-2.5">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-3 w-12 rounded" />
      </div>
    </div>
  )
}

export function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl bg-surface">
          <div className="skeleton aspect-[3/2]" />
          <div className="p-3.5 space-y-2.5">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
            <div className="skeleton h-3 w-12 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="py-8">
      <div className="flex items-center justify-between px-4">
        <div className="skeleton h-6 w-32 rounded" />
        <div className="skeleton h-5 w-20 rounded" />
      </div>
      <div className="scrollbar-hide mt-4 flex gap-3 overflow-x-auto px-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
