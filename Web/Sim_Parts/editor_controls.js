// ARES Simulation Editor Controls
// Mouse-based object selection, TransformControls gizmos, and a small spawn menu.

import { createSpawnedAlbiObjects } from '../Simulation/Simulation_AresRobot.js';
import { createPrimitiveObject } from './object_factory.js';
import { COMPONENT_TYPES, attachComponent, detachComponent, serializeComponents } from './components.js';

const MODES = ['translate', 'rotate', 'scale'];
const SPAWN_MENU = [
  { type: 'albi', label: 'Albi Robot' },
  { type: 'box', label: 'Box' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'marker', label: 'Marker' },
  { type: 'oled', label: 'OLED Panel' },
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
    this.hierarchyVersion = -1;

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
    this.hierarchy = this.createHierarchyPanel();
    this.ctx.stage.appendChild(this.hierarchy);

    // 씬 편집은 개발자 모드 전용(SIMULATOR.md 1장) — 기본은 사용자 모드(편집 UI 숨김).
    // Simulation_Main 이 Ctrl+E 토글로 setDevMode() 를 호출한다.
    this.devMode = false;
    this.toolbar.hidden = true;
    this.hierarchy.hidden = true;

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

    const childTitle = document.createElement('div');
    childTitle.className = 'sim-editor-context-title';
    childTitle.textContent = 'Create child';
    menu.appendChild(childTitle);

    SPAWN_MENU.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.spawnChild = item.type;
      btn.textContent = item.label;
      btn.addEventListener('click', () => this.spawn(item.type, { asChild: true }));
      menu.appendChild(btn);
    });

    // 선택 객체의 컴포넌트 부착/해제 (SIMULATOR.md 2장) — 내용은 updateContextMenuState 가 채운다
    const compTitle = document.createElement('div');
    compTitle.className = 'sim-editor-context-title';
    compTitle.textContent = 'Component';
    menu.appendChild(compTitle);
    this.compSection = document.createElement('div');
    menu.appendChild(this.compSection);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.dataset.action = 'delete-selected';
    deleteBtn.textContent = 'Delete runtime object';
    deleteBtn.addEventListener('click', () => this.deleteSelected());
    menu.appendChild(deleteBtn);

    return menu;
  }

  // 선택 객체에 컴포넌트 부착 — 타입별 필드를 prompt 로 입력받는다(개발자 모드 전용).
  // 벡터는 "x,y,z" 형식(월드 좌표계, SIMULATOR.md 규약), 빈칸 = 선택 필드 미사용.
  attachToSelected(type) {
    const simObject = this.getSelectedSimObject();
    if (!simObject?.spawned) return;

    const FIELD_SPECS = {
      LED: [{ key: 'led_no', label: 'LED 번호 (0~5)', def: '0', kind: 'int' }],
      DC: [
        { key: 'axis_rotation', label: 'DC 회전축 x,y,z (빈칸=미사용)', def: '0,1,0', kind: 'vec', optional: true },
        { key: 'axis_translate', label: 'DC 이동축 x,y,z (빈칸=미사용)', def: '', kind: 'vec', optional: true },
      ],
      Servo: [
        { key: 'wheel', label: '바퀴연결 (left/right)', def: 'left', kind: 'side' },
        { key: 'axis_rotation', label: '바퀴 스핀축 x,y,z (빈칸=미사용)', def: '1,0,0', kind: 'vec', optional: true },
        { key: 'axis_direction', label: '이동 방향 x,y,z (빈칸=미사용)', def: '', kind: 'vec', optional: true },
        { key: 'axis_turn', label: '선회축 x,y,z (빈칸=미사용)', def: '', kind: 'vec', optional: true },
      ],
      UltraSonic: [{ key: 'detect_direction', label: '거리 측정 ray 방향 x,y,z', def: '0,0,1', kind: 'vec' }],
      Magnet: [{ key: 'detection_point', label: '감지점 오프셋 x,y,z (월드축, 반경 5cm)', def: '0,0,0', kind: 'vec' }],
    };
    const parseVecStr = (s) => {
      const parts = String(s).split(',').map((x) => parseFloat(x));
      return parts.length === 3 && parts.every((n) => isFinite(n)) ? parts : null;
    };

    const fields = {};
    for (const spec of FIELD_SPECS[type] || []) {
      const answer = prompt(`${type} — ${spec.label}:`, spec.def);
      if (answer === null) return;                       // 취소 → 부착 중단
      const raw = answer.trim();
      if (!raw) {
        if (spec.optional) continue;
        return;
      }
      if (spec.kind === 'int') fields[spec.key] = Math.max(0, Math.min(5, parseInt(raw, 10) || 0));
      else if (spec.kind === 'side') fields[spec.key] = raw.toLowerCase() === 'right' ? 'right' : 'left';
      else {
        const v = parseVecStr(raw);
        if (!v) return;                                  // 형식 오류 → 중단
        fields[spec.key] = v;
      }
    }

    attachComponent(this.ctx, simObject, type, fields);
    this.select(simObject.root);                          // 라벨·메뉴 갱신
    this.hideContextMenu();
  }

  detachFromSelected(type) {
    const simObject = this.getSelectedSimObject();
    if (!simObject) return;
    detachComponent(this.ctx, simObject, type);
    this.select(simObject.root);
    this.hideContextMenu();
  }

  // 'Box 1 · LED0+Servo(L)' 형태의 표시용 라벨
  describeObject(simObject) {
    if (!simObject) return null;
    const comps = serializeComponents(simObject).map((c) => {
      if (c.type === 'LED') return `LED${c.fields.led_no}`;
      if (c.type === 'Servo') return `Servo(${c.fields.wheel === 'right' ? 'R' : 'L'})`;
      return c.type;
    });
    return comps.length ? `${simObject.label} · ${comps.join('+')}` : simObject.label;
  }

  createHierarchyPanel() {
    const panel = document.createElement('div');
    panel.className = 'sim-editor-hierarchy';
    panel.innerHTML = `
      <div class="sim-editor-hierarchy-head">
        <span>Hierarchy</span>
        <button type="button" data-action="toggle-hierarchy" title="Collapse hierarchy">-</button>
      </div>
      <div class="sim-editor-hierarchy-list"></div>
    `;

    panel.querySelector('[data-action="toggle-hierarchy"]')?.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      const btn = panel.querySelector('[data-action="toggle-hierarchy"]');
      if (btn) btn.textContent = panel.classList.contains('collapsed') ? '+' : '-';
    });

    return panel;
  }

  setDevMode(on) {
    this.devMode = !!on;
    this.toolbar.hidden = !this.devMode;
    this.hierarchy.hidden = !this.devMode;
    this.hideContextMenu();
    if (!this.devMode) this.select(null);
    else this.updateHierarchy(true);
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

    const simObject = this.getSelectedSimObject();
    const label = (simObject && this.describeObject(simObject))
      || this.selected?.userData?.simEditorLabel || 'No selection';
    const text = this.toolbar.querySelector('.sim-editor-selection');
    if (text) text.textContent = label;
    this.updateHierarchy(true);
  }

  getSpawnParent() {
    return this.ctx.worldGroup || this.ctx.scene;
  }

  getSelectedSimObject() {
    return this.selected ? this.ctx.objects?.getByRoot(this.selected) : null;
  }

  getSpawnParentFor(options = {}) {
    const selectedObject = this.getSelectedSimObject();
    if (options.asChild && selectedObject) {
      return selectedObject.root;
    }
    return this.getSpawnParent();
  }

  async spawn(type, options = {}) {
    if (type === 'albi') {
      return this.spawnAlbi(options);
    }

    const simObject = createPrimitiveObject(this.ctx, type);
    const parent = this.getSpawnParentFor(options);
    const worldPoint = this.lastSpawnPoint.clone();

    this.ctx.objects.add(simObject, parent);
    simObject.setWorldPosition(worldPoint, parent);

    this.select(simObject.root);
    this.hideContextMenu();
    this.updateHierarchy(true);
    return simObject.root;
  }

  async spawnAlbi(options = {}) {
    const parent = this.getSpawnParentFor(options);
    const worldPoint = this.lastSpawnPoint.clone();

    this.menu.querySelectorAll('button').forEach((btn) => { btn.disabled = true; });
    try {
      const simObjects = await createSpawnedAlbiObjects(this.ctx);
      const body = simObjects[0];
      this.ctx.objects.add(body, parent);
      body.setWorldPosition(worldPoint, parent);

      simObjects.slice(1).forEach((child) => {
        this.ctx.objects.add(child, body.root);
      });

      this.select(body.root);
      this.hideContextMenu();
      this.updateHierarchy(true);
      return body.root;
    } catch (err) {
      console.error('Failed to spawn Albi robot:', err);
      return null;
    } finally {
      this.menu.querySelectorAll('button').forEach((btn) => { btn.disabled = false; });
      this.updateContextMenuState();
    }
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
    this.updateHierarchy(true);
  }

  onKeyDown(event) {
    if (!this.devMode) return;
    // Ctrl+E(개발자 모드 토글) 등 조합키는 편집 단축키(W/E/R)와 충돌하지 않게 무시
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(event.target.tagName)) return;

    const key = event.key.toLowerCase();
    if (key === 'w') this.setMode('translate');
    else if (key === 'e') this.setMode('rotate');
    else if (key === 'r') this.setMode('scale');
    else if (key === 'escape') {
      this.select(null);
      this.hideContextMenu();
    } else if ((key === 'delete' || key === 'backspace') && this.getSelectedSimObject()?.spawned) {
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
    const menuH = Math.min(360, rect.height - 16);
    const x = Math.min(Math.max(8, event.clientX - rect.left), Math.max(8, rect.width - menuW - 8));
    const y = Math.min(Math.max(8, event.clientY - rect.top), Math.max(8, rect.height - menuH - 8));

    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    this.menu.hidden = false;
    this.updateContextMenuState();
  }

  updateContextMenuState() {
    const hasSelectedObject = !!this.getSelectedSimObject();
    this.menu.querySelectorAll('[data-spawn-child]').forEach((btn) => {
      btn.disabled = !hasSelectedObject;
    });

    const deleteBtn = this.menu.querySelector('[data-action="delete-selected"]');
    const selectedObject = this.getSelectedSimObject();
    if (deleteBtn) deleteBtn.disabled = !selectedObject?.spawned;

    // 컴포넌트 섹션: 선택 객체 기준으로 부착(+)/해제(−) 버튼을 다시 그린다
    if (this.compSection) {
      this.compSection.textContent = '';
      const attached = selectedObject ? Object.keys(selectedObject.components || {})
        .filter((k) => selectedObject.components[k]?.declarative) : [];
      COMPONENT_TYPES.forEach((type) => {
        const has = attached.includes(type);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.component = type;
        btn.textContent = `${has ? '−' : '+'} ${type}`;
        btn.disabled = !selectedObject?.spawned;
        btn.addEventListener('click', () => {
          if (has) this.detachFromSelected(type);
          else this.attachToSelected(type);
        });
        this.compSection.appendChild(btn);
      });
    }
  }

  hideContextMenu() {
    this.menu.hidden = true;
  }

  onPointerDown(event) {
    if (!this.devMode) return;
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
    if (!this.devMode) return;
    event.preventDefault();
    this.lastSpawnPoint.copy(this.getGroundPoint(event));

    const picked = this.pick(event);
    if (picked) this.select(picked);

    this.showContextMenu(event);
  }

  renderHierarchyItem(simObject, depth, list) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'sim-editor-hierarchy-item';
    row.dataset.simObjectId = simObject.id;
    row.style.setProperty('--depth', depth);
    row.setAttribute('aria-pressed', String(this.selected === simObject.root));

    const type = document.createElement('span');
    type.className = 'sim-editor-hierarchy-type';
    type.textContent = simObject.type;

    const label = document.createElement('span');
    label.className = 'sim-editor-hierarchy-label';
    label.textContent = simObject.label;

    row.append(type, label);
    row.addEventListener('click', () => this.select(simObject.root));
    list.appendChild(row);

    this.ctx.objects.getChildrenOf(simObject).forEach((child) => {
      this.renderHierarchyItem(child, depth + 1, list);
    });
  }

  updateHierarchy(force = false) {
    if (!this.hierarchy) return;
    const version = this.ctx.objects?.version ?? 0;
    if (!force && this.hierarchyVersion === version) return;
    this.hierarchyVersion = version;

    const list = this.hierarchy.querySelector('.sim-editor-hierarchy-list');
    if (!list) return;
    list.textContent = '';

    const roots = this.ctx.objects?.getRoots?.() || [];
    if (roots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sim-editor-hierarchy-empty';
      empty.textContent = 'No objects';
      list.appendChild(empty);
      return;
    }

    roots.forEach((simObject) => this.renderHierarchyItem(simObject, 0, list));
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
    this.updateHierarchy();
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    this.toolbar?.remove();
    this.menu?.remove();
    this.hierarchy?.remove();

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
