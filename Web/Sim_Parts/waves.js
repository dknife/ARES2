// Web/Sim_Parts/waves.js
// Sound wave ring dome animations for Launchpad and Rover buzzers.

const WAVE_SPAWN_INTERVAL = 0.18;
const WAVE_LIFETIME       = 1.4;
const WAVE_MAX_SCALE      = 5;
const ROVER_WAVE_MAX_SCALE = 7;
const WAVE_COLOR          = 0x88ddff;
const WAVE_OPACITY        = 0.16;
const ROVER_WAVE_BASE_R    = 0.15;

export class Waves {
  constructor(ctx) {
    this.ctx = ctx;
    this.launchWaveOn = false;
    this.launchWaveSpawnTimer = 0;
    this.launchFootprintSize = 1;
    this.launchWaveRings = [];
    this.launchWavePosition = null; // Wave center position in world space
    
    this.roverWaveOn = false;
    this.roverWaveSpawnTimer = 0;
    this.roverWaveRings = [];
  }

  setLaunchWave(on) {
    this.launchWaveOn = !!on;
    if (!this.launchWaveOn) this.launchWaveSpawnTimer = 0;
  }

  setRoverWave(on) {
    this.roverWaveOn = !!on;
    if (!this.roverWaveOn) this.roverWaveSpawnTimer = 0;
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
    
    // 외부에서 설정한 launchWavePosition이 있으면 사용하고, 없으면 원점(0, 0, 0)
    if (this.launchWavePosition) {
      mesh.position.copy(this.launchWavePosition);
    } else {
      mesh.position.set(0, 0, 0);
    }

    this.ctx.scene.add(mesh);
    this.launchWaveRings.push({ mesh, age: 0 });
  }

  spawnRoverWaves() {
    const THREE = this.ctx.THREE;
    const speakers = [
      new THREE.Vector3(-0.5, 0.3, 0.6),
      new THREE.Vector3( 0.5, 0.3, 0.6),
    ];
    for (let s = 0; s < speakers.length; s++) {
      const geom = new THREE.SphereGeometry(ROVER_WAVE_BASE_R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: WAVE_COLOR, transparent: true, opacity: WAVE_OPACITY,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(speakers[s]);
      this.ctx.scene.add(mesh);
      this.roverWaveRings.push({ mesh, age: 0 });
    }
  }

  updateWaves(dt) {
    // 1) Launch Waves
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
        try {
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          this.ctx.scene.remove(r.mesh);
        } catch {}
        this.launchWaveRings.splice(i, 1);
        continue;
      }
      const scale = 1 + t * (WAVE_MAX_SCALE - 1);
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = (1 - t) * WAVE_OPACITY;
    }

    // 2) Rover Waves
    if (this.roverWaveOn) {
      this.roverWaveSpawnTimer += dt;
      while (this.roverWaveSpawnTimer >= WAVE_SPAWN_INTERVAL) {
        this.roverWaveSpawnTimer -= WAVE_SPAWN_INTERVAL;
        this.spawnRoverWaves();
      }
    }
    for (let i = this.roverWaveRings.length - 1; i >= 0; i--) {
      const r = this.roverWaveRings[i];
      r.age += dt;
      const t = r.age / WAVE_LIFETIME;
      if (t >= 1) {
        try {
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          this.ctx.scene.remove(r.mesh);
        } catch {}
        this.roverWaveRings.splice(i, 1);
        continue;
      }
      const scale = 1 + t * (ROVER_WAVE_MAX_SCALE - 1);
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = (1 - t) * WAVE_OPACITY;
    }
  }

  dispose() {
    if (this.launchWaveRings) {
      this.launchWaveRings.forEach((r) => {
        try {
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          this.ctx.scene.remove(r.mesh);
        } catch {}
      });
      this.launchWaveRings = [];
    }
    if (this.roverWaveRings) {
      this.roverWaveRings.forEach((r) => {
        try {
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          this.ctx.scene.remove(r.mesh);
        } catch {}
      });
      this.roverWaveRings = [];
    }
  }
}
