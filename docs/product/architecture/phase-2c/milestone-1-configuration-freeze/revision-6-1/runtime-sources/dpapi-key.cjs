'use strict';
// Key-loading boundary for the future admin account F. Decrypts a DPAPI-protected file IN MEMORY ONLY.
// - the secret is never written to disk, never placed in a command-line argument, never included in an error message;
// - the derived public key must equal the configured F address;
// - buffers are zero-filled where the runtime allows (JavaScript strings and the SDK keypair cannot be erased on demand).
const { execFileSync } = require('child_process');
const { redact } = require('./refusal.cjs');

// The PowerShell text is a constant: it contains no secret and no caller-controlled value. The file name is fixed.
//
// BSTR cleanup (revision 5). Converting a SecureString to plain text goes through an unmanaged BSTR. `Read-TobinSecret` allocates it
// with SecureStringToBSTR and, in a `finally` block, ALWAYS zeroes and frees it with ZeroFreeBSTR, on success and on every failure after
// the allocation (nothing is freed if the allocation itself failed, because nothing was allocated), and disposes the SecureString.
// The three unmanaged operations are replaceable script blocks only so that the cleanup can be tested with instrumented fakes; the
// production call uses the defaults. The plain-text string that PowerShell returns is a managed string and cannot be erased on demand;
// it travels to the parent process through the stdout pipe only.
const DPAPI_FUNCTION = [
  'function Read-TobinSecret {',
  '  param([Parameter(Mandatory = $true)][System.Security.SecureString]$Secure,',
  '        [scriptblock]$ToBstr = { param($s) [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s) },',
  '        [scriptblock]$BstrToString = { param($p) [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) },',
  '        [scriptblock]$FreeBstr = { param($p) [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) })',
  '  $bstr = [IntPtr]::Zero',
  '  try {',
  '    $bstr = & $ToBstr $Secure',
  '    return (& $BstrToString $bstr)',
  '  } finally {',
  '    try { if ($bstr.ToInt64() -ne 0) { & $FreeBstr $bstr } } finally { $Secure.Dispose() }',
  '  }',
  '}',
].join('\n');

const DPAPI_SCRIPT = DPAPI_FUNCTION + '\n' +
  "$f = Join-Path $env:LOCALAPPDATA 'TobinTestKeys\\settlement-token-admin.dpapi'; " +
  '$s = (Get-Content -Raw $f).Trim() | ConvertTo-SecureString; ' +
  'Read-TobinSecret -Secure $s';

/** Default decryptor: returns a Buffer holding the secret text. Never logs or echoes any output of the child process. */
function decryptWithDpapi(opts = {}) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DPAPI_SCRIPT],
      { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env: opts.env || process.env });
  } catch {
    throw new Error('the admin key file is missing or cannot be decrypted'); // deliberately generic
  }
}

function loadAdminKey(S, expectedPublic, decrypt = decryptWithDpapi) {
  let buf;
  try { buf = decrypt(); } catch { throw new Error('the admin key file is missing or cannot be decrypted'); }
  let text = '';
  try {
    text = Buffer.from(buf).toString('utf8').trim();
    if (!S.StrKey.isValidEd25519SecretSeed(text)) throw new Error('the admin key is not a valid secret seed');
    const kp = S.Keypair.fromSecret(text);
    if (kp.publicKey() !== expectedPublic) throw new Error('the admin key does not match the configured F address');
    return kp;
  } catch (e) {
    throw new Error(redact(e.message, [text]));
  } finally {
    if (Buffer.isBuffer(buf)) buf.fill(0);
    text = '';
  }
}

module.exports = { loadAdminKey, decryptWithDpapi, DPAPI_SCRIPT, DPAPI_FUNCTION };
