#!/bin/bash
#
# 运行前需要执行: npm install -g gltf-pipeline
# 将 frontend/assets/models/source/ 下各子目录中的 .glb 用 Draco 压缩后，
# 按相同相对路径输出到 frontend/assets/models/optimized/
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/frontend/assets/models/source"
DST="${ROOT}/frontend/assets/models/optimized"

if ! command -v gltf-pipeline >/dev/null 2>&1; then
  echo "未找到 gltf-pipeline，请先执行: npm install -g gltf-pipeline" >&2
  exit 1
fi

if [[ ! -d "$SRC" ]]; then
  echo "源目录不存在: $SRC" >&2
  exit 1
fi

while IFS= read -r -d '' infile; do
  rel="${infile#"${SRC}/"}"
  outfile="${DST}/${rel}"
  outdir="$(dirname "$outfile")"
  mkdir -p "$outdir"

  echo "----------------------------------------"
  echo "处理: ${rel}"
  echo "压缩前:"
  du -sh "$infile"

  # gltf-pipeline 启用 Draco：使用 -d（等价于 --draco.compressMeshes）
  gltf-pipeline -i "$infile" -o "$outfile" -d

  echo "压缩后:"
  du -sh "$outfile"
done < <(find "$SRC" -type f -name '*.glb' -print0)

echo "✅ 所有 GLB 已压缩完成，输出目录：frontend/assets/models/optimized/"
