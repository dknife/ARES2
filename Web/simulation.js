// ============================================================
// 3D 시뮬레이션 — "시뮬레이션 열기" 버튼으로 카드 토글
//   - 주제(로딩 대상 하드웨어)를 드롭다운에서 선택하면 해당 객체가 로딩된다.
//     "알비와 함께"가 기본이며, 나머지 주제는 아직 빈 객체(준비 중)다.
//   - three.js 는 vendor/three-bundle.min.js 가 window.THREE / window.ARES3 로 노출
// ============================================================
import { CommandExecutor } from './commandexecutor.js';
import { state } from './state.js';

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
      root.userData.rocketBottomLocal   = new THREE.Vector3(rcx, ryMin, rcz);
      root.userData.rocketMeshRef = mesh;
      console.log(`[LaunchStation] 로켓 정점 분리: ${insideTris.length / 3}개 삼각형`);
    }
  }
}

// 시뮬레이션 "주제"(로딩 대상). model 이 null 이면 빈 객체(준비 중)를 표시한다.
//   새 객체를 붙이려면 model 에 GLB 경로를, 눈 LED가 있으면 eyes 설정을 채운다.
const TOPICS = {
  albi:      { label: '알비와 함께',   model: 'Mesh/AlbiStaticLow.glb', eyes: { radius: 0.11, left: [0.145, 0.375, 0.12], right: [-0.145, 0.375, 0.12] }, chest: { radius: 0.07, pos: [0, -0.10, 0.135] } },
  traffic:   { label: '우주 신호등',   model: 'Mesh/LampBox.glb',       eyes: null, traffic: { lamp: 'Mesh/LampGeneral.glb', hands: ['Mesh/LampHand1.glb', 'Mesh/LampHand2.glb', 'Mesh/LampHand3.glb'], count: 3 } },
  launchpad: { label: '발사대', model: 'Mesh/LaunchStation.glb', eyes: null, postProcess: recolorLaunchpadAntenna, radar: true,
    // 발사대 LED 6개 — 모두 붉은색 발광.
    //   LED1..LED5: 건물 전면(+z) 세로 줄에 위→아래로 등간격(구체).
    //   LED0:       로켓 바닥에 도넛(토러스).
    launch: {
      stripCount: 5,                // LED1..LED5
      stripRadius: 0.04,            // 구체 반지름
      stripXFrac: 0.50,             // 모델 bbox X 중심 비율
      stripYRange: [0.4275, 0.09068625], // [위, 아래] — bbox Y 비율 (LED1 고정, 간격 ×1.05 → 폭 0.33681375)
      stripZFrac: 0.80,             // 모델 +z 면에 살짝 묻히도록
      torusRadius: 0.09,            // LED0 도넛 외경(굵게)
      torusTube:   0.03,            // LED0 도넛 두께(굵게)
      torusYOffset: -0.08,          // 로켓 바닥에서 내려 발사대 상단에 살짝 닿도록
    },
  },
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
  const EYE    = cfg.eyes   || null; // 눈 LED 설정 (없으면 null)
  const CHEST  = cfg.chest  || null; // 가슴 LED 설정 (없으면 null)
  const LAUNCH = cfg.launch || null; // 발사대 LED 설정 (구체 5개 + 도넛 1개)
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

  // LED(발광 구/도넛) — eyes/chest/launch 설정이 있을 때만 구성.
  // 눈은 초록 좌우 한 쌍(L/R), 가슴은 붉은 중앙 단일 LED.
  // 발사대(LAUNCH)는 붉은 LED 6개(LED0=도넛, LED1..LED5=구체) — 모델 로딩 후 동적 생성.
  let eyeL = null, eyeR = null, chestLed = null;
  let launchLeds = null;             // LAUNCH 가 있고 모델이 로딩되면 length=6 배열로 채워짐
  // 색 팔레트 — sphereBase(어두운 베이스 컬러), emissive(자가 발광), glowStops(스프라이트
  // 텍스처의 inner/mid/outer rgba), glowTint(스프라이트 머티리얼 틴트), lightColor(PointLight).
  const EYE_PALETTE = {
    sphereBase: 0x0c2a18, emissive: 0x00ff66,
    glowStops: ['rgba(180,255,210,1)', 'rgba(40,255,120,0.65)', 'rgba(0,255,90,0)'],
    glowTint: 0x55ff99, lightColor: 0x33ff77,
  };
  const CHEST_PALETTE = {
    sphereBase: 0x2a0c0c, emissive: 0xff2030,
    glowStops: ['rgba(255,210,200,1)', 'rgba(255,60,40,0.65)', 'rgba(255,0,0,0)'],
    glowTint: 0xff5566, lightColor: 0xff3344,
  };
  // 발사대 LED1..LED5 전용 — 흰빛 안 섞인 진한 순수 초록으로 채도를 높였다.
  // 채도 보존 3종 튜닝(눈/가슴 LED 는 기본값이라 영향 없음):
  //   intensityScale: 발광량(emissive/glow/light) 배율 — 낮출수록 ACES 톤매핑의 흰빛 날림↓ → 채도↑
  //   opacityOn:      완전 점등 시 구체 불투명도(1에 가까울수록 본래 색이 또렷·불투명)
  //   glowScale:      가산(Additive) 글로우 비율 — 낮출수록 흰빛 가산이 줄어 색이 진하게 보인다
  const LAUNCH_STRIP_PALETTE = {
    sphereBase: 0x031a0a, emissive: 0x00ff33,
    glowStops: ['rgba(20,255,80,1)', 'rgba(0,230,50,0.78)', 'rgba(0,255,40,0)'],
    glowTint: 0x00ff44, lightColor: 0x00ff44,
    // 입력 v=1 일 때 시각적 밝기를 기존의 약 30% 수준으로 (0.4 → 0.12).
    // opacity 는 v 에만 의존하므로 색의 또렷함은 그대로, 발광량만 줄어든다.
    intensityScale: 0.12, opacityOn: 0.99, glowScale: 0.55,
  };
  // 발사대 LED0(로켓 바닥 도넛) 전용 빨강 — 가슴 LED(CHEST)와 분리해 채도를 더 높게 튜닝.
  const LAUNCH_TORUS_PALETTE = {
    sphereBase: 0x1f0204, emissive: 0xff0a1e,
    glowStops: ['rgba(255,80,70,1)', 'rgba(255,20,25,0.78)', 'rgba(255,0,0,0)'],
    glowTint: 0xff1828, lightColor: 0xff1422,
    intensityScale: 0.45, opacityOn: 0.99, glowScale: 0.55,
  };
  const makeGlowTex = (stops) => {
    const gc = document.createElement('canvas'); gc.width = gc.height = 128;
    const gx = gc.getContext('2d');
    const gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0.0,  stops[0]);
    gg.addColorStop(0.25, stops[1]);
    gg.addColorStop(1.0,  stops[2]);
    gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(gc); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const eyeGlowTex    = EYE    ? makeGlowTex(EYE_PALETTE.glowStops)   : null;
  const chestGlowTex  = CHEST  ? makeGlowTex(CHEST_PALETTE.glowStops) : null;
  // 발사대: 도넛(LED0)은 붉은색, 세로 줄(LED1..5)은 초록색. 두 종류 텍스처 따로 베이크.
  const launchGlowTex      = LAUNCH ? makeGlowTex(LAUNCH_TORUS_PALETTE.glowStops) : null;
  const launchStripGlowTex = LAUNCH ? makeGlowTex(LAUNCH_STRIP_PALETTE.glowStops) : null;
  // geometry 인자가 주어지면 그 지오메트리를 사용(예: 도넛 LED), 아니면 기본 구체.
  // 글로우 스프라이트 스케일·라이트 거리는 radius 기준으로 산정한다.
  const makeLed = (radius, pos, palette, glowTex, geometry) => {
    const grp = new THREE.Group(); grp.position.fromArray(pos);
    const sphere = new THREE.Mesh(
      geometry || new THREE.SphereGeometry(radius, 28, 28),
      new THREE.MeshStandardMaterial({ color: palette.sphereBase, emissive: palette.emissive, emissiveIntensity: 0, transparent: true, opacity: 0.4, roughness: 0.2, metalness: 0 })
    );
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: palette.glowTint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
    glow.scale.setScalar(radius * 3.3); glow.visible = false;
    const light = new THREE.PointLight(palette.lightColor, 0, radius * 22, 2);
    grp.add(sphere, glow, light);
    return { group: grp, sphere, glow, light, on: false,
             intensityScale: palette.intensityScale ?? 1,
             opacityOn: palette.opacityOn ?? 0.92,   // 기본값 = 기존 눈/가슴 LED 동작 보존
             glowScale: palette.glowScale ?? 1 };
  };
  if (EYE)   { eyeL = makeLed(EYE.radius, EYE.left, EYE_PALETTE, eyeGlowTex); eyeR = makeLed(EYE.radius, EYE.right, EYE_PALETTE, eyeGlowTex); }
  if (CHEST) { chestLed = makeLed(CHEST.radius, CHEST.pos, CHEST_PALETTE, chestGlowTex); }
  // value: boolean(true=full on) 또는 0..1 강도. 0이면 OFF, >0이면 강도에 비례한 ON 룩.
  // intensityScale: 팔레트별 발광량 보정(<1이면 더 약하게) — 채도 보존용.
  function applyLed(e, value) {
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    const s = e.intensityScale ?? 1;
    const opOn  = e.opacityOn ?? 0.92;      // 완전 점등 시 구체 불투명도(높을수록 색이 또렷)
    const glowS = e.glowScale ?? 1;         // 가산 글로우 비율(낮을수록 흰빛 날림↓ → 채도↑)
    e.on = v > 0;
    e.sphere.material.emissiveIntensity = 3.2 * v * s;       // s 를 낮추면 밝기↓ → 색 보존
    e.sphere.material.opacity = v > 0 ? 0.4 + (opOn - 0.4) * v : 0.4;
    e.glow.visible = v > 0;
    if (e.glow.material) e.glow.material.opacity = 0.95 * v * s * glowS;
    e.light.intensity = 1.8 * v * s;
  }
  function setEye(side, value) { if (!EYE)   return; applyLed(side === 'L' ? eyeL : eyeR, value); }
  function setChest(value)     { if (!CHEST) return; applyLed(chestLed, value); }
  function setLaunchLed(i, value) {
    // launchLeds 는 모델 로딩이 끝나야 채워진다. 그 전 호출은 무시.
    if (!LAUNCH || !launchLeds || !launchLeds[i]) return;
    applyLed(launchLeds[i], value);
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
      if (EYE)   root.add(eyeL.group, eyeR.group);
      if (CHEST) root.add(chestLed.group);
      // 주제별 후처리(예: 탐사선 발사대의 안테나 회색화). root 변환은 위에서 이미 끝났다.
      try { cfg.postProcess?.(root, THREE); } catch (e) { console.warn('postProcess 실패:', e); }
      // postProcess 가 심어둔 핸들을 render 루프 변수에 캐싱.
      antennaPivot        = root.userData.antennaPivot        || null;
      rocketGroup         = root.userData.rocketGroup         || null;
      rocketFlameSprite   = root.userData.rocketFlameSprite   || null;
      rocketFlameLight    = root.userData.rocketFlameLight    || null;
      rocketCentroidLocal = root.userData.rocketCentroidLocal || null;
      rocketMeshRef       = root.userData.rocketMeshRef       || null;
      rocketBottomLocal   = root.userData.rocketBottomLocal   || null;
      // 발사대 LED 6개 — bbox 비율로 LED1..LED5(전면 세로 줄), 로켓 바닥에 LED0(도넛).
      // box/sz/c 는 root.position 보정 전 좌표계이므로 root에 그 값을 그대로 local로 넘기면
      // 보정된 위치에 자동으로 놓인다.
      if (LAUNCH) {
        launchLeds = new Array(6).fill(null);
        launchFootprintSize = Math.max(sz.x, sz.z);   // 부저 웨이브 ring 의 기준 반지름
        const lx = box.min.x + sz.x * LAUNCH.stripXFrac;
        const lz = box.min.z + sz.z * LAUNCH.stripZFrac;
        const yTop = box.min.y + sz.y * LAUNCH.stripYRange[0];
        const yBot = box.min.y + sz.y * LAUNCH.stripYRange[1];
        const n = LAUNCH.stripCount;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : i / (n - 1);
          const ly = yTop + (yBot - yTop) * t;          // i=0 → 위, i=n-1 → 아래
          const led = makeLed(LAUNCH.stripRadius, [lx, ly, lz], LAUNCH_STRIP_PALETTE, launchStripGlowTex);
          root.add(led.group);
          launchLeds[i + 1] = led;                       // LED1..LED5 (초록)
        }
        // LED0: 로켓 바닥에 누운(축=y) 도넛. postProcess가 rocketBottomLocal을 남겼을 때만.
        const rb = root.userData.rocketBottomLocal;
        const rmesh = root.userData.rocketMeshRef;
        if (rb && rmesh) {
          const torusGeom = new THREE.TorusGeometry(LAUNCH.torusRadius, LAUNCH.torusTube, 16, 48);
          torusGeom.rotateX(Math.PI / 2);                // 눕혀서 평면 링으로
          const led0 = makeLed(LAUNCH.torusRadius, [rb.x, rb.y + LAUNCH.torusYOffset, rb.z], LAUNCH_TORUS_PALETTE, launchGlowTex, torusGeom);
          rmesh.add(led0.group);                          // mesh-local 좌표 사용했으므로 mesh에 붙임
          launchLeds[0] = led0;
        }
      }
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
  // DC 모터 명령(DC_FORWARD/BACKWARD/STOP)이 회전 방향을 제어한다.
  let radarOn = false;
  let radarDir = 1;                  // +1 = 시계방향(전진), -1 = 반시계방향(후진)
  let antennaPivot = null;
  function setRadar(on, dir) {
    radarOn = !!on;
    if (dir !== undefined && dir !== null) radarDir = dir < 0 ? -1 : 1;
  }

  // 로켓 발사 — rocketGroup 을 위로 점진 상승, 카메라가 로켓을 따라가며 쳐다본다.
  let rocketGroup = null, rocketFlameSprite = null, rocketFlameLight = null;
  let rocketCentroidLocal = null, rocketMeshRef = null, rocketBottomLocal = null;
  let rocketLaunchOn = false;
  let rocketAnimT = 0;                  // 0(원위치) ~ 1(완전 발사)
  // 발사 시작 시점의 카메라/타깃 백업 — 중지하면 정확히 이 상태로 복귀한다.
  let savedCamPos = null, savedTarget = null, rocketCentroidWorld = null;
  const ROCKET_RISE  = 10;              // local 단위로 로켓이 위로 올라가는 거리(=카메라 추적량)
  const ROCKET_SPEED = 0.00267;         // 프레임당 rocketAnimT 변화 (≈ 6초에 1회 완주, 이전의 1/3 속도)
  // 로켓 발사 연기/구름 — 엔진에서 큰 회백색 puff 를 분출. 연기는 로켓과 달리 mesh-local
  // 공간에 머물러(같이 솟지 않음) 발사대 바닥에 큰 구름이 쌓이고 위로 기둥 trail 이 생긴다.
  let smokeGroup = null;                // rocketMeshRef 에 붙는 puff 컨테이너
  let smokeTex = null;                  // 뭉게구름 텍스처(CanvasTexture)
  const smokePool = [];                 // { sprite, active, age, life, vel, scale0, scaleMax, rot, rotSpeed }
  let smokeSpawnAcc = 0;                // 분당 puff 생성 누적치
  const SMOKE_POOL  = 80;               // 재사용 sprite 풀 크기
  const SMOKE_RATE  = 42;               // 초당 기본 puff 생성 수(발사 초반엔 ×2 까지)
  function setRocketLaunch(on, followCamera) {
    // followCamera 가 false 면 시점 추적 없이 발사만 — 시뮬레이션 명령(GUN_FIRE) 경로용.
    // 버튼(UI) 토글은 인자 생략 → 기존대로 카메라가 로켓을 따라간다.
    const follow = followCamera !== false;
    rocketLaunchOn = !!on;
    // 발사 시작 순간의 카메라 상태와 로켓 world centroid 를 한 번만 캡처. 중지가 끝나면
    // (rocketAnimT === 0) render 루프가 saved 를 비워서 다음 발사가 새 기준점을 잡는다.
    // savedCamPos 가 비어있으면 render 루프의 카메라 추적/복귀 코드도 건너뛴다.
    if (rocketLaunchOn && !savedCamPos && follow) {
      savedCamPos = camera.position.clone();
      savedTarget = controls.target.clone();
      if (rocketCentroidLocal && rocketMeshRef) {
        rocketMeshRef.updateMatrixWorld(true);
        rocketCentroidWorld = rocketCentroidLocal.clone().applyMatrix4(rocketMeshRef.matrixWorld);
      }
    }
  }

  // 발사대 부저 웨이브 — BUZZER_ON 동안 발사대 바닥에서 반구(돔) 형태의 웨이브가
  // 사방·상방으로 퍼져나간다. 각 돔은 일정 수명 동안 균등 확대되며 페이드 아웃.
  // 끄면 새 돔은 안 생기고 기존 것만 마저 사라진다.
  let launchWaveOn = false;
  let launchWaveSpawnTimer = 0;
  let launchFootprintSize = 1;          // 모델 로딩 후 max(sz.x, sz.z)로 갱신
  const launchWaveRings = [];           // { mesh, age } — 반구 돔 메시
  const WAVE_SPAWN_INTERVAL = 0.18;     // 새 돔 생성 주기(초)
  const WAVE_LIFETIME       = 1.4;      // 각 돔 수명(초)
  const WAVE_MAX_SCALE      = 5;        // 최종 스케일(초기 → ×WAVE_MAX_SCALE)
  const WAVE_COLOR          = 0x88ddff; // 사운드 웨이브 느낌의 시안
  const WAVE_OPACITY        = 0.16;     // 초기 투명도(반구 셸 중첩 고려해 낮춤 — 더 은은하게)
  function setLaunchWave(on) {
    if (!LAUNCH) return;
    launchWaveOn = !!on;
    if (!launchWaveOn) launchWaveSpawnTimer = 0;
  }
  function spawnWaveRing() {
    // 상반구(돔) 셸 — 적도를 지면(y=0)에 두고 위로 부풀어 오른다.
    // SphereGeometry 의 theta(꼭대기→적도)를 0~π/2 로 잘라 상반구만 만든다.
    const baseR = launchFootprintSize * 0.5;
    const geom = new THREE.SphereGeometry(
      baseR, 48, 24,
      0, Math.PI * 2,      // phi: 전체 둘레
      0, Math.PI / 2       // theta: 상반구(꼭대기 → 적도)
    );
    const mat = new THREE.MeshBasicMaterial({
      color: WAVE_COLOR, transparent: true, opacity: WAVE_OPACITY,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, 0, 0);  // 발사대 바닥 중심 — 적도가 지면에 닿는다
    scene.add(mesh);
    launchWaveRings.push({ mesh, age: 0 });
  }
  function updateLaunchWaves(dt) {
    if (launchWaveOn) {
      launchWaveSpawnTimer += dt;
      while (launchWaveSpawnTimer >= WAVE_SPAWN_INTERVAL) {
        launchWaveSpawnTimer -= WAVE_SPAWN_INTERVAL;
        spawnWaveRing();
      }
    }
    for (let i = launchWaveRings.length - 1; i >= 0; i--) {
      const r = launchWaveRings[i];
      r.age += dt;
      const t = r.age / WAVE_LIFETIME;
      if (t >= 1) {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        scene.remove(r.mesh);
        launchWaveRings.splice(i, 1);
        continue;
      }
      const scale = 1 + t * (WAVE_MAX_SCALE - 1);
      r.mesh.scale.setScalar(scale);      // 반구를 x·y·z 균등 확대 → 돔이 사방·상방으로 퍼짐
      r.mesh.material.opacity = (1 - t) * WAVE_OPACITY;
    }
  }

  // ── 로켓 발사 연기/구름 ──
  // 뭉게구름 텍스처: 부드러운 원을 여러 개 겹쳐 얼룩진(billowy) 알파를 만든다.
  const makeSmokeTex = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const blob = (px, py, r, a) => {
      const g = cx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0.0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.5, `rgba(244,246,250,${a * 0.55})`);
      g.addColorStop(1.0, 'rgba(232,236,244,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(px, py, r, 0, Math.PI * 2); cx.fill();
    };
    blob(64, 64, 46, 0.92);
    blob(44, 54, 30, 0.7); blob(82, 56, 28, 0.7);
    blob(54, 82, 26, 0.62); blob(82, 82, 24, 0.62);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // 로켓 참조가 준비된 뒤(모델 로딩 완료) 한 번만 풀을 생성해 mesh 에 붙인다.
  function ensureSmoke() {
    if (smokeGroup || !rocketMeshRef || !rocketBottomLocal) return;
    smokeTex = makeSmokeTex();
    smokeGroup = new THREE.Group();
    rocketMeshRef.add(smokeGroup);
    for (let i = 0; i < SMOKE_POOL; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, color: 0xeef1f6, transparent: true,
        depthWrite: false, opacity: 0, // 일반 블렌딩 → 불투명한 구름 느낌
      }));
      sp.visible = false;
      smokeGroup.add(sp);
      smokePool.push({ sprite: sp, active: false, age: 0, life: 1, vel: new THREE.Vector3(),
                       scale0: 0.18, scaleMax: 1.4, rot: 0, rotSpeed: 0 });
    }
  }
  // 로켓 바닥(현재 상승 높이 반영)에서 puff 한 개 분출 — 주로 바깥으로 퍼지며 천천히 떠오른다.
  function spawnSmoke(baseY) {
    const p = smokePool.find((q) => !q.active);
    if (!p) return;
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.12;
    p.active = true; p.age = 0;
    p.life = 1.6 + Math.random() * 1.3;                 // 1.6~2.9초 동안 살아있음
    p.sprite.position.set(
      rocketBottomLocal.x + Math.cos(ang) * rad,
      baseY - 0.05 - Math.random() * 0.06,              // 엔진 바로 아래에서 시작
      rocketBottomLocal.z + Math.sin(ang) * rad,
    );
    const spd = 0.5 + Math.random() * 0.8;
    p.vel.set(Math.cos(ang) * spd, -0.15 - Math.random() * 0.25, Math.sin(ang) * spd);
    p.scale0  = 0.16 + Math.random() * 0.12;            // 작게 시작
    p.scaleMax = 1.0 + Math.random() * 1.0;             // 큰 구름으로 팽창
    p.rot = Math.random() * Math.PI * 2;
    p.rotSpeed = (Math.random() - 0.5) * 0.8;
    p.sprite.material.opacity = 0;
    p.sprite.material.rotation = p.rot;
    p.sprite.scale.set(p.scale0, p.scale0, 1);
    p.sprite.visible = true;
  }
  function updateSmoke(dt) {
    ensureSmoke();
    if (!smokeGroup) return;
    // 분출 — 추진 중(rocketLaunchOn)일 때만. 발사 초반(바닥 근처)일수록 더 많이 뿜어 큰 구름.
    if (rocketLaunchOn) {
      const rate = SMOKE_RATE * (1 + (1 - rocketAnimT));   // 초반 ×2 → 정점 ×1
      smokeSpawnAcc += dt * rate;
      const baseY = rocketBottomLocal.y + rocketGroup.position.y;
      while (smokeSpawnAcc >= 1) { smokeSpawnAcc -= 1; spawnSmoke(baseY); }
    } else {
      smokeSpawnAcc = 0;
    }
    // 갱신 — 팽창·이동·페이드. 중지해도 남은 puff 는 자연히 사라진다.
    for (const p of smokePool) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { p.active = false; p.sprite.visible = false; continue; }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - 2.0 * dt));    // 공기 저항(프레임레이트 무관) — 점점 퍼지다 멈춤
      p.vel.y += 0.3 * dt;                                // 연기는 천천히 위로 떠오름
      const grow = 1 - (1 - t) * (1 - t);                 // ease-out 팽창
      const s = p.scale0 + (p.scaleMax - p.scale0) * grow;
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = Math.min(1, t * 6) * (1 - t) * 0.8; // 빠르게 차고 천천히 사라짐
      p.rot += p.rotSpeed * dt;
      p.sprite.material.rotation = p.rot;
    }
  }

  let lastRenderTime = 0;
  function render() {
    const nowSec = performance.now() * 0.001;
    const dt = lastRenderTime > 0 ? Math.min(0.1, nowSec - lastRenderTime) : 0.016;
    lastRenderTime = nowSec;
    controls.update();
    if (radarOn && antennaPivot) antennaPivot.rotation.y += 0.15 * radarDir; // 약 8.6°/프레임
    if (LAUNCH) updateLaunchWaves(dt);

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

      // 발사 연기/구름 — 엔진에서 큰 회백색 puff 분출(추진 중 생성, 이후 자연 소멸).
      updateSmoke(dt);

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
  // value: boolean(true=풀밝기) 또는 0..1 강도. 0이면 OFF 룩, >0이면 강도에 비례한 ON 룩.
  function setSlotOn(i, value) {
    const s = trafficSlotState[i];
    if (!s) return;
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    s.on = v > 0;
    const onCol = new THREE.Color(s.color);
    for (const m of s.materials) {
      if (m.color    !== undefined) m.color.copy(s.on ? onCol : TRAFFIC_OFF_COLOR);
      if (m.emissive !== undefined) {
        m.emissive.copy(s.on ? onCol : new THREE.Color(0x000000));
        m.emissiveIntensity = 0.7 * v;                  // 채도 유지(낮을수록 색이 진하게 남음)
      }
      // 베이스 컬러가 또렷이 보이도록 금속질을 줄이고 거칠기는 살짝 높임
      if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.1);
      if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.55);
      // 항상 반투명 — 꺼졌을 때는 뒤쪽이 잘 보이고, 켜졌을 때도 살짝 비치도록
      m.transparent = true;
      m.opacity     = s.on ? (0.55 + 0.25 * v) : 0.55;
      m.depthWrite  = false;                            // 정렬보다 비침을 우선
      m.needsUpdate = true;
    }
    if (s.light) s.light.intensity = 1.3 * v;          // 주변에 색조만 옅게 묻히는 정도
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
    // 연기 puff(Sprite)는 traverse(isMesh)에 안 잡히므로 재료/텍스처를 직접 정리.
    try {
      smokePool.forEach((p) => p.sprite?.material?.dispose?.());
      smokeTex?.dispose?.();
    } catch {}
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
    render, resize, setEye, setChest, dispose,
    hasEyes: !!EYE, get eyeL() { return eyeL; }, get eyeR() { return eyeR; },
    hasChest: !!CHEST, get chestLed() { return chestLed; },
    get hasLaunchLeds() { return !!LAUNCH && !!launchLeds; }, setLaunchLed,
    get launchLeds() { return launchLeds; },
    get hasLaunchWave() { return !!LAUNCH; }, setLaunchWave,
    hasTraffic: !!TRAFFIC, placeLamps, placeHands, resetTraffic, toggleSlot, setSlot: setSlotOn,
    get hasRadar() { return !!antennaPivot; }, setRadar,
    get radarOn() { return radarOn; },
    get hasRocket() { return !!rocketGroup; }, setRocketLaunch,
    get rocketLaunchOn() { return rocketLaunchOn; },
    // 로켓이 완전히 원위치에 있는지(발사 중도 아니고 복귀 애니메이션도 끝남).
    get rocketAtRest() { return !rocketLaunchOn && rocketAnimT === 0; },
  };
}

