// Web/Sim_Parts/components.js
// 선언형 컴포넌트 (SIMULATOR.md 2장) — 객체에 부착되어 블록 코딩 명령에 반응한다.
// 2단계: LED · Buzzer · Oled / 3단계: DC · Servo · UltraSonic · Magnet · Metal (Gun 은 4단계)
//
// 컴포넌트 인터페이스:
//   { declarative: true, type, fields,
//     onAdd(ctx, simObject), update(dt, ctx, simObject), dispose(ctx, simObject),
//     onCommand(cmd, ctx, simObject) -> cleanup | null }   // cleanup 은 hold 종료 후 호출
//
// onCommand 는 dispatch.simSink 가 모든 명령을 registry.routeCommand 로 브로드캐스트할 때 불린다.

import { OLED_ICONS } from './topics.js';

// ---- 공통: 객체 자신의 메시만 순회(중첩된 다른 simObject 경계에서 멈춤 — sim_object 와 동일 규칙) ----
function forOwnMeshes(root, fn) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node !== root && node.userData?.simObject) continue;
    if (node.isMesh) fn(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
}

// ============================================================
// LED — { led_no: 0~5 } : 해당 번호 LED 신호에 발광(emit)/소등
// ============================================================
function createLedComponent(ctx, fields = {}) {
  const ledNo = Math.max(0, Math.min(5, parseInt(fields.led_no, 10) || 0));
  const saved = new Map();   // mesh -> { emissive, intensity }

  const setEmit = (simObject, intensity) => {
    forOwnMeshes(simObject.root, (mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (!m || m.emissive === undefined) return;   // Basic 계열 등 emissive 없는 재질은 무시
        if (!saved.has(m)) {
          saved.set(m, { emissive: m.emissive.clone(), intensity: m.emissiveIntensity ?? 1 });
        }
        if (intensity > 0) {
          // 재질 고유색 계열로 발광(순검정이면 LED 느낌의 앰버로)
          const base = m.color && (m.color.r + m.color.g + m.color.b) > 0.05 ? m.color : null;
          if (base) m.emissive.copy(base); else m.emissive.set(0xffbb33);
          m.emissiveIntensity = 0.4 + intensity * 1.6;
        } else {
          const orig = saved.get(m);
          m.emissive.copy(orig.emissive);
          m.emissiveIntensity = orig.intensity;
        }
      });
    });
  };

  return {
    declarative: true,
    type: 'LED',
    fields: { led_no: ledNo },
    onCommand(cmd, _ctx, simObject) {
      if (cmd.startsWith('LED_ON,')) {
        const parts = cmd.split(',');
        if (parseInt(parts[1], 10) === ledNo) {
          setEmit(simObject, Math.max(0, Math.min(1, parseFloat(parts[2]) || 1)));
        }
        return null;
      }
      if (cmd.startsWith('LED_OFF,')) {
        const arg = cmd.split(',')[1];
        if (arg === 'ALL' || parseInt(arg, 10) === ledNo) setEmit(simObject, 0);
        return null;
      }
      if (cmd.startsWith('[') && cmd.endsWith(']')) {   // [v0 v1 v2 v3 v4 v5]
        const values = cmd.slice(1, -1).trim().split(/\s+/);
        if (values.length > ledNo) {
          setEmit(simObject, Math.max(0, Math.min(1, parseFloat(values[ledNo]) || 0)));
        }
        return null;
      }
      return null;
    },
    dispose(_ctx, simObject) { setEmit(simObject, 0); saved.clear(); },
  };
}

