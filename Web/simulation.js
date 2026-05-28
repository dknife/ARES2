// ============================================================
// 3D 시뮬레이션 — "시뮬레이션 열기" 버튼으로 카드 토글
//   - 주제(로딩 대상 하드웨어)를 드롭다운에서 선택하면 해당 객체가 로딩된다.
//     "알비와 함께"가 기본이며, 나머지 주제는 아직 빈 객체(준비 중)다.
//   - three.js 는 vendor/three-bundle.min.js 가 window.THREE / window.ARES3 로 노출
// ============================================================
import { CommandExecutor } from './commandexecutor.js';

// LaunchStation.glb 는 단일 mesh·머티리얼로 통합되어 있어 이름으로 부속을 분리할 수 없다.
// 대신 mesh 로컬 bounding box 기준 휴리스틱으로 안테나·로켓 영역 정점을 골라
// 각각 별도 mesh + 새 머티리얼로 분리한다.
//   - 박스 윗면(상판)이 y≈0.20~0.25 에 큰 평면을 이루므로 fy>0.66 (y>0.30) 이상이
//     실제로 박스 위로 솟은 구조물.
//   - 안테나: 모델의 +x 끝쪽 (fx 0.78~0.92, fy>0.70) → 회색 + y축 회전 pivot.
//   - 로켓:   모델의 -x 쪽   (fx 0.28~0.46, fy>0.68) → 노란색. 좁고 위로 길게 뻗은 형상.
//   - 모델 좌표계가 바뀌면 임계값 재조정 필요.
function recolorLaunchpadAntenna(root, THREE) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.geometry?.getAttribute('position')) meshes.push(o); });
  if (!meshes.length) return;

  // 영역 안에 들어가는 삼각형(3 정점 모두 안)을 분리해 inside/outside 인덱스 배열로 반환.
  // centroid 도 함께 계산. inside 가 비면 null 반환.
  function splitTris(idxArr, pos, isInRegion) {
    const insideTris = [], outsideTris = [];
    const triCount = idxArr.length / 3;
    for (let t = 0; t < triCount; t++) {
      const a = idxArr[t * 3], b = idxArr[t * 3 + 1], c = idxArr[t * 3 + 2];
      const allIn =
        isInRegion(pos[a * 3], pos[a * 3 + 1]) &&
        isInRegion(pos[b * 3], pos[b * 3 + 1]) &&
        isInRegion(pos[c * 3], pos[c * 3 + 1]);
      (allIn ? insideTris : outsideTris).push(a, b, c);
    }
    if (!insideTris.length) return null;
    let cx = 0, cy = 0, cz = 0, n = 0;
    const used = new Set(insideTris);
    for (const v of used) { cx += pos[v * 3]; cy += pos[v * 3 + 1]; cz += pos[v * 3 + 2]; n++; }
    return { insideTris, outsideTris, centroid: { x: cx / n, y: cy / n, z: cz / n } };
  }

  for (const mesh of meshes) {
    const geom = mesh.geometry;
    const posAttr = geom.getAttribute('position');
    if (!geom.getIndex() || !posAttr) continue;
    const pos = posAttr.array;
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const sx = bb.max.x - bb.min.x;
    const sy = bb.max.y - bb.min.y;

    // ---- 1) 안테나 (회색 + y축 회전 pivot) ----
    const isAntenna = (x, y) => {
      const fx = (x - bb.min.x) / sx;
      const fy = (y - bb.min.y) / sy;
      return fx > 0.78 && fx < 0.92 && fy > 0.70;
    };
    let split = splitTris(geom.getIndex().array, pos, isAntenna);
    if (!split) {
      console.warn('[LaunchStation] 안테나 정점 감지 실패');
    } else {
      const { insideTris, outsideTris, centroid } = split;
      // 회전축을 x 음의 방향으로 미세 보정(디시가 한쪽으로 살짝 치우쳐 있을 때 회전이
      // 어색해 보이는 문제 보정). pivot 위치 + antennaMesh.position 양쪽에 동일 보정 →
      // 안테나의 화면상 위치는 그대로, 회전축만 옮겨진다.
      const pivotOffsetX = -0.01;
      const pivotX = centroid.x + pivotOffsetX;
      const antennaGeom = geom.clone();
      antennaGeom.setIndex(insideTris);
      const grayMat = new THREE.MeshStandardMaterial({
        color: 0x9aa0a6, metalness: 0.1, roughness: 0.7,
        side: THREE.DoubleSide, emissive: 0x404040, emissiveIntensity: 0.6,
      });
      const pivot = new THREE.Group();
      pivot.position.set(pivotX, centroid.y, centroid.z);
      const antennaMesh = new THREE.Mesh(antennaGeom, grayMat);
      antennaMesh.position.set(-pivotX, -centroid.y, -centroid.z);
      antennaMesh.castShadow = true;
      antennaMesh.receiveShadow = true;
      antennaMesh.frustumCulled = false;
      pivot.add(antennaMesh);
      mesh.add(pivot);
      root.userData.antennaPivot = pivot;       // render 루프에서 회전
      geom.setIndex(outsideTris);                // 원본에서 안테나 삼각형 제거 → z-fight 방지
      console.log(`[LaunchStation] 안테나 정점 분리: ${insideTris.length / 3}개 삼각형`);
    }

    // ---- 2) 로켓 (노란색, 뾰족하게 위로 솟은 형상) ----
    const isRocket = (x, y) => {
      const fx = (x - bb.min.x) / sx;
      const fy = (y - bb.min.y) / sy;
      return fx > 0.28 && fx < 0.46 && fy > 0.68;
    };
    split = splitTris(geom.getIndex().array, pos, isRocket);
    if (!split) {
      console.warn('[LaunchStation] 로켓 정점 감지 실패');
    } else {
      const { insideTris, outsideTris } = split;
      const rocketGeom = geom.clone();
      rocketGeom.setIndex(insideTris);
      // BufferGeometry.computeBoundingBox() 는 인덱스를 무시하고 position 버퍼 전체를 본다.
      // 로켓은 인덱스만 분리하고 position 버퍼는 원본 전체와 공유하므로, 그 호출은
      // LaunchStation 전체의 bbox 를 돌려준다. 그래서 로켓 정점만 직접 순회해 bbox 계산.
      let rxMin = Infinity, rxMax = -Infinity;
      let ryMin = Infinity, ryMax = -Infinity;
      let rzMin = Infinity, rzMax = -Infinity;
      const usedR = new Set(insideTris);
      for (const v of usedR) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        if (x < rxMin) rxMin = x; if (x > rxMax) rxMax = x;
        if (y < ryMin) ryMin = y; if (y > ryMax) ryMax = y;
        if (z < rzMin) rzMin = z; if (z > rzMax) rzMax = z;
      }
      const rcx = (rxMin + rxMax) / 2;
      const rcz = (rzMin + rzMax) / 2;
      const rby = ryMin;
      const yellowMat = new THREE.MeshStandardMaterial({
        color: 0xf5d23a, metalness: 0.05, roughness: 0.55,
        side: THREE.DoubleSide, emissive: 0x4a3a08, emissiveIntensity: 0.45,
      });
      // 발사 애니메이션을 위해 로켓을 group 으로 감싼다. group.position.y 를 올리면
      // 로켓 전체(메쉬 + 화염)가 같이 위로 솟아오른다.
      const rocketGroup = new THREE.Group();
      const rocketMesh = new THREE.Mesh(rocketGeom, yellowMat);
      rocketMesh.castShadow = true;
      rocketMesh.receiveShadow = true;
      rocketMesh.frustumCulled = false;
      rocketGroup.add(rocketMesh);

      // 화염 sprite — 로켓 하단에서 아래로 뿜어지는 불꽃 텍스처(additive blending).
      const fc = document.createElement('canvas'); fc.width = fc.height = 128;
      const fcx = fc.getContext('2d');
      const fg = fcx.createRadialGradient(64, 64, 0, 64, 64, 64);
      fg.addColorStop(0.0, 'rgba(255,250,200,1)');
      fg.addColorStop(0.3, 'rgba(255,150,40,0.9)');
      fg.addColorStop(0.7, 'rgba(255,60,0,0.4)');
      fg.addColorStop(1.0, 'rgba(255,0,0,0)');
      fcx.fillStyle = fg; fcx.fillRect(0, 0, 128, 128);
      const flameTex = new THREE.CanvasTexture(fc);
      flameTex.colorSpace = THREE.SRGBColorSpace;
      const flameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, color: 0xffaa33, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.0,
      }));
      flameSprite.position.set(rcx, rby - 0.10, rcz);
      flameSprite.scale.set(0.22, 0.50, 1);
      flameSprite.visible = false;
      rocketGroup.add(flameSprite);

      // 화염 PointLight — 주변(로켓 본체)을 따뜻한 주황으로 비춤
      const flameLight = new THREE.PointLight(0xff9020, 0, 1.8, 2);
      flameLight.position.set(rcx, rby - 0.05, rcz);
      rocketGroup.add(flameLight);

      mesh.add(rocketGroup);
      geom.setIndex(outsideTris);

      root.userData.rocketGroup = rocketGroup;
      root.userData.rocketFlameSprite = flameSprite;
      root.userData.rocketFlameLight = flameLight;
      // 카메라 추적용: 로켓 centroid(mesh local) + 부모 mesh 참조.
      // setRocketLaunch 호출 시 mesh.matrixWorld 로 world 좌표를 계산한다.
      root.userData.rocketCentroidLocal = new THREE.Vector3(rcx, (ryMin + ryMax) / 2, rcz);
      root.userData.rocketMeshRef = mesh;
      console.log(`[LaunchStation] 로켓 정점 분리: ${insideTris.length / 3}개 삼각형`);
    }
  }
}

