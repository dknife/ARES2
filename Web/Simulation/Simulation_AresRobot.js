// Simulation_AresRobot.js
// Subsystem wrapper for the Ares Albi Robot (albi) topic, reusing the modular LedsSubsystem.

import { Simulation_Base } from './Simulation_Base.js';
import { createAlbiLedObject, createAlbiModelObject } from '../Sim_Parts/object_factory.js';

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
      this.ctx.objects.add(createAlbiModelObject(this.ctx, root, this.ctx.cfg.label || 'Albi Body'), this.ctx.scene);
      if (this.leds.eyeL) {
        this.ctx.objects.add(createAlbiLedObject(this.ctx, this.leds.eyeL, 'Albi Eye L LED', 'eye-l'), root);
      }
      if (this.leds.eyeR) {
        this.ctx.objects.add(createAlbiLedObject(this.ctx, this.leds.eyeR, 'Albi Eye R LED', 'eye-r'), root);
      }
      if (this.leds.chestLed) {
        this.ctx.objects.add(createAlbiLedObject(this.ctx, this.leds.chestLed, 'Albi Chest LED', 'chest'), root);
      }
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
