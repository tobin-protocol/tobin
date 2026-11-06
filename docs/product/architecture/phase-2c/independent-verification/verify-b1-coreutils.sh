#!/usr/bin/env bash
# Third reconstruction of the TST signer baseline (B0 candidate / B1), written from the manifest procedure v1 only.
# Toolchain differs from the other implementations: bash + coreutils (sha256sum, sort, iconv, od). No Node, no .NET, no shared code.
# SAME AUTHOR as the others: this is an independent IMPLEMENTATION, not an independent REVIEW.
#
# usage: verify-b1-coreutils.sh <signer-dir> <sdk-package-dir> <expected-64-hex> [b0|b1]
# exit: 0 MATCH, 1 MISMATCH, 2 REFUSED (fail closed)
set -u
export LC_ALL=C
refuse() { echo "REFUSED: $*" >&2; exit 2; }
[ $# -ge 3 ] || refuse "usage"
SIGNER=$1; SDK=$2; EXPECTED=$3; MODE=${4:-b1}
printf '%s' "$EXPECTED" | grep -Eq '^[0-9a-f]{64}$' || refuse "expected value is not 64 lowercase hex"
[ -d "$SIGNER" ] && [ ! -L "$SIGNER" ] || refuse "signer dir missing or a symlink"
[ -d "$SDK" ] && [ ! -L "$SDK" ] || refuse "sdk dir missing or a symlink"

if [ "$MODE" = b1 ]; then
  FILES="authorization.cjs baseline.cjs dpapi-key.cjs pinned.cjs refusal.cjs sdk-loader.cjs state-store.cjs tst-signer-core.cjs tst-signer-main.cjs tst-signer.cjs"
  ALLOWED=" $FILES make-deployment-config.cjs test deployment-config.json "
elif [ "$MODE" = hist ]; then
  FILES="authorization.cjs dpapi-key.cjs refusal.cjs sdk-loader.cjs state-store.cjs tst-signer-core.cjs tst-signer.cjs"
  ALLOWED=" $FILES pinned.cjs make-deployment-config.cjs test deployment-config.json "
else
  FILES="authorization.cjs dpapi-key.cjs pinned.cjs refusal.cjs sdk-loader.cjs state-store.cjs tst-signer-core.cjs tst-signer.cjs"
  ALLOWED=" $FILES make-deployment-config.cjs test deployment-config.json "
fi

# 1. nothing unexpected in the directory (including hidden entries and symlinks)
for p in "$SIGNER"/* "$SIGNER"/.[!.]* "$SIGNER"/..?*; do
  [ -e "$p" ] || [ -L "$p" ] || continue
  n=$(basename "$p")
  case "$ALLOWED" in *" $n "*) ;; *) refuse "unexpected entry: $n";; esac
  [ ! -L "$p" ] || refuse "symlink: $n"
done

text_hash() { # refuse CR, BOM, invalid UTF-8
  f=$1
  [ -f "$f" ] && [ ! -L "$f" ] || refuse "missing or not a regular file: $f"
  [ -r "$f" ] || refuse "unreadable: $f"
  tr -d '\r' <"$f" | cmp -s - "$f" || refuse "CR in $f"
  [ "$(head -c3 "$f" | od -An -tx1 | tr -d ' \n')" != efbbbf ] || refuse "BOM in $f"
  iconv -f UTF-8 -t UTF-8 "$f" >/dev/null 2>&1 || refuse "invalid UTF-8 in $f"
  sha256sum "$f" | cut -d' ' -f1
}
raw_hash() { f=$1; [ -f "$f" ] && [ ! -L "$f" ] && [ -r "$f" ] || refuse "sdk file missing/unreadable: $f"; sha256sum "$f" | cut -d' ' -f1; }

TMP=$(mktemp) || refuse "mktemp"
trap 'rm -f "$TMP"' EXIT
for f in $FILES; do printf '%s\t%s\n' "file:$f" "$(text_hash "$SIGNER/$f")" >>"$TMP" || refuse "write"; done
if [ -e "$SIGNER/deployment-config.json" ]; then printf '%s\t%s\n' "config:deployment-config.json" "$(text_hash "$SIGNER/deployment-config.json")" >>"$TMP"
else printf '%s\t%s\n' "config:deployment-config.json" ABSENT >>"$TMP"; fi
printf '%s\t%s\n' "external:@stellar/stellar-sdk@17.4.0/package.json" "$(raw_hash "$SDK/package.json")" >>"$TMP"
printf '%s\t%s\n' "external:@stellar/stellar-sdk@17.4.0/dist/stellar-sdk.js" "$(raw_hash "$SDK/dist/stellar-sdk.js")" >>"$TMP"

MAN=$(mktemp); trap 'rm -f "$TMP" "$MAN"' EXIT
printf 'TOBIN-TST-SIGNER-BASELINE v1\n' >"$MAN"
sort -t "$(printf '\t')" -k1,1 "$TMP" | awk -F'\t' '{printf "%s  %s\n", $2, $1}' >>"$MAN"
GOT=$(sha256sum "$MAN" | cut -d' ' -f1)
[ "${PRINT_MANIFEST:-0}" = 1 ] && cat "$MAN"
echo "computed: $GOT"; echo "expected: $EXPECTED"
if [ "$GOT" = "$EXPECTED" ]; then echo "VERIFY: MATCH"; exit 0; else echo "VERIFY: MISMATCH"; exit 1; fi
