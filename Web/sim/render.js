// Web/sim/render.js
// Frame updates and the animation render loop.

const SERVO_WHEEL_SPIN = 4.0;
const SERVO_WORLD_SPEED = 1.2;
const SERVO_TURN_SPEED = 0.9;
const BOX_COLLIDE_R = 1.5;

export class RenderEngine {
  constructor(ctx) {
    this.ctx = ctx;
  }

  render() {
    const ctx = this.ctx;
    const THREE = ctx.THREE;
    const nowSec = performance.now() * 0.001;
    const dt = ctx.lastRenderTime > 0 ? Math.min(0.1, nowSec - ctx.lastRenderTime) : 0.016;
    ctx.lastRenderTime = nowSec;

    ctx.controls.update();

    const m = ctx.movement;
    const g = ctx.gun;

    // 1) Radar antenna rotation
    if (m && m.radarOn && m.antennaPivot) {
      m.antennaPivot.rotation.y += 0.15 * m.radarDir;
    }

    // 2) Servo translation (Z)
    if (m && m.servoOn && ctx.worldGroup) {
      const dTheta = SERVO_WHEEL_SPIN * dt * m.servoDir;
      const xAxis = new THREE.Vector3(1, 0, 0);
      if (m.wheelR) m.wheelR.rotateOnWorldAxis(xAxis, dTheta);
      if (m.wheelL) m.wheelL.rotateOnWorldAxis(xAxis, dTheta);

      const before = m.nearestBoxDist();
      const savedZ = ctx.worldGroup.position.z;
      ctx.worldGroup.position.z -= SERVO_WORLD_SPEED * dt * m.servoDir;
      const after = m.nearestBoxDist();
      if (after < BOX_COLLIDE_R && after < before) {
        ctx.worldGroup.position.z = savedZ;
      }
    }

    // 3) Servo rotation (제자리 회전)
    if (m && m.servoTurnOn && ctx.worldGroup) {
      const dSpin = SERVO_WHEEL_SPIN * dt * m.servoTurnDir;
      const xAxis = new THREE.Vector3(1, 0, 0);
      const yAxis = new THREE.Vector3(0, 1, 0);
      const turnPivot = new THREE.Vector3(0, 0, -0.3);
      
      if (m.wheelR) m.wheelR.rotateOnWorldAxis(xAxis, -dSpin);
      if (m.wheelL) m.wheelL.rotateOnWorldAxis(xAxis,  dSpin);

      const before = m.nearestBoxDist();
      const savedQ = ctx.worldGroup.quaternion.clone();
      const savedX = ctx.worldGroup.position.x;
      const savedZ = ctx.worldGroup.position.z;
      
      const dYaw = -SERVO_TURN_SPEED * dt * m.servoTurnDir;
      ctx.worldGroup.rotateOnWorldAxis(yAxis, dYaw);
      ctx.worldGroup.position.sub(turnPivot).applyAxisAngle(yAxis, dYaw).add(turnPivot);
      
      const after = m.nearestBoxDist();
      if (after < BOX_COLLIDE_R && after < before) {
        ctx.worldGroup.quaternion.copy(savedQ);
        ctx.worldGroup.position.x = savedX;
        ctx.worldGroup.position.z = savedZ;
      }
    }

    // 4) Subsystem updates
    if (ctx.rocket && typeof ctx.rocket.updateRocket === 'function') {
      ctx.rocket.updateRocket(dt);
    }
    if (ctx.waves && typeof ctx.waves.updateWaves === 'function') {
      ctx.waves.updateWaves(dt);
    }
    if (ctx.gun && typeof ctx.gun.updateMuzzleFlash === 'function') {
      ctx.gun.updateMuzzleFlash(dt);
    }
    if (ctx.gun && ctx.gun.gunMesh && typeof ctx.gun.updateGunSmoke === 'function') {
      ctx.gun.updateGunSmoke(dt);
    }

    // 5) Actual Three.js render pass
    ctx.renderer.render(ctx.scene, ctx.camera);
  }
}
