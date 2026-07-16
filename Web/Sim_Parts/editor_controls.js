// ARES Simulation Editor Controls
// Mouse-based object selection, TransformControls gizmos, and a small spawn menu.

import { createPrimitiveObject, createGlbObject, applyObjectColors, applyObjectEdges } from './object_factory.js';
import { COMPONENT_TYPES, attachComponent, detachComponent, serializeComponents } from './components.js';
import { createSpawnedAlbiObjects } from '../Simulation/Simulation_AresRobot.js';

const RENAME_HOLD_MS = 600;   // Hierarchy 항목 길게 클릭 → 이름 변경

// 컴포넌트 필드 정의 — 부착 프롬프트와 인스펙터 편집 UI 가 공유한다.
// kind: int(0~5) | side(left/right) | vec(x,y,z, optional 이면 빈칸=미사용)
const FIELD_SPECS = {
  LED: [{ key: 'led_no', label: 'LED 번호 (0~5)', short: 'LED 번호', def: '0', kind: 'int' }],
  DC: [
    { key: 'axis_rotation', label: 'DC 회전축 x,y,z (부모 좌표계, 체크 해제=미사용)', short: '회전축', def: '0,1,0', kind: 'vec', optional: true },
    { key: 'rotation_offset', label: '회전 기준점 오프셋 x,y,z (객체 로컬 좌표, 체크 해제=원점)', short: '회전 기준', def: '', kind: 'vec', optional: true },
    { key: 'axis_translate', label: 'DC 이동축 x,y,z (부모 좌표계, 체크 해제=미사용)', short: '이동축', def: '', kind: 'vec', optional: true },
  ],
  Servo: [
    { key: 'wheel', label: '바퀴연결 (left/right/neutral — neutral 은 전진=반시계, 선회 차동 없음)', short: '바퀴', def: 'left', kind: 'side' },
    { key: 'axis_rotation', label: '바퀴 스핀축 x,y,z (부모 좌표계, 체크 해제=미사용)', short: '스핀축', def: '1,0,0', kind: 'vec', optional: true },
    { key: 'rotation_offset', label: '스핀축 기준점 오프셋 x,y,z (객체 로컬 좌표, 체크 해제=원점)', short: '스핀 기준', def: '', kind: 'vec', optional: true },
    { key: 'axis_direction', label: '이동 방향 x,y,z (부모 좌표계, 체크 해제=미사용)', short: '이동 방향', def: '', kind: 'vec', optional: true },
    { key: 'axis_turn', label: '선회축 x,y,z (부모 좌표계, 체크 해제=미사용)', short: '선회축', def: '', kind: 'vec', optional: true },
    { key: 'turn_offset', label: '선회축 기준점 오프셋 x,y,z (객체 로컬 좌표, 체크 해제=원점)', short: '선회 기준', def: '', kind: 'vec', optional: true },
  ],
  UltraSonic: [{ key: 'detect_direction', label: '거리 측정 ray 방향 x,y,z (로컬축)', short: 'ray 방향', def: '0,0,1', kind: 'vec' }],
  Magnet: [{ key: 'detection_point', label: '감지점 오프셋 x,y,z (로컬 좌표, 반경 5cm)', short: '감지점', def: '0,0,0', kind: 'vec' }],
  Gun: [
    { key: 'propel_direction', label: '발사 방향 x,y,z (부모 좌표계, 체크 해제=미사용)', short: '발사 방향', def: '0,0,1', kind: 'vec', optional: true },
    { key: 'explosion', label: '연기 발생점 오프셋 x,y,z (체크 해제=미사용)', short: '연기점', def: '', kind: 'vec', optional: true },
  ],
};

