@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Admin Helper

rem ================================================================
rem  Setup: ANSI colors
rem ================================================================
set "ESC="
for /f "delims=" %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"
set "GREEN="
set "RED="
set "YELLOW="
set "RESET="
if defined ESC (
    set "GREEN=%ESC%[32m"
    set "RED=%ESC%[31m"
    set "YELLOW=%ESC%[33m"
    set "RESET=%ESC%[0m"
)

set "DESKTOP="
set "status_msg=Ready."
set "status_color=!GREEN!"

:show_menu
cls
echo ================================================================
echo                       QUICK MENU
echo ================================================================
echo  /start [name]          - Start a program (e.g. /start notepad)
echo  /stop [name]           - Close a specific program
echo  /install skylauncher   - Download and start SkyLauncher Setup
echo  /viren-file            - Select a file via dialog ^& check with Defender
echo  /virus-check           - Open Windows Defender settings
echo  /file-format           - Encode or decode files (.xyz)
echo  /ping [target]         - Ping an IP address or domain (default: 8.8.8.8)
echo  /network               - Show network, active connections and remote-access apps
echo  /close-edge            - Force close all Microsoft Edge processes
echo  /create [path]         - Create folders/files on Desktop (e.g. /create a/b/file.txt)
echo  /kill-cookie           - Delete Chrome/Edge cookies
echo  /youtube speed [X]     - YouTube playback speed, x = 0.25 to 5
echo  /youtube design [x]    - YouTube theme: default, dark or white
echo  /shutdown              - Shut down the PC (10-second countdown; any key cancels)
echo  /restart               - Restart the PC (10-second countdown; any key cancels)
echo  /menu                  - Show this menu again
echo  /exit                  - Exit the program
echo ================================================================
echo Status: !status_color!!status_msg!!RESET!
echo.

:loop
set "input="
set "cmdname="
set "cmdarg="
set /p "input=Enter command: "
if not defined input goto loop
set "input=!input:"=!"
for /f "tokens=1,*" %%a in ("!input!") do (
    set "cmdname=%%a"
    set "cmdarg=%%b"
)
if not defined cmdname goto loop

if /i "!cmdname!"=="/start"       goto do_start
if /i "!cmdname!"=="/stop"        goto do_stop
if /i "!cmdname!"=="/install"     goto do_install
if /i "!cmdname!"=="/viren-file"  goto do_virenfile
if /i "!cmdname!"=="/virus-check" goto do_viruscheck
if /i "!cmdname!"=="/file-format" goto do_fileformat
if /i "!cmdname!"=="/fileformat"  goto do_fileformat
if /i "!cmdname!"=="/ping"        goto do_ping
if /i "!cmdname!"=="/network"     goto do_network
if /i "!cmdname!"=="/close-edge"  goto do_closeedge
if /i "!cmdname!"=="/create"      goto do_create
if /i "!cmdname!"=="/kill-cookie" goto do_killcookie
if /i "!cmdname!"=="/youtube"     goto do_youtube
if /i "!cmdname!"=="/shutdown" (
    set "POWER_ACTION=/s"
    goto do_power_action
)
if /i "!cmdname!"=="/restart" (
    set "POWER_ACTION=/r"
    goto do_power_action
)
if /i "!cmdname!"=="/menu"        goto show_menu
if /i "!cmdname!"=="/help"        goto show_menu
if /i "!cmdname!"=="/exit"        goto do_exit

set "status_msg=Command !input! does not exist."
set "status_color=!RED!"
goto show_menu

:do_exit
endlocal
exit /b 0

