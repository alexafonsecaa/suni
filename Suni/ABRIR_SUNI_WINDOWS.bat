@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8099"
  py -3 -m http.server 8099 --bind 127.0.0.1
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8099"
  python -m http.server 8099 --bind 127.0.0.1
  goto :end
)
echo Instala Python 3 desde python.org y vuelve a ejecutar este archivo.
pause
:end
