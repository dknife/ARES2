// Factories for SimulationObject instances managed by Sim_Parts.

import { SimulationObject } from './sim_object.js';
import { LED_PALETTES } from './topics.js';

const DEFAULT_ALBI_EYES = {
  radius: 0.11,
  left: [0.145, 0.375, 0.12],
  right: [-0.145, 0.375, 0.12],
};
const DEFAULT_ALBI_CHEST = { radius: 0.07, pos: [0, -0.10, 0.135] };

function movementBoxComponent() {
  return {
    onAdd(ctx, simObject) {
      if (!ctx.worldGroup || !ctx.movement?.boxes) return;
      if (!ctx.movement.boxes.includes(simObject.root)) {
        ctx.movement.boxes.push(simObject.root);
      }
      simObject.root.userData.simEditorMovementBox = true;
    },
    dispose(ctx, simObject) {
      if (!ctx.movement?.boxes) return;
      ctx.movement.boxes = ctx.movement.boxes.filter((box) => box !== simObject.root);
    },
  };
}

export function createPrimitiveObject(ctx, type) {
  const THREE = ctx.THREE;
  const id = ctx.objects?.makeId(type) || `${type}-${Date.now()}`;

  if (type === 'sphere') {
    const root = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x4fc3ff, roughness: 0.45, metalness: 0.05 }),
    );
    root.castShadow = true;
    root.receiveShadow = true;
    return new SimulationObject({
      id,
      type,
      label: `Sphere ${id.split('-').pop()}`,
      root,
      spawned: true,
      metadata: { groundOffset: 0.35 },
    });
  }

  if (type === 'marker') {
    const root = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.75, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8edf7, roughness: 0.5, metalness: 0.1 }),
    );
    pole.position.y = 0.375;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 12),
      new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0xffa000, emissiveIntensity: 0.8 }),
    );
    head.position.y = 0.82;

    const light = new THREE.PointLight(0xffc400, 0.7, 2.2);
    light.position.copy(head.position);
    root.add(pole, head, light);

    return new SimulationObject({
      id,
      type,
      label: `Marker ${id.split('-').pop()}`,
      root,
      spawned: true,
    });
  }

  const root = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshStandardMaterial({ color: 0xff7a59, roughness: 0.75, metalness: 0.02 }),
  );
  root.castShadow = true;
  root.receiveShadow = true;

  return new SimulationObject({
    id,
    type: 'box',
    label: `Box ${id.split('-').pop()}`,
    root,
    spawned: true,
    components: { movementBox: movementBoxComponent() },
    metadata: { groundOffset: 0.35 },
  });
}

export function createAlbiModelObject(ctx, root, label = 'Albi Body', options = {}) {
  return new SimulationObject({
    id: ctx.objects?.makeId('albi-body') || `albi-body-${Date.now()}`,
    type: 'albi-body',
    label,
    root,
    spawned: !!options.spawned,
    metadata: { modelRole: 'body' },
  });
}

export function createAlbiLedObject(ctx, led, label, role, options = {}) {
  return new SimulationObject({
    id: ctx.objects?.makeId(`albi-${role}`) || `albi-${role}-${Date.now()}`,
    type: 'albi-led',
    label,
    root: led.group,
    spawned: !!options.spawned,
    metadata: {
      led,
      role,
      modelRole: 'led',
    },
  });
}

function loadGltf(ctx, url) {
  return new Promise((resolve, reject) => {
    const loader = new ctx.A.GLTFLoader();
    const md = window.MeshoptDecoder;
    if (md) loader.setMeshoptDecoder(md);
    loader.load(url, resolve, undefined, reject);
  });
}

function prepareModelChild(ctx, root) {
  const THREE = ctx.THREE;
  const size = new THREE.Vector3();
  const box = new THREE.Box3();

  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    }
  });

  box.setFromObject(root);
  box.getSize(size);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;

  return { size, height: size.y };
}

export async function createAlbiRobotObjects(ctx) {
  const THREE = ctx.THREE;
  const modelUrl = 'Mesh/AlbiStaticLow.glb';
  const gltf = await loadGltf(ctx, modelUrl);
  const model = gltf.scene;
  prepareModelChild(ctx, model);

  const holder = new THREE.Group();
  holder.add(model);

  const eyeCfg = ctx.cfg.eyes || DEFAULT_ALBI_EYES;
  const chestCfg = ctx.cfg.chest || DEFAULT_ALBI_CHEST;
  const eyeGlowTex = ctx.leds.makeGlowTex(LED_PALETTES.eye.glowStops);
  const chestGlowTex = ctx.leds.makeGlowTex(LED_PALETTES.chest.glowStops);

  const eyeL = ctx.leds.makeLed(eyeCfg.radius, eyeCfg.left, LED_PALETTES.eye, eyeGlowTex);
  const eyeR = ctx.leds.makeLed(eyeCfg.radius, eyeCfg.right, LED_PALETTES.eye, eyeGlowTex);
  const chest = ctx.leds.makeLed(chestCfg.radius, chestCfg.pos, LED_PALETTES.chest, chestGlowTex);

  holder.add(eyeL.group, eyeR.group, chest.group);

  return [
    createAlbiModelObject(ctx, holder, 'Spawned Albi Body', { spawned: true }),
    createAlbiLedObject(ctx, eyeL, 'Spawned Albi Eye L LED', 'eye-l', { spawned: true }),
    createAlbiLedObject(ctx, eyeR, 'Spawned Albi Eye R LED', 'eye-r', { spawned: true }),
    createAlbiLedObject(ctx, chest, 'Spawned Albi Chest LED', 'chest', { spawned: true }),
  ];
}
