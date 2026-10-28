// Where the Rust development bridge lives. Tests that need the real contract are SKIPPED, visibly, when it is not built.
//   cd core && cargo build --offline -p tobin-clearing-v1 --example bridge
//   export TOBIN_BRIDGE_EXE=<target dir>/debug/examples/bridge.exe
export const BRIDGE_EXE: string | undefined = process.env['TOBIN_BRIDGE_EXE'];
export const SKIP: string | false = BRIDGE_EXE ? false : 'TOBIN_BRIDGE_EXE is not set: the real-contract tests need the Rust development bridge (see test/bridge-env.ts)';
