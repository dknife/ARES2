// Simulation_Rover.js
// Subsystem for the Rover (rover) topic.

let gunNoiseBuffer = null;
let activeGunSources = [];

export function playGunFire(audioCtx) {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime + 0.005; // 5ms lead-in
    if (!gunNoiseBuffer) {
      const bufLen = Math.floor(audioCtx.sampleRate * 1.5);
      gunNoiseBuffer = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
      const data = gunNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    }
    for (const s of activeGunSources) { try { s.stop(); } catch {} }
    activeGunSources = [];

    // 저역 boom
    const boomSrc = audioCtx.createBufferSource(); boomSrc.buffer = gunNoiseBuffer;
    const boomLp = audioCtx.createBiquadFilter(); boomLp.type = 'lowpass'; boomLp.frequency.value = 280;
    const boomGain = audioCtx.createGain();
    boomSrc.connect(boomLp); boomLp.connect(boomGain); boomGain.connect(audioCtx.destination);
    boomGain.gain.setValueAtTime(0.0001, t0);
    boomGain.gain.linearRampToValueAtTime(0.75, t0 + 0.003);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.70);

    // 고역 crack
    const crackSrc = audioCtx.createBufferSource(); crackSrc.buffer = gunNoiseBuffer;
    const crackHp = audioCtx.createBiquadFilter(); crackHp.type = 'highpass'; crackHp.frequency.value = 2000;
    const crackGain = audioCtx.createGain();
    crackSrc.connect(crackHp); crackHp.connect(crackGain); crackGain.connect(audioCtx.destination);
    crackGain.gain.setValueAtTime(0.0001, t0);
    crackGain.gain.linearRampToValueAtTime(0.5, t0 + 0.002);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);

    // 초저역 rumble
    const rumbleSrc = audioCtx.createBufferSource(); rumbleSrc.buffer = gunNoiseBuffer;
    const rumbleLp = audioCtx.createBiquadFilter(); rumbleLp.type = 'lowpass';
    rumbleLp.frequency.setValueAtTime(160, t0);
    rumbleLp.frequency.exponentialRampToValueAtTime(70, t0 + 1.1);
    const rumbleGain = audioCtx.createGain();
    rumbleSrc.connect(rumbleLp); rumbleLp.connect(rumbleGain); rumbleGain.connect(audioCtx.destination);
    rumbleGain.gain.setValueAtTime(0.0001, t0);
    rumbleGain.gain.linearRampToValueAtTime(0.35, t0 + 0.04);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.10);

    boomSrc.start(t0);   boomSrc.stop(t0 + 0.75);
    crackSrc.start(t0);  crackSrc.stop(t0 + 0.10);
    rumbleSrc.start(t0); rumbleSrc.stop(t0 + 1.15);
    activeGunSources.push(boomSrc, crackSrc, rumbleSrc);
  } catch (e) {
    console.warn('gun fire sound 실패:', e);
  }
}

