import { Suspense } from "react";
import { Workspace } from "../../../../components/sessions/Workspace.tsx";

export const metadata = { title: "Session" };

export default function Page() {
  return <Suspense fallback={null}><Workspace /></Suspense>;
}
