# Revision 6.3 CANDIDATE (NOT APPROVED): inventories produced by the analyzer from the eight runtime files

## require() calls (22)

| file | line | spec | form |
|---|---|---|---|
| authorization.cjs | 14 | ./refusal.cjs | local |
| dpapi-key.cjs | 6 | child_process | destructure |
| dpapi-key.cjs | 7 | ./refusal.cjs | local |
| sdk-loader.cjs | 4 | fs | whole |
| sdk-loader.cjs | 5 | path | whole |
| sdk-loader.cjs | 6 | crypto | whole |
| sdk-loader.cjs | 7 | vm | whole |
| state-store.cjs | 11 | fs | whole |
| state-store.cjs | 12 | crypto | whole |
| state-store.cjs | 13 | path | whole |
| state-store.cjs | 14 | child_process | destructure |
| tst-signer-core.cjs | 9 | crypto | whole |
| tst-signer-core.cjs | 41 | ./refusal.cjs | local |
| tst-signer-core.cjs | 42 | ./authorization.cjs | local |
| tst-signer.cjs | 12 | fs | whole |
| tst-signer.cjs | 13 | path | whole |
| tst-signer.cjs | 14 | readline | whole |
| tst-signer.cjs | 15 | ./sdk-loader.cjs | local |
| tst-signer.cjs | 16 | ./tst-signer-core.cjs | local |
| tst-signer.cjs | 17 | ./dpapi-key.cjs | local |
| tst-signer.cjs | 18 | ./state-store.cjs | local |
| tst-signer.cjs | 19 | ./pinned.cjs | local |

## Process-execution calls (3)

| file | line | AST node | capability | called as | in function | target |
|---|---|---|---|---|---|---|
| dpapi-key.cjs | 41 | CallExpression | child_process.execFileSync | execFileSync | decryptWithDpapi | powershell.exe |
| state-store.cjs | 64 | CallExpression | child_process.execFileSync | exec | inspectAcl | powershell.exe |
| state-store.cjs | 99 | CallExpression | child_process.execFileSync | exec | restrictOwnerOnly | icacls |

## Reads of process.env (3)

| file | line |
|---|---|
| dpapi-key.cjs | 42 |
| state-store.cjs | 62 |
| tst-signer.cjs | 21 |

## Other process members used (7)

| file | line | member |
|---|---|---|
| state-store.cjs | 86 | platform |
| state-store.cjs | 96 | platform |
| tst-signer.cjs | 40 | argv |
| tst-signer.cjs | 43 | exit |
| tst-signer.cjs | 61 | stdin |
| tst-signer.cjs | 61 | stdout |
| tst-signer.cjs | 69 | exit |

## Computed member reads (every one has a proven bounded key or an explicit approval) (22)

| file | line | text | class |
|---|---|---|---|
| authorization.cjs | 137 | a[i] | bounded-key |
| authorization.cjs | 137 | b[i] | bounded-key |
| authorization.cjs | 140 | a[k] | bounded-key |
| authorization.cjs | 140 | b[k] | bounded-key |
| authorization.cjs | 178 | expected[i] | bounded-key |
| authorization.cjs | 179 | expected[i] | bounded-key |
| state-store.cjs | 143 | state[k] | bounded-key |
| tst-signer-core.cjs | 113 | probe.operations[0] | bounded-key |
| tst-signer-core.cjs | 154 | tx.operations[0] | bounded-key |
| tst-signer-core.cjs | 198 | want[part] | bounded-key |
| tst-signer-core.cjs | 198 | got[part] | bounded-key |
| tst-signer-core.cjs | 199 | got[part] | bounded-key |
| tst-signer-core.cjs | 199 | want[part] | bounded-key |
| tst-signer-core.cjs | 202 | got[part] | bounded-key |
| tst-signer-core.cjs | 202 | want[part] | bounded-key |
| tst-signer-core.cjs | 205 | cfg.resourceLimits[opName] | explicit |
| tst-signer-core.cjs | 208 | used[k] | bounded-key |
| tst-signer-core.cjs | 208 | used[k] | bounded-key |
| tst-signer-core.cjs | 209 | used[k] | bounded-key |
| tst-signer-core.cjs | 209 | lim[k] | bounded-key |
| tst-signer-core.cjs | 209 | used[k] | bounded-key |
| tst-signer-core.cjs | 209 | lim[k] | bounded-key |

## Exact approved patterns (sdk-loader.cjs) (8)

| file | line | id |
|---|---|---|
| sdk-loader.cjs | 11 | P_CONST |
| sdk-loader.cjs | 21 | P_BUNDLE |
| sdk-loader.cjs | 22 | P_SHA |
| sdk-loader.cjs | 23 | P_CHECK |
| sdk-loader.cjs | 24 | G1 |
| sdk-loader.cjs | 25 | V2 |
| sdk-loader.cjs | 26 | G2 |
| sdk-loader.cjs | 27 | G3 |

## AST node types present in the eight files (all are on the allowlist)

ArrayExpression: 55
ArrowFunctionExpression: 45
AssignmentExpression: 54
AwaitExpression: 32
BinaryExpression: 221
BlockStatement: 94
CallExpression: 614
ClassBody: 2
ClassDeclaration: 2
ConditionalExpression: 19
ExpressionStatement: 232
ForOfStatement: 10
ForStatement: 2
FunctionDeclaration: 54
FunctionExpression: 2
Identifier: 1765
IfStatement: 181
Literal: 631
LogicalExpression: 119
MemberExpression: 858
NewExpression: 68
ObjectExpression: 115
Program: 8
Property: 339
ReturnStatement: 101
SpreadElement: 10
SwitchStatement: 1
TemplateElement: 237
TemplateLiteral: 97
ThrowStatement: 35
TryStatement: 28
UnaryExpression: 91
UpdateExpression: 2
VariableDeclaration: 203
