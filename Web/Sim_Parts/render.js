// Web/Sim_Parts/render.js
// 매 프레임마다의 3D 시뮬레이션 물리 갱신 및 렌더링 루프 제어를 담당하는 파일입니다.

const SERVO_WHEEL_SPIN = 4.0;   // 로버 바퀴 굴림 계수
const SERVO_WORLD_SPEED = 1.2;  // 로버 직선 주행 시 월드 바닥 스크롤 물리 속도
const SERVO_TURN_SPEED = 0.9;   // 로버 제자리 회전 시 월드 회전 각속도
const BOX_COLLIDE_R = 1.5;      // 장애물 충돌 판정 거리 임계값

export class Render {
  constructor(ctx) {
    this.ctx = ctx;
  }

  // 매 렌더링 루프마다 호출되어 실시간 3D 상태를 연산하고 렌더 통과를 지시합니다.
  render() {
    const ctx = this.ctx;
    const THREE = ctx.THREE;
    const nowSec = performance.now() * 0.001;
    // 이전 렌더링 시간과의 갭(dt)을 계산하여 프레임 레이트에 구애받지 않고 부드럽게 연산
    const dt = ctx.lastRenderTime > 0 ? Math.min(0.1, nowSec - ctx.lastRenderTime) : 0.016;
    ctx.lastRenderTime = nowSec;

    // 마우스 드래그에 따른 카메라 위치 감쇠(Damping) 갱신
    ctx.controls.update();

    const m = ctx.movement;
    const g = ctx.gun;

    // 1) 레이더 안테나의 실시간 회전 처리
    if (m && m.radarOn && m.antennaPivot) {
      m.antennaPivot.rotation.y += 0.15 * m.radarDir;
    }

    // 2) 로버 서보 주행 물리 및 충돌 감지 (직선 전·후진)
    // 로버 본체는 원점에 고정되며, 맵과 바닥이 들어있는 worldGroup을 역방향으로 이동시킵니다.
    if (m && m.servoOn && ctx.worldGroup) {
      const dTheta = SERVO_WHEEL_SPIN * dt * m.servoDir;
      const xAxis = new THREE.Vector3(1, 0, 0);
      if (m.wheelR) m.wheelR.rotateOnWorldAxis(xAxis, dTheta);
      if (m.wheelL) m.wheelL.rotateOnWorldAxis(xAxis, dTheta);

      // 주행 전후 거리 차이를 구하여 장애물 박스와의 충돌 검사를 수행하고, 충돌 시 원래 위치로 백업합니다.
      const before = m.nearestBoxDist();
      const savedZ = ctx.worldGroup.position.z;
      ctx.worldGroup.position.z -= SERVO_WORLD_SPEED * dt * m.servoDir;
      const after = m.nearestBoxDist();
      if (after < BOX_COLLIDE_R && after < before) {
        ctx.worldGroup.position.z = savedZ;
      }
    }

    // 3) 로버 서보 주행 물리 및 충돌 감지 (제자리 회전)
    // 회전 중심 축(turnPivot)을 기준으로 worldGroup 전체를 공전 및 자전시킵니다.
    if (m && m.servoTurnOn && ctx.worldGroup) {
      const dSpin = SERVO_WHEEL_SPIN * dt * m.servoTurnDir;
      const xAxis = new THREE.Vector3(1, 0, 0);
      const yAxis = new THREE.Vector3(0, 1, 0);
      const turnPivot = new THREE.Vector3(0, 0, -0.3);
      
      // 제자리 회전 시 좌우 바퀴는 서로 반대 방향으로 굴러갑니다.
      if (m.wheelR) m.wheelR.rotateOnWorldAxis(xAxis, -dSpin);
      if (m.wheelL) m.wheelL.rotateOnWorldAxis(xAxis,  dSpin);

      const before = m.nearestBoxDist();
      const savedQ = ctx.worldGroup.quaternion.clone();
      const savedX = ctx.worldGroup.position.x;
      const savedZ = ctx.worldGroup.position.z;
      
      const dYaw = -SERVO_TURN_SPEED * dt * m.servoTurnDir;
      ctx.worldGroup.rotateOnWorldAxis(yAxis, dYaw);
      ctx.worldGroup.position.sub(turnPivot).applyAxisAngle(yAxis, dYaw).add(turnPivot);
      
      // 회전 이동 후 장애물 충돌 시 회전각 및 원위치 롤백
      const after = m.nearestBoxDist();
      if (after < BOX_COLLIDE_R && after < before) {
        ctx.worldGroup.quaternion.copy(savedQ);
        ctx.worldGroup.position.x = savedX;
        ctx.worldGroup.position.z = savedZ;
      }
    }

    // 4) 각 개별 파츠 서브시스템들의 애니메이션 루프 업데이트 호출
    if (ctx.rocket && typeof ctx.rocket.updateRocket === 'function') {
      ctx.rocket.updateRocket(dt); // 로켓 발사 애니메이션 및 exhaust 파티클 갱신
    }
    if (ctx.waves && typeof ctx.waves.updateWaves === 'function') {
      ctx.waves.updateWaves(dt); // 소리 파동 돔 애니메이션 갱신
    }
    if (ctx.gun && typeof ctx.gun.updateMuzzleFlash === 'function') {
      ctx.gun.updateMuzzleFlash(dt); // 포구 격발 섬광/스파크 갱신
    }
    if (ctx.gun && ctx.gun.gunMesh && typeof ctx.gun.updateGunSmoke === 'function') {
      ctx.gun.updateGunSmoke(dt); // 포구 발사 화약 연기 파티클 갱신
    }

    // 5) 실제 Three.js 렌더 패스 수행 (카메라 뷰 화면 갱신)
    ctx.renderer.render(ctx.scene, ctx.camera);
  }
}
