// Factories for SimulationObject instances managed by Sim_Parts.

import { SimulationObject } from './sim_object.js';

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
