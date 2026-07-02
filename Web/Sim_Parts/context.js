// Web/Sim_Parts/context.js
// Shared state container and Three.js scene setup.

import { AssetLoader, makeGLTFLoader } from './assets.js';
import { RenderEngine } from './render.js';
import { LedSubsystem } from './leds.js';
import { MovementSubsystem } from './movement.js';
import { RocketSubsystem } from './rocket.js';
import { TrafficSubsystem } from './traffic.js';
import { WavesSubsystem } from './waves.js';
import { OledSubsystem } from './oled.js';
import { GunSubsystem } from './gun.js';
import { AudioSynthesizer } from './audio.js';
import { CommandDispatcher } from './dispatch.js';
import { EditorControls } from './editor_controls.js';
import { SimulationObjectRegistry } from './sim_object.js';

export class SimContext {
  constructor(THREE, A, stage, loadingEl, cfg, options = {}) {
    this.THREE = THREE;
    this.A = A;
    this.stage = stage;
    this.loadingEl = loadingEl;
    this.cfg = cfg;
    this.logLine = options.logLine;
    this.ensureAudio = options.ensureAudio;
    this.state = options.state;
    this.audioCtx = null;
    this.disposed = false;

    // WebGL setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.stage.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    
    // PMREM environment map
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new A.RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    this.controls = new A.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Lighting
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x32402f, 0.55));
    
    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.bias = -0.0003;
    key.shadow.camera.left = -55;
    key.shadow.camera.right = 55;
    key.shadow.camera.top = 55;
    key.shadow.camera.bottom = -55;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 140;
    key.shadow.camera.updateProjectionMatrix();
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0x9fc0f0, 0.5);
    fill.position.set(-4, 2, 4);
    this.scene.add(fill);

    // Ground
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.worldGroup = null;
    this.planeGrids = null;
    this.lastRenderTime = 0;

    // Shared subsystem refs (OOP Class instances)
    this.leds = new LedSubsystem(this);
    this.movement = new MovementSubsystem(this);
    this.gun = new GunSubsystem(this);
    this.rocket = new RocketSubsystem(this);
    this.traffic = new TrafficSubsystem(this);
    this.waves = new WavesSubsystem(this);
    this.oled = new OledSubsystem(this);
    this.audio = new AudioSynthesizer(this);
    this.assets = new AssetLoader(this);
    this.renderEngine = new RenderEngine(this);
    this.dispatcher = new CommandDispatcher(this);
    this.objects = new SimulationObjectRegistry(this);
    this.editor = new EditorControls(this);
  }

  getAudioCtx() {
    if (!this.audioCtx && this.ensureAudio) {
      this.audioCtx = this.ensureAudio();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { this.audioCtx.resume(); } catch {}
    }
    return this.audioCtx;
  }

  resize() {
    const w = this.stage.clientWidth || 360, h = this.stage.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(cy, dist) {
    this.camera.position.set(0, cy, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, cy, 0);
    this.controls.update();
  }

  dispose() {
    this.disposed = true;
    try { this.controls.dispose(); } catch {}
    this.objects?.dispose?.();
    
    this.scene.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
      }
    });

    try {
      this.scene.environment?.dispose?.();
      this.scene.environment = null;
      this.pmrem.dispose();
    } catch {}
    try { this.renderer.dispose(); } catch {}
    try { this.renderer.forceContextLoss?.(); } catch {}
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    // Subsystem disposals
    this.editor?.dispose?.();
    this.leds?.dispose?.();
    this.gun?.dispose?.();
    this.traffic?.dispose?.();
    this.waves?.dispose?.();
    this.rocket?.dispose?.();
  }
}

