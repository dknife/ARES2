// Web/sim/gun.js
// Rover Gun muzzle flash, spark animation, and powder smoke trailing.

const MUZZLE_DUR = 0.35;
const GUN_SMOKE_POOL = 18;
const GUN_SMOKE_BURST = 12;
const GUN_SMOKE_BURST_DUR = 0.18;

export class GunSubsystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.gunMesh = null;
    this.muzzleFlash = null;
    this.muzzleFlashSphere = null;
    this.muzzleFlashLight = null;
    this.muzzleSparks = [];
    this.muzzleFlashT = 0;
    this.muzzleWorldPos = new (ctx.THREE.Vector3)();
    this.muzzleForward = new (ctx.THREE.Vector3)();
    
    this.gunSmokeGroup = null;
    this.smokeTex = null;
    this.gunSmokePool = [];
    this.gunSmokeRemaining = 0;
    this.gunSmokeAcc = 0;
  }

  ensureMuzzleFlash() {
    const THREE = this.ctx.THREE;
    const scene = this.ctx.scene;
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
    scene.add(this.muzzleFlash);
    this.muzzleFlash.visible = false;
  }

  setGunFire() {
    if (!this.gunMesh) return;
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
    this.gunSmokeRemaining = GUN_SMOKE_BURST;
    this.gunSmokeAcc = 0;
  }

  updateMuzzleFlash(dt) {
    if (this.muzzleFlashT <= 0 || !this.muzzleFlash) return;
    
    this.muzzleFlashT += dt;
    if (this.muzzleFlashT >= MUZZLE_DUR) {
      this.muzzleFlashT = 0;
      this.muzzleFlash.visible = false;
      return;
    }
    const t = this.muzzleFlashT / MUZZLE_DUR;
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

  ensureGunSmoke() {
    const THREE = this.ctx.THREE;
    const scene = this.ctx.scene;
    if (this.gunSmokeGroup || !this.gunMesh) return;

    this.smokeTex = this.makeSmokeTex(THREE);
    this.gunSmokeGroup = new THREE.Group();
    scene.add(this.gunSmokeGroup);
    
    for (let i = 0; i < GUN_SMOKE_POOL; i++) {
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
    const THREE = this.ctx.THREE;
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
    if (!this.gunMesh) return;
    this.ensureGunSmoke();
    if (!this.gunSmokeGroup) return;

    if (this.gunSmokeRemaining > 0) {
      this.gunSmokeAcc += dt;
      const alreadySpawned = GUN_SMOKE_BURST - this.gunSmokeRemaining;
      const targetSpawned = Math.min(GUN_SMOKE_BURST, Math.ceil(GUN_SMOKE_BURST * this.gunSmokeAcc / GUN_SMOKE_BURST_DUR));
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

  dispose() {
    try {
      this.gunSmokePool.forEach((p) => p.sprite?.material?.dispose?.());
      this.smokeTex?.dispose?.();
    } catch {}
  }
}
