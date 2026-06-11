#!/bin/bash
# check-paths.sh - 检查代码中是否有绝对路径引用assets资源

set -e

echo "🔍 检查资源路径..."

# 查找所有使用绝对路径 /assets/ 的JavaScript文件
ABSOLUTE_PATHS=$(grep -r 'fetch\(["\x27]/assets/' src/ --include="*.js" --include="*.mjs" 2>/dev/null || true)

if [ -n "$ABSOLUTE_PATHS" ]; then
  echo "❌ 发现绝对路径引用:"
  echo "$ABSOLUTE_PATHS"
  echo ""
  echo "💡 请修改为相对路径 ./assets/"
  echo ""
  exit 1
fi

echo "✅ 所有资源路径都是相对路径"
exit 0
