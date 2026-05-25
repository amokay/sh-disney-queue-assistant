# 优化工具使用说明

`frontend/assets/` 下的 **`source/`** 与 **`optimized/`** 分工如下：

- **`source/`**：原始 GLB、原始 PNG/JPG 贴图，体积大、可反复修改。**建议只保留在本地**，已通过根目录 `.gitignore` 忽略，避免进入 Git 仓库。
- **`optimized/`**：经过 Draco / WebP 处理后的资源，用于 **H5 线上访问或由后端静态托管**，体积更小、更适合网络传输。

---

## GLB 压缩（Draco）

**依赖安装：**

```bash
npm install -g gltf-pipeline
```

**运行（在项目根目录）：**

```bash
chmod +x tools/optimize_glb.sh
./tools/optimize_glb.sh
```

脚本会递归扫描 `frontend/assets/models/source/` 下所有 `.glb`，按原有子目录结构输出到 `frontend/assets/models/optimized/`，并对每个文件打印压缩前后的 `du -sh` 体积。

> 说明：`gltf-pipeline` 启用 Draco 的官方参数为 `-d`（`--draco.compressMeshes`）。

---

## 贴图压缩（WebP）

**依赖安装：**

```bash
npm install -g sharp-cli
```

**运行（在项目根目录）：**

```bash
chmod +x tools/compress_textures.sh
./tools/compress_textures.sh
```

脚本会递归扫描 `frontend/assets/textures/source/` 下所有 `.png`、`.jpg`，转换为 `.webp`（质量 85），输出到 `frontend/assets/textures/optimized/`，并打印原文件名、原体积、转换后体积、压缩比（百分比）。

---

## 体积目标参考（单文件）

| 类型 | 建议上限 |
|------|-----------|
| 单个道具 GLB | &lt; 100 KB |
| 园区背景建筑 GLB | &lt; 1 MB |
| 地标建筑（单个 LOD）GLB | &lt; 500 KB |
| 鸟瞰全景 GLB | &lt; 2 MB |

实际以真机加载与帧率为准，上表为经验参考值。