rem ================================================================
rem  /shutdown and /restart
rem ================================================================
:do_power_action
if "!POWER_ACTION!"=="/s" (
    set "POWER_NAME=Shutdown"
) else (
    set "POWER_NAME=Restart"
)
echo.
echo Press any key within 10 seconds to cancel.
powershell -NoProfile -Command "try{$timer=[Diagnostics.Stopwatch]::StartNew();$last=0;$beepEnabled=$true;while($timer.Elapsed.TotalSeconds -lt 10){if([Console]::KeyAvailable){[void][Console]::ReadKey($true);Write-Host;exit 10};$remaining=[Math]::Ceiling(10-$timer.Elapsed.TotalSeconds);if($remaining -ne $last){Write-Host (([char]13).ToString()+$env:POWER_NAME+' in '+$remaining+' seconds... ') -NoNewline;$last=$remaining;if($beepEnabled){try{[Console]::Beep(1200,150)}catch{Write-Host ('Warning: could not play countdown tone: '+$_.Exception.Message);$beepEnabled=$false}}};Start-Sleep -Milliseconds 50};if([Console]::KeyAvailable){[void][Console]::ReadKey($true);Write-Host;exit 10};Write-Host;exit 0}catch{Write-Host;Write-Host ('Countdown failed: '+$_.Exception.Message);exit 1}"
set "rc=%errorlevel%"
if "!rc!"=="10" (
    set "status_msg=!POWER_NAME! canceled."
    set "status_color=!YELLOW!"
    goto show_menu
)
if not "!rc!"=="0" (
    set "status_msg=Could not run the !POWER_NAME! countdown."
    set "status_color=!RED!"
    goto show_menu
)
call :danger_beep
shutdown.exe !POWER_ACTION! /t 0
if errorlevel 1 (
    set "status_msg=Windows could not start the !POWER_NAME!."
    set "status_color=!RED!"
) else (
    set "status_msg=!POWER_NAME! started."
    set "status_color=!GREEN!"
)
goto show_menu

rem ================================================================
rem  /start
rem ================================================================
:do_start
if not defined cmdarg (
    set "status_msg=Error: please specify a program name, e.g. /start notepad"
    set "status_color=!RED!"
    goto show_menu
)
powershell -NoProfile -Command "try{Start-Process -FilePath $env:cmdarg;exit 0}catch{try{$a=$env:cmdarg -split ' ',2;Start-Process -FilePath $a[0] -ArgumentList $a[1];exit 0}catch{exit 1}}"
if errorlevel 1 (
    set "status_msg=Error: could not start !cmdarg!."
    set "status_color=!RED!"
) else (
    set "status_msg=Started !cmdarg! successfully."
    set "status_color=!GREEN!"
)
goto show_menu

rem ================================================================
rem  /stop
rem ================================================================
:do_stop
if not defined cmdarg (
    set "status_msg=Error: please specify a program name to stop."
    set "status_color=!RED!"
    goto show_menu
)
set "proc=!cmdarg!"
if /i not "!proc:~-4!"==".exe" set "proc=!proc!.exe"
call :danger_beep
taskkill /f /im "!proc!" >nul 2>&1
if errorlevel 1 (
    set "status_msg=Error: process !proc! not found or access denied."
    set "status_color=!RED!"
) else (
    set "status_msg=Process !proc! was terminated."
    set "status_color=!GREEN!"
)
goto show_menu

rem ================================================================
rem  /install skylauncher
rem ================================================================
:do_install
if /i not "!cmdarg!"=="skylauncher" (
    set "status_msg=Unknown install command. Try: /install skylauncher"
    set "status_color=!RED!"
    goto show_menu
)
call :get_desktop
set "SKY_URL=https://github.com/Tewe444/List/raw/refs/heads/main/downloads/apps/SkyLauncher/Windows/SkyLauncher-Setup.exe"
set "SKY_FILE=!DESKTOP!\SkyLauncher-Setup.exe"
echo.
echo Downloading SkyLauncher to the Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$ProgressPreference='SilentlyContinue';Invoke-WebRequest -UseBasicParsing -Uri $env:SKY_URL -OutFile $env:SKY_FILE -ErrorAction Stop;exit 0}catch{Write-Host $_.Exception.Message;exit 1}"
if errorlevel 1 (
    set "status_msg=Download failed."
    set "status_color=!RED!"
    goto show_menu
)
if not exist "!SKY_FILE!" (
    set "status_msg=Download failed: file not found."
    set "status_color=!RED!"
    goto show_menu
)
start "" "!SKY_FILE!"
set "status_msg=SkyLauncher downloaded and started."
set "status_color=!GREEN!"
goto show_menu