// 시뮬레이션 "주제"(로딩 대상). model 이 null 이면 빈 객체(준비 중)를 표시한다.
//   새 객체를 붙이려면 model 에 GLB 경로를, 눈 LED가 있으면 eyes 설정을 채운다.
const TOPICS = {
  albi:      { label: '알비와 함께',   model: 'Mesh/AlbiStaticLow.glb', eyes: { radius: 0.11, left: [-0.145, 0.425, 0.12], right: [0.145, 0.425, 0.12] } },
  traffic:   { label: '우주 신호등',   model: 'Mesh/LampBox.glb',       eyes: null, traffic: { lamp: 'Mesh/LampGeneral.glb', hands: ['Mesh/LampHand1.glb', 'Mesh/LampHand2.glb', 'Mesh/LampHand3.glb'], count: 3 } },
  launchpad: { label: '발사대', model: 'Mesh/LaunchStation.glb', eyes: null, postProcess: recolorLaunchpadAntenna, radar: true },
};
const TOPIC_ORDER = ['albi', 'traffic', 'launchpad'];
const DEFAULT_TOPIC = 'albi';
// 미션별 기본 주제(현재는 모두 기본값 사용). 'L{차시}M{미션}' → topic key
const MISSION_TOPIC = {};
function defaultTopicForMission() {
  const l = document.getElementById('lessonSelect')?.value || '';
  const m = document.getElementById('missionSelect')?.value || '';
  return MISSION_TOPIC[`L${l}M${m}`] || DEFAULT_TOPIC;
}

