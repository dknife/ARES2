// Web/Sim_Parts/oled.js
// OLED screen clearing, rect wiping, text rendering, and icon drawing.

import { OLED_ICONS } from './topics.js';

const OLED_W = 128;
const OLED_H = 64;
const OLED_SCALE = 4;
const OLED_CHAR_W = 8;
const OLED_CHAR_H = 8;

export class Oled
{
  constructor(ctx) {
    this.ctx = ctx;
    this.oledCanvas = null;
    this.oledCtx = null;
    this.oledTex = null;
  }

  // Build the OLED Canvas, texture, and screen mesh from the loaded gltf node
  setupOled(roverGroup, root, editor) {
    const THREE = this.ctx.THREE;
    root.position.set(0, 0.1, 0.5);
    root.rotation.x = -Math.PI / 6;

    const probe = root.clone(true);
    probe.position.set(0, 0, 0); probe.rotation.set(0, 0, 0); probe.scale.set(1, 1, 1);
    const pbox = new THREE.Box3().setFromObject(probe);
    const psize = pbox.getSize(new THREE.Vector3());
    const pcenter = pbox.getCenter(new THREE.Vector3());

    this.oledCanvas = document.createElement('canvas');
    this.oledCanvas.width = 128 * OLED_SCALE;
    this.oledCanvas.height = 64 * OLED_SCALE;
    this.oledCtx = this.oledCanvas.getContext('2d');
    
    this.clear();
    this.text(0, 0, 'ARES READY');

    this.oledTex = new THREE.CanvasTexture(this.oledCanvas);
    this.oledTex.colorSpace = THREE.SRGBColorSpace;
    this.oledTex.magFilter = THREE.NearestFilter;
    this.oledTex.minFilter = THREE.NearestFilter;
    
    const w = psize.x * 0.85 * 0.95 * 0.95 * 0.9;
    const h = w * (this.oledCanvas.height / this.oledCanvas.width);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.oledTex, side: THREE.DoubleSide })
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
    
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(OLED_W, x + w), y1 = Math.min(OLED_H, y + h);
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
}
