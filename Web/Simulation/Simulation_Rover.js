// Simulation_Rover.js
// Subsystem wrapper for the Rover (rover) topic, reusing modular subsystems.

import { LedSubsystem } from '../Sim_Parts/leds.js';
import { MovementSubsystem } from '../Sim_Parts/movement.js';
import { OledSubsystem } from '../Sim_Parts/oled.js';
import { GunSubsystem } from '../Sim_Parts/gun.js';
import { WavesSubsystem } from '../Sim_Parts/waves.js';
import { playGunFire as basePlayGunFire } from '../Sim_Parts/audio.js';

export function playGunFire(audioCtx) {
  basePlayGunFire(audioCtx);
}

export class RoverSubsystem {
  constructor(ctx, makeGLTFLoader, OLED_ICONS) {
    this.ctx = ctx;
    this.makeGLTFLoader = makeGLTFLoader;
    this.OLED_ICONS = OLED_ICONS;

    this.leds = new LedSubsystem(ctx);
    this.movement = new MovementSubsystem(ctx);
    this.oled = new OledSubsystem(ctx);
    this.gun = new GunSubsystem(ctx);
    this.waves = new WavesSubsystem(ctx);

    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const cfg = ctx.cfg;

    this.roverGroup = new THREE.Group();
    this.roverGroup.position.y = 0.4;
    scene.add(this.roverGroup);

    this.leds.init(cfg.eyes, cfg.chest, cfg.launch);

    // Helper setup (Grid floor, boxes, etc.)
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

      this.worldGroup = new THREE.Group();
      this.worldGroup.add(floor, grid);
      ctx.worldGroup = this.worldGroup;

      // Random boxes
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
        this.boxes.push(box);
      }
      scene.add(this.worldGroup);

