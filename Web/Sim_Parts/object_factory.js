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
  box:      { base: [1, 0.48, 0.35, 1], emissive: [1, 1, 1, 1] },
  sphere:   { base: [0.31, 0.76, 1, 1], emissive: [1, 1, 1, 1] },
  cylinder: { base: [0.47, 0.82, 0.55, 1], emissive: [1, 1, 1, 1] },
};
const defaultColors = (type) => ({
  base: [...DEFAULT_COLORS[type].base],
  emissive: [...DEFAULT_COLORS[type].emissive],
});

// 객체 자신의 메시만 순회(중첩된 자식 simObject 경계에서 멈춤 — components.js 와 동일 규칙)
function forOwnMeshes(root, fn) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node !== root && node.userData?.simObject) continue;
    if (node.isMesh) fn(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
}

// metadata.colors 를 재질에 반영한다.
// - 박스·구·원기둥(단색 프리미티브): 기본색을 재질색으로 **직접** 지정(종전 동작).
// - GLB(colorMode==='multiply'): 기본색을 **원본 재질색에 곱해** 틴트한다 —
//   base=(1,1,1,1) 이면 원래 색 그대로. 원본 색은 최초 1회 스냅샷해 멱등 재적용.
// 발광색은 여기서 적용하지 않고 LED 컴포넌트(components.js)가 점등 시 사용한다.
// 'srgb' 인자는 색 관리가 켜진 three 버전에서 헥스 상수와 같은 해석을 보장한다(구버전은 무시).
export function applyObjectColors(simObject) {
  const colors = simObject?.metadata?.colors;
  if (!colors) return;
  const [br = 1, bg = 1, bb = 1, ba = 1] = colors.base || [];

  // GLB — 곱셈(multiplicative) 모드
  if (simObject.metadata?.colorMode === 'multiply') {
    forOwnMeshes(simObject.root, (mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (!m || !m.color) return;
        if (!m.userData._aresOrig) {
          m.userData._aresOrig = { color: m.color.clone(), opacity: m.opacity ?? 1, transparent: !!m.transparent };
        }
        const orig = m.userData._aresOrig;
        // 원본색 × 기본색 (srgb 해석) — Color 생성은 THREE 의존 없이 기존 인스턴스로부터
        const tint = orig.color.clone().set(0xffffff).setRGB(br, bg, bb, 'srgb');
        m.color.copy(orig.color).multiply(tint);
        m.opacity = Math.max(0, Math.min(1, orig.opacity * ba));
        m.transparent = orig.transparent || m.opacity < 1;
        m.needsUpdate = true;
      });
    });
    return;
  }

  // 프리미티브 — 직접 지정(종전 동작)
  const mat = simObject?.root?.material;
  if (!mat || !mat.color) return;
  mat.color.setRGB(br, bg, bb, 'srgb');
  mat.opacity = Math.max(0, Math.min(1, ba));
  mat.transparent = mat.opacity < 1;
  if (mat.emissive) {
    mat.emissive.setRGB(0, 0, 0);   // 소등 상태 — 발광은 LED 컴포넌트 담당
    mat.emissiveIntensity = 1;
  }
  mat.needsUpdate = true;

  // 에지 표시가 켜져 있으면 선 색을 기본색의 보색으로 갱신(선 생성/제거는 applyObjectEdges).
  const edgeLine = simObject.root?.userData?._edgeLines;
  if (simObject.metadata?.edges && edgeLine?.material?.color) {
    edgeLine.material.color.setRGB(1 - br, 1 - bg, 1 - bb, 'srgb');
  }
}

// 에지(모서리) 선 표시 토글 — 회전이 잘 안 보이는 원기둥 등에 유용하다.
// metadata.edges 가 true 면 메시 지오메트리의 모서리를 기본색의 보색 선으로 덧그린다
// (패싯 세로선까지 포함되어 축 회전도 눈에 보인다). THREE 생성자가 필요해 ctx 를 받는다.
export function applyObjectEdges(ctx, simObject) {
  const THREE = ctx?.THREE;
  const root = simObject?.root;
  if (!THREE || !root || !root.isMesh) return;
  const prev = root.userData._edgeLines;
  if (prev) {
    root.remove(prev);
    prev.geometry?.dispose?.();
    prev.material?.dispose?.();
    root.userData._edgeLines = null;
  }
  if (!simObject.metadata?.edges) return;
  const base = simObject.metadata?.colors?.base || [1, 1, 1, 1];
  const comp = new THREE.Color().setRGB(1 - (base[0] ?? 1), 1 - (base[1] ?? 1), 1 - (base[2] ?? 1), 'srgb');
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(root.geometry),                 // 기본 threshold(1°) → 패싯 세로선 포함
    new THREE.LineBasicMaterial({ color: comp }),
  );
  line.userData.simEdge = true;                             // 픽/직렬화에서 무시할 표식
  line.renderOrder = 1;
  root.add(line);
  root.userData._edgeLines = line;
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

  if (type === 'cylinder') {
    // 원기둥 — 박스·구와 같은 색상 시스템(기본색/발광색, LED 밝기 보간) 지원.
    // 주의: createPrimitiveObject 의 마지막 폴백이 미지 타입을 box 로 만들므로
    // 이 분기는 반드시 폴백보다 앞에 있어야 씬 로드(scene_store)에서도 복원된다.
    const root = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.7, 24),
      new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }),
    );
    root.castShadow = true;
    root.receiveShadow = true;
    const sim = new SimulationObject({
      id,
      type,
      label: `Cylinder ${id.split('-').pop()}`,
      root,
      spawned: true,
      metadata: { groundOffset: 0.35, colors: defaultColors('cylinder'), canEdges: true, edges: false },
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
    metadata: { groundOffset: 0.35, colors: defaultColors('box'), canEdges: true, edges: false },
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
      // GLB 도 기본색/발광색을 갖는다(2026-07-15). 곱셈(multiplicative) 모드 —
      // (1,1,1,1) 이 항등값이라 기존 씬의 GLB 는 원래 색 그대로 보인다.
      const sim = new SimulationObject({
        id,
        type: 'glb',
        label: label || url.split('/').pop().replace(/\.glb$/i, ''),
        root: holder,
        spawned: true,
        metadata: {
          glbUrl: url,
          colorMode: 'multiply',
          colors: { base: [1, 1, 1, 1], emissive: [1, 1, 1, 1] },
        },
      });
      applyObjectColors(sim);   // 원본 재질색 스냅샷 겸 항등 적용
      resolve(sim);
    }, reject);
  });
}
// (알비 팩토리 함수들은 Simulation_AresRobot.js 내부로 이동 — Simulation_LeeMinhyuck 병합)
