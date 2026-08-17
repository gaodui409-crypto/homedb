@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

title HomeDB Test Console
set "PNPM_CMD="

if not exist "package.json" (
  echo [错误] 当前目录没有 package.json。
  echo 请把此脚本放在 HomeDB 项目根目录后再运行。
  goto :fatal
)

where pnpm >nul 2>nul
if not errorlevel 1 set "PNPM_CMD=pnpm"

if not defined PNPM_CMD (
  where corepack >nul 2>nul
  if not errorlevel 1 set "PNPM_CMD=corepack pnpm"
)

if not defined PNPM_CMD (
  echo [错误] 没有找到 pnpm 或 corepack。
  echo 请先安装 Node.js，并启用 pnpm。
  goto :fatal
)

:menu
cls
echo ============================================================
echo                     HomeDB 测试工具
echo ============================================================
echo.
echo   [1] 快速检查    测试 + 类型检查 + ESLint
echo   [2] 完整门禁    快速检查 + 生产构建
echo   [3] 开发预览    启动开发服务器并打开浏览器
echo   [4] 生产预览    构建后启动生产服务器并打开浏览器
echo   [5] 监听测试    在独立窗口持续运行 Vitest
echo   [0] 退出
echo.
choice /C 123450 /N /M "请选择："
set "MENU_CHOICE=%errorlevel%"

if "%MENU_CHOICE%"=="1" call :quick_checks
if "%MENU_CHOICE%"=="2" call :full_checks
if "%MENU_CHOICE%"=="3" call :dev_preview
if "%MENU_CHOICE%"=="4" call :production_preview
if "%MENU_CHOICE%"=="5" call :watch_tests
if "%MENU_CHOICE%"=="6" goto :end
goto :menu

:ensure_dependencies
if exist "node_modules" exit /b 0

echo.
echo [准备] 未发现 node_modules，正在按锁文件恢复依赖...
call %PNPM_CMD% install --frozen-lockfile
if errorlevel 1 (
  echo [失败] 依赖安装失败。
  exit /b 1
)
exit /b 0

:quick_checks
call :ensure_dependencies
if errorlevel 1 goto :check_failed

echo.
echo [1/3] 运行 Vitest...
call %PNPM_CMD% test
if errorlevel 1 goto :check_failed

echo.
echo [2/3] 运行 TypeScript 类型检查...
call %PNPM_CMD% typecheck
if errorlevel 1 goto :check_failed

echo.
echo [3/3] 运行 ESLint...
call %PNPM_CMD% lint
if errorlevel 1 goto :check_failed

echo.
echo [通过] 快速检查全部完成。
pause
exit /b 0

:full_checks
call :ensure_dependencies
if errorlevel 1 goto :check_failed

echo.
echo [1/4] 运行 Vitest...
call %PNPM_CMD% test
if errorlevel 1 goto :check_failed

echo.
echo [2/4] 运行 TypeScript 类型检查...
call %PNPM_CMD% typecheck
if errorlevel 1 goto :check_failed

echo.
echo [3/4] 运行 ESLint...
call %PNPM_CMD% lint
if errorlevel 1 goto :check_failed

echo.
echo [4/4] 创建 Next.js 生产构建...
call %PNPM_CMD% build
if errorlevel 1 goto :check_failed

echo.
echo [通过] 完整门禁全部完成。
pause
exit /b 0

:dev_preview
call :ensure_dependencies
if errorlevel 1 goto :check_failed
call :find_free_port

echo.
echo [启动] 开发服务器：http://localhost:%APP_PORT%
echo 服务器会在独立窗口运行，关闭该窗口即可停止。
start "HomeDB Dev - %APP_PORT%" cmd.exe /k "cd /d ""%~dp0"" && call %PNPM_CMD% dev --port %APP_PORT%"
call :wait_and_open %APP_PORT%
if errorlevel 1 echo [提示] 服务器窗口已打开，但 30 秒内没有检测到网页响应。
pause
exit /b 0

:production_preview
call :ensure_dependencies
if errorlevel 1 goto :check_failed

echo.
echo [构建] 正在创建 Next.js 生产构建...
call %PNPM_CMD% build
if errorlevel 1 goto :check_failed

call :find_free_port
echo.
echo [启动] 生产服务器：http://localhost:%APP_PORT%
echo 服务器会在独立窗口运行，关闭该窗口即可停止。
start "HomeDB Production - %APP_PORT%" cmd.exe /k "cd /d ""%~dp0"" && call %PNPM_CMD% start --port %APP_PORT%"
call :wait_and_open %APP_PORT%
if errorlevel 1 echo [提示] 服务器窗口已打开，但 30 秒内没有检测到网页响应。
pause
exit /b 0

:watch_tests
call :ensure_dependencies
if errorlevel 1 goto :check_failed

echo.
echo [启动] Vitest 监听模式将在独立窗口运行。
start "HomeDB Vitest Watch" cmd.exe /k "cd /d ""%~dp0"" && call %PNPM_CMD% test:watch"
timeout /t 2 /nobreak >nul
exit /b 0

:find_free_port
set "APP_PORT="
for /f %%P in ('powershell.exe -NoProfile -Command "$used=[System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port; $p=3000; while($used -contains $p){$p++}; $p"') do set "APP_PORT=%%P"
if not defined APP_PORT set "APP_PORT=3000"
exit /b 0

:wait_and_open
powershell.exe -NoProfile -Command "$url='http://localhost:%~1'; for($i=0; $i -lt 30; $i++){ try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if($response.StatusCode -lt 500){ Start-Process $url; exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
exit /b %errorlevel%

:check_failed
echo.
echo [失败] 已在出错步骤停止，请查看上方输出。
pause
exit /b 1

:fatal
echo.
pause
exit /b 1

:end
endlocal
exit /b 0
