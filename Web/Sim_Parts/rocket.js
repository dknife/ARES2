// Web/Sim_Parts/rocket.js
// Rocket launching animation, camera tracking, and exhaust cloud particles.

const ROCKET_RISE = 10;
// rocketAnimT(0~1)의 초당 증가량. 기존 프레임당 0.00267(60fps 기준 ≈ 상승 6.3초)을
// 초당 값으로 환산 — dt를 곱하지 않으면 고주사율 모니터에서 로켓이 빨라진다.
const ROCKET_SPEED = 0.16;
const SMOKE_POOL = 80;
const SMOKE_RATE = 42;

export function recolorLaunchpadAntenna(root, THREE) {
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

    // ---- 1) Antenna (Grey + y-axis pivot) ----
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
    }

    // ---- 2) Rocket (Yellow, vertical cylinder) ----
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

      // Flame sprite
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

      // Flame PointLight
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
    }
  }
}

export class RocketSubsystem {
  constructor(ctx) {
    this.ctx = ctx;
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
    
    this.smokeGroup = null;
    this.smokeTex = null;
    this.smokePool = [];
    this.smokeSpawnAcc = 0;
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

  makeSmokeTex(THREE) {
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

    this.smokeTex = this.makeSmokeTex(THREE);
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

  updateRocket(dt) {
    if (this.ctx.waves) {
      const THREE = this.ctx.THREE;
      if (!this.ctx.waves.launchWavePosition) {
        this.ctx.waves.launchWavePosition = new THREE.Vector3(0, 0, 0);
      } else {
        this.ctx.waves.launchWavePosition.set(0, 0, 0);
      }
    }

    if (!this.rocketGroup) return;

    const targetT = this.rocketLaunchOn ? 1 : 0;
    if (this.rocketAnimT !== targetT) {
      const dir = Math.sign(targetT - this.rocketAnimT);
      this.rocketAnimT = Math.max(0, Math.min(1, this.rocketAnimT + dir * ROCKET_SPEED * dt));
    }
    
    const eased = this.rocketLaunchOn
      ? 1 - (1 - this.rocketAnimT) * (1 - this.rocketAnimT)
      : this.rocketAnimT * this.rocketAnimT;
    this.rocketGroup.position.y = ROCKET_RISE * eased;

    // Flame management
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

    // Smoke update
    this.ensureSmoke();
    if (this.smokeGroup) {
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

    // Camera tracking
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

  dispose() {
    try {
      this.smokePool.forEach((p) => p.sprite?.material?.dispose?.());
      this.smokeTex?.dispose?.();
    } catch {}
  }
}
export { recolorLaunchpadAntenna as recolorAntenna };
