# Read-only scan of every ZIP under a directory (members read in memory, nothing extracted, nested ZIPs descended).
# usage: powershell -File scan-zips.ps1 -Root <export-dir>
param([Parameter(Mandatory=$true)][string]$Root)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$latin1 = [Text.Encoding]::GetEncoding(28591)
$pat = [ordered]@{
  'account-name'  = ('(?i)' + 'ebu' + 'bechi')
  'user-path'     = '(?i)[A-Z]:[\\/]+Users[\\/]+'
  'home-path'     = '/home/[a-z0-9_-]+/'
  'appdata'       = '(?i)AppData[\\/]'
  'stellar-seed'  = '\bS[A-D][A-Z2-7]{54}\b'
  'pem-private'   = ('BEGIN [A-Z ]*PRIV' + 'ATE KEY')
  'token-like'    = '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})'
}
$tot = @{}; foreach($k in $pat.Keys){ $tot[$k]=0 }
$members = 0; $zips = 0
function Scan-Stream($name, [byte[]]$bytes, $zipLabel) {
  $script:members++
  $text = $latin1.GetString($bytes)
  foreach ($k in $pat.Keys) {
    $m = [regex]::Matches($text, $pat[$k])
    if ($m.Count -gt 0) {
      $script:tot[$k] += $m.Count
      $sample = ($m | Select-Object -First 1).Value
      if ($k -in 'stellar-seed','pem-private','token-like') { $sample = '<redacted>' } elseif ($k -in 'account-name','user-path') { $sample = '<account-specific path or name, not reproduced>' }
      "{0}`t{1}`t{2}`t{3}`t{4}" -f $k, $m.Count, $zipLabel, $name, $sample
    }
  }
  if ($name.ToLower().EndsWith('.zip')) {
    $ms = New-Object IO.MemoryStream(,$bytes)
    $z = New-Object IO.Compression.ZipArchive($ms)
    $script:zips++
    foreach ($e in $z.Entries) { if ($e.Length -eq 0) { continue }; $s=$e.Open(); $o=New-Object IO.MemoryStream; $s.CopyTo($o); $s.Close(); Scan-Stream $e.FullName $o.ToArray() ($zipLabel + '!' + $name) }
    $z.Dispose()
  }
}
foreach ($f in (Get-ChildItem -LiteralPath $Root -Recurse -Filter *.zip)) {
  $rel = $f.FullName.Substring($Root.Length).TrimStart('\','/') -replace '\\','/'
  $zips++
  $z = [IO.Compression.ZipFile]::OpenRead($f.FullName)
  foreach ($e in $z.Entries) { if ($e.Length -eq 0) { continue }; $s=$e.Open(); $o=New-Object IO.MemoryStream; $s.CopyTo($o); $s.Close(); Scan-Stream $e.FullName $o.ToArray() $rel }
  $z.Dispose()
}
"SUMMARY zips=$zips members=$members " + (($tot.Keys | ForEach-Object { "$_=" + $tot[$_] }) -join ' ')