export function buildSim(THREE, A, stage, loadingEl, cfg, options = {}) {
  const ctx = new SimContext(THREE, A, stage, loadingEl, cfg, options);

  // Load standard models or parts
  ctx.assets.loadAssets();

  return {
    render() { ctx.renderEngine.render(); },
    resize() { ctx.resize(); },
    dispose() {
      ctx.dispose();
    },
    
    // Albi LEDs
    get hasEyes() { return !!ctx.cfg.eyes; },
    get eyeL() { return ctx.leds?.eyeL; },
    get eyeR() { return ctx.leds?.eyeR; },
    setEye(side, val) { ctx.leds.setEye(side, val); },
    get hasChest() { return !!ctx.cfg.chest; },
    get chestLed() { return ctx.leds?.chestLed; },
    setChest(val) { ctx.leds.setChest(val); },

    // Launchpad
    get hasLaunchLeds() { return !!ctx.cfg.launch && ctx.leds?.launchLeds?.length > 0; },
    get launchLeds() { return ctx.leds?.launchLeds; },
    setLaunchLed(i, val) { ctx.leds.setLaunchLed(i, val); },
    get hasLaunchWave() { return !!ctx.cfg.launch; },
    setLaunchWave(val) { ctx.waves.setLaunchWave(val); },
    get hasRocket() { return !!ctx.rocket?.rocketGroup; },
    get rocketLaunchOn() { return ctx.rocket?.rocketLaunchOn; },
    get rocketAtRest() { return !ctx.rocket?.rocketLaunchOn && ctx.rocket?.rocketAnimT === 0; },
    setRocketLaunch(on, follow) { ctx.rocket.setRocketLaunch(on, follow); },

    // Traffic light
    get hasTraffic() { return !!ctx.cfg.traffic; },
    placeLamps() { ctx.traffic.placeLamps(() => makeGLTFLoader(ctx.A)); },
    placeHands() { ctx.traffic.placeHands(() => makeGLTFLoader(ctx.A)); },
    resetTraffic() { ctx.traffic.resetTraffic(); },
    toggleSlot(idx) { ctx.traffic.toggleSlot(idx); },
    setSlot(idx, val) { ctx.traffic.setSlotOn(idx, val); },

    // Rover
    get hasRoverLeds() { return ctx.leds?.roverLeds?.length > 0; },
    setRoverLed(num, val) { ctx.leds.setRoverLed(num, val); },
    get hasServo() { return !!ctx.worldGroup; },
    setServoMove(on, dir) { ctx.movement.setServoMove(on, dir); },
    setServoTurn(on, dir) { ctx.movement.setServoTurn(on, dir); },
    stopServo() { ctx.movement.stopServo(); },
    get servoActive() { return ctx.movement?.servoOn || ctx.movement?.servoTurnOn; },
    get hasDistanceSensor() { return ctx.movement?.irSensorBalls?.length > 0; },
    setDistanceSensor(on) { ctx.movement.setDistanceSensor(on); },
    measureDistance() { return ctx.movement.measureDistance(); },
    get hasBoxes() { return ctx.movement?.boxes?.length > 0; },
    respawnBoxes() { ctx.movement.respawnBoxes(); },
    get obstaclesOn() { return ctx.movement?.obstaclesOn; },
    setObstacles(on) { ctx.movement.setObstacles(on); },
    get hasRoverWave() { return !!ctx.worldGroup; },
    setRoverWave(on) { ctx.waves.setRoverWave(on); },
    get hasOled() { return !!ctx.oled?.oledCanvas; },
    oledClear() { ctx.oled.clear(); },
    oledClearRect(x, y, w, h) { ctx.oled.clearRect(x, y, w, h); },
    oledText(x, y, text) { ctx.oled.text(x, y, text); },
    oledIcon(name, x, y) { ctx.oled.icon(name, x, y); },
    get hasGun() { return !!ctx.gun?.gunMesh; },
    setGunFire() { ctx.gun.setGunFire(); },

    // Radar / Helpers
    get hasRadar() { return !!ctx.movement?.antennaPivot; },
    get radarOn() { return ctx.movement?.radarOn; },
    setRadar(on, dir) { ctx.movement.setRadar(on, dir); },
    get hasGrids() { return !!ctx.planeGrids; },
    toggleGrids() {
      if (ctx.planeGrids) {
        ctx.planeGrids.visible = !ctx.planeGrids.visible;
        return ctx.planeGrids.visible;
      }
      return false;
    },

    // Audio triggers
    playRocketLaunch() { ctx.audio.playRocketLaunch(); },
    playGunFire() { ctx.audio.playGunFire(); },

    // Command sink API
    simSink(command, waitResp) { return ctx.dispatcher.simSink(command, waitResp); },
    cancelActiveWait() { ctx.dispatcher.cancelActiveWait(); }
  };
}