const MODES = ['translate', 'rotate', 'scale'];
// (Albi Robot 항목은 제거 — GLB 메뉴의 AlbiStaticLow.glb 로 대체)
const SPAWN_MENU = [
  { type: 'box', label: 'Box' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'cylinder', label: 'Cylinder' },
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
    // 다중 선택(Ctrl+클릭): 2개 이상일 때 활성. 이동(move) 기즈모만 허용하며,
    // 기즈모는 선택 객체들의 중점(multiPivot)에 붙는다.
    this.multiSelection = [];       // 선택된 루트 Object3D 목록
    this._multiOffsets = null;      // 각 객체의 (월드) 중점 대비 오프셋 — 상대 배치 유지용
    this.multiHelpers = [];         // 다중 선택 표시 BoxHelper 들
    this.multiPivot = null;         // 기즈모 부착점(중점) — enabled 일 때 생성
    this.mode = 'translate';
    this.lastSpawnPoint = new this.THREE.Vector3();
    this.hierarchyVersion = -1;
    this.collapsedHierarchy = new Set();   // 하이어라키에서 자식을 접은(collapse) 객체 id 들
    this.axisEdit = null;     // 회전축 편집 상태 { simObject, comp, offsetField, axisField }
    this.axisHandle = null;   // 축 핸들(구 + 축 라인) — 끌어서 회전기준/선회기준을 설정

    this.raycaster = new this.THREE.Raycaster();
    this.pointer = new this.THREE.Vector2();
    this.groundPlane = new this.THREE.Plane(new this.THREE.Vector3(0, 1, 0), 0);

    this.boxHelper = new this.THREE.BoxHelper(new this.THREE.Object3D(), 0xffd24a);
    this.boxHelper.visible = false;
    this.boxHelper.renderOrder = 999;
    this.ctx.scene.add(this.boxHelper);

    this.toolbar = this.createToolbar();
    this.ctx.stage.appendChild(this.toolbar);
    // 회전축/스핀축/선회축 선택 바 — 시뮬레이션 화면 하단 중앙(회전 컴포넌트 선택 시 노출)
    this.axisBar = document.createElement('div');
    this.axisBar.className = 'sim-editor-axisbar';
    this.axisBar.hidden = true;
    this.ctx.stage.appendChild(this.axisBar);
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
    this.onMultiPivotChange = this.onMultiPivotChange.bind(this);

    if (this.enabled) {
      this.transform = new this.TransformControls(this.camera, this.dom);
      this.transform.setMode(this.mode);
      this.transform.setSpace('world');
      this.transform.setSize(0.85);
      this.transform.visible = false;
      this.transform.addEventListener('dragging-changed', this.onDraggingChanged);
      // 다중 선택 이동: 피벗(중점)이 움직일 때 선택 객체들을 같은 오프셋으로 동기화
      this.transform.addEventListener('objectChange', this.onMultiPivotChange);
      this.ctx.scene.add(this.transform);
      this.multiPivot = new this.THREE.Group();
      this.multiPivot.visible = false;
      this.ctx.scene.add(this.multiPivot);
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
      else if (spec.kind === 'side') {
        const side = raw.toLowerCase();
        fields[spec.key] = side === 'right' ? 'right' : (side === 'neutral' ? 'neutral' : 'left');
      }
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
    // 개발자 모드 시각 표식 — 스테이지 배경(짙은 회색)·노란 테두리는 CSS(.sim-devmode)가 담당
    this.ctx.stage?.classList?.toggle('sim-devmode', this.devMode);
    this.toolbar.hidden = !this.devMode;
    this.hierarchy.hidden = !this.devMode;
    this.hideContextMenu();
    if (this.glbMenu) this.glbMenu.hidden = true;
    if (this.devMode) this.ensureDevGrids();
    if (this.devGrids) this.devGrids.visible = this.devMode;
    // 사용자 모드에서만 체커 바닥을 보인다(개발자 모드는 devGrids 로 대체).
    this.ctx.setCheckerFloorVisible?.(!this.devMode);
    if (!this.devMode) this.select(null);
    else this.updateHierarchy(true);
    this.updateAxisButtons(this.getSelectedSimObject());
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
      <div class="sim-editor-inspector-colors" hidden>
        <span>기본색</span><input data-col="b0" title="R (0~1)"><input data-col="b1" title="G (0~1)"><input data-col="b2" title="B (0~1)"><input data-col="b3" title="A — 불투명도 (0~1)">
        <span>발광색</span><input data-col="e0" title="R (0~1)"><input data-col="e1" title="G (0~1)"><input data-col="e2" title="B (0~1)"><input data-col="e3" title="A — 발광 시 불투명도 (0~1)">
        <label class="sim-editor-edge-toggle" hidden><input type="checkbox" data-edge> 에지 표시 <small>(회전 확인용 · 기본색 보색)</small></label>
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
    this.refreshInspectorColors(simObject);
    this.renderInspectorComponents(simObject);
    this.setInspectorStatus('');
  }

  // 색상 입력칸(기본색·발광색 r,g,b,a) 갱신 — 색상 지원 객체(박스·구)만 노출
  refreshInspectorColors(simObject) {
    const wrap = this.inspector?.querySelector('.sim-editor-inspector-colors');
    if (!wrap) return;
    const colors = simObject?.metadata?.colors;
    wrap.hidden = !colors;
    if (!colors) return;
    const vals = {
      b0: colors.base[0], b1: colors.base[1], b2: colors.base[2], b3: colors.base[3],
      e0: colors.emissive[0], e1: colors.emissive[1], e2: colors.emissive[2], e3: colors.emissive[3],
    };
    Object.entries(vals).forEach(([key, v]) => {
      const el = wrap.querySelector(`[data-col="${key}"]`);
      if (el && document.activeElement !== el) el.value = Math.round((v ?? 0) * 1000) / 1000;
    });
    // 에지 표시 토글 — 지원 객체(원기둥·박스)에서만 노출
    const edgeLabel = wrap.querySelector('.sim-editor-edge-toggle');
    const edgeBox = wrap.querySelector('[data-edge]');
    if (edgeLabel && edgeBox) {
      edgeLabel.hidden = !simObject.metadata?.canEdges;
      edgeBox.checked = !!simObject.metadata?.edges;
    }
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
        const value = fields?.[spec.key];
        // 선두 사용 여부 칸 — 선택 벡터 필드만 체크박스, 그 외는 정렬용 스페이서.
        // 체크 해제 = 해당 벡터를 직렬화에서 제외(사용하지 않음).
        if (spec.kind === 'vec' && spec.optional) {
          const use = document.createElement('input');
          use.type = 'checkbox';
          use.className = 'sim-insp-use';
          use.dataset.use = spec.key;
          use.checked = Array.isArray(value);
          use.title = `${spec.short || spec.key} — 체크 해제 시 사용하지 않음`;
          use.addEventListener('change', () => {
            const inputs = row.querySelectorAll(`[data-field="${spec.key}"]`);
            inputs.forEach((el) => { el.disabled = !use.checked; });
            // 켰는데 전부 빈칸이면 기본값(없으면 0,0,0)으로 채워 바로 쓸 수 있게 한다
            if (use.checked && Array.from(inputs).every((el) => el.value.trim() === '')) {
              const def = (spec.def || '0,0,0').split(',');
              inputs.forEach((el, i) => { el.value = def[i] ?? '0'; });
            }
          });
          row.appendChild(use);
        } else {
          row.appendChild(document.createElement('i'));
        }
        const label = document.createElement('span');
        label.textContent = spec.short || spec.key;
        label.title = spec.label;
        row.appendChild(label);
        if (spec.kind === 'vec') {
          for (let i = 0; i < 3; i++) {
            const input = document.createElement('input');
            input.dataset.field = spec.key;
            input.dataset.axis = i;
            input.value = Array.isArray(value) ? value[i] : '';
            if (spec.optional) {
              input.placeholder = '—';
              input.disabled = !Array.isArray(value);   // 미사용 상태면 비활성
            }
            row.appendChild(input);
          }
        } else if (spec.kind === 'side') {
          const select = document.createElement('select');
          select.dataset.field = spec.key;
          ['left', 'right', 'neutral'].forEach((side) => {
            const o = document.createElement('option');
            o.value = side; o.textContent = side;
            select.appendChild(o);
          });
          select.value = ['right', 'neutral'].includes(value) ? value : 'left';
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

  // 인스펙터의 필드 입력칸들에서 컴포넌트 목록을 수집
  // (선택 vec = 체크 해제 시 생략, 빈칸 전체도 미사용으로 생략)
  collectInspectorComponents() {
    const list = [];
    this.inspector.querySelectorAll('.sim-insp-comp').forEach((sec) => {
      const type = sec.dataset.compType;
      const fields = {};
      (FIELD_SPECS[type] || []).forEach((spec) => {
        if (spec.kind === 'vec') {
          if (spec.optional) {
            const use = sec.querySelector(`[data-use="${spec.key}"]`);
            if (use && !use.checked) return;   // 체크 해제 = 사용하지 않음
          }
          const inputs = sec.querySelectorAll(`[data-field="${spec.key}"]`);
          const raw = Array.from(inputs).map((el) => el.value.trim());
          if (raw.every((v) => v === '')) {
            if (!spec.optional) throw new Error(`${type}.${spec.key} 값이 필요합니다`);
            return;   // 선택 필드 미사용
          }
          fields[spec.key] = raw.map((v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; });
        } else if (spec.kind === 'side') {
          const side = sec.querySelector(`[data-field="${spec.key}"]`)?.value;
          fields[spec.key] = ['right', 'neutral'].includes(side) ? side : 'left';
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

    // (2) 색상(기본색·발광색 r,g,b,a) 적용 — 색상 지원 객체(박스·구)만. 값은 0~1 로 클램프
    const colors = simObject.metadata?.colors;
    if (colors) {
      const col = (key, fallback) => {
        const el = this.inspector.querySelector(`[data-col="${key}"]`);
        const v = parseFloat(el?.value);
        return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
      };
      colors.base = [col('b0', colors.base[0]), col('b1', colors.base[1]), col('b2', colors.base[2]), col('b3', colors.base[3])];
      colors.emissive = [col('e0', colors.emissive[0]), col('e1', colors.emissive[1]), col('e2', colors.emissive[2]), col('e3', colors.emissive[3])];
      applyObjectColors(simObject);
    }

    // (2.5) 에지 표시 토글 적용 (지원 객체만) — 켜면 기본색 보색 선을 덧그린다
    if (simObject.metadata?.canEdges) {
      const edgeBox = this.inspector.querySelector('[data-edge]');
      simObject.metadata.edges = !!edgeBox?.checked;
      applyObjectEdges(this.ctx, simObject);
    }

    // (3) 컴포넌트 필드 적용 — 입력칸에서 수집해 재부착
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
    // 다중 선택 멤버가 삭제되면 목록을 재구성(2개 미만이면 단일/해제로 붕괴)
    if (this.multiSelection.includes(object)) {
      const rest = this.multiSelection.filter((o) => o !== object);
      if (rest.length >= 2) this.applyMultiSelection(rest);
      else this.select(rest[0] || null);
    }
    if (this.selected === object) this.select(null);
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    if (this.isMultiActive() && mode !== 'translate') return;   // 다중 선택은 이동만
    this.stopAxisEdit();   // 이동/회전/크기 모드로 돌아오면 축 편집 종료

    this.mode = mode;
    if (this.transform) this.transform.setMode(mode);

    this.toolbar.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
  }

  select(object) {
    this.stopAxisEdit();
    this.clearMultiSelection();     // 일반 선택은 다중 선택을 해제한다
    this.selected = object || null;

    // 선택이 접힌 조상 밑에 있으면, 보이도록 조상들을 펼친다(선택 변경 시에만 — 수동 접기와 충돌 방지)
    const selForExpand = this.getSelectedSimObject();
    if (selForExpand && this.collapsedHierarchy.size) {
      for (let pa = this.ctx.objects.getParentOf(selForExpand); pa; pa = this.ctx.objects.getParentOf(pa)) {
        this.collapsedHierarchy.delete(pa.id);
      }
    }

    if (this.selected && this.transform) {
      this.transform.setMode(this.mode);   // 다중 선택이 translate 로 강제했던 것 복원
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
    this.updateAxisButtons(simObject);
    this.updateHierarchy(true);
    this.updateInspector();
  }

  // ==== 다중 선택 (Ctrl+클릭, 2026-07-13) ====
  // 2개 이상 선택되면 활성. 기즈모는 선택 객체들의 중점(multiPivot)에 붙고
  // 이동(translate)만 허용한다. Ctrl+V 는 선택 전체를 복제한다.
  isMultiActive() { return this.multiSelection.length >= 2; }

  isSelectedRoot(root) {
    return this.selected === root || this.multiSelection.includes(root);
  }

  toggleMultiSelect(root) {
    if (!root) return;
    let list = this.multiSelection.slice();
    // 단일 선택 상태에서 Ctrl+클릭으로 시작하면 기존 선택을 목록에 승격
    if (!list.length && this.selected && this.selected !== root) list = [this.selected];
    const idx = list.indexOf(root);
    if (idx >= 0) list.splice(idx, 1); else list.push(root);
    if (list.length >= 2) this.applyMultiSelection(list);
    else this.select(list[0] || null);
  }

  applyMultiSelection(list) {
    const THREE = this.THREE;
    this.stopAxisEdit();
    this.clearMultiSelection();
    this.selected = null;
    this.multiSelection = list;

    // 중점 = 각 객체 바운딩 박스 중심의 평균 (빈 박스는 월드 위치로 폴백)
    const centroid = new THREE.Vector3();
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    list.forEach((root) => {
      box.setFromObject(root);
      if (box.isEmpty()) root.getWorldPosition(center); else box.getCenter(center);
      centroid.add(center);
      const helper = new THREE.BoxHelper(root, 0xffd24a);
      helper.renderOrder = 999;
      this.ctx.scene.add(helper);
      this.multiHelpers.push(helper);
    });
    centroid.divideScalar(list.length);

    // 각 객체의 월드 위치 오프셋을 저장 — 피벗 이동 시 상대 배치를 유지한다
    this._multiOffsets = list.map((root) => {
      const p = new THREE.Vector3();
      root.getWorldPosition(p);
      return p.sub(centroid);
    });

    if (this.multiPivot && this.transform) {
      this.multiPivot.position.copy(centroid);
      this.transform.setMode('translate');    // move 기즈모만
      this.transform.attach(this.multiPivot);
      this.transform.visible = true;
    }
    this.boxHelper.visible = false;

    const text = this.toolbar.querySelector('.sim-editor-selection');
    if (text) text.textContent = `다중 선택 ${list.length}개 — 이동만 가능`;
    this.updateAxisButtons(null);
    this.updateHierarchy(true);
    this.updateInspector();
  }

  clearMultiSelection() {
    if (this.transform && this.multiPivot && this.transform.object === this.multiPivot) {
      this.transform.detach();
      this.transform.visible = false;
    }
    this.multiSelection = [];
    this._multiOffsets = null;
    this.multiHelpers.forEach((h) => {
      this.ctx.scene.remove(h);
      h.geometry?.dispose?.();
      h.material?.dispose?.();
    });
    this.multiHelpers = [];
  }

  onMultiPivotChange() {
    if (!this.isMultiActive() || !this._multiOffsets) return;
    if (!this.transform || this.transform.object !== this.multiPivot) return;
    const target = new this.THREE.Vector3();
    this.multiSelection.forEach((root, i) => {
      target.copy(this.multiPivot.position).add(this._multiOffsets[i]);
      if (root.parent) root.parent.worldToLocal(target);
      root.position.copy(target);
    });
  }

  // ==== 회전축 편집 (2026-07-09) — 회전 특성 컴포넌트를 가진 객체 선택 시 하단 바에
  // 축 버튼이 나타나고, 핸들을 끌어 옮긴 위치가 회전기준(rotation_offset)·
  // 선회기준(turn_offset) 값이 된다(**객체 로컬 좌표**로 저장 — 변환 상태와 무관). ====
  getAxisEditEntries(simObject) {
    const entries = [];
    const dc = simObject?.components?.DC;
    if (dc?.fields?.axis_rotation) {
      entries.push({ comp: 'DC', label: '회전축', axisField: 'axis_rotation', offsetField: 'rotation_offset' });
    }
    const sv = simObject?.components?.Servo;
    if (sv?.fields?.axis_rotation) {
      entries.push({ comp: 'Servo', label: '스핀축', axisField: 'axis_rotation', offsetField: 'rotation_offset' });
    }
    if (sv?.fields?.axis_turn) {
      entries.push({ comp: 'Servo', label: '선회축', axisField: 'axis_turn', offsetField: 'turn_offset' });
    }
    return entries;
  }

  updateAxisButtons(simObject) {
    const wrap = this.axisBar;
    if (!wrap) return;
    wrap.textContent = '';
    const entries = this.getAxisEditEntries(simObject);
    wrap.hidden = !this.devMode || entries.length === 0;
    entries.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = entry.label;
      btn.title = `${entry.comp} ${entry.label} 옮기기 — 끌어 놓은 위치가 기준점 오프셋이 된다`;
      const active = this.axisEdit && this.axisEdit.comp === entry.comp && this.axisEdit.offsetField === entry.offsetField;
      btn.setAttribute('aria-pressed', String(!!active));
      btn.addEventListener('click', () => {
        if (this.axisEdit && this.axisEdit.comp === entry.comp && this.axisEdit.offsetField === entry.offsetField) {
          this.stopAxisEdit();
        } else {
          this.startAxisEdit(entry);
        }
        this.updateAxisButtons(this.getSelectedSimObject());
      });
      wrap.appendChild(btn);
    });
  }

  ensureAxisHandle() {
    if (this.axisHandle) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = 'sim-axis-handle';
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    sphere.renderOrder = 998;
    this.axisLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd24a, depthTest: false, transparent: true, opacity: 0.75 }),
    );
    this.axisLine.renderOrder = 998;
    group.add(sphere, this.axisLine);
    this.axisHandle = group;
  }

  // 핸들을 실제 회전 기준점과 같은 위치에 배치하고 축 라인을 그린다.
  // 기준점은 객체에 붙은 재질점(pivotLocal)이라, 객체가 회전해도 축이 지나는 점은
  // 공간에 고정된다 — 오프셋 필드값을 그대로 더하면 회전 중 그림이 따라 돌아 틀린다.
  syncAxisHandle() {
    if (!this.axisEdit || !this.axisHandle) return;
    const { simObject, comp, offsetField, axisField } = this.axisEdit;
    const component = simObject.components?.[comp];
    const fields = component?.fields;
    if (!fields) { this.stopAxisEdit(); return; }
    const pivotLocal = component.getPivotLocal?.(offsetField) || null;
    const p = simObject.root.position;
    if (pivotLocal) {
      this.axisHandle.position
        .copy(pivotLocal)
        .applyQuaternion(simObject.root.quaternion)
        .add(p);
    } else {
      this.axisHandle.position.copy(p);   // 오프셋 미사용 — 객체 원점을 지나는 축
    }
    const a = fields[axisField];
    const dir = new this.THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0);
    if (dir.lengthSq() > 1e-12) {
      dir.normalize();
      this.axisLine.geometry.setFromPoints([dir.clone().multiplyScalar(-1.5), dir.clone().multiplyScalar(1.5)]);
      this.axisLine.visible = true;
    } else {
      this.axisLine.visible = false;
    }
  }

  startAxisEdit(entry) {
    const simObject = this.getSelectedSimObject();
    if (!simObject || !this.transform) return;
    this.stopAxisEdit();
    this.axisEdit = { simObject, ...entry };
    this.ensureAxisHandle();
    (simObject.root.parent || this.ctx.scene).add(this.axisHandle);
    this.syncAxisHandle();
    this.transform.attach(this.axisHandle);
    this.transform.setMode('translate');   // 축 옮기기는 이동 기즈모로만
  }

  stopAxisEdit() {
    if (!this.axisEdit) return;
    this.axisEdit = null;
    this.axisHandle?.parent?.remove(this.axisHandle);
    if (this.transform) {
      if (this.selected) {
        this.transform.attach(this.selected);
      } else {
        this.transform.detach();
        this.transform.visible = false;
      }
      this.transform.setMode(this.mode);
    }
    this.updateAxisButtons(this.getSelectedSimObject());
  }

  // 핸들 드롭 → 새 오프셋을 **객체 로컬 좌표**로 변환해 컴포넌트 필드에 반영.
  // 로컬로 저장하므로 객체가 어떤 변환 상태여도 축은 항상 같은 자리에 놓인다.
  applyAxisHandleDrop() {
    if (!this.axisEdit || !this.axisHandle) return;
    const { simObject, comp, offsetField } = this.axisEdit;
    const cmp = simObject.components?.[comp];
    if (!cmp) { this.stopAxisEdit(); return; }
    const root = simObject.root;
    const round3 = (v) => Math.round(v * 1000) / 1000;
    const offLocal = this.axisHandle.position.clone()
      .sub(root.position)
      .applyQuaternion(root.quaternion.clone().invert());
    const off = [round3(offLocal.x), round3(offLocal.y), round3(offLocal.z)];
    const fields = { ...cmp.fields };
    if (off.every((v) => v === 0)) delete fields[offsetField];   // 원점 = 오프셋 미사용
    else fields[offsetField] = off;
    attachComponent(this.ctx, simObject, comp, fields);
    this.syncAxisHandle();
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

  // GLB 스폰(SIMULATOR.md 1장 — glb 로딩) — Web/Mesh 의 자산 목록(Mesh/manifest.json)에서
  // 골라 배치한다. 씬 파일에는 선택한 상대경로(url)가 그대로 기록된다.
  async spawnGlb(options = {}) {
    this.hideContextMenu();
    let models = this.glbModels;
    if (!models) {
      try {
        const res = await fetch('Mesh/manifest.json', { cache: 'no-store' });
        const json = res.ok ? await res.json() : null;
        models = Array.isArray(json?.models) ? json.models : null;
      } catch { models = null; }
      this.glbModels = models;
    }
    if (!models || models.length === 0) {
      // 매니페스트가 없으면 경로 직접 입력으로 폴백
      const url = prompt('GLB 경로 (Web/ 기준):', 'Mesh/LaunchStation.glb');
      if (url && url.trim()) return this.spawnGlbFile(url.trim(), null, options);
      return null;
    }
    this.showGlbMenu(models, options);
    return null;
  }

  // Mesh/ GLB 선택 메뉴 — 컨텍스트 메뉴와 동일한 스타일로 파일 목록을 띄운다
  showGlbMenu(models, options) {
    if (!this.glbMenu) {
      this.glbMenu = document.createElement('div');
      this.glbMenu.className = 'sim-editor-context-menu sim-editor-glb-menu';
      this.glbMenu.hidden = true;
      this.ctx.stage.appendChild(this.glbMenu);
    }
    const menu = this.glbMenu;
    menu.textContent = '';
    const title = document.createElement('div');
    title.className = 'sim-editor-context-title';
    title.textContent = 'GLB 모델 (Web/Mesh)';
    menu.appendChild(title);
    models.forEach((m) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      // 파일명을 그대로 표시·사용한다(객체 라벨 = 파일명). 한글 설명은 툴팁으로.
      btn.textContent = m.url.split('/').pop();
      btn.title = m.label ? `${m.label} — ${m.url}` : m.url;
      btn.addEventListener('click', () => {
        menu.hidden = true;
        this.spawnGlbFile(m.url, null, options);
      });
      menu.appendChild(btn);
    });
    // 직전 컨텍스트 메뉴 위치 근처에 표시
    menu.style.left = this.menu.style.left || '12px';
    menu.style.top = this.menu.style.top || '12px';
    menu.hidden = false;
  }

  async spawnGlbFile(url, label, options = {}) {
    const parent = this.getSpawnParentFor(options);
    const worldPoint = this.lastSpawnPoint.clone();
    try {
      const simObject = await createGlbObject(this.ctx, url, label || undefined);
      this.ctx.objects.add(simObject, parent);
      simObject.setWorldPosition(worldPoint, parent);
      this.select(simObject.root);
      this.updateHierarchy(true);
      return simObject.root;
    } catch (err) {
      console.error('GLB 로드 실패:', url, err);
      return null;
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

  // Ctrl+V — 선택 객체를 복제해 원본과 같은 부모의 형제(sibling)로 만든다.
  // 라벨은 `원본_dup`, 위치는 원본 바운딩 박스의 x 폭만큼 +x 이동. 하위 객체·컴포넌트도 함께 복제.
  async duplicateSelected() {
    const source = this.getSelectedSimObject();
    if (!source?.spawned) return;

    // 원본이 실제로 붙어 있는 부모(최상위면 worldGroup, 하위면 부모의 자식 홀더)에
    // 그대로 붙여야 동일 부모의 sibling 이 된다.
    const parent = source.root.parent || this.getSpawnParent();
    const clone = await this.cloneObjectTree(source, parent, true);
    if (!clone) return;

    this.select(clone.root);
    this.updateHierarchy(true);
  }

  // 다중 선택 Ctrl+V — 선택된 모든 객체를 각각 개별 복제와 같은 규약(라벨 `_dup`,
  // 동일 부모의 sibling, 바운딩 박스 x 폭 오프셋)으로 복제한다.
  async duplicateMultiSelected() {
    const roots = new Set(this.multiSelection);
    const sources = this.multiSelection
      .map((root) => this.ctx.objects?.getByRoot(root))
      .filter((s) => s?.spawned)
      // 조상이 함께 선택된 객체는 조상 복제에 하위로 포함되므로 별도 복제하지 않는다
      .filter((s) => {
        let p = s.root.parent;
        while (p) { if (roots.has(p)) return false; p = p.parent; }
        return true;
      });
    if (!sources.length) return;

    const clones = [];
    for (const source of sources) {
      const parent = source.root.parent || this.getSpawnParent();
      const clone = await this.cloneObjectTree(source, parent, true);
      if (clone) clones.push(clone.root);
    }
    // 복제본들을 새 다중 선택으로 — 연속 Ctrl+V 로 격자처럼 늘려갈 수 있다
    if (clones.length >= 2) this.applyMultiSelection(clones);
    else if (clones.length === 1) this.select(clones[0]);
    this.updateHierarchy(true);
  }

  // 복제 위치 오프셋 — 고정 +1 이 아니라 원본 바운딩 박스의 x 폭만큼 이동한다.
  // Box3 는 월드 기준이므로 부모의 월드 스케일로 나눠 부모 좌표계 단위로 환산.
  getCloneOffsetX(source) {
    const THREE = this.THREE;
    try {
      const box = new THREE.Box3().setFromObject(source.root);
      if (!box.isEmpty()) {
        let width = box.getSize(new THREE.Vector3()).x;
        const parent = source.root.parent;
        if (parent) {
          const ps = parent.getWorldScale(new THREE.Vector3());
          if (ps.x > 1e-6) width /= ps.x;
        }
        if (Number.isFinite(width) && width > 1e-4) return width;
      }
    } catch { /* 폴백 아래 */ }
    return 1;
  }

  // 씬 로드(applyScene)와 같은 방식으로 타입별 재생성 → 트랜스폼·라벨·컴포넌트 복사.
  // isTop 인 최상위만 _dup 라벨과 바운딩 박스 x 폭 오프셋을 받고, 하위는 원본 그대로 재귀 복제한다.
  async cloneObjectTree(source, parent, isTop) {
    let sim = null;
    try {
      if (source.type === 'albi-body') {
        const list = await createSpawnedAlbiObjects(this.ctx);
        sim = list[0];
        this.ctx.objects.add(sim, parent);
        list.slice(1).forEach((child) => this.ctx.objects.add(child, sim.root));
      } else if (source.type === 'glb') {
        if (!source.metadata?.glbUrl) return null;
        sim = await createGlbObject(this.ctx, source.metadata.glbUrl, source.label);
        this.ctx.objects.add(sim, parent);
      } else {
        sim = createPrimitiveObject(this.ctx, source.type);
        this.ctx.objects.add(sim, parent);
      }
    } catch (err) {
      console.error('객체 복제 실패:', source.label, err);
      return null;
    }

    sim.label = isTop ? `${source.label}_dup` : source.label;
    sim.root.userData.simEditorLabel = sim.label;
    sim.root.position.copy(source.root.position);
    sim.root.quaternion.copy(source.root.quaternion);
    sim.root.scale.copy(source.root.scale);
    if (isTop) sim.root.position.x += this.getCloneOffsetX(source);
    if (source.metadata?.colors && sim.metadata?.colors) {
      sim.metadata.colors.base = [...source.metadata.colors.base];
      sim.metadata.colors.emissive = [...source.metadata.colors.emissive];
      applyObjectColors(sim);
    }
    if (source.metadata?.edges && sim.metadata?.canEdges) {
      sim.metadata.edges = true;
      applyObjectEdges(this.ctx, sim);   // 에지 표시도 함께 복제
    }

    serializeComponents(source).forEach(({ type, fields }) => {
      try { attachComponent(this.ctx, sim, type, fields || {}); }
      catch (err) { console.warn('컴포넌트 복제 실패:', type, err); }
    });

    // 하위 객체 재귀 복제 — 알비 스폰 시 자동 생성되는 LED 는 위에서 이미 만들어졌으니 제외
    for (const child of this.ctx.objects.getChildrenOf(source)) {
      if (child.type === 'albi-led') continue;
      await this.cloneObjectTree(child, sim.root, false);
    }
    return sim;
  }

  onKeyDown(event) {
    if (!this.devMode) return;
    if (event.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(event.target.tagName)) return;

    // Ctrl+V — 선택 객체 복제(Ctrl+D 는 브라우저 북마크 단축키라 가로채지 못해 V 사용)
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v') {
      if (this.isMultiActive()) {
        event.preventDefault();
        this.duplicateMultiSelected();
        return;
      }
      if (this.getSelectedSimObject()?.spawned) {
        event.preventDefault();
        this.duplicateSelected();
      }
      return;
    }
    // Ctrl+E(개발자 모드 토글) 등 다른 조합키는 편집 단축키(W/E/R)와 충돌하지 않게 무시
    if (event.ctrlKey || event.metaKey || event.altKey) return;

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
      // Ctrl+클릭 = 다중 선택 토글 (기존 단일 선택이 있으면 함께 목록으로 승격)
      if (event.ctrlKey || event.metaKey) this.toggleMultiSelect(picked);
      else this.select(picked);
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
    row.setAttribute('aria-pressed', String(this.isSelectedRoot(simObject.root)));

    // 접기/펼치기 토글 — 자식이 있으면 +/−, 없으면 빈 자리(정렬 유지)
    const children = this.ctx.objects.getChildrenOf(simObject);
    const hasChildren = children.length > 0;
    const collapsed = hasChildren && this.collapsedHierarchy.has(simObject.id);
    const toggle = document.createElement('span');
    toggle.className = 'sim-editor-hierarchy-toggle' + (hasChildren ? '' : ' is-leaf');
    toggle.dataset.role = hasChildren ? 'toggle' : 'leaf';
    toggle.textContent = hasChildren ? (collapsed ? '+' : '−') : '';
    if (hasChildren) toggle.title = collapsed ? '자식 펼치기' : '자식 접기';

    const type = document.createElement('span');
    type.className = 'sim-editor-hierarchy-type';
    type.textContent = simObject.type;

    const label = document.createElement('span');
    label.className = 'sim-editor-hierarchy-label';
    label.textContent = simObject.label;

    row.append(toggle, type, label);
    const isToggleTarget = (ev) => ev.target?.closest?.('[data-role="toggle"]');
    // 짧은 클릭 = 선택, 길게 클릭(600ms) = 이름 변경
    let holdTimer = 0, renamed = false;
    row.addEventListener('pointerdown', (event) => {
      if (isToggleTarget(event)) return;   // 토글 클릭은 선택/이름변경 타이머를 시작하지 않음
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
    row.addEventListener('click', (event) => {
      if (isToggleTarget(event)) {                 // +/− 클릭 = 자식 접기/펼치기(선택 안 함)
        event.stopPropagation();
        this.toggleHierarchyCollapse(simObject.id);
        return;
      }
      if (renamed) { renamed = false; return; }   // 길게 클릭 직후의 click 은 무시
      // Hierarchy 에서도 Ctrl+클릭으로 다중 선택 토글
      if (event.ctrlKey || event.metaKey) { this.toggleMultiSelect(simObject.root); return; }
      this.select(simObject.root);
    });

    // ── 드래그앤드롭 재부모화(2026-07-16) — 스폰 객체를 다른 객체 위에 놓으면
    //    그 객체의 자식이 된다(끌려가는 객체의 하위 트리는 함께 이동). ──
    if (simObject.spawned) {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        cancelHold();                              // 드래그 중 이름변경 타이머 방지
        this._dragSimId = simObject.id;
        row.classList.add('is-dragging');
        try { e.dataTransfer.setData('text/plain', simObject.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
      });
      row.addEventListener('dragend', () => {
        this._dragSimId = null;
        this.hierarchy?.querySelectorAll('.is-dragging, .drop-target')
          .forEach((el) => el.classList.remove('is-dragging', 'drop-target'));
      });
    }
    // 모든 행은 드롭 대상이 될 수 있다(자기 자신/후손 위로는 reparent 가 무시).
    row.addEventListener('dragover', (e) => {
      if (!this._dragSimId || this._dragSimId === simObject.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();                         // 리스트 배경(루트로 이동)보다 우선
      row.classList.remove('drop-target');
      const draggedId = this._dragSimId || e.dataTransfer.getData('text/plain');
      this.reparentInHierarchy(draggedId, simObject.id);
    });

    list.appendChild(row);

    if (!collapsed) {
      children.forEach((child) => this.renderHierarchyItem(child, depth + 1, list));
    }
  }

  // 자식 접기/펼치기 상태 토글 후 하이어라키 다시 그림
  toggleHierarchyCollapse(id) {
    if (this.collapsedHierarchy.has(id)) this.collapsedHierarchy.delete(id);
    else this.collapsedHierarchy.add(id);
    this.updateHierarchy(true);
  }

  // 드래그한 객체(draggedId)를 targetId 의 자식으로 옮긴다. target 이 없으면(빈 공간
  // 드롭) 최상위로 이동. 월드 트랜스폼을 보존(attach)해 화면상 위치가 튀지 않으며,
  // 끌려가는 객체의 하위 트리는 씬 그래프상 그 밑에 있으므로 함께 따라온다.
  reparentInHierarchy(draggedId, targetId) {
    const reg = this.ctx.objects;
    const dragged = reg?.items.find((o) => o.id === draggedId);
    if (!dragged?.spawned) return;
    const target = targetId ? reg.items.find((o) => o.id === targetId) : null;
    if (target && target === dragged) return;

    // 순환 방지 — target 이 dragged 의 후손이면 거부(자기 밑으로 자기 이동 불가)
    for (let p = target; p; p = reg.getParentOf(p)) {
      if (p === dragged) { this.ctx.logLine?.('그 객체의 하위로는 옮길 수 없어요', 'err'); return; }
    }
    // 이미 같은 부모면 no-op
    if (reg.getParentOf(dragged) === target) return;

    const attachTo = target ? reg.getAttachPointFor(target) : (this.ctx.worldGroup || this.ctx.scene);
    attachTo.updateWorldMatrix(true, false);
    attachTo.attach(dragged.root);                 // 월드 트랜스폼 보존 재부모화
    reg.version += 1;
    this.select(dragged.root);
    this.updateHierarchy(true);
    this.ctx.logLine?.(target ? `'${dragged.label}' → '${target.label}' 자식으로 이동` : `'${dragged.label}' 최상위로 이동`, 'sys');
  }

  updateHierarchy(force = false) {
    if (!this.hierarchy) return;
    const version = this.ctx.objects?.version ?? 0;
    if (!force && this.hierarchyVersion === version) return;
    this.hierarchyVersion = version;

    const list = this.hierarchy.querySelector('.sim-editor-hierarchy-list');
    if (!list) return;
    // 리스트 배경(행이 아닌 곳)에 드롭 = 최상위로 이동. 행 drop 은 stopPropagation 으로 우선.
    if (!list._dropWired) {
      list._dropWired = true;
      list.addEventListener('dragover', (e) => { if (this._dragSimId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
      list.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedId = this._dragSimId || e.dataTransfer.getData('text/plain');
        this.reparentInHierarchy(draggedId, null);
      });
    }
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
    if (this.glbMenu && !this.glbMenu.hidden && !this.glbMenu.contains(event.target)) {
      this.glbMenu.hidden = true;
    }
    if (this.menu.hidden || this.menu.contains(event.target) || event.target === this.dom) return;
    this.hideContextMenu();
  }

  onDraggingChanged(event) {
    this.orbit.enabled = !event.value;
    if (!event.value) {
      if (this.axisEdit) this.applyAxisHandleDrop();       // 축 핸들 드롭 → 기준점 오프셋 반영
      this.refreshInspectorTransform();                    // 기즈모 조작 종료 시 입력칸 동기화
    }
  }

  update() {
    if (this.selected) this.boxHelper.setFromObject(this.selected);
    if (this.isMultiActive()) this.multiHelpers.forEach((h) => h.update());  // 이동을 따라감
    if (this.axisEdit && !this.transform?.dragging) this.syncAxisHandle();   // 객체 이동을 따라감
    this.updateHierarchy();
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    this.toolbar?.remove();
    this.axisBar?.remove();
    this.menu?.remove();
    this.glbMenu?.remove();
    this.hierarchy?.remove();
    this.inspector?.remove();

    if (this.transform) {
      this.transform.removeEventListener('dragging-changed', this.onDraggingChanged);
      this.transform.removeEventListener('objectChange', this.onMultiPivotChange);
      this.transform.detach();
      this.transform.dispose?.();
      this.transform.parent?.remove(this.transform);
    }

    this.clearMultiSelection();
    if (this.multiPivot) {
      this.multiPivot.parent?.remove(this.multiPivot);
      this.multiPivot = null;
    }

    this.boxHelper.geometry?.dispose?.();
    this.boxHelper.material?.dispose?.();
    this.boxHelper.parent?.remove(this.boxHelper);

    if (this.axisHandle) {
      this.axisHandle.traverse((node) => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
      this.axisHandle.parent?.remove(this.axisHandle);
      this.axisHandle = null;
    }

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
