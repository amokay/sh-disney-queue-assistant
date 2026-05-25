import * as THREE from "three";

/**
 * 地图打点：小立柱 + 环，点击走 interaction 的 pinId / attractionId。
 * @param {THREE.Scene} scene
 * @param {Array<{ id: string, label: string, x: number, y?: number, z: number, attractionId?: string }>} pins
 */
export function addMapPins(scene, pins) {
  const group = new THREE.Group();
  group.name = "MapPins";

  const stemMat = new THREE.MeshStandardMaterial({ color: 0xff66aa, metalness: 0.15, roughness: 0.45 });
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xff99cc,
    emissive: 0x331122,
    metalness: 0.1,
    roughness: 0.55,
    transparent: true,
    opacity: 0.85,
  });

  for (const p of pins || []) {
    const g = new THREE.Group();
    g.name = `pin:${p.id}`;

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 12), stemMat.clone());
    stem.position.y = 0.6 + (p.y ?? 0);
    stem.userData.pinId = p.id;
    stem.userData.pinLabel = p.label;
    if (p.attractionId) stem.userData.attractionId = p.attractionId;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 10, 28), ringMat.clone());
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 1.35 + (p.y ?? 0), 0);
    ring.userData.pinId = p.id;
    ring.userData.pinLabel = p.label;
    if (p.attractionId) ring.userData.attractionId = p.attractionId;

    g.add(stem, ring);
    g.position.set(p.x, 0, p.z);
    group.add(g);
  }

  scene.add(group);
  return group;
}