rem ================================================================
rem  /viren-file  (file dialog + Defender scan)
rem ================================================================
:do_virenfile
echo.
echo Warning: The virus scan may miss threats or report false positives.
echo Results are not guaranteed; we make no guarantees.
echo.
echo Opening file dialog (it may appear behind other windows)...
powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "try{Add-Type -AssemblyName System.Windows.Forms;$f=New-Object System.Windows.Forms.Form;$f.TopMost=$true;$d=New-Object System.Windows.Forms.OpenFileDialog;if($d.ShowDialog($f) -ne 'OK'){exit 10};$m=Get-ChildItem (Join-Path $env:ProgramData 'Microsoft\Windows Defender\Platform') -Recurse -Filter MpCmdRun.exe -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName;if(-not $m){$c=Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe';if(Test-Path $c){$m=$c}};if(-not $m){exit 99};Write-Host ('Scanning: '+$d.FileName);& $m -Scan -ScanType 3 -File $d.FileName;exit $LASTEXITCODE}catch{Write-Host $_.Exception.Message;exit 1}"
set "rc=%errorlevel%"
if "!rc!"=="0" (
    set "status_msg=Scan completed: no threats found."
    set "status_color=!GREEN!"
) else if "!rc!"=="2" (
    set "status_msg=WARNING: Defender reports a threat in this file."
    set "status_color=!RED!"
) else if "!rc!"=="10" (
    set "status_msg=File scan canceled."
    set "status_color=!YELLOW!"
) else if "!rc!"=="99" (
    set "status_msg=Windows Defender scanner not found."
    set "status_color=!RED!"
) else (
    set "status_msg=Scan failed - error code !rc!."
    set "status_color=!RED!"
)
goto show_menu

rem ================================================================
rem  /virus-check
rem ================================================================
:do_viruscheck
start "" windowsdefender:
set "status_msg=Windows Defender opened."
set "status_color=!GREEN!"
goto show_menu

rem ================================================================
rem  /file-format  (.xyz = zip archive)
rem ================================================================
:do_fileformat
echo.
echo ----------------------------------------------------------------
echo  [X] Encode : file -^> file.xyz
echo  [Y] Decode : file.xyz -^> original file in a new folder
echo  [Z] Cancel
echo ----------------------------------------------------------------
choice /c XYZ /n /m "Choose option (X, Y, Z): "
set "ff_choice=%errorlevel%"
if "!ff_choice!"=="3" (
    set "status_msg=File format action canceled."
    set "status_color=!YELLOW!"
    goto show_menu
)
set "FF_MODE=encode"
if "!ff_choice!"=="2" set "FF_MODE=decode"
echo.
echo Opening file dialog (it may appear behind other windows)...
powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "try{Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.IO.Compression.FileSystem;$f=New-Object System.Windows.Forms.Form;$f.TopMost=$true;$d=New-Object System.Windows.Forms.OpenFileDialog;if($env:FF_MODE -eq 'decode'){$d.Filter='XYZ files (*.xyz)|*.xyz|All files (*.*)|*.*'};if($d.ShowDialog($f) -ne 'OK'){exit 10};$p=$d.FileName;if($env:FF_MODE -eq 'encode'){$out=$p+'.xyz';$n=1;while(Test-Path -LiteralPath $out){$n++;$out=$p+' ('+$n+').xyz'};$z=[IO.Compression.ZipFile]::Open($out,'Create');try{[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,$p,[IO.Path]::GetFileName($p))}finally{$z.Dispose()};Write-Host ('Created: '+$out)}else{$dir=[IO.Path]::GetDirectoryName($p);$base=[IO.Path]::GetFileNameWithoutExtension($p);$dest=Join-Path $dir $base;$n=1;while(Test-Path -LiteralPath $dest){$n++;$dest=Join-Path $dir ($base+' ('+$n+')')};[IO.Compression.ZipFile]::ExtractToDirectory($p,$dest);Write-Host ('Extracted to: '+$dest)};exit 0}catch{Write-Host $_.Exception.Message;exit 1}"
set "rc=%errorlevel%"
if "!rc!"=="0" (
    set "status_msg=File !FF_MODE! finished successfully."
    set "status_color=!GREEN!"
) else if "!rc!"=="10" (
    set "status_msg=File selection canceled."
    set "status_color=!YELLOW!"
) else (
    set "status_msg=Error during !FF_MODE! process."
    set "status_color=!RED!"
)
goto show_menu

rem ================================================================
rem  /ping
rem ================================================================
:do_ping
if not defined cmdarg set "cmdarg=8.8.8.8"
echo.
echo ================================================================
echo Pinging target: !cmdarg!
echo ================================================================
ping !cmdarg!
set "rc=%errorlevel%"
echo.
echo ================================================================
echo Ping finished. Press any key to return to menu...
echo ================================================================
pause >nul
if "!rc!"=="0" (
    set "status_msg=Ping to !cmdarg! completed."
    set "status_color=!GREEN!"
) else (
    set "status_msg=Ping to !cmdarg! failed or timed out."
    set "status_color=!RED!"
)
goto show_menu

