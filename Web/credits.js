// credits.js — "만든 사람들" 크레딧 WebGL 오버레이
// 로고 클릭 시 열린다. 화면 가운데 2/3 크기의 WebGL 패널이 뜨고, 그 뒤(주변)로는
// 원래 웹앱 화면이 그대로 보인다. 패널 안에서 우주인 메시들이 대관람차처럼 X축을
// 중심으로 무한 회전한다: 위 → 카메라 앞(가까이·크게) → 아래 → 뒤(멀어져 fog 로 사라짐)
// 를 반복. 각 우주인 오른쪽에 개발자 명단(HTML 라벨)이 붙어 함께 돈다.
// 닫기 버튼/ESC/패널 바깥 클릭으로 사라진다.

const CREDITS = [
  ['개발책임', '코리아사이언스 이창석'],
  ['기획', '코리아사이언스 김선형'],
  ['기술총괄', '코리아사이언스 권정현'],
  ['제작총괄', '코리아사이언스 석진혁'],
  ['디자인 기획', '코리아사이언스 허임경'],
  ['디자인 총괄', '동명대학교 그래픽학과 서미라'],
  ['디자인 및 제품제작', '동명대학교 게임그래픽학과 이재훈'],
  ['소프트웨어 총괄', '동명대학교 게임그래픽학과 강영민'],
  ['서비스 개발', '동명대학교 게임공학과 신원'],
  ['펌웨어 및 블록코딩SW', '동명대학교 게임공학과 이주현'],
  ['WebApp SW', '동명대학교 게임공학과 이성빈'],
  ['디지털 트윈 엔진', '동명대학교 게임공학과 김지훈'],
  ['디지털 트윈 엔진', '동명대학교 게임공학과 이민혁'],
];

// 대관람차(X축 회전) 파라미터 — 월드 단위
const WHEEL_R = 5.1;                 // 관람차 반지름 (우주인 간격 ↑)
const WHEEL_X = -1.6;                // 관람차 중심 X (음수 = 왼쪽으로)
const ASTRO_H = 1.4;                 // 각 우주인 높이 (기존의 70%)
const OMEGA = (2 * Math.PI) / 26;    // 한 바퀴 26초
const CAM_Z = 13.0;

let S = null;

function injectStyleOnce() {
  if (document.getElementById('creditsStyle')) return;
  const st = document.createElement('style');
  st.id = 'creditsStyle';
  st.textContent = `
    /* 오버레이는 투명 — 뒤로 원래 웹앱 화면이 보인다 */
    #creditsOverlay { position: fixed; inset: 0; z-index: 10050; background: transparent;
      touch-action: none; }
    /* WebGL 렌더 공간: 화면 전체의 2/3 크기(가운데 패널) */
    /* 완전 투명·무테두리 패널 — 뒤의 앱이 선명하게 그대로 비친다(블러·테두리선·음영 없음) */
    #creditsStage { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
      width: 66.6%; height: 66.6%; overflow: hidden;
      background: transparent; border: none; box-shadow: none; }
    #creditsCanvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    #creditsLabels { position: absolute; inset: 0; pointer-events: none; }
    .credit-label { position: absolute; top: 0; left: 0; will-change: transform, opacity;
      color: #ffd21e; white-space: nowrap; font-family: 'GangwonEduTeun','Inter Tight',sans-serif;
      /* 검은 테두리(외곽선) — 4방향 오프셋 그림자 + 살짝의 드롭섀도 */
      text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000,
        0 0 2px #000, 0 2px 5px rgba(0,0,0,0.55); }
    .credit-label .credit-role { display: block; font-size: 0.92rem; font-weight: 700;
      color: #ffd21e; letter-spacing: .3px; margin-bottom: 1px; }
    .credit-label .credit-name { display: block; font-size: 0.92rem; font-weight: 800; color: #ffd21e; }
    #creditsTitle { position: absolute; top: 14px; left: 0; right: 0; text-align: center;
      color: #fff; font-family: 'GangwonEduTeun','Inter Tight',sans-serif; font-weight: 800;
      font-size: 1.05rem; letter-spacing: 2px; text-shadow: 0 2px 10px rgba(0,0,0,.7);
      pointer-events: none; z-index: 2; }
  `;
  document.head.appendChild(st);
}

