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
  }

  init() {
    const ctx = this.ctx;
    const THREE = ctx.THREE;
    const cfg = ctx.cfg;

    // Initialize LEDs configuration
    this.leds.init(cfg.eyes, cfg.chest, cfg.launch);

    this.loadAndSetupModel(cfg, (root) => {
      // Recolor Launchpad Antenna using static method in Rocket class
      Rocket.recolorAntenna(root, THREE);

      // Delegate Launchpad strip & torus LEDs creation to Leds class
      this.leds.setupLaunchLeds(root, cfg.launch, this.waves);

      // Delegate Rocket binding parameters to Rocket class
      this.rocket.setupRocket(root);
      this.movement.antennaPivot = root.userData.antennaPivot;
    });
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
