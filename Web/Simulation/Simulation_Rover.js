// Simulation_Rover.js
// 로버(rover) 토픽을 위한 서브시스템 래퍼 클래스입니다.
// 로버의 개별 부속 GLB 파일들을 다중 로딩하고, 여러 파츠(Leds, Movement, Oled, Gun, Waves)를 제어합니다.

import { Leds } from '../Sim_Parts/leds.js';
import { Movement } from '../Sim_Parts/movement.js';
import { Oled } from '../Sim_Parts/oled.js';
import { Gun } from '../Sim_Parts/gun.js';
import { Waves } from '../Sim_Parts/waves.js';
import { playGunFire as basePlayGunFire } from '../Sim_Parts/audio.js';
import { makeGLTFLoader } from '../Sim_Parts/assets.js';

export function playGunFire(audioCtx) {
  basePlayGunFire(audioCtx);
}

export class Simulation_Rover {
  constructor(ctx, OLED_ICONS) {
    this.ctx = ctx;
    this.OLED_ICONS = OLED_ICONS;

    // 로버에서 제어할 하위 서브시스템을 인스턴스화합니다.
    this.leds = new Leds(ctx);
    this.movement = new Movement(ctx);
    this.oled = new Oled(ctx);
    this.gun = new Gun(ctx);
    this.waves = new Waves(ctx);

    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const cfg = ctx.cfg;

    // 로버의 모든 부속을 담을 로버 3D 그룹을 생성하여 y축 방향으로 살짝 올립니다.
    this.roverGroup = new THREE.Group();
    this.roverGroup.position.y = 0.4;
    scene.add(this.roverGroup);

    this.leds.init(cfg.eyes, cfg.chest, cfg.launch);

    // 배치 헬퍼(바닥 평면 및 장애물 박스 150개)를 구성합니다.
    if (cfg.helpers) {
      const FLOOR_SIZE = 100;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
        new THREE.MeshStandardMaterial({
          color: 0x3a3a3a, roughness: 0.95, metalness: 0.0,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.001;
      floor.receiveShadow = true;
      floor.renderOrder = -1;

      const grid = new THREE.GridHelper(FLOOR_SIZE, FLOOR_SIZE, 0x444444, 0x666666);
      grid.position.y = 0.002;

      // 바닥과 장애물은 하나의 worldGroup 으로 묶어, 로버가 움직일 때 반대 방향으로 흘러가게 합니다.
      this.worldGroup = new THREE.Group();
      this.worldGroup.add(floor, grid);
      ctx.worldGroup = this.worldGroup;

      // 150개의 박스를 랜덤 배치하되, 로버 근처(원점 반경 5이내)는 제외합니다.
      const BOX_SPAWN_RANGE = 50;
      const BOX_CLEAR_R = 5;
      const BOX_COUNT = 150;
      const boxGeom = new THREE.BoxGeometry(1, 2, 1);
      for (let i = 0; i < BOX_COUNT; i++) {
        let x = 0, z = 0;
        do {
          x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
          z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        } while (Math.hypot(x, z) < BOX_CLEAR_R);
        const box = new THREE.Mesh(
          boxGeom,
          new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.55, 0.5), roughness: 0.8, metalness: 0.0 }),
        );
        box.position.set(x, 1, z);
        box.castShadow = true;
        box.receiveShadow = true;
        this.worldGroup.add(box);
        this.movement.boxes.push(box);
      }
      scene.add(this.worldGroup);

      // 원점 기준 XYZ 기준선 헬퍼 추가
      const axes = new THREE.AxesHelper(1);
      axes.position.y = 0.003;
      scene.add(axes);

      // g 단축키로 토글할 수 있는 0.1 세부 그리드 평면 생성
      const makePlaneGrid = () => new THREE.GridHelper(2, 20, 0x888888, 0x444466);
      const gridXZ = makePlaneGrid();
      const gridXY = makePlaneGrid(); gridXY.rotation.x = Math.PI / 2;
      const gridYZ = makePlaneGrid(); gridYZ.rotation.z = Math.PI / 2;
      this.ctx.planeGrids = new THREE.Group();
      this.ctx.planeGrids.add(gridXZ, gridXY, gridYZ);
      this.ctx.planeGrids.visible = false;
      scene.add(this.ctx.planeGrids);
    }

