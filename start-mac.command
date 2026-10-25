#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "ยังไม่ได้ติดตั้ง Node.js กรุณาติดตั้งจาก https://nodejs.org"
  read -r -p "กด Enter เพื่อปิด"
  exit 1
fi
(sleep 1; open "http://localhost:3000/host") &
node server.js
