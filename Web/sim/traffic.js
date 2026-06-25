// Web/sim/traffic.js
// Traffic light slots calculation, lamp loading, and hand switching.

const TRAFFIC_LAMP_COLORS = [0xff0000, 0xffcc00, 0x00c030];
const TRAFFIC_HAND_COLOR  = 0xffcc00;
const TRAFFIC_LAMP_ROT_X = Math.PI / 2;

export class TrafficSubsystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.trafficRoot = null;
    this.trafficBox = null;
    this.trafficSlots = null;
    this.trafficTopY = 0;
    this.trafficSlotState = [];
    this.trafficMode = null;
    this.trafficLoadToken = 0;
  }

  disposeSubtree(obj) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material; (Array.isArray(m) ? m : [m]).forEach((mm) => mm?.dispose?.());
      }
    });
    if (obj.parent) obj.parent.remove(obj);
  }

  clearSlot(i) {
    const s = this.trafficSlotState[i];
    if (!s) return;
    if (s.inst) this.disposeSubtree(s.inst);
    if (s.light && s.light.parent) s.light.parent.remove(s.light);
    this.trafficSlotState[i] = null;
  }

  clearAllSlots() {
    for (let i = 0; i < this.trafficSlotState.length; i++) {
      this.clearSlot(i);
    }
  }

  fitOnSlot(inst, slot, widthRatio, rotX) {
    const THREE = this.ctx.THREE;
    if (rotX) inst.rotation.x = rotX;
    inst.updateMatrixWorld(true);
    const tb = new THREE.Box3().setFromObject(inst);
    const ts = tb.getSize(new THREE.Vector3());
    const s = ts.x > 0 ? (slot.width * widthRatio) / ts.x : 1;
    inst.scale.setScalar(s);
    inst.updateMatrixWorld(true);
    const ib = new THREE.Box3().setFromObject(inst);
    const ic = ib.getCenter(new THREE.Vector3());
    inst.position.set(slot.x - ic.x, this.trafficTopY - ib.min.y, slot.z - ic.z);
  }

  cloneInstanceMaterials(obj) {
    obj.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      }
    });
  }

  collectMaterials(obj) {
    const arr = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m) arr.push(m);
    });
    return arr;
  }

  makeSlotLight(slot, colorHex) {
    const THREE = this.ctx.THREE;
    const l = new THREE.PointLight(colorHex, 0, slot.width * 6, 2);
    l.position.set(slot.x, this.trafficTopY + slot.width * 0.5, slot.z);
    return l;
  }

  setSlotOn(i, value) {
    const THREE = this.ctx.THREE;
    const s = this.trafficSlotState[i];
    if (!s) return;
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    s.on = v > 0;
    
    const onCol = new THREE.Color(s.color);
    const offCol = new THREE.Color(0x666666);
    for (const m of s.materials) {
      if (m.color    !== undefined) m.color.copy(s.on ? onCol : offCol);
      if (m.emissive !== undefined) {
        m.emissive.copy(s.on ? onCol : new THREE.Color(0x000000));
        m.emissiveIntensity = 0.7 * v;
      }
      if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.1);
      if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.55);
      m.transparent = true;
      m.opacity     = s.on ? (0.55 + 0.25 * v) : 0.55;
      m.depthWrite  = false;
      m.needsUpdate = true;
    }
    if (s.light) s.light.intensity = 1.3 * v;
  }

  toggleSlot(i) {
    const s = this.trafficSlotState[i];
    if (!s) return;
    this.setSlotOn(i, !s.on);
  }

  placeLamps(makeGLTFLoader) {
    const TRAFFIC = this.ctx.cfg.traffic;
    if (!TRAFFIC || !this.trafficRoot || !this.trafficSlots) return;
    
    this.clearAllSlots();
    this.trafficMode = 'lamps';
    const myToken = ++this.trafficLoadToken;
    
    makeGLTFLoader().load(TRAFFIC.lamp, (gltf) => {
      if (this.ctx.disposed || myToken !== this.trafficLoadToken) {
        gltf.scene.traverse((o) => {
          if (o.isMesh || o.isSprite) {
            o.geometry?.dispose?.();
            const m = o.material;
            (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
          }
        });
        return;
      }
      const template = gltf.scene;
      template.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      
      for (let i = 0; i < this.trafficSlots.length; i++) {
        const inst = template.clone(true);
        this.cloneInstanceMaterials(inst);
        this.fitOnSlot(inst, this.trafficSlots[i], 0.7, TRAFFIC_LAMP_ROT_X);
        this.ctx.scene.add(inst);
        const color = TRAFFIC_LAMP_COLORS[i] !== undefined ? TRAFFIC_LAMP_COLORS[i] : 0xffffff;
        const light = this.makeSlotLight(this.trafficSlots[i], color);
        this.ctx.scene.add(light);
        this.trafficSlotState[i] = { kind: 'lamp', inst, light, color, materials: this.collectMaterials(inst), on: false };
        this.setSlotOn(i, false);
      }
    }, undefined, (err) => console.error('LampGeneral 로드 실패:', err));
  }

  placeHands(makeGLTFLoader) {
    const TRAFFIC = this.ctx.cfg.traffic;
    if (!TRAFFIC || !this.trafficRoot || !this.trafficSlots) return;
    
    this.clearAllSlots();
    this.trafficMode = 'hands';
    const myToken = ++this.trafficLoadToken;
    const n = Math.min(this.trafficSlots.length, TRAFFIC.hands.length);
    
    for (let i = 0; i < n; i++) {
      const slot = this.trafficSlots[i], url = TRAFFIC.hands[i], idx = i;
      makeGLTFLoader().load(url, (gltf) => {
        if (this.ctx.disposed || myToken !== this.trafficLoadToken) {
          gltf.scene.traverse((o) => {
            if (o.isMesh || o.isSprite) {
              o.geometry?.dispose?.();
              const m = o.material;
              (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
            }
          });
          return;
        }
        const inst = gltf.scene;
        inst.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        this.cloneInstanceMaterials(inst);
        this.fitOnSlot(inst, slot, 0.85, 0);
        this.ctx.scene.add(inst);
        const color = TRAFFIC_HAND_COLOR;
        const light = this.makeSlotLight(slot, color);
        this.ctx.scene.add(light);
        this.trafficSlotState[idx] = { kind: 'hand', inst, light, color, materials: this.collectMaterials(inst), on: false };
        this.setSlotOn(idx, false);
      }, undefined, (err) => console.error('LampHand 로드 실패:', err));
    }
  }

  setupTraffic(root, makeGLTFLoader) {
    const THREE = this.ctx.THREE;
    const TRAFFIC = this.ctx.cfg.traffic;
    this.trafficRoot = root;
    this.trafficBox = new THREE.Box3().setFromObject(root);
    const tsz = this.trafficBox.getSize(new THREE.Vector3());
    const tcn = this.trafficBox.getCenter(new THREE.Vector3());
    this.trafficTopY = this.trafficBox.max.y;
    
    const n = Math.max(1, TRAFFIC.count || 3);
    const span  = tsz.x * 0.8;
    const start = tcn.x - span / 2;
    const step  = n === 1 ? 0 : span / (n - 1);
    const slotW = span / n;
    this.trafficSlots = [];
    for (let i = 0; i < n; i++) {
      this.trafficSlots.push({ x: start + step * i, z: tcn.z, width: slotW });
    }
    this.placeLamps(makeGLTFLoader);
  }

  resetTraffic() {
    this.trafficLoadToken++;
    this.clearAllSlots();
    this.trafficMode = null;
  }

  dispose() {
    this.clearAllSlots();
  }
}
