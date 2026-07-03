// Simulation_Base.js
// Common base class for topic simulations, implementing standard control interfaces.

export class Simulation_Base {
  constructor(ctx) {
    this.ctx = ctx;
  }

  init() {
    // To be overridden by subclasses
  }

  loadAndSetupModel(cfg, onLoaded) {
    const ctx = this.ctx;
    const THREE = ctx.THREE;
    const scene = ctx.scene;

    if (!cfg.model) return;

    ctx.assets.loadModel(cfg.model, (root) => {
      let sz = new THREE.Vector3();
      let box = new THREE.Box3();
      box.setFromObject(root);
      box.getSize(sz);
      const c = box.getCenter(new THREE.Vector3());
      root.position.x -= c.x;
      root.position.z -= c.z;
      root.position.y -= box.min.y;
      const modelH = sz.y;

      if (typeof onLoaded === 'function') {
        onLoaded(root, modelH);
      }

      scene.add(root);
      ctx.editor?.register(root, cfg.label || 'Model');

      const maxDim = Math.max(sz.x, sz.y, sz.z);
      const fov = ctx.camera.fov * Math.PI / 180;
      ctx.frame(modelH * 0.55, (maxDim / 2) / Math.tan(fov / 2) * 1.9);
      if (ctx.loadingEl) ctx.loadingEl.style.display = 'none';
    }, (err) => {
      if (ctx.loadingEl && !ctx.disposed) {
        ctx.loadingEl.textContent = '모델을 불러오지 못했어요';
      }
    });
  }

  // Base Controller interface methods forwarded to context components
  render() {
    this.ctx.renderEngine.render();
  }

  resize() {
    this.ctx.resize();
  }

  dispose() {
    this.ctx.dispose();
  }

  simSink(command, waitResp) {
    return this.ctx.dispatcher.simSink(command, waitResp);
  }

  cancelActiveWait() {
    this.ctx.dispatcher.cancelActiveWait();
  }
}
