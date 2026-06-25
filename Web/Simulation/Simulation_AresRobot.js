// Simulation_AresRobot.js
// Subsystem for the Ares Albi Robot (albi) topic.

export function initAresRobot(ctx) {
  const THREE = ctx.THREE;
  const cfg = ctx.cfg;
  
  let eyeL = null;
  let eyeR = null;
  let chestLed = null;
  
  // Palettes
  const EYE_PALETTE = {
    sphereBase: 0x0c2a18, emissive: 0x00ff66,
    glowStops: ['rgba(180,255,210,1)', 'rgba(40,255,120,0.65)', 'rgba(0,255,90,0)'],
    glowTint: 0x55ff99, lightColor: 0x33ff77,
  };
  const CHEST_PALETTE = {
    sphereBase: 0x2a0c0c, emissive: 0xff2030,
    glowStops: ['rgba(255,210,200,1)', 'rgba(255,60,40,0.65)', 'rgba(255,0,0,0)'],
    glowTint: 0xff5566, lightColor: 0xff3344,
  };

  const makeGlowTex = (stops) => {
    const gc = document.createElement('canvas'); gc.width = gc.height = 128;
    const gx = gc.getContext('2d');
    const gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0.0,  stops[0]);
    gg.addColorStop(0.25, stops[1]);
    gg.addColorStop(1.0,  stops[2]);
    gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(gc); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const makeLed = (radius, pos, palette, glowTex, geometry) => {
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
  };

  function applyLed(e, value) {
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

  const EYE = cfg.eyes;
  const CHEST = cfg.chest;
  
  const eyeGlowTex = EYE ? makeGlowTex(EYE_PALETTE.glowStops) : null;
  const chestGlowTex = CHEST ? makeGlowTex(CHEST_PALETTE.glowStops) : null;

  if (EYE) {
    eyeL = makeLed(EYE.radius, EYE.left, EYE_PALETTE, eyeGlowTex);
    eyeR = makeLed(EYE.radius, EYE.right, EYE_PALETTE, eyeGlowTex);
  }
  if (CHEST) {
    chestLed = makeLed(CHEST.radius, CHEST.pos, CHEST_PALETTE, chestGlowTex);
  }

  function attachToRoot(root) {
    if (eyeL) root.add(eyeL.group);
    if (eyeR) root.add(eyeR.group);
    if (chestLed) root.add(chestLed.group);
  }

  function setEye(side, value) {
    if (!EYE) return;
    applyLed(side === 'L' ? eyeL : eyeR, value);
  }

  function setChest(value) {
    if (!CHEST) return;
    applyLed(chestLed, value);
  }

  function dispose() {
    eyeGlowTex?.dispose();
    chestGlowTex?.dispose();
  }

  return {
    attachToRoot,
    setEye,
    setChest,
    dispose,
    get eyeL() { return eyeL; },
    get eyeR() { return eyeR; },
    get chestLed() { return chestLed; },
    get hasEyes() { return !!EYE; },
    get hasChest() { return !!CHEST; }
  };
}
