import * as THREE from "three";

export async function addTreeInstances(scene, url = "/assets/data/tree_positions.json") {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const list = await res.json();
    if (!Array.isArray(list)) return;

    const geo = new THREE.ConeGeometry(0.35, 1.2, 7);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 });
    const group = new THREE.Group();
    group.name = "TreeInstances";

    for (const t of list) {
      const m = new THREE.Mesh(geo.clone(), mat.clone());
      m.position.set(t.x, t.y + 0.6, t.z);
      m.rotation.y = t.rotY ?? 0;
      const s = t.scale ?? 1;
      m.scale.setScalar(s);
      group.add(m);
    }
    scene.add(group);
  } catch {
    // 无数据文件时不阻塞
  }
}
