// The real dependencies of the API route handlers: the process-wide sandbox singleton and the configured port.
import type { ApiDeps } from './api.ts';
import { configuredPort } from './guards.ts';
import { sandbox } from './sandbox.ts';

export const defaultDeps = (): ApiDeps => ({ sandbox, port: configuredPort(process.env) });