    // 로버의 센서 점등 상태를 보여줄 반투명 지시자 구체들을 추가합니다.
    {
      // 상부 LED0~LED5 표시용 구체 6개
      const LED_COUNT = 6, LED_X0 = -0.4, LED_X1 = 0.4, LED_Y = 0.4, LED_Z = 0.25, LED_R = 0.05;
      const step = (LED_X1 - LED_X0) / (LED_COUNT - 1);
      const ledGeom = new THREE.SphereGeometry(LED_R, 16, 12);
      for (let i = 0; i < LED_COUNT; i++) {
        const ball = new THREE.Mesh(
          ledGeom,
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
        );
        ball.position.set(LED_X0 + step * i, LED_Y, LED_Z);
        this.roverGroup.add(ball);
        this.leds.roverLeds.push(ball);
      }

      // 자기(마그네틱) 센서 표시 구체
      this.movement.magSensorBall = new THREE.Mesh(
        ledGeom,
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
      );
      this.movement.magSensorBall.position.set(0, -0.3, 0.9);
      this.roverGroup.add(this.movement.magSensorBall);

      // 적외선 센서 표시 구체 2개 (좌우)
      [-0.22, 0.22].forEach((x) => {
        const ball = new THREE.Mesh(
          ledGeom,
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
        );
        ball.position.set(x, 0.58, 0.1);
        this.roverGroup.add(ball);
        this.movement.irSensorBalls.push(ball);
      });
    }

