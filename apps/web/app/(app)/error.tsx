"use client";

import { Button, ButtonLink } from "../../components/ui/Button.tsx";
import { ErrorState } from "../../components/ui/Feedback.tsx";

/** A page failed while rendering. The rest of the frame stays; the user can try again or go back to the Overview. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6">
      <ErrorState
        title="This page could not be shown"
        message={error.message ? `${error.message}. Nothing was changed.` : "Something went wrong while showing this page. Nothing was changed."}
        retry={<div className="flex gap-2"><Button variant="primary" onClick={reset}>Try again</Button><ButtonLink href="/">Go to Overview</ButtonLink></div>}
      />
    </div>
  );
}
