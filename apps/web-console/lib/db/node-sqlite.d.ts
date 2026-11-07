// Minimal ambient types for Node's built-in `node:sqlite` (the installed @types/node 20 predates it). Only what lib/db and the stores use.
declare module 'node:sqlite' {
  export type SQLInputValue = string | number | bigint | Uint8Array | null;
  export interface StatementResultingChanges { changes: number | bigint; lastInsertRowid: number | bigint }
  export class StatementSync {
    run(...params: SQLInputValue[]): StatementResultingChanges;
    get(...params: SQLInputValue[]): Record<string, unknown> | undefined;
    all(...params: SQLInputValue[]): Record<string, unknown>[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
