#!/bin/bash
#
# 运行前需要执行: npm install -g sharp-cli
# 将 frontend/assets/textures/source/ 下的 .png / .jpg 转为 WebP，
# 输出到 frontend/assets/textures/optimized/，扩展名为 .webp
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/frontend/assets/textures/source"
DST="${ROOT}/frontend/assets/textures/optimized"

if ! command -v sharp >/dev/null 2>&1; then
  echo "未找到 sharp 命令，请先执行: npm install -g sharp-cli" >&2
  exit 1
fi

filesize_bytes() {
  local f="$1"
  if stat --version >/dev/null 2>&1; then
    stat -c%s "$f"
  else
    stat -f%z "$f"
  fi
}

if [[ ! -d "$SRC" ]]; then
  echo "源目录不存在: $SRC" >&2
  exit 1
fi

while IFS= read -r -d '' infile; do
  rel="${infile#"${SRC}/"}"
  reldir="$(dirname "$rel")"
  base="$(basename "$infile")"
  stem="${base%.*}"
  outdir="${DST}/${reldir}"
  mkdir -p "$outdir"
  outfile="${outdir}/${stem}.webp"

  orig_bytes="$(filesize_bytes "$infile")"

  sharp -i "$infile" -o "$outfile" --format webp --quality 85

  new_bytes="$(filesize_bytes "$outfile")"

  if [[ "$orig_bytes" -eq 0 ]]; then
    ratio="0.00"
  else
    ratio="$(awk -v o="$orig_bytes" -v n="$new_bytes" 'BEGIN { printf "%.2f", (1 - (n / o)) * 100 }')"
  fi

  echo "----------------------------------------"
  echo "原文件: ${rel}"
  echo "原体积: ${orig_bytes} bytes"
  echo "转换后: ${new_bytes} bytes"
  echo "压缩比: ${ratio}%"
done < <(find "$SRC" \( -name '*.png' -o -name '*.jpg' \) -type f -print0)

echo "✅ 所有贴图已转换为 WebP，输出目录：frontend/assets/textures/optimized/"
