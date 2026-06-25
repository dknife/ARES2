// Web/sim/leds.js
// LED setup and control logic (makeLed, applyLed, setEye, setChest, setLaunchLed, setRoverLed).

import { LED_PALETTES } from './topics.js';

export class LedSubsystem {
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

  init() {
    const cfg = this.ctx.cfg;
    const EYE = cfg.eyes;
    const CHEST = cfg.chest;
    const LAUNCH = cfg.launch;

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
    if (!this.ctx.cfg.eyes) return;
    this.applyLed(side === 'L' ? this.eyeL : this.eyeR, value);
  }

  setChest(value) {
    if (!this.ctx.cfg.chest) return;
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