export class RoverSubsystem {
  constructor(ctx, makeGLTFLoader, OLED_ICONS) {
    this.ctx = ctx;
    this.makeGLTFLoader = makeGLTFLoader;
    this.OLED_ICONS = OLED_ICONS;

    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const camera = ctx.camera;
    const controls = ctx.controls;
    const cfg = ctx.cfg;

    this.roverGroup = new THREE.Group();
    this.roverGroup.position.y = 0.4;
    scene.add(this.roverGroup);

    this.worldGroup = ctx.worldGroup;
    this.boxes = [];
    this.roverLeds = [];
    this.magSensorBall = null;
    this.irSensorBalls = [];
    this.wheelR = null;
    this.wheelL = null;
    this.antennaPivot = null;

    // Obstacle constants
    this.BOX_SPAWN_RANGE = 50;
    this.BOX_CLEAR_R = 5;
    this.obstaclesOn = true;
    this.BOX_COLLIDE_R = 1.5;

    // OLED state
    this.OLED_W = 128;
    this.OLED_H = 64;
    this.OLED_SCALE = 4;
    this.OLED_CHAR_W = 8;
    this.OLED_CHAR_H = 8;
    this.oledCanvas = null;
    this.oledCtx = null;
    this.oledTex = null;

    // Gun state
    this.gunMesh = null;
    this.muzzleFlash = null;
    this.muzzleFlashSphere = null;
    this.muzzleFlashLight = null;
    this.muzzleSparks = [];
    this.muzzleFlashT = 0;
    this.MUZZLE_DUR = 0.35;
    this.muzzleWorldPos = new THREE.Vector3();
    this.muzzleForward = new THREE.Vector3();

    // Gun smoke
    this.gunSmokeGroup = null;
    this.smokeTex = null;
    this.gunSmokePool = [];
    this.GUN_SMOKE_POOL = 18;
    this.GUN_SMOKE_BURST = 12;
    this.GUN_SMOKE_BURST_DUR = 0.18;
    this.gunSmokeRemaining = 0;
    this.gunSmokeAcc = 0;

    // Movement state
    this.SERVO_WORLD_SPEED = 1.2;
    this.SERVO_WHEEL_SPIN  = 4.0;
    this.SERVO_TURN_SPEED  = 0.9;
    this.SERVO_X_AXIS = new THREE.Vector3(1, 0, 0);
    this.SERVO_Y_AXIS = new THREE.Vector3(0, 1, 0);
    this.SERVO_TURN_PIVOT = new THREE.Vector3(0, 0, -0.3);
    this.servoOn = false;
    this.servoDir = 1;
    this.servoTurnOn = false;
    this.servoTurnDir = 1;

    // Distance Sensor state
    this.DIST_RAY = new THREE.Raycaster();
    this.DIST_DIR = new THREE.Vector3(0, 0, 1);
    this._distOrigin = new THREE.Vector3();
    this.DIST_NO_HIT = 999;
    this.DIST_BOX_INFLATE = 2.0;

    // Radar state
    this.radarOn = false;
    this.radarDir = 1;

    // Rover Waves state
    this.ROVER_SPEAKERS = [
      new THREE.Vector3(-0.5, 0.3, 0.6),
      new THREE.Vector3( 0.5, 0.3, 0.6),
    ];
    this.ROVER_WAVE_BASE_R    = 0.15;
    this.ROVER_WAVE_MAX_SCALE = 7;
    this.WAVE_SPAWN_INTERVAL = 0.18;
    this.WAVE_LIFETIME       = 1.4;
    this.WAVE_OPACITY        = 0.16;
    this.WAVE_COLOR          = 0x88ddff;
    this.roverWaveOn = false;
    this.roverWaveSpawnTimer = 0;
    this.roverWaveRings = [];

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
      ctx.worldGroup = this.worldGroup; // update main context

      // Random boxes
      const BOX_COUNT = 150;
      const boxGeom = new THREE.BoxGeometry(1, 2, 1);
      for (let i = 0; i < BOX_COUNT; i++) {
        let x = 0, z = 0;
        do {
          x = (Math.random() * 2 - 1) * this.BOX_SPAWN_RANGE;
          z = (Math.random() * 2 - 1) * this.BOX_SPAWN_RANGE;
        } while (Math.hypot(x, z) < this.BOX_CLEAR_R);
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
            this.oledCanvas.width = this.OLED_W * this.OLED_SCALE;
            this.oledCanvas.height = this.OLED_H * this.OLED_SCALE;
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

  // OLED helpers
  oledClear() {
    if (!this.oledCtx) return;
    this.oledCtx.fillStyle = '#000814';
    this.oledCtx.fillRect(0, 0, this.oledCanvas.width, this.oledCanvas.height);
    if (this.oledTex) this.oledTex.needsUpdate = true;
  }

  oledClearRect(x, y, w, h) {
    if (!this.oledCtx) return;
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.OLED_W, x + w), y1 = Math.min(this.OLED_H, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    this.oledCtx.fillStyle = '#000814';
    this.oledCtx.fillRect(x0 * this.OLED_SCALE, y0 * this.OLED_SCALE, (x1 - x0) * this.OLED_SCALE, (y1 - y0) * this.OLED_SCALE);
    if (this.oledTex) this.oledTex.needsUpdate = true;
  }

  oledText(x, y, text) {
    if (!this.oledCtx) return;
    this.oledCtx.fillStyle = '#7dffff';
    this.oledCtx.font = `bold ${this.OLED_CHAR_H * this.OLED_SCALE}px monospace`;
    this.oledCtx.textAlign = 'left'; this.oledCtx.textBaseline = 'top';
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      const ox = x + i * this.OLED_CHAR_W;
      if (ox >= this.OLED_W) break;
      this.oledCtx.fillText(s[i], ox * this.OLED_SCALE, y * this.OLED_SCALE);
    }
    if (this.oledTex) this.oledTex.needsUpdate = true;
  }

  oledIcon(name, x, y) {
    if (!this.oledCtx) return;
    const bm = this.OLED_ICONS[name];
    if (!bm) return;
    this.oledCtx.fillStyle = '#7dffff';
    for (let row = 0; row < 32; row++) {
      for (let bc = 0; bc < 4; bc++) {
        const byte = bm[row * 4 + bc];
        if (!byte) continue;
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (1 << (7 - bit))) {
            const px = x + bc * 8 + bit;
            const py = y + row;
            if (px >= 0 && px < this.OLED_W && py >= 0 && py < this.OLED_H) {
              this.oledCtx.fillRect(px * this.OLED_SCALE, py * this.OLED_SCALE, this.OLED_SCALE, this.OLED_SCALE);
            }
          }
        }
      }
    }
    if (this.oledTex) this.oledTex.needsUpdate = true;
  }

  // Gun and muzzle flash
  ensureMuzzleFlash() {
    const THREE = this.ctx.THREE;
    if (this.muzzleFlash || !this.gunMesh) return;
    this.muzzleFlash = new THREE.Group();
    this.muzzleFlashSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffd980, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    this.muzzleFlash.add(this.muzzleFlashSphere);
    this.muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 3, 2);
    this.muzzleFlash.add(this.muzzleFlashLight);
    for (let i = 0; i < 12; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 6, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffeeaa, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      this.muzzleFlash.add(spark);
      this.muzzleSparks.push({ mesh: spark, vel: new THREE.Vector3(), age: 0 });
    }
    this.ctx.scene.add(this.muzzleFlash);
    this.muzzleFlash.visible = false;
  }

  setGunFire() {
    if (!this.gunMesh)
      return;
    this.ensureMuzzleFlash();
    this.muzzleFlash.position.copy(this.muzzleWorldPos);
    for (const sp of this.muzzleSparks) {
      sp.mesh.position.set(0, 0, 0);
      const speed = 1.0 + Math.random() * 1.6;
      sp.vel.copy(this.muzzleForward).multiplyScalar(speed);
      sp.vel.x += (Math.random() - 0.5) * 0.8;
      sp.vel.y += (Math.random() - 0.5) * 0.6;
      sp.vel.z += (Math.random() - 0.5) * 0.8;
      sp.age = 0;
      sp.mesh.material.opacity = 1;
    }
    this.muzzleFlashT = 0.0001;
    this.muzzleFlash.visible = true;
    this.gunSmokeRemaining = this.GUN_SMOKE_BURST;
    this.gunSmokeAcc = 0;
  }

  updateMuzzleFlash(dt) {
    if (this.muzzleFlashT <= 0 || !this.muzzleFlash) return;
    this.muzzleFlashT += dt;
    if (this.muzzleFlashT >= this.MUZZLE_DUR) {
      this.muzzleFlashT = 0;
      this.muzzleFlash.visible = false;
      return;
    }
    const t = this.muzzleFlashT / this.MUZZLE_DUR;
    const flashI = (1 - t) * (1 - t);
    this.muzzleFlashSphere.material.opacity = flashI * 0.95;
    this.muzzleFlashSphere.scale.setScalar(0.7 + t * 1.8);
    this.muzzleFlashLight.intensity = 5 * flashI;
    for (const sp of this.muzzleSparks) {
      sp.age += dt;
      sp.mesh.position.add(sp.vel.clone().multiplyScalar(dt));
      sp.vel.multiplyScalar(0.92);
      sp.vel.y -= 2.5 * dt;
      sp.mesh.material.opacity = Math.max(0, 1 - sp.age / 0.3);
    }
  }

  makeSmokeTex() {
    const THREE = this.ctx.THREE;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const blob = (px, py, r, a) => {
      const g = cx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0.0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.5, `rgba(244,246,250,${a * 0.55})`);
      g.addColorStop(1.0, 'rgba(232,236,244,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(px, py, r, 0, Math.PI * 2); cx.fill();
    };
    blob(64, 64, 46, 0.92);
    blob(44, 54, 30, 0.7); blob(82, 56, 28, 0.7);
    blob(54, 82, 26, 0.62); blob(82, 82, 24, 0.62);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  ensureGunSmoke() {
    const THREE = this.ctx.THREE;
    if (this.gunSmokeGroup || !this.gunMesh) return;
    this.smokeTex = this.makeSmokeTex();
    this.gunSmokeGroup = new THREE.Group();
    this.ctx.scene.add(this.gunSmokeGroup);
    for (let i = 0; i < this.GUN_SMOKE_POOL; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.smokeTex, color: 0xd8dde6, transparent: true,
        depthWrite: false, opacity: 0,
      }));
      sp.visible = false;
      this.gunSmokeGroup.add(sp);
      this.gunSmokePool.push({ sprite: sp, active: false, age: 0, life: 1, vel: new THREE.Vector3(),
                          scale0: 0.06, scaleMax: 0.5, rot: 0, rotSpeed: 0 });
    }
  }

  spawnGunSmoke() {
    const p = this.gunSmokePool.find((q) => !q.active);
    if (!p) return;
    p.active = true; p.age = 0;
    p.life = 1.2 + Math.random() * 0.9;
    p.sprite.position.copy(this.muzzleWorldPos);
    p.sprite.position.x += (Math.random() - 0.5) * 0.06;
    p.sprite.position.y += (Math.random() - 0.5) * 0.06;
    p.sprite.position.z += (Math.random() - 0.5) * 0.06;

    const spd = 0.7 + Math.random() * 0.5;
    p.vel.copy(this.muzzleForward).multiplyScalar(spd);
    p.vel.x += (Math.random() - 0.5) * 0.45;
    p.vel.y += 0.15 + Math.random() * 0.25;
    p.vel.z += (Math.random() - 0.5) * 0.45;
    p.scale0  = 0.08 + Math.random() * 0.08;
    p.scaleMax = 0.45 + Math.random() * 0.45;
    p.rot = Math.random() * Math.PI * 2;
    p.rotSpeed = (Math.random() - 0.5) * 1.2;
    p.sprite.material.opacity = 0;
    p.sprite.material.rotation = p.rot;
    p.sprite.scale.set(p.scale0, p.scale0, 1);
    p.sprite.visible = true;
  }

  updateGunSmoke(dt) {
    this.ensureGunSmoke();
    if (!this.gunSmokeGroup) return;
    if (this.gunSmokeRemaining > 0) {
      this.gunSmokeAcc += dt;
      const alreadySpawned = this.GUN_SMOKE_BURST - this.gunSmokeRemaining;
      const targetSpawned = Math.min(this.GUN_SMOKE_BURST, Math.ceil(this.GUN_SMOKE_BURST * this.gunSmokeAcc / this.GUN_SMOKE_BURST_DUR));
      let toSpawn = targetSpawned - alreadySpawned;
      while (toSpawn-- > 0 && this.gunSmokeRemaining > 0) {
        this.spawnGunSmoke();
        this.gunSmokeRemaining--;
      }
    }
    for (const p of this.gunSmokePool) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { p.active = false; p.sprite.visible = false; continue; }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
      p.vel.y += 0.4 * dt;
      const grow = 1 - (1 - t) * (1 - t);
      const s = p.scale0 + (p.scaleMax - p.scale0) * grow;
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = Math.min(1, t * 8) * (1 - t) * 0.7;
      p.rot += p.rotSpeed * dt;
      p.sprite.material.rotation = p.rot;
    }
  }

  // Rover LEDs
  setRoverLed(num, value) {
    const ball = this.roverLeds[num];
    if (!ball) return;
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    const m = ball.material;
    if (v > 0) {
      m.color.setHex(0x00ff22);
      m.emissive.setHex(0x00ff22);
      m.emissiveIntensity = 0.9 * v;
      m.opacity = 0.6 + 0.4 * v;
    } else {
      m.color.setHex(0xffffff);
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      m.opacity = 0.25;
    }
  }

  // Servo movement and turning
  setServoMove(on, dir) {
    this.servoOn = !!on;
    if (this.servoOn) this.servoTurnOn = false;
    if (dir !== undefined && dir !== null) this.servoDir = dir < 0 ? -1 : 1;
  }

  setServoTurn(on, dir) {
    this.servoTurnOn = !!on;
    if (this.servoTurnOn) this.servoOn = false;
    if (dir !== undefined && dir !== null) this.servoTurnDir = dir < 0 ? -1 : 1;
  }

  stopServo() {
    this.servoOn = false;
    this.servoTurnOn = false;
  }

  nearestBoxDist() {
    if (!this.obstaclesOn) return Infinity;
    const THREE = this.ctx.THREE;
    const boxTmp = new THREE.Vector3();
    let m = Infinity;
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].getWorldPosition(boxTmp);
      const d = Math.hypot(boxTmp.x, boxTmp.z);
      if (d < m) m = d;
    }
    return m;
  }

  respawnBoxes() {
    if (!this.worldGroup) return;
    this.worldGroup.position.set(0, 0, 0);
    this.worldGroup.quaternion.identity();
    for (let i = 0; i < this.boxes.length; i++) {
      let x = 0, z = 0;
      do {
        x = (Math.random() * 2 - 1) * this.BOX_SPAWN_RANGE;
        z = (Math.random() * 2 - 1) * this.BOX_SPAWN_RANGE;
      } while (Math.hypot(x, z) < this.BOX_CLEAR_R);
      this.boxes[i].position.set(x, 1, z);
    }
  }

  setObstacles(on) {
    this.obstaclesOn = !!on;
    for (let i = 0; i < this.boxes.length; i++) this.boxes[i].visible = this.obstaclesOn;
  }

  // Distance Sensor
  setDistanceSensor(on) {
    for (let i = 0; i < this.irSensorBalls.length; i++) {
      const m = this.irSensorBalls[i].material;
      if (on) { m.color.setHex(0xff2222); m.emissive.setHex(0xff2222); m.emissiveIntensity = 2.6; m.opacity = 0.9; }
      else    { m.color.setHex(0xffffff); m.emissive.setHex(0x000000); m.emissiveIntensity = 0;   m.opacity = 0.25; }
    }
  }

  measureDistance() {
    if (this.irSensorBalls.length === 0 || !this.obstaclesOn) return this.DIST_NO_HIT;
    for (let i = 0; i < this.boxes.length; i++) this.boxes[i].scale.set(this.DIST_BOX_INFLATE, 1, this.DIST_BOX_INFLATE);
    if (this.worldGroup) this.worldGroup.updateMatrixWorld(true);
    let minDist = Infinity;
    for (let i = 0; i < this.irSensorBalls.length; i++) {
      this.irSensorBalls[i].getWorldPosition(this._distOrigin);
      this.DIST_RAY.set(this._distOrigin, this.DIST_DIR);
      const hits = this.DIST_RAY.intersectObjects(this.boxes, false);
      if (hits.length && hits[0].distance < minDist) minDist = hits[0].distance;
    }
    for (let i = 0; i < this.boxes.length; i++) this.boxes[i].scale.set(1, 1, 1);
    if (!isFinite(minDist)) return this.DIST_NO_HIT;
    return Math.round(minDist * 10);
  }

  // Radar
  setRadar(on, dir) {
    this.radarOn = !!on;
    if (dir !== undefined && dir !== null) this.radarDir = dir < 0 ? -1 : 1;
  }

  // Rover buzzer waves
  setRoverWave(on) {
    if (!this.worldGroup) return;
    this.roverWaveOn = !!on;
    if (!this.roverWaveOn) this.roverWaveSpawnTimer = 0;
  }

  spawnRoverWaves() {
    const THREE = this.ctx.THREE;
    for (let s = 0; s < this.ROVER_SPEAKERS.length; s++) {
      const geom = new THREE.SphereGeometry(this.ROVER_WAVE_BASE_R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: this.WAVE_COLOR, transparent: true, opacity: this.WAVE_OPACITY,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(this.ROVER_SPEAKERS[s]);
      this.ctx.scene.add(mesh);
      this.roverWaveRings.push({ mesh, age: 0 });
    }
  }

  updateRoverWaves(dt) {
    if (this.roverWaveOn) {
      this.roverWaveSpawnTimer += dt;
      while (this.roverWaveSpawnTimer >= this.WAVE_SPAWN_INTERVAL) {
        this.roverWaveSpawnTimer -= this.WAVE_SPAWN_INTERVAL;
        this.spawnRoverWaves();
      }
    }
    for (let i = this.roverWaveRings.length - 1; i >= 0; i--) {
      const r = this.roverWaveRings[i];
      r.age += dt;
      const t = r.age / this.WAVE_LIFETIME;
      if (t >= 1) {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.ctx.scene.remove(r.mesh);
        this.roverWaveRings.splice(i, 1);
        continue;
      }
      const scale = 1 + t * (this.ROVER_WAVE_MAX_SCALE - 1);
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = (1 - t) * this.WAVE_OPACITY;
    }
  }

  // Update loop
  update(dt) {
    if (this.radarOn && this.antennaPivot) {
      this.antennaPivot.rotation.y += 0.15 * this.radarDir;
    }

    if (this.servoOn && this.worldGroup) {
      const dTheta = this.SERVO_WHEEL_SPIN * dt * this.servoDir;
      if (this.wheelR) this.wheelR.rotateOnWorldAxis(this.SERVO_X_AXIS, dTheta);
      if (this.wheelL) this.wheelL.rotateOnWorldAxis(this.SERVO_X_AXIS, dTheta);

      const before = this.nearestBoxDist();
      const savedZ = this.worldGroup.position.z;
      this.worldGroup.position.z -= this.SERVO_WORLD_SPEED * dt * this.servoDir;
      const after = this.nearestBoxDist();
      if (after < this.BOX_COLLIDE_R && after < before) this.worldGroup.position.z = savedZ;
    }

    if (this.servoTurnOn && this.worldGroup) {
      const dSpin = this.SERVO_WHEEL_SPIN * dt * this.servoTurnDir;
      if (this.wheelR) this.wheelR.rotateOnWorldAxis(this.SERVO_X_AXIS, -dSpin);
      if (this.wheelL) this.wheelL.rotateOnWorldAxis(this.SERVO_X_AXIS,  dSpin);

      const before = this.nearestBoxDist();
      const savedQ = this.worldGroup.quaternion.clone();
      const savedX = this.worldGroup.position.x, savedZ = this.worldGroup.position.z;
      const dYaw = -this.SERVO_TURN_SPEED * dt * this.servoTurnDir;
      this.worldGroup.rotateOnWorldAxis(this.SERVO_Y_AXIS, dYaw);
      this.worldGroup.position.sub(this.SERVO_TURN_PIVOT).applyAxisAngle(this.SERVO_Y_AXIS, dYaw).add(this.SERVO_TURN_PIVOT);
      const after = this.nearestBoxDist();
      if (after < this.BOX_COLLIDE_R && after < before) {
        this.worldGroup.quaternion.copy(savedQ);
        this.worldGroup.position.x = savedX; this.worldGroup.position.z = savedZ;
      }
    }

    if (this.worldGroup) this.updateRoverWaves(dt);
    this.updateMuzzleFlash(dt);
    if (this.gunMesh) this.updateGunSmoke(dt);
  }

  dispose() {
    try {
      this.gunSmokePool.forEach((p) => p.sprite?.material?.dispose?.());
      this.smokeTex?.dispose?.();
      this.oledTex?.dispose?.();
    } catch {}
    this.roverWaveRings.forEach((r) => {
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    });
  }

  get hasRoverLeds() { return this.roverLeds.length > 0; }
  get hasServo() { return !!this.worldGroup; }
  get servoActive() { return this.servoOn || this.servoTurnOn; }
  get hasDistanceSensor() { return this.irSensorBalls.length > 0; }
  get hasBoxes() { return this.boxes.length > 0; }
  get hasRadar() { return !!this.antennaPivot; }
  get hasRoverWave() { return !!this.worldGroup; }
  get hasOled() { return !!this.oledCanvas; }
  get hasGun() { return !!this.gunMesh; }
}
