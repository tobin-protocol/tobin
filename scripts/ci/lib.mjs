// Shared helpers for the CI scripts. No dependencies; Node 24.
import { appendFileSync } from 'node:fs';

// Write Markdown to the GitHub job summary when running in Actions, otherwise to stdout.
export function summary(markdown) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, markdown + '\n');
  else console.log(markdown);
}

// Workflow annotations. The message is plain text from this repository's own files, never from event fields.
export const warning = (m) => console.log(`::warning::${String(m).replace(/[\r\n]+/g, ' ')}`);
export const error = (m) => console.log(`::error::${String(m).replace(/[\r\n]+/g, ' ')}`);
