// Simulation_Base.js
// Common base class for topic simulations, implementing standard control interfaces.

export class Simulation_Base {
  constructor(ctx) {
    this.ctx = ctx;
  }

  // Base Controller interface methods forwarded to context components
  render() {
    this.ctx.renderEngine.render();
  }

  resize() {
    this.ctx.resize();
  }

  dispose() {
    this.ctx.dispose();
  }

  simSink(command, waitResp) {
    return this.ctx.dispatcher.simSink(command, waitResp);
  }

  cancelActiveWait() {
    this.ctx.dispatcher.cancelActiveWait();
  }
}
