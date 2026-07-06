// Web/Sim_Parts/assets.js
// GLTF asset loading helpers shared by topic-specific simulation modules.

export function makeGLTFLoader(A) {
  const loader = new A.GLTFLoader();
  const md = window.MeshoptDecoder;
  if (md) loader.setMeshoptDecoder(md);
  return loader;
}

function prepareRoot(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.frustumCulled = false;
  });
  return root;
}

function disposeRoot(root) {
  root?.traverse?.((node) => {
    if (!node.isMesh && !node.isSprite) return;
    node.geometry?.dispose?.();
    const material = node.material;
    (Array.isArray(material) ? material : [material]).forEach((m) => {
      m?.map?.dispose?.();
      m?.dispose?.();
    });
  });
}

export class Assets {
  constructor(ctx) {
    this.ctx = ctx;
  }

  makeLoader() {
    return makeGLTFLoader(this.ctx.A);
  }

  loadModel(url, onLoad, onError) {
    const loader = this.makeLoader();
    loader.load(
      url,
      (gltf) => {
        if (this.ctx.disposed) {
          this.disposeGltf(gltf);
          return;
        }
        const root = prepareRoot(gltf.scene);
        onLoad?.(root, gltf);
      },
      undefined,
      (err) => {
        console.error('모델 로드 실패:', url, err);
        onError?.(err);
      },
    );
  }

  loadModels(urls, onPartLoad, onComplete, onError) {
    const list = Array.isArray(urls) ? urls : [];
    if (list.length === 0) {
      onComplete?.();
      return;
    }

    const loader = this.makeLoader();
    let remaining = list.length;
    const finishOne = () => {
      remaining -= 1;
      if (remaining === 0) onComplete?.();
    };

    list.forEach((url) => {
      loader.load(
        url,
        (gltf) => {
          if (this.ctx.disposed) {
            this.disposeGltf(gltf);
            finishOne();
            return;
          }
          const root = prepareRoot(gltf.scene);
          onPartLoad?.(url, root, gltf);
          finishOne();
        },
        undefined,
        (err) => {
          console.error('부품 모델 로드 실패:', url, err);
          onError?.(url, err);
          finishOne();
        },
      );
    });
  }

  disposeRoot(root) {
    disposeRoot(root);
  }

  disposeGltf(gltf) {
    disposeRoot(gltf?.scene);
  }
}
