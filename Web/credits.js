// credits.js — "만든 사람들" 크레딧 WebGL 오버레이
// 로고 클릭 시 열린다. 우주인 메시들이 대관람차(Ferris wheel)처럼 원형으로 무한
// 회전하며, 카메라 앞으로 다가왔다가(가까이=크고 선명) 뒤로 멀어져(fog 로 사라짐)
// 반복적으로 나타난다. 각 우주인의 화면 위치 오른쪽에 개발자 명단(HTML 라벨)이 붙어
// 함께 돈다. WebGL 무대는 전체 화면의 2/3 크기. 닫기 버튼/ESC 로 사라진다.

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

// 대관람차 파라미터 (월드 단위)
const WHEEL_R = 3.9;                 // 관람차 반지름
const TILT = 58 * Math.PI / 180;     // 관람차 기울기(위=뒤로, 아래=앞으로)
const ASTRO_H = 2.1;                 // 각 우주인 높이
const OMEGA = (2 * Math.PI) / 24;    // 한 바퀴 24초
const CAM_Z = 15.5;                  // 관람차 전체가 무대에 들어오도록 뒤로

let S = null;

function injectStyleOnce() {
  if (document.getElementById('creditsStyle')) return;
  const st = document.createElement('style');
  st.id = 'creditsStyle';
  st.textContent = `
    #creditsOverlay { position: fixed; inset: 0; z-index: 10050; background: #05060f;
      overflow: hidden; touch-action: none; }
    /* WebGL 무대: 화면 전체의 2/3 크기(가운데) */
    #creditsStage { position: absolute; left: 50%; top: 54%; transform: translate(-50%,-50%);
      width: 66.6%; height: 66.6%; }
    #creditsCanvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    #creditsLabels { position: absolute; inset: 0; pointer-events: none; }
    .credit-label { position: absolute; top: 0; left: 0; will-change: transform, opacity;
      color: #fff; white-space: nowrap; font-family: 'GangwonEduTeun','Inter Tight',sans-serif;
      text-shadow: 0 1px 7px rgba(0,0,0,0.85); }
    .credit-label .credit-role { display: block; font-size: 0.68rem; font-weight: 600;
      color: #9fb4e6; letter-spacing: .3px; }
    .credit-label .credit-name { display: block; font-size: 0.98rem; font-weight: 800; }
    #creditsTitle { position: absolute; top: 20px; left: 0; right: 0; text-align: center;
      color: #fff; font-family: 'GangwonEduTeun','Inter Tight',sans-serif; font-weight: 800;
      font-size: 1.2rem; letter-spacing: 2px; text-shadow: 0 2px 10px rgba(0,0,0,.6);
      pointer-events: none; }
    #creditsClose { position: absolute; top: 12px; right: 12px; z-index: 2;
      height: 40px; padding: 0 16px; border: none; border-radius: 20px;
      background: rgba(255,255,255,0.14); color: #fff; font-weight: 700; cursor: pointer;
      font-family: 'GangwonEduTeun','Inter Tight',sans-serif; font-size: 0.9rem; }
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

  // ---- DOM ----
  const overlay = document.createElement('div');
  overlay.id = 'creditsOverlay';
  const stage = document.createElement('div');
  stage.id = 'creditsStage';
  const canvas = document.createElement('canvas');
  canvas.id = 'creditsCanvas';
  const labels = document.createElement('div');
  labels.id = 'creditsLabels';
  stage.append(canvas, labels);
  const title = document.createElement('div');
  title.id = 'creditsTitle';
  title.textContent = '만든 사람들';
  const closeBtn = document.createElement('button');
  closeBtn.id = 'creditsClose';
  closeBtn.type = 'button';
  closeBtn.textContent = '✕ 닫기';
  overlay.append(stage, title, closeBtn);
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
  // 뒤로 갈수록 배경색으로 사라지게 하는 안개(대관람차 뒤편에서 소멸)
  scene.fog = new THREE.Fog(0x05060f, CAM_Z - WHEEL_R * 0.2, CAM_Z + WHEEL_R * 1.6);
  if (ARES3.RoomEnvironment) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new ARES3.RoomEnvironment(), 0.04).texture;
    } catch {}
  }

  // 별
  const starGeo = new THREE.BufferGeometry();
  const N = 500, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 45 + Math.random() * 45, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, fog: false,
  }));
  scene.add(stars);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 0.4, CAM_Z);
  camera.lookAt(0, 0.4, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbcc6e0, 1.0));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.0); key.position.set(3, 5, 8); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd2f0, 0.5); fill.position.set(-4, 2, 4); scene.add(fill);

  // 이름 라벨 + 아이템(각 우주인이 관람차 위 고정 각도)
  const items = CREDITS.map(([role, name], i) => {
    const el = document.createElement('div');
    el.className = 'credit-label';
    el.style.opacity = '0';
    el.innerHTML = `<span class="credit-role"></span><span class="credit-name"></span>`;
    el.querySelector('.credit-role').textContent = role;
    el.querySelector('.credit-name').textContent = name;
    labels.appendChild(el);
    return { el, holder: null, baseAngle: (i / CREDITS.length) * Math.PI * 2 };
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

  // 우주인 로드 + 13개 클론(관람차 좌석)
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
      const holder = new THREE.Group();   // 관람차 좌석: 위치만 원 위를 돌고, 자세는 정면 유지
      holder.add(wrap);
      scene.add(holder);
      it.holder = holder;
      it.wrap = wrap;
    });
  }, undefined, (e) => console.warn('[크레딧] 우주인 로드 실패', e));

  // 애니메이션
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
      // 대관람차: 각도 a 로 원 위를 돈다. 기울여서 아래=앞(가까움), 위=뒤(멀어짐).
      const a = it.baseAngle + OMEGA * t;
      const cx = WHEEL_R * Math.cos(a);
      const cy = WHEEL_R * Math.sin(a);
      it.holder.position.set(
        cx,
        cy * Math.cos(TILT) + 0.4,
        -cy * Math.sin(TILT),          // 위(sin>0)=뒤(-z), 아래(sin<0)=앞(+z)
      );
      // 좌석은 항상 정면(+Z, 카메라)을 향하고 살짝 흔들림
      it.wrap.rotation.y = Math.sin(t * 0.7 + it.baseAngle) * 0.25;

      // 라벨: 3D 위치를 무대(canvas)에 투영해 오른쪽에 배치, 뒤로 갈수록 흐리게
      it.holder.getWorldPosition(world);
      const camDist = camera.position.distanceTo(world);
      world.project(camera);
      const sx = (world.x * 0.5 + 0.5) * w;
      const sy = (-world.y * 0.5 + 0.5) * h;
      // 가까울수록(=앞) 1, 멀수록(=뒤) 0 으로 페이드
      const near = CAM_Z - WHEEL_R * 0.5, far = CAM_Z + WHEEL_R * 0.9;
      let op = 1 - (camDist - near) / (far - near);
      op = Math.max(0, Math.min(1, op));
      const onScreen = world.z < 1;
      it.el.style.opacity = onScreen ? op.toFixed(2) : '0';
      it.el.style.transform = `translate(${Math.round(sx + 28)}px, ${Math.round(sy)}px) translateY(-50%)`;
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
