# Reflection and prototype policy (Revision 6.3 CANDIDATE, NOT APPROVED)

Two mechanisms apply together: **binding resolution** (the global is not reachable) and **name blocks** (defence in depth).

| Construct | Status | Rule that refuses it | How |
|---|---|---|---|
| `Reflect`, `Reflect.apply/construct/get/getOwnPropertyDescriptor` | refused | `G1` | `Reflect` is a free identifier not on the free-identifier allowlist; it is refused wherever it appears, including with environment-derived keys |
| `Proxy` | refused | `G1` | free identifier not allowed |
| `Object.getPrototypeOf`, `setPrototypeOf`, `defineProperty/ies`, `getOwnPropertyDescriptor(s)`, `getOwnPropertyNames`, `create` | refused | `G1` (and `N1` on the name) | `Object` is allowed only as `Object.keys / entries / freeze` calls; any other member is refused, and the names are blocked as properties |
| `.constructor` | refused | `N1` | blocked property name, string and template text; also `({}).constructor`, `(function(){}).constructor`, `(async () => {}).constructor` |
| `__proto__` (member or object key) | refused | `N1` | blocked name; `{ __proto__: x }` as an object key is refused too |
| `.prototype` | refused | `N1` | blocked name |
| getters and setters in object literals | refused | `N1` | only `init` properties are accepted |
| computed object keys `{ [k]: v }` | refused | `K1` | not accepted |
| `eval`, `Function`, `new Function`, `Function(…)` | refused | `G1` | free identifiers not allowed; `eval` / `Function` cannot be declared either (`S1`) |
| `.call`, `.apply`, `.bind` on a capability | refused | `C1` | a capability cannot be the object of a member access except the approved `x.member(…)` call form |
| `.apply`, `.bind` on any value | refused | `N1` | blocked names (`.call` is not blocked because the SDK's `Contract.call` is used; see the allowlist specification) |
| optional chaining `a?.b`, `a?.[k]`, `a?.()` | refused | `A1` | `ChainExpression` is not an accepted node type |
| computed access to a reflective API (`Object['getPrototypeOf']`, `Reflect[k]`) | refused | `K1` / `G1` | `Object` and `Reflect` cannot be indexed; computed access needs a bounded key on a non-capability object |
| sequence-detached callee `(0, f)(…)` | refused | `A1` | `SequenceExpression` not accepted |
| tagged templates ``f`x` `` | refused | `A1` | `TaggedTemplateExpression` not accepted |
| `globalThis`, `global`, `self`, `window`, `frames` | refused except the G1/G2/G3 tokens | `T1` / `G1` / `N1` | exact whole-statement patterns only |
| `process.binding`, `process.mainModule`, `process.getBuiltinModule`, `process.dlopen` | refused | `C1` | `process` only has the listed members in the listed positions |
| `vm.*` other than the pattern V2 call | refused | `T1` | |
| `import()` | refused | `A1` | `ImportExpression` not accepted |
| `with`, labels, generators, `this` | refused | `A1` | node types not accepted |

The analyzer does **not** rely on the spelling of a string alone: the name block is a second layer behind "the capability cannot be obtained" and "computed keys must be bounded". A reflective path that avoids every listed name *and* every listed syntax would need a capability that is already unobtainable.

Limits: this is a policy over the eight files' language, not a proof that no JavaScript gadget exists. Behaviour of the SDK bundle after loading, and of Node built-ins reached by approved calls with hostile arguments, is out of scope (see the capability specification, "Known residuals").