rem ================================================================
rem  /network
rem ================================================================
:do_network
echo.
echo ================================================================
echo Network and remote-access check
echo Note: Results can be incomplete or incorrect. A running remote-access
echo app does not prove that someone is connected.
echo ================================================================
powershell -NoProfile -Command "try{$configs=@(Get-NetIPConfiguration -ErrorAction Stop | Where-Object {$_.NetAdapter.Status -eq 'Up'});Write-Host 'Active network adapters:';if($configs.Count -eq 0){Write-Host '  No active network adapters found.'}else{foreach($c in $configs){$profile=Get-NetConnectionProfile -InterfaceIndex $c.InterfaceIndex -ErrorAction SilentlyContinue | Select-Object -First 1;$network='Unknown';if($profile){$network=$profile.Name};$ipv4=@($c.IPv4Address | ForEach-Object {$_.IPAddress}) -join ', ';$ipv6=@($c.IPv6Address | ForEach-Object {$_.IPAddress}) -join ', ';$gw4=@($c.IPv4DefaultGateway | ForEach-Object {$_.NextHop}) -join ', ';$gw6=@($c.IPv6DefaultGateway | ForEach-Object {$_.NextHop}) -join ', ';$dns=@($c.DnsServer.ServerAddresses) -join ', ';$if4=Get-NetIPInterface -InterfaceIndex $c.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1;$if6=Get-NetIPInterface -InterfaceIndex $c.InterfaceIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue | Select-Object -First 1;Write-Host '';Write-Host ('Adapter: '+$c.InterfaceAlias+' ('+$c.NetAdapter.Status+')');Write-Host ('  Network: '+$network);Write-Host ('  MAC: '+$c.NetAdapter.MacAddress);Write-Host ('  Link speed: '+$c.NetAdapter.LinkSpeed);Write-Host ('  IPv4 address: '+$ipv4);Write-Host ('  IPv4 gateway: '+$gw4);Write-Host ('  IPv4 DHCP: '+$if4.Dhcp);Write-Host ('  IPv6 address: '+$ipv6);Write-Host ('  IPv6 gateway: '+$gw6);Write-Host ('  IPv6 DHCP: '+$if6.Dhcp);Write-Host ('  DNS servers: '+$dns)}};Write-Host '';Write-Host 'Established TCP connections (remote endpoints):';$connections=@(Get-NetTCPConnection -State Established -ErrorAction Stop);if($connections.Count -eq 0){Write-Host '  No established TCP connections found.'}else{foreach($conn in $connections){$proc=Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue | Select-Object -First 1;$processName='Unknown';if($proc){$processName=$proc.ProcessName};Write-Host ('  '+$conn.LocalAddress+':'+$conn.LocalPort+' -> '+$conn.RemoteAddress+':'+$conn.RemotePort+'  Process: '+$processName)}};Write-Host '';Write-Host 'Known remote-access software processes:';$remoteNames=@('anydesk','teamviewer','teamviewer_service','rustdesk','quickassist','msra','mstsc','remoting_host','screenconnect.client','dwagent','splashtop','srmanager','bomgar-scc','logmein');$remoteApps=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$remoteNames -contains $_.ProcessName.ToLowerInvariant()} | Select-Object -ExpandProperty ProcessName -Unique);if($remoteApps.Count -eq 0){Write-Host '  No known remote-access software process detected.'}else{foreach($app in $remoteApps){Write-Host ('  WARNING: Running remote-access process: '+$app) -ForegroundColor Red}};exit 0}catch{Write-Host ('Network check failed: '+$_.Exception.Message);exit 1}"
set "rc=%errorlevel%"
echo ================================================================
echo Press any key to return to menu...
pause >nul
if "!rc!"=="0" (
    set "status_msg=Network information displayed."
    set "status_color=!GREEN!"
) else (
    set "status_msg=Could not read network information."
    set "status_color=!RED!"
)
goto show_menu

rem ================================================================
rem  /close-edge
rem ================================================================
:do_closeedge
echo.
echo Terminating all Microsoft Edge processes...
call :danger_beep
taskkill /f /im msedge.exe >nul 2>&1
if errorlevel 1 (
    set "status_msg=No active Microsoft Edge processes found."
    set "status_color=!YELLOW!"
) else (
    set "status_msg=All Microsoft Edge processes closed."
    set "status_color=!GREEN!"
)
goto show_menu

