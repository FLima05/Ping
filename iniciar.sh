#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js nao encontrado nesta maquina."
  echo "Instale a versao LTS em https://nodejs.org"
  echo
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Primeira execucao, instalando dependencias. Pode levar 1 minuto."
  npm install
fi

echo
echo "Ping iniciando. Para encerrar, aperte Ctrl+C."
echo
npm run online