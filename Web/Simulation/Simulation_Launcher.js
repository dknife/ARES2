// Simulation_Launcher.js
// Subsystem for the Launchpad (launchpad) topic.

function recolorLaunchpadAntenna(root, THREE) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.geometry?.getAttribute('position')) meshes.push(o); });
  if (!meshes.length) return;

  function splitTris(idxArr, posAttr, isInRegion) {
    const insideTris = [], outsideTris = [];
    const triCount = idxArr.length / 3;
    for (let t = 0; t < triCount; t++) {
      const a = idxArr[t * 3], b = idxArr[t * 3 + 1], c = idxArr[t * 3 + 2];
      const allIn =
        isInRegion(posAttr.getX(a), posAttr.getY(a)) &&
        isInRegion(posAttr.getX(b), posAttr.getY(b)) &&
        isInRegion(posAttr.getX(c), posAttr.getY(c));
      (allIn ? insideTris : outsideTris).push(a, b, c);
    }
    if (!insideTris.length) return null;
    let cx = 0, cy = 0, cz = 0, n = 0;
    const used = new Set(insideTris);
    for (const v of used) { cx += posAttr.getX(v); cy += posAttr.getY(v); cz += posAttr.getZ(v); n++; }
    return { insideTris, outsideTris, centroid: { x: cx / n, y: cy / n, z: cz / n } };
  }

  for (const mesh of meshes) {
    const geom = mesh.geometry;
    const posAttr = geom.getAttribute('position');
    if (!geom.getIndex() || !posAttr) continue;
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const sx = bb.max.x - bb.min.x;
    const sy = bb.max.y - bb.min.y;

    // ---- 1) 안테나 (회색 + y축 회전 pivot) ----
    const isAntenna = (x, y) => {
      const fx = (x - bb.min.x) / sx;
      const fy = (y - bb.min.y) / sy;
      return fx > 0.78 && fx < 0.92 && fy > 0.70;
    };
    let split = splitTris(geom.getIndex().array, posAttr, isAntenna);
    if (!split) {
      console.warn('[LaunchStation] 안테나 정점 감지 실패');
    } else {
      const { insideTris, outsideTris, centroid } = split;
      const pivotOffsetX = -0.01;
      const pivotX = centroid.x + pivotOffsetX;
      const antennaGeom = geom.clone();
      antennaGeom.setIndex(insideTris);
      const grayMat = new THREE.MeshStandardMaterial({
        color: 0x9aa0a6, metalness: 0.1, roughness: 0.7,
        side: THREE.DoubleSide, emissive: 0x404040, emissiveIntensity: 0.6,
      });
      const pivot = new THREE.Group();
      pivot.position.set(pivotX, centroid.y, centroid.z);
      const antennaMesh = new THREE.Mesh(antennaGeom, grayMat);
      antennaMesh.position.set(-pivotX, -centroid.y, -centroid.z);
      antennaMesh.castShadow = true;
      antennaMesh.receiveShadow = true;
      antennaMesh.frustumCulled = false;
      pivot.add(antennaMesh);
      mesh.add(pivot);
      root.userData.antennaPivot = pivot;
      geom.setIndex(outsideTris);
      console.log(`[LaunchStation] 안테나 정점 분리: ${insideTris.length / 3}개 삼각형`);
    }

    // ---- 2) 로켓 (노란색, 뾰족하게 위로 솟은 형상) ----
    const isRocket = (x, y) => {
      const fx = (x - bb.min.x) / sx;
      const fy = (y - bb.min.y) / sy;
      return fx > 0.28 && fx < 0.46 && fy > 0.68;
    };
    split = splitTris(geom.getIndex().array, posAttr, isRocket);
    if (!split) {
      console.warn('[LaunchStation] 로켓 정점 감지 실패');
    } else {
      const { insideTris, outsideTris } = split;
      const rocketGeom = geom.clone();
      rocketGeom.setIndex(insideTris);
      let rxMin = Infinity, rxMax = -Infinity;
      let ryMin = Infinity, ryMax = -Infinity;
      let rzMin = Infinity, rzMax = -Infinity;
      const usedR = new Set(insideTris);
      for (const v of usedR) {
        const x = posAttr.getX(v), y = posAttr.getY(v), z = posAttr.getZ(v);
        if (x < rxMin) rxMin = x; if (x > rxMax) rxMax = x;
        if (y < ryMin) ryMin = y; if (y > ryMax) ryMax = y;
        if (z < rzMin) rzMin = z; if (z > rzMax) rzMax = z;
      }
      const rcx = (rxMin + rxMax) / 2;
      const rcz = (rzMin + rzMax) / 2;
      const rby = ryMin;
      const yellowMat = new THREE.MeshStandardMaterial({
        color: 0xf5d23a, metalness: 0.05, roughness: 0.55,
        side: THREE.DoubleSide, emissive: 0x4a3a08, emissiveIntensity: 0.45,
      });
      const rocketGroup = new THREE.Group();
      const rocketMesh = new THREE.Mesh(rocketGeom, yellowMat);
      rocketMesh.castShadow = true;
      rocketMesh.receiveShadow = true;
      rocketMesh.frustumCulled = false;
      rocketGroup.add(rocketMesh);

      // 화염 sprite
      const fc = document.createElement('canvas'); fc.width = fc.height = 128;
      const fcx = fc.getContext('2d');
      const fg = fcx.createRadialGradient(64, 64, 0, 64, 64, 64);
      fg.addColorStop(0.0, 'rgba(255,250,200,1)');
      fg.addColorStop(0.3, 'rgba(255,150,40,0.9)');
      fg.addColorStop(0.7, 'rgba(255,60,0,0.4)');
      fg.addColorStop(1.0, 'rgba(255,0,0,0)');
      fcx.fillStyle = fg; fcx.fillRect(0, 0, 128, 128);
      const flameTex = new THREE.CanvasTexture(fc);
      flameTex.colorSpace = THREE.SRGBColorSpace;
      const flameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, color: 0xffaa33, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.0,
      }));
      flameSprite.position.set(rcx, rby - 0.10, rcz);
      flameSprite.scale.set(0.22, 0.50, 1);
      flameSprite.visible = false;
      rocketGroup.add(flameSprite);

      // 화염 PointLight
      const flameLight = new THREE.PointLight(0xff9020, 0, 1.8, 2);
      flameLight.position.set(rcx, rby - 0.05, rcz);
      rocketGroup.add(flameLight);

      mesh.add(rocketGroup);
      geom.setIndex(outsideTris);

      root.userData.rocketGroup = rocketGroup;
      root.userData.rocketFlameSprite = flameSprite;
      root.userData.rocketFlameLight = flameLight;
      root.userData.rocketCentroidLocal = new THREE.Vector3(rcx, (ryMin + ryMax) / 2, rcz);
      root.userData.rocketBottomLocal   = new THREE.Vector3(rcx, ryMin, rcz);
      root.userData.rocketMeshRef = mesh;
      console.log(`[LaunchStation] 로켓 정점 분리: ${insideTris.length / 3}개 삼각형`);
    }
  }
}

