import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Self-hosted search: an in-process index built from the MDX content at build time. No external service.
export const { GET } = createFromSource(source, { language: "english" });
