# TST signer: historical scratchpad material (33 files)

**Archive only. Not part of the signer. Nothing here is to be executed.**

These are the 33 files of the original working directory that were not migrated into `scripts/tst-signer/` (see `scripts/tst-signer/SOURCE-INVENTORY.sha256`).
They are kept so that the Revision 4 and 5 history is not lost when the temporary session folder is purged. They are stored as a single ZIP, with the
original relative paths under `tst-signer-scratchpad/`, so that none of this code sits in the tree as a runnable file.

| Category | What it is | Safe to run? |
|---|---|---|
| Historical patch / finalize scripts (`patch-*.cjs`, `finalize-*.cjs`) | one-off scripts that rewrote the signer or its tests during Revisions 4 and 5 | **No.** They overwrite files in a directory that no longer exists in that form |
| Evidence / probe scripts (`dryrun-live`, `asm`, `auth-probe`, `auth-evidence`, `evidence`) | live-network or key-directory helpers used while producing evidence | **No.** They may contact the Stellar RPC or read the key directory |
| Validation / mutation scripts (`mutate`, `windows-validation`, `acl-experiment`) | rewrite signer files, create files, or change ACLs | **No** |
| Sample generators (`sample-gen`, `preview-sample`) | print redacted sample output | not needed |
| Logs, templates, notes, sample output | documentation | read only |
| `test/old.bak` | a superseded test body | not runnable |

`SHA256-INVENTORY.txt` lists each file's SHA-256, size, original relative path and category. The hashes equal those recorded at migration time, and equal the
hashes of the files extracted from this archive (checked when the archive was built). None of these files is part of the runtime closure or of any baseline.
The original scratchpad folder was not deleted by this work.