// 카드 안에 3D 씬을 구성해 { render, resize, setEye, dispose, hasEyes, eyeL, eyeR,
//   hasTraffic, placeLamps, placeHands, resetTraffic } 반환
function buildSim(THREE, A, stage, loadingEl, cfg) {
  const { GLTFLoader, OrbitControls, RoomEnvironment } = A;
  const EYE = cfg.eyes || null;   // 눈 LED 설정 (없으면 null)
  const TRAFFIC = cfg.traffic || null; // 우주 신호등 설정 (LampBox 위 LampGeneral / LampHandN)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x32402f, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
  key.position.set(3, 6, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0003;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc0f0, 0.5);
  fill.position.set(-4, 2, 4); scene.add(fill);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // 눈 LED(발광 구) — eyes 설정이 있을 때만 구성
  let eyeL = null, eyeR = null, glowTex = null;
  if (EYE) {
    const gc = document.createElement('canvas'); gc.width = gc.height = 128;
    const gx = gc.getContext('2d');
    const gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0.0, 'rgba(180,255,210,1)');
    gg.addColorStop(0.25, 'rgba(40,255,120,0.65)');
    gg.addColorStop(1.0, 'rgba(0,255,90,0)');
    gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(gc); glowTex.colorSpace = THREE.SRGBColorSpace;
    const makeEye = (pos) => {
      const grp = new THREE.Group(); grp.position.fromArray(pos);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(EYE.radius, 28, 28),
        new THREE.MeshStandardMaterial({ color: 0x0c2a18, emissive: 0x00ff66, emissiveIntensity: 0, transparent: true, opacity: 0.4, roughness: 0.2, metalness: 0 })
      );
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x55ff99, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
      glow.scale.setScalar(EYE.radius * 3.3); glow.visible = false;
      const light = new THREE.PointLight(0x33ff77, 0, EYE.radius * 22, 2);
      grp.add(sphere, glow, light);
      return { group: grp, sphere, glow, light, on: false };
    };
    eyeL = makeEye(EYE.left); eyeR = makeEye(EYE.right);
  }
  function setEye(side, on) {
    if (!EYE) return;
    const e = (side === 'L') ? eyeL : eyeR;
    e.on = on;
    e.sphere.material.emissiveIntensity = on ? 3.2 : 0.0;
    e.sphere.material.opacity = on ? 0.92 : 0.4;
    e.glow.visible = on;
    e.light.intensity = on ? 1.8 : 0.0;
  }

  const frame = (cy, dist) => {
    camera.position.set(0, cy, dist);
    camera.near = dist / 100; camera.far = dist * 100; camera.updateProjectionMatrix();
    controls.target.set(0, cy, 0); controls.update();
  };

  // 우주 신호등용 상태: 슬롯(박스 윗면의 등간격 X 위치)을 미리 계산하고,
  // 각 슬롯에 LampGeneral(신호등 모드) 또는 LampHand1/2/3(가위바위보 모드)을 1:1 로 배치한다.
  let trafficRoot  = null;        // LampBox 루트 (모델 로딩 완료 여부 판정용)
  let trafficBox   = null;        // LampBox 의 월드 Box3
  let trafficSlots = null;        // [{ x, z, width }] — 박스 윗면의 N 개 슬롯 (월드 좌표)
  let trafficTopY  = 0;           // 박스 윗면 y (월드)
  const trafficSlotState = [];    // 슬롯별 { kind, inst, light, color, materials, on } — 1/2/3 키 토글 대상
  let   trafficMode  = null;      // 'lamps' | 'hands' — 비동기 로드 도중 모드가 바뀌면 결과 무시
  // 신호등 색: 왼쪽 빨강 · 가운데 노랑 · 오른쪽 초록 / 가위바위보 색: 모두 노랑
  // (채도를 살리기 위해 순수에 가까운 색으로 사용 — 발광 강도가 높으면 흰색으로 날아간다)
  const TRAFFIC_LAMP_COLORS = [0xff0000, 0xffcc00, 0x00c030];
  const TRAFFIC_HAND_COLOR  = 0xffcc00;

  if (cfg.model) {
    new GLTFLoader().load(cfg.model, (gltf) => {
      const root = gltf.scene;
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      const box = new THREE.Box3().setFromObject(root);
      const sz = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y;
      const modelH = sz.y;
      if (EYE) root.add(eyeL.group, eyeR.group);
      // 주제별 후처리(예: 탐사선 발사대의 안테나 회색화). root 변환은 위에서 이미 끝났다.
      try { cfg.postProcess?.(root, THREE); } catch (e) { console.warn('postProcess 실패:', e); }
      // postProcess 가 심어둔 핸들을 render 루프 변수에 캐싱.
      antennaPivot        = root.userData.antennaPivot        || null;
      rocketGroup         = root.userData.rocketGroup         || null;
      rocketFlameSprite   = root.userData.rocketFlameSprite   || null;
      rocketFlameLight    = root.userData.rocketFlameLight    || null;
      rocketCentroidLocal = root.userData.rocketCentroidLocal || null;
      rocketMeshRef       = root.userData.rocketMeshRef       || null;
      scene.add(root);
      if (TRAFFIC) {
        trafficRoot = root;
        // 보정된 root 기준으로 박스를 다시 계산 → 위에 객체를 얹을 좌표 확정
        trafficBox = new THREE.Box3().setFromObject(root);
        const tsz = trafficBox.getSize(new THREE.Vector3());
        const tcn = trafficBox.getCenter(new THREE.Vector3());
        trafficTopY = trafficBox.max.y;
        const n = Math.max(1, TRAFFIC.count || 3);
        const span  = tsz.x * 0.8;                          // 박스 X 폭의 80% 안쪽
        const start = tcn.x - span / 2;
        const step  = n === 1 ? 0 : span / (n - 1);
        const slotW = span / n;
        trafficSlots = [];
        for (let i = 0; i < n; i++) trafficSlots.push({ x: start + step * i, z: tcn.z, width: slotW });
        // 디폴트: 신호등 모드로 LampGeneral 자동 배치
        placeLamps();
      }
      const maxDim = Math.max(sz.x, sz.y, sz.z);
      const fov = camera.fov * Math.PI / 180;
      frame(modelH * 0.55, (maxDim / 2) / Math.tan(fov / 2) * 1.9);
      if (loadingEl) loadingEl.style.display = 'none';
    }, undefined, (err) => {
      console.error('시뮬레이션 모델 로드 실패:', err);
      if (loadingEl) loadingEl.textContent = '모델을 불러오지 못했어요 (HTTP 서버에서 실행해야 합니다)';
    });
  } else {
    // 빈 객체(준비 중): 플레이스홀더 와이어프레임 + 안내 텍스트
    const ph = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x5fa8e6, wireframe: true, transparent: true, opacity: 0.35 })
    );
    ph.position.y = 0.5;
    scene.add(ph);
    frame(0.5, 2.6);
    if (loadingEl) { loadingEl.style.display = ''; loadingEl.textContent = '🚧 준비 중인 시뮬레이션입니다 (빈 객체)'; }
  }

  function resize() {
    const w = stage.clientWidth || 360, h = stage.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();

  // 안테나(레이더) 회전 — postProcess 가 root.userData.antennaPivot 에 group 을 심으면
  // 이 플래그가 켜질 때마다 render 루프에서 그 group 을 y축으로 돌린다.
  let radarOn = false;
  let antennaPivot = null;
  function setRadar(on) { radarOn = !!on; }

  // 로켓 발사 — rocketGroup 을 위로 점진 상승, 카메라가 로켓을 따라가며 쳐다본다.
  let rocketGroup = null, rocketFlameSprite = null, rocketFlameLight = null;
  let rocketCentroidLocal = null, rocketMeshRef = null;
  let rocketLaunchOn = false;
  let rocketAnimT = 0;                  // 0(원위치) ~ 1(완전 발사)
  // 발사 시작 시점의 카메라/타깃 백업 — 중지하면 정확히 이 상태로 복귀한다.
  let savedCamPos = null, savedTarget = null, rocketCentroidWorld = null;
  const ROCKET_RISE  = 10;              // local 단위로 로켓이 위로 올라가는 거리(=카메라 추적량)
  const ROCKET_SPEED = 0.00267;         // 프레임당 rocketAnimT 변화 (≈ 6초에 1회 완주, 이전의 1/3 속도)
  function setRocketLaunch(on) {
    rocketLaunchOn = !!on;
    // 발사 시작 순간의 카메라 상태와 로켓 world centroid 를 한 번만 캡처. 중지가 끝나면
    // (rocketAnimT === 0) render 루프가 saved 를 비워서 다음 발사가 새 기준점을 잡는다.
    if (rocketLaunchOn && !savedCamPos) {
      savedCamPos = camera.position.clone();
      savedTarget = controls.target.clone();
      if (rocketCentroidLocal && rocketMeshRef) {
        rocketMeshRef.updateMatrixWorld(true);
        rocketCentroidWorld = rocketCentroidLocal.clone().applyMatrix4(rocketMeshRef.matrixWorld);
      }
    }
  }
  function render() {
    controls.update();
    if (radarOn && antennaPivot) antennaPivot.rotation.y += 0.15; // 약 8.6°/프레임 (≈500°/s)

    if (rocketGroup) {
      const targetT = rocketLaunchOn ? 1 : 0;
      if (rocketAnimT !== targetT) {
        const dir = Math.sign(targetT - rocketAnimT);
        rocketAnimT = Math.max(0, Math.min(1, rocketAnimT + dir * ROCKET_SPEED));
      }
      // 이동 곡선 — 발사와 중지에 다른 ease 를 적용해 사용자가 요청한 비대칭 모션을 낸다.
      //   발사  (t: 0→1):  1-(1-t)^2  (ease-out)  → 초반 빠르게 솟구치고 정점에서 천천히 멈춤
      //   중지  (t: 1→0):  t*t        (ease-in)  → 처음 빠르게 돌아오다 끝에서 천천히 자리잡음
      // (t 자체는 ROCKET_SPEED 로 선형 변화하므로, 시각적 속도 곡선은 ease 함수가 결정한다.)
      const eased = rocketLaunchOn
        ? 1 - (1 - rocketAnimT) * (1 - rocketAnimT)
        : rocketAnimT * rocketAnimT;
      rocketGroup.position.y = ROCKET_RISE * eased;

      // 화염: 발사 중이거나 t>0 인 동안만 표시. 강도 = t에 비례 + 흔들림(sin).
      const showFlame = rocketLaunchOn || rocketAnimT > 0.01;
      if (rocketFlameSprite) {
        rocketFlameSprite.visible = showFlame;
        if (showFlame) {
          const wob = 1 + 0.25 * Math.sin(performance.now() * 0.025);
          rocketFlameSprite.scale.set(0.22 * wob, 0.50 * wob, 1);
          rocketFlameSprite.material.opacity = Math.min(1, rocketAnimT * 4) * 0.95;
        }
      }
      if (rocketFlameLight) {
        rocketFlameLight.intensity = showFlame ? Math.min(1, rocketAnimT * 4) * 1.8 : 0;
      }

      // 카메라 추적 — 발사 중에는 매 프레임 target 을 로켓의 현재 world 위치로 직접 set.
      // (즉시 정조준 — saved → 로켓 사이 보간 없음.) 중지 후 복귀 단계에서만 saved 쪽으로
      // ease 인터폴레이션해서 자연스럽게 원위치 시야로 돌아온다.
      // camera.position.y: 발사·중지 모두 saved + 상승량 (수평 위치는 saved 그대로).
      if (savedCamPos && savedTarget && rocketCentroidWorld) {
        const rocketYNow = rocketCentroidWorld.y + ROCKET_RISE * eased;
        if (rocketLaunchOn) {
          controls.target.x = rocketCentroidWorld.x;
          controls.target.y = rocketYNow;
          controls.target.z = rocketCentroidWorld.z;
        } else {
          // 중지: eased(=rocketAnimT 곡선)가 1→0 으로 줄어드는 동안 saved 쪽으로 복귀.
          controls.target.x = savedTarget.x + (rocketCentroidWorld.x - savedTarget.x) * eased;
          controls.target.y = savedTarget.y + (rocketYNow            - savedTarget.y) * eased;
          controls.target.z = savedTarget.z + (rocketCentroidWorld.z - savedTarget.z) * eased;
        }
        camera.position.y = savedCamPos.y + ROCKET_RISE * eased;
      }
      // 원위치 복귀 완료 시 카메라/타깃을 정확히 발사 직전 상태로 스냅 + 기준 해제
      if (!rocketLaunchOn && rocketAnimT === 0 && savedCamPos) {
        camera.position.copy(savedCamPos);
        controls.target.copy(savedTarget);
        savedCamPos = null;
        savedTarget = null;
        rocketCentroidWorld = null;
      }
    }

    renderer.render(scene, camera);
  }

  // ── 우주 신호등 동작 ──
  // 신호등 모드: 슬롯마다 LampGeneral(X축 90° 회전: 넓은 면이 전면)
  // 가위바위보 모드: 슬롯마다 Hand1/Hand2/Hand3 이 1:1 로 자리 차지
  // trafficBox 는 월드 좌표 기준이므로, 인스턴스는 scene 에 직접 붙인다.
  const TRAFFIC_LAMP_ROT_X = Math.PI / 2;
  function disposeSubtree(obj) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material; (Array.isArray(m) ? m : [m]).forEach((mm) => mm?.dispose?.());
      }
    });
    if (obj.parent) obj.parent.remove(obj);
  }
  // 슬롯 단위 정리: 인스턴스/라이트 dispose 후 상태 항목 비움
  function clearSlot(i) {
    const s = trafficSlotState[i];
    if (!s) return;
    if (s.inst) disposeSubtree(s.inst);
    if (s.light && s.light.parent) s.light.parent.remove(s.light);
    trafficSlotState[i] = null;
  }
  function clearAllSlots() { for (let i = 0; i < trafficSlotState.length; i++) clearSlot(i); }
  // 인스턴스를 슬롯 위에 안착(슬롯 폭의 widthRatio 만큼 X폭에 맞춰 스케일).
  // 회전을 먼저 적용한 뒤 bbox 를 측정해야 회전 후의 X폭에 맞춰 정확히 들어맞는다.
  function fitOnSlot(inst, slot, widthRatio, rotX) {
    if (rotX) inst.rotation.x = rotX;
    inst.updateMatrixWorld(true);
    const tb = new THREE.Box3().setFromObject(inst);
    const ts = tb.getSize(new THREE.Vector3());
    const s = ts.x > 0 ? (slot.width * widthRatio) / ts.x : 1;
    inst.scale.setScalar(s);
    inst.updateMatrixWorld(true);
    const ib = new THREE.Box3().setFromObject(inst);
    const ic = ib.getCenter(new THREE.Vector3());
    inst.position.set(slot.x - ic.x, trafficTopY - ib.min.y, slot.z - ic.z);
  }
  // 클론된 인스턴스끼리 머티리얼을 공유하지 않도록 각 mesh 의 material 을 복제
  function cloneInstanceMaterials(obj) {
    obj.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      }
    });
  }
  // 인스턴스의 모든 머티리얼을 수집(베이스 컬러/이미시브 모두 토글 대상)
  function collectMaterials(obj) {
    const arr = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m) arr.push(m);
    });
    return arr;
  }
  function makeSlotLight(slot, colorHex) {
    const l = new THREE.PointLight(colorHex, 0, slot.width * 6, 2);
    l.position.set(slot.x, trafficTopY + slot.width * 0.5, slot.z);
    return l;
  }
  // 켜짐: 베이스 컬러 = 슬롯 색, emissive 도 같은 색을 약하게(>1 은 ACES 톤매핑이 흰색으로 날린다)
  // 꺼짐: 모든 슬롯 공통으로 중간 회색
  const TRAFFIC_OFF_COLOR = new THREE.Color(0x666666);
  function setSlotOn(i, on) {
    const s = trafficSlotState[i];
    if (!s) return;
    s.on = !!on;
    const onCol = new THREE.Color(s.color);
    for (const m of s.materials) {
      if (m.color    !== undefined) m.color.copy(s.on ? onCol : TRAFFIC_OFF_COLOR);
      if (m.emissive !== undefined) {
        m.emissive.copy(s.on ? onCol : new THREE.Color(0x000000));
        m.emissiveIntensity = s.on ? 0.7 : 0;          // 채도 유지(낮을수록 색이 진하게 남음)
      }
      // 베이스 컬러가 또렷이 보이도록 금속질을 줄이고 거칠기는 살짝 높임
      if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.1);
      if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.55);
      // 항상 반투명 — 꺼졌을 때는 뒤쪽이 잘 보이고, 켜졌을 때도 살짝 비치도록
      m.transparent = true;
      m.opacity     = s.on ? 0.8 : 0.55;
      m.depthWrite  = false;                            // 정렬보다 비침을 우선
      m.needsUpdate = true;
    }
    if (s.light) s.light.intensity = s.on ? 1.3 : 0;   // 주변에 색조만 옅게 묻히는 정도
  }
  function toggleSlot(i) {
    const s = trafficSlotState[i];
    if (!s) return;
    setSlotOn(i, !s.on);
  }
  function placeLamps() {
    if (!TRAFFIC || !trafficRoot || !trafficSlots) return;
    clearAllSlots();
    trafficMode = 'lamps';
    const myMode = trafficMode;
    new GLTFLoader().load(TRAFFIC.lamp, (gltf) => {
      if (trafficMode !== myMode) return;       // 도중에 다른 모드로 바뀌었으면 결과 무시
      const template = gltf.scene;
      template.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      for (let i = 0; i < trafficSlots.length; i++) {
        const inst = template.clone(true);
        cloneInstanceMaterials(inst);
        fitOnSlot(inst, trafficSlots[i], 0.7, TRAFFIC_LAMP_ROT_X);
        scene.add(inst);
        const color = TRAFFIC_LAMP_COLORS[i] !== undefined ? TRAFFIC_LAMP_COLORS[i] : 0xffffff;
        const light = makeSlotLight(trafficSlots[i], color); scene.add(light);
        trafficSlotState[i] = { kind: 'lamp', inst, light, color, materials: collectMaterials(inst), on: false };
        setSlotOn(i, false);   // 초기 OFF 룩(슬롯 색의 짙은 톤) 즉시 적용
      }
    }, undefined, (err) => console.error('LampGeneral 로드 실패:', err));
  }
  function placeHands() {
    if (!TRAFFIC || !trafficRoot || !trafficSlots) return;
    clearAllSlots();
    trafficMode = 'hands';
    const myMode = trafficMode;
    const n = Math.min(trafficSlots.length, TRAFFIC.hands.length);
    for (let i = 0; i < n; i++) {
      const slot = trafficSlots[i], url = TRAFFIC.hands[i], idx = i;
      new GLTFLoader().load(url, (gltf) => {
        if (trafficMode !== myMode) return;
        const inst = gltf.scene;
        inst.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        cloneInstanceMaterials(inst);
        fitOnSlot(inst, slot, 0.85, 0);
        scene.add(inst);
        const color = TRAFFIC_HAND_COLOR;
        const light = makeSlotLight(slot, color); scene.add(light);
        trafficSlotState[idx] = { kind: 'hand', inst, light, color, materials: collectMaterials(inst), on: false };
        setSlotOn(idx, false); // 초기 OFF 룩 즉시 적용
      }, undefined, (err) => console.error('LampHand 로드 실패:', err));
    }
  }
  function resetTraffic() { clearAllSlots(); trafficMode = null; }

  function dispose() {
    try { controls.dispose(); } catch {}
    scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material; (Array.isArray(m) ? m : [m]).forEach((mm) => mm?.dispose?.());
      }
    });
    try { renderer.dispose(); } catch {}
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  return {
    render, resize, setEye, dispose,
    hasEyes: !!EYE, get eyeL() { return eyeL; }, get eyeR() { return eyeR; },
    hasTraffic: !!TRAFFIC, placeLamps, placeHands, resetTraffic, toggleSlot,
    get hasRadar() { return !!antennaPivot; }, setRadar,
    get radarOn() { return radarOn; },
    get hasRocket() { return !!rocketGroup; }, setRocketLaunch,
    get rocketLaunchOn() { return rocketLaunchOn; },
  };
}

