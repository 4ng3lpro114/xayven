/**
 * Next.js App Router convention (not a new pattern) — shown automatically
 * while the server component above fetches/computes. Same tokens as the
 * rest of the page (bg-bg-raised, border-border), just pulsing.
 */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg border border-border bg-bg-raised ${className ?? "h-24"}`} />
  );
}

export default function StatisticsLoading() {
  return (
    <div>
      <div className="h-8 w-40 animate-pulse rounded-md bg-bg-raised" />
      <div className="mt-2 h-4 w-56 animate-pulse rounded-md bg-bg-raised" />

      <div className="mt-5 flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-16 animate-pulse rounded-pill bg-bg-raised" />
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      <div className="mt-10">
        <SkeletonCard className="h-80" />
      </div>
    </div>
  );
}
