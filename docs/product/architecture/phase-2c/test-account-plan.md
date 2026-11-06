# Test account plan (Phase 2C)

Written 2026-11-03. Public data only. Machine-readable addresses: [test-accounts.public.json](test-accounts.public.json). No secret appears here.

## Accounts

Each account is an independent random keypair generated on 2026-11-03; none is a personal wallet, none is an existing project account, none is Mainnet. Distinctness (5 different keys) and the secret-to-address round trip were verified.

| Acct | Role | Public address | Activated | XLM | Legacy token | Governed token |
|---|---|---|---|---|---|---|
| A | Session creator | `GDRHND3Y4FO6TM6ZT2TU27QO2TRNKOIXXWYBC75NW73DCYSTNSMYT5CR` | No (account not found) | 0 | 0 | 0 |
| B | Session joiner | `GB2G73P37CQCQR7U3RAZWRFJKLPEH2ONT3DC7E3FB5ADQRA3LPC4SV3T` | No | 0 | 0 | 0 |
| C | Debtor 1 | `GCWK6QC7WTDVUVFY7PAPKXJAIJXOOMNJMSDU3TM2WIXWAMM6VYEXOGWL` | No | 0 | 0 | 0 |
| D | Debtor 2 | `GCFEEEECS4IRNQLIT6MFOX3TR6GBZ2IQ7SZ7RANG577QBLJ57TTR2DLJ` | No | 0 | 0 | 0 |
| E | Creditor / recipient | `GB3VBLUGDDFBOT6CWMUUQAMUKNU7JQMDQDFBFA7G4NZBMK25TJU6EXUL` | No | 0 | 0 | 0 |

Balances were read on 2026-11-03 at about ledger 5,540,9xx by read-only Soroban RPC simulation of `balance` and a read-only account lookup. Nothing was submitted.

## Role mapping and the participant ceiling

A session admits at most 4 participants (`PARTICIPANT_CEILING`, `contracts/clearing/src/lib.rs`), the creator counts as one and is admitted automatically, and **every admitted participant must approve**. Therefore:

| Session | Participants | Why |
|---|---|---|
| Join tests (T4, T5, T9) | A (creator), B (joiner) | Join needs creator and joiner authorization |
| Single-debtor settlement (T6) | A, C, E | C owes E; A takes part and approves |
| Two-debtor settlement (T7) | A, C, D, E (exactly 4) | C and D owe E; B cannot also be in this session |

## Roles per test

| Test | Accounts | Signing |
|---|---|---|
| T3 | A | one entry, no transaction |
| T4 | B (joiner entry) with A as creator | entry only, no submission |
| T5 | A and B | both entries, submit |
| T6 | A, C, E | joins, C obligation, approvals, C settlement entry |
| T7 | A, C, D, E | as above with two debtor entries |
| T8, T9 | A, B | join-based |
| T10 to T12, T14 | A (and any) | wallet prompts |
| T13 | A, B | offline first |

## Account isolation

- Independent wallets (evidence level L4) require **two separate Freighter installations or browser profiles**: Profile 1 holds A, C, E; Profile 2 holds B, D. A joiner and a creator in one extension would show only that one extension can sign twice.
- Accounts hold only Testnet value; none is reused for anything else; Testnet resets periodically (per the Stellar documentation fetched 2026-11-03), after which all accounts and balances vanish and must be regenerated.

## Importing into Freighter (owner action; Claude never sees secrets)

1. Use a browser profile dedicated to testing; install Freighter; set the network to **Testnet** before importing.
2. In Freighter use "Import a Stellar secret key" for each account in that profile.
3. The secrets are stored DPAPI-encrypted in a per-user file under the Windows local application data folder in the `TobinTestKeys` directory, outside the repository. A helper script in that same directory, `import-helper.ps1` (reviewable; it contains no secret), is run by **you** in your own PowerShell window with `powershell.exe -STA -File import-helper.ps1`. It asks for the account letter at a prompt (never as a command-line argument), puts that one secret on the clipboard flagged with the Windows clipboard-history and cloud-sync exclusion format, prints nothing, and clears the clipboard when you press Enter. Its self-test (dummy value) confirmed the exclusion format is set; that Windows then really keeps the item out of Win+V history was **not** verified: test once with the `-SelfTest` switch and check the Win+V history yourself. Fallback: type the 56 characters manually from a console window you then close. Do not use `Set-Clipboard` or pass a secret on a command line.
4. Never paste a secret into a chat, prompt, document or terminal log, and never send it to Claude or any assistant. Do not use recovery phrases for these accounts.
5. After importing, tell Claude only the public addresses Freighter shows so they can be compared with the table above.
6. Delete the accounts from Freighter and the key file when the validation ends.

## Security limitations of the storage

DPAPI encryption binds the file to this Windows user account: other users or another machine cannot decrypt it. It does **not** protect against software running as the same Windows user, which includes the Claude Code session. Mitigation: the keys are disposable, Testnet-only and hold no value; they were never printed, logged or placed in the repository.
