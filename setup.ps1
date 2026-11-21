# setup.ps1 - first-run setup brain for Muse CLI GUI. Called by MuseCLIGUI.exe.
# Stage 1 (before bridge): ensure node + ws dependency, check muse CLI.
# Stage 2 (bridge running): persist API key env, install cwd plugin, wire OpenCode provider.
# Idempotent: every step is a no-op when already satisfied. Exit 0 = ok
# (warnings in .setup-warnings.txt), exit 1 = fatal (.setup-error.txt).
# Windows PowerShell 5.1 compatible (ships with Windows 10/11).
param(
  [Parameter(Mandatory = $true)][string]$AppDir,
  [Parameter(Mandatory = $true)][int]$Stage,
  [string]$ConfigPath = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WARN_FILE = Join-Path $AppDir '.setup-warnings.txt'
$ERR_FILE = Join-Path $AppDir '.setup-error.txt'
$LOG_FILE = Join-Path $AppDir 'setup.log'
$NODE_FALLBACK = 'v26.13.1'
$WS_FALLBACK_TGZ = 'https://registry.npmjs.org/ws/-/ws-8.23.0.tgz'

function Log($msg) {
  try { Add-Content -Path $LOG_FILE -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss ') + $msg) } catch {}
}
function Warn($msg) {
  Log('WARN: ' + $msg)
  try { Add-Content -Path $WARN_FILE -Value $msg } catch {}
}
function Fail($msg) {
  Log('FATAL: ' + $msg)
  try { Set-Content -Path $ERR_FILE -Value $msg } catch {}
  exit 1
}
function Test-Node($exe) {
  try {
    $o = & $exe --version 2>&1
    return ($LASTEXITCODE -eq 0) -and ("$o" -match '^v\d+')
  } catch { return $false }
}

function Stage1 {
  if (Test-Path $WARN_FILE) { Remove-Item $WARN_FILE -Force }
  if (Test-Path $ERR_FILE) { Remove-Item $ERR_FILE -Force }
  Log('stage1 start')
  $localNode = Join-Path $AppDir 'node.exe'
  $haveNode = $false
  if ((Test-Path $localNode) -and (Test-Node $localNode)) {
    Log('node: bundled ok'); $haveNode = $true
  } else {
    $sysNode = $null
    try { $sysNode = (Get-Command node -ErrorAction Stop).Source } catch {}
    if ($sysNode -and (Test-Node $sysNode)) {
      $marker = Join-Path $AppDir '.setup-warned-node'
      if (-not (Test-Path $marker)) {
        Warn ('Using system Node.js at ' + $sysNode + ' (no bundled node.exe).')
        try { Set-Content -Path $marker -Value $sysNode } catch {}
      } else { Log 'node: system node (warned before)' }
      $haveNode = $true
    }
  }
  if (-not $haveNode) {
    Log('node: downloading')
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
    $ver = $NODE_FALLBACK
    try {
      $idx = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 60
      foreach ($r in $idx) {
        if ($r.lts -ne $false -and $r.files -contains 'win-x64-exe') { $ver = $r.version; break }
      }
    } catch { Log('node index fetch failed, fallback ' + $ver) }
    $url = 'https://nodejs.org/dist/' + $ver + '/win-x64/node.exe'
    $tmp = Join-Path $AppDir 'node.exe.download'
    try {
      Invoke-WebRequest -Uri $url -OutFile $tmp -TimeoutSec 600
      Move-Item $tmp $localNode -Force
    } catch {
      if (Test-Path $tmp) { Remove-Item $tmp -Force }
      Fail ('Could not download Node.js from ' + $url + ' : ' + $_.Exception.Message)
    }
    if (-not (Test-Node $localNode)) { Fail 'Downloaded node.exe does not run.' }
    Log ('node: downloaded ' + $ver)
  }
  $wsPkg = Join-Path $AppDir 'node_modules\ws\package.json'
  if (-not (Test-Path $wsPkg)) {
    Log('ws: bootstrapping')
    $tgz = $WS_FALLBACK_TGZ
    try {
      $meta = Invoke-RestMethod -Uri 'https://registry.npmjs.org/ws/latest' -TimeoutSec 60
      if ($meta.dist.tarball) { $tgz = $meta.dist.tarball }
    } catch { Log('ws registry fetch failed, fallback tgz') }
    $tar = $null
    try { $tar = (Get-Command tar -ErrorAction Stop).Source } catch {}
    if (-not $tar) { Fail 'tar.exe not found; cannot install the ws dependency. Install Node.js manually.' }
    $dl = Join-Path $env:TEMP 'ws-dl.tgz'
    $xd = Join-Path $env:TEMP 'ws-dl'
    try {
      if (Test-Path $xd) { Remove-Item $xd -Recurse -Force }
      New-Item -ItemType Directory $xd | Out-Null
      Invoke-WebRequest -Uri $tgz -OutFile $dl -TimeoutSec 300
      & $tar -xzf $dl -C $xd
      if ($LASTEXITCODE -ne 0) { throw 'tar extract failed' }
      $dest = Join-Path $AppDir 'node_modules\ws'
      if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
      New-Item -ItemType Directory $dest | Out-Null
      Copy-Item (Join-Path $xd 'package\*') $dest -Recurse -Force
    } catch { Fail ('Could not install ws: ' + $_.Exception.Message) }
    finally {
      if (Test-Path $dl) { Remove-Item $dl -Force }
      if (Test-Path $xd) { Remove-Item $xd -Recurse -Force }
    }
    if (-not (Test-Path $wsPkg)) { Fail 'ws install did not produce node_modules\ws\package.json.' }
    Log 'ws: installed'
  } else { Log 'ws: present' }
  $muse = $false
  try { if (Get-Command muse -ErrorAction Stop) { $muse = $true } } catch {}
  if (-not $muse) {
    if (Test-Path (Join-Path $AppDir 'muse.cmd')) { $muse = $true }
    elseif (@(Get-ChildItem $AppDir -Filter 'muse-bin-*.exe').Count -gt 0) { $muse = $true }
  }
  if (-not $muse) { Warn 'Official muse CLI not found. Install it and log in, or the bridge cannot run agents.' }
  else { Log 'muse: found' }
  Log 'stage1 done'
}

function Stage2 {
  Log 'stage2 start'
  $rmfile = Join-Path $AppDir '.setup-opencode-restart'
  if (Test-Path $rmfile) { Remove-Item $rmfile -Force }
  Install-CwdPlugin
  $keyFile = Join-Path $AppDir '.muse-api-key'
  $key = $null
  for ($i = 0; $i -lt 30; $i++) {
    if (Test-Path $keyFile) {
      try { $key = ([System.IO.File]::ReadAllText($keyFile)).Trim() } catch {}
      if ($key) { break }
    }
    Start-Sleep -Seconds 1
  }
  if (-not $key) { Warn 'Bridge API key file not found; skipped OpenCode wiring.'; Log 'stage2 done'; return }
  $cur = [System.Environment]::GetEnvironmentVariable('MUSE_BRIDGE_API_KEY', 'User')
  if ($cur -ne $key) {
    try {
      Start-Process -FilePath 'setx.exe' -ArgumentList @('MUSE_BRIDGE_API_KEY', $key) -NoNewWindow -Wait
      Log 'env key persisted'
    } catch { Warn ('Could not persist MUSE_BRIDGE_API_KEY: ' + $_.Exception.Message) }
  } else { Log 'env key already set' }
  $cfg = $ConfigPath
  if (-not $cfg) { $cfg = Join-Path $env:USERPROFILE '.config\opencode\opencode.json' }
  if (-not (Test-Path $cfg)) { Log 'opencode: no config, skip'; Log 'stage2 done'; return }
  $raw = $null
  try { $raw = [System.IO.File]::ReadAllText($cfg) } catch { Warn 'Cannot read OpenCode config; skipped.'; Log 'stage2 done'; return }
  $c = $null
  try { $c = $raw | ConvertFrom-Json } catch { Warn 'OpenCode config is not valid JSON; left untouched (fix or delete it and rerun).'; Log 'stage2 done'; return }
  if (-not $c.providers) { $c | Add-Member -NotePropertyName 'providers' -NotePropertyValue (New-Object PSCustomObject) }
  $ids = @()
  try {
    $m = Invoke-RestMethod -Uri 'http://127.0.0.1:8766/v1/models' -Headers @{ Authorization = ('Bearer ' + $key) } -TimeoutSec 60
    $ids = @($m.data | Select-Object -ExpandProperty id)
  } catch { Log 'models query failed, fallback ids' }
  if ($ids.Count -eq 0) { $ids = @('muse-spark-1.3', 'muse-spark-1.2', 'muse-wonder-1.0', 'muse-ember-1.0') }
  $have = $false
  try { $have = ($null -ne $c.providers.muse) } catch {}
  if ($have) {
    $fixed = $false
    foreach ($id in $ids) {
      $mo = $c.providers.muse.models.$id
      if ($null -eq $mo) {
        $c.providers.muse.models | Add-Member -NotePropertyName $id -NotePropertyValue ([PSCustomObject]@{ name = $id }) -Force
        $mo = $c.providers.muse.models.$id
      }
      if ($null -eq $mo.limit) {
        $lim = @{ context = 1048576 }
        if ($id -eq 'muse-ember-1.0') { $lim.output = 512000 }
        $mo | Add-Member -NotePropertyName 'limit' -NotePropertyValue ([PSCustomObject]$lim) -Force
        $fixed = $true
      }
    }
    if ($fixed) { Write-Config $cfg $c; Warn 'Added 1M-token context limits to the OpenCode muse models; restart OpenCode.' }
    else { Log 'opencode: already wired' }
    Wire-Projects
    Log 'stage2 done'; return
  }
  $models = New-Object PSCustomObject
  foreach ($id in $ids) {
    $lim = @{ context = 1048576 }
    if ($id -eq 'muse-ember-1.0') { $lim.output = 512000 }
    $models | Add-Member -NotePropertyName $id -NotePropertyValue ([PSCustomObject]@{ name = $id; limit = ([PSCustomObject]$lim) })
  }
  $entry = [PSCustomObject]@{
    name = 'Muse CLI GUI'
    env = @('MUSE_BRIDGE_API_KEY')
    package = '@opencode/ai/providers/openai-compatible'
    settings = ([PSCustomObject]@{ baseURL = 'http://127.0.0.1:8766/v1' })
    models = $models
  }
  $c.providers | Add-Member -NotePropertyName 'muse' -NotePropertyValue $entry
  Write-Config $cfg $c
  Warn 'Wired the muse provider into OpenCode; restart the OpenCode app to use it.'
  Wire-Projects
  Log 'stage2 done'
}

function Install-CwdPlugin {
  $src = Join-Path $AppDir 'opencode-plugin-muse-cwd\index.js'
  if (-not (Test-Path $src)) { Log 'cwd-plugin: source missing, skip'; return }
  $dest = Join-Path $env:USERPROFILE '.config\opencode\plugins\muse-cwd\index.js'
  try {
    $dd = Split-Path $dest -Parent
    if (-not (Test-Path $dd)) { New-Item -ItemType Directory $dd -Force | Out-Null }
    $cur = $null
    if (Test-Path $dest) { try { $cur = [System.IO.File]::ReadAllText($dest) } catch {} }
    $want = [System.IO.File]::ReadAllText($src)
    if ($cur -ceq $want) { Log 'cwd-plugin: current'; return }
    [System.IO.File]::WriteAllText($dest, $want, (New-Object System.Text.UTF8Encoding($false)))
    try { Add-Content -Path (Join-Path $AppDir '.setup-opencode-restart') -Value 'cwd plugin' } catch {}
    Log 'cwd-plugin: installed'
  } catch { Warn ('Could not install the OpenCode cwd plugin: ' + $_.Exception.Message) }
}
function Wire-Projects {
  $node = Join-Path $AppDir 'node.exe'
  try { if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction Stop).Source } } catch { Log 'wire: no node'; return }
  $script = Join-Path $AppDir 'wire-opencode-projects.js'
  if (-not (Test-Path $script)) { Log 'wire: script missing'; return }
  try {
    $o = & $node --no-warnings $script $AppDir 2>&1
    foreach ($line in @($o)) { Log ('wire: ' + $line) }
  } catch { Log ('wire failed: ' + $_.Exception.Message) }
}
function Write-Config($cfg, $c) {
  $bak = $cfg + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  try { Copy-Item $cfg $bak } catch { Warn 'Could not back up OpenCode config.' }
  $json = $c | ConvertTo-Json -Depth 12
  [System.IO.File]::WriteAllText($cfg, $json, (New-Object System.Text.UTF8Encoding($false)))
  try { Add-Content -Path (Join-Path $AppDir '.setup-opencode-restart') -Value 'global config' } catch {}
  Log ('opencode config written, backup ' + $bak)
}

try {
  if ($Stage -eq 1) { Stage1 } elseif ($Stage -eq 2) { Stage2 } else { Fail 'Unknown stage.' }
} catch {
  Fail ($_.Exception.Message)
}
exit 0
