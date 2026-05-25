import * as THREE from "three";

export function bindAttractionPicking(renderer, camera, scene, getAttractionById) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onPointerDown(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    pointer.set(x, y);

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        const aid = o.userData?.attractionId;
        if (aid) {
          const a = getAttractionById(aid);
          if (a) {
            let modelRoot = null;
            for (let cur = h.object; cur; cur = cur.parent) {
              if (cur.userData?.isGltfModelRoot) {
                modelRoot = cur;
                break;
              }
              if (!cur.parent || cur.parent.type === "Scene") break;
            }
            const p = h.point;
            window.dispatchEvent(
              new CustomEvent("attraction-clicked", {
                detail: {
                  attraction: a,
                  modelRoot,
                  hitPoint: { x: p.x, y: p.y, z: p.z },
                },
              })
            );
            return;
          }
        }

        const pid = o.userData?.pinId;
        if (pid) {
          window.dispatchEvent(
            new CustomEvent("map-pin-clicked", {
              detail: {
                pinId: pid,
                label: o.userData.pinLabel || "",
                attractionId: o.userData.attractionId || null,
              },
            })
          );
          return;
        }

        o = o.parent;
      }
    }
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  return () => renderer.domElement.removeEventListener("pointerdown", onPointerDown);
}
