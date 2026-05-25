import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

/**
 * Draco 压缩过的 glb（gltf-pipeline -d）必须配置 DRACOLoader，否则网格可能为空或加载失败。
 * 解码器与 import map 中的 three 版本保持一致。
 */
const DRACO_DECODER_BASE = "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(DRACO_DECODER_BASE);

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

export async function loadGLB(url, parent) {
  return await new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        // Enable shadows on all meshes
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        parent.add(gltf.scene);
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        console.error("[模型] GLTFLoader 错误:", url, err);
        reject(err);
      }
    );
  });
}
