$ErrorActionPreference = 'Stop'
$parent = Split-Path -Parent $PSScriptRoot
& (Join-Path $parent 'Convert-Script.ps1') -OutputPath (Join-Path $PSScriptRoot 'script.json')
Write-Host 'Web script updated. Restart the local web server, or commit web/script.json and redeploy on Render.'
