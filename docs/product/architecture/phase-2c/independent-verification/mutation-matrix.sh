#!/usr/bin/env bash
# Mutation matrix for the B1 baseline. Works ONLY on temporary copies of the signer directory; the real directory is never modified.
# Runs three implementations on each mutant: (S) verify-b1-coreutils.sh, (N) scripts/tst-signer-verify/verify-signer-baseline.cjs,
# (G) the in-signer gate via the launcher: `node tst-signer.cjs --approved-baseline <B1> baseline` is NOT used (it only prints); the gate
# is exercised through its `preview` command, which stops at the gate: exit 4 = integrity refusal, 0/1/3 = gate passed. `preview` with an
# approved hash passes the gate and would then run the application's preview, which needs an absent config and refuses before any key, SDK
# call or network (exit non-4). Here HOME/TEMP/LOCALAPPDATA are redirected to a throwaway dir for safety.
# usage: mutation-matrix.sh <repo-root>
set -u
ROOT=$(cd "$1" && pwd)
V="$ROOT/docs/product/architecture/phase-2c/independent-verification/verify-b1-coreutils.sh"
EXT="$ROOT/scripts/tst-signer-verify/verify-signer-baseline.cjs"
SDKPKG="$ROOT/scripts/tst-signer/pk/x-stellar-stellar-sdk-17.4.0/package"
B1=83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e
SB=$(mktemp -d); export TEMP=$SB TMP=$SB LOCALAPPDATA=$SB

run() { # name, mutate-function
  local name=$1; local D; D=$(mktemp -d); mkdir -p "$D/pk"; cp -r "$ROOT/scripts/tst-signer/signer" "$D/signer"; cp -r "$ROOT/scripts/tst-signer/pk/x-stellar-stellar-sdk-17.4.0" "$D/pk/"; rm -rf "$D/signer/test"
  "$2" "$D/signer"
  bash "$V" "$D/signer" "$SDKPKG" "$B1" >/dev/null 2>&1; local s=$?
  node "$EXT" --signer-dir "$D/signer" --expected "$B1" --sdk-dir "$SDKPKG" >/dev/null 2>&1; local n=$?
  # gate: only if launcher exists and is runnable in the mutated copy
  local g verdict=OK
  if [ "$name" = none ]; then
    # control: the gate must report the approved hash. Uses `baseline`, which loads no application module, so the application never runs.
    ( cd "$D/signer" && node tst-signer.cjs baseline 2>/dev/null | grep -q "candidate baseline: $B1" ); g=$?
    [ $s -eq 0 ] && [ $n -eq 0 ] && [ $g -eq 0 ] || verdict=CHECK
  else
    # mutant: `preview` with the approved pin. A correct gate refuses (exit 4, or 2 for malformed input) BEFORE any application module loads.
    ( cd "$D/signer" && node tst-signer.cjs --approved-baseline "$B1" preview deploy >/dev/null 2>&1 ); g=$?
    [ $s -ne 0 ] && [ $n -ne 0 ] && { [ $g -eq 4 ] || [ $g -eq 2 ]; } || verdict=CHECK
  fi
  printf '%-34s S=%s N=%s G=%s  %s\n' "$name" $s $n $g $verdict
}
m_none()      { :; }
m_modify()    { printf '// x\n' >> "$1/refusal.cjs"; }
m_missing()   { rm "$1/state-store.cjs"; }
m_extra()     { printf '1' > "$1/extra.cjs"; }
m_hidden()    { printf '1' > "$1/.hidden"; }
m_crlf()      { sed -i 's/$/\r/' "$1/pinned.cjs"; }
m_bom()       { { printf '\xef\xbb\xbf'; cat "$1/pinned.cjs"; } > "$1/p.tmp" && mv "$1/p.tmp" "$1/pinned.cjs"; }
m_badutf8()   { printf '\xff\xfe' >> "$1/authorization.cjs"; }
m_config()    { printf '{}\n' > "$1/deployment-config.json"; }
m_pinned()    { sed -i 's/PINNED_CONFIG_SHA256: null/PINNED_CONFIG_SHA256: "00"/' "$1/pinned.cjs"; }
m_unreadable(){ chmod 000 "$1/dpapi-key.cjs"; [ -r "$1/dpapi-key.cjs" ] && echo "  (chmod 000 not enforced on this platform: mutant is not a valid unreadable-file test)" >&2; }
m_dirasfile() { rm "$1/refusal.cjs"; mkdir "$1/refusal.cjs"; }
m_symlink()   { rm "$1/refusal.cjs"; ln -s ../../../../README.md "$1/refusal.cjs" 2>/dev/null || cp /dev/null "$1/refusal.cjs"; }
m_traversal() { rm "$1/refusal.cjs"; printf "module.exports=require('../../../../etc/x');\n" > "$1/refusal.cjs"; }

echo "baseline under test: $B1   (S=shell coreutils, N=node external, G=in-signer gate via launcher; exit codes)"
for t in none:m_none modify:m_modify missing:m_missing extra-file:m_extra hidden-file:m_hidden crlf:m_crlf bom:m_bom invalid-utf8:m_badutf8 config-present:m_config pinned-changed:m_pinned dir-as-file:m_dirasfile symlink:m_symlink traversal-require:m_traversal; do
  run "${t%%:*}" "${t##*:}"
done
echo "(unreadable-file case: NOT VERIFIED on this platform, chmod 000 is not enforced on NTFS; it would also let the gate pass and start the application. Not covered here.)"
echo "--- wrong approved pin / malformed pins (gate and external tool; launcher must exit 2 or 4, never run)"
D=$(mktemp -d); mkdir -p "$D/pk"; cp -r "$ROOT/scripts/tst-signer/signer" "$D/signer"; cp -r "$ROOT/scripts/tst-signer/pk/x-stellar-stellar-sdk-17.4.0" "$D/pk/"
for p in 0000000000000000000000000000000000000000000000000000000000000000 83F11A7F5CA4DCE244DDE39F69B19442711902137B8CBA8BA3BEB7F446C8733E 83f11a7f "" ; do
  ( cd "$D/signer" && node tst-signer.cjs --approved-baseline "$p" preview deploy >/dev/null 2>&1 ); g=$?
  node "$EXT" --signer-dir "$D/signer" --expected "$p" --sdk-dir "$SDKPKG" >/dev/null 2>&1; n=$?
  bash "$V" "$D/signer" "$SDKPKG" "$p" >/dev/null 2>&1; s=$?
  printf 'pin=%-12s G=%s N=%s S=%s\n' "${p:0:10}.." $g $n $s
done
echo "--- malformed manifest (external tool --manifest)"
printf 'garbage\n' > "$D/bad-manifest.txt"
node "$EXT" --signer-dir "$D/signer" --expected "$B1" --sdk-dir "$SDKPKG" --manifest "$D/bad-manifest.txt" >/dev/null 2>&1; echo "bad manifest N=$?"
printf 'TOBIN-TST-SIGNER-BASELINE v1\n' > "$D/bad-manifest2.txt"
node "$EXT" --signer-dir "$D/signer" --expected "$B1" --sdk-dir "$SDKPKG" --manifest "$D/bad-manifest2.txt" >/dev/null 2>&1; echo "header-only manifest N=$?"
echo "sandbox leftovers: $(ls "$SB" | wc -l)"
