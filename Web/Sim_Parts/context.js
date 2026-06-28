// Web/Sim_Parts/context.js
// 시뮬레이션의 전역 상태 컨테이너 및 Three.js 씬 초기화(Context 클래스)를 담당하는 파일입니다.

import { Assets, makeGLTFLoader } from './assets.js';
import { Render } from './render.js';
import { Leds } from './leds.js';
import { Movement } from './movement.js';
import { Rocket } from './rocket.js';
import { Traffic } from './traffic.js';
import { Waves } from './waves.js';
import { Oled } from './oled.js';
import { Gun } from './gun.js';
import { Audio } from './audio.js';
import { Dispatch } from './dispatch.js';

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

    // WebGL 렌더러 생성 및 고화질 설정
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.stage.appendChild(this.renderer.domElement);

    // 3D 씬 생성
    this.scene = new THREE.Scene();
    
    // PMREM 환경 맵 생성 (금속 반사광 효과 적용)
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new A.RoomEnvironment(), 0.04).texture;

    // 카메라 및 OrbitControls 컨트롤러 설정
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    this.controls = new A.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // 씬 조명 설정 (반구형 주 조명 + 방향성 보조등 2개)
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x32402f, 0.55));
    
    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.bias = -0.0003;
    key.shadow.camera.left = -55;
    key.shadow.camera.right = 55;
    key.shadow.camera.top = 55;
    key.shadow.camera.bottom = -55;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 140;
    key.shadow.camera.updateProjectionMatrix();
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0x9fc0f0, 0.5);
    fill.position.set(-4, 2, 4);
    this.scene.add(fill);

    // 그림자 표현을 위한 바닥 원판 생성
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.worldGroup = null;
    this.planeGrids = null;
    this.lastRenderTime = 0;

    // 공유 서브시스템들 인스턴스 할당
    this.leds = new Leds(this);
    this.movement = new Movement(this);
    this.gun = new Gun(this);
    this.rocket = new Rocket(this);
    this.traffic = new Traffic(this);
    this.waves = new Waves(this);
    this.oled = new Oled(this);
    this.audio = new Audio(this);
    this.assets = new Assets(this);
    this.renderEngine = new Render(this);
    this.dispatcher = new Dispatch(this);
  }

  // 브라우저의 Web AudioContext 취득 및 락 해제 메서드
  getAudioCtx() {
    if (!this.audioCtx && this.ensureAudio) {
      this.audioCtx = this.ensureAudio();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { this.audioCtx.resume(); } catch {}
    }
    return this.audioCtx;
  }

  // 시뮬레이터 크기 리사이즈 처리 메서드
  resize() {
    const w = this.stage.clientWidth || 360, h = this.stage.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // 지정한 위치(cy) 및 거리(dist) 기준 카메라 구도를 잡는 헬퍼 메서드
  frame(cy, dist) {
    this.camera.position.set(0, cy, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, cy, 0);
    this.controls.update();
  }

  // 시뮬레이션 인스턴스를 파괴하고 GPU 상의 WebGL 지오메트리 및 재질 메모리를 해제합니다.
  dispose() {
    this.disposed = true;
    try { this.controls.dispose(); } catch {}
    
    // 씬을 순회하며 지오메트리와 맵 텍스처 메모리 자원 해제
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

    // 각 세부 파츠 인스턴스의 개별 자원 해제 호출
    this.leds?.dispose?.();
    this.gun?.dispose?.();
    this.traffic?.dispose?.();
    this.waves?.dispose?.();
    this.rocket?.dispose?.();
  }
}