// ============================================================
// Buzzer — 필드 없음 : BUZZER_ON 동안 객체 중심에서 퍼져나가는 음파 링 표시
// ============================================================
function makeRingTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(140,220,255,0.95)';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createBuzzerComponent(ctx) {
  const THREE = ctx.THREE;
  let ringTex = null;
  const waves = [];        // { sprite, age }
  let activeLeft = 0;      // 남은 발산 시간(초)
  let spawnCool = 0;

  const spawnRing = (simObject) => {
    if (!ringTex) ringTex = makeRingTexture(THREE);
    const mat = new THREE.SpriteMaterial({
      map: ringTex, transparent: true, opacity: 0.85, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    simObject.root.getWorldPosition(sprite.position);
    ctx.scene.add(sprite);
    waves.push({ sprite, age: 0 });
  };

  const WAVE_LIFE = 0.9;      // 링 하나의 수명(초)
  const WAVE_MAX_R = 1.1;     // 최대 반경(m)

  return {
    declarative: true,
    type: 'Buzzer',
    fields: {},
    get activeWaveCount() { return waves.length; },
    onCommand(cmd, cctx, simObject) {
      if (!cmd.startsWith('BUZZER_ON,')) return null;
      const parts = cmd.split(',');
      const hz = parseFloat(parts[1]) || 440;
      const sec = Math.max(0.15, parseFloat(parts[2]) || 0.3);
      activeLeft = Math.max(activeLeft, sec);
      spawnCool = 0;
      spawnRing(simObject);
      // 빈/커스텀 씬은 레거시 토픽 효과가 소리를 내지 않으므로 컴포넌트가 재생한다.
      // (레거시 토픽 씬에는 컴포넌트를 붙이지 않는 것이 전제 — 중복 재생 방지)
      if (!cctx.cfg?.chest && !cctx.cfg?.launch && !cctx.cfg?.parts) {
        cctx.audio?.playBeep?.(hz, sec);
      }
      return null;   // 링은 수명대로 자체 소멸
    },
    update(dt, _ctx, simObject) {
      if (activeLeft > 0) {
        activeLeft -= dt;
        spawnCool -= dt;
        if (spawnCool <= 0) { spawnRing(simObject); spawnCool = 0.28; }
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.age += dt;
        const t = Math.min(1, w.age / WAVE_LIFE);
        const s = 0.15 + t * WAVE_MAX_R * 2;
        w.sprite.scale.set(s, s, 1);
        w.sprite.material.opacity = 0.85 * (1 - t);
        if (t >= 1) {
          ctx.scene.remove(w.sprite);
          w.sprite.material.dispose();
          waves.splice(i, 1);
        }
      }
    },
    dispose() {
      waves.forEach((w) => { ctx.scene.remove(w.sprite); w.sprite.material.dispose(); });
      waves.length = 0;
      ringTex?.dispose?.();
      ringTex = null;
    },
  };
}

// ============================================================
// Oled — 필드 없음 : 검정 직사각형 평면에 OLED 신호(MSG/ICON/CLEAR)를 표시
//   OLED 해상도 128×64 를 캔버스 256×128(×2 배율)로 재현.
// ============================================================
function createOledComponent(ctx) {
  const THREE = ctx.THREE;
  const PX = 2;                                    // OLED 픽셀 → 캔버스 픽셀 배율
  const canvas = document.createElement('canvas');
  canvas.width = 128 * PX;
  canvas.height = 64 * PX;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  let quad = null;

  const clear = () => { g.fillStyle = '#000'; g.fillRect(0, 0, canvas.width, canvas.height); tex.needsUpdate = true; };
  const clearRect = (x, y, w, h) => { g.fillStyle = '#000'; g.fillRect(x * PX, y * PX, w * PX, h * PX); tex.needsUpdate = true; };
  const text = (x, y, str) => {
    g.fillStyle = '#e8f4ff';
    g.font = `${8 * PX}px 'D2Coding', Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillText(str, x * PX, y * PX);
    tex.needsUpdate = true;
  };
  const icon = (name, x, y) => {
    const bits = OLED_ICONS[name];
    if (!bits) return;
    g.fillStyle = '#e8f4ff';
    for (let row = 0; row < 32; row++) {           // 32×32 1bpp (행당 4바이트)
      for (let byte = 0; byte < 4; byte++) {
        const v = bits[row * 4 + byte];
        for (let bit = 0; bit < 8; bit++) {
          if (v & (0x80 >> bit)) {
            g.fillRect((x + byte * 8 + bit) * PX, (y + row) * PX, PX, PX);
          }
        }
      }
    }
    tex.needsUpdate = true;
  };

  return {
    declarative: true,
    type: 'Oled',
    fields: {},
    onAdd(_ctx, simObject) {
      clear();
      // 검정 디스플레이 면(0.64×0.32 m) — 호스트 객체 앞면(+Z)에 부착
      quad = new THREE.Mesh(
        new THREE.PlaneGeometry(0.64, 0.32),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
      );
      quad.position.z = 0.012;
      simObject.root.add(quad);
    },
    onCommand(cmd) {
      if (cmd === 'CLEAR_DISPLAY' || cmd.startsWith('CLEAR_DISPLAY')) { clear(); return null; }
      if (cmd.startsWith('CLEAR_RECT,')) {
        const p = cmd.split(',');
        clearRect(parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0, parseInt(p[3], 10) || 0, parseInt(p[4], 10) || 0);
        return null;
      }
      if (cmd.startsWith('MSG,')) {                 // 16자 줄바꿈 — 펌웨어/기존 rover OLED 와 동일 규칙
        clear();
        let rem = cmd.slice(4) || 'Hello';
        for (let yp = 0; rem && yp < 64; yp += 8) {
          text(0, yp, rem.slice(0, 16));
          rem = rem.slice(16);
        }
        return null;
      }
      if (cmd.startsWith('MSG_XY,')) {
        const p = cmd.split(',');
        text(parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0, p.slice(3).join(',') || 'Hello');
        return null;
      }
      if (cmd.startsWith('ICON,')) {
        const p = cmd.split(',');
        icon((p[1] || '').trim().toLowerCase(), parseInt(p[2], 10) || 0, parseInt(p[3], 10) || 0);
        return null;
      }
      return null;
    },
    dispose(_ctx, simObject) {
      if (quad) {
        simObject.root.remove(quad);
        quad.geometry.dispose();
        quad.material.dispose();
        quad = null;
      }
      tex.dispose();
    },
  };
}

// ============================================================
// 3단계 공통 헬퍼 — 규약(2026-07-08 개정): 벡터 필드는 **로컬 좌표계**(객체 자신의
// 좌표계) 기준. 객체가 회전하면 축도 함께 따라간다(선회 후 전진은 틀어진 방향으로).
// 1 unit = 1 m. 컴포넌트는 부착된 객체(+하위)만 이동·회전시키고 설정된 필드만 동작.
// ============================================================
function fieldVec(THREE, arr, { normalize = true } = {}) {
  if (!Array.isArray(arr) || arr.length !== 3) return null;
  const v = new THREE.Vector3(+arr[0] || 0, +arr[1] || 0, +arr[2] || 0);
  if (normalize) {
    if (v.lengthSq() < 1e-12) return null;
    v.normalize();
  }
  return v;
}

// 로컬 좌표의 점(pivotLocal)을 지나는 로컬 축(axisLocal) 둘레로 회전 —
// 회전 기준축을 객체 원점에서 옮겨 놓는 offset 지원. pivot 이 없으면 원점 기준.
// 오프셋 의미: 원점에서 로컬 축 방향으로 "그 거리(m)만큼" 떨어진 점을 축이 지난다.
// (객체 스케일은 적용하지 않는다 — (0,1,0) 이면 스케일과 무관하게 정확히 1 m 위)
function rotateAboutLocalPivot(THREE, obj, axisLocal, angle, pivotLocal) {
  if (!pivotLocal) { obj.rotateOnAxis(axisLocal, angle); return; }
  const q = new THREE.Quaternion().setFromAxisAngle(axisLocal, angle);
  const delta = pivotLocal.clone().sub(pivotLocal.clone().applyQuaternion(q)).applyQuaternion(obj.quaternion);
  obj.position.add(delta);
  obj.quaternion.multiply(q);
}

// 로컬 점 오프셋 → 월드 좌표 (방향은 객체 회전을 따르고, 거리는 미터 그대로 — 스케일 미적용)
function localOffsetToWorld(THREE, obj, offsetLocal) {
  return obj.getWorldPosition(new THREE.Vector3())
    .add(offsetLocal.clone().applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion())));
}

// ============================================================
// DC — { axis_rotation?, axis_translate? } : DC_FORWARD/BACKWARD/STOP (+tFORWARD/tBACKWARD)
//   전진=반시계(+), 후진=시계(−). 출력 강도(명령 2번째 인자)로 속도 변경.
// ============================================================
function createDcComponent(ctx, fields = {}) {
  const THREE = ctx.THREE;
  const axisRot = fieldVec(THREE, fields.axis_rotation);
  const axisMove = fieldVec(THREE, fields.axis_translate);
  const rotOffset = fieldVec(THREE, fields.rotation_offset, { normalize: false });   // 회전 기준점(로컬)
  const ROT_SPEED = 6.0;    // rad/s (강도 1 기준)
  const MOVE_SPEED = 0.5;   // m/s  (강도 1 기준)
  let dir = 0, speed = 1;
  const stop = () => { dir = 0; };
  const normSpeed = (v) => {
    const n = parseFloat(v);
    if (!isFinite(n) || n <= 0) return 1;
    return Math.max(0.05, Math.min(1, n > 1 ? n / 100 : n));   // 0~100 도, 0~1 도 허용
  };

  const outFields = {};
  if (axisRot) outFields.axis_rotation = [...fields.axis_rotation];
  if (axisMove) outFields.axis_translate = [...fields.axis_translate];
  if (rotOffset) outFields.rotation_offset = [rotOffset.x, rotOffset.y, rotOffset.z];

  return {
    declarative: true,
    type: 'DC',
    fields: outFields,
    onCommand(cmd) {
      if (cmd === 'STOP_ALL' || cmd === 'DC_STOP' || cmd.startsWith('DC_STOP,')) { stop(); return null; }
      if (cmd.startsWith('DC_tFORWARD,') || cmd.startsWith('DC_tBACKWARD,')) {
        dir = cmd.startsWith('DC_tFORWARD,') ? 1 : -1;
        speed = 1;
        return stop;                                   // 시간지정: hold 종료 시 정지
      }
      if (cmd === 'DC_FORWARD' || cmd.startsWith('DC_FORWARD,')) { dir = 1; speed = normSpeed(cmd.split(',')[1]); return null; }
      if (cmd === 'DC_BACKWARD' || cmd.startsWith('DC_BACKWARD,')) { dir = -1; speed = normSpeed(cmd.split(',')[1]); return null; }
      return null;
    },
    update(dt, _c, simObject) {
      if (!dir) return;
      // 로컬 축 기준(규약 개정) — rotation_offset 이 있으면 그 점을 지나는 축 둘레로 회전
      if (axisRot) rotateAboutLocalPivot(THREE, simObject.root, axisRot, dir * speed * ROT_SPEED * dt, rotOffset);
      if (axisMove) simObject.root.translateOnAxis(axisMove, dir * speed * MOVE_SPEED * dt);
    },
    dispose() { stop(); },
  };
}

// ============================================================
// Servo — { wheel: left|right, axis_rotation?, axis_direction?, axis_turn? }
//   전진: left=반시계/right=시계 스핀. 좌회전: left=시계/right=반시계 스핀 + 몸체 반시계.
//   우회전: 반대. (SIMULATOR.md 2장)
// ============================================================
function createServoComponent(ctx, fields = {}) {
  const THREE = ctx.THREE;
  const wheel = fields.wheel === 'right' ? 'right' : 'left';
  const axisRot = fieldVec(THREE, fields.axis_rotation);
  const axisDir = fieldVec(THREE, fields.axis_direction);
  const axisTurn = fieldVec(THREE, fields.axis_turn);
  const rotOffset = fieldVec(THREE, fields.rotation_offset, { normalize: false });   // 스핀축 기준점(로컬)
  const turnOffset = fieldVec(THREE, fields.turn_offset, { normalize: false });      // 선회축 기준점(로컬)
  const SPIN = 8.0;   // 바퀴 스핀 rad/s
  const MOVE = 0.4;   // 이동 m/s
  const TURN = 1.5;   // 선회 rad/s
  let move = 0, turn = 0;
  const stop = () => { move = 0; turn = 0; };

  const outFields = { wheel };
  if (axisRot) outFields.axis_rotation = [...fields.axis_rotation];
  if (axisDir) outFields.axis_direction = [...fields.axis_direction];
  if (axisTurn) outFields.axis_turn = [...fields.axis_turn];
  if (rotOffset) outFields.rotation_offset = [rotOffset.x, rotOffset.y, rotOffset.z];
  if (turnOffset) outFields.turn_offset = [turnOffset.x, turnOffset.y, turnOffset.z];

  return {
    declarative: true,
    type: 'Servo',
    fields: outFields,
    onCommand(cmd) {
      if (cmd === 'STOP_ALL' || cmd === 'SERVO_STOP' || cmd.startsWith('SERVO_STOP,')) { stop(); return null; }
      const is = (p) => cmd.startsWith(p);
      if (is('SERVO_tFORWARD,'))  { move = 1;  turn = 0; return stop; }
      if (is('SERVO_tBACKWARD,')) { move = -1; turn = 0; return stop; }
      if (is('SERVO_tLEFT,'))     { turn = 1;  move = 0; return stop; }
      if (is('SERVO_tRIGHT,'))    { turn = -1; move = 0; return stop; }
      if (cmd === 'SERVO_FORWARD'  || is('SERVO_FORWARD,'))  { move = 1;  turn = 0; return null; }
      if (cmd === 'SERVO_BACKWARD' || is('SERVO_BACKWARD,')) { move = -1; turn = 0; return null; }
      if (cmd === 'SERVO_LEFT'     || is('SERVO_LEFT,'))     { turn = 1;  move = 0; return null; }
      if (cmd === 'SERVO_RIGHT'    || is('SERVO_RIGHT,'))    { turn = -1; move = 0; return null; }
      return null;
    },
    update(dt, _c, simObject) {
      const root = simObject.root;
      // 로컬 축 기준(규약 개정) — *_offset 이 있으면 그 점을 지나는 축 둘레로 회전
      if (move !== 0) {
        if (axisRot) rotateAboutLocalPivot(THREE, root, axisRot, (wheel === 'left' ? 1 : -1) * move * SPIN * dt, rotOffset);
        if (axisDir) root.translateOnAxis(axisDir, move * MOVE * dt);
      }
      if (turn !== 0) {
        if (axisRot) rotateAboutLocalPivot(THREE, root, axisRot, (wheel === 'left' ? -1 : 1) * turn * SPIN * dt, rotOffset);
        if (axisTurn) rotateAboutLocalPivot(THREE, root, axisTurn, turn * TURN * dt, turnOffset);
      }
    },
    dispose() { stop(); },
  };
}

// ============================================================
// UltraSonic — { detect_direction(로컬축) } : DISTANCE 명령에 ray 를 쏘아
//   거리(cm, 소수 둘째 자리) 회신. 객체가 회전하면 ray 방향도 함께 돈다.
// ============================================================
function createUltraSonicComponent(ctx, fields = {}) {
  const THREE = ctx.THREE;
  const dirLocal = fieldVec(THREE, fields.detect_direction) || new THREE.Vector3(0, 0, 1);
  const ray = new THREE.Raycaster();
  const under = (node, root) => { let n = node; while (n) { if (n === root) return true; n = n.parent; } return false; };
  return {
    declarative: true,
    type: 'UltraSonic',
    fields: { detect_direction: [dirLocal.x, dirLocal.y, dirLocal.z] },
    measure(cctx, simObject) {
      cctx.scene.updateMatrixWorld(true);   // 프로그램적 이동 직후에도 정확하도록 강제 갱신
      const origin = simObject.root.getWorldPosition(new THREE.Vector3());
      const dir = dirLocal.clone()
        .applyQuaternion(simObject.root.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      ray.set(origin, dir);
      ray.far = 50;
      const hits = ray.intersectObjects(cctx.scene.children, true);
      for (const h of hits) {
        if (!h.object.isMesh || h.object.isSprite) continue;
        if (under(h.object, simObject.root)) continue;                       // 자기 자신 제외
        if (cctx.editor?.transform && under(h.object, cctx.editor.transform)) continue;   // 기즈모 제외
        if (cctx.editor?.boxHelper && under(h.object, cctx.editor.boxHelper)) continue;
        return Math.round(h.distance * 100 * 100) / 100;   // 1 unit = 1 m → cm, 소수 둘째 자리
      }
      return null;
    },
  };
}

// ============================================================
// Magnet — { detection_point(로컬 점) } / Metal — 무필드
//   감지점(객체 로컬 좌표의 점을 월드로 변환) 반경 5cm 내 Metal 객체 존재 → 1
// ============================================================
const MAGNET_RADIUS = 0.05;   // 5 cm (규약 2026-07-08)

function createMagnetComponent(ctx, fields = {}) {
  const THREE = ctx.THREE;
  const point = fieldVec(THREE, fields.detection_point, { normalize: false }) || new THREE.Vector3();
  const box = new THREE.Box3();
  return {
    declarative: true,
    type: 'Magnet',
    fields: { detection_point: [point.x, point.y, point.z] },
    measure(cctx, simObject) {
      cctx.scene.updateMatrixWorld(true);
      const sensor = localOffsetToWorld(THREE, simObject.root, point);
      for (const item of cctx.objects?.items || []) {
        if (item === simObject || !item.components?.Metal) continue;
        box.setFromObject(item.root);
        if (box.distanceToPoint(sensor) <= MAGNET_RADIUS) return 1;
      }
      return 0;
    },
  };
}

function createMetalComponent() {
  return { declarative: true, type: 'Metal', fields: {} };
}

// ============================================================
// Gun — { propel_direction, explosion? } : GUN_FIRE 에 발사체가 빠르게 이동,
//   explosion 지점(월드축 오프셋)에서 연기 발생. 폭발음은 dispatch 가
//   Gun 객체 유무와 관계없이 재생한다(SIMULATOR.md).
// ============================================================
function makeSmokeTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(210,210,215,0.9)');
  grad.addColorStop(0.6, 'rgba(160,160,168,0.45)');
  grad.addColorStop(1, 'rgba(140,140,148,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createGunComponent(ctx, fields = {}) {
  const THREE = ctx.THREE;
  // propel/explosion 은 로컬 좌표계(규약 개정) — 발사 시점의 객체 방향을 따른다
  const propel = fieldVec(THREE, fields.propel_direction) || new THREE.Vector3(0, 0, 1);
  const expl = fieldVec(THREE, fields.explosion, { normalize: false });
  const PROJ_SPEED = 6.0;   // m/s ("빠르게 이동")
  const PROJ_LIFE = 1.2;    // s
  const SMOKE_LIFE = 1.0;   // s
  let smokeTex = null;
  const projectiles = [];   // { mesh, vel, age }
  const smokes = [];        // { sprite, age, rise }

  const outFields = { propel_direction: [propel.x, propel.y, propel.z] };
  if (expl) outFields.explosion = [expl.x, expl.y, expl.z];

  const spawnSmoke = (at) => {
    if (!smokeTex) smokeTex = makeSmokeTexture(THREE);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.8, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, i * 0.06, (Math.random() - 0.5) * 0.15));
      sprite.scale.setScalar(0.18 + i * 0.06);
      ctx.scene.add(sprite);
      smokes.push({ sprite, age: -i * 0.12, rise: 0.35 + Math.random() * 0.2 });
    }
  };

  return {
    declarative: true,
    type: 'Gun',
    fields: outFields,
    get activeProjectileCount() { return projectiles.length; },
    onCommand(cmd, _c, simObject) {
      if (cmd !== 'GUN_FIRE' && !cmd.startsWith('GUN_FIRE,')) return null;
      ctx.scene.updateMatrixWorld(true);
      const origin = simObject.root.getWorldPosition(new THREE.Vector3());
      // 로컬 발사 방향을 발사 시점의 월드 방향으로 변환
      const dirWorld = propel.clone()
        .applyQuaternion(simObject.root.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.4, metalness: 0.5 }),
      );
      mesh.position.copy(origin).addScaledVector(dirWorld, 0.25);
      ctx.scene.add(mesh);
      projectiles.push({ mesh, vel: dirWorld.multiplyScalar(PROJ_SPEED), age: 0 });
      if (expl) spawnSmoke(localOffsetToWorld(THREE, simObject.root, expl));
      return null;
    },
    update(dt) {
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.age += dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.age >= PROJ_LIFE) {
          ctx.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          projectiles.splice(i, 1);
        }
      }
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        s.age += dt;
        if (s.age < 0) continue;
        const t = Math.min(1, s.age / SMOKE_LIFE);
        s.sprite.position.y += s.rise * dt;
        s.sprite.scale.setScalar(0.2 + t * 0.65);
        s.sprite.material.opacity = 0.8 * (1 - t);
        if (t >= 1) {
          ctx.scene.remove(s.sprite);
          s.sprite.material.dispose();
          smokes.splice(i, 1);
        }
      }
    },
    dispose() {
      projectiles.forEach((p) => { ctx.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
      smokes.forEach((s) => { ctx.scene.remove(s.sprite); s.sprite.material.dispose(); });
      projectiles.length = 0;
      smokes.length = 0;
      smokeTex?.dispose?.();
      smokeTex = null;
    },
  };
}

// ============================================================
// 팩토리 · 부착/해제 · 직렬화
// ============================================================
const FACTORIES = {
  LED: createLedComponent,
  Buzzer: createBuzzerComponent,
  Oled: createOledComponent,
  DC: createDcComponent,
  Servo: createServoComponent,
  UltraSonic: createUltraSonicComponent,
  Magnet: createMagnetComponent,
  Metal: createMetalComponent,
  Gun: createGunComponent,
};

export const COMPONENT_TYPES = Object.keys(FACTORIES);

export function createComponent(ctx, type, fields = {}) {
  const make = FACTORIES[type];
  if (!make) throw new Error(`알 수 없는 컴포넌트: ${type}`);
  return make(ctx, fields);
}

// 객체당 타입별 1개. 이미 등록된 객체에 부착하면 onAdd 를 즉시 호출한다.
export function attachComponent(ctx, simObject, type, fields = {}) {
  if (!simObject) return null;
  detachComponent(ctx, simObject, type);
  const comp = createComponent(ctx, type, fields);
  simObject.components[type] = comp;
  comp.onAdd?.(ctx, simObject);
  if (ctx.objects) ctx.objects.version += 1;   // Hierarchy 갱신 트리거
  return comp;
}

export function detachComponent(ctx, simObject, type) {
  const comp = simObject?.components?.[type];
  if (!comp) return;
  comp.dispose?.(ctx, simObject);
  delete simObject.components[type];
  if (ctx.objects) ctx.objects.version += 1;
}

// 선언형 컴포넌트만 직렬화한다(movementBox 등 내장 컴포넌트는 객체 type 이 재생성).
export function serializeComponents(simObject) {
  return Object.values(simObject.components || {})
    .filter((c) => c && c.declarative)
    .map((c) => ({ type: c.type, fields: { ...c.fields } }));
}
