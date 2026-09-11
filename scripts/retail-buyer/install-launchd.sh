#!/usr/bin/env bash
# Instala/atualiza o comprador local como serviço do usuário (launchd), sempre ligado.
# Segredos vêm do Chaves do macOS (lia-purchase-worker); nada de token no plist.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="com.liadelivery.purchase-worker"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/Logs/lia" "$HOME/Library/LaunchAgents"
sed -e "s#__REPO__#$REPO#g" -e "s#__HOME__#$HOME#g" "$REPO/scripts/retail-buyer/launchd/$LABEL.plist" > "$DEST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "Serviço $LABEL instalado. Logs: ~/Library/Logs/lia/. Parar: launchctl bootout gui/$(id -u)/$LABEL"
