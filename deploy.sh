#!/usr/bin/env bash
# deploy.sh — build and deploy shadowedvaca.com
# Run from the repo root in Git Bash (Windows) or any bash shell.
# Requires: Python 3.11+, ssh/scp (OpenSSH), key at ~/.ssh/va_hetzner_openssh
#
# If rsync is available (e.g. WSL, Linux, macOS), you can replace the scp
# section with the rsync command in the comment below for incremental deploys.

set -euo pipefail

DEPLOY_HOST="deploy@5.78.114.224"
DEPLOY_KEY="$HOME/.ssh/va_hetzner_openssh"
REMOTE_PATH="/var/www/shadowedvaca.com/"

echo "=== shadowedvaca.com deploy ==="

echo "Building..."
python packages/site/build.py

echo "Deploying..."
# scp -r works everywhere OpenSSH is available (including Windows)
scp -r \
  -i "$DEPLOY_KEY" \
  -o StrictHostKeyChecking=no \
  dist/* \
  "$DEPLOY_HOST:$REMOTE_PATH"

# rsync alternative (faster incremental deploys, requires rsync):
# rsync -avz --delete \
#   -e "ssh -i $DEPLOY_KEY -o StrictHostKeyChecking=no" \
#   dist/ \
#   "$DEPLOY_HOST:$REMOTE_PATH"

echo ""
echo "Done. Live at https://shadowedvaca.com"
