// Web/Sim_Parts/assets.js
// GLTF asset loading helper and resource manager.

export function makeGLTFLoader(A) {
  const loader = new A.GLTFLoader();
  const md = window.MeshoptDecoder;
  if (md) loader.setMeshoptDecoder(md);
  return loader;
}

export class Assets {
  constructor(ctx) {
    this.ctx = ctx;
  }

  // Create a standard GLTF loader using ARES3 context
  makeLoader() {
    return makeGLTFLoader(this.ctx.A);
  }

  // Load a single GLTF model and apply standard shadow settings
  loadModel(url, onLoad, onError) {
    const loader = this.makeLoader();
    loader.load(
      url,
      (gltf) => {
        if (this.ctx.disposed) {
          this.disposeGltf(gltf);
          return;
        }
        const root = gltf.scene;
        root.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
          }
        });
        if (onLoad) onLoad(root);
      },
      undefined,
      (err) => {
        console.error('모델 로드 실패:', url, err);
        if (onError) onError(err);
      }
    );
  }

  // Load multiple GLTF models concurrently (used for multi-part rovers, etc.)
  loadModels(urls, onPartLoad, onComplete, onError) {
    const loader = this.makeLoader();
    let remaining = urls.length;
    if (remaining === 0) {
      if (onComplete) onComplete();
      return;
    }

    urls.forEach((url) => {
      loader.load(
        url,
        (gltf) => {
          if (this.ctx.disposed) {
            this.disposeGltf(gltf);
            return;
          }
          const root = gltf.scene;
          root.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              o.frustumCulled = false;
            }
          });

          if (onPartLoad) onPartLoad(url, root);

          remaining--;
          if (remaining === 0 && onComplete) {
            onComplete();
          }
        },
        undefined,
        (err) => {
          console.error('부속 모델 로드 실패:', url, err);
          if (onError) onError(url, err);
          remaining--;
          if (remaining === 0 && onComplete) {
            onComplete();
          }
        }
      );
    });
  }

  // Properly dispose GLTF geometries and materials to avoid RAM leaks
  disposeGltf(gltf) {
    gltf.scene.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => {
          mm?.map?.dispose?.();
          mm?.dispose?.();
        });
      }
    });
  }
}