      const axes = new THREE.AxesHelper(1);
      axes.position.y = 0.003;
      scene.add(axes);
    }

    // Setup sensor balls
    {
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
        this.roverLeds.push(ball);
      }

      this.magSensorBall = new THREE.Mesh(
        ledGeom,
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
      );
      this.magSensorBall.position.set(0, -0.3, 0.9);
      this.roverGroup.add(this.magSensorBall);

      [-0.22, 0.22].forEach((x) => {
        const ball = new THREE.Mesh(
          ledGeom,
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
        );
        ball.position.set(x, 0.58, 0.1);
        this.roverGroup.add(ball);
        this.irSensorBalls.push(ball);
      });
    }

    // Load GLTF Parts
    const loader = makeGLTFLoader();
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
        if (!/RoverBody\.glb$/.test(url)) root.scale.setScalar(0.5);
        root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

        if (/RoverWheel\.glb$/.test(url)) {
          root.scale.multiplyScalar(0.8);
          this.wheelR = root;
          this.wheelL = root.clone();
          this.wheelR.rotation.y = Math.PI / 2;
          this.wheelL.rotation.y = Math.PI / 2;
          this.wheelR.position.set( 0.7, 0, -0.3);
          this.wheelL.position.set(-0.7, 0, -0.3);
          this.roverGroup.add(this.wheelR, this.wheelL);
        } else if (/RoverRadar\.glb$/.test(url)) {
          root.scale.multiplyScalar(0.5);
          root.scale.multiplyScalar(0.8);
          root.position.set(0, 0.5, -0.9);
          this.antennaPivot = root;
          this.roverGroup.add(root);
        } else if (/RoverLED\.glb$/.test(url)) {
          root.position.set(0, 0.35, 0.2);
          root.rotation.x = Math.PI / 4;
          this.roverGroup.add(root);
        } else if (/RoverHead\.glb$/.test(url)) {
          root.position.set(0, 0.6, -0.3);
          root.rotation.y = Math.PI;
          this.roverGroup.add(root);
        } else if (/RoverGun\.glb$/.test(url)) {
          root.position.set(0.55, 0.5, -0.5);
          root.rotation.y = Math.PI / 2;
          this.roverGroup.add(root);
          this.gunMesh = root;
          {
            const bbox = new THREE.Box3().setFromObject(root);
            const size = bbox.getSize(new THREE.Vector3());
            const center = bbox.getCenter(new THREE.Vector3());
            let ax = 0;
            if (size.y > size.x && size.y > size.z) ax = 1;
            else if (size.z > size.x) ax = 2;
            const minV = bbox.min.getComponent(ax);
            const maxV = bbox.max.getComponent(ax);
            const muzzleEnd = Math.abs(maxV) > Math.abs(minV) ? minV : maxV;
            this.muzzleWorldPos.copy(center);
            this.muzzleWorldPos.setComponent(ax, muzzleEnd);
            this.muzzleForward.set(0, 0, 0);
            this.muzzleForward.setComponent(ax, Math.sign(muzzleEnd - center.getComponent(ax)) || -1);
          }
        } else if (/RoverOLED\.glb$/.test(url)) {
          root.position.set(0, 0.1, 0.5);
          root.rotation.x = -Math.PI / 6;
          {
            const probe = root.clone(true);
            probe.position.set(0, 0, 0); probe.rotation.set(0, 0, 0); probe.scale.set(1, 1, 1);
            const box = new THREE.Box3().setFromObject(probe);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            this.oledCanvas = document.createElement('canvas');
            this.oledCanvas.width = 128 * 4;
            this.oledCanvas.height = 64 * 4;
            this.oledCtx = this.oledCanvas.getContext('2d');
            this.oledClear();
            this.oledText(0, 0, 'ARES READY');
            this.oledTex = new THREE.CanvasTexture(this.oledCanvas);
            this.oledTex.colorSpace = THREE.SRGBColorSpace;
            this.oledTex.magFilter = THREE.NearestFilter;
            this.oledTex.minFilter = THREE.NearestFilter;
            const w = size.x * 0.85 * 0.95 * 0.95 * 0.9;
            const h = w * (this.oledCanvas.height / this.oledCanvas.width);
            const screen = new THREE.Mesh(
              new THREE.PlaneGeometry(w, h),
              new THREE.MeshBasicMaterial({ map: this.oledTex, side: THREE.DoubleSide })
            );
            const pivot = new THREE.Group();
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
  }

  // Getters/setters delegating properties to respective subsystems
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

  // Control Methods
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

  update(dt) {
    // 1) Radar rotation
    if (this.movement.radarOn && this.movement.antennaPivot) {
      this.movement.antennaPivot.rotation.y += 0.15 * this.movement.radarDir;
    }
    
    // 2) Wheel spin animation during movement
    if (this.movement.servoOn && this.movement.wheelR && this.movement.wheelL) {
      const amt = 4.0 * dt * this.movement.servoDir;
      this.movement.wheelR.rotation.x += amt;
      this.movement.wheelL.rotation.x += amt;
    }

    // 3) Servo turn translation/rotation
    if (this.movement.servoOn || this.movement.servoTurnOn) {
      const THREE = this.ctx.THREE;
      if (this.movement.servoOn) {
        const dirVec = new THREE.Vector3(0, 0, 1).applyQuaternion(this.roverGroup.quaternion);
        this.roverGroup.position.addScaledVector(dirVec, 1.2 * dt * this.movement.servoDir);
      }
      if (this.movement.servoTurnOn) {
        this.roverGroup.rotateY(0.9 * dt * this.movement.servoTurnDir);
      }
    }

    // 4) Gun animations
    this.gun.updateMuzzleFlash(dt);
    this.gun.updateGunSmoke(dt);

    // 5) Waves update
    this.waves.updateWaves(dt);
  }

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

  get hasRoverLeds() { return this.leds.roverLeds.length > 0; }
  get hasDistanceSensor() { return this.movement.irSensorBalls.length > 0; }
  get hasServo() { return !!this.ctx.worldGroup; }
  get hasRadar() { return !!this.movement.antennaPivot; }
  get hasGun() { return !!this.gun.gunMesh; }
  get hasOled() { return !!this.oled.oledCanvas; }
  get hasRoverWave() { return !!this.ctx.worldGroup; }
  get servoActive() { return this.movement.servoOn || this.movement.servoTurnOn; }
}
