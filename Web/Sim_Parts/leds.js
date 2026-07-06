// Web/Sim_Parts/leds.js
// LED setup and control logic (makeLed, applyLed, setEye, setChest, setLaunchLed, setRoverLed).

import { LED_PALETTES } from './topics.js';

export class Leds {
  constructor(ctx) {
    this.ctx = ctx;
    this.eyeL = null;
    this.eyeR = null;
    this.chestLed = null;
    this.launchLeds = [];
    this.roverLeds = [];
    this.eyeGlowTex = null;
    this.chestGlowTex = null;
    this.launchGlowTex = null;
    this.launchStripGlowTex = null;
  }

  init(eyesConfig, chestConfig, launchConfig) {
    this.eyesCfg = eyesConfig;
    this.chestCfg = chestConfig;
    this.launchCfg = launchConfig;

    const EYE = this.eyesCfg;
    const CHEST = this.chestCfg;
    const LAUNCH = this.launchCfg;

    if (EYE) {
      this.eyeGlowTex = this.makeGlowTex(LED_PALETTES.eye.glowStops);
      this.eyeL = this.makeLed(EYE.radius, EYE.left, LED_PALETTES.eye, this.eyeGlowTex);
      this.eyeR = this.makeLed(EYE.radius, EYE.right, LED_PALETTES.eye, this.eyeGlowTex);
    }
    if (CHEST) {
      this.chestGlowTex = this.makeGlowTex(LED_PALETTES.chest.glowStops);
      this.chestLed = this.makeLed(CHEST.radius, CHEST.pos, LED_PALETTES.chest, this.chestGlowTex);
    }
    if (LAUNCH) {
      this.launchGlowTex = this.makeGlowTex(LED_PALETTES.launchTorus.glowStops);
      this.launchStripGlowTex = this.makeGlowTex(LED_PALETTES.launchStrip.glowStops);
    }
  }