// 절차 지향 모드에서 사용되던 씬 빌더 함수입니다.
// (현재는 OOP 리팩토링 설계에 따른 래퍼 객체가 Simulation_Main.js에 정의되어 있어 구버전 호환용으로 유지됩니다.)
export function buildSim(THREE, A, stage, loadingEl, cfg, options = {}) {
  const ctx = new Context(THREE, A, stage, loadingEl, cfg, options);

  // 기본 모델 또는 다중 조립식 파츠 로드 실행
  ctx.assets.loadAssets();

  return {
    render() { ctx.renderEngine.render(); },
    resize() { ctx.resize(); },
    dispose() {
      ctx.dispose();
    },
    
    // 알비 로봇 눈/가슴 LED 제어
    get hasEyes() { return !!ctx.cfg.eyes; },
    get eyeL() { return ctx.leds?.eyeL; },
    get eyeR() { return ctx.leds?.eyeR; },
    setEye(side, val) { ctx.leds.setEye(side, val); },
    get hasChest() { return !!ctx.cfg.chest; },
    get chestLed() { return ctx.leds?.chestLed; },
    setChest(val) { ctx.leds.setChest(val); },

    // 우주선 발사대 제어
    get hasLaunchLeds() { return !!ctx.cfg.launch && ctx.leds?.launchLeds?.length > 0; },
    get launchLeds() { return ctx.leds?.launchLeds; },
    setLaunchLed(i, val) { ctx.leds.setLaunchLed(i, val); },
    get hasLaunchWave() { return !!ctx.cfg.launch; },
    setLaunchWave(val) { ctx.waves.setLaunchWave(val); },
    get hasRocket() { return !!ctx.rocket?.rocketGroup; },
    get rocketLaunchOn() { return ctx.rocket?.rocketLaunchOn; },
    get rocketAtRest() { return !ctx.rocket?.rocketLaunchOn && ctx.rocket?.rocketAnimT === 0; },
    setRocketLaunch(on, follow) { ctx.rocket.setRocketLaunch(on, follow); },

    // 우주 신호등 제어
    get hasTraffic() { return !!ctx.cfg.traffic; },
    placeLamps() { ctx.traffic.placeLamps(() => makeGLTFLoader(ctx.A)); },
    placeHands() { ctx.traffic.placeHands(() => makeGLTFLoader(ctx.A)); },
    resetTraffic() { ctx.traffic.resetTraffic(); },
    toggleSlot(idx) { ctx.traffic.toggleSlot(idx); },
    setSlot(idx, val) { ctx.traffic.setSlotOn(idx, val); },

    // 탐사선 로버 제어
    get hasRoverLeds() { return ctx.leds?.roverLeds?.length > 0; },
    setRoverLed(num, val) { ctx.leds.setRoverLed(num, val); },
    get hasServo() { return !!ctx.worldGroup; },
    setServoMove(on, dir) { ctx.movement.setServoMove(on, dir); },
    setServoTurn(on, dir) { ctx.movement.setServoTurn(on, dir); },
    stopServo() { ctx.movement.stopServo(); },
    get servoActive() { return ctx.movement?.servoOn || ctx.movement?.servoTurnOn; },
    get hasDistanceSensor() { return ctx.movement?.irSensorBalls?.length > 0; },
    setDistanceSensor(on) { ctx.movement.setDistanceSensor(on); },
    measureDistance() { return ctx.movement.measureDistance(); },
    get hasBoxes() { return ctx.movement?.boxes?.length > 0; },
    respawnBoxes() { ctx.movement.respawnBoxes(); },
    get obstaclesOn() { return ctx.movement?.obstaclesOn; },
    setObstacles(on) { ctx.movement.setObstacles(on); },
    get hasRoverWave() { return !!ctx.worldGroup; },
    setRoverWave(on) { ctx.waves.setRoverWave(on); },
    get hasOled() { return !!ctx.oled?.oledCanvas; },
    oledClear() { ctx.oled.clear(); },
    oledClearRect(x, y, w, h) { ctx.oled.clearRect(x, y, w, h); },
    oledText(x, y, text) { ctx.oled.text(x, y, text); },
    oledIcon(name, x, y) { ctx.oled.icon(name, x, y); },
    get hasGun() { return !!ctx.gun?.gunMesh; },
    setGunFire() { ctx.gun.setGunFire(); },

    // 안테나 레이더 / 평면 그리드 보조선 제어
    get hasRadar() { return !!ctx.movement?.antennaPivot; },
    get radarOn() { return ctx.movement?.radarOn; },
    setRadar(on, dir) { ctx.movement.setRadar(on, dir); },
    get hasGrids() { return !!ctx.planeGrids; },
    toggleGrids() {
      if (ctx.planeGrids) {
        ctx.planeGrids.visible = !ctx.planeGrids.visible;
        return ctx.planeGrids.visible;
      }
      return false;
    },

    // 오디오 효과 재생 작동
    playRocketLaunch() { ctx.audio.playRocketLaunch(); },
    playGunFire() { ctx.audio.playGunFire(); },

    // 비동기 커맨드 발송 대기 제어 API
    simSink(command, waitResp) { return ctx.dispatcher.simSink(command, waitResp); },
    cancelActiveWait() { ctx.dispatcher.cancelActiveWait(); }
  };
}
