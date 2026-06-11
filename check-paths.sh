#!/bin/bash
# check-paths.sh - 检查代码和配置中是否有绝对路径引用assets资源
# 同时检查本地和GitHub Pages兼容性

set -e

echo "🔍 检查资源路径（本地+GitHub Pages兼容性）..."

# 查找所有使用绝对路径 /assets/ 的JavaScript文件
ABSOLUTE_PATHS=$(grep -r 'fetch\(["\x27]/assets/' src/ frontend/src/ --include="*.js" --include="*.mjs" 2>/dev/null || true)

if [ -n "$ABSOLUTE_PATHS" ]; then
  echo "❌ JS文件中发现绝对路径引用:"
  echo "$ABSOLUTE_PATHS"
  echo ""
  echo "💡 请修改为相对路径 ./assets/"
  echo ""
  exit 1
fi

# 查找JSON配置文件中的绝对路径
JSON_ABSOLUTE=$(grep -r '"/assets/' assets/ frontend/assets/ --include="*.json" 2>/dev/null || true)

if [ -n "$JSON_ABSOLUTE" ]; then
  echo "❌ JSON配置文件中发现绝对路径引用:"
  echo "$JSON_ABSOLUTE"
  echo ""
  echo "💡 请将JSON中的 /assets/ 改为 ./assets/"
  echo ""
  exit 1
fi

# 查找scene3d源文件中的绝对路径
SCENE3D_ABSOLUTE=$(grep -r '"/assets/' assets/3d/src/ frontend/assets/3d/src/ --include="*.js" 2>/dev/null || true)

if [ -n "$SCENE3D_ABSOLUTE" ]; then
  echo "❌ scene3d源文件中发现绝对路径引用:"
  echo "$SCENE3D_ABSOLUTE"
  echo ""
  echo "💡 请修改为相对路径 ./assets/"
  echo ""
  exit 1
fi

echo "✅ 所有资源路径都是相对路径,本地和GitHub Pages兼容"
exit 0