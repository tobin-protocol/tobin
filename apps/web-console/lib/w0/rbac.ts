// Server-side authorisation. Fail closed: an unknown role or permission is denied. Hiding a UI control is never an authorisation control.
import { WEB_ROLES } from './types.ts';
import type { Role } from './types.ts';

export const PERMISSIONS = ['read_readiness', 'read_previews', 'read_audit', 'read_intents', 'request_preview', 'record_approval_intent'] as const;
export type Permission = (typeof PERMISSIONS)[number];

const VIEW: readonly Permission[] = ['read_readiness', 'read_previews', 'read_audit', 'read_intents'];
const GRANTS: Readonly<Record<Role, readonly Permission[]>> = {
  viewer: VIEW,
  requester: [...VIEW, 'request_preview'],
  approver: [...VIEW, 'record_approval_intent'],
};

export const isRole = (x: unknown): x is Role => typeof x === 'string' && (WEB_ROLES as readonly string[]).includes(x);

export function can(role: unknown, permission: unknown): boolean {
  if (!isRole(role)) return false;
  if (typeof permission !== 'string' || !(PERMISSIONS as readonly string[]).includes(permission)) return false;
  return GRANTS[role].includes(permission as Permission);
}