export function playRocketLaunch(audioCtx) {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    const DUR = 3.6;
    const bufLen = Math.floor(audioCtx.sampleRate * 2);
    const buffer = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    // 저역 럼블
    const rumbleSrc = audioCtx.createBufferSource(); rumbleSrc.buffer = buffer; rumbleSrc.loop = true;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t0);
    lp.frequency.exponentialRampToValueAtTime(250, t0 + DUR);
    const rumbleGain = audioCtx.createGain();
    rumbleSrc.connect(lp); lp.connect(rumbleGain); rumbleGain.connect(audioCtx.destination);

    // 중역 로어(분사 쉭소리)
    const roarSrc = audioCtx.createBufferSource(); roarSrc.buffer = buffer; roarSrc.loop = true;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(500, t0);
    bp.frequency.linearRampToValueAtTime(1400, t0 + 0.6);
    bp.frequency.exponentialRampToValueAtTime(700, t0 + DUR);
    const roarGain = audioCtx.createGain();
    roarSrc.connect(bp); bp.connect(roarGain); roarGain.connect(audioCtx.destination);

    // 엔벨로프
    const VOL = 0.16;
    rumbleGain.gain.setValueAtTime(0, t0);
    rumbleGain.gain.linearRampToValueAtTime(VOL, t0 + 0.15);
    rumbleGain.gain.setValueAtTime(VOL, t0 + DUR * 0.5);
    rumbleGain.gain.linearRampToValueAtTime(0, t0 + DUR);
    roarGain.gain.setValueAtTime(0, t0);
    roarGain.gain.linearRampToValueAtTime(VOL * 0.7, t0 + 0.1);
    roarGain.gain.linearRampToValueAtTime(0, t0 + DUR);

    rumbleSrc.start(t0); rumbleSrc.stop(t0 + DUR + 0.05);
    roarSrc.start(t0);   roarSrc.stop(t0 + DUR + 0.05);
  } catch (e) {
    console.warn('rocket launch sound 실패:', e);
  }
}

