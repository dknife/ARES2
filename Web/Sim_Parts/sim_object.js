// Simulation object capsule and registry.
// This is the first step toward Unity-like scene objects in Sim_Parts.

function disposeObject3D(root) {
  root.traverse((node) => {
    if (node.isMesh || node.isSprite) {
      node.geometry?.dispose?.();
      const material = node.material;
      (Array.isArray(material) ? material : [material]).forEach((m) => {
        m?.map?.dispose?.();
        m?.dispose?.();
      });
    }
  });
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

    this.root.userData.simObject = this;
    this.root.userData.simObjectType = type;
    this.root.userData.simEditorLabel = label;
    this.root.userData.simEditorSpawned = spawned;
  }

  setWorldPosition(worldPoint, parent) {
    const localPoint = worldPoint.clone();
    if (parent) {
      parent.worldToLocal(localPoint);
    } else if (this.root.parent) {
      this.root.parent.worldToLocal(localPoint);
    }
    localPoint.y += this.metadata.groundOffset || 0;
    this.root.position.copy(localPoint);
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
  }

  makeId(type = 'object') {
    return `${type}-${this.nextId++}`;
  }

  add(simObject, parent = this.ctx.scene) {
    if (!simObject.id) simObject.id = this.makeId(simObject.type);
    if (!simObject.root.parent) parent.add(simObject.root);

    this.items.push(simObject);
    this.byRoot.set(simObject.root, simObject);
    simObject.root.userData.simObjectId = simObject.id;
    simObject.onAdd(this.ctx);

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

  update(dt) {
    this.items.forEach((item) => item.update(dt, this.ctx));
  }

  remove(simObject) {
    if (!simObject) return;
    this.ctx.editor?.unregister(simObject.root);
    this.items = this.items.filter((item) => item !== simObject);
    this.byRoot.delete(simObject.root);
    simObject.dispose(this.ctx);
  }

  dispose() {
    [...this.items].forEach((item) => this.remove(item));
  }
}
