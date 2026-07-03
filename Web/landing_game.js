// Web/landing_game.js
// ============================================================
// 화성 착륙 게임 (WebGL / three.js) — 단순 감속 착륙 버전
// - 불규칙한 행성 지면 위로 우주선이 수직으로 떨어진다.
// - 역추진기는 하나. 위쪽 화살표(↑) 또는 화면의 역추진 버튼으로 켠다.
// - 역추진으로 하강 속도를 줄여, 지면에 천천히(안전 속도로) 내려앉히면 성공.
// - three.js 는 vendor/three-bundle.min.js 가 window.THREE 로 노출.
//
// 사용:  import { launchLandingGame } from './landing_game.js';
//        launchLandingGame();
// ============================================================

let running = false;

// 지면 높이 샘플러 — 메시 정점 변형과 동일한 식을 써서 충돌 판정에 재사용
function terrainHeight(x, z) {
  return (
    2.2 * Math.sin(x * 0.25) * Math.cos(z * 0.22) +
    1.3 * Math.sin(x * 0.60 + 1.7) * Math.sin(z * 0.50 + 0.6) +
    0.7 * Math.cos(x * 1.10 + z * 0.90)
  );
}

export function launchLandingGame() {
  if (running) return;
  const THREE = window.THREE;
  if (!THREE) {
    alert('3D 라이브러리(three.js)를 불러오지 못했습니다.');
    return;
  }
  running = true;

  // ---------- 물리 상수 (조정 가능) ----------
  const G = 3.8;              // 중력 가속도
  const THRUST = 8.0;         // 역추진 가속도(켜면 순 +4.2 로 감속/상승)
  const DRAG = 0.995;         // 속도 감쇠(자유낙하 속도를 완만히 제한)
  const V_SAFE = 4.0;         // 안전 착륙 하강 속도(이하이면 성공)
  const LEG = 1.85;           // 기체 중심~발 바닥 높이(펼친 다리 기준)
  const START_Y = 40;         // 어두운 우주 배경이 보이는 높은 상공에서 시작
  const FUEL_MAX = 100;
  const FUEL_RATE = 5.5;      // 초당 연료 소모(약 18초분 — 넉넉)

  // 착륙 지점(고정) — 지형에서 비교적 평탄한 곳
  const PADX = 0, PADZ = 0;
  const groundH = terrainHeight(PADX, PADZ);

  // ---------- 상태 ----------
  let y = START_Y;
  let vy = 0;
  let fuel = FUEL_MAX;
  let phase = 'play';        // 'play' | 'landed' | 'crash'
  let thrusting = false;

  // ---------- DOM 오버레이 ----------
  const overlay = document.createElement('div');
  overlay.className = 'landing-overlay';
  overlay.innerHTML = `
    <canvas class="landing-canvas"></canvas>
    <div class="landing-hud">
      <div class="hud-row"><span>고도</span><b data-hud="alt">0</b> m</div>
      <div class="hud-row"><span>하강속도</span><b data-hud="spd">0</b> m/s</div>
      <div class="hud-fuel"><i data-hud="fuelbar"></i></div>
    </div>
    <button class="landing-close" title="닫기">✕</button>
    <div class="landing-help">위쪽 화살표(↑) 또는 <b>역추진</b> 버튼을 눌러 <b>감속</b>!<br>지면에 <b>천천히</b> 내려앉히면 착륙 성공이에요.</div>
    <button class="thrust-btn thrust-main" data-dir="up" aria-label="역추진">
      <span class="thrust-ico">▲</span><span class="thrust-label">역추진</span>
    </button>
    <div class="landing-result" hidden>
      <div class="landing-result-panel">
        <h2 data-res="title"></h2>
        <p class="landing-result-msg" data-res="msg"></p>
        <p class="landing-result-stat" data-res="stat"></p>
        <div class="landing-result-btns">
          <button class="landing-retry">다시 도전</button>
          <button class="landing-quit">그만하기</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('.landing-canvas');
  const hud = {
    alt: overlay.querySelector('[data-hud="alt"]'),
    spd: overlay.querySelector('[data-hud="spd"]'),
    fuelbar: overlay.querySelector('[data-hud="fuelbar"]'),
  };
  const resultEl = overlay.querySelector('.landing-result');
  const thrustBtn = overlay.querySelector('.thrust-main');

  // ---------- three.js 씬 ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;              // 지면 그림자로 거리감 부여
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0713);
  scene.fog = new THREE.FogExp2(0x1a0f20, 0.012);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

  // 별
  const starGeo = new THREE.BufferGeometry();
  const starN = 700, starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    starPos[i * 3]     = (Math.random() - 0.5) * 320;
    starPos[i * 3 + 1] = Math.random() * 160 + 20;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 320;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: true })));

  // 조명
  scene.add(new THREE.HemisphereLight(0xffd9c2, 0x3a1a1a, 0.9));
  const sun = new THREE.DirectionalLight(0xffe8d0, 1.5);
  sun.position.set(-34, 52, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // 지형 (불규칙한 행성 면)
  const SIZE = 120, SEG = 90;
  const terGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  terGeo.rotateX(-Math.PI / 2);
  const tp = terGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    tp.setY(i, terrainHeight(tp.getX(i), tp.getZ(i)));
  }
  terGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terGeo,
    new THREE.MeshStandardMaterial({ color: 0xb2472b, roughness: 0.95, metalness: 0.02, flatShading: true }),
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  // 착륙 목표 링 (안내용)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.2, 40),
    new THREE.MeshBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(PADX, groundH + 0.06, PADZ);
  scene.add(ring);

  // ---------- 우주선 ----------
  const ship = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.4, metalness: 0.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5, metalness: 0.3 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 1.7, 16), bodyMat);
  ship.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 16), bodyMat);
  nose.position.y = 1.4;
  ship.add(nose);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.28, 16), trimMat);
  band.position.y = 0.3;
  ship.add(band);

  // 착지 다리 4개 — 바깥쪽으로 펼치고 끝에 발(패드)을 단다
  const legMat = new THREE.MeshStandardMaterial({ color: 0x8892a0, roughness: 0.6, metalness: 0.4 });
  const footMat = new THREE.MeshStandardMaterial({ color: 0x5c6570, roughness: 0.75, metalness: 0.25 });
  const V3 = THREE.Vector3;
  function makeStrut(p0, p1, r) {
    const dir = new V3().subVectors(p1, p0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), legMat);
    m.position.copy(p0).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
    return m;
  }
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = dx * 0.7071, nz = dz * 0.7071;          // 대각선 방향(정규화)
    const top = new V3(nx * 0.7, -0.2, nz * 0.7);       // 몸체 근처 부착점
    const foot = new V3(nx * 1.9, -1.7, nz * 1.9);      // 바깥·아래로 펼친 발 위치
    ship.add(makeStrut(top, foot, 0.09));
    // 발 패드 — 지면과 닿는 접시 모양
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 12), footMat);
    pad.position.copy(foot).setY(foot.y - 0.04);
    ship.add(pad);
  }

  // 역추진 화염 하나(기체 아래 중앙)
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.7, 14),
    new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 }),
  );
  flame.position.y = -1.25;
  flame.rotation.x = Math.PI;    // 아래로 분사
  flame.visible = false;
  ship.add(flame);

  // 기체 메시는 지면에 그림자를 드리운다(화염 제외)
  ship.traverse((o) => { if (o.isMesh && o !== flame) o.castShadow = true; });

  ship.position.set(PADX, y, PADZ);
  scene.add(ship);

  // ---------- 착륙 먼지 (지면 근처에서 역분사할 때 피어오름) ----------
  const DUST_N = 160, DUST_ALT = 6.5, DUST_LIFE = 1.1;
  const dustGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DUST_N * 3);
  const dVel = new Float32Array(DUST_N * 3);
  const dLife = new Float32Array(DUST_N);
  function seedDust(i, fresh) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.2 + Math.random() * 0.7;
    dPos[i * 3] = Math.cos(a) * r;
    dPos[i * 3 + 1] = 0.08;
    dPos[i * 3 + 2] = Math.sin(a) * r;
    const spd = 1.6 + Math.random() * 2.6;
    dVel[i * 3] = Math.cos(a) * spd;
    dVel[i * 3 + 1] = 0.7 + Math.random() * 1.3;
    dVel[i * 3 + 2] = Math.sin(a) * spd;
    dLife[i] = fresh ? Math.random() * DUST_LIFE : 0;
  }
  for (let i = 0; i < DUST_N; i++) seedDust(i, true);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xd7a074, size: 0.55, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.position.set(PADX, groundH, PADZ);
  scene.add(dust);

  // ---------- 입력 ----------
  const setThrust = (on) => { if (phase === 'play') thrusting = on; };
  const onKey = (down) => (e) => {
    if (e.key !== 'ArrowUp') return;
    e.preventDefault();
    setThrust(down);
  };
  const kd = onKey(true), ku = onKey(false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  const press = (e) => { e.preventDefault(); thrustBtn.classList.add('active'); setThrust(true); };
  const release = (e) => { if (e) e.preventDefault(); thrustBtn.classList.remove('active'); setThrust(false); };
  thrustBtn.addEventListener('pointerdown', press);
  thrustBtn.addEventListener('pointerup', release);
  thrustBtn.addEventListener('pointerleave', release);
  thrustBtn.addEventListener('pointercancel', release);

  // ---------- 종료/재시작 ----------
  let raf = 0;
  function cleanup() {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    overlay.remove();
    running = false;
  }
  function restart() {
    y = START_Y; vy = 0; fuel = FUEL_MAX; phase = 'play'; thrusting = false;
    thrustBtn.classList.remove('active');
    resultEl.hidden = true;
  }
  overlay.querySelector('.landing-close').addEventListener('click', cleanup);
  overlay.querySelector('.landing-quit').addEventListener('click', cleanup);
  overlay.querySelector('.landing-retry').addEventListener('click', restart);

  function endGame(ok, stat) {
    phase = ok ? 'landed' : 'crash';
    thrusting = false;
    thrustBtn.classList.remove('active');
    flame.visible = false;
    resultEl.querySelector('[data-res="title"]').textContent = ok ? '🎉 착륙 성공!' : '💥 착륙 실패';
    resultEl.querySelector('[data-res="msg"]').textContent = ok
      ? '모든 미션을 완료했습니다. 여러분의 코드로 화성에 도착했어요. 축하해요!'
      : '모든 미션을 완료했는데, 착륙에 문제가 생겼어요. 다시 한 번 도전해요!';
    resultEl.querySelector('[data-res="stat"]').textContent = stat;
    resultEl.classList.toggle('ok', ok);
    resultEl.hidden = false;
  }

  // ---------- 리사이즈 ----------
  function onResize() {
    const w = overlay.clientWidth, h = overlay.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  // ---------- 루프 ----------
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    if (phase === 'play') {
      // 역추진(연료 있을 때만)
      let firing = thrusting;
      if (fuel <= 0) firing = false;
      else if (firing) fuel = Math.max(0, fuel - FUEL_RATE * dt);

      vy += (firing ? THRUST : 0) * dt - G * dt;
      vy *= DRAG;
      y += vy * dt;

      flame.visible = firing;
      if (firing) flame.scale.setScalar(0.7 + Math.random() * 0.6);

      // 착지 판정
      if (y - LEG <= groundH) {
        y = groundH + LEG;
        const descend = -vy;              // 하강 속도(양수)
        if (descend <= V_SAFE) {
          endGame(true, `착지 속도 ${descend.toFixed(1)} m/s · 남은 연료 ${fuel.toFixed(0)}`);
        } else {
          endGame(false, `착지 속도 ${descend.toFixed(1)} m/s (안전 ${V_SAFE.toFixed(1)} m/s 이하로 감속!)`);
        }
      }
    }

    ship.position.y = y;

    // 착륙 먼지 — 지면 근처에서 역분사할 때 피어오른다
    const altNow = Math.max(0, y - LEG - groundH);
    const dustOn = phase === 'play' && flame.visible && altNow < DUST_ALT;
    const dustTarget = dustOn ? Math.min(0.85, (1 - altNow / DUST_ALT) * 0.95) : 0;
    dustMat.opacity += (dustTarget - dustMat.opacity) * 0.15;
    if (dustMat.opacity > 0.01) {
      for (let i = 0; i < DUST_N; i++) {
        dLife[i] += dt;
        if (dLife[i] > DUST_LIFE) {
          if (dustOn) seedDust(i, false); else continue;
        }
        dPos[i * 3]     += dVel[i * 3] * dt;
        dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt;
        dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
        dVel[i * 3 + 1] -= 1.2 * dt;      // 살짝 가라앉으며 퍼짐
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    // HUD
    hud.alt.textContent = Math.max(0, y - LEG - groundH).toFixed(1);
    hud.spd.textContent = Math.max(0, -vy).toFixed(1);
    hud.fuelbar.style.width = (fuel / FUEL_MAX * 100) + '%';
    hud.fuelbar.style.background = fuel < 25 ? '#e74c3c' : '#4fd1ff';

    // 카메라 — 고도 연동: 높은 상공에선 멀리서 전체를 조망(하강 높이감),
    //          지면에 가까워질수록 가까이 당겨 착륙 장면을 크게 보여준다.
    const camT = Math.min(1, Math.max(0, (y - groundH) / (START_Y - groundH)));
    const midY = (START_Y + groundH) / 2;
    const camY = (groundH + 7) + (midY + 3 - (groundH + 7)) * camT;
    const lookY = (groundH + 1.5) + (midY - (groundH + 1.5)) * camT;
    const camZ = PADZ + 18 + 24 * camT;
    camera.position.set(PADX, camY, camZ);
    camera.lookAt(PADX, lookY, PADZ);

    ring.material.opacity = 0.35 + Math.sin(now * 0.004) * 0.25;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
}
