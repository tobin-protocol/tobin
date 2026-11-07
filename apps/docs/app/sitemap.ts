import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { DOCS_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: DOCS_URL }, ...source.getPages().map((p) => ({ url: `${DOCS_URL}${p.url}` }))];
}
