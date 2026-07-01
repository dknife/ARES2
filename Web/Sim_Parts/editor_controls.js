// ARES Simulation Editor Controls
// Signature: Codex assisted implementation for mouse-based 3D object editing.
// three.js TransformControls를 사용해 Unity와 비슷한 이동/회전/스케일 기즈모를 제공합니다.

const MODES = ['translate', 'rotate', 'scale'];

export class EditorControls {
  constructor(ctx) {
    // SimContext에서 생성한 three.js 객체를 공유합니다.
    // 별도 렌더러를 만들지 않고 현재 시뮬레이션 캔버스 위에 에디터 기능만 얹습니다.
    this.ctx = ctx;
    this.THREE = ctx.THREE;
    this.A = ctx.A;
    this.camera = ctx.camera;
    this.dom = ctx.renderer.domElement;
    this.orbit = ctx.controls;

    // TransformControls가 번들에 없으면 에디터 기능만 조용히 비활성화합니다.
    // 이 경우 기존 시뮬레이션 렌더링과 OrbitControls는 그대로 동작합니다.
    this.TransformControls = this.A?.TransformControls;
    this.enabled = !!this.TransformControls;

    // assets.js가 등록해 주는 선택 가능한 오브젝트 목록입니다.
    // 실제 Raycaster hit는 자식 Mesh에 걸릴 수 있으므로 부모를 거슬러 등록 오브젝트를 찾습니다.
    this.selectables = [];
    this.selected = null;
    this.mode = 'translate';

    // 선택 판정에 쓰는 Raycaster와 NDC 포인터 좌표입니다.
    this.raycaster = new this.THREE.Raycaster();
    this.pointer = new this.THREE.Vector2();

    // 선택된 오브젝트 외곽을 보여 주는 보조 박스입니다.
    // TransformControls 기즈모와 함께 표시되면 선택 상태가 더 명확합니다.
    this.boxHelper = new this.THREE.BoxHelper(new this.THREE.Object3D(), 0xffd24a);
    this.boxHelper.visible = false;
    this.boxHelper.renderOrder = 999;
    this.ctx.scene.add(this.boxHelper);

    // Move / Rotate / Scale 전환 UI를 시뮬레이션 stage 위에 올립니다.
    this.toolbar = this.createToolbar();
    this.ctx.stage.appendChild(this.toolbar);

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onDraggingChanged = this.onDraggingChanged.bind(this);

    if (this.enabled) {
      // three.js 공식 TransformControls입니다.
      // scene에 추가한 뒤 선택 오브젝트를 attach()하면 축 기즈모가 자동으로 나타납니다.
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

    // pointerdown은 오브젝트 선택용입니다.
    // 실제 변환 드래그는 TransformControls 내부 이벤트가 처리합니다.
    this.dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('keydown', this.onKeyDown);
  }

  createToolbar() {
    // 에디터 모드 전환용 툴바입니다.
    // aria-pressed는 현재 활성 모드를 CSS와 접근성 상태에 동시에 반영합니다.
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
    // 외부 로더가 선택 가능한 조작 단위를 등록합니다.
    // GLB의 모든 Mesh를 따로 등록하지 않고 루트 Group을 등록하면 기즈모가 전체 부품을 움직입니다.
    if (!object || this.selectables.some((entry) => entry.object === object)) return object;

    object.userData.simEditorLabel = label;
    this.selectables.push({ object, label });
    return object;
  }

  unregister(object) {
    // 오브젝트 제거 시 Raycaster 후보에서도 제거합니다.
    // 현재 선택 중인 대상이라면 TransformControls도 같이 detach합니다.
    this.selectables = this.selectables.filter((entry) => entry.object !== object);
    if (this.selected === object) this.select(null);
  }

  setMode(mode) {
    // TransformControls가 지원하는 세 가지 기본 모드만 허용합니다.
    if (!MODES.includes(mode)) return;

    this.mode = mode;
    if (this.transform) this.transform.setMode(mode);

    this.toolbar.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
  }

  select(object) {
    // null 선택은 선택 해제입니다.
    this.selected = object || null;

    if (this.selected && this.transform) {
      // attach()가 Unity식 기즈모를 선택 오브젝트에 붙이는 핵심 호출입니다.
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

  onKeyDown(event) {
    // 입력 UI를 조작하는 중에는 단축키가 텍스트 입력을 방해하지 않게 합니다.
    if (event.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(event.target.tagName)) return;

    // Unity/Unreal 계열에서 익숙한 W/E/R 배치를 따릅니다.
    const key = event.key.toLowerCase();
    if (key === 'w') this.setMode('translate');
    else if (key === 'e') this.setMode('rotate');
    else if (key === 'r') this.setMode('scale');
    else if (key === 'escape') this.select(null);
  }

  setPointer(event) {
    // 브라우저 좌표를 Raycaster가 쓰는 NDC 좌표(-1~1)로 변환합니다.
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  pick(event) {
    // 캔버스 클릭 위치에서 선택 후보 오브젝트를 찾습니다.
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const roots = this.selectables.map((entry) => entry.object);
    const hits = this.raycaster.intersectObjects(roots, true);

    for (const hit of hits) {
      let node = hit.object;

      // hit.object는 GLB 내부 Mesh일 수 있으므로 등록된 부모 Group까지 거슬러 올라갑니다.
      while (node) {
        const entry = this.selectables.find((item) => item.object === node);
        if (entry) return entry.object;
        node = node.parent;
      }
    }

    return null;
  }

  onPointerDown(event) {
    if (event.button !== 0) return;

    // 기즈모 축 위에서 누른 경우에는 TransformControls가 변환을 처리해야 하므로
    // 여기서는 선택 변경을 하지 않습니다.
    if (this.transform?.axis) return;

    const picked = this.pick(event);
    if (picked) {
      event.preventDefault();
      this.select(picked);
    } else {
      this.select(null);
    }
  }

  onDraggingChanged(event) {
    // 기즈모를 드래그하는 동안 OrbitControls를 끕니다.
    // 그렇지 않으면 오브젝트 변환과 카메라 회전이 동시에 발생합니다.
    this.orbit.enabled = !event.value;
  }

  update() {
    // 외부 애니메이션이나 시뮬레이션 명령으로 선택 오브젝트가 움직일 수 있으므로
    // 렌더 루프에서 선택 박스를 계속 현재 bbox에 맞춥니다.
    if (this.selected) this.boxHelper.setFromObject(this.selected);
  }

  dispose() {
    // 토픽 전환/시뮬레이션 종료 시 DOM 이벤트와 three.js 리소스를 정리합니다.
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    this.toolbar?.remove();

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