const ROCKET_RISE  = 10;
const ROCKET_SPEED = 0.00267;
const SMOKE_POOL = 80;
const SMOKE_RATE = 42;
const WAVE_SPAWN_INTERVAL = 0.18;
const WAVE_LIFETIME       = 1.4;
const WAVE_MAX_SCALE      = 5;
const WAVE_COLOR          = 0x88ddff;
const WAVE_OPACITY        = 0.16;

const LAUNCH_STRIP_PALETTE = {
  sphereBase: 0x031a0a, emissive: 0x00ff33,
  glowStops: ['rgba(20,255,80,1)', 'rgba(0,230,50,0.78)', 'rgba(0,255,40,0)'],
  glowTint: 0x00ff44, lightColor: 0x00ff44,
  intensityScale: 0.12, opacityOn: 0.99, glowScale: 0.55,
};
const LAUNCH_TORUS_PALETTE = {
  sphereBase: 0x1f0204, emissive: 0xff0a1e,
  glowStops: ['rgba(255,80,70,1)', 'rgba(255,20,25,0.78)', 'rgba(255,0,0,0)'],
  glowTint: 0xff1828, lightColor: 0xff1422,
  intensityScale: 0.45, opacityOn: 0.99, glowScale: 0.55,
};

export class LauncherSubsystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.rootNode = null;
    this.launchLeds = [];
    
    // Radar state
    this.radarOn = false;
    this.radarDir = 1;
    this.antennaPivot = null;

    // Rocket state
    this.rocketGroup = null;
    this.rocketFlameSprite = null;
    this.rocketFlameLight = null;
    this.rocketCentroidLocal = null;
    this.rocketMeshRef = null;
    this.rocketBottomLocal = null;
    this.rocketLaunchOn = false;
    this.rocketAnimT = 0;
    this.savedCamPos = null;
    this.savedTarget = null;
    this.rocketCentroidWorld = null;

    // Rocket smoke state
    this.smokeGroup = null;
    this.smokeTex = null;
    this.smokePool = [];
    this.smokeSpawnAcc = 0;

    // Buzzer wave rings state
    this.launchWaveOn = false;
    this.launchWaveSpawnTimer = 0;
    this.launchFootprintSize = 1;
    this.launchWaveRings = [];

    const THREE = ctx.THREE;
    const makeGlowTex = (stops) => {
      const gc = document.createElement('canvas'); gc.width = gc.height = 128;
      const gx = gc.getContext('2d');
      const gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gg.addColorStop(0.0,  stops[0]);
      gg.addColorStop(0.25, stops[1]);
      gg.addColorStop(1.0,  stops[2]);
      gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(gc); tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    this.launchGlowTex = makeGlowTex(LAUNCH_TORUS_PALETTE.glowStops);
    this.launchStripGlowTex = makeGlowTex(LAUNCH_STRIP_PALETTE.glowStops);
  }

  makeLed(radius, pos, palette, glowTex, geometry) {
    const THREE = this.ctx.THREE;
    const grp = new THREE.Group(); grp.position.fromArray(pos);
    const sphere = new THREE.Mesh(
      geometry || new THREE.SphereGeometry(radius, 28, 28),
      new THREE.MeshStandardMaterial({ color: palette.sphereBase, emissive: palette.emissive, emissiveIntensity: 0, transparent: true, opacity: 0.4, roughness: 0.2, metalness: 0 })
    );
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: palette.glowTint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
    glow.scale.setScalar(radius * 3.3); glow.visible = false;
    const light = new THREE.PointLight(palette.lightColor, 0, radius * 22, 2);
    grp.add(sphere, glow, light);
    return { group: grp, sphere, glow, light, on: false,
             intensityScale: palette.intensityScale ?? 1,
             opacityOn: palette.opacityOn ?? 0.92,
             glowScale: palette.glowScale ?? 1 };
  }

  applyLed(e, value) {
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    const s = e.intensityScale ?? 1;
    const opOn  = e.opacityOn ?? 0.92;
    const glowS = e.glowScale ?? 1;
    e.on = v > 0;
    e.sphere.material.emissiveIntensity = 3.2 * v * s;
    e.sphere.material.opacity = v > 0 ? 0.4 + (opOn - 0.4) * v : 0.4;
    e.glow.visible = v > 0;
    if (e.glow.material) e.glow.material.opacity = 0.95 * v * s * glowS;
    e.light.intensity = 1.8 * v * s;
  }

  attachToRoot(root, box, sz) {
    const THREE = this.ctx.THREE;
    this.rootNode = root;
    const LAUNCH = this.ctx.cfg.launch;
    if (LAUNCH) {
      this.launchFootprintSize = Math.max(sz.x, sz.z);
      const lx = box.min.x + sz.x * LAUNCH.stripXFrac;
      const lz = box.min.z + sz.z * LAUNCH.stripZFrac;
      const yTop = box.min.y + sz.y * LAUNCH.stripYRange[0];
      const yBot = box.min.y + sz.y * LAUNCH.stripYRange[1];
      const n = LAUNCH.stripCount;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const ly = yTop + (yBot - yTop) * t;
        const led = this.makeLed(LAUNCH.stripRadius, [lx, ly, lz], LAUNCH_STRIP_PALETTE, this.launchStripGlowTex);
        root.add(led.group);
        this.launchLeds[i + 1] = led;
      }
      
      const rb = root.userData.rocketBottomLocal;
      const rmesh = root.userData.rocketMeshRef;
      if (rb && rmesh) {
        const torusGeom = new THREE.TorusGeometry(LAUNCH.torusRadius, LAUNCH.torusTube, 16, 48);
        torusGeom.rotateX(Math.PI / 2);
        const led0 = this.makeLed(LAUNCH.torusRadius, [rb.x, rb.y + LAUNCH.torusYOffset, rb.z], LAUNCH_TORUS_PALETTE, this.launchGlowTex, torusGeom);
        rmesh.add(led0.group);
        this.launchLeds[0] = led0;
      }
    }

    // Cache rocket group refs from root userData
    this.rocketGroup = root.userData.rocketGroup;
    this.rocketFlameSprite = root.userData.rocketFlameSprite;
    this.rocketFlameLight = root.userData.rocketFlameLight;
    this.rocketCentroidLocal = root.userData.rocketCentroidLocal;
    this.rocketMeshRef = root.userData.rocketMeshRef;
    this.rocketBottomLocal = root.userData.rocketBottomLocal;

    // Cache antennaPivot
    this.antennaPivot = root.userData.antennaPivot;
  }

  setLaunchLed(i, value) {
    if (!this.launchLeds || !this.launchLeds[i]) return;
    this.applyLed(this.launchLeds[i], value);
  }

  setRadar(on, dir) {
    this.radarOn = !!on;
    if (dir !== undefined && dir !== null) this.radarDir = dir < 0 ? -1 : 1;
  }

  setRocketLaunch(on, followCamera) {
    const follow = followCamera !== false;
    this.rocketLaunchOn = !!on;
    if (this.rocketLaunchOn && !this.savedCamPos && follow) {
      this.savedCamPos = this.ctx.camera.position.clone();
      this.savedTarget = this.ctx.controls.target.clone();
      if (this.rocketCentroidLocal && this.rocketMeshRef) {
        this.rocketMeshRef.updateMatrixWorld(true);
        this.rocketCentroidWorld = this.rocketCentroidLocal.clone().applyMatrix4(this.rocketMeshRef.matrixWorld);
      }
    }
  }

  setLaunchWave(on) {
    this.launchWaveOn = !!on;
    if (!this.launchWaveOn) this.launchWaveSpawnTimer = 0;
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

  ensureSmoke() {
    const THREE = this.ctx.THREE;
    if (this.smokeGroup || !this.rocketMeshRef || !this.rocketBottomLocal) return;
    this.smokeTex = this.makeSmokeTex();
    this.smokeGroup = new THREE.Group();
    this.rocketMeshRef.add(this.smokeGroup);
    for (let i = 0; i < SMOKE_POOL; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.smokeTex, color: 0xeef1f6, transparent: true,
        depthWrite: false, opacity: 0,
      }));
      sp.visible = false;
      this.smokeGroup.add(sp);
      this.smokePool.push({ sprite: sp, active: false, age: 0, life: 1, vel: new THREE.Vector3(),
                       scale0: 0.18, scaleMax: 1.4, rot: 0, rotSpeed: 0 });
    }
  }

  spawnSmoke(baseY) {
    const THREE = this.ctx.THREE;
    const p = this.smokePool.find((q) => !q.active);
    if (!p) return;
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.12;
    p.active = true; p.age = 0;
    p.life = 1.6 + Math.random() * 1.3;
    p.sprite.position.set(
      this.rocketBottomLocal.x + Math.cos(ang) * rad,
      baseY - 0.05 - Math.random() * 0.06,
      this.rocketBottomLocal.z + Math.sin(ang) * rad,
    );
    const spd = 0.5 + Math.random() * 0.8;
    p.vel.set(Math.cos(ang) * spd, -0.15 - Math.random() * 0.25, Math.sin(ang) * spd);
    p.scale0  = 0.16 + Math.random() * 0.12;
    p.scaleMax = 1.0 + Math.random() * 1.0;
    p.rot = Math.random() * Math.PI * 2;
    p.rotSpeed = (Math.random() - 0.5) * 0.8;
    p.sprite.material.opacity = 0;
    p.sprite.material.rotation = p.rot;
    p.sprite.scale.set(p.scale0, p.scale0, 1);
    p.sprite.visible = true;
  }

  updateSmoke(dt) {
    this.ensureSmoke();
    if (!this.smokeGroup) return;
    if (this.rocketLaunchOn) {
      const rate = SMOKE_RATE * (1 + (1 - this.rocketAnimT));
      this.smokeSpawnAcc += dt * rate;
      const baseY = this.rocketBottomLocal.y + this.rocketGroup.position.y;
      while (this.smokeSpawnAcc >= 1) { this.smokeSpawnAcc -= 1; this.spawnSmoke(baseY); }
    } else {
      this.smokeSpawnAcc = 0;
    }
    for (const p of this.smokePool) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { p.active = false; p.sprite.visible = false; continue; }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - 2.0 * dt));
      p.vel.y += 0.3 * dt;
      const grow = 1 - (1 - t) * (1 - t);
      const s = p.scale0 + (p.scaleMax - p.scale0) * grow;
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = Math.min(1, t * 6) * (1 - t) * 0.8;
      p.rot += p.rotSpeed * dt;
      p.sprite.material.rotation = p.rot;
    }
  }

  spawnWaveRing() {
    const THREE = this.ctx.THREE;
    const baseR = this.launchFootprintSize * 0.5;
    const geom = new THREE.SphereGeometry(baseR, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: WAVE_COLOR, transparent: true, opacity: WAVE_OPACITY,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, 0, 0);
    this.ctx.scene.add(mesh);
    this.launchWaveRings.push({ mesh, age: 0 });
  }

  updateLaunchWaves(dt) {
    if (this.launchWaveOn) {
      this.launchWaveSpawnTimer += dt;
      while (this.launchWaveSpawnTimer >= WAVE_SPAWN_INTERVAL) {
        this.launchWaveSpawnTimer -= WAVE_SPAWN_INTERVAL;
        this.spawnWaveRing();
      }
    }
    for (let i = this.launchWaveRings.length - 1; i >= 0; i--) {
      const r = this.launchWaveRings[i];
      r.age += dt;
      const t = r.age / WAVE_LIFETIME;
      if (t >= 1) {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.ctx.scene.remove(r.mesh);
        this.launchWaveRings.splice(i, 1);
        continue;
      }
      const scale = 1 + t * (WAVE_MAX_SCALE - 1);
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = (1 - t) * WAVE_OPACITY;
    }
  }

  update(dt) {
    if (this.radarOn && this.antennaPivot) {
      this.antennaPivot.rotation.y += 0.15 * this.radarDir;
    }

    this.updateLaunchWaves(dt);

    if (this.rocketGroup) {
      const targetT = this.rocketLaunchOn ? 1 : 0;
      if (this.rocketAnimT !== targetT) {
        const dir = Math.sign(targetT - this.rocketAnimT);
        this.rocketAnimT = Math.max(0, Math.min(1, this.rocketAnimT + dir * ROCKET_SPEED));
      }
      const eased = this.rocketLaunchOn
        ? 1 - (1 - this.rocketAnimT) * (1 - this.rocketAnimT)
        : this.rocketAnimT * this.rocketAnimT;
      this.rocketGroup.position.y = ROCKET_RISE * eased;

      const showFlame = this.rocketLaunchOn || this.rocketAnimT > 0.01;
      if (this.rocketFlameSprite) {
        this.rocketFlameSprite.visible = showFlame;
        if (showFlame) {
          const wob = 1 + 0.25 * Math.sin(performance.now() * 0.025);
          this.rocketFlameSprite.scale.set(0.22 * wob, 0.50 * wob, 1);
          this.rocketFlameSprite.material.opacity = Math.min(1, this.rocketAnimT * 4) * 0.95;
        }
      }
      if (this.rocketFlameLight) {
        this.rocketFlameLight.intensity = showFlame ? Math.min(1, this.rocketAnimT * 4) * 1.8 : 0;
      }

      this.updateSmoke(dt);

      if (this.savedCamPos && this.savedTarget && this.rocketCentroidWorld) {
        const rocketYNow = this.rocketCentroidWorld.y + ROCKET_RISE * eased;
        if (this.rocketLaunchOn) {
          this.ctx.controls.target.x = this.rocketCentroidWorld.x;
          this.ctx.controls.target.y = rocketYNow;
          this.ctx.controls.target.z = this.rocketCentroidWorld.z;
        } else {
          this.ctx.controls.target.x = this.savedTarget.x + (this.rocketCentroidWorld.x - this.savedTarget.x) * eased;
          this.ctx.controls.target.y = this.savedTarget.y + (rocketYNow            - this.savedTarget.y) * eased;
          this.ctx.controls.target.z = this.savedTarget.z + (this.rocketCentroidWorld.z - this.savedTarget.z) * eased;
        }
        this.ctx.camera.position.y = this.savedCamPos.y + ROCKET_RISE * eased;
      }

      if (!this.rocketLaunchOn && this.rocketAnimT === 0 && this.savedCamPos) {
        this.ctx.camera.position.copy(this.savedCamPos);
        this.ctx.controls.target.copy(this.savedTarget);
        this.savedCamPos = null;
        this.savedTarget = null;
        this.rocketCentroidWorld = null;
      }
    }
  }

  dispose() {
    this.launchGlowTex?.dispose();
    this.launchStripGlowTex?.dispose();
    try {
      this.smokePool.forEach((p) => p.sprite?.material?.dispose?.());
      this.smokeTex?.dispose?.();
    } catch {}
    this.launchWaveRings.forEach((r) => {
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    });
  }

  get hasLaunchLeds() { return !!this.launchLeds.length; }
  get hasLaunchWave() { return true; }
  get hasRadar() { return !!this.antennaPivot; }
  get hasRocket() { return !!this.rocketGroup; }
  get rocketAtRest() { return !this.rocketLaunchOn && this.rocketAnimT === 0; }
}

export { recolorLaunchpadAntenna };