// 시뮬레이션 모듈 초기화 — main.js 의 워크스페이스를 받아 컨트롤러 { close } 를 반환.
// 필수 DOM 또는 three.js 라이브러리가 없으면 null 반환.
export function setupSimulation({ workspace }) {
  const btn = document.getElementById('simToggle');
  const card = document.getElementById('simCard');
  const stage = document.getElementById('simStage');
  const loadingEl = document.getElementById('simLoading');
  const ledWrap = card ? card.querySelector('.sim-led-buttons') : null;
  const trafficWrap = card ? card.querySelector('.sim-traffic-buttons') : null;
  const launchWrap = card ? card.querySelector('.sim-launch-buttons') : null;
  const radarBtn  = document.getElementById('simRadar');
  const rocketBtn = document.getElementById('simRocket');
  const simHint = document.getElementById('simHint');
  const HINT_DEFAULT = '로봇: 끌어서 회전 · 휠: 확대 · 제목줄을 끌면 창 이동 · LED 버튼으로 눈 켜고 끄기';
  const HINT_TRAFFIC = '1, 2, 3번 키를 눌러 램프를 켜고 끄기';
  const HINT_LAUNCH  = '레이더 가동 · 로켓 발사 버튼을 눌러 발사대를 작동시켜 보세요';
  const RADAR_LABEL_ON   = '<span class="dot"></span>🛰️ 레이더<small>회전 멈춤</small>';
  const RADAR_LABEL_OFF  = '<span class="dot"></span>🛰️ 레이더<small>안테나 회전</small>';
  const ROCKET_LABEL_ON  = '<span class="dot"></span>🚀 발사 중지<small>원위치로</small>';
  const ROCKET_LABEL_OFF = '<span class="dot"></span>🚀 로켓 발사<small>위로 상승</small>';
  const sel = document.getElementById('simTopic');
  if (!btn || !card || !stage) return null;

  const THREE = window.THREE, A = window.ARES3;
  if (!THREE || !A || !A.GLTFLoader) {
    btn.disabled = true;
    btn.title = '3D 라이브러리(three.js)를 불러오지 못했습니다';
    return null;
  }

  // 주제 드롭다운 채우기 ("알비와 함께"가 기본)
  if (sel && !sel.options.length) {
    TOPIC_ORDER.forEach((k) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = TOPICS[k].label;
      sel.appendChild(o);
    });
    sel.value = DEFAULT_TOPIC;
  }

  let sim = null, raf = 0, builtTopic = null;
  const loop = () => { sim.render(); raf = requestAnimationFrame(loop); };

  // 선택한 주제의 객체를 (재)빌드. 이전 씬은 dispose.
  const build = (topicKey) => {
    cancelAnimationFrame(raf); raf = 0;
    if (sim) { sim.dispose(); sim = null; }
    const cfg = TOPICS[topicKey] || TOPICS[DEFAULT_TOPIC];
    if (loadingEl) { loadingEl.style.display = ''; loadingEl.textContent = '불러오는 중…'; }
    card.querySelectorAll('.sim-led-btn').forEach((b) => b.classList.remove('on'));
    card.querySelectorAll('.sim-traffic-btn').forEach((b) => {
      // 우주 신호등은 디폴트가 "신호등(램프 배치)" 상태이므로 lamps 버튼을 on 으로 표시
      b.classList.toggle('on', !!cfg.traffic && b.dataset.action === 'lamps');
    });
    if (ledWrap) ledWrap.style.display = cfg.eyes ? '' : 'none';
    if (trafficWrap) trafficWrap.style.display = cfg.traffic ? '' : 'none';
    if (launchWrap) launchWrap.style.display = cfg.radar ? '' : 'none';
    if (radarBtn)  { radarBtn.classList.remove('on');  radarBtn.innerHTML  = RADAR_LABEL_OFF;  radarBtn.setAttribute('aria-pressed', 'false'); }
    if (rocketBtn) { rocketBtn.classList.remove('on'); rocketBtn.innerHTML = ROCKET_LABEL_OFF; rocketBtn.setAttribute('aria-pressed', 'false'); }
    if (simHint) {
      simHint.textContent = cfg.traffic ? HINT_TRAFFIC : (cfg.radar ? HINT_LAUNCH : HINT_DEFAULT);
    }
    sim = buildSim(THREE, A, stage, loadingEl, cfg);
    builtTopic = topicKey;
  };

  const open = () => {
    card.hidden = false;
    if (!sim && sel) sel.value = defaultTopicForMission();  // 첫 오픈: 미션 기본 주제
    const t = (sel && sel.value) || DEFAULT_TOPIC;
    if (!sim || builtTopic !== t) build(t);
    sim.resize();
    cancelAnimationFrame(raf); loop();
    btn.textContent = '🤖 시뮬레이션 닫기';
    btn.setAttribute('aria-pressed', 'true');
  };
  const close = () => {
    if (card.hidden) return;
    card.hidden = true;
    cancelAnimationFrame(raf); raf = 0;
    btn.textContent = '🤖 시뮬레이션 열기';
    btn.setAttribute('aria-pressed', 'false');
  };

  // 주제를 바꾸면 해당 객체로 교체
  if (sel) sel.addEventListener('change', () => {
    build(sel.value);
    sim.resize();
    cancelAnimationFrame(raf); loop();
  });

  btn.addEventListener('click', () => { card.hidden ? open() : close(); });

  card.querySelectorAll('.sim-led-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!sim || !sim.hasEyes) return;
      const side = b.dataset.side;
      const cur = (side === 'L') ? sim.eyeL.on : sim.eyeR.on;
      sim.setEye(side, !cur);
      b.classList.toggle('on', !cur);
    });
  });

  // 우주 신호등 액션 — 라디오처럼 동작: 신호등(LampGeneral 3개) ↔ 가위바위보(Hand1/2/3가 슬롯 대체)
  const setTrafficBtn = (which) => {
    card.querySelectorAll('.sim-traffic-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.action === which);
    });
  };
  card.querySelectorAll('.sim-traffic-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!sim || !sim.hasTraffic) return;
      const action = b.dataset.action;
      if (action === 'lamps')      { sim.placeLamps(); setTrafficBtn('lamps'); }
      else if (action === 'hand')  { sim.placeHands(); setTrafficBtn('hand');  }
    });
  });

  // 레이더 가동/정지 — 안테나 pivot 의 y축 회전을 토글한다.
  // hasRadar 는 모델이 로드되어 postProcess 가 pivot 을 심은 뒤에 true 가 되므로
  // 모델 로드 직후의 짧은 시간 동안은 버튼이 비활성처럼 동작한다.
  if (radarBtn) {
    radarBtn.addEventListener('click', () => {
      if (!sim || !sim.hasRadar) return;
      const next = !sim.radarOn;
      sim.setRadar(next);
      radarBtn.classList.toggle('on', next);
      radarBtn.innerHTML = next ? RADAR_LABEL_ON : RADAR_LABEL_OFF;
      radarBtn.setAttribute('aria-pressed', String(next));
    });
  }

  // 로켓 발사/중지 — 토글. 다시 누르면 로켓이 점진적으로 원위치로 돌아오고 화염도 사라진다.
  if (rocketBtn) {
    rocketBtn.addEventListener('click', () => {
      if (!sim || !sim.hasRocket) return;
      const next = !sim.rocketLaunchOn;
      sim.setRocketLaunch(next);
      rocketBtn.classList.toggle('on', next);
      rocketBtn.innerHTML = next ? ROCKET_LABEL_ON : ROCKET_LABEL_OFF;
      rocketBtn.setAttribute('aria-pressed', String(next));
    });
  }

  // ── 블록 명령 시뮬레이션 로그 ──
  // "시뮬레이션 해보기" → 미션 전송(BLE) 대신, 피코로 갈 명령을 로그로 출력.
  // 회신 가정: Ack 명령(응답 대기) 100ms, 비Ack 명령(fire-and-forget) 20ms.
  const simLog = document.getElementById('simLog');
  const simRunBtn = document.getElementById('simRun');
  const simClearBtn = document.getElementById('simLogClear');
  const logLine = (text, cls) => {
    if (!simLog) return;
    const d = document.createElement('div');
    d.className = 'sim-log-line' + (cls ? ' ' + cls : '');
    d.textContent = text;
    simLog.appendChild(d);
    simLog.scrollTop = simLog.scrollHeight;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const simSink = async (command, waitForResponse) => {
    const delay = waitForResponse ? 100 : 20;     // Ack 100ms / 비Ack 20ms
    logLine(`→ ${command}`, waitForResponse ? 'tx-ack' : 'tx');
    await wait(delay);
    let reply = '1';
    if (command.startsWith('DISTANCE')) reply = 'DIST:30';
    else if (command.startsWith('MAGNET')) reply = 'MAG:0';
    logLine(`     ↩ ${reply}  (+${delay}ms, ${waitForResponse ? 'Ack' : '비Ack'})`, 'rx');
    return reply;
  };
  let simRunning = false;
  if (simRunBtn) simRunBtn.addEventListener('click', async () => {
    if (simRunning) return;
    if (!workspace) { logLine('워크스페이스가 준비되지 않았습니다', 'err'); return; }
    simRunning = true; simRunBtn.disabled = true;
    logLine('──── 시뮬레이션 시작 ────', 'sys');
    try {
      await CommandExecutor.simulateWorkspace(workspace, simSink);
      logLine('──── 시뮬레이션 종료 ────', 'sys');
    } catch (e) {
      logLine('오류: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      simRunning = false; simRunBtn.disabled = false;
    }
  });
  if (simClearBtn) simClearBtn.addEventListener('click', () => { if (simLog) simLog.textContent = ''; });

  // 헤더(제목 영역)를 잡아 카드를 이동 — 모바일에서 캔버스가 터치를 가져가도
  // 위젯을 끌어 화면 위/아래로 옮길 수 있다. (LED 버튼은 드래그 제외)
  const head = card.querySelector('.sim-card-head');
  if (head) {
    let dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sim-led-btn') || e.target.closest('.sim-traffic-btn') || e.target.closest('.sim-launch-btn') || e.target.closest('.sim-topic')) return; // 버튼/드롭다운은 드래그 아님
      const r = card.getBoundingClientRect();
      // 뷰포트 기준 고정 좌표로 전환(데스크톱 absolute / 모바일 centered 모두 대응)
      card.style.position = 'fixed';
      card.style.left = r.left + 'px';
      card.style.top = r.top + 'px';
      card.style.right = 'auto';
      card.style.bottom = 'auto';
      card.style.transform = 'none';
      card.style.margin = '0';
      dragging = true;
      startX = e.clientX; startY = e.clientY; baseX = r.left; baseY = r.top;
      try { head.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const w = card.offsetWidth;
      let nx = baseX + (e.clientX - startX);
      let ny = baseY + (e.clientY - startY);
      // 헤더가 화면에 남도록 클램프
      nx = Math.max(40 - w, Math.min(nx, innerWidth - 40));
      ny = Math.max(0, Math.min(ny, innerHeight - 36));
      card.style.left = nx + 'px';
      card.style.top = ny + 'px';
    });
    const endDrag = (e) => { if (!dragging) return; dragging = false; try { head.releasePointerCapture(e.pointerId); } catch {} };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
  }

  addEventListener('resize', () => { if (!card.hidden && sim) sim.resize(); });

  // 우주 신호등: 1/2/3 키로 슬롯 토글 (시뮬레이션이 열려 있고, 입력 필드에 포커스가 없을 때)
  addEventListener('keydown', (e) => {
    if (card.hidden || !sim || !sim.hasTraffic) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = (t && t.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    let idx = -1;
    if (e.key === '1') idx = 0;
    else if (e.key === '2') idx = 1;
    else if (e.key === '3') idx = 2;
    if (idx < 0) return;
    sim.toggleSlot(idx);
    e.preventDefault();
  });

  return { close };
}
