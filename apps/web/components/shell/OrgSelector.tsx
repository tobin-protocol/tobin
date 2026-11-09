"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/kit/dropdown-menu";
import { cn } from "@/lib/utils";
import { client } from "../../lib/tobin/index.ts";
import { INSTITUTION_LABEL } from "../../lib/format.ts";
import { Icon } from "../tobin/Icon.tsx";
import { useWorkspace } from "./session.tsx";

/** Organization selector under the logo. Everything in the app is scoped to the selected organization. */
export function OrgSelector({ onNavigate }: { onNavigate?: () => void }) {
  const { orgs, org, switchOrg } = useWorkspace();
  const detail = useQuery({ queryKey: ["org", org.id], queryFn: () => client.organizations.get(org.id) });
  const type = detail.data?.organization.institutionType;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Organization: ${org.name}. Change organization`} className="flex min-h-11 w-full items-center gap-3 border border-divider px-3 text-left hover:bg-tile">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center bg-ink text-body font-medium text-on-button">{org.name.trim()[0]?.toUpperCase() ?? "?"}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium">{org.name}</span>
            <span className="block truncate text-label text-muted">{type ? INSTITUTION_LABEL[type] ?? type : "Organization"}</span>
          </span>
          <Icon icon={ArrowDown01Icon} size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="font-label text-label uppercase tracking-wider text-muted">Your organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            aria-current={o.id === org.id ? "true" : undefined}
            className={cn("min-h-11 gap-3", o.id === org.id && "bg-tile")}
            onSelect={async () => { onNavigate?.(); if (o.id !== org.id) await switchOrg(o.id); }}
          >
            <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{o.name}</span><span className="block text-label text-muted">{o.role === "admin" ? "Admin" : "Member"}</span></span>
            {o.id === org.id ? <span className="text-label text-muted">Current</span> : null}
          </DropdownMenuItem>
        ))}
        <p className="px-2 py-2 text-label text-muted">You are acting under <span className="font-medium text-ink">{org.name}</span>. Everything in the app is scoped to it.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
