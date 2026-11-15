#!/usr/bin/env bash
# 安装 headless Chromium 需要但在 Debian trixie 基础镜像里缺失的共享库。
# 幂等：已存在的 .deb 会跳过下载。库装到 ~/.cache/pw-libs（不进快照）。
set -euo pipefail

WORK=/tmp/pw-libs-debs
mkdir -p "$WORK" /home/user/.cache/pw-libs
cd "$WORK"

if [ ! -f Packages ]; then
  curl -fsSL -o Packages.gz https://deb.debian.org/debian/dists/trixie/main/binary-amd64/Packages.gz
  gunzip -f Packages.gz
fi

for pkg in libnspr4 libnss3 libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 \
           libatspi2.0-0t64 libxdamage1 libxkbcommon0; do
  file=$(awk -v p="$pkg" '$1=="Package:" && $2==p {found=1} found && $1=="Filename:" {print $2; exit}' Packages)
  if [ -z "$file" ]; then
    echo "MISS $pkg"
    continue
  fi
  if [ ! -f "$pkg.deb" ]; then
    curl -fsSL -o "$pkg.deb" "https://deb.debian.org/debian/$file"
  fi
  dpkg-deb -x "$pkg.deb" /home/user/.cache/pw-libs
  echo "ok   $pkg"
done

LIBDIR=/home/user/.cache/pw-libs/usr/lib/x86_64-linux-gnu
echo
echo "剩余未解析依赖（应为空）："
LD_LIBRARY_PATH="$LIBDIR" ldd /home/user/.cache/pw-browsers/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | grep "not found" || echo "  （无）"
echo
echo "用法：export LD_LIBRARY_PATH=$LIBDIR:\$LD_LIBRARY_PATH"
