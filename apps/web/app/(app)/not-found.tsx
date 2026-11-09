import { ButtonLink } from "../../components/ui/Button.tsx";
import { EmptyState } from "../../components/ui/Feedback.tsx";

export const metadata = { title: "Not found" };

/** A record or page that does not exist for this organization. */
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6">
      <h1 className="sr-only">Not found</h1>
      <EmptyState title="Not found" message="This page or record does not exist, or it belongs to another organization. Check the organization selector." action={<ButtonLink href="/sessions" variant="primary">Go to sessions</ButtonLink>} />
    </div>
  );
}
