// Simulation_Launcher.js
// Subsystem wrapper for the Launchpad (launchpad) topic, reusing the modular subsystems.

import { LedSubsystem } from '../Sim_Parts/leds.js';
import { RocketSubsystem } from '../Sim_Parts/rocket.js';
import { WavesSubsystem } from '../Sim_Parts/waves.js';
import { MovementSubsystem } from '../Sim_Parts/movement.js';
import { recolorAntenna } from '../Sim_Parts/rocket.js';
import { playRocketLaunch as basePlayRocketLaunch } from '../Sim_Parts/audio.js';

export function recolorLaunchpadAntenna(root, THREE) {
  recolorAntenna(root, THREE);
}

export function playRocketLaunch(audioCtx) {
  basePlayRocketLaunch(audioCtx);
}

export class LauncherSubsystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.leds = new LedSubsystem(ctx);
    this.rocket = new RocketSubsystem(ctx);
    this.waves = new WavesSubsystem(ctx);
    this.movement = new MovementSubsystem(ctx);

    const cfg = ctx.cfg;
    this.leds.init(cfg.eyes, cfg.chest, cfg.launch);
  }

  // Getters/setters to expose properties of sub-subsystems so client code / main code works:
  get launchLeds() { return this.leds.launchLeds; }
  get antennaPivot() { return this.movement.antennaPivot; }
  set antennaPivot(v) { this.movement.antennaPivot = v; }
  
  get rocketGroup() { return this.rocket.rocketGroup; }
  set rocketGroup(v) { this.rocket.rocketGroup = v; }
  get rocketFlameSprite() { return this.rocket.rocketFlameSprite; }
  set rocketFlameSprite(v) { this.rocket.rocketFlameSprite = v; }
  get rocketFlameLight() { return this.rocket.rocketFlameLight; }
  set rocketFlameLight(v) { this.rocket.rocketFlameLight = v; }
  get rocketCentroidLocal() { return this.rocket.rocketCentroidLocal; }
  set rocketCentroidLocal(v) { this.rocket.rocketCentroidLocal = v; }
  get rocketMeshRef() { return this.rocket.rocketMeshRef; }
  set rocketMeshRef(v) { this.rocket.rocketMeshRef = v; }
  get rocketBottomLocal() { return this.rocket.rocketBottomLocal; }
  set rocketBottomLocal(v) { this.rocket.rocketBottomLocal = v; }
  
  get radarOn() { return this.movement.radarOn; }
  get radarDir() { return this.movement.radarDir; }
  get rocketLaunchOn() { return this.rocket.rocketLaunchOn; }
  get rocketAnimT() { return this.rocket.rocketAnimT; }

  attachToRoot(root, box, sz) {
    const THREE = this.ctx.THREE;
    const LAUNCH = this.ctx.cfg.launch;
    if (LAUNCH) {
      this.waves.launchFootprintSize = Math.max(sz.x, sz.z);
      const lx = box.min.x + sz.x * LAUNCH.stripXFrac;
      const lz = box.min.z + sz.z * LAUNCH.stripZFrac;
      const yTop = box.min.y + sz.y * LAUNCH.stripYRange[0];
      const yBot = box.min.y + sz.y * LAUNCH.stripYRange[1];
      const n = LAUNCH.stripCount;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const ly = yTop + (yBot - yTop) * t;
        const led = this.leds.makeLed(LAUNCH.stripRadius, [lx, ly, lz], {
          sphereBase: 0x031a0a, emissive: 0x00ff33, glowTint: 0x00ff44, lightColor: 0x00ff44,
          intensityScale: 0.12, opacityOn: 0.99, glowScale: 0.55,
          glowStops: ['rgba(20,255,80,1)', 'rgba(0,230,50,0.78)', 'rgba(0,255,40,0)'],
        }, this.leds.launchStripGlowTex);
        root.add(led.group);
        this.leds.launchLeds[i + 1] = led;
      }
      
      const rb = root.userData.rocketBottomLocal;
      const rmesh = root.userData.rocketMeshRef;
      if (rb && rmesh) {
        const torusGeom = new THREE.TorusGeometry(LAUNCH.torusRadius, LAUNCH.torusTube, 16, 48);
        torusGeom.rotateX(Math.PI / 2);
        const led0 = this.leds.makeLed(LAUNCH.torusRadius, [rb.x, rb.y + LAUNCH.torusYOffset, rb.z], {
          sphereBase: 0x1f0204, emissive: 0xff0a1e, glowTint: 0xff1828, lightColor: 0xff1422,
          intensityScale: 0.45, opacityOn: 0.99, glowScale: 0.55,
          glowStops: ['rgba(255,80,70,1)', 'rgba(255,20,25,0.78)', 'rgba(255,0,0,0)'],
        }, this.leds.launchGlowTex, torusGeom);
        rmesh.add(led0.group);
        this.leds.launchLeds[0] = led0;
      }
    }

    this.rocket.rocketGroup = root.userData.rocketGroup;
    this.rocket.rocketFlameSprite = root.userData.rocketFlameSprite;
    this.rocket.rocketFlameLight = root.userData.rocketFlameLight;
    this.rocket.rocketCentroidLocal = root.userData.rocketCentroidLocal;
    this.rocket.rocketMeshRef = root.userData.rocketMeshRef;
    this.rocket.rocketBottomLocal = root.userData.rocketBottomLocal;
    this.movement.antennaPivot = root.userData.antennaPivot;
  }

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

  update(dt) {
    // 1) Radar rotation
    if (this.movement.radarOn && this.movement.antennaPivot) {
      this.movement.antennaPivot.rotation.y += 0.15 * this.movement.radarDir;
    }
    // 2) Waves update
    this.waves.updateWaves(dt);
    // 3) Rocket update
    this.rocket.updateRocket(dt);
  }

  dispose() {
    this.leds.dispose();
    this.rocket.dispose();
    this.waves.dispose();
    this.movement.dispose();
  }

  get hasLaunchLeds() { return this.leds.launchLeds.length > 0; }
  get hasLaunchWave() { return true; }
  get hasRadar() { return !!this.movement.antennaPivot; }
  get hasRocket() { return !!this.rocket.rocketGroup; }
  get rocketAtRest() { return !this.rocket.rocketLaunchOn && this.rocket.rocketAnimT === 0; }
}
