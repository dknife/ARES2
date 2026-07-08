// ARES Simulation Editor Controls
// Mouse-based object selection, TransformControls gizmos, and a small spawn menu.

import { createSpawnedAlbiObjects } from '../Simulation/Simulation_AresRobot.js';
import { createPrimitiveObject, createGlbObject } from './object_factory.js';
import { COMPONENT_TYPES, attachComponent, detachComponent, serializeComponents } from './components.js';

const RENAME_HOLD_MS = 600;   // Hierarchy 항목 길게 클릭 → 이름 변경

// 컴포넌트 필드 정의 — 부착 프롬프트와 인스펙터 편집 UI 가 공유한다.
// kind: int(0~5) | side(left/right) | vec(x,y,z, optional 이면 빈칸=미사용)
const FIELD_SPECS = {
  LED: [{ key: 'led_no', label: 'LED 번호 (0~5)', short: 'LED 번호', def: '0', kind: 'int' }],
  DC: [
    { key: 'axis_rotation', label: 'DC 회전축 x,y,z (빈칸=미사용)', short: '회전축', def: '0,1,0', kind: 'vec', optional: true },
    { key: 'rotation_offset', label: '회전 기준점 오프셋 x,y,z (로컬, 빈칸=원점)', short: '회전 기준', def: '', kind: 'vec', optional: true },
    { key: 'axis_translate', label: 'DC 이동축 x,y,z (빈칸=미사용)', short: '이동축', def: '', kind: 'vec', optional: true },
  ],
  Servo: [
    { key: 'wheel', label: '바퀴연결 (left/right)', short: '바퀴', def: 'left', kind: 'side' },
    { key: 'axis_rotation', label: '바퀴 스핀축 x,y,z (빈칸=미사용)', short: '스핀축', def: '1,0,0', kind: 'vec', optional: true },
    { key: 'rotation_offset', label: '스핀축 기준점 오프셋 x,y,z (로컬, 빈칸=원점)', short: '스핀 기준', def: '', kind: 'vec', optional: true },
    { key: 'axis_direction', label: '이동 방향 x,y,z (빈칸=미사용)', short: '이동 방향', def: '', kind: 'vec', optional: true },
    { key: 'axis_turn', label: '선회축 x,y,z (빈칸=미사용)', short: '선회축', def: '', kind: 'vec', optional: true },
    { key: 'turn_offset', label: '선회축 기준점 오프셋 x,y,z (로컬, 빈칸=원점)', short: '선회 기준', def: '', kind: 'vec', optional: true },
  ],
  UltraSonic: [{ key: 'detect_direction', label: '거리 측정 ray 방향 x,y,z (로컬축)', short: 'ray 방향', def: '0,0,1', kind: 'vec' }],
  Magnet: [{ key: 'detection_point', label: '감지점 오프셋 x,y,z (로컬 좌표, 반경 5cm)', short: '감지점', def: '0,0,0', kind: 'vec' }],
  Gun: [
    { key: 'propel_direction', label: '발사 방향 x,y,z', short: '발사 방향', def: '0,0,1', kind: 'vec' },
    { key: 'explosion', label: '연기 발생점 오프셋 x,y,z (빈칸=미사용)', short: '연기점', def: '', kind: 'vec', optional: true },
  ],
};

