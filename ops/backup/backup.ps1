<#
.SYNOPSIS
  Backup of the PostgreSQL database from Windows (needs Docker Desktop; nothing else to install).

.DESCRIPTION
  Runs pg_dump from the postgres Docker image into the compressed "custom" format, checks that the file can be
  listed, and deletes backups older than -KeepDays. A failed dump never replaces a good file.

.EXAMPLE
  $env:DATABASE_URL = 'postgresql://user:password@host/dbname?sslmode=require'
  .\ops\backup\backup.ps1

.EXAMPLE
  # Scheduled daily at 03:00 with Task Scheduler (see docs/DEPLOY.md):
  schtasks /Create /SC DAILY /ST 03:00 /TN "GEI Ranking backup" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\dev\gei-ranking\ops\backup\backup.ps1"
#>
[CmdletBinding()]
param(
  [string] $DatabaseUrl = $env:DATABASE_URL,
  [string] $BackupDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $PSScriptRoot '..\..\backups' }),
  [int] $KeepDays = $(if ($env:KEEP_DAYS) { [int]$env:KEEP_DAYS } else { 30 }),
  [string] $PgImage = $(if ($env:PG_IMAGE) { $env:PG_IMAGE } else { 'postgres:17' }),
  [string] $DockerNetwork = $env:DOCKER_NETWORK
)

$ErrorActionPreference = 'Stop'
if (-not $DatabaseUrl) { throw 'Set DATABASE_URL (postgresql://user:password@host/dbname?sslmode=require) or pass -DatabaseUrl.' }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$BackupDir = (Resolve-Path $BackupDir).Path
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$name = "gei-ranking-$stamp.dump"
$partial = Join-Path $BackupDir "$name.partial"
$final = Join-Path $BackupDir $name

$network = @(); if ($DockerNetwork) { $network = @('--network', $DockerNetwork) }

try {
  Write-Host 'Dumping the database...'
  # The file is written by pg_dump inside the container (volume), so PowerShell never re-encodes the binary stream.
  & docker run --rm @network -v "${BackupDir}:/backups" $PgImage pg_dump --format=custom --no-owner --no-privileges "--dbname=$DatabaseUrl" "--file=/backups/$name.partial"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit code $LASTEXITCODE)." }

  $size = (Get-Item $partial).Length
  if ($size -lt 2048) { throw "The dump is suspiciously small ($size bytes). Not keeping it." }

  & docker run --rm @network -v "${BackupDir}:/backups" $PgImage pg_restore --list "/backups/$name.partial" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The dump cannot be read back (pg_restore --list failed).' }

  Move-Item -Force $partial $final
}
finally {
  if (Test-Path $partial) { Remove-Item -Force $partial }
}

Get-ChildItem -Path $BackupDir -Filter 'gei-ranking-*.dump' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Force

$kept = (Get-ChildItem -Path $BackupDir -Filter 'gei-ranking-*.dump').Count
Write-Host ("Backup written: {0} ({1:N1} KB). Kept: {2} file(s), up to {3} days." -f $final, ((Get-Item $final).Length / 1KB), $kept, $KeepDays)
