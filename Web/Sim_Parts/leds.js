// Web/Sim_Parts/leds.js
// Unified visual device system for mesh LEDs, indicator balls, traffic slots, and rover OLED.

import { OLED_ICONS } from './topics.js';

const OLED_W = 128;
const OLED_H = 64;
const OLED_SCALE = 4;
const OLED_CHAR_W = 8;
const OLED_CHAR_H = 8;

export class Leds {
  constructor(ctx) {
    this.ctx = ctx;
    this.channels = new Map();
    this.disposables = new Set();

    this.oledCanvas = null;
    this.oledCtx = null;
    this.oledTex = null;
  }

  createGlowTexture(stops) {
    const THREE = this.ctx.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const gx = canvas.getContext('2d');
    const grad = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, stops[0]);
    grad.addColorStop(0.25, stops[1]);
    grad.addColorStop(1.0, stops[2]);
    gx.fillStyle = grad;
    gx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.add(tex);
    return tex;
  }

  createMeshLed({ radius, pos, palette, glowTex, geometry }) {
    const THREE = this.ctx.THREE;
    const group = new THREE.Group();
    group.position.fromArray(pos);

    const sphere = new THREE.Mesh(
      geometry || new THREE.SphereGeometry(radius, 28, 28),
      new THREE.MeshStandardMaterial({
        color: palette.sphereBase,
        emissive: palette.emissive,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.4,
        roughness: 0.2,
        metalness: 0,
      }),
    );
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: palette.glowTint,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.95,
    }));
    glow.scale.setScalar(radius * 3.3);
    glow.visible = false;

    const light = new THREE.PointLight(palette.lightColor, 0, radius * 22, 2);
    group.add(sphere, glow, light);
    return {
      type: 'mesh-led',
      group,
      sphere,
      glow,
      light,
      on: false,
      intensityScale: palette.intensityScale ?? 1,
      opacityOn: palette.opacityOn ?? 0.92,
      glowScale: palette.glowScale ?? 1,
    };
  }

  createBallLed({
    radius = 0.05,
    palette = {},
  } = {}) {
    const THREE = this.ctx.THREE;
    return {
      type: 'ball-led',
      mesh: new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshStandardMaterial({
          color: palette.offColor ?? 0xffffff,
          transparent: true,
          opacity: palette.offOpacity ?? 0.25,
          roughness: palette.roughness ?? 0.4,
          metalness: palette.metalness ?? 0.0,
        }),
      ),
      on: false,
      offColor: palette.offColor ?? 0xffffff,
      onColor: palette.onColor ?? 0x00ff22,
      offOpacity: palette.offOpacity ?? 0.25,
      onOpacityBase: palette.onOpacityBase ?? 0.6,
      onOpacityBoost: palette.onOpacityBoost ?? 0.4,
      onEmissiveIntensity: palette.onEmissiveIntensity ?? 0.9,
    };
  }

  register(id, channel) {
    if (!id || !channel) return channel;
    this.channels.set(id, channel);
    return channel;
  }

  unregister(id) {
    this.channels.delete(id);
  }

  get(id) {
    return this.channels.get(id) || null;
  }

  set(id, value) {
    const channel = this.channels.get(id);
    if (!channel) return;
    this.applyChannel(channel, value);
  }

  setIndexed(prefix, index, value) {
    this.set(`${prefix}-${index}`, value);
  }

  getIndexed(prefix, index) {
    return this.get(`${prefix}-${index}`);
  }

  applyChannel(channel, value) {
    if (!channel) return;
    if (typeof channel.apply === 'function') {
      channel.apply(value);
      if ('on' in channel) channel.on = this.toUnit(value) > 0;
      return;
    }
    if (channel.type === 'mesh-led') {
      this.applyMeshLed(channel, value);
      return;
    }
    if (channel.type === 'ball-led') {
      this.applyBallLed(channel, value);
    }
  }

  applyMeshLed(channel, value) {
    const v = this.toUnit(value);
    channel.on = v > 0;
    channel.sphere.material.emissiveIntensity = 3.2 * v * channel.intensityScale;
    channel.sphere.material.opacity = v > 0
      ? 0.4 + (channel.opacityOn - 0.4) * v
      : 0.4;
    channel.glow.visible = v > 0;
    if (channel.glow.material) {
      channel.glow.material.opacity = 0.95 * v * channel.intensityScale * channel.glowScale;
    }
    channel.light.intensity = 1.8 * v * channel.intensityScale;
  }

  applyBallLed(channel, value) {
    const v = this.toUnit(value);
    const m = channel.mesh.material;
    channel.on = v > 0;
    if (v > 0) {
      m.color.setHex(channel.onColor);
      m.emissive.setHex(channel.onColor);
      m.emissiveIntensity = channel.onEmissiveIntensity * v;
      m.opacity = channel.onOpacityBase + channel.onOpacityBoost * v;
    } else {
      m.color.setHex(channel.offColor);
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      m.opacity = channel.offOpacity;
    }
  }

  toUnit(value) {
    return typeof value === 'number'
      ? Math.max(0, Math.min(1, value))
      : (value ? 1 : 0);
  }

  setupOled(roverGroup, root, editor) {
    const THREE = this.ctx.THREE;
    root.position.set(0, 0.1, 0.5);
    root.rotation.x = -Math.PI / 6;

    const probe = root.clone(true);
    probe.position.set(0, 0, 0);
    probe.rotation.set(0, 0, 0);
    probe.scale.set(1, 1, 1);
    const pbox = new THREE.Box3().setFromObject(probe);
    const psize = pbox.getSize(new THREE.Vector3());
    const pcenter = pbox.getCenter(new THREE.Vector3());

    this.oledCanvas = document.createElement('canvas');
    this.oledCanvas.width = OLED_W * OLED_SCALE;
    this.oledCanvas.height = OLED_H * OLED_SCALE;
    this.oledCtx = this.oledCanvas.getContext('2d');

    this.clear();
    this.text(0, 0, 'ARES READY');

    this.oledTex = new THREE.CanvasTexture(this.oledCanvas);
    this.oledTex.colorSpace = THREE.SRGBColorSpace;
    this.oledTex.magFilter = THREE.NearestFilter;
    this.oledTex.minFilter = THREE.NearestFilter;
    this.disposables.add(this.oledTex);

    const w = psize.x * 0.85 * 0.95 * 0.95 * 0.9;
    const h = w * (this.oledCanvas.height / this.oledCanvas.width);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.oledTex, side: THREE.DoubleSide }),
    );
    const pivot = new THREE.Group();
    pivot.position.set(pcenter.x, pcenter.y - h / 2, pbox.max.z + 0.001);
    pivot.rotation.x = -Math.PI / 12;
    screen.position.set(0, h / 2, 0);
    pivot.add(screen);
    root.add(pivot);

    roverGroup.add(root);
    editor?.register(root, 'Rover OLED');
  }

  clear() {
    if (!this.oledCtx) return;
    this.oledCtx.fillStyle = '#000814';
    this.oledCtx.fillRect(0, 0, this.oledCanvas.width, this.oledCanvas.height);
    if (this.oledTex) this.oledTex.needsUpdate = true;
  }

  clearRect(x, y, w, h) {
    if (!this.oledCtx) return;
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(OLED_W, x + w);
    const y1 = Math.min(OLED_H, y + h);
    if (x1 <= x0 || y1 <= y0) return;

    this.oledCtx.fillStyle = '#000814';
    this.oledCtx.fillRect(x0 * OLED_SCALE, y0 * OLED_SCALE, (x1 - x0) * OLED_SCALE, (y1 - y0) * OLED_SCALE);
    if (this.oledTex) this.oledTex.needsUpdate = true;
  }

  text(x, y, text) {
    if (!this.oledCtx) return;
    this.oledCtx.fillStyle = '#7dffff';
    this.oledCtx.font = `bold ${OLED_CHAR_H * OLED_SCALE}px monospace`;
    this.oledCtx.textAlign = 'left';
    this.oledCtx.textBaseline = 'top';

    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      const ox = x + i * OLED_CHAR_W;
      if (ox >= OLED_W) break;
      this.oledCtx.fillText(s[i], ox * OLED_SCALE, y * OLED_SCALE);
    }
    if (this.oledTex) this.oledTex.needsUpdate = true;
  }

  icon(name, x, y) {
    if (!this.oledCtx) return;
    const bm = OLED_ICONS[name];
    if (!bm) return;

    this.oledCtx.fillStyle = '#7dffff';
    for (let row = 0; row < 32; row++) {
      for (let bc = 0; bc < 4; bc++) {
        const byte = bm[row * 4 + bc];
        if (!byte) continue;
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (1 << (7 - bit))) {
            const px = x + bc * 8 + bit;
            const py = y + row;
            if (px >= 0 && px < OLED_W && py >= 0 && py < OLED_H) {
              this.oledCtx.fillRect(px * OLED_SCALE, py * OLED_SCALE, OLED_SCALE, OLED_SCALE);
            }
          }
        }
      }
    }
    if (this.oledTex) this.oledTex.needsUpdate = true;
  }

  dispose() {
    this.disposables.forEach((item) => item?.dispose?.());
    this.disposables.clear();
    this.channels.clear();
  }
}
