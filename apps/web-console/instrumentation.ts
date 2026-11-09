// Runs once when the server starts (Next.js `register`). In hosted mode a missing or malformed security setting stops the process instead of letting it
// serve requests with a weaker policy. Local mode (the default) is unaffected. The messages name the variable, never its value.
// The check is loaded only in the Node.js runtime (it uses node:crypto elsewhere in the same module and has nothing to do in the Edge runtime).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { hostedProblems } = await import('./lib/server/config.ts');
  const problems = hostedProblems(process.env);
  if (problems.length > 0) throw new Error('Tobin console refuses to start in hosted mode:\n - ' + problems.join('\n - '));
}
