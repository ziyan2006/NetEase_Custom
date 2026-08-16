#!/usr/bin/env bash
# ============================================================
# 为 Linux 环境准备「随包自带 Chrome」(无需 root)
#  - Chrome for Testing 下载到 bin/chrome-linux/
#  - libnspr4/libnss3/libasound2 等依赖库解压到 bin/chrome-linux/lib/
#  - chrome-resolver.js 会自动检测并注入 LD_LIBRARY_PATH
# 适用: WSL2 / 无头 Linux 服务器 (无法 sudo apt install 的场景)
# ============================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==> [1/2] 下载 Chrome for Testing (约 180MB)..."
npx --yes @puppeteer/browsers install chrome@stable --path bin/chrome-linux

echo "==> [2/2] 下载并解压依赖库 (libnspr4 / libnss3 / libasound2)..."
DEPS_DIR="bin/chrome-linux/lib"
mkdir -p "$DEPS_DIR"
TMP_DEPS="$(mktemp -d)"
cd "$TMP_DEPS"

# 新发行版为 libasound2t64, 旧版为 libasound2
if ! apt-get download libnspr4 libnss3 libasound2t64 2>/dev/null; then
  apt-get download libnspr4 libnss3 libasound2
fi

for f in *.deb; do
  dpkg -x "$f" extracted
done

cp -rn extracted/usr/lib/x86_64-linux-gnu/*.so* "$PROJECT_ROOT/$DEPS_DIR/" 2>/dev/null || true
rm -rf "$TMP_DEPS"

echo ""
echo "==> 完成! Chrome 位于:"
find "$PROJECT_ROOT/bin/chrome-linux" -name chrome -type f
echo ""
echo "项目启动后将自动使用随包 Chrome, 无需 Xvfb (headless=new 模式)。"