  // Setup sensor indicator LEDs for the Rover topic
  setupRoverLeds(roverGroup) {
    const LED_COUNT = 6, LED_X0 = -0.4, LED_X1 = 0.4, LED_Y = 0.4, LED_Z = 0.25, LED_R = 0.05;
    const step = (LED_X1 - LED_X0) / (LED_COUNT - 1);
    const ledGeom = new this.ctx.THREE.SphereGeometry(LED_R, 16, 12);
    for (let i = 0; i < LED_COUNT; i++) {
      const ball = new this.ctx.THREE.Mesh(
        ledGeom,
        new this.ctx.THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 })
      );
      ball.position.set(LED_X0 + step * i, LED_Y, LED_Z);
      roverGroup.add(ball);
      this.roverLeds.push(ball);
    }
  }

  // Add loaded RoverLED gltf mesh to rover group
  setupLedMesh(roverGroup, root, editor) {
    root.position.set(0, 0.35, 0.2);
    root.rotation.x = Math.PI / 4;
    roverGroup.add(root);
    editor?.register(root, 'Rover LED Mesh');
  }

  // Setup Launchpad LED strips on the loaded model
  setupLaunchLeds(root, launchCfg, waves) {
    const THREE = this.ctx.THREE;
    const LAUNCH = launchCfg;
    if (!LAUNCH) return;

    let sz = new THREE.Vector3();
    let box = new THREE.Box3();
    box.setFromObject(root);
    box.getSize(sz);

    waves.launchFootprintSize = Math.max(sz.x, sz.z);
    const lx = box.min.x + sz.x * LAUNCH.stripXFrac;
    const lz = box.min.z + sz.z * LAUNCH.stripZFrac;
    const yTop = box.min.y + sz.y * LAUNCH.stripYRange[0];
    const yBot = box.min.y + sz.y * LAUNCH.stripYRange[1];
    const n = LAUNCH.stripCount;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const ly = yTop + (yBot - yTop) * t;
      const led = this.makeLed(LAUNCH.stripRadius, [lx, ly, lz], THREE.simPalettes?.launchStrip || {
        sphereBase: 0x031a0a, emissive: 0x00ff33, glowTint: 0x00ff44, lightColor: 0x00ff44,
        intensityScale: 0.12, opacityOn: 0.99, glowScale: 0.55
      }, this.launchStripGlowTex);
      root.add(led.group);
      this.launchLeds[i + 1] = led;
    }
    
    const rb = root.userData.rocketBottomLocal;
    const rmesh = root.userData.rocketMeshRef;
    if (rb && rmesh) {
      const torusGeom = new THREE.TorusGeometry(LAUNCH.torusRadius, LAUNCH.torusTube, 16, 48);
      torusGeom.rotateX(Math.PI / 2);
      const led0 = this.makeLed(LAUNCH.torusRadius, [rb.x, rb.y + LAUNCH.torusYOffset, rb.z], {
        sphereBase: 0x1f0204, emissive: 0xff0a1e, glowTint: 0xff1828, lightColor: 0xff1422,
        intensityScale: 0.45, opacityOn: 0.99, glowScale: 0.55
      }, this.launchGlowTex, torusGeom);
      rmesh.add(led0.group);
      this.launchLeds[0] = led0;
    }
  }

  // Attach eye/chest LEDs to Albi Robot
  setupAresLeds(root) {
    if (this.eyeL) root.add(this.eyeL.group);
    if (this.eyeR) root.add(this.eyeR.group);
    if (this.chestLed) root.add(this.chestLed.group);
  }

  makeGlowTex(stops) {
    const THREE = this.ctx.THREE;
    const gc = document.createElement('canvas'); gc.width = gc.height = 128;
    const gx = gc.getContext('2d');
    const gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0.0,  stops[0]);
    gg.addColorStop(0.25, stops[1]);
    gg.addColorStop(1.0,  stops[2]);
    gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(gc); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  makeLed(radius, pos, palette, glowTex, geometry) {
    const THREE = this.ctx.THREE;
    const grp = new THREE.Group(); grp.position.fromArray(pos);
    const sphere = new THREE.Mesh(
      geometry || new THREE.SphereGeometry(radius, 28, 28),
      new THREE.MeshStandardMaterial({ color: palette.sphereBase, emissive: palette.emissive, emissiveIntensity: 0, transparent: true, opacity: 0.4, roughness: 0.2, metalness: 0 })
    );
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: palette.glowTint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
    glow.scale.setScalar(radius * 3.3); glow.visible = false;
    const light = new THREE.PointLight(palette.lightColor, 0, radius * 22, 2);
    grp.add(sphere, glow, light);
    return { group: grp, sphere, glow, light, on: false,
             intensityScale: palette.intensityScale ?? 1,
             opacityOn: palette.opacityOn ?? 0.92,
             glowScale: palette.glowScale ?? 1 };
  }

  applyLed(e, value) {
    if (!e) return;
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    const s = e.intensityScale ?? 1;
    const opOn  = e.opacityOn ?? 0.92;
    const glowS = e.glowScale ?? 1;
    
    e.on = v > 0;
    e.sphere.material.emissiveIntensity = 3.2 * v * s;
    e.sphere.material.opacity = v > 0 ? 0.4 + (opOn - 0.4) * v : 0.4;
    e.glow.visible = v > 0;
    if (e.glow.material) e.glow.material.opacity = 0.95 * v * s * glowS;
    e.light.intensity = 1.8 * v * s;
  }

  setEye(side, value) {
    if (!this.eyesCfg) return;
    this.applyLed(side === 'L' ? this.eyeL : this.eyeR, value);
  }

  setChest(value) {
    if (!this.chestCfg) return;
    this.applyLed(this.chestLed, value);
  }

  setLaunchLed(i, value) {
    if (!this.launchLeds || !this.launchLeds[i]) return;
    this.applyLed(this.launchLeds[i], value);
  }

  setRoverLed(num, value) {
    if (!this.roverLeds || !this.roverLeds[num]) return;
    const ball = this.roverLeds[num];
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    const m = ball.material;
    if (v > 0) {
      m.color.setHex(0x00ff22);
      m.emissive.setHex(0x00ff22);
      m.emissiveIntensity = 0.9 * v;
      m.opacity = 0.6 + 0.4 * v;
    } else {
      m.color.setHex(0xffffff);
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      m.opacity = 0.25;
    }
  }

  dispose() {
    this.eyeGlowTex?.dispose();
    this.chestGlowTex?.dispose();
    this.launchGlowTex?.dispose();
    this.launchStripGlowTex?.dispose();
  }
}
