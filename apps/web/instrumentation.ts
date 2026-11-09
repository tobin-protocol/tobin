// Runs once when the server starts (Next.js `register`). In hosted mode a missing or malformed security setting stops the process instead of letting it
// serve requests with a weaker policy. Local mode (the default) is unaffected. The messages name the variable, never its value.
import { hostedProblems } from "./lib/server/config.ts";

export function register(): void {
  const problems = hostedProblems(process.env);
  if (problems.length > 0) throw new Error("Tobin web refuses to start in hosted mode:\n - " + problems.join("\n - "));
}
