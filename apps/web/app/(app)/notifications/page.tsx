import { PageFrame } from "../../../components/shell/PageFrame.tsx";
import { NotSupported } from "../../../components/ui/Feedback.tsx";
import { ButtonLink } from "../../../components/ui/Button.tsx";

export const metadata = { title: "Notifications" };

export default function Page() {
  return (
    <PageFrame title="Notifications" breadcrumbs={[{ label: "Notifications" }]}>
      <div className="max-w-xl space-y-4">
        <NotSupported feature="Notifications" reason="The backend has no notifications: no route, no model and no unread count. Nothing is listed here and nothing is simulated. Items that need your attention are on the Overview and Approvals pages." />
        <div className="flex gap-2"><ButtonLink href="/" variant="quiet">Go to Overview</ButtonLink><ButtonLink href="/approvals" variant="quiet">Go to Approvals</ButtonLink></div>
      </div>
    </PageFrame>
  );
}
