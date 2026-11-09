"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu01Icon } from "@hugeicons/core-free-icons";
import { SignedOutActions } from "../auth/SignedOutActions.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/kit/sheet";
import { Icon } from "../tobin/Icon.tsx";
import { SidebarContent } from "./Sidebar.tsx";
import { titleOf } from "./nav.ts";
import { AccountMenu, BAR_BTN, EnvironmentButton, HelpLink, NotificationsLink, SearchCommand, WalletCell } from "./topbar/controls.tsx";

/** Drawer holding the sidebar under 1024px. */
function MobileDrawer({ signedIn, pending }: { signedIn: boolean; pending?: number | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" aria-label="Open navigation" className={`${BAR_BTN} lg:hidden`}><Icon icon={Menu01Icon} size={20} /></button>
      </SheetTrigger>
      <SheetContent side="left" showCloseButton className="w-64 max-w-[85vw] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Pages in Tobin</SheetDescription>
        <SidebarContent signedIn={signedIn} pending={pending} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** The 58px top bar: page label, help, environment, wallet cell, notifications, account. Signed out it holds the network and one Connect wallet button. */
export function TopBar({ signedIn, pending }: { signedIn: boolean; pending?: number | null }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 flex h-[58px] items-center gap-1 border-b border-divider bg-page px-3 sm:px-4">
      <MobileDrawer signedIn={signedIn} pending={pending} />
      <p className="min-w-0 flex-1 truncate pl-2 font-label text-body uppercase tracking-wider max-sm:invisible">{titleOf(path)}</p>
      <div className="flex items-center gap-1">
        {signedIn ? (
          <>
            <HelpLink />
            <SearchCommand />
            <EnvironmentButton />
            <WalletCell />
            <NotificationsLink />
            <AccountMenu />
          </>
        ) : (
          <>
            <span className="max-md:hidden"><EnvironmentButton /></span>
            <SignedOutActions />
          </>
        )}
      </div>
    </header>
  );
}
