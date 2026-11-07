import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Brand } from "@/components/BrandMark";
import { LANDING_URL, REPO } from "@/lib/site";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Brand />, url: "/" },
    githubUrl: REPO,
    links: [
      { text: "Documentation", url: "/docs", active: "nested-url" },
      { text: "Architecture", url: "/docs/architecture", active: "nested-url" },
      { text: "API & SDK", url: "/docs/reference", active: "nested-url" },
      ...(LANDING_URL ? [{ text: "Main website", url: LANDING_URL, external: true }] : []),
    ],
  };
}
