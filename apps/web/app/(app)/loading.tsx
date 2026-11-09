import { Skeleton } from "../../components/ui/Feedback.tsx";

/** Shown while a signed-in route loads. The pages draw their own skeletons once their data requests start; this covers the route itself. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4 px-4 py-6 sm:px-6" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
