param(
  [Parameter(Mandatory = $true)]
  [string]$Destination
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL must be set in the current process environment."
}

$databaseUri = [System.Uri]::new($env:DATABASE_URL)
if ($databaseUri.Scheme -notin @("postgres", "postgresql") -or -not $databaseUri.Host) {
  throw "DATABASE_URL must be a PostgreSQL URI."
}
$credentialSeparator = $databaseUri.UserInfo.IndexOf(":")
if ($credentialSeparator -lt 0) {
  throw "DATABASE_URL must include a PostgreSQL username and password."
}
$databaseUsername = [System.Uri]::UnescapeDataString($databaseUri.UserInfo.Substring(0, $credentialSeparator))
$databasePassword = [System.Uri]::UnescapeDataString($databaseUri.UserInfo.Substring($credentialSeparator + 1))

$destinationPath = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
$timestamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss-fff")
$backupPath = Join-Path $destinationPath "mma-postgres-$timestamp.dump"
$databasePort = if ($databaseUri.Port -gt 0) { $databaseUri.Port } else { 5432 }

$previousPgPassword = $env:PGPASSWORD
$env:PGPASSWORD = $databasePassword
$env:PGSSLMODE = "require"

try {
  & pg_dump `
    --host $databaseUri.Host `
    --port $databasePort `
    --username $databaseUsername `
    --dbname ([System.Uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart("/"))) `
    --format=custom `
    --no-owner `
    --no-acl `
    --file $backupPath

  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE."
  }
  & pg_restore --list $backupPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "pg_restore could not read the generated archive."
  }

  $backup = Get-Item -LiteralPath $backupPath
  if ($backup.Length -eq 0) {
    throw "pg_dump created an empty backup file."
  }
  $checksum = Get-FileHash -LiteralPath $backupPath -Algorithm SHA256
  Write-Output "Backup created: $backupPath"
  Write-Output "Size bytes: $($backup.Length)"
  Write-Output "SHA256: $($checksum.Hash)"
}
finally {
  if ($null -eq $previousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $previousPgPassword
  }
}
