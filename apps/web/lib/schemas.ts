// Form schemas (zod) and a small react-hook-form resolver. `@hookform/resolvers` is not an approved dependency, so zod is wired in locally.
import "./zod-setup.ts";
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
  password: z.string().min(12, "Use at least 12 characters.").max(128, "Use at most 128 characters."),
});
export type EmailRegister = z.infer<typeof emailRegister>;

export const profileForm = z.object({ displayName: z.string().trim().min(1, "Enter a name.").max(80, "Use at most 80 characters.") });
export type ProfileForm = z.infer<typeof profileForm>;

export const organizationForm = z.object({
  name: z.string().trim().min(2, "Enter the organization name (at least 2 characters).").max(80, "Use at most 80 characters."),
  description: z.string().trim().max(500, "Use at most 500 characters."),
  institutionType: z.enum(INSTITUTION_TYPES),
  jurisdiction: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, "Use a two-letter country code such as GB, or leave it empty."),
  visibility: z.enum(["private", "public"]),
});
export type OrganizationForm = z.infer<typeof organizationForm>;

export const invitationForm = z.object({ token: z.string().trim().min(8, "Paste the one-time code you were given.") });
export type InvitationForm = z.infer<typeof invitationForm>;

/** Mirrors Registry.recordSession's only accepted field: 1 to 80 printable characters, no < or > (apps/web-console/lib/registry/service.ts `text`). The server decides. */
export const sessionForm = z.object({
  label: z.string().trim().min(1, "Enter a name for the session.").max(80, "Use at most 80 characters.")
    .refine((v) => !/[\u0000-\u001f\u007f<>]/.test(v), "Do not use control characters, < or >."),
});
export type SessionForm = z.infer<typeof sessionForm>;

/** The only organization fields the backend lets an administrator change. */
export const orgProfileForm = z.object({
  name: z.string().trim().min(2, "Enter the organization name (at least 2 characters).").max(80, "Use at most 80 characters."),
  description: z.string().trim().max(500, "Use at most 500 characters."),
  visibility: z.enum(["private", "public"]),
});
export type OrgProfileForm = z.infer<typeof orgProfileForm>;

export const invitationCreateForm = z.object({
  invitee: z.string().trim().min(3, "Enter an email address or a Stellar address (at least 3 characters).").max(120, "Use at most 120 characters."),
  role: z.enum(["member", "admin"]),
});
export type InvitationCreateForm = z.infer<typeof invitationCreateForm>;
