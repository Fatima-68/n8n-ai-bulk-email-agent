@echo off
REM Starts n8n (installed with: npm install -g n8n@2) with this project's settings.
setlocal
set "D=%~dp0data\files"
set "D=%D:\=/%"
set "BULK_EMAIL_DATA_DIR=%D%"
set "N8N_RESTRICT_FILE_ACCESS_TO=%D%"
set "NODE_FUNCTION_ALLOW_BUILTIN=*"
set "N8N_BLOCK_ENV_ACCESS_IN_NODE=false"
set "GENERIC_TIMEZONE=Asia/Karachi"
set "TZ=Asia/Karachi"
echo Data folder: %D%
echo Open http://localhost:5678  (Ctrl+C to stop)
echo Allowlist: %NODE_FUNCTION_ALLOW_BUILTIN%
n8n start
