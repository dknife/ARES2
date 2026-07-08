// Simulation_Rover.js
// Subsystem wrapper for the Rover (rover) topic, reusing modular subsystems.

import { Simulation_Base } from './Simulation_Base.js';
import { SimulationObject } from '../Sim_Parts/sim_object.js';

function createRoverObject(ctx, root, type, label, metadata = {}) {
  return new SimulationObject({
    id: ctx.objects?.makeId(type) || `${type}-${Date.now()}`,
    type,
    label,
    root,
    metadata,
  });
}

function addRoverObject(ctx, root, type, label, parent, metadata = {}) {
  if (!root || !ctx.objects) return null;
  return ctx.objects.add(createRoverObject(ctx, root, type, label, metadata), parent);
}

export class Simulation_Rover extends Simulation_Base {
  constructor(ctx) {
    super(ctx);
    this.leds = ctx.leds;
    this.movement = ctx.movement;
    this.gun = ctx.gun;
    this.waves = ctx.waves;
    this.roverGroup = null;
  }

  init() {
    const ctx = this.ctx;
    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const cfg = ctx.cfg;

    // Create the main rover group node
    this.roverGroup = new THREE.Group();
    this.roverGroup.position.y = 0.4;
    scene.add(this.roverGroup);
    ctx.roverGroup = this.roverGroup;
    addRoverObject(ctx, this.roverGroup, 'rover-body', cfg.label || 'Rover', scene, { modelRole: 'body' });

    if (cfg.helpers) {
      this.movement.setupWorld(scene, ctx.editor);
    }

    this.setupRoverIndicators();
    this.movement.setupSensorIndicators(this.roverGroup);
    this.registerSensorIndicators();

    // Delegate Multi-part GLTF loading and positioning to individual Subsystems
    ctx.assets.loadModels(
      cfg.parts,
      (url, root) => {
        if (/RoverWheel\.glb$/.test(url)) {
          this.movement.setupWheels(this.roverGroup, root, ctx.editor);
          addRoverObject(ctx, this.movement.wheelR, 'rover-part', 'Rover Wheel R', this.roverGroup, { modelRole: 'wheel-r' });
          addRoverObject(ctx, this.movement.wheelL, 'rover-part', 'Rover Wheel L', this.roverGroup, { modelRole: 'wheel-l' });
        } else if (/RoverRadar\.glb$/.test(url)) {
          this.movement.setupRadar(this.roverGroup, root, ctx.editor);
          addRoverObject(ctx, root, 'rover-part', 'Rover Radar', this.roverGroup, { modelRole: 'radar' });
        } else if (/RoverLED\.glb$/.test(url)) {
          root.position.set(0, 0.35, 0.2);
          root.rotation.x = Math.PI / 4;
          this.roverGroup.add(root);
          ctx.editor?.register(root, 'Rover LED Mesh');
          addRoverObject(ctx, root, 'rover-part', 'Rover LED Mesh', this.roverGroup, { modelRole: 'led-mesh' });
        } else if (/RoverHead\.glb$/.test(url)) {
          this.movement.setupHead(this.roverGroup, root, ctx.editor);
          addRoverObject(ctx, root, 'rover-part', 'Rover Head', this.roverGroup, { modelRole: 'head' });
        } else if (/RoverGun\.glb$/.test(url)) {
          this.gun.setupGun(this.roverGroup, root, ctx.editor);
          addRoverObject(ctx, root, 'rover-part', 'Rover Gun', this.roverGroup, { modelRole: 'gun' });
        } else if (/RoverOLED\.glb$/.test(url)) {
          this.leds.setupOled(this.roverGroup, root, ctx.editor);
          addRoverObject(ctx, root, 'rover-part', 'Rover OLED', this.roverGroup, { modelRole: 'oled' });
        } else {
          // Fallback placement for generic parts
          this.roverGroup.add(root);
          ctx.editor?.register(root, 'Rover Component');
          addRoverObject(ctx, root, 'rover-part', 'Rover Component', this.roverGroup, { modelRole: 'component' });
        }
      },
      () => {
        if (ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = 'none';
        ctx.editor?.updateHierarchy?.(true);
        this.ctx.frame(0.6, 2.8);
      }
    );
  }

  setupRoverIndicators() {
    const count = 6;
    const x0 = -0.4;
    const x1 = 0.4;
    const y = 0.4;
    const z = 0.25;
    const step = (x1 - x0) / (count - 1);

    for (let i = 0; i < count; i++) {
      const led = this.leds.register(`rover-${i}`, this.leds.createBallLed());
      led.mesh.position.set(x0 + step * i, y, z);
      this.roverGroup.add(led.mesh);
      addRoverObject(this.ctx, led.mesh, 'rover-led', `Rover LED ${i + 1}`, this.roverGroup, {
        led,
        index: i,
        modelRole: 'led',
      });
    }
  }

  registerSensorIndicators() {
    addRoverObject(this.ctx, this.movement.magSensorBall, 'rover-sensor', 'Rover Magnet Sensor', this.roverGroup, {
      modelRole: 'magnet-sensor',
    });

    this.movement.irSensorBalls.forEach((sensor, index) => {
      addRoverObject(this.ctx, sensor, 'rover-sensor', `Rover Distance Sensor ${index + 1}`, this.roverGroup, {
        index,
        modelRole: 'distance-sensor',
      });
    });
  }

  // Base Controller interface overrides
  dispose() {
    super.dispose();
    if (this.roverGroup && this.roverGroup.parent) {
      this.roverGroup.parent.remove(this.roverGroup);
    }
    if (this.worldGroup && this.worldGroup.parent) {
      this.worldGroup.parent.remove(this.worldGroup);
    }
  }

  // Getters/setters delegating properties to respective subsystems
  get boxes() { return this.movement.boxes; }
  get magSensorBall() { return this.movement.magSensorBall; }
  set magSensorBall(v) { this.movement.magSensorBall = v; }
  get irSensorBalls() { return this.movement.irSensorBalls; }
  get wheelR() { return this.movement.wheelR; }
  set wheelR(v) { this.movement.wheelR = v; }
  get wheelL() { return this.movement.wheelL; }
  set wheelL(v) { this.movement.wheelL = v; }
  get antennaPivot() { return this.movement.antennaPivot; }
  set antennaPivot(v) { this.movement.antennaPivot = v; }
  get gunMesh() { return this.gun.gunMesh; }
  set gunMesh(v) { this.gun.gunMesh = v; }
  
  get oledCanvas() { return this.leds.oledCanvas; }
  set oledCanvas(v) { this.leds.oledCanvas = v; }
  get oledCtx() { return this.leds.oledCtx; }
  set oledCtx(v) { this.leds.oledCtx = v; }
  get oledTex() { return this.leds.oledTex; }
  set oledTex(v) { this.leds.oledTex = v; }

  get muzzleWorldPos() { return this.gun.muzzleWorldPos; }
  get muzzleForward() { return this.gun.muzzleForward; }

  get obstaclesOn() { return this.movement.obstaclesOn; }
  set obstaclesOn(v) { this.movement.obstaclesOn = v; }
  get servoOn() { return this.movement.servoOn; }
  set servoOn(v) { this.movement.servoOn = v; }
  get servoDir() { return this.movement.servoDir; }
  set servoDir(v) { this.movement.servoDir = v; }
  get servoTurnOn() { return this.movement.servoTurnOn; }
  set servoTurnOn(v) { this.movement.servoTurnOn = v; }
  get servoTurnDir() { return this.movement.servoTurnDir; }
  set servoTurnDir(v) { this.movement.servoTurnDir = v; }

  get radarOn() { return this.movement.radarOn; }
  set radarOn(v) { this.movement.radarOn = v; }
  get radarDir() { return this.movement.radarDir; }
  set radarDir(v) { this.movement.radarDir = v; }

  get roverWaveOn() { return this.waves.roverWaveOn; }
  set roverWaveOn(v) { this.waves.roverWaveOn = v; }

  // Control Methods
  setRoverLed(num, value) {
    this.leds.setIndexed('rover', num, value);
  }

  setServoMove(on, dir) {
    this.movement.setServoMove(on, dir);
  }

  setServoTurn(on, dir) {
    this.movement.setServoTurn(on, dir);
  }

  stopServo() {
    this.movement.stopServo();
  }

  setDistanceSensor(on) {
    this.movement.setDistanceSensor(on);
  }

  measureDistance() {
    return this.movement.measureDistance();
  }

  setRadar(on, dir) {
    this.movement.setRadar(on, dir);
  }

  setObstacles(on) {
    this.movement.setObstacles(on);
  }

  respawnBoxes() {
    this.movement.respawnBoxes();
  }

  setRoverWave(on) {
    this.waves.setRoverWave(on);
  }

  toggleGrids() {
    const grids = this.ctx.planeGrids;
    if (!grids) return;
    grids.visible = !grids.visible;
  }

  oledClear() {
    this.leds.clear();
  }

  oledClearRect(x, y, w, h) {
    this.leds.clearRect(x, y, w, h);
  }

  oledText(x, y, text) {
    this.leds.text(x, y, text);
  }

  oledIcon(name, x, y) {
    this.leds.icon(name, x, y);
  }

  setGunFire() {
    this.gun.setGunFire();
  }

  // Properties checked by outside Simulation_Main wrapper
  get hasRoverLeds() { return !!this.leds.get('rover-0'); }
  get hasDistanceSensor() { return this.movement.irSensorBalls.length > 0; }
  get hasServo() { return !!this.worldGroup; }
  get hasRadar() { return !!this.movement.antennaPivot; }
  get hasGun() { return !!this.gun.gunMesh; }
  get hasOled() { return !!this.leds.oledCanvas; }
  get hasRoverWave() { return !!this.worldGroup; }
  get hasGrids() { return !!this.ctx.planeGrids; }
  get servoActive() { return this.movement.servoOn || this.movement.servoTurnOn; }
  get hasBoxes() { return this.movement.boxes.length > 0; }
}
