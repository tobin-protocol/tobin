import { redirect } from "next/navigation";

/** Wallets are a tab of the Organization page. */
export default function Page() {
  redirect("/organization?tab=wallets");
}
