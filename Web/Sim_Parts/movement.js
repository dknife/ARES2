// Web/Sim_Parts/movement.js
// Servo movement, radar rotation, collision checking, and distance sensing.

const BOX_COLLIDE_R = 1.5;
const BOX_SPAWN_RANGE = 50;
const BOX_CLEAR_R = 5;
const DIST_NO_HIT = 999;
const DIST_BOX_INFLATE = 2.0;

export class Movement {
  constructor(ctx) {
    this.ctx = ctx;
    this.radarOn = false;
    this.radarDir = 1;
    this.antennaPivot = null;
    
    this.servoOn = false;
    this.servoDir = 1;
    this.servoTurnOn = false;
    this.servoTurnDir = 1;
    
    this.obstaclesOn = true;
    this.boxes = [];
    this.irSensorBalls = [];
    this.magSensorBall = null;
    
    this.wheelR = null;
    this.wheelL = null;
  }

  setRadar(on, dir) {
    this.radarOn = !!on;
    if (dir !== undefined && dir !== null) {
      this.radarDir = dir < 0 ? -1 : 1;
    }
  }

  setServoMove(on, dir) {
    this.servoOn = !!on;
    if (this.servoOn) this.servoTurnOn = false;
    if (dir !== undefined && dir !== null) {
      this.servoDir = dir < 0 ? -1 : 1;
    }
  }

  setServoTurn(on, dir) {
    this.servoTurnOn = !!on;
    if (this.servoTurnOn) this.servoOn = false;
    if (dir !== undefined && dir !== null) {
      this.servoTurnDir = dir < 0 ? -1 : 1;
    }
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
    if (!this.ctx.worldGroup) return;
    this.ctx.worldGroup.position.set(0, 0, 0);
    this.ctx.worldGroup.quaternion.identity();
    for (let i = 0; i < this.boxes.length; i++) {
      let x = 0, z = 0;
      do {
        x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
      } while (Math.hypot(x, z) < BOX_CLEAR_R);
      this.boxes[i].position.set(x, 1, z);
    }
  }

  setObstacles(on) {
    this.obstaclesOn = !!on;
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].visible = this.obstaclesOn;
    }
  }

  setDistanceSensor(on) {
    for (let i = 0; i < this.irSensorBalls.length; i++) {
      const m = this.irSensorBalls[i].material;
      if (on) {
        m.color.setHex(0xff2222);
        m.emissive.setHex(0xff2222);
        m.emissiveIntensity = 2.6;
        m.opacity = 0.9;
      } else {
        m.color.setHex(0xffffff);
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
        m.opacity = 0.25;
      }
    }
  }

  measureDistance() {
    if (this.irSensorBalls.length === 0 || !this.obstaclesOn) {
      return DIST_NO_HIT;
    }
    const THREE = this.ctx.THREE;
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, 1);
    const origin = new THREE.Vector3();

    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].scale.set(DIST_BOX_INFLATE, 1, DIST_BOX_INFLATE);
    }
    if (this.ctx.worldGroup) this.ctx.worldGroup.updateMatrixWorld(true);
    
    let minDist = Infinity;
    for (let i = 0; i < this.irSensorBalls.length; i++) {
      this.irSensorBalls[i].getWorldPosition(origin);
      ray.set(origin, dir);
      const hits = ray.intersectObjects(this.boxes, false);
      if (hits.length && hits[0].distance < minDist) {
        minDist = hits[0].distance;
      }
    }
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].scale.set(1, 1, 1);
    }
    
    if (!isFinite(minDist)) return DIST_NO_HIT;
    return Math.round(minDist * 10);
  }
}
