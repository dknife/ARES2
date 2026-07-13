// Web/Sim_Parts/render.js
// Frame updates and the animation render loop.

const SERVO_WHEEL_SPIN = 4.0;
const SERVO_WORLD_SPEED = 1.2;
const SERVO_TURN_SPEED = 0.9;
const BOX_COLLIDE_R = 1.5;
// 레이더 회전 속도 (rad/s). 기존 프레임당 0.15rad(60fps 기준)을 초당 값으로
// 환산 — dt를 곱지 않으면 120Hz 모니터에서 2배로 빨라진다.
const RADAR_SPIN = 9.0;

export class Render {
  constructor(ctx) {
    this.ctx = ctx;
  }

  render() {
    const ctx = this.ctx;
    const THREE = ctx.THREE;
    const nowSec = performance.now() * 0.001;
    const dt = ctx.lastRenderTime > 0 ? Math.min(0.1, nowSec - ctx.lastRenderTime) : 0.016;
    ctx.lastRenderTime = nowSec;

    ctx.updateSmoothZoom?.(dt);
    ctx.controls.update();
    // 더블클릭 카메라 복귀 트윈 — controls.update() 뒤에서 절대 좌표를 덮어써 부드럽게 이동
    ctx.updateCameraReset?.(dt);
    // 사용자 모드 카메라 바닥 제한(개발자 모드는 통과) — 모든 카메라 갱신 뒤에 클램프
    ctx.clampCameraAboveFloor?.();
    ctx.updateKeyLight?.();

    const m = ctx.movement;
    const g = ctx.gun;

    // 1) Radar antenna rotation
    if (m && m.radarOn && m.antennaPivot) {
      m.antennaPivot.rotation.y += RADAR_SPIN * dt * m.radarDir;
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
    if (ctx.objects && typeof ctx.objects.update === 'function') {
      ctx.objects.update(dt);
    }
    if (ctx.editor && typeof ctx.editor.update === 'function') {
      ctx.editor.update();
    }

    // 5) Actual Three.js render pass
    ctx.renderer.render(ctx.scene, ctx.camera);
  }
}