rem ================================================================
rem  /create
rem ================================================================
:do_create
if not defined cmdarg (
    set "status_msg=Error: please specify a path, e.g. /create folder/file.txt"
    set "status_color=!RED!"
    goto show_menu
)
call :get_desktop
echo.
echo Creating on Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$a=$env:cmdarg.Trim();$isDir=$a.EndsWith('/') -or $a.EndsWith('\');$rel=$a.Replace('/','\').Trim('\');if($rel -eq '' -or $rel -match '^[A-Za-z]:' -or $rel.Contains('..')){exit 3};$t=Join-Path $env:DESKTOP $rel;$leaf=Split-Path $t -Leaf;if($isDir -or -not $leaf.Contains('.')){New-Item -ItemType Directory -Force -Path $t | Out-Null}else{$p=Split-Path $t -Parent;New-Item -ItemType Directory -Force -Path $p | Out-Null;if(-not (Test-Path -LiteralPath $t)){New-Item -ItemType File -Path $t | Out-Null}};exit 0}catch{Write-Host $_.Exception.Message;exit 1}"
set "rc=%errorlevel%"
if "!rc!"=="0" (
    set "status_msg=Created on Desktop: !cmdarg!"
    set "status_color=!GREEN!"
) else if "!rc!"=="3" (
    set "status_msg=Invalid path - only relative paths without .. are allowed."
    set "status_color=!RED!"
) else (
    set "status_msg=Error: could not create !cmdarg!."
    set "status_color=!RED!"
)
goto show_menu

rem ================================================================
rem  /kill-cookie
rem ================================================================
:do_killcookie
echo.
echo ================================================================
echo This closes Chrome and Edge and deletes their cookies.
echo You will be logged out of websites.
echo   [X] Yes, delete
echo   [Y] No, cancel
echo ================================================================
echo Your choice (X = yes, Y = no):
call :danger_beep 2000
choice /c XY /n >nul
if errorlevel 2 (
    set "status_msg=Cookie deletion canceled."
    set "status_color=!YELLOW!"
    goto show_menu
)
echo.
echo Closing browsers and clearing cookies...
taskkill /f /im chrome.exe >nul 2>&1
taskkill /f /im msedge.exe >nul 2>&1
timeout /t 2 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$roots=@((Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'),(Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'));$n=0;foreach($r in $roots){if(Test-Path -LiteralPath $r){Get-ChildItem -LiteralPath $r -Directory | Where-Object {$_.Name -eq 'Default' -or $_.Name -like 'Profile *'} | ForEach-Object {foreach($f in 'Network\Cookies','Network\Cookies-journal','Cookies','Cookies-journal'){$x=Join-Path $_.FullName $f;if(Test-Path -LiteralPath $x){Remove-Item -LiteralPath $x -Force -ErrorAction SilentlyContinue;if(-not (Test-Path -LiteralPath $x)){$n++}}}}}};Write-Host ('Deleted '+$n+' cookie file(s).');if($n -eq 0){exit 4};exit 0"
set "rc=%errorlevel%"
echo.
echo ================================================================
echo Cookie cleanup finished. Press any key to return to menu...
echo ================================================================
pause >nul
if "!rc!"=="0" (
    set "status_msg=Cookies cleared successfully."
    set "status_color=!GREEN!"
) else (
    set "status_msg=No cookie files found or they could not be deleted."
    set "status_color=!YELLOW!"
)
goto show_menu

rem ================================================================
rem  /youtube speed [0.25 - 5]
rem ================================================================
:do_youtube
set "yt_sub="
set "yt_val="
if defined cmdarg for /f "tokens=1,*" %%a in ("!cmdarg!") do (
    set "yt_sub=%%a"
    set "yt_val=%%b"
)
if /i "!yt_sub!"=="design" goto do_ytdesign
if /i not "!yt_sub!"=="speed" (
    set "status_msg=Usage: /youtube speed [0.25 - 5]  or  /youtube design [dark/white/default]"
    set "status_color=!YELLOW!"
    goto show_menu
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$v=0.0;$ok=[double]::TryParse(([string]$env:yt_val).Trim().Replace(',','.'),[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$v);if(-not $ok -or [double]::IsNaN($v) -or $v -lt 0.25 -or $v -gt 5){exit 2};$s=$v.ToString([Globalization.CultureInfo]::InvariantCulture);$js='(()=>{const s='+$s+';try{localStorage.setItem(''yt-player-playback-rate'',JSON.stringify({data:String(s),creation:Date.now(),expiration:Date.now()+2592000000}))}catch(e){};const v=document.querySelector(''video'');if(v){v.playbackRate=s};console.log(''YouTube speed set to ''+s)})()';Set-Clipboard -Value $js;Write-Host ('Speed '+$s+' - script copied to clipboard.');exit 0"
if errorlevel 1 (
    set "status_msg=Invalid speed. Use a number from 0.25 to 5, e.g. /youtube speed 1.5"
    set "status_color=!RED!"
    goto show_menu
)
echo.
echo ================================================================
echo  1. YouTube opens in your default browser.
echo  2. Open a video, press F12 and select the "Console" tab.
echo  3. Press Ctrl+V and Enter. (First time in Chrome/Edge: type
echo     "allow pasting" and press Enter before pasting.)
echo  The speed applies immediately and is stored by YouTube in the
echo  browser for the following videos.
echo ================================================================
start "" "https://www.youtube.com"
echo.
echo Press any key to return to menu...
pause >nul
set "status_msg=YouTube speed script for !yt_val!x copied to clipboard."
set "status_color=!GREEN!"
goto show_menu

rem ================================================================
rem  /youtube design [default / dark / white]
rem ================================================================
:do_ytdesign
set "yt_th="
if defined yt_val for /f "tokens=1" %%a in ("!yt_val!") do set "yt_th=%%a"
set "yt_t2="
if /i "!yt_th!"=="dark"    set "yt_t2=dark"
if /i "!yt_th!"=="white"   set "yt_t2=white"
if /i "!yt_th!"=="light"   set "yt_t2=white"
if /i "!yt_th!"=="default" set "yt_t2=default"
if /i "!yt_th!"=="auto"    set "yt_t2=default"
if not defined yt_t2 (
    set "status_msg=Usage: /youtube design default / dark / white"
    set "status_color=!YELLOW!"
    goto show_menu
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$js='(()=>{const T=''@@T@@'';const m=new Map();(document.cookie.split(''; '').find(c=>c.startsWith(''PREF=''))||''PREF='').slice(5).split(''&'').filter(Boolean).forEach(p=>{const i=p.indexOf(''='');m.set(p.slice(0,i),p.slice(i+1))});let f=parseInt(m.get(''f6'')||''0'',16)||0;f=(f&~(0x400|0x80000))>>>0;if(T===''dark''){f=(f|0x400)>>>0};if(T===''white''){f=(f|0x80000)>>>0};if(f){m.set(''f6'',f.toString(16))}else{m.delete(''f6'')};document.cookie=''PREF=''+[...m].map(([k,v])=>k+''=''+v).join(''&'')+'';domain=.youtube.com;path=/;max-age=31536000;secure'';location.reload()})()'.Replace('@@T@@',$env:yt_t2);Set-Clipboard -Value $js;Write-Host 'Script copied to clipboard.';exit 0"
if errorlevel 1 (
    set "status_msg=Could not copy the script to the clipboard."
    set "status_color=!RED!"
    goto show_menu
)
echo.
echo ================================================================
echo  Theme: !yt_t2!
echo  1. YouTube opens in your default browser.
echo  2. Press F12 and select the "Console" tab.
echo  3. Press Ctrl+V and Enter. (First time in Chrome/Edge: type
echo     "allow pasting" and press Enter before pasting.)
echo  The page reloads with the new theme. YouTube keeps it in a
echo  cookie, so it stays for later visits.
echo ================================================================
start "" "https://www.youtube.com/"
echo.
echo Press any key to return to menu...
pause >nul
set "status_msg=YouTube theme script (!yt_t2!) copied to clipboard."
set "status_color=!GREEN!"
goto show_menu

rem ================================================================
rem  Helper: find the real Desktop folder (also works with OneDrive)
rem ================================================================
:get_desktop
if defined DESKTOP exit /b 0
for /f "delims=" %%D in ('powershell -NoProfile -Command "[Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)"') do set "DESKTOP=%%D"
if not defined DESKTOP set "DESKTOP=%USERPROFILE%\Desktop"
exit /b 0

rem ================================================================
rem  Warning tone for destructive actions
rem ================================================================
:danger_beep
setlocal
set "BEEP_DURATION=%~1"
if not defined BEEP_DURATION set "BEEP_DURATION=1000"
powershell -NoProfile -Command "try{[Console]::Beep(1200,[int]$env:BEEP_DURATION)}catch{Write-Host ('Warning: could not play alert tone: '+$_.Exception.Message);exit 1}"
if errorlevel 1 echo Warning: could not play alert tone.
endlocal
exit /b 0
