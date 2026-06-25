// Simulation_Traffic.js
// Subsystem for the Space Traffic Light (traffic) topic.

export function initTraffic(ctx, makeGLTFLoader) {
  const THREE = ctx.THREE;
  const scene = ctx.scene;
  const cfg = ctx.cfg;

  let trafficRoot = null;
  let trafficBox = null;
  let trafficSlots = null;
  let trafficTopY = 0;
  const trafficSlotState = [];
  let trafficMode = null;
  let trafficLoadToken = 0;

  const TRAFFIC = cfg.traffic;
  const TRAFFIC_LAMP_COLORS = [0xff0000, 0xffcc00, 0x00c030];
  const TRAFFIC_HAND_COLOR  = 0xffcc00;
  const TRAFFIC_LAMP_ROT_X = Math.PI / 2;
  const TRAFFIC_OFF_COLOR = new THREE.Color(0x666666);

  function disposeSubtree(obj) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material; (Array.isArray(m) ? m : [m]).forEach((mm) => mm?.dispose?.());
      }
    });
    if (obj.parent) obj.parent.remove(obj);
  }

  function clearSlot(i) {
    const s = trafficSlotState[i];
    if (!s) return;
    if (s.inst) disposeSubtree(s.inst);
    if (s.light && s.light.parent) s.light.parent.remove(s.light);
    trafficSlotState[i] = null;
  }

  function clearAllSlots() {
    for (let i = 0; i < trafficSlotState.length; i++) clearSlot(i);
  }

  function fitOnSlot(inst, slot, widthRatio, rotX) {
    if (rotX) inst.rotation.x = rotX;
    inst.updateMatrixWorld(true);
    const tb = new THREE.Box3().setFromObject(inst);
    const ts = tb.getSize(new THREE.Vector3());
    const s = ts.x > 0 ? (slot.width * widthRatio) / ts.x : 1;
    inst.scale.setScalar(s);
    inst.updateMatrixWorld(true);
    const ib = new THREE.Box3().setFromObject(inst);
    const ic = ib.getCenter(new THREE.Vector3());
    inst.position.set(slot.x - ic.x, trafficTopY - ib.min.y, slot.z - ic.z);
  }

  function cloneInstanceMaterials(obj) {
    obj.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      }
    });
  }

  function collectMaterials(obj) {
    const arr = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m) arr.push(m);
    });
    return arr;
  }

  function makeSlotLight(slot, colorHex) {
    const l = new THREE.PointLight(colorHex, 0, slot.width * 6, 2);
    l.position.set(slot.x, trafficTopY + slot.width * 0.5, slot.z);
    return l;
  }

  function setSlotOn(i, value) {
    const s = trafficSlotState[i];
    if (!s) return;
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    s.on = v > 0;
    const onCol = new THREE.Color(s.color);
    for (const m of s.materials) {
      if (m.color    !== undefined) m.color.copy(s.on ? onCol : TRAFFIC_OFF_COLOR);
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

  function toggleSlot(i) {
    const s = trafficSlotState[i];
    if (!s) return;
    setSlotOn(i, !s.on);
  }

  function placeLamps() {
    if (!TRAFFIC || !trafficRoot || !trafficSlots) return;
    clearAllSlots();
    trafficMode = 'lamps';
    const myToken = ++trafficLoadToken;
    makeGLTFLoader().load(TRAFFIC.lamp, (gltf) => {
      if (ctx.disposed || myToken !== trafficLoadToken) {
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
      for (let i = 0; i < trafficSlots.length; i++) {
        const inst = template.clone(true);
        cloneInstanceMaterials(inst);
        fitOnSlot(inst, trafficSlots[i], 0.7, TRAFFIC_LAMP_ROT_X);
        scene.add(inst);
        const color = TRAFFIC_LAMP_COLORS[i] !== undefined ? TRAFFIC_LAMP_COLORS[i] : 0xffffff;
        const light = makeSlotLight(trafficSlots[i], color); scene.add(light);
        trafficSlotState[i] = { kind: 'lamp', inst, light, color, materials: collectMaterials(inst), on: false };
        setSlotOn(i, false);
      }
    }, undefined, (err) => console.error('LampGeneral 로드 실패:', err));
  }

  function placeHands() {
    if (!TRAFFIC || !trafficRoot || !trafficSlots) return;
    clearAllSlots();
    trafficMode = 'hands';
    const myToken = ++trafficLoadToken;
    const n = Math.min(trafficSlots.length, TRAFFIC.hands.length);
    for (let i = 0; i < n; i++) {
      const slot = trafficSlots[i], url = TRAFFIC.hands[i], idx = i;
      makeGLTFLoader().load(url, (gltf) => {
        if (ctx.disposed || myToken !== trafficLoadToken) {
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
        cloneInstanceMaterials(inst);
        fitOnSlot(inst, slot, 0.85, 0);
        scene.add(inst);
        const color = TRAFFIC_HAND_COLOR;
        const light = makeSlotLight(slot, color); scene.add(light);
        trafficSlotState[idx] = { kind: 'hand', inst, light, color, materials: collectMaterials(inst), on: false };
        setSlotOn(idx, false);
      }, undefined, (err) => console.error('LampHand 로드 실패:', err));
    }
  }

  function setupTraffic(root) {
    trafficRoot = root;
    trafficBox = new THREE.Box3().setFromObject(root);
    const tsz = trafficBox.getSize(new THREE.Vector3());
    const tcn = trafficBox.getCenter(new THREE.Vector3());
    trafficTopY = trafficBox.max.y;
    const n = Math.max(1, TRAFFIC.count || 3);
    const span  = tsz.x * 0.8;
    const start = tcn.x - span / 2;
    const step  = n === 1 ? 0 : span / (n - 1);
    const slotW = span / n;
    trafficSlots = [];
    for (let i = 0; i < n; i++) trafficSlots.push({ x: start + step * i, z: tcn.z, width: slotW });
    placeLamps();
  }

  function resetTraffic() {
    ++trafficLoadToken;
    clearAllSlots();
    trafficMode = null;
  }

  function dispose() {
    clearAllSlots();
  }

  return {
    setupTraffic,
    placeLamps,
    placeHands,
    resetTraffic,
    toggleSlot,
    setSlotOn,
    dispose,
    get hasTraffic() { return true; }
  };
}
