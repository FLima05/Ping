@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ping

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado nesta maquina.
  echo Instale a versao LTS em https://nodejs.org
  echo Depois feche esta janela e clique neste arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Primeira execucao, instalando dependencias. Pode levar 1 minuto.
  call npm install
  if errorlevel 1 (
    echo.
    echo Falhou ao instalar. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)

echo.
echo Ping iniciando. Para encerrar, feche esta janela.
echo.
call npm run host
pause