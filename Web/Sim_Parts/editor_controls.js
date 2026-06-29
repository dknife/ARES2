// Lightweight editor-style object controls for the simulation viewport.

const MODES = ['translate', 'rotate', 'scale'];

export class EditorControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.THREE = ctx.THREE;
    this.camera = ctx.camera;
    this.dom = ctx.renderer.domElement;
    this.orbit = ctx.controls;
    this.selectables = [];
    this.selected = null;
    this.mode = 'translate';
    this.dragging = false;
    this.pointerId = null;
    this.startPointer = { x: 0, y: 0 };
    this.lastWorld = new this.THREE.Vector3();
    this.tmpWorld = new this.THREE.Vector3();
    this.tmpLocalA = new this.THREE.Vector3();
    this.tmpLocalB = new this.THREE.Vector3();
    this.raycaster = new this.THREE.Raycaster();
    this.pointer = new this.THREE.Vector2();
    this.dragPlane = new this.THREE.Plane();
    this.boxHelper = new this.THREE.BoxHelper(new this.THREE.Object3D(), 0xffd24a);
    this.boxHelper.visible = false;
    this.boxHelper.renderOrder = 999;
    this.ctx.scene.add(this.boxHelper);

    this.toolbar = this.createToolbar();
    this.ctx.stage.appendChild(this.toolbar);

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);

    this.dom.addEventListener('pointerdown', this.onPointerDown);
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
    this.toolbar.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
  }

  select(object) {
    this.selected = object || null;
    this.boxHelper.visible = !!this.selected;
    if (this.selected) this.boxHelper.setFromObject(this.selected);
    const label = this.selected?.userData?.simEditorLabel || 'No selection';
    const text = this.toolbar.querySelector('.sim-editor-selection');
    if (text) text.textContent = label;
  }

  onKeyDown(event) {
    if (event.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === 'w') this.setMode('translate');
    else if (key === 'e') this.setMode('rotate');
    else if (key === 'r') this.setMode('scale');
    else if (key === 'escape') this.select(null);
  }

  setPointer(event) {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  pick(event) {
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.selectables.map((entry) => entry.object), true);
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

  rayPlanePoint(event, target) {
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.dragPlane, target);
  }

  beginTranslate(event) {
    this.selected.getWorldPosition(this.tmpWorld);
    this.dragPlane.setFromNormalAndCoplanarPoint(new this.THREE.Vector3(0, 1, 0), this.tmpWorld);
    this.rayPlanePoint(event, this.lastWorld);
  }

  applyTranslate(event) {
    const current = this.rayPlanePoint(event, this.tmpWorld);
    if (!current) return;
    const parent = this.selected.parent;
    this.tmpLocalA.copy(this.lastWorld);
    this.tmpLocalB.copy(current);
    if (parent) {
      parent.worldToLocal(this.tmpLocalA);
      parent.worldToLocal(this.tmpLocalB);
    }
    this.selected.position.add(this.tmpLocalB.sub(this.tmpLocalA));
    this.lastWorld.copy(current);
  }

  applyRotate(event) {
    const dx = event.clientX - this.startPointer.x;
    const dy = event.clientY - this.startPointer.y;
    this.selected.rotation.y += dx * 0.01;
    this.selected.rotation.x += dy * 0.006;
    this.startPointer.x = event.clientX;
    this.startPointer.y = event.clientY;
  }

  applyScale(event) {
    const dx = event.clientX - this.startPointer.x;
    const dy = event.clientY - this.startPointer.y;
    const factor = Math.exp((dx - dy) * 0.008);
    const next = Math.max(0.05, Math.min(20, this.selected.scale.x * factor));
    const ratio = next / Math.max(0.0001, this.selected.scale.x);
    this.selected.scale.multiplyScalar(ratio);
    this.startPointer.x = event.clientX;
    this.startPointer.y = event.clientY;
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    const picked = this.pick(event);
    if (!picked) {
      this.select(null);
      return;
    }
    event.preventDefault();
    this.select(picked);
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.startPointer.x = event.clientX;
    this.startPointer.y = event.clientY;
    if (this.mode === 'translate') this.beginTranslate(event);
    this.orbit.enabled = false;
    this.dom.setPointerCapture?.(event.pointerId);
    this.dom.addEventListener('pointermove', this.onPointerMove);
    this.dom.addEventListener('pointerup', this.onPointerUp);
    this.dom.addEventListener('pointercancel', this.onPointerUp);
  }

  onPointerMove(event) {
    if (!this.dragging || event.pointerId !== this.pointerId || !this.selected) return;
    event.preventDefault();
    if (this.mode === 'translate') this.applyTranslate(event);
    else if (this.mode === 'rotate') this.applyRotate(event);
    else if (this.mode === 'scale') this.applyScale(event);
    this.update();
  }

  onPointerUp(event) {
    if (event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
    this.orbit.enabled = true;
    this.dom.releasePointerCapture?.(event.pointerId);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerUp);
  }

  update() {
    if (this.selected) this.boxHelper.setFromObject(this.selected);
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerUp);
    this.toolbar?.remove();
    this.boxHelper.geometry?.dispose?.();
    this.boxHelper.material?.dispose?.();
    this.boxHelper.parent?.remove(this.boxHelper);
  }
}
