#!/bin/zsh
# Sets the site password. The password never leaves this Mac; only its SHA-256 hash is stored in gate.js.
cd "$(dirname "$0")/src/app/public"
read -s "P?New site password: "; echo
H=$(printf %s "$P" | shasum -a 256 | cut -d' ' -f1)
sed -i '' -E "s/var HASH = '[^']*'/var HASH = '$H'/" gate.js
echo "Password set. Now commit and push."
