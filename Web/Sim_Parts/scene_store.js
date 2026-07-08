// Web/Sim_Parts/scene_store.js
// 씬 저장/로드 (SIMULATOR.md 2장 · 구현 규약 2026-07-08)
// - 씬 좌표 1 unit = 1 m. unitScale 필드로 추후 단위 조정 가능.
// - 개발자 모드에서 스폰된 객체(spawned=true)만 직렬화한다.
//   토픽이 만드는 기본 객체(알비 본체 등, spawned=false)는 topic 필드로 재현된다.

import { createPrimitiveObject } from './object_factory.js';
import { createSpawnedAlbiObjects } from '../Simulation/Simulation_AresRobot.js';

export const SCENE_FORMAT_VERSION = 1;

// 직렬화에서 제외할 자동 생성 하위 객체(알비 스폰 시 LED가 함께 만들어진다)
const AUTO_CHILD_TYPES = new Set(['albi-led']);

export function serializeScene(ctx, { name = 'scene', topic = 'empty' } = {}) {
  const items = (ctx.objects?.items || []).filter(
    (o) => o.spawned && !AUTO_CHILD_TYPES.has(o.type),
  );
  // items 는 생성 순서라 부모가 자식보다 먼저 온다(스폰 구조상 보장).
  const objects = items.map((o) => {
    const parent = ctx.objects.getParentOf(o);
    return {
      id: o.id,
      type: o.type === 'albi-body' ? 'albi' : o.type,
      label: o.label,
      // 부모가 토픽 기본 객체(비스폰)면 씬 파일에는 최상위로 저장한다.
      parent: parent && parent.spawned ? parent.id : null,
      position: o.root.position.toArray(),
      quaternion: o.root.quaternion.toArray(),
      scale: o.root.scale.toArray(),
    };
  });
  return { version: SCENE_FORMAT_VERSION, name, unitScale: 1, topic, objects };
}

// 스폰된 객체를 모두 제거한다(새 씬/씬 로드 전 정리). remove()가 하위를 함께
// 지우므로 스폰 루트(부모가 없거나 비스폰인 객체)만 순회한다.
export function clearSpawnedObjects(ctx) {
  const spawned = (ctx.objects?.items || []).filter((o) => o.spawned);
  spawned
    .filter((o) => {
      const p = ctx.objects.getParentOf(o);
      return !p || !p.spawned;
    })
    .forEach((o) => ctx.objects.remove(o));
  ctx.editor?.updateHierarchy?.(true);
}

export async function applyScene(ctx, json) {
  if (!json || json.version !== SCENE_FORMAT_VERSION || !Array.isArray(json.objects)) {
    throw new Error('올바른 씬 파일이 아닙니다 (version/objects 확인)');
  }
  clearSpawnedObjects(ctx);

  const byId = new Map();
  for (const entry of json.objects) {
    const parentSim = entry.parent ? byId.get(entry.parent) : null;
    const parentRoot = parentSim?.root || ctx.worldGroup || ctx.scene;

    let sim;
    if (entry.type === 'albi') {
      const list = await createSpawnedAlbiObjects(ctx);
      sim = list[0];
      ctx.objects.add(sim, parentRoot);
      list.slice(1).forEach((child) => ctx.objects.add(child, sim.root));
    } else {
      sim = createPrimitiveObject(ctx, entry.type);
      ctx.objects.add(sim, parentRoot);
    }

    if (entry.label) {
      sim.label = entry.label;
      sim.root.userData.simEditorLabel = entry.label;
    }
    if (entry.position) sim.root.position.fromArray(entry.position);
    if (entry.quaternion) sim.root.quaternion.fromArray(entry.quaternion);
    if (entry.scale) sim.root.scale.fromArray(entry.scale);
    if (entry.id) byId.set(entry.id, sim);
  }

  ctx.editor?.updateHierarchy?.(true);
  return json;
}
