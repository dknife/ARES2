// Simulation_Launcher.js
// Subsystem wrapper for the Launchpad (launchpad) topic, reusing the modular subsystems.

import { Simulation_Base } from './Simulation_Base.js';
import { Rocket } from '../Sim_Parts/rocket.js';

const LAUNCH_STRIP_PALETTE = {
  sphereBase: 0x031a0a,
  emissive: 0x00ff33,
  glowStops: ['rgba(20,255,80,1)', 'rgba(0,230,50,0.78)', 'rgba(0,255,40,0)'],
  glowTint: 0x00ff44,
  lightColor: 0x00ff44,
  intensityScale: 0.12,
  opacityOn: 0.99,
  glowScale: 0.55,
};

const LAUNCH_TORUS_PALETTE = {
  sphereBase: 0x1f0204,
  emissive: 0xff0a1e,
  glowStops: ['rgba(255,80,70,1)', 'rgba(255,20,25,0.78)', 'rgba(255,0,0,0)'],
  glowTint: 0xff1828,
  lightColor: 0xff1422,
  intensityScale: 0.45,
  opacityOn: 0.99,
  glowScale: 0.55,
};

export class Simulation_Launcher extends Simulation_Base {
  constructor(ctx) {
    super(ctx);
    this.leds = ctx.leds;
    this.rocket = ctx.rocket;
    this.waves = ctx.waves;
    this.movement = ctx.movement;
  }

  init() {
    const ctx = this.ctx;
    const THREE = ctx.THREE;
    const cfg = ctx.cfg;
    const stripGlow = this.leds.createGlowTexture(LAUNCH_STRIP_PALETTE.glowStops);
    const torusGlow = this.leds.createGlowTexture(LAUNCH_TORUS_PALETTE.glowStops);

    this.loadAndSetupModel(cfg, (root) => {
      Rocket.recolorAntenna(root, THREE);
      this.rocket.setupRocket(root);
      this.movement.antennaPivot = root.userData.antennaPivot;
      this.setupLaunchIndicators(root, cfg.launch, stripGlow, torusGlow);
    });
  }

  setupLaunchIndicators(root, launchCfg, stripGlow, torusGlow) {
    const THREE = this.ctx.THREE;
    if (!launchCfg) return;

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    this.waves.launchFootprintSize = Math.max(size.x, size.z);

    const lx = box.min.x + size.x * launchCfg.stripXFrac;
    const lz = box.min.z + size.z * launchCfg.stripZFrac;
    const yTop = box.min.y + size.y * launchCfg.stripYRange[0];
    const yBot = box.min.y + size.y * launchCfg.stripYRange[1];
    const count = launchCfg.stripCount;

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const ly = yTop + (yBot - yTop) * t;
      const led = this.leds.register(`launch-${i + 1}`, this.leds.createMeshLed({
        radius: launchCfg.stripRadius,
        pos: [lx, ly, lz],
        palette: LAUNCH_STRIP_PALETTE,
        glowTex: stripGlow,
      }));
      root.add(led.group);
    }

    const rb = root.userData.rocketBottomLocal;
    const rmesh = root.userData.rocketMeshRef;
    if (rb && rmesh) {
      const torusGeom = new THREE.TorusGeometry(launchCfg.torusRadius, launchCfg.torusTube, 16, 48);
      torusGeom.rotateX(Math.PI / 2);
      const ring = this.leds.register('launch-0', this.leds.createMeshLed({
        radius: launchCfg.torusRadius,
        pos: [rb.x, rb.y + launchCfg.torusYOffset, rb.z],
        palette: LAUNCH_TORUS_PALETTE,
        glowTex: torusGlow,
        geometry: torusGeom,
      }));
      rmesh.add(ring.group);
    }
  }

  // Getters/setters
  get antennaPivot() { return this.movement.antennaPivot; }
  set antennaPivot(v) { this.movement.antennaPivot = v; }
  get rocketGroup() { return this.rocket.rocketGroup; }
  set rocketGroup(v) { this.rocket.rocketGroup = v; }
  get radarOn() { return this.movement.radarOn; }
  get radarDir() { return this.movement.radarDir; }
  get rocketLaunchOn() { return this.rocket.rocketLaunchOn; }
  get rocketAnimT() { return this.rocket.rocketAnimT; }

  setLaunchLed(i, value) {
    this.leds.setIndexed('launch', i, value);
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

  get hasLaunchLeds() { return !!this.leds.get('launch-0'); }
  get hasLaunchWave() { return true; }
  get hasRadar() { return !!this.movement.antennaPivot; }
  get hasRocket() { return !!this.rocket.rocketGroup; }
  get rocketAtRest() { return !this.rocket.rocketLaunchOn && this.rocket.rocketAnimT === 0; }
}
