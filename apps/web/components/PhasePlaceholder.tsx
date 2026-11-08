import { PageFrame } from "./shell/PageFrame.tsx";
import { EmptyState } from "./ui/Feedback.tsx";

/** A tab whose screen belongs to a later phase. It shows no data and mocks nothing. */
export function PhasePlaceholder({ title, phase, scope }: { title: string; phase: string; scope: string }) {
  return (
    <PageFrame title={title} breadcrumbs={[{ label: title }]}>
      <EmptyState title="Not built yet" message={<>This page is built in Phase {phase}: {scope} Nothing is shown here, and no data is mocked.</>} />
    </PageFrame>
  );
}
