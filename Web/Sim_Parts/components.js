// Web/Sim_Parts/components.js
// 선언형 컴포넌트 (SIMULATOR.md 2장) — 객체에 부착되어 블록 코딩 명령에 반응한다.
// 2단계: LED · Buzzer · Oled. (3단계 예정: DC · Servo · UltraSonic · Magnet · Gun · Metal)
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
// 팩토리 · 부착/해제 · 직렬화
// ============================================================
const FACTORIES = {
  LED: createLedComponent,
  Buzzer: createBuzzerComponent,
  Oled: createOledComponent,
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
