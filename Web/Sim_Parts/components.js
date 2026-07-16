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
const LED_LIGHT = { intensity: 2.5, distance: 5, decay: 2 };   // 점등 포인트 라이트 파라미터

function createLedComponent(ctx, fields = {}) {
  const ledNo = Math.max(0, Math.min(5, parseInt(fields.led_no, 10) || 0));
  const saved = new Map();   // mesh -> { emissive, intensity }
  let light = null;          // 점등 중에만 객체 중심에 존재하는 발광색 PointLight

  // 포인트 라이트 색 = 객체 발광색. 색상 지원 객체는 metadata.colors.emissive,
  // 그 외(GLB 등)는 setEmit 의 발광 규칙과 동일하게 첫 재질 고유색(어두우면 앰버).
  const lightColorFor = (simObject) => {
    const color = new ctx.THREE.Color(0xffbb33);
    const glow = simObject.metadata?.colors?.emissive;
    if (glow) {
      color.setRGB(glow[0] ?? 1, glow[1] ?? 1, glow[2] ?? 1, 'srgb');
      return color;
    }
    let found = null;
    forOwnMeshes(simObject.root, (mesh) => {
      if (found) return;
      const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (m?.map) { found = new ctx.THREE.Color(0xffffff); return; }
      if (m?.color && (m.color.r + m.color.g + m.color.b) > 0.05) found = m.color.clone();
    });
    return found || color;
  };

  // 발광 밝기에 맞춰 포인트 라이트를 생성/갱신하고, 소등(t=0)이면 제거한다.
  const setLight = (simObject, t) => {
    if (t > 0) {
      if (!light) {
        light = new ctx.THREE.PointLight(0xffffff, 0, LED_LIGHT.distance, LED_LIGHT.decay);
        simObject.root.add(light);
      }
      light.color.copy(lightColorFor(simObject));
      light.intensity = LED_LIGHT.intensity * t;
    } else if (light) {
      light.parent?.remove(light);
      light.dispose?.();
      light = null;
    }
  };

  const setEmit = (simObject, intensity) => {
    setLight(simObject, Math.max(0, Math.min(1, intensity)));
    // 색상 지원 객체(박스·구): 밝기 t(0~1)로 기본색↔발광색을 보간한다.
    // t=0 → 기본색 그대로, t=1 → 발광색만 보임(확산색은 (1-t) 로 감쇠, 발광은 t 비율).
    // GLB(colorMode==='multiply')는 보간이 아니라 **원래 메시 색 × 발광색** 으로 빛난다
    // — 아래 saved 경로에서 발광색 틴트를 곱해 처리한다.
    const colors = simObject.metadata?.colors;
    const multiply = simObject.metadata?.colorMode === 'multiply';
    forOwnMeshes(simObject.root, (mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (!m || m.emissive === undefined) return;   // Basic 계열 등 emissive 없는 재질은 무시
        if (colors && !multiply) {
          const t = Math.max(0, Math.min(1, intensity));
          const base = colors.base || [1, 1, 1, 1];
          const glow = colors.emissive || [1, 1, 1, 1];
          m.color.setRGB((base[0] ?? 1) * (1 - t), (base[1] ?? 1) * (1 - t), (base[2] ?? 1) * (1 - t), 'srgb');
          m.emissive.setRGB(glow[0] ?? 0, glow[1] ?? 0, glow[2] ?? 0, 'srgb');
          m.emissiveIntensity = t;
          // 불투명도(a)도 함께 보간 — t=0 기본색 a, t=1 발광색 a
          m.opacity = Math.max(0, Math.min(1, (base[3] ?? 1) * (1 - t) + (glow[3] ?? 1) * t));
          m.transparent = m.opacity < 1;
          m.needsUpdate = true;
          return;
        }
        if (!saved.has(m)) {
          saved.set(m, {
            emissive: m.emissive.clone(),
            intensity: m.emissiveIntensity ?? 1,
            emissiveMap: m.emissiveMap ?? null,
            color: m.color ? m.color.clone() : null,   // 점등 직전 확산색(기본색 틴트 포함)
            opacity: m.opacity ?? 1,                   // 점등 직전 불투명도(기본색 A 포함)
            transparent: !!m.transparent,
          });
        }
        if (intensity > 0) {
          // 곱셈 모드(GLB)의 발광색 틴트 — (1,1,1) 이면 종전과 동일(원래 색 그대로 발광)
          const glow = (multiply && colors?.emissive) ? colors.emissive : null;
          // 발광 중에는 기본색 곱을 완전히 배제한다 — 확산색을 원본 메시색으로 되돌려
          // 겉보기 색이 '메시 색 × 발광색' 만으로 나게 한다(소등 시 기본색 틴트 복원).
          if (multiply && m.userData._aresOrig && m.color) {
            const o = m.userData._aresOrig;
            // 점등 중 확산(diffuse)을 밝기에 비례해 감쇠 — 확산+발광 합산이 클리핑되며
            // 발광색이 흰색으로 씻겨 보이던 문제 완화(프리미티브 보간 모드와 같은 원리)
            m.color.copy(o.color).multiplyScalar(1 - 0.6 * intensity);
            // 불투명도도 기본색 A 를 배제하고 원본으로 — 발광은 온전히 메시 원형 기준
            m.opacity = o.opacity ?? 1;
            m.transparent = o.transparent || m.opacity < 1;
          }
          if (m.map) {
            // GLB 등 텍스처 재질: 자기 텍스처 색 그대로 발광 — emissive 색이 텍셀에
            // 곱해지므로 발광색 틴트가 있으면 '원래 메시 색 × 발광색' 이 된다
            m.emissiveMap = m.map;
            if (glow) m.emissive.setRGB(glow[0] ?? 1, glow[1] ?? 1, glow[2] ?? 1, 'srgb');
            else m.emissive.set(0xffffff);
          } else {
            // 단색 재질: 원본 메시색으로 발광(순검정이면 LED 느낌의 앰버로) — 기본색 미포함
            const orig = m.userData._aresOrig?.color || m.color;
            const base = orig && (orig.r + orig.g + orig.b) > 0.05 ? orig : null;
            if (base) m.emissive.copy(base); else m.emissive.set(0xffbb33);
            if (glow) {
              const tint = m.emissive.clone().set(0xffffff).setRGB(glow[0] ?? 1, glow[1] ?? 1, glow[2] ?? 1, 'srgb');
              m.emissive.multiply(tint);   // 원래 메시 색 × 발광색
            }
          }
          // 곱셈 모드는 강도를 낮게(≤1.1) — ACES 톤매핑이 밝은 채도색을 흰색으로
          // 말아 올리는(백화) 지점 아래에 머물러 발광색이 그대로 느껴진다.
          m.emissiveIntensity = multiply ? (0.35 + intensity * 0.75) : (0.4 + intensity * 1.6);
        } else {
          const orig = saved.get(m);
          m.emissive.copy(orig.emissive);
          m.emissiveIntensity = orig.intensity;
          m.emissiveMap = orig.emissiveMap;
          if (orig.color && m.color) m.color.copy(orig.color);   // 기본색 틴트 복원
          if (orig.opacity !== undefined) { m.opacity = orig.opacity; m.transparent = orig.transparent || m.opacity < 1; }
        }
        m.needsUpdate = true;   // emissiveMap 변경은 셰이더 재컴파일 필요
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
          // 밝기 0 도 유효값(기본색) — `|| 1` 폴백은 0 을 1 로 바꿔버리므로 금지
          const b = parseFloat(parts[2]);
          setEmit(simObject, Math.max(0, Math.min(1, Number.isFinite(b) ? b : 1)));
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

// 회전축 규약(2026-07-09 재정의): 축 **방향**은 부모 좌표계 기준, 축 **기준점 오프셋**은
// **객체 로컬 좌표** 기준이다. 로컬로 정의된 기준점은 객체에 붙은 재질점이라 객체가
// 어떤 변환 상태(이동·회전)에 있어도 항상 같은 자리에 놓이고, 회전이 진행돼도 축이
// 공간에 고정된 채 객체가 그 둘레를 돈다 — 문 경첩, 원점이 어긋난 바퀴 보정.
// (거리는 m 그대로 — 스케일 미적용. 오프셋이 없으면 객체 원점을 지나는 축)
function rotateAboutParentAxis(THREE, obj, axisParent, angle, pivotLocal) {
  const q = new THREE.Quaternion().setFromAxisAngle(axisParent, angle);
  if (pivotLocal) {
    // 축 통과점(부모 공간) = 원점 + 현재 자세로 회전시킨 로컬 기준점 — 회전 불변점
    const pivot = pivotLocal.clone().applyQuaternion(obj.quaternion).add(obj.position);
    obj.position.sub(pivot).applyQuaternion(q).add(pivot);
  }
  obj.quaternion.premultiply(q);
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
  const rotOffset = fieldVec(THREE, fields.rotation_offset, { normalize: false });   // 회전 기준점(객체 로컬 좌표)
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
    // 편집기 표시용 — 회전축이 지나는 점(객체 로컬 기준점). null 이면 원점 통과
    getPivotLocal(field) { return field === 'rotation_offset' ? rotOffset : null; },
    onCommand(cmd) {
      // SIM_END: 모의실행 종료(자연/중단 공통) — 연속 명령(DC_FORWARD)으로 켜진 회전을
      // 정지한다. 종전에는 중단 때의 STOP_ALL 만 멈춰서, '계속 전진' 프로그램이 즉시
      // 끝나면 모터가 영원히 돌고 멈출 방법이 없었다.
      if (cmd === 'STOP_ALL' || cmd === 'SIM_END' || cmd === 'DC_STOP' || cmd.startsWith('DC_STOP,')) { stop(); return null; }
      if (cmd.startsWith('DC_tFORWARD,') || cmd.startsWith('DC_tBACKWARD,')) {
        dir = cmd.startsWith('DC_tFORWARD,') ? 1 : -1;
        // DC_t방향,초,속도 — 3번째 인자가 속도다. 펌웨어(_handle_timed_dcmotor_new)는
        // 이를 PWM 에 반영하므로 시뮬도 동일하게 반영한다(종전에는 1 고정이라
        // 랜덤 속도 블록을 써도 시뮬에서는 항상 같은 속도로 돌던 패리티 버그).
        speed = normSpeed(cmd.split(',')[2]);
        return stop;                                   // 시간지정: hold 종료 시 정지
      }
      if (cmd === 'DC_FORWARD' || cmd.startsWith('DC_FORWARD,')) { dir = 1; speed = normSpeed(cmd.split(',')[1]); return null; }
      if (cmd === 'DC_BACKWARD' || cmd.startsWith('DC_BACKWARD,')) { dir = -1; speed = normSpeed(cmd.split(',')[1]); return null; }
      return null;
    },
    update(dt, _c, simObject) {
      if (!dir) return;
      // 축 방향(회전·이동)은 부모 좌표계, 기준점 오프셋만 객체 로컬(규약 2026-07-09 개정)
      if (axisRot) rotateAboutParentAxis(THREE, simObject.root, axisRot, dir * speed * ROT_SPEED * dt, rotOffset);
      // position 은 부모 좌표이므로 부모축 그대로 더하면 된다(자기 회전·스핀과 무관)
      if (axisMove) simObject.root.position.addScaledVector(axisMove, dir * speed * MOVE_SPEED * dt);
    },
    dispose() { stop(); },
  };
}

// ============================================================
// Servo — { wheel: left|right|neutral, axis_rotation?, axis_direction?, axis_turn? }
//   전진: left=반시계/right=시계 스핀(좌우 대칭 메시라 부호 반대).
//   좌회전(제자리): left 후진·right 전진 → 두 바퀴 모두 같은 부호로 스핀 + 몸체 반시계.
//   우회전: 반대. (SIMULATOR.md 2장)
// ============================================================
function createServoComponent(ctx, fields = {}) {
  const THREE = ctx.THREE;
  // left/right = 차동 좌우 바퀴, neutral = 어느 쪽도 아님(전진=반시계, 선회 차동 스핀 없음)
  const wheel = fields.wheel === 'right' ? 'right' : (fields.wheel === 'neutral' ? 'neutral' : 'left');
  const axisRot = fieldVec(THREE, fields.axis_rotation);
  const axisDir = fieldVec(THREE, fields.axis_direction);
  const axisTurn = fieldVec(THREE, fields.axis_turn);
  const rotOffset = fieldVec(THREE, fields.rotation_offset, { normalize: false });   // 스핀축 기준점(객체 로컬 좌표)
  const turnOffset = fieldVec(THREE, fields.turn_offset, { normalize: false });      // 선회축 기준점(객체 로컬 좌표)
  const SPIN = 4.0;   // 바퀴 스핀 rad/s (≈38rpm — 레거시 로버 애니메이션과 동일, 과속 방지)
  const MOVE = 0.4;   // 이동 m/s
  const TURN = 1.5;   // 선회 rad/s
  let move = 0, turn = 0, speed = 1;
  const _dir = new THREE.Vector3();   // 이동 방향 계산용 스크래치(프레임당 할당 방지)
  const stop = () => { move = 0; turn = 0; };
  // 속도 % 파싱(0~100 또는 0~1 허용) — 블록의 서보 전진 속도(%)를 시뮬에 반영
  const spd = (v) => { const n = parseFloat(v); if (!isFinite(n) || n <= 0) return 1; return Math.max(0.05, Math.min(1, n > 1 ? n / 100 : n)); };

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
    // 편집기 표시용 — 각 축이 지나는 점(객체 로컬 기준점). null 이면 원점 통과
    getPivotLocal(field) {
      if (field === 'rotation_offset') return rotOffset;
      if (field === 'turn_offset') return turnOffset;
      return null;
    },
    onCommand(cmd) {
      if (cmd === 'STOP_ALL' || cmd === 'SIM_END' || cmd === 'SERVO_STOP' || cmd.startsWith('SERVO_STOP,')) { stop(); return null; }   // SIM_END: 종료 시 연속 주행 정지
      const is = (p) => cmd.startsWith(p);
      const p = cmd.split(',');
      // 시간지정(SERVO_t*,초,속도): 속도=3번째 인자 / 연속(SERVO_*,속도): 속도=2번째 인자
      if (is('SERVO_tFORWARD,'))  { move = 1;  turn = 0; speed = spd(p[2]); return stop; }
      if (is('SERVO_tBACKWARD,')) { move = -1; turn = 0; speed = spd(p[2]); return stop; }
      if (is('SERVO_tLEFT,'))     { turn = 1;  move = 0; speed = spd(p[2]); return stop; }
      if (is('SERVO_tRIGHT,'))    { turn = -1; move = 0; speed = spd(p[2]); return stop; }
      if (cmd === 'SERVO_FORWARD'  || is('SERVO_FORWARD,'))  { move = 1;  turn = 0; speed = spd(p[1]); return null; }
      if (cmd === 'SERVO_BACKWARD' || is('SERVO_BACKWARD,')) { move = -1; turn = 0; speed = spd(p[1]); return null; }
      if (cmd === 'SERVO_LEFT'     || is('SERVO_LEFT,'))     { turn = 1;  move = 0; speed = spd(p[1]); return null; }
      if (cmd === 'SERVO_RIGHT'    || is('SERVO_RIGHT,'))    { turn = -1; move = 0; speed = spd(p[1]); return null; }
      return null;
    },
    update(dt, _c, simObject) {
      const root = simObject.root;
      // 축 방향(스핀·이동·선회)은 부모 좌표계, 기준점 오프셋만 객체 로컬(규약 2026-07-09 개정)
      // 스핀 부호: 전진 시 left·neutral=반시계(+)/right=시계(−),
      //           선회 시 left=시계/right=반시계 차동, neutral 은 차동 스핀 없음
      if (move !== 0) {
        if (axisRot) rotateAboutParentAxis(THREE, root, axisRot, (wheel === 'right' ? -1 : 1) * move * speed * SPIN * dt, rotOffset);
        // 이동 방향은 객체 자신의 현재 자세로 변환 — 선회 후에도 '자기 앞쪽'으로 전/후진(2026-07-16)
        // (axis_direction 을 객체 로컬축으로 해석. root.quaternion 은 부모 기준 회전이므로 결과는 부모 좌표계 방향)
        if (axisDir) root.position.addScaledVector(_dir.copy(axisDir).applyQuaternion(root.quaternion), move * speed * MOVE * dt);
      }
      if (turn !== 0) {
        // 제자리 선회는 좌우 바퀴가 같은 부호로 스핀(한쪽 후진·한쪽 전진). 이전엔 right 만 반대로 돌던 버그
        const turnSpin = (wheel === 'left' || wheel === 'right') ? -1 : 0;
        if (axisRot && turnSpin !== 0) rotateAboutParentAxis(THREE, root, axisRot, turnSpin * turn * speed * SPIN * dt, rotOffset);
        if (axisTurn) rotateAboutParentAxis(THREE, root, axisTurn, turn * speed * TURN * dt, turnOffset);
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
        if (cctx.editor?.axisHandle && under(h.object, cctx.editor.axisHandle)) continue; // 축 핸들 제외
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
  // propel 은 상위(부모) 좌표계 축, explosion 은 객체 로컬 점(규약 2026-07-09 개정)
  // 발사 방향(선택) — 체크 해제 시 null → 자기 추진(비행) 없이 발사 효과(연기)만 낸다.
  const propel = fieldVec(THREE, fields.propel_direction);
  const expl = fieldVec(THREE, fields.explosion, { normalize: false });
  const FLY_SPEED = 6.0;    // m/s ("빠르게 이동")
  const FLY_TIME = 1.2;     // s — 이 시간만큼 날아간 뒤 그 자리에 멈춘다
  const RETURN_TIME = 1.0;  // s — SIM_END 후 이 시간에 걸쳐 원위치로 돌아온다
  const SMOKE_LIFE = 1.0;   // s
  let smokeTex = null;
  // 발사 = 다른 발사체를 만드는 것이 아니라 **자기 자신이** 발사 방향으로 날아간다.
  let flight = null;        // { vel(월드), age } — 비행 중 상태
  let home = null;          // 첫 발사 직전의 부모 기준 위치 — SIM_END 에 복귀
  let returning = null;     // { from, age } — SIM_END 복귀 애니메이션 상태
  const smokes = [];        // { sprite, age, rise }

  const outFields = {};
  if (propel) outFields.propel_direction = [propel.x, propel.y, propel.z];
  if (expl) outFields.explosion = [expl.x, expl.y, expl.z];

  // 즉시 원위치 복귀 — 시뮬 재시작(SIM_START)·컴포넌트 해제 시 사용
  const restoreHome = (simObject) => {
    flight = null;
    returning = null;
    if (!home) return;
    simObject.root.position.copy(home);
    home = null;
  };

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
    get isFlying() { return !!flight; },
    onCommand(cmd, _c, simObject) {
      if (cmd === 'SIM_END') {           // 시뮬레이션 종료(자연 종료·실험중단) — 1초에 걸쳐 원위치 복귀
        flight = null;
        if (home) returning = { from: simObject.root.position.clone(), age: 0 };
        return null;
      }
      if (cmd === 'SIM_START') {         // 재시작 — 복귀 중이면 즉시 원위치로 스냅
        if (returning || home) restoreHome(simObject);
        return null;
      }
      if (cmd !== 'GUN_FIRE' && !cmd.startsWith('GUN_FIRE,')) return null;
      ctx.scene.updateMatrixWorld(true);
      if (expl) spawnSmoke(localOffsetToWorld(THREE, simObject.root, expl));
      // 발사 방향 미사용(체크 해제) 시 자기 자신은 날아가지 않는다 — 연기 효과만.
      if (!propel) return null;
      // 발사 방향은 상위(부모) 좌표계 기준 — 자기 회전(스핀 등)과 무관하게
      // 발사 시점의 부모 자세를 월드로 변환해 적용한다
      const parentObj = simObject.root.parent;
      const dirWorld = propel.clone();
      if (parentObj) dirWorld.applyQuaternion(parentObj.getWorldQuaternion(new THREE.Quaternion()));
      dirWorld.normalize();
      if (!home) home = simObject.root.position.clone();   // 복귀 지점은 첫 발사 직전 위치
      flight = { vel: dirWorld.multiplyScalar(FLY_SPEED), age: 0 };
      return null;
    },
    update(dt, _ctx, simObject) {
      if (returning) {
        returning.age += dt;
        const t = Math.min(1, returning.age / RETURN_TIME);
        // smoothstep 감속 — 출발·도착이 부드럽다
        const ease = t * t * (3 - 2 * t);
        simObject.root.position.lerpVectors(returning.from, home, ease);
        if (t >= 1) { home = null; returning = null; }
      }
      if (flight) {
        flight.age += dt;
        if (flight.age >= FLY_TIME) {
          flight = null;   // 비행 종료 — 도달 지점에 머무르다 SIM_END 에 복귀한다
        } else {
          // 월드 방향 속도를 부모 좌표 변위로 변환해 자기 위치를 옮긴다
          // (스케일 비전파 규약으로 부모 월드 스케일은 1 — 회전만 되돌리면 된다)
          const delta = flight.vel.clone().multiplyScalar(dt);
          const parent = simObject.root.parent;
          if (parent) {
            delta.applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
          }
          simObject.root.position.add(delta);
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
    dispose(_ctx, simObject) {
      restoreHome(simObject);
      smokes.forEach((s) => { ctx.scene.remove(s.sprite); s.sprite.material.dispose(); });
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
