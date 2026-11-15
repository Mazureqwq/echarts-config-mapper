#!/usr/bin/env bash
# ChartForge 开发环境恢复脚本（幂等，可反复执行）。
#
# 背景：本仓库运行在会周期性还原工作区快照的沙箱里。快照只保留 /home/user 下的
# 普通文件，因此 node_modules / Node 运行时 / Playwright 浏览器 / 系统共享库
# 都会丢失。每次丢失后手工重装既慢又容易漏步骤，故收敛成一个脚本。
#
# 用法：
#   bash scripts/bootstrap-dev-env.sh          # 只装缺失的部分
#   bash scripts/bootstrap-dev-env.sh --force  # 强制重装 node_modules
#
# 装完后执行前需要（脚本会打印，但不会污染你的 shell）：
#   export PATH=/home/user/.cache/node22/bin:$PATH
#   export PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/pw-browsers
#   export LD_LIBRARY_PATH=/home/user/.cache/pw-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
set -euo pipefail

NODE_VERSION="v22.20.0"
NODE_DIST="node-${NODE_VERSION}-linux-x64"
NODE_HOME="/home/user/.cache/node22"
PW_BROWSERS="/home/user/.cache/pw-browsers"
PW_LIBS="/home/user/.cache/pw-libs"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE="${1:-}"

log() { printf '\n=== %s ===\n' "$1"; }

# ---------- 1. Node 运行时 ----------
log "1/4 Node ${NODE_VERSION}"
if [ -x "$NODE_HOME/bin/node" ]; then
  echo "已存在：$("$NODE_HOME/bin/node" -v)"
else
  echo "下载 ${NODE_DIST} ..."
  mkdir -p "$NODE_HOME"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/node.tar.xz" \
    "https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.tar.xz"
  tar -xJf "$tmp/node.tar.xz" -C "$NODE_HOME" --strip-components=1
  rm -rf "$tmp"
  echo "完成：$("$NODE_HOME/bin/node" -v)"
fi
export PATH="$NODE_HOME/bin:$PATH"

# ---------- 2. pnpm ----------
log "2/4 pnpm"
if "$NODE_HOME/bin/pnpm" --version >/dev/null 2>&1; then
  echo "已存在：$("$NODE_HOME/bin/pnpm" --version)"
else
  # 刻意用 npm 装到 NODE_HOME，而不是 corepack：
  # corepack 的缓存目录在快照后会出现 half-restored 状态
  # （lastKnownGood.json 在、v1/pnpm 内容缺失），排查成本高于直接重装。
  "$NODE_HOME/bin/npm" install -g pnpm --prefix "$NODE_HOME" >/dev/null 2>&1
  echo "完成：$("$NODE_HOME/bin/pnpm" --version)"
fi

# ---------- 3. 项目依赖 ----------
log "3/4 项目依赖"
cd "$REPO_ROOT"
if [ -d node_modules ] && [ "$FORCE" != "--force" ]; then
  echo "node_modules 已存在（加 --force 可强制重装）"
else
  "$NODE_HOME/bin/pnpm" install --prefer-offline
fi

# ---------- 4. Playwright 浏览器 + 系统共享库 ----------
log "4/4 Playwright Chromium"
export PLAYWRIGHT_BROWSERS_PATH="$PW_BROWSERS"
if ls "$PW_BROWSERS"/chromium_headless_shell-* >/dev/null 2>&1; then
  echo "浏览器已存在"
else
  "$NODE_HOME/bin/pnpm" exec playwright install chromium
fi

if [ -d "$PW_LIBS/usr/lib/x86_64-linux-gnu" ]; then
  echo "共享库已存在"
elif [ -f scripts/install-playwright-libs.sh ]; then
  # 用 bash 显式调用：工作区快照还原会丢掉可执行位，不能依赖 -x 判断
  bash scripts/install-playwright-libs.sh
else
  echo "警告：缺少 scripts/install-playwright-libs.sh，e2e 可能无法启动浏览器" >&2
fi

# ---------- 收尾：验证 ----------
log "验证"
export LD_LIBRARY_PATH="$PW_LIBS/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
echo "node    : $("$NODE_HOME/bin/node" -v)"
echo "pnpm    : $("$NODE_HOME/bin/pnpm" -v)"
shell="$(ls "$PW_BROWSERS"/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | head -1)"
if [ -n "$shell" ]; then
  missing="$(ldd "$shell" 2>/dev/null | grep 'not found' || true)"
  if [ -z "$missing" ]; then
    echo "浏览器  : 依赖齐全"
  else
    echo "浏览器  : 仍缺依赖" >&2
    echo "$missing" >&2
    exit 1
  fi
fi

cat <<'EOF'

环境就绪。每个新 shell 需要：

  export PATH=/home/user/.cache/node22/bin:$PATH
  export PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/pw-browsers
  export LD_LIBRARY_PATH=/home/user/.cache/pw-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
EOF
