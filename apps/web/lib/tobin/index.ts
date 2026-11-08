import { HttpAdapter, type TobinClient } from "./client.ts";
import { MockAdapter } from "./mock-adapter.ts";

/** Sample data is OFF unless NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1 (decision D3). */
export const SAMPLE_DATA = process.env.NEXT_PUBLIC_TOBIN_SAMPLE_DATA === "1";

export const client: TobinClient = SAMPLE_DATA ? new MockAdapter() : new HttpAdapter();
