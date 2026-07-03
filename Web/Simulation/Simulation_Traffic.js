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
    this.loadAndSetupModel(ctx.cfg, (root) => {
      // Setup traffic light lamps and hands
      this.traffic.setupTraffic(root, () => makeGLTFLoader(ctx.A), ctx.cfg.traffic);
    });
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
