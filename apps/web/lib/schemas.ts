// Form schemas (zod) and a small react-hook-form resolver. `@hookform/resolvers` is not an approved dependency, so zod is wired in locally.
import { z } from "zod";
import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import { INSTITUTION_TYPES } from "./tobin/types.ts";

export function zodResolver<T extends FieldValues>(schema: z.ZodType<T>): Resolver<T> {
  return async (values) => {
    const r = schema.safeParse(values);
    if (r.success) return { values: r.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join(".") || "root";
      if (!errors[key]) errors[key] = { type: issue.code, message: issue.message };
    }
    return { values: {} as Record<string, never>, errors: errors as unknown as FieldErrors<T> };
  };
}

export const emailSignIn = z.object({ email: z.string().trim().min(3, "Enter your email address.").includes("@", "Enter a valid email address."), password: z.string().min(1, "Enter your password.") });
export type EmailSignIn = z.infer<typeof emailSignIn>;

export const emailRegister = z.object({
  displayName: z.string().trim().min(1, "Enter a name.").max(80, "Use at most 80 characters."),
  email: z.string().trim().min(3, "Enter your email address.").includes("@", "Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});
export type EmailRegister = z.infer<typeof emailRegister>;

export const profileForm = z.object({ displayName: z.string().trim().min(1, "Enter a name.").max(80, "Use at most 80 characters.") });
export type ProfileForm = z.infer<typeof profileForm>;

export const organizationForm = z.object({
  name: z.string().trim().min(2, "Enter the organization name (at least 2 characters).").max(120, "Use at most 120 characters."),
  description: z.string().trim().max(500, "Use at most 500 characters."),
  institutionType: z.enum(INSTITUTION_TYPES),
  jurisdiction: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, "Use a two-letter country code such as GB, or leave it empty."),
  visibility: z.enum(["private", "public"]),
});
export type OrganizationForm = z.infer<typeof organizationForm>;

export const invitationForm = z.object({ token: z.string().trim().min(8, "Paste the one-time code you were given.") });
export type InvitationForm = z.infer<typeof invitationForm>;
