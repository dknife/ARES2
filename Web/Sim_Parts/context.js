// Web/Sim_Parts/context.js
// Shared state container and Three.js scene setup.

import { Assets } from './assets.js';
import { Render } from './render.js';
import { Leds } from './leds.js';
import { Movement } from './movement.js';
import { Rocket } from './rocket.js';
import { Traffic } from './traffic.js';
import { Waves } from './waves.js';
import { Gun } from './gun.js';
import { Audio } from './audio.js';
import { Dispatch } from './dispatch.js';
import { EditorControls } from './editor_controls.js';
import { SimulationObjectRegistry } from './sim_object.js';

const CAMERA_CONTROL = {
  zoomSpeed: 0.4,
  wheelScale: 0.0025,
  smoothRate: 10,
  minDistanceRatio: 0.35,
  maxDistanceRatio: 3.0,
  minDistanceFloor: 0.2,
  pinchSpeed: 3,   // 핀치 줌 배율(거리 비율의 지수) — 값이 클수록 빠르게 확대/축소
};

export class Context {
  constructor(THREE, A, stage, loadingEl, cfg, options = {}) {
    this.THREE = THREE;
    this.A = A;
    this.stage = stage;
    this.loadingEl = loadingEl;
    this.cfg = cfg;
    this.logLine = options.logLine;
    this.ensureAudio = options.ensureAudio;
    this.state = options.state;
    this.audioCtx = null;
    this.disposed = false;

    // WebGL setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.stage.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    
    // PMREM environment map
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new A.RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    this.controls = new A.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableZoom = false;
    this.smoothZoomTarget = null;
    this.onSmoothZoomWheel = (event) => this.handleSmoothZoomWheel(event);
    this.renderer.domElement.addEventListener('wheel', this.onSmoothZoomWheel, { passive: false });

    // 두 손가락 핀치 줌 (OrbitControls.enableZoom=false 이므로 직접 구현 →
    // 휠 줌과 동일한 smoothZoomTarget 파이프라인으로 부드럽게 처리)
    this._pinchPointers = new Map();
    this._pinchPrevDist = 0;
    this.onPinchDown = (e) => this.handlePinchDown(e);
    this.onPinchMove = (e) => this.handlePinchMove(e);
    this.onPinchUp = (e) => this.handlePinchUp(e);
    const _dom = this.renderer.domElement;
    _dom.addEventListener('pointerdown', this.onPinchDown);
    _dom.addEventListener('pointermove', this.onPinchMove);
    _dom.addEventListener('pointerup', this.onPinchUp);
    _dom.addEventListener('pointercancel', this.onPinchUp);

    // 더블클릭 리셋용 초기(frame) 카메라 상태 + 복귀 트윈
    this.homeCamPos = null;
    this.homeTarget = null;
    this.camResetTween = null;

    // Lighting
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x32402f, 0.55));
    
    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.bias = -0.0003;
    // 그림자 프러스텀은 좁게 유지해야 객체 사이 그림자가 선명하다(±55 였을 때는
    // 텍셀이 ~2.7cm 라 작은 객체 그림자가 뭉개졌다). 좁힌 대신 매 프레임
    // updateKeyLight() 가 카메라 타깃을 따라가며 보이는 영역을 항상 덮는다.
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 140;
    key.shadow.camera.updateProjectionMatrix();
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0x9fc0f0, 0.5);
    fill.position.set(-4, 2, 4);
    this.scene.add(fill);

    // Ground
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // 사용자 모드 바닥 — 체커(체크무늬) 평면. 개발자 모드에서는 숨긴다(devGrids 로 대체).
    // 기본은 사용자 모드라 보이는 상태로 생성하고, setDevMode 가 가시성을 토글한다.
    this.checkerFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ map: this._makeCheckerTexture(), roughness: 0.95, metalness: 0.0 }),
    );
    this.checkerFloor.rotation.x = -Math.PI / 2;
    this.checkerFloor.position.y = -0.01;   // 그림자 바닥(y=0) 살짝 아래로 두어 z-fighting 방지
    this.checkerFloor.receiveShadow = true;
    this.scene.add(this.checkerFloor);

    this.worldGroup = null;
    this.planeGrids = null;
    this.lastRenderTime = 0;

    // Shared subsystem refs (OOP Class instances)
    this.leds = new Leds(this);
    this.movement = new Movement(this);
    this.gun = new Gun(this);
    this.rocket = new Rocket(this);
    this.traffic = new Traffic(this);
    this.waves = new Waves(this);
    this.audio = new Audio(this);
    this.assets = new Assets(this);
    this.renderEngine = new Render(this);
    this.dispatcher = new Dispatch(this);

    this.objects = new SimulationObjectRegistry(this);
    this.editor = new EditorControls(this);
  }

  // 키 라이트(그림자 광원)를 카메라 타깃에 추종시킨다 — 좁은 그림자 프러스텀이
  // 항상 시야 중심을 덮어 어디서 작업하든 객체 간 그림자가 유지된다.
  updateKeyLight() {
    const t = this.controls.target;
    this.keyLight.position.set(t.x + 3, t.y + 6, t.z + 5);
    this.keyLight.target.position.copy(t);
  }

  clampCameraDistance(distance) {
    return Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, distance));
  }

  handleSmoothZoomWheel(event) {
    event.preventDefault();
    const lineHeight = 16;
    const pageHeight = this.stage.clientHeight || 300;
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE ? lineHeight :
      event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? pageHeight : 1;
    const delta = event.deltaY * unit;
    const currentDistance = this.camera.position.distanceTo(this.controls.target);
    const baseDistance = this.smoothZoomTarget ?? currentDistance;
    const scale = Math.exp(delta * CAMERA_CONTROL.wheelScale * CAMERA_CONTROL.zoomSpeed);
    this.smoothZoomTarget = this.clampCameraDistance(baseDistance * scale);
  }

  updateSmoothZoom(dt) {
    if (this.smoothZoomTarget == null) return;

    const target = this.controls.target;
    const offset = this.camera.position.clone().sub(target);
    const currentDistance = offset.length();
    if (currentDistance <= 0.0001) {
      offset.set(0, 0, 1);
    } else {
      offset.normalize();
    }

    const desiredDistance = this.clampCameraDistance(this.smoothZoomTarget);
    const alpha = 1 - Math.exp(-CAMERA_CONTROL.smoothRate * Math.max(0, dt));
    const nextDistance = currentDistance + (desiredDistance - currentDistance) * alpha;
    this.camera.position.copy(target).add(offset.multiplyScalar(nextDistance));

    if (Math.abs(desiredDistance - nextDistance) < 0.001) {
      this.camera.position.copy(target).add(offset.normalize().multiplyScalar(desiredDistance));
      this.smoothZoomTarget = null;
    }
  }

  // ----- 두 손가락 핀치 줌 -----
  _pinchDistance() {
    const pts = [...this._pinchPointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  handlePinchDown(e) {
    if (e.pointerType !== 'touch') return;
    this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pinchPointers.size === 2) this._pinchPrevDist = this._pinchDistance();
  }

  handlePinchMove(e) {
    if (e.pointerType !== 'touch' || !this._pinchPointers.has(e.pointerId)) return;
    this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pinchPointers.size !== 2) return;
    const dist = this._pinchDistance();
    if (this._pinchPrevDist > 0 && dist > 0) {
      // 손가락을 벌리면(dist↑) 카메라 거리↓ → 확대. 오므리면 축소.
      // pinchSpeed 지수로 확대/축소 속도를 배가한다(줌은 곱셈이라 지수로 조절).
      const base = this.smoothZoomTarget ?? this.camera.position.distanceTo(this.controls.target);
      const ratio = Math.pow(this._pinchPrevDist / dist, CAMERA_CONTROL.pinchSpeed);
      this.smoothZoomTarget = this.clampCameraDistance(base * ratio);
    }
    this._pinchPrevDist = dist;
  }

  handlePinchUp(e) {
    if (e.pointerType !== 'touch') return;
    this._pinchPointers.delete(e.pointerId);
    if (this._pinchPointers.size < 2) this._pinchPrevDist = 0;
  }

  // ----- 더블클릭: 처음 시작할 때(frame)의 카메라 상태로 복귀 -----
  resetCameraHome() {
    if (!this.homeCamPos || !this.homeTarget) return;
    this.smoothZoomTarget = null;
    this.camResetTween = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: this.homeCamPos.clone(),
      toTarget: this.homeTarget.clone(),
      t: 0, dur: 0.45,
    };
  }

  updateCameraReset(dt) {
    const tw = this.camResetTween;
    if (!tw) return;
    tw.t = Math.min(1, tw.t + Math.max(0, dt) / tw.dur);
    const x = tw.t;
    const e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; // easeInOutQuad
    this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
    if (tw.t >= 1) {
      this.camera.position.copy(tw.toPos);
      this.controls.target.copy(tw.toTarget);
      this.camResetTween = null;
    }
  }

  // ----- 사용자 모드 체커 바닥 -----
  _makeCheckerTexture() {
    const THREE = this.THREE;
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#565e69'; g.fillRect(0, 0, size, size);            // 밝은 칸(한 단계 더 어둡게, 2026-07-13)
    g.fillStyle = '#31373f';                                         // 어두운 칸(2x2 체커 한 셀)
    g.fillRect(0, 0, size / 2, size / 2);
    g.fillRect(size / 2, size / 2, size / 2, size / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(60, 60);          // 120단위 평면 / (셀당 2단위) → 한 칸 ≈ 1단위
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  setCheckerFloorVisible(v) {
    if (this.checkerFloor) this.checkerFloor.visible = !!v;
  }

  getAudioCtx() {
    if (!this.audioCtx && this.ensureAudio) {
      this.audioCtx = this.ensureAudio();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { this.audioCtx.resume(); } catch {}
    }
    return this.audioCtx;
  }

  resize() {
    const w = this.stage.clientWidth || 360, h = this.stage.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(cy, dist) {
    this.camera.position.set(0, cy, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = Math.max(CAMERA_CONTROL.minDistanceFloor, dist * CAMERA_CONTROL.minDistanceRatio);
    this.controls.maxDistance = Math.max(this.controls.minDistance + CAMERA_CONTROL.minDistanceFloor, dist * CAMERA_CONTROL.maxDistanceRatio);
    this.smoothZoomTarget = null;
    this.controls.target.set(0, cy, 0);
    this.controls.update();
    // 이 상태가 '처음 시작할 때'의 카메라 — 더블클릭 리셋의 복귀 지점으로 저장
    this.homeCamPos = this.camera.position.clone();
    this.homeTarget = this.controls.target.clone();
    this.camResetTween = null;
  }

  dispose() {
    this.disposed = true;
    if (this.onSmoothZoomWheel) {
      this.renderer.domElement.removeEventListener('wheel', this.onSmoothZoomWheel);
    }
    if (this.onPinchDown) {
      const _dom = this.renderer.domElement;
      _dom.removeEventListener('pointerdown', this.onPinchDown);
      _dom.removeEventListener('pointermove', this.onPinchMove);
      _dom.removeEventListener('pointerup', this.onPinchUp);
      _dom.removeEventListener('pointercancel', this.onPinchUp);
    }
    try { this.controls.dispose(); } catch {}
    this.objects?.dispose?.();
    
    this.scene.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
      }
    });

    try {
      this.scene.environment?.dispose?.();
      this.scene.environment = null;
      this.pmrem.dispose();
    } catch {}
    try { this.renderer.dispose(); } catch {}
    try { this.renderer.forceContextLoss?.(); } catch {}
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    // Subsystem disposals
    this.editor?.dispose?.();
    this.leds?.dispose?.();
    this.gun?.dispose?.();
    this.traffic?.dispose?.();
    this.waves?.dispose?.();
    this.rocket?.dispose?.();
  }
}
