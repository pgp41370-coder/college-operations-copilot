import { Skeleton } from "@/components/ui";

/**
 * Route skeleton. Used only by leaf routes: a loading boundary above a route
 * that calls notFound() would make that route answer 200 instead of 404.
 */
export function PageSkeleton({ stats = true }: { stats?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-72 rounded-xl xl:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
