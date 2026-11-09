// Zod 4 compiles its object parsers with `new Function` when the environment allows it. The Content-Security-Policy refuses eval, so every page load would
// raise a violation report before zod falls back. Turn the compiler off up front (the interpreted path is used; validation behaviour is identical).
import { z } from "zod";

z.config({ jitless: true });
