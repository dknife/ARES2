// credits.js — "만든 사람들" 크레딧 WebGL 오버레이
// 로고 클릭 시 열린다. 우주인 메시들이 아래에서 위로 스크롤되고, 각 우주인
// 오른쪽에 개발자 명단이 (3D 위치에 투영된 HTML 라벨로) 붙어 함께 올라간다.
// 닫기 버튼으로 사라진다. (Three.js: window.THREE / window.ARES3 재사용)

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

// 세로 배치/스크롤 파라미터 (월드 단위)
const SPACING = 4.4;      // 우주인 사이 세로 간격
const ASTRO_X = -3.0;     // 우주인 x(왼쪽) → 이름은 그 오른쪽에
const ASTRO_H = 2.6;      // 각 우주인 높이
const SPEED = 1.7;        // 위로 스크롤 속도(월드/초)

let S = null;   // 열려 있는 동안의 상태

function injectStyleOnce() {
  if (document.getElementById('creditsStyle')) return;
  const st = document.createElement('style');
  st.id = 'creditsStyle';
  st.textContent = `
    #creditsOverlay { position: fixed; inset: 0; z-index: 10050; background: #05060f;
      overflow: hidden; touch-action: none; }
    #creditsCanvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    #creditsLabels { position: absolute; inset: 0; pointer-events: none; }
    .credit-label { position: absolute; top: 0; left: 0; will-change: transform, opacity;
      transition: opacity 0.25s linear; color: #fff; white-space: nowrap;
      font-family: 'GangwonEduTeun', 'Inter Tight', sans-serif;
      text-shadow: 0 1px 6px rgba(0,0,0,0.7); }
    .credit-label .credit-role { display: block; font-size: 0.72rem; font-weight: 600;
      color: #9fb4e6; letter-spacing: .3px; }
    .credit-label .credit-name { display: block; font-size: 1.02rem; font-weight: 800; }
    #creditsTitle { position: absolute; top: 18px; left: 0; right: 0; text-align: center;
      color: #fff; font-family: 'GangwonEduTeun','Inter Tight',sans-serif; font-weight: 800;
      font-size: 1.15rem; letter-spacing: 2px; text-shadow: 0 2px 10px rgba(0,0,0,.6);
      pointer-events: none; }
    #creditsClose { position: absolute; top: 12px; right: 12px; z-index: 2;
      height: 40px; padding: 0 16px; border: none; border-radius: 20px;
      background: rgba(255,255,255,0.14); color: #fff; font-weight: 700; cursor: pointer;
      font-family: 'GangwonEduTeun','Inter Tight',sans-serif; font-size: 0.9rem;
      backdrop-filter: blur(4px); }
    #creditsClose:hover { background: rgba(255,255,255,0.26); }
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

  // ---- 오버레이 DOM ----
  const overlay = document.createElement('div');
  overlay.id = 'creditsOverlay';
  const canvas = document.createElement('canvas');
  canvas.id = 'creditsCanvas';
  const labels = document.createElement('div');
  labels.id = 'creditsLabels';
  const title = document.createElement('div');
  title.id = 'creditsTitle';
  title.textContent = '만든 사람들';
  const closeBtn = document.createElement('button');
  closeBtn.id = 'creditsClose';
  closeBtn.type = 'button';
  closeBtn.textContent = '✕ 닫기';
  overlay.append(canvas, labels, title, closeBtn);
  document.body.appendChild(overlay);
  closeBtn.addEventListener('click', closeCredits);

  // ---- Three.js ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  if (ARES3.RoomEnvironment) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new ARES3.RoomEnvironment(), 0.04).texture;
    } catch {}
  }

  // 별
  const starGeo = new THREE.BufferGeometry();
  const N = 600, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 40 + Math.random() * 50, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  scene.add(stars);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 0, 14);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbcc6e0, 0.95));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.0); key.position.set(3, 5, 6); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd2f0, 0.5); fill.position.set(-4, 2, 3); scene.add(fill);

  const scrollGroup = new THREE.Group();
  scene.add(scrollGroup);

  // 이름 라벨 + 아이템
  const items = CREDITS.map(([role, name], i) => {
    const el = document.createElement('div');
    el.className = 'credit-label';
    el.style.opacity = '0';
    el.innerHTML = `<span class="credit-role"></span><span class="credit-name"></span>`;
    el.querySelector('.credit-role').textContent = role;
    el.querySelector('.credit-name').textContent = name;
    labels.appendChild(el);
    return { el, holder: null, baseY: -i * SPACING };
  });

  // 화면 세로 절반 높이(월드) — z=0 평면 기준
  const halfV = () => Math.tan((camera.fov * Math.PI / 180) / 2) * camera.position.z;
  const startY = () => halfV() + SPACING;                 // 첫 우주인이 화면 아래에서 시작
  const endY = () => (CREDITS.length - 1) * SPACING + halfV() + SPACING; // 마지막이 위로 빠질 때
  scrollGroup.position.y = startY();

  function resize() {
    const w = overlay.clientWidth || window.innerWidth;
    const h = overlay.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  // 우주인 로드 + 13개 클론
  const loader = new GLTFLoader();
  if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
  loader.load('Mesh/EnvAssets/Astronaut.glb', (gltf) => {
    if (!S || S.overlay !== overlay) return;   // 이미 닫혔으면 중단
    const proto = gltf.scene;
    const box = new THREE.Box3().setFromObject(proto);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const scl = ASTRO_H / (sz.y || 1);
    items.forEach((it, i) => {
      const model = proto.clone(true);
      model.position.sub(c);
      const wrap = new THREE.Group();
      wrap.scale.setScalar(scl);
      wrap.add(model);
      wrap.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      const holder = new THREE.Group();
      holder.position.set(ASTRO_X, it.baseY, 0);
      holder.add(wrap);
      holder.userData.phase = i * 1.3;
      scrollGroup.add(holder);
      it.holder = holder;
    });
  }, undefined, (e) => console.warn('[크레딧] 우주인 로드 실패', e));

  // 애니메이션
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let raf = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    scrollGroup.position.y += SPEED * dt;
    if (scrollGroup.position.y > endY()) scrollGroup.position.y = startY();   // 반복
    stars.rotation.y += dt * 0.01;

    const w = overlay.clientWidth || window.innerWidth;
    const h = overlay.clientHeight || window.innerHeight;
    for (const it of items) {
      if (!it.holder) { it.el.style.opacity = '0'; continue; }
      // 살랑이는 유영감
      it.holder.rotation.y = Math.sin(t * 0.6 + it.holder.userData.phase) * 0.35;
      it.holder.children[0].position.y = Math.sin(t * 0.9 + it.holder.userData.phase) * 0.12;
      it.holder.getWorldPosition(tmp);
      tmp.project(camera);
      const sx = (tmp.x * 0.5 + 0.5) * w;
      const sy = (-tmp.y * 0.5 + 0.5) * h;
      const onScreen = tmp.z < 1 && sy > -60 && sy < h + 60;
      it.el.style.opacity = onScreen ? '1' : '0';
      it.el.style.transform = `translate(${Math.round(sx + 34)}px, ${Math.round(sy)}px) translateY(-50%)`;
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

  // ESC 로도 닫기
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
