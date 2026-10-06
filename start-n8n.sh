#!/usr/bin/env bash
# Starts n8n (installed with: npm install -g n8n@2) with this project's settings.
cd "$(dirname "$0")"
export BULK_EMAIL_DATA_DIR="$PWD/data/files"
export N8N_RESTRICT_FILE_ACCESS_TO="$BULK_EMAIL_DATA_DIR"
export NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
export N8N_BLOCK_ENV_ACCESS_IN_NODE=false
export GENERIC_TIMEZONE="Asia/Karachi" TZ="Asia/Karachi"
echo "Data folder: $BULK_EMAIL_DATA_DIR"
exec n8n start
