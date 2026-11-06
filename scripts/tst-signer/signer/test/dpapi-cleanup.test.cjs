'use strict';
// BSTR cleanup of the production DPAPI script (revision 5). The PRODUCTION PowerShell function `Read-TobinSecret` (exported as
// DPAPI_FUNCTION and embedded verbatim in DPAPI_SCRIPT) is run in a real PowerShell with instrumented stand-ins for the three unmanaged
// operations, and with the real ones. Only a dummy SecureString is used; no DPAPI blob, no key file, no real key, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const { DPAPI_FUNCTION, DPAPI_SCRIPT } = require('../dpapi-key.cjs');

const WIN = process.platform === 'win32';
const T = WIN ? {} : { skip: 'Windows-only (runs PowerShell)' };
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim();

// A disposed SecureString cannot be converted any more (reading .Length silently yields nothing in PowerShell, so it is not a usable probe).
const ALIVE_PROBE = "try { $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p); [void]$log.Add('secure:alive') } catch { [void]$log.Add('secure:disposed') }";

// Runs the production function with fakes. `mode` selects what the fake BSTR-to-string (or allocation) does.
function harness({ allocThrows = false, toStringThrows = false, freeThrows = false } = {}) {
  return ps([
    DPAPI_FUNCTION,
    '$log = New-Object System.Collections.ArrayList',
    "$secure = ConvertTo-SecureString 'dummy-not-a-key' -AsPlainText -Force",
    `$toB = { param($s) [void]$log.Add('alloc'); ${allocThrows ? "throw 'boom'" : '[IntPtr]12345'} }`,
    `$toS = { param($p) [void]$log.Add('tostring:' + $p.ToInt64()); ${toStringThrows ? "throw 'boom'" : "'dummy'"} }`,
    `$free = { param($p) [void]$log.Add('free:' + $p.ToInt64()); ${freeThrows ? "throw 'boom'" : ''} }`,
    "try { $r = Read-TobinSecret -Secure $secure -ToBstr $toB -BstrToString $toS -FreeBstr $free; [void]$log.Add('result:' + $r) } catch { [void]$log.Add('threw') }",
    ALIVE_PROBE,
    "($log -join '|')",
  ].join('\n'));
}

test('control: the probe reports a SecureString that was never disposed as alive and a disposed one as disposed', T, () => {
  const out = ps(["$log = New-Object System.Collections.ArrayList", "$secure = ConvertTo-SecureString 'dummy-not-a-key' -AsPlainText -Force", ALIVE_PROBE, "$secure.Dispose()", ALIVE_PROBE, "($log -join '|')"].join('\n'));
  assert.equal(out, 'secure:alive|secure:disposed');
});

test('the BSTR is zeroed and freed on success, and the SecureString is disposed', T, () => {
  assert.equal(harness(), 'alloc|tostring:12345|free:12345|result:dummy|secure:disposed');
});

test('the BSTR is zeroed and freed when the conversion to text fails after the allocation', T, () => {
  assert.equal(harness({ toStringThrows: true }), 'alloc|tostring:12345|free:12345|threw|secure:disposed');
});

test('nothing is freed when the allocation itself fails (nothing was allocated); the SecureString is still disposed', T, () => {
  assert.equal(harness({ allocThrows: true }), 'alloc|threw|secure:disposed');
});

test('a failure inside the free step does not skip the disposal, and is not swallowed', T, () => {
  assert.equal(harness({ freeThrows: true }), 'alloc|tostring:12345|free:12345|threw|secure:disposed');
});

test('with the real unmanaged operations the function round-trips a dummy value, frees without error, and disposes the SecureString', T, () => {
  const out = ps([DPAPI_FUNCTION, "$secure = ConvertTo-SecureString 'dummy-not-a-key' -AsPlainText -Force", '$r = Read-TobinSecret -Secure $secure',
    "try { $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p); $alive = 'alive' } catch { $alive = 'disposed' }", "'' + $r + '|' + $alive"].join('\n'));
  assert.equal(out, 'dummy-not-a-key|disposed');
});

test('the tested function is the production function, and the production script has the required shape', () => {
  assert.ok(DPAPI_SCRIPT.includes(DPAPI_FUNCTION), 'the script must embed the tested function verbatim');
  assert.equal((DPAPI_SCRIPT.match(/Read-TobinSecret -Secure/g) || []).length, 1);
  const fin = DPAPI_FUNCTION.slice(DPAPI_FUNCTION.indexOf('finally'));
  assert.match(fin, /ZeroFreeBSTR|\$FreeBstr/);                                                  // the free is inside the finally block
  assert.match(DPAPI_FUNCTION, /ZeroFreeBSTR/); assert.match(DPAPI_FUNCTION, /PtrToStringBSTR/); assert.match(DPAPI_FUNCTION, /SecureStringToBSTR/);
  assert.ok(!/PtrToStringAuto/.test(DPAPI_SCRIPT) && !/[^o]FreeBSTR/.test(DPAPI_SCRIPT.replace(/ZeroFreeBSTR/g, '')), 'no non-zeroing free, no ANSI/auto conversion');
  assert.ok(DPAPI_FUNCTION.indexOf('SecureStringToBSTR') < DPAPI_FUNCTION.indexOf('try') + 400);
  assert.ok(DPAPI_FUNCTION.indexOf('try {') < DPAPI_FUNCTION.indexOf('& $ToBstr $Secure'), 'the allocation happens inside the try block');
  assert.ok(DPAPI_FUNCTION.indexOf('finally') > DPAPI_FUNCTION.indexOf('return'), 'cleanup follows the return inside the same try/finally');
  assert.ok(!/Write-Host|Write-Output|Write-Error|Out-File|Set-Content|Add-Content|\bTee-Object\b/.test(DPAPI_SCRIPT), 'the script never prints or writes anything but its single result');
  assert.ok(!/-AsPlainText/.test(DPAPI_SCRIPT), 'the production script never converts plain text into a SecureString');
  assert.ok(!/\$env:(?!LOCALAPPDATA)/.test(DPAPI_SCRIPT) && !DPAPI_SCRIPT.includes('param($args'), 'no other environment or argument is read');
});