    // 로버 각 부속 GLB 파일들을 다중 비동기 로딩합니다.
    const loader = makeGLTFLoader(ctx.A);
    let remaining = cfg.parts.length;
    cfg.parts.forEach((url) => {
      loader.load(url, (gltf) => {
        if (ctx.disposed) {
          gltf.scene.traverse((o) => {
            if (o.isMesh || o.isSprite) {
              o.geometry?.dispose?.();
              const m = o.material;
              (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
            }
          });
          return;
        }
        const root = gltf.scene;
        // 본체(RoverBody.glb)를 제외한 나머지 부속은 본체 규격에 맞추어 0.5배 축소 처리
        if (!/RoverBody\.glb$/.test(url)) root.scale.setScalar(0.5);
        root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

        // 휠 배치 및 좌우 회전 그룹 지정
        if (/RoverWheel\.glb$/.test(url)) {
          root.scale.multiplyScalar(0.8);
          this.movement.wheelR = root;
          this.movement.wheelL = root.clone();
          this.movement.wheelR.rotation.y = Math.PI / 2;
          this.movement.wheelL.rotation.y = Math.PI / 2;
          this.movement.wheelR.position.set( 0.7, 0, -0.3);
          this.movement.wheelL.position.set(-0.7, 0, -0.3);
          this.roverGroup.add(this.movement.wheelR, this.movement.wheelL);
        } else if (/RoverRadar\.glb$/.test(url)) {
          // 레이더(DC모터 회전 대상)
          root.scale.multiplyScalar(0.5);
          root.scale.multiplyScalar(0.8);
          root.position.set(0, 0.5, -0.9);
          this.movement.antennaPivot = root;
          this.roverGroup.add(root);
        } else if (/RoverLED\.glb$/.test(url)) {
          // LED 모듈 헤드
          root.position.set(0, 0.35, 0.2);
          root.rotation.x = Math.PI / 4;
          this.roverGroup.add(root);
        } else if (/RoverHead\.glb$/.test(url)) {
          // 초음파 센서 헤드
          root.position.set(0, 0.6, -0.3);
          root.rotation.y = Math.PI;
          this.roverGroup.add(root);
        } else if (/RoverGun\.glb$/.test(url)) {
          // 레이저 총포 및 포구 발사 축 계산
          root.position.set(0.55, 0.5, -0.5);
          root.rotation.y = Math.PI / 2;
          this.roverGroup.add(root);
          this.gun.gunMesh = root;
          {
            const bbox = new this.ctx.THREE.Box3().setFromObject(root);
            const size = bbox.getSize(new this.ctx.THREE.Vector3());
            const center = bbox.getCenter(new this.ctx.THREE.Vector3());
            let ax = 0;
            if (size.y > size.x && size.y > size.z) ax = 1;
            else if (size.z > size.x) ax = 2;
            const minV = bbox.min.getComponent(ax);
            const maxV = bbox.max.getComponent(ax);
            const muzzleEnd = Math.abs(maxV) > Math.abs(minV) ? minV : maxV;
            this.gun.muzzleWorldPos.copy(center);
            this.gun.muzzleWorldPos.setComponent(ax, muzzleEnd);
            this.gun.muzzleForward.set(0, 0, 0);
            this.gun.muzzleForward.setComponent(ax, Math.sign(muzzleEnd - center.getComponent(ax)) || -1);
          }
        } else if (/RoverOLED\.glb$/.test(url)) {
          // 가상 OLED 스크린 평면 및 캔버스 텍스처를 맵핑합니다.
          root.position.set(0, 0.1, 0.5);
          root.rotation.x = -Math.PI / 6;
          {
            const probe = root.clone(true);
            probe.position.set(0, 0, 0); probe.rotation.set(0, 0, 0); probe.scale.set(1, 1, 1);
            const box = new this.ctx.THREE.Box3().setFromObject(probe);
            const size = box.getSize(new this.ctx.THREE.Vector3());
            const center = box.getCenter(new this.ctx.THREE.Vector3());

            this.oled.oledCanvas = document.createElement('canvas');
            this.oled.oledCanvas.width = 128 * 4;
            this.oled.oledCanvas.height = 64 * 4;
            this.oled.oledCtx = this.oled.oledCanvas.getContext('2d');
            this.oledClear();
            this.oledText(0, 0, 'ARES READY');
            this.oled.oledTex = new this.ctx.THREE.CanvasTexture(this.oled.oledCanvas);
            this.oled.oledTex.colorSpace = this.ctx.THREE.SRGBColorSpace;
            this.oled.oledTex.magFilter = this.ctx.THREE.NearestFilter;
            this.oled.oledTex.minFilter = this.ctx.THREE.NearestFilter;
            const w = size.x * 0.85 * 0.95 * 0.95 * 0.9;
            const h = w * (this.oled.oledCanvas.height / this.oled.oledCanvas.width);
            const screen = new this.ctx.THREE.Mesh(
              new this.ctx.THREE.PlaneGeometry(w, h),
              new this.ctx.THREE.MeshBasicMaterial({ map: this.oled.oledTex, side: this.ctx.THREE.DoubleSide })
            );
            const pivot = new this.ctx.THREE.Group();
            pivot.position.set(center.x, center.y - h / 2, box.max.z + 0.001);
            pivot.rotation.x = -Math.PI / 12;
            screen.position.set(0, h / 2, 0);
            pivot.add(screen);
            root.add(pivot);
            root.userData.oledScreen = screen;
          }
          this.roverGroup.add(root);
        } else {
          this.roverGroup.add(root);
        }
        if (--remaining === 0 && ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = 'none';
      }, undefined, (err) => {
        console.error('부속 로드 실패:', url, err);
        if (--remaining === 0 && ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = 'none';
      });
    });

    this.obstacleBtn = null;
    this.handleObstacleClick = null;
    this.handleKeyDown = null;
    this.handleDblClick = null;
    this.stage = null;
  }

  // 외부 제어 모듈이 참조할 Getter/Setter 정의
  get boxes() { return this.movement.boxes; }
  get roverLeds() { return this.leds.roverLeds; }
  get magSensorBall() { return this.movement.magSensorBall; }
  set magSensorBall(v) { this.movement.magSensorBall = v; }
  get irSensorBalls() { return this.movement.irSensorBalls; }
  get wheelR() { return this.movement.wheelR; }
  set wheelR(v) { this.movement.wheelR = v; }
  get wheelL() { return this.movement.wheelL; }
  set wheelL(v) { this.movement.wheelL = v; }
  get antennaPivot() { return this.movement.antennaPivot; }
  set antennaPivot(v) { this.movement.antennaPivot = v; }
  get gunMesh() { return this.gun.gunMesh; }
  set gunMesh(v) { this.gun.gunMesh = v; }
  
  get oledCanvas() { return this.oled.oledCanvas; }
  set oledCanvas(v) { this.oled.oledCanvas = v; }
  get oledCtx() { return this.oled.oledCtx; }
  set oledCtx(v) { this.oled.oledCtx = v; }
  get oledTex() { return this.oled.oledTex; }
  set oledTex(v) { this.oled.oledTex = v; }

  get muzzleWorldPos() { return this.gun.muzzleWorldPos; }
  get muzzleForward() { return this.gun.muzzleForward; }

  get obstaclesOn() { return this.movement.obstaclesOn; }
  set obstaclesOn(v) { this.movement.obstaclesOn = v; }
  get servoOn() { return this.movement.servoOn; }
  set servoOn(v) { this.movement.servoOn = v; }
  get servoDir() { return this.movement.servoDir; }
  set servoDir(v) { this.movement.servoDir = v; }
  get servoTurnOn() { return this.movement.servoTurnOn; }
  set servoTurnOn(v) { this.movement.servoTurnOn = v; }
  get servoTurnDir() { return this.movement.servoTurnDir; }
  set servoTurnDir(v) { this.movement.servoTurnDir = v; }

  get radarOn() { return this.movement.radarOn; }
  set radarOn(v) { this.movement.radarOn = v; }
  get radarDir() { return this.movement.radarDir; }
  set radarDir(v) { this.movement.radarDir = v; }

  get roverWaveOn() { return this.waves.roverWaveOn; }
  set roverWaveOn(v) { this.waves.roverWaveOn = v; }

  // 제어 메서드 모음
  setRoverLed(num, value) {
    this.leds.setRoverLed(num, value);
  }

  setServoMove(on, dir) {
    this.movement.setServoMove(on, dir);
  }

  setServoTurn(on, dir) {
    this.movement.setServoTurn(on, dir);
  }

  stopServo() {
    this.movement.stopServo();
  }

  setDistanceSensor(on) {
    this.movement.setDistanceSensor(on);
  }

  measureDistance() {
    return this.movement.measureDistance();
  }

  setRadar(on, dir) {
    this.movement.setRadar(on, dir);
  }

  setObstacles(on) {
    this.movement.setObstacles(on);
  }

  respawnBoxes() {
    this.movement.respawnBoxes();
  }

  setRoverWave(on) {
    this.waves.setRoverWave(on);
  }

  oledClear() {
    this.oled.clear();
  }

  oledClearRect(x, y, w, h) {
    this.oled.clearRect(x, y, w, h);
  }

  oledText(x, y, text) {
    this.oled.text(x, y, text);
  }

  oledIcon(name, x, y) {
    this.oled.icon(name, x, y);
  }

  setGunFire() {
    this.gun.setGunFire();
  }

  // 매 프레임마다 레이더 회전 및 총구 화염/연기/소리 파동 효과를 갱신합니다.
  // 로버 움직임 자체는 render.js의 Render 클래스가 담당합니다.
  update(dt) {
    // 1) 레이더 안테나 회전
    if (this.movement.radarOn && this.movement.antennaPivot) {
      this.movement.antennaPivot.rotation.y += 0.15 * this.movement.radarDir;
    }

    // 2) 포구 격발 이펙트 및 연기
    this.gun.updateMuzzleFlash(dt);
    this.gun.updateGunSmoke(dt);

    // 3) 소리 파동 효과
    this.waves.updateWaves(dt);
  }

  // 모든 인스턴스 자원을 해제하고 scene에서 그룹들을 분리합니다.
  dispose() {
    this.leds.dispose();
    this.movement.dispose();
    this.oled.dispose();
    this.gun.dispose();
    this.waves.dispose();
    if (this.roverGroup && this.roverGroup.parent) {
      this.roverGroup.parent.remove(this.roverGroup);
    }
    if (this.worldGroup && this.worldGroup.parent) {
      this.worldGroup.parent.remove(this.worldGroup);
    }
  }

  // 시뮬레이터 속성 판정 getter
  get hasRoverLeds() { return this.leds.roverLeds.length > 0; }
  get hasDistanceSensor() { return this.movement.irSensorBalls.length > 0; }
  get hasServo() { return !!this.ctx.worldGroup; }
  get hasRadar() { return !!this.movement.antennaPivot; }
  get hasGun() { return !!this.gun.gunMesh; }
  get hasOled() { return !!this.oled.oledCanvas; }
  get hasRoverWave() { return !!this.ctx.worldGroup; }
  get servoActive() { return this.movement.servoOn || this.movement.servoTurnOn; }

  // 서브시스템이 활성화될 때 호출됩니다.
  // 로버 전용 버튼 영역 표시, 장애물 토글 리스너, g/r 단축키 및 화면 더블클릭 박스 재생성 이벤트 바인딩을 수행합니다.
  activate() {
    const card = document.getElementById('simCard');
    const roverWrap = card ? card.querySelector('.sim-rover-buttons') : null;
    if (roverWrap) {
      roverWrap.style.display = '';
    }

    this.obstacleBtn = document.getElementById('simObstacle');
    if (this.obstacleBtn) {
      this.obstacleBtn.classList.add('on');
      this.obstacleBtn.innerHTML = '<span class="dot"></span>장애물 제거';
      this.handleObstacleClick = () => {
        const next = !this.obstaclesOn;
        this.setObstacles(next);
        this.obstacleBtn.classList.toggle('on', next);
        this.obstacleBtn.innerHTML = next ? '<span class="dot"></span>장애물 제거' : '<span class="dot"></span>장애물 설치';
      };
      this.obstacleBtn.addEventListener('click', this.handleObstacleClick);
    }

    // g 키 (세부 그리드), r 키 (장애물 재생성) 키 리스너 바인딩
    this.handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const tag = (t && t.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      
      if ((e.key === 'g' || e.key === 'G') && this.ctx.planeGrids) {
        this.ctx.planeGrids.visible = !this.ctx.planeGrids.visible;
        e.preventDefault();
      }
      if (e.key === 'r' || e.key === 'R') {
        this.respawnBoxes();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);

    // 모바일 등 터치 기기용 더블클릭 박스 재생성 리스너 바인딩
    this.stage = document.getElementById('simStage');
    const isMobileLike = new URLSearchParams(location.search).get('mobile') === 'true'
      || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isMobileLike && this.stage) {
      this.handleDblClick = () => {
        this.respawnBoxes();
      };
      this.stage.addEventListener('dblclick', this.handleDblClick);
    }

    const simHint = document.getElementById('simHint');
    if (simHint) {
      simHint.textContent = '로버 부속 배치 보기 · 1 간격 그리드 바닥 · g 키: 0.1 평면 그리드 토글 · r 키: 박스 다시 배치';
    }
  }

  // 서브시스템이 비활성화될 때 호출되어 모든 이벤트 리스너를 제거하고 UI를 숨깁니다.
  deactivate() {
    if (this.obstacleBtn && this.handleObstacleClick) {
      this.obstacleBtn.removeEventListener('click', this.handleObstacleClick);
    }
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    if (this.stage && this.handleDblClick) {
      this.stage.removeEventListener('dblclick', this.handleDblClick);
    }

    const card = document.getElementById('simCard');
    const roverWrap = card ? card.querySelector('.sim-rover-buttons') : null;
    if (roverWrap) {
      roverWrap.style.display = 'none';
    }
  }

  // 분산형 커맨드 핸들러입니다. 로버 전용 주행, 포격 및 OLED 제어 명령들을 처리합니다.
  handleCommand(cmd) {
    const ctx = this.ctx;

    // 거리 측정 센서 가시성 제어
    if (cmd.startsWith('DISTANCE')) {
      this.setDistanceSensor(true);
      return () => { this.setDistanceSensor(false); };
    }

    // LED_ON,num,val
    if (cmd.startsWith('LED_ON,')) {
      const parts = cmd.split(',');
      const num = parseInt(parts[1], 10);
      const intensity = Math.max(0, Math.min(1, parseFloat(parts[2])));
      this.setRoverLed(num, intensity);
      return null;
    }

    // LED_OFF
    if (cmd.startsWith('LED_OFF,')) {
      const arg = cmd.split(',')[1];
      if (arg === 'ALL') {
        for (let i = 0; i <= 5; i++) this.setRoverLed(i, 0);
      } else {
        this.setRoverLed(parseInt(arg, 10), 0);
      }
      return null;
    }

    // Array led command [val1 val2 ...]
    if (cmd.startsWith('[') && cmd.endsWith(']')) {
      const values = cmd.slice(1, -1).trim().split(/\s+/);
      const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
      for (let i = 0; i <= 5; i++) {
        if (values.length > i) this.setRoverLed(i, toI(values[i]));
      }
      return null;
    }

    // BUZZER_ON -> 로버 경보 음향 및 스피커 파동 원 링 애니메이션 작동
    if (cmd.startsWith('BUZZER_ON,')) {
      this.setRoverWave(true);
      const parts = cmd.split(',');
      const hz = parseFloat(parts[1]) || 0;
      const sec = parseFloat(parts[2]) || 0;
      ctx.audio.playBeep(hz, sec);
      return () => { this.setRoverWave(false); };
    }

    // 모터 시간 주행 작동
    if (cmd.startsWith('SERVO_tFORWARD,') || cmd.startsWith('SERVO_tBACKWARD,')) {
      const dir = cmd.startsWith('SERVO_tFORWARD,') ? 1 : -1;
      this.setServoMove(true, dir);
      return () => { this.setServoMove(false); };
    }
    
    if (cmd.startsWith('SERVO_tLEFT,') || cmd.startsWith('SERVO_tRIGHT,')) {
      const dir = cmd.startsWith('SERVO_tLEFT,') ? 1 : -1;
      this.setServoTurn(true, dir);
      return () => { this.setServoTurn(false); };
    }

    // 모터 연속 주행 작동
    if (cmd === 'SERVO_FORWARD'  || cmd.startsWith('SERVO_FORWARD,'))  { this.setServoMove(true,  1); return null; }
    if (cmd === 'SERVO_BACKWARD' || cmd.startsWith('SERVO_BACKWARD,')) { this.setServoMove(true, -1); return null; }
    if (cmd === 'SERVO_LEFT'     || cmd.startsWith('SERVO_LEFT,'))     { this.setServoTurn(true,  1); return null; }
    if (cmd === 'SERVO_RIGHT'    || cmd.startsWith('SERVO_RIGHT,'))    { this.setServoTurn(true, -1); return null; }
    if (cmd === 'SERVO_STOP'     || cmd.startsWith('SERVO_STOP,'))     { this.stopServo();           return null; }

    // 포격 (GUN_FIRE)
    if (cmd === 'GUN_FIRE' || cmd.startsWith('GUN_FIRE,')) {
      this.setGunFire();
      basePlayGunFire(ctx.getAudioCtx());
      return null;
    }

    // 가상 OLED 화면 지우기
    if (cmd === 'CLEAR_DISPLAY' || cmd.startsWith('CLEAR_DISPLAY')) {
      this.oledClear();
      return null;
    }
    
    // 가상 OLED 일부 영역 지우기
    if (cmd.startsWith('CLEAR_RECT,')) {
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const w = parseInt(parts[3], 10) || 0;
      const h = parseInt(parts[4], 10) || 0;
      this.oledClearRect(x, y, w, h);
      return null;
    }
    
    // 가상 OLED 전체 메시지 출력
    if (cmd.startsWith('MSG,')) {
      this.oledClear();
      let rem = cmd.slice(4) || 'Hello';
      const MAX_CHARS = 16;
      const LINE_H = 8;
      for (let yp = 0; rem && yp < 64; yp += LINE_H) {
        this.oledText(0, yp, rem.slice(0, MAX_CHARS));
        rem = rem.slice(MAX_CHARS);
      }
      return null;
    }
    
    // 가상 OLED 좌표 텍스트 출력
    if (cmd.startsWith('MSG_XY,')) {
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const text = parts.slice(3).join(',') || 'Hello';
      this.oledText(x, y, text);
      return null;
    }
    
    // 가상 OLED 아이콘 비트맵 드로잉
    if (cmd.startsWith('ICON,')) {
      const parts = cmd.split(',');
      const name = (parts[1] || '').trim().toLowerCase();
      const x = parseInt(parts[2], 10) || 0;
      const y = parseInt(parts[3], 10) || 0;
      this.oledIcon(name, x, y);
      return null;
    }

    return undefined; // 미처리 명령
  }
}
