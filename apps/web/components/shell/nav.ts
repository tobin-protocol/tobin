import { Activity01Icon, Building03Icon, CheckmarkSquare02Icon, Compass01Icon, Home01Icon, Layers01Icon, Settings02Icon, Task01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export interface NavItem { id: string; href: string; label: string; icon: IconSvgElement }

/** The sidebar's NAVIGATION group. Discover is first and always reachable. Reviews is the cross-session approvals queue; until the Reviews page ships (phase R4) it opens /approvals. */
export const NAV: NavItem[] = [
  { id: "discover", href: "/discover", label: "Discover", icon: Compass01Icon },
  { id: "overview", href: "/", label: "Overview", icon: Home01Icon },
  { id: "sessions", href: "/sessions", label: "Sessions", icon: Layers01Icon },
  { id: "obligations", href: "/obligations", label: "Obligations", icon: Task01Icon },
  { id: "reviews", href: "/reviews", label: "Reviews", icon: CheckmarkSquare02Icon },
  { id: "activity", href: "/activity", label: "Activity", icon: Activity01Icon },
  { id: "organization", href: "/organization", label: "Organization", icon: Building03Icon },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings02Icon },
];

/** The EXTERNAL group. These leave the app. */
export const EXTERNAL = [
  { id: "docs", label: "Documentation", href: "https://docs.tobinprotocol.xyz" },
  { id: "repo", label: "Repository", href: "https://github.com/tobin-protocol/tobin" },
  { id: "feedback", label: "Share feedback", href: "https://github.com/tobin-protocol/tobin/issues" },
] as const;

const PREFIXES: Record<string, string> = { "/approvals": "reviews", "/reviews": "reviews", "/wallets": "organization", "/notifications": "" };

/** Which NAV item the current path belongs to ("" when none, for example the notifications page). */
export function activeNav(path: string): string {
  for (const [p, id] of Object.entries(PREFIXES)) if (path === p || path.startsWith(p + "/")) return id;
  const hit = NAV.filter((n) => n.href !== "/").find((n) => path === n.href || path.startsWith(n.href + "/"));
  if (hit) return hit.id;
  return path === "/" ? "overview" : "";
}

export function titleOf(path: string): string {
  if (path === "/notifications") return "Notifications";
  if (path === "/wallets") return "Wallets";
  return NAV.find((n) => n.id === activeNav(path))?.label ?? "Tobin";
}
