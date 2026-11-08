import { Suspense } from "react";
import { Organization } from "../../../components/organization/Organization.tsx";

export const metadata = { title: "Organization" };

export default function Page() {
  return <Suspense fallback={null}><Organization /></Suspense>;
}
