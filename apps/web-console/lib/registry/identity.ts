// Identity integration point. No identity provider is chosen (owner decision pending). The registry only needs "who is the acting user".
// The development provider is for tests and local use and is labelled so; it is NOT authentication.

export interface ActingUser {
  userId: string;
  /** 'development' users are never to be accepted in a hosted deployment */
  kind: 'development' | 'verified';
  /** only for verified users; used to bind an invitation addressed to an email */
  email?: string;
}

export interface IdentityProvider {
  readonly name: string;
  /** resolves the acting user from an opaque credential, or null; must not throw for bad input */
  resolve(credential: string | undefined): Promise<ActingUser | null>;
}

export class DevelopmentIdentityProvider implements IdentityProvider {
  readonly name = 'development (not authentication)';
  /** Unconditional: a production process can never construct this provider, whatever flag is set. */
  constructor() { if (process.env['NODE_ENV'] === 'production') throw new Error('the development identity provider cannot exist in production'); }
  async resolve(credential: string | undefined): Promise<ActingUser | null> {
    if (typeof credential !== 'string' || !/^dev:[a-z0-9_-]{1,40}$/.test(credential)) return null;
    return { userId: credential.slice(4), kind: 'development' };
  }
}
