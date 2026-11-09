import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names; later Tailwind classes win. Used by the shadcn primitives in components/kit. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
