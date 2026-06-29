// Simulation_Traffic.js
// Subsystem wrapper for the Space Traffic Light (traffic) topic, reusing TrafficSubsystem.

import { TrafficSubsystem as BaseTrafficSubsystem } from '../Sim_Parts/traffic.js';

export class TrafficSubsystem extends BaseTrafficSubsystem {
  constructor(ctx, makeGLTFLoader) {
    super(ctx);
    this.makeGLTFLoader = makeGLTFLoader;
  }

  placeLamps() {
    super.placeLamps(this.makeGLTFLoader);
  }

  placeHands() {
    super.placeHands(this.makeGLTFLoader);
  }

  setupTraffic(root) {
    super.setupTraffic(root, this.makeGLTFLoader, this.ctx.cfg.traffic);
  }
}
