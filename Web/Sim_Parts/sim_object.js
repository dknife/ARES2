// Simulation object capsule and registry.
// This is the first step toward Unity-like scene objects in Sim_Parts.

import { attachComponent } from './components.js';

function disposeObject3D(root) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node !== root && node.userData?.simObject) continue;

    if (node.isMesh || node.isSprite) {
      node.geometry?.dispose?.();
      const material = node.material;
      (Array.isArray(material) ? material : [material]).forEach((m) => {
        m?.map?.dispose?.();
        m?.dispose?.();
      });
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }
}

export class SimulationObject {
  constructor({
    id = '',
    type = 'object',
    label = 'Object',
    root,
    components = {},
    selectable = true,
    spawned = false,
    metadata = {},
  }) {
    if (!root) throw new Error('SimulationObject requires a root Object3D.');

    this.id = id;
    this.type = type;
    this.label = label;
    this.root = root;
    this.components = components;
    this.selectable = selectable;
    this.spawned = spawned;
    this.metadata = metadata;
    this.disposed = false;
    this.childHolder = null;   // 하위 simObject 부착 지점(부모 스케일 비전파용 역스케일 그룹)

    this.root.userData.simObject = this;
    this.root.userData.simObjectType = type;
    this.root.userData.simEditorLabel = label;
    this.root.userData.simEditorSpawned = spawned;
  }

  setWorldPosition(worldPoint, parent) {
    const localPoint = worldPoint.clone();
    // 실제 부착 부모(자식 홀더일 수 있음)를 우선한다
    const ref = this.root.parent || parent;
    if (ref) {
      ref.updateWorldMatrix(true, false);
      ref.worldToLocal(localPoint);
    }
    localPoint.y += this.metadata.groundOffset || 0;
    this.root.position.copy(localPoint);
  }

  // 부모 스케일이 하위로 전파되지 않도록 역스케일을 유지한다(매 프레임 동기화).
  syncChildHolderScale() {
    if (!this.childHolder) return;
    const s = this.root.scale;
    const inv = (v) => (Math.abs(v) > 1e-6 ? 1 / v : 1);
    this.childHolder.scale.set(inv(s.x), inv(s.y), inv(s.z));
  }

  onAdd(ctx) {
    Object.values(this.components).forEach((component) => {
      component?.onAdd?.(ctx, this);
    });
  }

  update(dt, ctx) {
    Object.values(this.components).forEach((component) => {
      component?.update?.(dt, ctx, this);
    });
    this.syncChildHolderScale();
  }

  dispose(ctx) {
    if (this.disposed) return;
    this.disposed = true;

    Object.values(this.components).forEach((component) => {
      component?.dispose?.(ctx, this);
    });

    disposeObject3D(this.root);
    this.root.parent?.remove(this.root);
    this.root.userData.simObject = null;
  }
}

export class SimulationObjectRegistry {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = [];
    this.byRoot = new Map();
    this.nextId = 1;
    this.version = 0;
  }

  makeId(type = 'object') {
    return `${type}-${this.nextId++}`;
  }

  // 부모가 simObject 면 그 자식 홀더(역스케일 그룹)에 부착 — 스케일은 개별 객체에
  // 한정되고 하위 객체로 전달되지 않는다(2026-07-08 규약). 하위 오프셋 거리도 m 유지.
  getAttachPointFor(parentSim) {
    if (!parentSim.childHolder) {
      const holder = new this.ctx.THREE.Group();
      holder.name = 'sim-children';
      parentSim.root.add(holder);
      parentSim.childHolder = holder;
      parentSim.syncChildHolderScale();
    }
    return parentSim.childHolder;
  }

  add(simObject, parent = this.ctx.scene) {
    if (!simObject.id) simObject.id = this.makeId(simObject.type);
    const parentSim = parent?.userData?.simObject;
    const attachTo = parentSim ? this.getAttachPointFor(parentSim) : parent;
    if (!simObject.root.parent) attachTo.add(simObject.root);

    // 등록되는 모든 객체는 서로 그림자를 주고받는다 — 팩토리별 플래그 누락 안전망
    simObject.root.traverse((node) => {
      if (!node.isMesh || node.isSprite) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });

    this.items.push(simObject);
    this.byRoot.set(simObject.root, simObject);
    simObject.root.userData.simObjectId = simObject.id;
    simObject.onAdd(this.ctx);
    // 팩토리가 지정한 기본 컴포넌트 부착(예: OLED 패널의 Oled)
    (simObject.metadata?.autoComponents || []).forEach(({ type, fields }) => {
      attachComponent(this.ctx, simObject, type, fields);
    });
    this.version += 1;

    if (simObject.selectable) {
      this.ctx.editor?.register(simObject.root, simObject.label);
    }

    return simObject;
  }

  getByRoot(root) {
    let node = root;
    while (node) {
      const found = this.byRoot.get(node);
      if (found) return found;
      node = node.parent;
    }
    return null;
  }

  getParentOf(simObject) {
    let node = simObject?.root?.parent || null;
    while (node) {
      const parent = this.byRoot.get(node);
      if (parent) return parent;
      node = node.parent;
    }
    return null;
  }

  getChildrenOf(simObject) {
    return this.items.filter((item) => this.getParentOf(item) === simObject);
  }

  getRoots() {
    return this.items.filter((item) => !this.getParentOf(item));
  }

  update(dt) {
    this.items.forEach((item) => item.update(dt, this.ctx));
  }

  // 블록 코딩 명령을 모든 객체의 컴포넌트에 브로드캐스트한다(SIMULATOR.md 2장).
  // 컴포넌트 onCommand 가 cleanup 을 반환하면 모아 합성 cleanup 으로 돌려준다
  // (dispatch.simSink 가 hold 종료 후 호출).
  routeCommand(cmd) {
    const cleanups = [];
    this.items.forEach((item) => {
      Object.values(item.components || {}).forEach((component) => {
        try {
          const fn = component?.onCommand?.(cmd, this.ctx, item);
          if (typeof fn === 'function') cleanups.push(fn);
        } catch (err) {
          console.warn('component onCommand 오류:', component?.type, err);
        }
      });
    });
    if (cleanups.length === 0) return null;
    return () => cleanups.forEach((fn) => { try { fn(); } catch {} });
  }

  remove(simObject) {
    if (!simObject) return;
    this.getChildrenOf(simObject).forEach((child) => this.remove(child));
    this.ctx.editor?.unregister(simObject.root);
    this.items = this.items.filter((item) => item !== simObject);
    this.byRoot.delete(simObject.root);
    this.version += 1;
    simObject.dispose(this.ctx);
  }

  dispose() {
    [...this.items].forEach((item) => this.remove(item));
  }
}
