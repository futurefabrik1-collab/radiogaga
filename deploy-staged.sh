#!/bin/bash
# Staged deploy — sync files + flag for scheduled restart (max 1 restart per 15 min)
cd /Users/markburnett/DevPro/ai-radio
echo "[deploy] Syncing files..."
rsync -avz --delete frontend/dist/ root@165.227.227.213:/opt/radiogaga/frontend/dist/ > /dev/null 2>&1
rsync -avz src/ root@165.227.227.213:/opt/radiogaga/src/ > /dev/null 2>&1
scp -q schedule.yaml package.json root@165.227.227.213:/opt/radiogaga/ 2>/dev/null
ssh root@165.227.227.213 "touch /tmp/radiogaga-needs-restart"
echo "[deploy] Staged at $(date +%H:%M:%S) — restart within 15 min"
