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

export function initRover(ctx, makeGLTFLoader, OLED_ICONS) {
  const THREE = ctx.THREE;
  const scene = ctx.scene;
  const camera = ctx.camera;
  const controls = ctx.controls;
  const cfg = ctx.cfg;

  let roverGroup = new THREE.Group();
  roverGroup.position.y = 0.4;
  scene.add(roverGroup);

  let worldGroup = ctx.worldGroup;
  const boxes = [];
  const roverLeds = [];
  let magSensorBall = null;
  const irSensorBalls = [];
  let wheelR = null;
  let wheelL = null;
  let antennaPivot = null;

  // Obstacle constants
  const BOX_SPAWN_RANGE = 50;
  const BOX_CLEAR_R = 5;
  let obstaclesOn = true;

  // OLED state
  const OLED_W = 128, OLED_H = 64;
  const OLED_SCALE = 4;
  const OLED_CHAR_W = 8, OLED_CHAR_H = 8;
  let oledCanvas = null;
  let oledCtx = null;
  let oledTex = null;

  // Gun state
  let gunMesh = null;
  let muzzleFlash = null;
  let muzzleFlashSphere = null;
  let muzzleFlashLight = null;
  const muzzleSparks = [];
  let muzzleFlashT = 0;
  const MUZZLE_DUR = 0.35;
  const muzzleWorldPos = new THREE.Vector3();
  const muzzleForward = new THREE.Vector3();

  // Gun smoke
  let gunSmokeGroup = null;
  let smokeTex = null;
  const gunSmokePool = [];
  const GUN_SMOKE_POOL = 18;
  const GUN_SMOKE_BURST = 12;
  const GUN_SMOKE_BURST_DUR = 0.18;
  let gunSmokeRemaining = 0;
  let gunSmokeAcc = 0;

  // Movement state
  const SERVO_WORLD_SPEED = 1.2;
  const SERVO_WHEEL_SPIN  = 4.0;
  const SERVO_TURN_SPEED  = 0.9;
  const SERVO_X_AXIS = new THREE.Vector3(1, 0, 0);
  const SERVO_Y_AXIS = new THREE.Vector3(0, 1, 0);
  const SERVO_TURN_PIVOT = new THREE.Vector3(0, 0, -0.3);
  let servoOn = false;
  let servoDir = 1;
  let servoTurnOn = false;
  let servoTurnDir = 1;

  // Distance Sensor state
  const DIST_RAY = new THREE.Raycaster();
  const DIST_DIR = new THREE.Vector3(0, 0, 1);
  const _distOrigin = new THREE.Vector3();
  const DIST_NO_HIT = 999;
  const DIST_BOX_INFLATE = 2.0;

  // Radar state
  let radarOn = false;
  let radarDir = 1;

  // Rover Waves state
  const ROVER_SPEAKERS = [
    new THREE.Vector3(-0.5, 0.3, 0.6),
    new THREE.Vector3( 0.5, 0.3, 0.6),
  ];
  const ROVER_WAVE_BASE_R    = 0.15;
  const ROVER_WAVE_MAX_SCALE = 7;
  const WAVE_SPAWN_INTERVAL = 0.18;
  const WAVE_LIFETIME       = 1.4;
  const WAVE_OPACITY        = 0.16;
  const WAVE_COLOR          = 0x88ddff;
  let roverWaveOn = false;
  let roverWaveSpawnTimer = 0;
  const roverWaveRings = [];

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

    worldGroup = new THREE.Group();
    worldGroup.add(floor, grid);
    ctx.worldGroup = worldGroup; // update main context

    // Random boxes
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
      worldGroup.add(box);
      boxes.push(box);
    }
    scene.add(worldGroup);

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
      roverGroup.add(ball);
      roverLeds.push(ball);
    }

    magSensorBall = new THREE.Mesh(
      ledGeom,
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
    );
    magSensorBall.position.set(0, -0.3, 0.9);
    roverGroup.add(magSensorBall);

    [-0.22, 0.22].forEach((x) => {
      const ball = new THREE.Mesh(
        ledGeom,
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
      );
      ball.position.set(x, 0.58, 0.1);
      roverGroup.add(ball);
      irSensorBalls.push(ball);
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
        wheelR = root;
        wheelL = root.clone();
        wheelR.rotation.y = Math.PI / 2;
        wheelL.rotation.y = Math.PI / 2;
        wheelR.position.set( 0.7, 0, -0.3);
        wheelL.position.set(-0.7, 0, -0.3);
        roverGroup.add(wheelR, wheelL);
      } else if (/RoverRadar\.glb$/.test(url)) {
        root.scale.multiplyScalar(0.5);
        root.scale.multiplyScalar(0.8);
        root.position.set(0, 0.5, -0.9);
        antennaPivot = root;
        roverGroup.add(root);
      } else if (/RoverLED\.glb$/.test(url)) {
        root.position.set(0, 0.35, 0.2);
        root.rotation.x = Math.PI / 4;
        roverGroup.add(root);
      } else if (/RoverHead\.glb$/.test(url)) {
        root.position.set(0, 0.6, -0.3);
        root.rotation.y = Math.PI;
        roverGroup.add(root);
      } else if (/RoverGun\.glb$/.test(url)) {
        root.position.set(0.55, 0.5, -0.5);
        root.rotation.y = Math.PI / 2;
        roverGroup.add(root);
        gunMesh = root;
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
          muzzleWorldPos.copy(center);
          muzzleWorldPos.setComponent(ax, muzzleEnd);
          muzzleForward.set(0, 0, 0);
          muzzleForward.setComponent(ax, Math.sign(muzzleEnd - center.getComponent(ax)) || -1);
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

          oledCanvas = document.createElement('canvas');
          oledCanvas.width = OLED_W * OLED_SCALE;
          oledCanvas.height = OLED_H * OLED_SCALE;
          oledCtx = oledCanvas.getContext('2d');
          oledClear();
          oledText(0, 0, 'ARES READY');
          oledTex = new THREE.CanvasTexture(oledCanvas);
          oledTex.colorSpace = THREE.SRGBColorSpace;
          oledTex.magFilter = THREE.NearestFilter;
          oledTex.minFilter = THREE.NearestFilter;
          const w = size.x * 0.85 * 0.95 * 0.95 * 0.9;
          const h = w * (oledCanvas.height / oledCanvas.width);
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ map: oledTex, side: THREE.DoubleSide })
          );
          const pivot = new THREE.Group();
          pivot.position.set(center.x, center.y - h / 2, box.max.z + 0.001);
          pivot.rotation.x = -Math.PI / 12;
          screen.position.set(0, h / 2, 0);
          pivot.add(screen);
          root.add(pivot);
          root.userData.oledScreen = screen;
        }
        roverGroup.add(root);
      } else {
        roverGroup.add(root);
      }
      if (--remaining === 0 && ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = 'none';
    }, undefined, (err) => {
      console.error('부속 로드 실패:', url, err);
      if (--remaining === 0 && ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = 'none';
    });
  });

  // OLED helpers
  function oledClear() {
    if (!oledCtx) return;
    oledCtx.fillStyle = '#000814';
    oledCtx.fillRect(0, 0, oledCanvas.width, oledCanvas.height);
    if (oledTex) oledTex.needsUpdate = true;
  }
  function oledClearRect(x, y, w, h) {
    if (!oledCtx) return;
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(OLED_W, x + w), y1 = Math.min(OLED_H, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    oledCtx.fillStyle = '#000814';
    oledCtx.fillRect(x0 * OLED_SCALE, y0 * OLED_SCALE, (x1 - x0) * OLED_SCALE, (y1 - y0) * OLED_SCALE);
    if (oledTex) oledTex.needsUpdate = true;
  }
  function oledText(x, y, text) {
    if (!oledCtx) return;
    oledCtx.fillStyle = '#7dffff';
    oledCtx.font = `bold ${OLED_CHAR_H * OLED_SCALE}px monospace`;
    oledCtx.textAlign = 'left'; oledCtx.textBaseline = 'top';
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      const ox = x + i * OLED_CHAR_W;
      if (ox >= OLED_W) break;
      oledCtx.fillText(s[i], ox * OLED_SCALE, y * OLED_SCALE);
    }
    if (oledTex) oledTex.needsUpdate = true;
  }
  function oledIcon(name, x, y) {
    if (!oledCtx) return;
    const bm = OLED_ICONS[name];
    if (!bm) return;
    oledCtx.fillStyle = '#7dffff';
    for (let row = 0; row < 32; row++) {
      for (let bc = 0; bc < 4; bc++) {
        const byte = bm[row * 4 + bc];
        if (!byte) continue;
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (1 << (7 - bit))) {
            const px = x + bc * 8 + bit;
            const py = y + row;
            if (px >= 0 && px < OLED_W && py >= 0 && py < OLED_H) {
              oledCtx.fillRect(px * OLED_SCALE, py * OLED_SCALE, OLED_SCALE, OLED_SCALE);
            }
          }
        }
      }
    }
    if (oledTex) oledTex.needsUpdate = true;
  }

  // Gun and muzzle flash
  function ensureMuzzleFlash() {
    if (muzzleFlash || !gunMesh) return;
    muzzleFlash = new THREE.Group();
    muzzleFlashSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffd980, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    muzzleFlash.add(muzzleFlashSphere);
    muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 3, 2);
    muzzleFlash.add(muzzleFlashLight);
    for (let i = 0; i < 12; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 6, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffeeaa, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      muzzleFlash.add(spark);
      muzzleSparks.push({ mesh: spark, vel: new THREE.Vector3(), age: 0 });
    }
    scene.add(muzzleFlash);
    muzzleFlash.visible = false;
  }

  function setGunFire() {
    if (!gunMesh) return;
    ensureMuzzleFlash();
    muzzleFlash.position.copy(muzzleWorldPos);
    for (const sp of muzzleSparks) {
      sp.mesh.position.set(0, 0, 0);
      const speed = 1.0 + Math.random() * 1.6;
      sp.vel.copy(muzzleForward).multiplyScalar(speed);
      sp.vel.x += (Math.random() - 0.5) * 0.8;
      sp.vel.y += (Math.random() - 0.5) * 0.6;
      sp.vel.z += (Math.random() - 0.5) * 0.8;
      sp.age = 0;
      sp.mesh.material.opacity = 1;
    }
    muzzleFlashT = 0.0001;
    muzzleFlash.visible = true;
    gunSmokeRemaining = GUN_SMOKE_BURST;
    gunSmokeAcc = 0;
  }

  function updateMuzzleFlash(dt) {
    if (muzzleFlashT <= 0 || !muzzleFlash) return;
    muzzleFlashT += dt;
    if (muzzleFlashT >= MUZZLE_DUR) {
      muzzleFlashT = 0;
      muzzleFlash.visible = false;
      return;
    }
    const t = muzzleFlashT / MUZZLE_DUR;
    const flashI = (1 - t) * (1 - t);
    muzzleFlashSphere.material.opacity = flashI * 0.95;
    muzzleFlashSphere.scale.setScalar(0.7 + t * 1.8);
    muzzleFlashLight.intensity = 5 * flashI;
    for (const sp of muzzleSparks) {
      sp.age += dt;
      sp.mesh.position.add(sp.vel.clone().multiplyScalar(dt));
      sp.vel.multiplyScalar(0.92);
      sp.vel.y -= 2.5 * dt;
      sp.mesh.material.opacity = Math.max(0, 1 - sp.age / 0.3);
    }
  }

  const makeSmokeTex = () => {
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
  };

  function ensureGunSmoke() {
    if (gunSmokeGroup || !gunMesh) return;
    smokeTex = makeSmokeTex();
    gunSmokeGroup = new THREE.Group();
    scene.add(gunSmokeGroup);
    for (let i = 0; i < GUN_SMOKE_POOL; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, color: 0xd8dde6, transparent: true,
        depthWrite: false, opacity: 0,
      }));
      sp.visible = false;
      gunSmokeGroup.add(sp);
      gunSmokePool.push({ sprite: sp, active: false, age: 0, life: 1, vel: new THREE.Vector3(),
                          scale0: 0.06, scaleMax: 0.5, rot: 0, rotSpeed: 0 });
    }
  }

  function spawnGunSmoke() {
    const p = gunSmokePool.find((q) => !q.active);
    if (!p) return;
    p.active = true; p.age = 0;
    p.life = 1.2 + Math.random() * 0.9;
    p.sprite.position.copy(muzzleWorldPos);
    p.sprite.position.x += (Math.random() - 0.5) * 0.06;
    p.sprite.position.y += (Math.random() - 0.5) * 0.06;
    p.sprite.position.z += (Math.random() - 0.5) * 0.06;

    const spd = 0.7 + Math.random() * 0.5;
    p.vel.copy(muzzleForward).multiplyScalar(spd);
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

  function updateGunSmoke(dt) {
    ensureGunSmoke();
    if (!gunSmokeGroup) return;
    if (gunSmokeRemaining > 0) {
      gunSmokeAcc += dt;
      const alreadySpawned = GUN_SMOKE_BURST - gunSmokeRemaining;
      const targetSpawned = Math.min(GUN_SMOKE_BURST, Math.ceil(GUN_SMOKE_BURST * gunSmokeAcc / GUN_SMOKE_BURST_DUR));
      let toSpawn = targetSpawned - alreadySpawned;
      while (toSpawn-- > 0 && gunSmokeRemaining > 0) {
        spawnGunSmoke();
        gunSmokeRemaining--;
      }
    }
    for (const p of gunSmokePool) {
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
  function setRoverLed(num, value) {
    const ball = roverLeds[num];
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
  function setServoMove(on, dir) {
    servoOn = !!on;
    if (servoOn) servoTurnOn = false;
    if (dir !== undefined && dir !== null) servoDir = dir < 0 ? -1 : 1;
  }

  function setServoTurn(on, dir) {
    servoTurnOn = !!on;
    if (servoTurnOn) servoOn = false;
    if (dir !== undefined && dir !== null) servoTurnDir = dir < 0 ? -1 : 1;
  }

  function stopServo() {
    servoOn = false;
    servoTurnOn = false;
  }

  // Collision
  const BOX_COLLIDE_R = 1.5;
  const _boxTmp = new THREE.Vector3();
  function nearestBoxDist() {
    if (!obstaclesOn) return Infinity;
    let m = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      boxes[i].getWorldPosition(_boxTmp);
      const d = Math.hypot(_boxTmp.x, _boxTmp.z);
      if (d < m) m = d;
    }
    return m;
  }

  function respawnBoxes() {
    if (!worldGroup) return;
    worldGroup.position.set(0, 0, 0);
    worldGroup.quaternion.identity();
    for (let i = 0; i < boxes.length; i++) {
      let x = 0, z = 0;
      do {
        x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
      } while (Math.hypot(x, z) < BOX_CLEAR_R);
      boxes[i].position.set(x, 1, z);
    }
  }

  function setObstacles(on) {
    obstaclesOn = !!on;
    for (let i = 0; i < boxes.length; i++) boxes[i].visible = obstaclesOn;
  }

  // Distance Sensor
  function setDistanceSensor(on) {
    for (let i = 0; i < irSensorBalls.length; i++) {
      const m = irSensorBalls[i].material;
      if (on) { m.color.setHex(0xff2222); m.emissive.setHex(0xff2222); m.emissiveIntensity = 2.6; m.opacity = 0.9; }
      else    { m.color.setHex(0xffffff); m.emissive.setHex(0x000000); m.emissiveIntensity = 0;   m.opacity = 0.25; }
    }
  }

  function measureDistance() {
    if (irSensorBalls.length === 0 || !obstaclesOn) return DIST_NO_HIT;
    for (let i = 0; i < boxes.length; i++) boxes[i].scale.set(DIST_BOX_INFLATE, 1, DIST_BOX_INFLATE);
    if (worldGroup) worldGroup.updateMatrixWorld(true);
    let minDist = Infinity;
    for (let i = 0; i < irSensorBalls.length; i++) {
      irSensorBalls[i].getWorldPosition(_distOrigin);
      DIST_RAY.set(_distOrigin, DIST_DIR);
      const hits = DIST_RAY.intersectObjects(boxes, false);
      if (hits.length && hits[0].distance < minDist) minDist = hits[0].distance;
    }
    for (let i = 0; i < boxes.length; i++) boxes[i].scale.set(1, 1, 1);
    if (!isFinite(minDist)) return DIST_NO_HIT;
    return Math.round(minDist * 10);
  }

  // Radar
  function setRadar(on, dir) {
    radarOn = !!on;
    if (dir !== undefined && dir !== null) radarDir = dir < 0 ? -1 : 1;
  }

  // Rover buzzer waves
  function setRoverWave(on) {
    if (!worldGroup) return;
    roverWaveOn = !!on;
    if (!roverWaveOn) roverWaveSpawnTimer = 0;
  }

  function spawnRoverWaves() {
    for (let s = 0; s < ROVER_SPEAKERS.length; s++) {
      const geom = new THREE.SphereGeometry(ROVER_WAVE_BASE_R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: WAVE_COLOR, transparent: true, opacity: WAVE_OPACITY,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(ROVER_SPEAKERS[s]);
      scene.add(mesh);
      roverWaveRings.push({ mesh, age: 0 });
    }
  }

  function updateRoverWaves(dt) {
    if (roverWaveOn) {
      roverWaveSpawnTimer += dt;
      while (roverWaveSpawnTimer >= WAVE_SPAWN_INTERVAL) {
        roverWaveSpawnTimer -= WAVE_SPAWN_INTERVAL;
        spawnRoverWaves();
      }
    }
    for (let i = roverWaveRings.length - 1; i >= 0; i--) {
      const r = roverWaveRings[i];
      r.age += dt;
      const t = r.age / WAVE_LIFETIME;
      if (t >= 1) {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        scene.remove(r.mesh);
        roverWaveRings.splice(i, 1);
        continue;
      }
      const scale = 1 + t * (ROVER_WAVE_MAX_SCALE - 1);
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = (1 - t) * WAVE_OPACITY;
    }
  }

  // Update loop
  function update(dt) {
    if (radarOn && antennaPivot) {
      antennaPivot.rotation.y += 0.15 * radarDir;
    }

    if (servoOn && worldGroup) {
      const dTheta = SERVO_WHEEL_SPIN * dt * servoDir;
      if (wheelR) wheelR.rotateOnWorldAxis(SERVO_X_AXIS, dTheta);
      if (wheelL) wheelL.rotateOnWorldAxis(SERVO_X_AXIS, dTheta);

      const before = nearestBoxDist();
      const savedZ = worldGroup.position.z;
      worldGroup.position.z -= SERVO_WORLD_SPEED * dt * servoDir;
      const after = nearestBoxDist();
      if (after < BOX_COLLIDE_R && after < before) worldGroup.position.z = savedZ;
    }

    if (servoTurnOn && worldGroup) {
      const dSpin = SERVO_WHEEL_SPIN * dt * servoTurnDir;
      if (wheelR) wheelR.rotateOnWorldAxis(SERVO_X_AXIS, -dSpin);
      if (wheelL) wheelL.rotateOnWorldAxis(SERVO_X_AXIS,  dSpin);

      const before = nearestBoxDist();
      const savedQ = worldGroup.quaternion.clone();
      const savedX = worldGroup.position.x, savedZ = worldGroup.position.z;
      const dYaw = -SERVO_TURN_SPEED * dt * servoTurnDir;
      worldGroup.rotateOnWorldAxis(SERVO_Y_AXIS, dYaw);
      worldGroup.position.sub(SERVO_TURN_PIVOT).applyAxisAngle(SERVO_Y_AXIS, dYaw).add(SERVO_TURN_PIVOT);
      const after = nearestBoxDist();
      if (after < BOX_COLLIDE_R && after < before) {
        worldGroup.quaternion.copy(savedQ);
        worldGroup.position.x = savedX; worldGroup.position.z = savedZ;
      }
    }

    if (worldGroup) updateRoverWaves(dt);
    updateMuzzleFlash(dt);
    if (gunMesh) updateGunSmoke(dt);
  }

  function dispose() {
    try {
      gunSmokePool.forEach((p) => p.sprite?.material?.dispose?.());
      smokeTex?.dispose?.();
      oledTex?.dispose?.();
    } catch {}
    roverWaveRings.forEach((r) => {
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    });
  }

  return {
    update,
    dispose,
    get hasRoverLeds() { return roverLeds.length > 0; },
    setRoverLed,
    get hasServo() { return !!worldGroup; },
    setServoMove,
    setServoTurn,
    stopServo,
    get servoActive() { return servoOn || servoTurnOn; },
    get hasDistanceSensor() { return irSensorBalls.length > 0; },
    setDistanceSensor,
    measureDistance,
    get hasBoxes() { return boxes.length > 0; },
    respawnBoxes,
    get obstaclesOn() { return obstaclesOn; },
    setObstacles,
    get hasRadar() { return !!antennaPivot; },
    setRadar,
    get radarOn() { return radarOn; },
    get hasRoverWave() { return !!worldGroup; },
    setRoverWave,
    get hasOled() { return !!oledCanvas; },
    oledClear,
    oledClearRect,
    oledText,
    oledIcon,
    get hasGun() { return !!gunMesh; },
    setGunFire
  };
}
