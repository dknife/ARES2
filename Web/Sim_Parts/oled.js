// Web/Sim_Parts/oled.js
// OLED screen clearing, rect wiping, text rendering, and icon drawing.

import { OLED_ICONS } from './topics.js';

const OLED_W = 128;
const OLED_H = 64;
const OLED_SCALE = 4;
const OLED_CHAR_W = 8;
const OLED_CHAR_H = 8;

export class OledSubsystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.oledCanvas = null;
    this.oledCtx = null;
    this.oledTex = null;
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