export function openCredits() {
  if (S) return;
  const THREE = window.THREE;
  const ARES3 = window.ARES3 || {};
  const GLTFLoader = ARES3.GLTFLoader;
  if (!THREE || !GLTFLoader) { console.warn('[크레딧] THREE 미로드'); return; }

  injectStyleOnce();

  // ---- DOM (title/close 는 패널(stage) 안에) ----
  const overlay = document.createElement('div');
  overlay.id = 'creditsOverlay';
  const stage = document.createElement('div');
  stage.id = 'creditsStage';
  const canvas = document.createElement('canvas');
  canvas.id = 'creditsCanvas';
  const labels = document.createElement('div');
  labels.id = 'creditsLabels';
  const title = document.createElement('div');
  title.id = 'creditsTitle';
  title.textContent = '만든 사람들';
  stage.append(canvas, labels, title);
  overlay.append(stage);
  document.body.appendChild(overlay);
  // 어디를 클릭하든(패널 안/밖 무관) 즉시 닫아 WebGL 애니메이션·렌더 자원을 정리한다
  overlay.addEventListener('pointerdown', () => closeCredits());

  // ---- Three.js ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // 반투명 어두운 우주 배경 — 뒤의 앱이 이 사이로 흐릿하게 비친다
  renderer.setClearColor(0x000000, 0);   // 배경 완전 투명 (틴트 없음)

  const scene = new THREE.Scene();
  // scene.background 은 두지 않음(투명) — clearColor 의 알파로 반투명 처리
  scene.fog = new THREE.Fog(0x05060f, CAM_Z - WHEEL_R * 0.1, CAM_Z + WHEEL_R * 1.5);
  if (ARES3.RoomEnvironment) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new ARES3.RoomEnvironment(), 0.04).texture;
    } catch {}
  }

  // 별
  const starGeo = new THREE.BufferGeometry();
  const N = 400, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 45 + Math.random() * 40, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, fog: false,
  }));
  scene.add(stars);

  // 카메라: 위에서 약간 내려다봐 원형 궤도가 보이게
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
  camera.position.set(0, 2.6, CAM_Z);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbcc6e0, 1.0));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.0); key.position.set(3, 5, 8); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd2f0, 0.5); fill.position.set(-4, 2, 4); scene.add(fill);

  const items = CREDITS.map(([role, name], i) => {
    const el = document.createElement('div');
    el.className = 'credit-label';
    el.style.opacity = '0';
    el.innerHTML = `<span class="credit-role"></span><span class="credit-name"></span>`;
    el.querySelector('.credit-role').textContent = role;
    el.querySelector('.credit-name').textContent = name;
    labels.appendChild(el);
    return { el, holder: null, wrap: null, baseAngle: (i / CREDITS.length) * Math.PI * 2 };
  });

  function resize() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  const loader = new GLTFLoader();
  if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
  loader.load('Mesh/EnvAssets/Astronaut.glb', (gltf) => {
    if (!S || S.overlay !== overlay) return;
    const proto = gltf.scene;
    const box = new THREE.Box3().setFromObject(proto);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const scl = ASTRO_H / (sz.y || 1);
    items.forEach((it) => {
      const model = proto.clone(true);
      model.position.sub(c);
      const wrap = new THREE.Group();
      wrap.scale.setScalar(scl);
      wrap.add(model);
      wrap.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      const holder = new THREE.Group();
      holder.add(wrap);
      scene.add(holder);
      it.holder = holder;
      it.wrap = wrap;
    });
  }, undefined, (e) => console.warn('[크레딧] 우주인 로드 실패', e));

  const clock = new THREE.Clock();
  const world = new THREE.Vector3();
  let raf = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    stars.rotation.y += dt * 0.01;

    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    for (const it of items) {
      if (!it.holder) { it.el.style.opacity = '0'; continue; }
      // X축 회전 대관람차: Y-Z 평면 원. 위(θ=0) → 앞(θ=π/2, +z, 카메라 가까이)
      //  → 아래(θ=π) → 뒤(θ=3π/2, -z, 멀어짐) 를 반복.
      const th = it.baseAngle - OMEGA * t;   // 회전 방향 반대로
      it.holder.position.set(WHEEL_X, WHEEL_R * Math.cos(th), WHEEL_R * Math.sin(th));
      // 좌석은 항상 정면(카메라)을 향하고 살짝 흔들림
      it.wrap.rotation.y = Math.sin(t * 0.7 + it.baseAngle) * 0.22;

      it.holder.getWorldPosition(world);
      world.project(camera);
      const sx = (world.x * 0.5 + 0.5) * w;
      const sy = (-world.y * 0.5 + 0.5) * h;
      // 앞쪽(θ=π/2, sin=1)일수록 1, 옆/뒤로 갈수록 급격히 투명 → 전면 캐릭터만 뚜렷
      const frontness = (Math.sin(th) + 1) / 2;   // 0(뒤)~1(앞)
      const op = Math.pow(frontness, 3.8);         // 뒤로 갈수록 더 빠르게 흐려짐
      it.el.style.opacity = world.z < 1 ? op.toFixed(2) : '0';
      // 캐릭터 오른쪽에 문자 — 오프셋을 키워 더 오른쪽으로
      it.el.style.transform = `translate(${Math.round(sx + 44)}px, ${Math.round(sy)}px) translateY(-50%)`;
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);

  S = {
    overlay, onResize,
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      try { renderer.dispose(); } catch {}
      try {
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose?.();
          const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose?.());
        });
      } catch {}
    },
  };
  S.onKey = (e) => { if (e.key === 'Escape') closeCredits(); };
  window.addEventListener('keydown', S.onKey);
}

export function closeCredits() {
  if (!S) return;
  const cur = S; S = null;
  cur.stop();
  if (cur.onKey) window.removeEventListener('keydown', cur.onKey);
  cur.overlay.remove();
}
