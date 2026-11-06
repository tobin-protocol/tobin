# Read-only reconciliation of every SHA-256 inventory file against the committed tree and the members of the committed ZIPs.
# Reads ZIP members in memory (nested ZIPs included). Modifies nothing.   usage: -Root <export-of-HEAD>
param([Parameter(Mandatory=$true)][string]$Root)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sha = [Security.Cryptography.SHA256]::Create()
function Sha([byte[]]$b){ -join ($sha.ComputeHash($b) | ForEach-Object { $_.ToString('x2') }) }
$inZip = @{}      # hash -> list of 'zip!member'
$dups = New-Object Collections.Generic.List[string]
function Index-Zip([byte[]]$bytes, [string]$label) {
  $z = New-Object IO.Compression.ZipArchive((New-Object IO.MemoryStream(,$bytes)))
  $names = @{}
  foreach ($e in $z.Entries) {
    if ($e.FullName.EndsWith('/')) { continue }
    if ($names.ContainsKey($e.FullName)) { $dups.Add("$label :: duplicate member $($e.FullName)") } else { $names[$e.FullName]=1 }
    $s=$e.Open(); $o=New-Object IO.MemoryStream; $s.CopyTo($o); $s.Close(); $b=$o.ToArray()
    $h = Sha $b
    if (-not $inZip.ContainsKey($h)) { $inZip[$h] = New-Object Collections.Generic.List[string] }
    $inZip[$h].Add("$label!$($e.FullName)")
    if ($e.FullName.ToLower().EndsWith('.zip')) { Index-Zip $b "$label!$($e.FullName)" }
  }
  $z.Dispose()
}
foreach ($f in (Get-ChildItem -LiteralPath $Root -Recurse -Filter *.zip)) {
  $rel = $f.FullName.Substring($Root.Length).TrimStart('\','/') -replace '\\','/'
  Index-Zip ([IO.File]::ReadAllBytes($f.FullName)) $rel
}
$inv = Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object { $_.Name -match '^(SHA256SUMS\.txt|SHA256-INVENTORY\.txt|.*INVENTORY.*\.sha256|SHA256SUMS)$' }
$cnt = @{ disk_match=0; zip_only=0; disk_mismatch_zip_has=0; mismatch=0; missing=0 }
$rows = New-Object Collections.Generic.List[string]
foreach ($i in $inv) {
  $dir = $i.DirectoryName
  $irel = $i.FullName.Substring($Root.Length).TrimStart('\','/') -replace '\\','/'
  foreach ($line in [IO.File]::ReadAllLines($i.FullName)) {
    if ($line -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$') { continue }
    $h = $Matches[1].ToLower(); $p = $Matches[2] -replace '/','\'
    $full = Join-Path $dir $p
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $full = Join-Path (Split-Path $dir -Parent) $p }
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $dh = Sha ([IO.File]::ReadAllBytes($full))
      if ($dh -eq $h) { $cnt.disk_match++ }
      elseif ($inZip.ContainsKey($h)) { $cnt.disk_mismatch_zip_has++; $rows.Add("DISK-DIFFERS (zip has recorded bytes)`t$irel`t$($Matches[2])`t$($h.Substring(0,12))`t$($inZip[$h][0])") }
      else { $cnt.mismatch++; $rows.Add("MISMATCH`t$irel`t$($Matches[2])`t$($h.Substring(0,12))") }
    } elseif ($inZip.ContainsKey($h)) { $cnt.zip_only++; $rows.Add("ZIP-ONLY`t$irel`t$($Matches[2])`t$($h.Substring(0,12))`t$($inZip[$h][0])") }
    else { $cnt.missing++; $rows.Add("MISSING`t$irel`t$($Matches[2])`t$($h.Substring(0,12))") }
  }
}
"inventories read: $($inv.Count)"
"disk_match=$($cnt.disk_match) zip_only=$($cnt.zip_only) disk_differs_zip_has=$($cnt.disk_mismatch_zip_has) mismatch=$($cnt.mismatch) missing=$($cnt.missing) duplicate_zip_members=$($dups.Count)"
$rows
$dups
