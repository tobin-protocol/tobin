import { Suspense } from "react";
import { SessionsList } from "../../../components/sessions/SessionsList.tsx";

export const metadata = { title: "Clearing Sessions" };

export default function Page() {
  return <Suspense fallback={null}><SessionsList /></Suspense>;
}
