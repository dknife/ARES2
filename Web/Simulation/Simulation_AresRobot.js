// Simulation_AresRobot.js
// Subsystem wrapper for the Ares Albi Robot (albi) topic, reusing the modular LedsSubsystem.

import { Simulation_Base } from './Simulation_Base.js';

export class Simulation_AresRobot extends Simulation_Base {
  constructor(ctx) {
    super(ctx);
    this.leds = ctx.leds;

    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const cfg = ctx.cfg;

    this.leds.init(cfg.eyes, cfg.chest, cfg.launch);

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

        // Delegate eye/chest LEDs attaching to Leds class
        this.leds.setupAresLeds(root);

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
  get hasEyes() { return !!this.leds.eyesCfg; }
  get hasChest() { return !!this.leds.chestCfg; }
  get eyeL() { return this.leds.eyeL; }
  get eyeR() { return this.leds.eyeR; }
  get chestLed() { return this.leds.chestLed; }

  setEye(side, val) {
    this.leds.setEye(side, val);
  }

  setChest(val) {
    this.leds.setChest(val);
  }
}
