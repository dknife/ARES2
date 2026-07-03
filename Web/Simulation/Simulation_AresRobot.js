// Simulation_AresRobot.js
// Subsystem wrapper for the Ares Albi Robot (albi) topic, reusing the modular LedsSubsystem.

import { Simulation_Base } from './Simulation_Base.js';

export class Simulation_AresRobot extends Simulation_Base {
  constructor(ctx) {
    super(ctx);
    this.leds = ctx.leds;
  }

  init() {
    this.leds.init(this.ctx.cfg.eyes, this.ctx.cfg.chest, this.ctx.cfg.launch);
    this.loadAndSetupModel(this.ctx.cfg, (root) => {
      // Delegate eye/chest LEDs attaching to Leds class
      this.leds.setupAresLeds(root);
    });
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
