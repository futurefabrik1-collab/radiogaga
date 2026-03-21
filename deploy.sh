#!/bin/bash
# Deploy without restart — files sync only
cd /Users/markburnett/DevPro/ai-radio
rsync -avz --delete frontend/dist/ root@165.227.227.213:/opt/radiogaga/frontend/dist/ > /dev/null 2>&1
rsync -avz src/ root@165.227.227.213:/opt/radiogaga/src/ > /dev/null 2>&1
scp -q schedule.yaml root@165.227.227.213:/opt/radiogaga/schedule.yaml 2>/dev/null
scp -q package.json root@165.227.227.213:/opt/radiogaga/package.json 2>/dev/null
echo "[deploy] Files synced at $(date +%H:%M:%S) — restart pending"
