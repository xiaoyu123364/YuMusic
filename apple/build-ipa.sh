#!/usr/bin/env bash
#
# YuMusic · iOS 本地构建脚本（需在 macOS + Xcode 26 上运行）
#
# 用法：
#   bash apple/build-ipa.sh                # Release + 归档 + 导出 IPA
#   bash apple/build-ipa.sh Debug          # Debug 构建
#   SKIP_PREBUILD=1 bash apple/build-ipa.sh # 跳过 prebuild（ios/ 已生成时）
#
# 前置：已 npm install；Xcode 中已配置签名（Team / Bundle Id / Provisioning Profile）
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="${1:-Release}"
WORKSPACE="YuMusic.xcworkspace"
SCHEME="YuMusic"
OUT="$ROOT_DIR/ios/build"

echo "==> 项目根: $ROOT_DIR"
cd "$ROOT_DIR"

if [ -z "${SKIP_PREBUILD:-}" ]; then
  echo "==> 生成 iOS 原生工程 (expo prebuild --platform ios --clean)"
  npx expo prebuild --platform ios --clean
fi

cd "$ROOT_DIR/ios"
mkdir -p "$OUT"

echo "==> xcodebuild archive ($CONFIG)"
xcodebuild -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination 'generic/platform=iOS' \
  -archivePath "$OUT/YuMusic.xcarchive" \
  archive

echo "==> 导出 IPA (按 apple/exportOptions.plist)"
xcodebuild -exportArchive \
  -archivePath "$OUT/YuMusic.xcarchive" \
  -exportOptionsPlist "$SCRIPT_DIR/exportOptions.plist" \
  -exportPath "$OUT/IPA"

echo "==> 完成：IPA 位于 $OUT/IPA"
ls -lh "$OUT/IPA" 2>/dev/null || true
