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

// 박스·구 기본 색상 — { base, emissive } 각각 [r,g,b,a] (0~1). a = 불투명도.
// base 는 기존 고정색과 동일. emissive 는 LED 밝기 t 로 보간될 목표색(디폴트 흰색,
// 평상시 t=0 에서는 적용되지 않는다). 보간은 components.js 의 LED setEmit 이 담당.
const DEFAULT_COLORS = {
  box:    { base: [1, 0.48, 0.35, 1], emissive: [1, 1, 1, 1] },
  sphere: { base: [0.31, 0.76, 1, 1], emissive: [1, 1, 1, 1] },
};
const defaultColors = (type) => ({
  base: [...DEFAULT_COLORS[type].base],
  emissive: [...DEFAULT_COLORS[type].emissive],
});

// metadata.colors 를 재질에 반영한다(색상 지원 객체 전용 — 박스·구).
// 평상시는 **기본색으로만** 렌더링한다. 발광색은 여기서 적용하지 않고,
// LED 켜기 명령이 왔을 때 LED 컴포넌트(components.js)가 점등 색으로 사용한다.
// 'srgb' 인자는 색 관리가 켜진 three 버전에서 헥스 상수와 같은 해석을 보장한다(구버전은 무시).
export function applyObjectColors(simObject) {
  const colors = simObject?.metadata?.colors;
  const mat = simObject?.root?.material;
  if (!colors || !mat || !mat.color) return;
  const [br = 1, bg = 1, bb = 1, ba = 1] = colors.base || [];
  mat.color.setRGB(br, bg, bb, 'srgb');
  mat.opacity = Math.max(0, Math.min(1, ba));
  mat.transparent = mat.opacity < 1;
  if (mat.emissive) {
    mat.emissive.setRGB(0, 0, 0);   // 소등 상태 — 발광은 LED 컴포넌트 담당
    mat.emissiveIntensity = 1;
  }
  mat.needsUpdate = true;
}

export function createPrimitiveObject(ctx, type) {
  const THREE = ctx.THREE;
  const id = ctx.objects?.makeId(type) || `${type}-${Date.now()}`;

  if (type === 'sphere') {
    const root = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 24, 16),
      new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }),
    );
    root.castShadow = true;
    root.receiveShadow = true;
    const sim = new SimulationObject({
      id,
      type,
      label: `Sphere ${id.split('-').pop()}`,
      root,
      spawned: true,
      metadata: { groundOffset: 0.35, colors: defaultColors('sphere') },
    });
    applyObjectColors(sim);
    return sim;
  }

  if (type === 'oled') {
    // 검정 패널(SIMULATOR.md Oled) — Oled 컴포넌트가 앞면(+Z)에 디스플레이 면을 붙인다.
    // 컴포넌트 부착은 등록(onAdd) 시점 이후여야 하므로 createPrimitiveObject 호출측이
    // registry.add 후 attachComponent 하도록 metadata 로 표시한다.
    const root = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.36, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.35, metalness: 0.2 }),
    );
    root.castShadow = true;
    root.receiveShadow = true;
    return new SimulationObject({
      id,
      type,
      label: `OLED ${id.split('-').pop()}`,
      root,
      spawned: true,
      metadata: { groundOffset: 0.45, autoComponents: [{ type: 'Oled', fields: {} }] },
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
    new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.02 }),
  );
  root.castShadow = true;
  root.receiveShadow = true;

  const sim = new SimulationObject({
    id,
    type: 'box',
    label: `Box ${id.split('-').pop()}`,
    root,
    spawned: true,
    components: { movementBox: movementBoxComponent() },
    metadata: { groundOffset: 0.35, colors: defaultColors('box') },
  });
  applyObjectColors(sim);
  return sim;
}

// GLB 모델을 씬 객체로 로드(SIMULATOR.md 1장 — glb 파일 로딩). url 은 Web/ 기준 상대경로.
export function createGlbObject(ctx, url, label) {
  const THREE = ctx.THREE;
  return new Promise((resolve, reject) => {
    ctx.assets.loadModel(url, (model) => {
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      // 바닥 기준 정렬(다른 모델 로딩과 동일 관례)
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;

      const holder = new THREE.Group();
      holder.add(model);
      const id = ctx.objects?.makeId('glb') || `glb-${Date.now()}`;
      resolve(new SimulationObject({
        id,
        type: 'glb',
        label: label || url.split('/').pop().replace(/\.glb$/i, ''),
        root: holder,
        spawned: true,
        metadata: { glbUrl: url },
      }));
    }, reject);
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