// 시뮬레이션 모듈 초기화 — main.js 의 워크스페이스를 받아 컨트롤러 { close } 를 반환.
// 필수 DOM 또는 three.js 라이브러리가 없으면 null 반환.
export function setupSimulation({ workspace, onOpen, onClose }) {
  const btn = document.getElementById('simToggle');
  const card = document.getElementById('simCard');
  const stage = document.getElementById('simStage');
  const loadingEl = document.getElementById('simLoading');
  const ledWrap = card ? card.querySelector('.sim-led-buttons') : null;
  const trafficWrap = card ? card.querySelector('.sim-traffic-buttons') : null;
  const launchWrap = card ? card.querySelector('.sim-launch-buttons') : null;
  const launchLedWrap = card ? card.querySelector('.sim-launch-led-buttons') : null;
  const radarBtn  = document.getElementById('simRadar');
  const rocketBtn = document.getElementById('simRocket');
  const simHint = document.getElementById('simHint');
  const HINT_DEFAULT = '로봇: 끌어서 회전 · 휠: 확대 · LED 버튼으로 눈·가슴 켜고 끄기';
  const HINT_TRAFFIC = '1, 2, 3번 키를 눌러 램프를 켜고 끄기';
  const HINT_LAUNCH  = '레이더 가동 · 로켓 발사 버튼을 눌러 발사대를 작동시켜 보세요';
  // 발사대 버튼은 간단히 표시(레이더 / 로켓). 활성 여부는 .on 클래스(점 색)로만 구분.
  const RADAR_LABEL_ON   = '<span class="dot"></span>레이더';
  const RADAR_LABEL_OFF  = '<span class="dot"></span>레이더';
  const ROCKET_LABEL_ON  = '<span class="dot"></span>로켓';
  const ROCKET_LABEL_OFF = '<span class="dot"></span>로켓';
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
    card.querySelectorAll('.sim-launch-led-btn').forEach((b) => b.classList.remove('on'));
    card.querySelectorAll('.sim-traffic-btn').forEach((b) => {
      // 우주 신호등은 디폴트가 "신호등(램프 배치)" 상태이므로 lamps 버튼을 on 으로 표시
      b.classList.toggle('on', !!cfg.traffic && b.dataset.action === 'lamps');
    });
    if (ledWrap) {
      ledWrap.style.display = (cfg.eyes || cfg.chest) ? '' : 'none';
      // 버튼 단위 표시 — 눈/가슴 중 설정된 쪽만 보이게.
      ledWrap.querySelectorAll('.sim-led-btn').forEach((b) => {
        const part = b.dataset.part || 'eye';
        b.style.display = (part === 'chest' ? !!cfg.chest : !!cfg.eyes) ? '' : 'none';
      });
    }
    if (trafficWrap) trafficWrap.style.display = cfg.traffic ? '' : 'none';
    if (launchWrap) launchWrap.style.display = cfg.radar ? '' : 'none';
    if (launchLedWrap) launchLedWrap.style.display = cfg.launch ? '' : 'none';
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
    // onOpen 은 호스트(main.js)에서 미션 뷰 data-mode 를 'simulation' 으로
    // 전환해 sim-card 가 실제로 레이아웃되도록 만든다.
    // 빌드/리사이즈가 stage.clientWidth 를 읽기 *전에* 호출해야 카메라 종횡비가 맞는다.
    if (typeof onOpen === 'function') {
      try { onOpen(); } catch {}
    }
    if (!sim && sel) sel.value = defaultTopicForMission();  // 첫 오픈: 미션 기본 주제
    const t = (sel && sel.value) || DEFAULT_TOPIC;
    if (!sim || builtTopic !== t) build(t);
    sim.resize();
    cancelAnimationFrame(raf); loop();
    btn.textContent = '🤖 시뮬레이션 닫기';
    btn.setAttribute('aria-pressed', 'true');
  };
  // 실제로 카드를 숨기고 렌더 루프를 멈추는 마무리 단계.
  const finalizeClose = () => {
    card.hidden = true;
    cancelAnimationFrame(raf); raf = 0;
    btn.textContent = '🤖 시뮬레이션 열기';
    btn.setAttribute('aria-pressed', 'false');
    if (typeof onClose === 'function') {
      try { onClose(); } catch {}
    }
  };
  let closing = false;                 // 로켓 복귀 재생 중 중복 close 방지
  const close = () => {
    if (card.hidden || closing) return;
    // 로켓이 떠 있으면(발사 중이거나 복귀 도중) '발사 중지' 버튼과 동일하게
    // 원위치로 내려오는 과정을 끝까지 재생한 뒤에 카드를 닫는다.
    if (sim && sim.hasRocket && !sim.rocketAtRest) {
      closing = true;
      sim.setRocketLaunch(false);
      // 로켓 버튼 UI 도 중지 상태로 되돌린다.
      if (rocketBtn) {
        rocketBtn.classList.remove('on');
        rocketBtn.innerHTML = ROCKET_LABEL_OFF;
        rocketBtn.setAttribute('aria-pressed', 'false');
      }
      // 렌더 루프(raf)는 계속 돌며 로켓을 내려보낸다. 복귀가 끝나면 마무리.
      const waitDescend = () => {
        if (!sim || sim.rocketAtRest) { closing = false; finalizeClose(); return; }
        requestAnimationFrame(waitDescend);
      };
      waitDescend();
      return;
    }
    finalizeClose();
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
      if (!sim) return;
      const part = b.dataset.part || 'eye';
      if (part === 'chest') {
        if (!sim.hasChest) return;
        const cur = sim.chestLed.on;
        sim.setChest(!cur);
        b.classList.toggle('on', !cur);
      } else {
        if (!sim.hasEyes) return;
        const side = b.dataset.side;
        const cur = (side === 'L') ? sim.eyeL.on : sim.eyeR.on;
        sim.setEye(side, !cur);
        b.classList.toggle('on', !cur);
      }
    });
  });

  // 발사대 LED 전체 토글 — 한 번 누르면 LED0~5 모두 켜짐, 다시 누르면 모두 꺼짐.
  // 모델 비동기 로딩이 끝나기 전 클릭은 무시.
  const launchLedsBtn = document.getElementById('simLaunchLeds');
  if (launchLedsBtn) {
    launchLedsBtn.addEventListener('click', () => {
      if (!sim || !sim.hasLaunchLeds) return;
      const next = !launchLedsBtn.classList.contains('on');
      for (let i = 0; i <= 5; i++) sim.setLaunchLed(i, next ? 1 : 0);
      launchLedsBtn.classList.toggle('on', next);
    });
  }

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
      if (next) playRocketLaunch();          // 발사 시작 시 발사음 재생
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
  // 취소 가능한 대기 — 비상 정지 시 진행 중인 대기(예: SLEEP 5초)를 즉시 끝낸다.
  let activeWaitCancel = null;
  const wait = (ms) => new Promise((resolve) => {
    const id = setTimeout(() => { activeWaitCancel = null; resolve(); }, ms);
    activeWaitCancel = () => { clearTimeout(id); activeWaitCancel = null; resolve(); };
  });
  // 부저 비프 — 사용자가 시뮬레이션 버튼을 클릭한 직후 호출되므로 AudioContext가 허용됨.
  // square파로 부저 같은 음색을 내고, 끝에 짧은 페이드로 클릭 노이즈 제거.
  let audioCtx = null;
  const playBeep = (hz, sec) => {
    if (!hz || sec <= 0) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = hz;
      o.connect(g); g.connect(audioCtx.destination);
      const t0 = audioCtx.currentTime;
      const t1 = t0 + sec;
      const VOL = 0.06;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(VOL, t0 + 0.005);
      g.gain.setValueAtTime(VOL, Math.max(t0 + 0.006, t1 - 0.01));
      g.gain.linearRampToValueAtTime(0, t1);
      o.start(t0); o.stop(t1 + 0.02);
    } catch (e) { console.warn('beep 실패:', e); }
  };
  // 로켓 발사음 — 필터링한 화이트노이즈로 만든 절차적 굉음.
  //   · 저역 럼블(lowpass): 점점 묵직해지는 우르릉.
  //   · 중역 로어(bandpass): 점화 직후 솟구쳤다 가라앉는 분사 쉭소리.
  //   엔벨로프: 빠른 점화 폭발 → 서서히 감쇠(약 3.6초).
  const playRocketLaunch = () => {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime;
      const DUR = 3.6;
      // 2초 길이 화이트노이즈 버퍼를 루프로 재생 — 럼블/로어 공통 소스.
      const bufLen = Math.floor(ctx.sampleRate * 2);
      const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

      // 저역 럼블
      const rumbleSrc = ctx.createBufferSource(); rumbleSrc.buffer = buffer; rumbleSrc.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t0);
      lp.frequency.exponentialRampToValueAtTime(250, t0 + DUR);   // 점점 더 묵직하게
      const rumbleGain = ctx.createGain();
      rumbleSrc.connect(lp); lp.connect(rumbleGain); rumbleGain.connect(ctx.destination);

      // 중역 로어(분사 쉭소리)
      const roarSrc = ctx.createBufferSource(); roarSrc.buffer = buffer; roarSrc.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
      bp.frequency.setValueAtTime(500, t0);
      bp.frequency.linearRampToValueAtTime(1400, t0 + 0.6);       // 점화 직후 솟구침
      bp.frequency.exponentialRampToValueAtTime(700, t0 + DUR);
      const roarGain = ctx.createGain();
      roarSrc.connect(bp); bp.connect(roarGain); roarGain.connect(ctx.destination);

      // 엔벨로프 — 빠른 점화 후 감쇠.
      const VOL = 0.16;
      rumbleGain.gain.setValueAtTime(0, t0);
      rumbleGain.gain.linearRampToValueAtTime(VOL, t0 + 0.15);    // 점화 폭발
      rumbleGain.gain.setValueAtTime(VOL, t0 + DUR * 0.5);
      rumbleGain.gain.linearRampToValueAtTime(0, t0 + DUR);
      roarGain.gain.setValueAtTime(0, t0);
      roarGain.gain.linearRampToValueAtTime(VOL * 0.7, t0 + 0.1);
      roarGain.gain.linearRampToValueAtTime(0, t0 + DUR);

      rumbleSrc.start(t0); rumbleSrc.stop(t0 + DUR + 0.05);
      roarSrc.start(t0);   roarSrc.stop(t0 + DUR + 0.05);
    } catch (e) { console.warn('rocket launch sound 실패:', e); }
  };
  // 현재 주제(알비 / 우주 신호등 …)에 따라 명령 시작 시점에 시각·소리 효과를 적용한다.
  // BUZZER_ON처럼 동작 종료 시 원복이 필요한 효과는 정리 콜백을 돌려주고,
  // simSink가 wait 직후 그 콜백을 실행한다.
  //
  // LED 번호 매핑 (각 주제의 입장에서 본 번호 → 시각 요소):
  //   - 알비:        LED1 = 오른쪽 눈(eyeR), LED2 = 왼쪽 눈(eyeL)
  //   - 우주 신호등: LED1 = 슬롯0(빨강/가위), LED2 = 슬롯1(노랑/바위), LED3 = 슬롯2(초록/보)
  //   - 발사대:      LED0 = 로켓 바닥 도넛, LED1..LED5 = 건물 전면 세로 줄(위→아래)
  //
  // [i0 i1 i2 i3 i4 i5] 패턴은 각 주제가 가진 번호에만 적용된다.
  const setLedByNum = (num, intensity) => {
    if (sim.hasEyes) {
      if (num === 1) sim.setEye('R', intensity);
      else if (num === 2) sim.setEye('L', intensity);
    } else if (sim.hasTraffic) {
      if (num >= 1 && num <= 3) sim.setSlot(num - 1, intensity);
    } else if (sim.hasLaunchLeds) {
      if (num >= 0 && num <= 5) sim.setLaunchLed(num, intensity);
    }
  };
  const setAllLedsOff = () => {
    if (sim.hasEyes)       { sim.setEye('R', 0); sim.setEye('L', 0); }
    if (sim.hasChest)      sim.setChest(0);
    if (sim.hasTraffic)    { sim.setSlot(0, 0); sim.setSlot(1, 0); sim.setSlot(2, 0); }
    if (sim.hasLaunchLeds) { for (let i = 0; i <= 5; i++) sim.setLaunchLed(i, 0); }
  };
  const applyTopicEffect = (cmd) => {
    if (!sim) return null;
    // BATCH 는 simSink 에서 서브명령 단위로 순차 처리하므로 여기로 도달하지 않는다.
    if (cmd.startsWith('LED_ON,')) {
      const parts = cmd.split(',');
      const num = parseInt(parts[1], 10);
      const intensity = Math.max(0, Math.min(1, parseFloat(parts[2])));
      setLedByNum(num, intensity);
      return null;
    }
    // LED 패턴 [i0 i1 i2 i3 i4 i5] — Pico의 _handle_led_pattern과 동일 포맷.
    if (cmd.startsWith('[') && cmd.endsWith(']')) {
      const values = cmd.slice(1, -1).trim().split(/\s+/);
      const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
      for (let i = 0; i <= 5; i++) {
        if (values.length > i) setLedByNum(i, toI(values[i]));
      }
      return null;
    }
    if (cmd.startsWith('LED_OFF,')) {
      const arg = cmd.split(',')[1];
      if (arg === 'ALL') setAllLedsOff();
      else setLedByNum(parseInt(arg, 10), 0);
      return null;
    }
    if (cmd.startsWith('BUZZER_ON,')) {
      // 주제별 시각 효과:
      //   - 알비:        가슴 LED 점등
      //   - 발사대:      지면에서 동심원 웨이브가 퍼져 나감
      //   - 신호등 등:   해당 사항 없음 → 부저 전체를 미처리
      const cleanups = [];
      if (sim.hasChest)      { sim.setChest(1);          cleanups.push(() => { if (sim?.hasChest)      sim.setChest(0); }); }
      if (sim.hasLaunchWave) { sim.setLaunchWave(true);  cleanups.push(() => { if (sim?.hasLaunchWave) sim.setLaunchWave(false); }); }
      if (cleanups.length === 0) return null;
      const parts = cmd.split(',');
      const hz  = parseFloat(parts[1]) || 0;
      const sec = parseFloat(parts[2]) || 0;
      playBeep(hz, sec);
      return () => cleanups.forEach((fn) => fn());
    }
    // DC 모터 — 발사대에서는 레이더 안테나 회전을 제어한다. 시계방향(+) / 반시계(−).
    //   DC_tFORWARD,t / DC_tBACKWARD,t : t초 회전 후 정지(블로킹, hold 시간 후 cleanup).
    //   DC_FORWARD / DC_BACKWARD        : 회전을 켜고 즉시 다음 명령으로 (non-blocking).
    //   DC_STOP                         : 회전 정지.
    if (cmd.startsWith('DC_tFORWARD,') || cmd.startsWith('DC_tBACKWARD,')) {
      if (!sim.hasRadar) return null;
      const dir = cmd.startsWith('DC_tFORWARD,') ? 1 : -1;
      sim.setRadar(true, dir);
      return () => { if (sim) sim.setRadar(false); };
    }
    if (cmd === 'DC_FORWARD'  || cmd.startsWith('DC_FORWARD,'))  { if (sim.hasRadar) sim.setRadar(true,  1); return null; }
    if (cmd === 'DC_BACKWARD' || cmd.startsWith('DC_BACKWARD,')) { if (sim.hasRadar) sim.setRadar(true, -1); return null; }
    if (cmd === 'DC_STOP'     || cmd.startsWith('DC_STOP,'))     { if (sim.hasRadar) sim.setRadar(false);    return null; }
    // GUN_FIRE — 로켓 발사. 시뮬레이션 경로에서는 카메라가 따라가지 않는다(=followCamera:false).
    if (cmd === 'GUN_FIRE' || cmd.startsWith('GUN_FIRE,')) {
      if (sim.hasRocket) { sim.setRocketLaunch(true, false); playRocketLaunch(); }
      return null;
    }
    return null;
  };
  // 명령에 포함된 동작 시간을 초 단위로 돌려준다. 시뮬레이션이 Pico처럼 그 시간만큼
  // 실제로 멈춰서 블록의 타이밍 감각을 재현하게 만든다. 인자가 없는 명령(LED, MSG 등)은 0.
  const commandHoldSeconds = (c) => {
    const head = c.split(',')[0];
    const parts = c.split(',');
    if (c.startsWith('BATCH;')) {
      return c.slice('BATCH;'.length).split('|').reduce((s, sub) => s + commandHoldSeconds(sub), 0);
    }
    if (head === 'SLEEP')                          return parseFloat(parts[1]) || 0;
    if (head === 'BUZZER_ON')                      return parseFloat(parts[2]) || 0;
    if (head === 'SERVO_tFORWARD'  || head === 'SERVO_tBACKWARD' ||
        head === 'SERVO_tLEFT'     || head === 'SERVO_tRIGHT')   return parseFloat(parts[1]) || 0;
    if (head === 'DC_tFORWARD'     || head === 'DC_tBACKWARD')   return parseFloat(parts[1]) || 0;
    return 0;
  };
  const simSink = async (command, waitForResponse) => {
    const ackMs = waitForResponse ? 100 : 20;             // Ack 100ms / 비Ack 20ms (BATCH는 1회만)
    logLine(`→ ${command}`, waitForResponse ? 'tx-ack' : 'tx');
    let holdMs = 0;
    if (command.startsWith('BATCH;')) {
      // BATCH;A|B|C — 서브명령을 순차로 처리. 명령 사이 추가 대기 없음.
      // 각 서브명령의 hold 시간(SLEEP, BUZZER, 시간형 모션)만큼만 기다린 뒤 다음으로 넘어간다.
      await wait(ackMs);
      const subs = command.slice('BATCH;'.length).split('|').filter((s) => s.length > 0);
      for (const sub of subs) {
        if (!state.isExecuting) break;       // 비상 정지: 남은 서브명령 처리 중단
        const subHoldMs = Math.round(commandHoldSeconds(sub) * 1000);
        const cleanup = applyTopicEffect(sub);
        if (subHoldMs > 0) await wait(subHoldMs);
        cleanup?.();
        holdMs += subHoldMs;
      }
    } else {
      holdMs = Math.round(commandHoldSeconds(command) * 1000);
      const cleanup = applyTopicEffect(command);            // 시작 효과 적용 (LED/부저)
      await wait(ackMs + holdMs);
      cleanup?.();                                          // 동작 시간 종료 처리 (예: 가슴 LED 끔)
    }
    const total = ackMs + holdMs;
    let reply = '1';
    if (command.startsWith('DISTANCE')) reply = 'DIST:30';
    else if (command.startsWith('MAGNET')) reply = 'MAG:0';
    const holdNote = holdMs > 0 ? ` + 대기 ${holdMs}ms` : '';
    logLine(`     ↩ ${reply}  (+${total}ms, ${waitForResponse ? 'Ack' : '비Ack'}${holdNote})`, 'rx');
    return reply;
  };
  const SIM_RUN_LABEL = '▶ 시뮬레이션 해보기';
  const SIM_STOP_LABEL = '⏹ 시뮬레이션 중지';
  let simRunning = false;
  let simAborted = false;
  if (simRunBtn) simRunBtn.addEventListener('click', async () => {
    // 실행 중 다시 누르면 '비상 정지' — 진행 중인 명령 처리를 즉시 중단한다.
    if (simRunning) {
      simAborted = true;
      state.isExecuting = false;       // 모든 블록 루프(반복/while/순차)가 이 플래그를 검사해 멈춘다
      if (activeWaitCancel) activeWaitCancel();   // 진행 중인 대기를 즉시 종료
      return;
    }
    if (!workspace) { logLine('워크스페이스가 준비되지 않았습니다', 'err'); return; }
    simRunning = true; simAborted = false;
    simRunBtn.textContent = SIM_STOP_LABEL;
    simRunBtn.classList.add('running');
    logLine('──── 시뮬레이션 시작 ────', 'sys');
    try {
      await CommandExecutor.simulateWorkspace(workspace, simSink);
      logLine(simAborted ? '──── 비상 정지 ────' : '──── 시뮬레이션 종료 ────', 'sys');
    } catch (e) {
      logLine('오류: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      simRunning = false;
      simRunBtn.textContent = SIM_RUN_LABEL;
      simRunBtn.classList.remove('running');
      // 비상 정지 시 진행 중이던 효과(LED·레이더)를 즉시 정리한다.
      if (simAborted) {
        setAllLedsOff();
        if (sim && sim.hasRadar) sim.setRadar(false);
      }
      // 시뮬레이션 종료 시, GUN_FIRE 로 떠오른 로켓을 '발사 중지'와 동일하게 원위치로 복귀.
      // 렌더 루프가 돌고 있으므로 setRocketLaunch(false) 만으로 하강 애니메이션이 재생된다.
      if (sim && sim.hasRocket && !sim.rocketAtRest) {
        sim.setRocketLaunch(false);
        if (rocketBtn) {
          rocketBtn.classList.remove('on');
          rocketBtn.innerHTML = ROCKET_LABEL_OFF;
          rocketBtn.setAttribute('aria-pressed', 'false');
        }
      }
    }
  });
  if (simClearBtn) simClearBtn.addEventListener('click', () => { if (simLog) simLog.textContent = ''; });

  addEventListener('resize', () => { if (!card.hidden && sim) sim.resize(); });

  // 미션 뷰 콘텐츠 영역이 변하면(미션 진입/모드 전환/로그 토글 등) stage 크기도 같이 변한다.
  // ResizeObserver 로 stage 의 실제 크기를 추적해 카메라 종횡비와 렌더러 픽셀 버퍼를 동기화.
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { if (!card.hidden && sim) sim.resize(); });
    ro.observe(stage);
  }

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

  return { open, close };
}
