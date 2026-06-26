// Simulation_AresRobot.js
// Subsystem wrapper for the Ares Albi Robot (albi) topic, reusing the modular LedSubsystem.

import { LedSubsystem } from '../Sim_Parts/leds.js';

export class AresRobotSubsystem extends LedSubsystem {
  constructor(ctx) {
    super(ctx);
    this.init(ctx.cfg.eyes, ctx.cfg.chest, ctx.cfg.launch);
  }

  attachToRoot(root) {
    if (this.eyeL) root.add(this.eyeL.group);
    if (this.eyeR) root.add(this.eyeR.group);
    if (this.chestLed) root.add(this.chestLed.group);
  }

  get hasEyes() { return !!this.eyesCfg; }
  get hasChest() { return !!this.chestCfg; }
}
