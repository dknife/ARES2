// Web/Sim_Parts/context.js
// Shared state container and Three.js scene setup.

import { Assets } from './assets.js';
import { Render } from './render.js';
import { Leds } from './leds.js';
import { Movement } from './movement.js';
import { Rocket } from './rocket.js';
import { Traffic } from './traffic.js';
import { Waves } from './waves.js';
import { Oled } from './oled.js';
import { Gun } from './gun.js';
import { Audio } from './audio.js';
import { Dispatch } from './dispatch.js';
import { EditorControls } from './editor_controls.js';
import { SimulationObjectRegistry } from './sim_object.js';

export class Context {
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
    this.leds = new Leds(this);
    this.movement = new Movement(this);
    this.gun = new Gun(this);
    this.rocket = new Rocket(this);
    this.traffic = new Traffic(this);
    this.waves = new Waves(this);
    this.oled = new Oled(this);
    this.audio = new Audio(this);
    this.assets = new Assets(this);
    this.renderEngine = new Render(this);
    this.dispatcher = new Dispatch(this);

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
