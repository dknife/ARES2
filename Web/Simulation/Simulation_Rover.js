// Simulation_Rover.js
// Subsystem wrapper for the Rover (rover) topic, reusing modular subsystems.

import { Simulation_Base } from './Simulation_Base.js';

export class Simulation_Rover extends Simulation_Base {
  constructor(ctx) {
    super(ctx);
    this.leds = ctx.leds;
    this.movement = ctx.movement;
    this.oled = ctx.oled;
    this.gun = ctx.gun;
    this.waves = ctx.waves;

    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const cfg = ctx.cfg;

    // Create the main rover group node
    this.roverGroup = new THREE.Group();
    this.roverGroup.position.y = 0.4;
    scene.add(this.roverGroup);
    ctx.roverGroup = this.roverGroup;

    // Initialize LEDs configurations
    this.leds.init(cfg.eyes, cfg.chest, cfg.launch);

    // Delegate World Helpers & Obstacles setup to Movement Subsystem
    if (cfg.helpers) {
      this.movement.setupWorld(scene, ctx.editor);
    }

    // Delegate Sensor Balls and indicator setups to Leds and Movement Subsystems
    this.leds.setupRoverLeds(this.roverGroup);
    this.movement.setupSensorIndicators(this.roverGroup);

    // Delegate Multi-part GLTF loading and positioning to individual Subsystems
    ctx.assets.loadModels(
      cfg.parts,
      (url, root) => {
        if (/RoverWheel\.glb$/.test(url)) {
          this.movement.setupWheels(this.roverGroup, root, ctx.editor);
        } else if (/RoverRadar\.glb$/.test(url)) {
          this.movement.setupRadar(this.roverGroup, root, ctx.editor);
        } else if (/RoverLED\.glb$/.test(url)) {
          this.leds.setupLedMesh(this.roverGroup, root, ctx.editor);
        } else if (/RoverHead\.glb$/.test(url)) {
          this.movement.setupHead(this.roverGroup, root, ctx.editor);
        } else if (/RoverGun\.glb$/.test(url)) {
          this.gun.setupGun(this.roverGroup, root, ctx.editor);
        } else if (/RoverOLED\.glb$/.test(url)) {
          this.oled.setupOled(this.roverGroup, root, ctx.editor);
        } else {
          // Fallback placement for generic parts
          this.roverGroup.add(root);
          ctx.editor?.register(root, 'Rover Component');
        }
      },
      () => {
        if (ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = 'none';
        this.ctx.frame(0.6, 2.8);
      }
    );
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
  get roverLeds() { return this.leds.roverLeds; }
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
  
  get oledCanvas() { return this.oled.oledCanvas; }
  set oledCanvas(v) { this.oled.oledCanvas = v; }
  get oledCtx() { return this.oled.oledCtx; }
  set oledCtx(v) { this.oled.oledCtx = v; }
  get oledTex() { return this.oled.oledTex; }
  set oledTex(v) { this.oled.oledTex = v; }

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
    this.leds.setRoverLed(num, value);
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

  oledClear() {
    this.oled.clear();
  }

  oledClearRect(x, y, w, h) {
    this.oled.clearRect(x, y, w, h);
  }

  oledText(x, y, text) {
    this.oled.text(x, y, text);
  }

  oledIcon(name, x, y) {
    this.oled.icon(name, x, y);
  }

  setGunFire() {
    this.gun.setGunFire();
  }

  // Properties checked by outside simulation.js wrapper
  get hasRoverLeds() { return this.leds.roverLeds.length > 0; }
  get hasDistanceSensor() { return this.movement.irSensorBalls.length > 0; }
  get hasServo() { return !!this.worldGroup; }
  get hasRadar() { return !!this.movement.antennaPivot; }
  get hasGun() { return !!this.gun.gunMesh; }
  get hasOled() { return !!this.oled.oledCanvas; }
  get hasRoverWave() { return !!this.worldGroup; }
  get servoActive() { return this.movement.servoOn || this.movement.servoTurnOn; }
  get hasBoxes() { return this.movement.boxes.length > 0; }
}
