@echo off
rem Sky Dash - Level-Compiler bauen und Level neu erzeugen (Windows, braucht g++ / MinGW)
cd /d "%~dp0"
g++ -O2 -std=c++17 leveltool.cpp -o leveltool.exe || goto :fehler
leveltool.exe levels -o ..\js\levels.js || goto :fehler
echo Fertig! js\levels.js wurde neu erzeugt.
pause
exit /b 0
:fehler
echo Es gab einen Fehler - siehe oben.
pause
