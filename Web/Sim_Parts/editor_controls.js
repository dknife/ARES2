// ARES Simulation Editor Controls
// Mouse-based object selection, TransformControls gizmos, and a small spawn menu.

import { createPrimitiveObject } from './object_factory.js';

const MODES = ['translate', 'rotate', 'scale'];
const SPAWN_MENU = [
  { type: 'box', label: 'Box' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'marker', label: 'Marker' },
];

export class EditorControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.THREE = ctx.THREE;
    this.A = ctx.A;
    this.camera = ctx.camera;
    this.dom = ctx.renderer.domElement;
    this.orbit = ctx.controls;

    this.TransformControls = this.A?.TransformControls;
    this.enabled = !!this.TransformControls;

    this.selectables = [];
    this.selected = null;
    this.mode = 'translate';
    this.lastSpawnPoint = new this.THREE.Vector3();

    this.raycaster = new this.THREE.Raycaster();
    this.pointer = new this.THREE.Vector2();
    this.groundPlane = new this.THREE.Plane(new this.THREE.Vector3(0, 1, 0), 0);

    this.boxHelper = new this.THREE.BoxHelper(new this.THREE.Object3D(), 0xffd24a);
    this.boxHelper.visible = false;
    this.boxHelper.renderOrder = 999;
    this.ctx.scene.add(this.boxHelper);

    this.toolbar = this.createToolbar();
    this.ctx.stage.appendChild(this.toolbar);
    this.menu = this.createContextMenu();
    this.ctx.stage.appendChild(this.menu);

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onDraggingChanged = this.onDraggingChanged.bind(this);

    if (this.enabled) {
      this.transform = new this.TransformControls(this.camera, this.dom);
      this.transform.setMode(this.mode);
      this.transform.setSpace('world');
      this.transform.setSize(0.85);
      this.transform.visible = false;
      this.transform.addEventListener('dragging-changed', this.onDraggingChanged);
      this.ctx.scene.add(this.transform);
    } else {
      console.warn('ARES editor controls disabled: TransformControls is not available in window.ARES3.');
    }

    this.dom.addEventListener('pointerdown', this.onPointerDown);
    this.dom.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerdown', this.onDocumentPointerDown);
    window.addEventListener('keydown', this.onKeyDown);
  }

  createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'sim-editor-toolbar';
    toolbar.innerHTML = `
      <button type="button" data-mode="translate" title="Move (W)" aria-pressed="true">Move</button>
      <button type="button" data-mode="rotate" title="Rotate (E)" aria-pressed="false">Rotate</button>
      <button type="button" data-mode="scale" title="Scale (R)" aria-pressed="false">Scale</button>
      <span class="sim-editor-selection">No selection</span>
    `;

    toolbar.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });

    return toolbar;
  }

  createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'sim-editor-context-menu';
    menu.hidden = true;

    const title = document.createElement('div');
    title.className = 'sim-editor-context-title';
    title.textContent = 'Create object';
    menu.appendChild(title);

    SPAWN_MENU.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.spawn = item.type;
      btn.textContent = item.label;
      btn.addEventListener('click', () => this.spawn(item.type));
      menu.appendChild(btn);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.dataset.action = 'delete-selected';
    deleteBtn.textContent = 'Delete spawned';
    deleteBtn.addEventListener('click', () => this.deleteSelected());
    menu.appendChild(deleteBtn);

    return menu;
  }

  register(object, label = 'Object') {
    if (!object || this.selectables.some((entry) => entry.object === object)) return object;

    object.userData.simEditorLabel = label;
    this.selectables.push({ object, label });
    return object;
  }

  unregister(object) {
    this.selectables = this.selectables.filter((entry) => entry.object !== object);
    if (this.selected === object) this.select(null);
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;

    this.mode = mode;
    if (this.transform) this.transform.setMode(mode);

    this.toolbar.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
  }

  select(object) {
    this.selected = object || null;

    if (this.selected && this.transform) {
      this.transform.attach(this.selected);
      this.transform.visible = true;
    } else if (this.transform) {
      this.transform.detach();
      this.transform.visible = false;
    }

    this.boxHelper.visible = !!this.selected;
    if (this.selected) this.boxHelper.setFromObject(this.selected);

    const label = this.selected?.userData?.simEditorLabel || 'No selection';
    const text = this.toolbar.querySelector('.sim-editor-selection');
    if (text) text.textContent = label;
  }

  getSpawnParent() {
    return this.ctx.worldGroup || this.ctx.scene;
  }

  spawn(type) {
    const simObject = createPrimitiveObject(this.ctx, type);
    const parent = this.getSpawnParent();
    const worldPoint = this.lastSpawnPoint.clone();

    this.ctx.objects.add(simObject, parent);
    simObject.setWorldPosition(worldPoint, parent);

    this.select(simObject.root);
    this.hideContextMenu();
    return simObject.root;
  }

  deleteSelected() {
    const object = this.selected;
    const simObject = object ? this.ctx.objects?.getByRoot(object) : null;
    if (!simObject?.spawned) {
      this.hideContextMenu();
      return;
    }

    this.ctx.objects.remove(simObject);
    this.hideContextMenu();
  }

  onKeyDown(event) {
    if (event.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(event.target.tagName)) return;

    const key = event.key.toLowerCase();
    if (key === 'w') this.setMode('translate');
    else if (key === 'e') this.setMode('rotate');
    else if (key === 'r') this.setMode('scale');
    else if (key === 'escape') {
      this.select(null);
      this.hideContextMenu();
    } else if ((key === 'delete' || key === 'backspace') && this.selected?.userData?.simEditorSpawned) {
      this.deleteSelected();
    }
  }

  setPointer(event) {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  getGroundPoint(event) {
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const point = new this.THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, point)) return point;
    return this.raycaster.ray.at(4, point);
  }

  pick(event) {
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const roots = this.selectables.map((entry) => entry.object);
    const hits = this.raycaster.intersectObjects(roots, true);

    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        const entry = this.selectables.find((item) => item.object === node);
        if (entry) return entry.object;
        node = node.parent;
      }
    }

    return null;
  }

  showContextMenu(event) {
    const rect = this.ctx.stage.getBoundingClientRect();
    const menuW = 172;
    const menuH = 178;
    const x = Math.min(Math.max(8, event.clientX - rect.left), Math.max(8, rect.width - menuW - 8));
    const y = Math.min(Math.max(8, event.clientY - rect.top), Math.max(8, rect.height - menuH - 8));

    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    this.menu.hidden = false;

    const deleteBtn = this.menu.querySelector('[data-action="delete-selected"]');
    if (deleteBtn) deleteBtn.disabled = !this.selected?.userData?.simEditorSpawned;
  }

  hideContextMenu() {
    this.menu.hidden = true;
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    this.hideContextMenu();

    if (this.transform?.axis) return;

    const picked = this.pick(event);
    if (picked) {
      event.preventDefault();
      this.select(picked);
    } else {
      this.select(null);
    }
  }

  onContextMenu(event) {
    event.preventDefault();
    this.lastSpawnPoint.copy(this.getGroundPoint(event));

    const picked = this.pick(event);
    if (picked) this.select(picked);

    this.showContextMenu(event);
  }

  onDocumentPointerDown(event) {
    if (this.menu.hidden || this.menu.contains(event.target) || event.target === this.dom) return;
    this.hideContextMenu();
  }

  onDraggingChanged(event) {
    this.orbit.enabled = !event.value;
  }

  update() {
    if (this.selected) this.boxHelper.setFromObject(this.selected);
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    this.toolbar?.remove();
    this.menu?.remove();

    if (this.transform) {
      this.transform.removeEventListener('dragging-changed', this.onDraggingChanged);
      this.transform.detach();
      this.transform.dispose?.();
      this.transform.parent?.remove(this.transform);
    }

    this.boxHelper.geometry?.dispose?.();
    this.boxHelper.material?.dispose?.();
    this.boxHelper.parent?.remove(this.boxHelper);
  }
}
