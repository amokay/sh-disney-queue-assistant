"""
Blender 4.3 脚本：逐个选中模型 → 勾选 Selected Objects → 导出 GLB
"""

import bpy
import os

# ═══════════════════════════════════════════════
# ★ 配置区 ★
# ═══════════════════════════════════════════════

SOURCE_COLLECTIONS = ["Vegetation_Source", "download_bush_collection"]

OUTPUT_DIR = "/Users/yuanyuan/Documents/飞猪工作文件/25度假/迪士尼/shanghai-disney-twin/frontend/assets/3d/models/vegetation"

RESET_ORIGIN = True

# ═══════════════════════════════════════════════

def show_popup(title, message):
    def draw(self, context):
        for line in message.split("\n"):
            self.layout.label(text=line)
    bpy.context.window_manager.popup_menu(draw, title=title, icon="INFO")


def find_selection_param():
    """自动查找「Selected Objects」对应的参数名"""
    rna = bpy.ops.export_scene.gltf.get_rna_type()
    props = rna.properties
    # 列出所有包含 select 的参数
    candidates = [p.identifier for p in props if "select" in p.identifier.lower()]
    # 优先匹配这些名字
    for name in ["use_selected_objects", "use_selection", "export_selected", "export_selection"]:
        if name in [p.identifier for p in props]:
            return name
    return candidates[0] if candidates else None


def batch_export():
    # 收集对象
    objects = []
    found_collections = []

    for col_name in SOURCE_COLLECTIONS:
        col = bpy.data.collections.get(col_name)
        if not col:
            continue
        found_collections.append(col_name)
        for obj in col.all_objects:
            if obj.type == "MESH":
                objects.append(obj)

    if not objects:
        all_cols = [c.name for c in bpy.data.collections]
        show_popup("导出失败", "未找到模型\n\n所有 Collection:\n" + "\n".join(all_cols[:20]))
        return

    # 去重
    seen = set()
    unique_objects = []
    for obj in objects:
        parts = obj.name.rsplit(".", 1)
        name = parts[0] if len(parts) == 2 and parts[1].isdigit() else obj.name
        if name not in seen:
            seen.add(name)
            unique_objects.append((name, obj))

    # 查找参数名
    param = find_selection_param()
    if not param:
        show_popup("失败", "找不到 Selected Objects 参数名，请截图发给我")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    success = 0
    failed = 0
    results = []

    for name, obj in unique_objects:
        filepath = os.path.join(OUTPUT_DIR, f"{name}.glb")
        try:
            # 取消所有选择
            bpy.ops.object.select_all(action='DESELECT')

            # 只选中这一个对象（及子对象）
            obj.select_set(True)
            for child in obj.children_recursive:
                child.select_set(True)
            bpy.context.view_layer.objects.active = obj

            # 记录原始位置，临时移到原点
            orig_loc = obj.location.copy()
            if RESET_ORIGIN:
                obj.location = (0, 0, 0)

            # 导出：勾选 Selected Objects
            bpy.ops.export_scene.gltf(
                filepath=filepath,
                **{param: True}
            )

            # 恢复位置
            if RESET_ORIGIN:
                obj.location = orig_loc

            if os.path.exists(filepath):
                size = os.path.getsize(filepath)
                results.append(f"OK  {name}.glb ({size/1024:.1f}KB)")
                success += 1
            else:
                results.append(f"ERR {name}.glb (未生成)")
                failed += 1

        except Exception as e:
            if RESET_ORIGIN:
                obj.location = orig_loc
            results.append(f"ERR {name}.glb ({str(e)[:40]})")
            failed += 1

    summary = f"成功 {success}，失败 {failed}\n使用参数: {param}\n\n"
    detail = "\n".join(results[:25])
    if len(results) > 25:
        detail += f"\n... 还有 {len(results)-25} 个"
    show_popup(f"导出完成 ({success}/{success+failed})", summary + detail)


batch_export()
