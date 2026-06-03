"""
Blender Python 脚本：导出植被摆放数据为 JSON。

使用方法：
1. 在 Blender 中打开你摆好植被的场景
2. 打开 Scripting 工作区，粘贴本脚本
3. 运行 → 自动生成 vegetation_instances.json

★ 缩放处理：
  每种模型找到一个"基准对象"（source collection 或第一个出现的），
  其他实例的 scale 记录为相对于基准的倍数。
  配合 GLB 导出脚本（apply transforms），确保大小一致。
"""

import bpy
import json
import os
import math

# ═══════════════════════════════════════════════
# ★ 配置区 ★
# ═══════════════════════════════════════════════

# 植被总 Collection（包含所有实例）
COLLECTION_NAME = "Vegetation"

# 基准模型 Collection（用来确定每种植被的"原始大小"）
SOURCE_COLLECTION = "Vegetation_Source"

# 输出路径
OUTPUT_PATH = "/Users/yuanyuan/Documents/飞猪工作文件/25度假/迪士尼/shanghai-disney-twin/frontend/assets/3d/config/vegetation_instances.json"

# ═══════════════════════════════════════════════


def extract_model_name(obj_name):
    """去掉 Blender 的重复后缀 .001 .002 等"""
    parts = obj_name.rsplit(".", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]
    return obj_name


def show_popup(title, message):
    def draw(self, context):
        for line in message.split("\n"):
            self.layout.label(text=line)
    bpy.context.window_manager.popup_menu(draw, title=title, icon="INFO")


def export_vegetation():
    # ── 1. 收集基准模型的 scale（从 source collection） ──
    base_scales = {}  # model_name → (sx, sy, sz)

    source_col = bpy.data.collections.get(SOURCE_COLLECTION)
    if source_col:
        for obj in source_col.all_objects:
            if obj.type != "MESH":
                continue
            name = extract_model_name(obj.name)
            base_scales[name] = (obj.scale.x, obj.scale.y, obj.scale.z)

    # ── 2. 收集所有植被实例 ──
    col = bpy.data.collections.get(COLLECTION_NAME)
    if not col:
        show_popup("导出失败", f"未找到 Collection: {COLLECTION_NAME}")
        return

    objects = [obj for obj in col.all_objects if obj.type == "MESH"]
    if not objects:
        show_popup("导出失败", f"'{COLLECTION_NAME}' 里没有 MESH 对象")
        return

    models_set = set()
    instances = []

    # ── 找每种模型的基准旋转（从 source collection），用于去除 GLB 里已带的旋转 ──
    base_rotations = {}
    source_col = bpy.data.collections.get(SOURCE_COLLECTION)
    if source_col:
        for obj in source_col.all_objects:
            if obj.type != "MESH":
                continue
            name = extract_model_name(obj.name)
            base_rotations[name] = (obj.rotation_euler.x, obj.rotation_euler.y, obj.rotation_euler.z)

    for obj in objects:
        model_name = extract_model_name(obj.name)
        models_set.add(model_name)

        pos = obj.location
        rot = obj.rotation_euler
        scl = obj.scale

        # 旋转修正：减去基准模型的旋转（GLB 导出时已经带了这个旋转）
        base_rot = base_rotations.get(model_name, (0, 0, 0))
        corrected_rx = rot.x - base_rot[0]
        corrected_ry = rot.y - base_rot[1]
        corrected_rz = rot.z - base_rot[2]

        instances.append({
            "model": model_name,
            "position": [round(pos.x, 3), round(pos.z, 3), round(-pos.y, 3)],
            "rotation": [round(math.degrees(corrected_rx), 2), round(math.degrees(corrected_rz), 2), round(math.degrees(-corrected_ry), 2)],
            "scale": [round(scl.x, 3), round(scl.y, 3), round(scl.z, 3)]
        })

    models_list = sorted(models_set)

    # ── 3. 输出 ──
    result = {
        "_说明": "Blender 导出的植被摆放数据。scale 是 Blender 中的原始缩放值。",
        "_模型数": len(models_list),
        "_实例总数": len(instances),
        "models": models_list,
        "instances": instances
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    show_popup(f"摆放数据导出完成",
        f"模型种类: {len(models_list)}\n"
        f"实例总数: {len(instances)}\n"
        f"有基准scale的: {len(base_scales)}\n\n"
        f"输出: vegetation_instances.json")


export_vegetation()
