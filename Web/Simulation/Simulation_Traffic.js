// Simulation_Traffic.js
// Subsystem wrapper for the Space Traffic Light (traffic) topic, reusing TrafficSubsystem.

import { Simulation_Base } from './Simulation_Base.js';
import { makeGLTFLoader } from '../Sim_Parts/assets.js';

export class Simulation_Traffic extends Simulation_Base {
  constructor(ctx) {
    super(ctx);
    this.traffic = ctx.traffic;
  }

  init() {
    const ctx = this.ctx;
    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const cfg = ctx.cfg;

    if (cfg.model) {
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

        // Setup traffic light lamps and hands
        this.traffic.setupTraffic(root, () => makeGLTFLoader(ctx.A), cfg.traffic);

        scene.add(root);
        ctx.editor?.register(root, cfg.label || 'Model');

        const maxDim = Math.max(sz.x, sz.y, sz.z);
        const fov = ctx.camera.fov * Math.PI / 180;
        ctx.frame(modelH * 0.55, (maxDim / 2) / Math.tan(fov / 2) * 1.9);
        if (ctx.loadingEl) ctx.loadingEl.style.display = 'none';
      }, (err) => {
        if (ctx.loadingEl && !ctx.disposed) ctx.loadingEl.textContent = '모델을 불러오지 못했어요';
      });
    }
  }

  // Control Methods
  placeLamps() {
    this.traffic.placeLamps(() => makeGLTFLoader(this.ctx.A));
  }

  placeHands() {
    this.traffic.placeHands(() => makeGLTFLoader(this.ctx.A));
  }

  resetTraffic() {
    this.traffic.resetTraffic();
  }

  toggleSlot(idx) {
    this.traffic.toggleSlot(idx);
  }

  setSlot(idx, val) {
    this.traffic.setSlotOn(idx, val);
  }

  get hasTraffic() { return true; }
}
