#!/bin/zsh
cd "$(dirname "$0")/src/app"
(sleep 1; open "http://127.0.0.1:8787/hall/") &
/opt/homebrew/bin/node server.mjs