const MODES = ['translate', 'rotate', 'scale'];
const SPAWN_MENU = [
  { type: 'albi', label: 'Albi Robot' },
  { type: 'box', label: 'Box' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'marker', label: 'Marker' },
  { type: 'oled', label: 'OLED Panel' },
  { type: 'glb', label: 'GLB 모델…' },
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
    this.inspector = this.createInspector();
    this.ctx.stage.appendChild(this.inspector);

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
  // 벡터는 "x,y,z" 형식(객체 로컬 좌표계, SIMULATOR.md 규약 개정), 빈칸 = 선택 필드 미사용.
  attachToSelected(type) {
    const simObject = this.getSelectedSimObject();
    if (!simObject?.spawned) return;

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

  // 개발자 모드 시각 보조 — 원점 좌표축(x=빨강·y=초록·z=파랑) + 3직교 평면(xz·xy·yz) 그리드.
  // 1 unit = 1 m 규약에 맞춰 10m 범위·0.5m 격자. 라인이라 UltraSonic ray(isMesh 필터)에 안 걸린다.
  ensureDevGrids() {
    if (this.devGrids) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = 'dev-grids';
    const makeGrid = (opacity) => {
      const grid = new THREE.GridHelper(10, 20, 0x8fb7ff, 0x44506e);
      grid.material.transparent = true;
      grid.material.opacity = opacity;
      grid.material.depthWrite = false;
      return grid;
    };
    const xz = makeGrid(0.35);                          // 바닥(xz) — 기준 평면이라 가장 진하게
    const xy = makeGrid(0.15); xy.rotation.x = Math.PI / 2;   // 정면(xy)
    const yz = makeGrid(0.15); yz.rotation.z = Math.PI / 2;   // 측면(yz)
    const axes = new THREE.AxesHelper(1.6);             // 원점 기준 x·y·z 축
    if (axes.material) axes.material.depthWrite = false;
    group.add(xz, xy, yz, axes);
    this.devGrids = group;
    this.ctx.scene.add(group);
  }

  setDevMode(on) {
    this.devMode = !!on;
    this.toolbar.hidden = !this.devMode;
    this.hierarchy.hidden = !this.devMode;
    this.hideContextMenu();
    if (this.devMode) this.ensureDevGrids();
    if (this.devGrids) this.devGrids.visible = this.devMode;
    if (!this.devMode) this.select(null);
    else this.updateHierarchy(true);
    this.updateInspector();
  }

  // ==== 컴포넌트 인스펙터 — 선택 객체의 직렬화 필드값(JSON)을 씬 드롭박스 아래에서 편집 ====
  createInspector() {
    const panel = document.createElement('div');
    panel.className = 'sim-editor-inspector';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="sim-editor-inspector-head">
        <span class="sim-editor-inspector-title">컴포넌트</span>
        <button type="button" data-action="apply">적용</button>
      </div>
      <div class="sim-editor-inspector-tf">
        <span>위치</span><input data-tf="p0"><input data-tf="p1"><input data-tf="p2">
        <span>회전°</span><input data-tf="r0"><input data-tf="r1"><input data-tf="r2">
        <span>크기</span><input data-tf="s0"><input data-tf="s1"><input data-tf="s2">
      </div>
      <div class="sim-editor-inspector-comps"></div>
      <div class="sim-editor-inspector-status" hidden></div>
    `;
    panel.querySelector('[data-action="apply"]').addEventListener('click', () => this.applyInspector());
    // 편집 중 키 입력이 편집 단축키(W/E/R·Delete)로 새지 않게 차단
    panel.addEventListener('keydown', (e) => e.stopPropagation());
    return panel;
  }

  // 트랜스폼 입력칸만 현재 값으로 갱신(포커스 중인 칸은 건드리지 않음)
  refreshInspectorTransform() {
    const simObject = this.getSelectedSimObject();
    if (!this.inspector || this.inspector.hidden || !simObject) return;
    const r = simObject.root;
    const deg = 180 / Math.PI;
    const vals = {
      p0: r.position.x, p1: r.position.y, p2: r.position.z,
      r0: r.rotation.x * deg, r1: r.rotation.y * deg, r2: r.rotation.z * deg,
      s0: r.scale.x, s1: r.scale.y, s2: r.scale.z,
    };
    Object.entries(vals).forEach(([key, v]) => {
      const el = this.inspector.querySelector(`[data-tf="${key}"]`);
      if (el && document.activeElement !== el) el.value = Math.round(v * 1000) / 1000;
    });
  }

  updateInspector() {
    if (!this.inspector) return;
    const simObject = this.getSelectedSimObject();
    const show = this.devMode && !!simObject?.spawned;
    this.inspector.hidden = !show;
    if (!show) return;

    // 씬 선택 패널(.sim-card-head) 바로 아래에 위치
    const head = this.ctx.stage.querySelector('.sim-card-head');
    if (head) {
      const stageRect = this.ctx.stage.getBoundingClientRect();
      const headRect = head.getBoundingClientRect();
      this.inspector.style.top = `${Math.round(headRect.bottom - stageRect.top + 8)}px`;
    }
    this.inspector.querySelector('.sim-editor-inspector-title').textContent = simObject.label;
    this.refreshInspectorTransform();
    this.renderInspectorComponents(simObject);
    this.setInspectorStatus('');
  }

  // 부착된 컴포넌트들을 필드별 입력칸(트랜스폼과 동일한 방식)으로 렌더
  renderInspectorComponents(simObject) {
    const wrap = this.inspector.querySelector('.sim-editor-inspector-comps');
    wrap.textContent = '';
    serializeComponents(simObject).forEach(({ type, fields }) => {
      const sec = document.createElement('div');
      sec.className = 'sim-insp-comp';
      sec.dataset.compType = type;

      const head = document.createElement('div');
      head.className = 'sim-insp-comp-head';
      const title = document.createElement('b');
      title.textContent = type;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.title = `${type} 컴포넌트 제거`;
      removeBtn.textContent = '−';
      removeBtn.addEventListener('click', () => this.detachFromSelected(type));
      head.append(title, removeBtn);
      sec.appendChild(head);

      const specs = FIELD_SPECS[type] || [];
      if (specs.length === 0) {
        const none = document.createElement('div');
        none.className = 'sim-insp-comp-none';
        none.textContent = '필드 없음';
        sec.appendChild(none);
      }
      specs.forEach((spec) => {
        const row = document.createElement('div');
        row.className = 'sim-insp-row';
        const label = document.createElement('span');
        label.textContent = spec.short || spec.key;
        label.title = spec.label;
        row.appendChild(label);
        const value = fields?.[spec.key];
        if (spec.kind === 'vec') {
          for (let i = 0; i < 3; i++) {
            const input = document.createElement('input');
            input.dataset.field = spec.key;
            input.dataset.axis = i;
            input.value = Array.isArray(value) ? value[i] : '';
            if (spec.optional) input.placeholder = '—';
            row.appendChild(input);
          }
        } else if (spec.kind === 'side') {
          const select = document.createElement('select');
          select.dataset.field = spec.key;
          ['left', 'right'].forEach((side) => {
            const o = document.createElement('option');
            o.value = side; o.textContent = side;
            select.appendChild(o);
          });
          select.value = value === 'right' ? 'right' : 'left';
          row.appendChild(select);
        } else {   // int
          const input = document.createElement('input');
          input.dataset.field = spec.key;
          input.value = value ?? spec.def;
          row.appendChild(input);
        }
        sec.appendChild(row);
      });
      wrap.appendChild(sec);
    });
  }

  // 인스펙터의 필드 입력칸들에서 컴포넌트 목록을 수집(빈 vec = 미사용으로 생략)
  collectInspectorComponents() {
    const list = [];
    this.inspector.querySelectorAll('.sim-insp-comp').forEach((sec) => {
      const type = sec.dataset.compType;
      const fields = {};
      (FIELD_SPECS[type] || []).forEach((spec) => {
        if (spec.kind === 'vec') {
          const inputs = sec.querySelectorAll(`[data-field="${spec.key}"]`);
          const raw = Array.from(inputs).map((el) => el.value.trim());
          if (raw.every((v) => v === '')) {
            if (!spec.optional) throw new Error(`${type}.${spec.key} 값이 필요합니다`);
            return;   // 선택 필드 미사용
          }
          fields[spec.key] = raw.map((v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; });
        } else if (spec.kind === 'side') {
          fields[spec.key] = sec.querySelector(`[data-field="${spec.key}"]`)?.value === 'right' ? 'right' : 'left';
        } else {
          const v = parseInt(sec.querySelector(`[data-field="${spec.key}"]`)?.value, 10);
          fields[spec.key] = Math.max(0, Math.min(5, Number.isFinite(v) ? v : 0));
        }
      });
      list.push({ type, fields });
    });
    return list;
  }

  setInspectorStatus(msg, isError = false) {
    const el = this.inspector?.querySelector('.sim-editor-inspector-status');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg;
    el.classList.toggle('error', isError);
  }

  applyInspector() {
    const simObject = this.getSelectedSimObject();
    if (!simObject) return;

    // (1) 트랜스폼(위치·회전°·크기) 적용 — 비어 있거나 숫자가 아니면 현재 값 유지
    const root = simObject.root;
    const num = (key, fallback) => {
      const el = this.inspector.querySelector(`[data-tf="${key}"]`);
      const v = parseFloat(el?.value);
      return Number.isFinite(v) ? v : fallback;
    };
    const rad = Math.PI / 180;
    root.position.set(num('p0', root.position.x), num('p1', root.position.y), num('p2', root.position.z));
    root.rotation.set(num('r0', root.rotation.x / rad) * rad, num('r1', root.rotation.y / rad) * rad, num('r2', root.rotation.z / rad) * rad);
    root.scale.set(num('s0', root.scale.x), num('s1', root.scale.y), num('s2', root.scale.z));

    // (2) 컴포넌트 필드 적용 — 입력칸에서 수집해 재부착
    try {
      const list = this.collectInspectorComponents();
      serializeComponents(simObject).forEach(({ type }) => detachComponent(this.ctx, simObject, type));
      list.forEach((entry) => attachComponent(this.ctx, simObject, entry.type, entry.fields || {}));
      this.select(simObject.root);   // 라벨·인스펙터 갱신
      this.setInspectorStatus(`적용 완료 (${list.length}개 컴포넌트)`);
    } catch (err) {
      this.setInspectorStatus('적용 실패: ' + err.message, true);
    }
  }

  // Hierarchy 항목 길게 클릭 → 이름 변경
  renameObject(simObject) {
    if (!simObject) return;
    const name = prompt('객체 이름:', simObject.label);
    if (name === null || !name.trim()) return;
    simObject.label = name.trim();
    simObject.root.userData.simEditorLabel = simObject.label;
    if (this.ctx.objects) this.ctx.objects.version += 1;
    this.updateHierarchy(true);
    if (this.selected === simObject.root) this.select(simObject.root);   // 툴바·인스펙터 라벨 갱신
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
    this.updateInspector();
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
    if (type === 'glb') {
      return this.spawnGlb(options);
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

  // GLB 파일 경로를 물어 씬에 배치(SIMULATOR.md 1장 — glb 로딩)
  async spawnGlb(options = {}) {
    const url = prompt('GLB 경로 (Web/ 기준):', 'Mesh/LaunchStation.glb');
    if (!url || !url.trim()) { this.hideContextMenu(); return null; }

    const parent = this.getSpawnParentFor(options);
    const worldPoint = this.lastSpawnPoint.clone();
    this.menu.querySelectorAll('button').forEach((btn) => { btn.disabled = true; });
    try {
      const simObject = await createGlbObject(this.ctx, url.trim());
      this.ctx.objects.add(simObject, parent);
      simObject.setWorldPosition(worldPoint, parent);
      this.select(simObject.root);
      this.hideContextMenu();
      this.updateHierarchy(true);
      return simObject.root;
    } catch (err) {
      console.error('GLB 로드 실패:', url, err);
      return null;
    } finally {
      this.menu.querySelectorAll('button').forEach((btn) => { btn.disabled = false; });
      this.updateContextMenuState();
    }
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
    // 짧은 클릭 = 선택, 길게 클릭(600ms) = 이름 변경
    let holdTimer = 0, renamed = false;
    row.addEventListener('pointerdown', () => {
      renamed = false;
      holdTimer = setTimeout(() => {
        renamed = true;
        this.select(simObject.root);
        this.renameObject(simObject);
      }, RENAME_HOLD_MS);
    });
    const cancelHold = () => { clearTimeout(holdTimer); };
    row.addEventListener('pointerup', cancelHold);
    row.addEventListener('pointerleave', cancelHold);
    row.addEventListener('click', () => {
      if (renamed) { renamed = false; return; }   // 길게 클릭 직후의 click 은 무시
      this.select(simObject.root);
    });
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
    if (!event.value) this.refreshInspectorTransform();   // 기즈모 조작 종료 시 입력칸 동기화
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
    this.inspector?.remove();

    if (this.transform) {
      this.transform.removeEventListener('dragging-changed', this.onDraggingChanged);
      this.transform.detach();
      this.transform.dispose?.();
      this.transform.parent?.remove(this.transform);
    }

    this.boxHelper.geometry?.dispose?.();
    this.boxHelper.material?.dispose?.();
    this.boxHelper.parent?.remove(this.boxHelper);

    if (this.devGrids) {
      this.devGrids.traverse((node) => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
      this.devGrids.parent?.remove(this.devGrids);
      this.devGrids = null;
    }
  }
}
