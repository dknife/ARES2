// Simulation_Launcher.js
// Subsystem wrapper for the Launchpad (launchpad) topic, reusing the modular subsystems.

import { Simulation_Base } from './Simulation_Base.js';
import { Rocket } from '../Sim_Parts/rocket.js';

export class Simulation_Launcher extends Simulation_Base {
  constructor(ctx) {
    super(ctx);
    this.leds = ctx.leds;
    this.rocket = ctx.rocket;
    this.waves = ctx.waves;
    this.movement = ctx.movement;

    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const cfg = ctx.cfg;

    // Initialize LEDs configuration
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

        // Recolor Launchpad Antenna using static method in Rocket class
        Rocket.recolorAntenna(root, THREE);

        // Delegate Launchpad strip & torus LEDs creation to Leds class
        this.leds.setupLaunchLeds(root, cfg.launch, this.waves);

        // Delegate Rocket binding parameters to Rocket class
        this.rocket.setupRocket(root);
        this.movement.antennaPivot = root.userData.antennaPivot;

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

  // Getters/setters
  get launchLeds() { return this.leds.launchLeds; }
  get antennaPivot() { return this.movement.antennaPivot; }
  set antennaPivot(v) { this.movement.antennaPivot = v; }
  get rocketGroup() { return this.rocket.rocketGroup; }
  set rocketGroup(v) { this.rocket.rocketGroup = v; }
  get radarOn() { return this.movement.radarOn; }
  get radarDir() { return this.movement.radarDir; }
  get rocketLaunchOn() { return this.rocket.rocketLaunchOn; }
  get rocketAnimT() { return this.rocket.rocketAnimT; }

  setLaunchLed(i, value) {
    this.leds.setLaunchLed(i, value);
  }

  setRadar(on, dir) {
    this.movement.setRadar(on, dir);
  }

  setRocketLaunch(on, followCamera) {
    this.rocket.setRocketLaunch(on, followCamera);
  }

  setLaunchWave(on) {
    this.waves.setLaunchWave(on);
  }

  playRocketLaunch() {
    this.ctx.audio.playRocketLaunch();
  }

  get hasLaunchLeds() { return this.leds.launchLeds.length > 0; }
  get hasLaunchWave() { return true; }
  get hasRadar() { return !!this.movement.antennaPivot; }
  get hasRocket() { return !!this.rocket.rocketGroup; }
  get rocketAtRest() { return !this.rocket.rocketLaunchOn && this.rocket.rocketAnimT === 0; }
}
