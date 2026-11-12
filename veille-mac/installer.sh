#!/bin/sh
# Installe la veille quotidienne : chaque jour à 8 h. Si le Mac dormait à
# cette heure-là, launchd la lance à son réveil ; s'il était éteint, elle
# attend le lendemain.
#
#   sh installer.sh           installer ou mettre à jour
#   sh installer.sh retirer   désinstaller
#
# Journal : ~/Library/Logs/apogee-veille.log

set -e
NOM=fr.leadscore.apogee-veille
PLIST="$HOME/Library/LaunchAgents/$NOM.plist"
DOMAINE="gui/$(id -u)"

launchctl bootout "$DOMAINE/$NOM" 2>/dev/null || true
if [ "$1" = "retirer" ]; then
  rm -f "$PLIST"
  echo "Veille quotidienne retirée."
  exit 0
fi

DOSSIER="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$NOM</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DOSSIER/veille.mjs</string></array>
  <key>WorkingDirectory</key><string>$DOSSIER</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/apogee-veille.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/apogee-veille.log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "$DOMAINE" "$PLIST"
echo "Veille quotidienne installée : $PLIST"
