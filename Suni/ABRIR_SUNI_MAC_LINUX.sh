#!/bin/sh
cd "$(dirname "$0")"
echo "Abre http://127.0.0.1:8099 en Chrome o Edge."
python3 -m http.server 8099 --bind 127.0.0.1
