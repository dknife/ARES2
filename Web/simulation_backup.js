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
  // posAttr.getX/Y/Z 로 정점 좌표를 읽는다 — EXT_meshopt_compression 압축본은
  // InterleavedBufferAttribute 로 디코드되므로 array[v*3] 직접 인덱싱이 깨진다.
  function splitTris(idxArr, posAttr, isInRegion) {
    const insideTris = [], outsideTris = [];
    const triCount = idxArr.length / 3;
    for (let t = 0; t < triCount; t++) {
      const a = idxArr[t * 3], b = idxArr[t * 3 + 1], c = idxArr[t * 3 + 2];
      const allIn =
        isInRegion(posAttr.getX(a), posAttr.getY(a)) &&
        isInRegion(posAttr.getX(b), posAttr.getY(b)) &&
        isInRegion(posAttr.getX(c), posAttr.getY(c));
      (allIn ? insideTris : outsideTris).push(a, b, c);
    }
    if (!insideTris.length) return null;
    let cx = 0, cy = 0, cz = 0, n = 0;
    const used = new Set(insideTris);
    for (const v of used) { cx += posAttr.getX(v); cy += posAttr.getY(v); cz += posAttr.getZ(v); n++; }
    return { insideTris, outsideTris, centroid: { x: cx / n, y: cy / n, z: cz / n } };
  }

  for (const mesh of meshes) {
    const geom = mesh.geometry;
    const posAttr = geom.getAttribute('position');
    if (!geom.getIndex() || !posAttr) continue;
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
    let split = splitTris(geom.getIndex().array, posAttr, isAntenna);
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
    split = splitTris(geom.getIndex().array, posAttr, isRocket);
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
        const x = posAttr.getX(v), y = posAttr.getY(v), z = posAttr.getZ(v);
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
  // 로버 — RoverParts/ 안의 부속 GLB 6종을 그대로 원점에 올려 배치 작업에 쓰는 토픽.
  // 단일 model 이 아니라 parts 배열로 로드한다. 각 GLB 의 원점/스케일을 보정 없이 유지하므로
  // 부속의 상대 위치를 그대로 확인할 수 있다. helpers: true 면 0.1 간격 그리드 + 길이 1 축을 추가.
  rover: { label: '로버', eyes: null, helpers: true, parts: [
    'Mesh/RoverParts/RoverBody.glb',   // 본체 — 1배 스케일 유지
    'Mesh/RoverParts/RoverGun.glb',
    'Mesh/RoverParts/RoverHead.glb',
    'Mesh/RoverParts/RoverLED.glb',
    'Mesh/RoverParts/RoverOLED.glb',
    'Mesh/RoverParts/RoverRadar.glb',
    'Mesh/RoverParts/RoverWheel.glb',
  ] },
};
const TOPIC_ORDER = ['albi', 'traffic', 'launchpad', 'rover'];
const DEFAULT_TOPIC = 'albi';
// 미션별 기본 주제(현재는 모두 기본값 사용). 'L{차시}M{미션}' → topic key
const MISSION_TOPIC = {};
function defaultTopicForMission() {
  const l = document.getElementById('lessonSelect')?.value || '';
  const m = document.getElementById('missionSelect')?.value || '';
  return MISSION_TOPIC[`L${l}M${m}`] || DEFAULT_TOPIC;
}

// OLED 아이콘 32×32 비트맵 — Pico/icon.py 의 mars_rover32x32 / cute_robot32x32 와
// 1:1 동일 (1바이트 = 8 수평 픽셀, MSB 가 좌측). ICON,name,x,y 명령의 name 키와 매핑.
const OLED_ICONS = {
  rover: new Uint8Array([
    0x00,0x01,0xC0,0x00, 0x00,0x01,0xC0,0x00, 0x00,0x01,0xC0,0x00, 0x1F,0xFF,0xFF,0xF8,
    0x1F,0xFF,0xFF,0xF8, 0x1E,0x07,0xE0,0x78, 0x1E,0xE7,0xE7,0x78, 0x1E,0x17,0xE8,0x78,
    0x1E,0x07,0xE0,0x78, 0x1E,0x07,0xE0,0x78, 0x1C,0xFF,0xFF,0x38, 0x1F,0x7F,0xFE,0xF8,
    0x1F,0x8F,0xF1,0xF8, 0x1F,0xF0,0x0F,0xF8, 0x1E,0xFF,0xFF,0x78, 0x1E,0xFF,0xFF,0x78,
    0x1E,0xFF,0xFF,0x78, 0x00,0xFF,0x7F,0x00, 0x1F,0xFF,0x7F,0xF8, 0x1F,0xFC,0x9F,0xF8,
    0x1F,0xF9,0xCF,0xF8, 0x1F,0xF0,0x07,0xF8, 0x1F,0xE7,0xF3,0xF8, 0x1F,0xE7,0xF3,0xF8,
    0x1F,0xFF,0xFF,0xF8, 0x1F,0xFF,0xFF,0xF8, 0x1F,0xC0,0x03,0xF8, 0x1F,0xC0,0x03,0xF8,
    0x1F,0xC0,0x03,0xF8, 0x1F,0xC0,0x03,0xF8, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
  ]),
  mars: new Uint8Array([
    0x00,0x00,0x00,0x00, 0x0C,0x00,0x00,0x00, 0x0C,0x00,0x7E,0x00, 0x0C,0x01,0xFE,0x00,
    0x0C,0x03,0xFF,0x00, 0x06,0x07,0xFF,0x80, 0x03,0x0F,0xFF,0xC0, 0x00,0xFF,0xFF,0xE0,
    0x00,0x1F,0xFF,0xE0, 0x00,0x3F,0xFF,0xF0, 0x00,0x3F,0xFF,0xF0, 0x00,0x3E,0x01,0xF0,
    0x00,0x3C,0x00,0xF0, 0x00,0x3C,0x78,0x70, 0x00,0x3C,0xF8,0x70, 0x00,0x3C,0xF8,0x70,
    0x00,0x3C,0x78,0x70, 0x00,0x3C,0x00,0x70, 0x00,0x3C,0x00,0x70, 0x00,0x3C,0x00,0x70,
    0x00,0x3C,0x00,0x70, 0x00,0x3F,0xFF,0xF0, 0x00,0x3F,0xFF,0xF0, 0x00,0x1F,0xFF,0xE0,
    0x00,0x07,0xFF,0xC0, 0x00,0x03,0xFF,0x80, 0x00,0x01,0xFE,0x00, 0x00,0x00,0x7E,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
  ]),
  open_eye: new Uint8Array([
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0xFF,0xFF,0x00, 0x07,0x00,0x00,0xE0,
    0x18,0x00,0x00,0x18, 0x20,0x00,0x00,0x04, 0x40,0x00,0x00,0x02, 0x80,0x00,0x00,0x01,
    0x80,0x03,0xE0,0x01, 0x80,0x07,0xF0,0x01, 0x80,0x0F,0xF8,0x01, 0x80,0x0F,0xF8,0x01,
    0x80,0x0F,0xF8,0x01, 0x80,0x0F,0xF8,0x01, 0x80,0x07,0xF0,0x01, 0x80,0x03,0xE0,0x01,
    0x80,0x00,0x00,0x01, 0x40,0x00,0x00,0x02, 0x20,0x00,0x00,0x04, 0x18,0x00,0x00,0x18,
    0x07,0x00,0x00,0xE0, 0x00,0xFF,0xFF,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
  ]),
  closed_eye: new Uint8Array([
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x01,0xFF,0xFF,0x80, 0x07,0x00,0x00,0xE0, 0x18,0x00,0x00,0x18, 0x20,0x00,0x00,0x04,
    0x40,0x00,0x00,0x02, 0x80,0x00,0x00,0x01, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
  ]),
};

// 카드 안에 3D 씬을 구성해 { render, resize, setEye, dispose, hasEyes, eyeL, eyeR,
//   hasTraffic, placeLamps, placeHands, resetTraffic } 반환
function buildSim(THREE, A, stage, loadingEl, cfg) {
  const { GLTFLoader, OrbitControls, RoomEnvironment } = A;
  // Meshopt 압축 GLB(EXT_meshopt_compression) 로드용 디코더.
  // 디코더가 있으면 압축본, 없으면 원본 GLB만 로드 가능 — 양쪽 모두 호환.
  function makeGLTFLoader() {
    const loader = new GLTFLoader();
    const md = window.MeshoptDecoder;
    if (md) loader.setMeshoptDecoder(md);
    return loader;
  }
  const EYE    = cfg.eyes   || null; // 눈 LED 설정 (없으면 null)
  const CHEST  = cfg.chest  || null; // 가슴 LED 설정 (없으면 null)
  const LAUNCH = cfg.launch || null; // 발사대 LED 설정 (구체 5개 + 도넛 1개)
  const TRAFFIC = cfg.traffic || null; // 우주 신호등 설정 (LampBox 위 LampGeneral / LampHandN)
  let planeGrids = null;               // 좌표 평면(XY/YZ/ZX) 0.1 그리드 그룹 — g 키 토글 (helpers 토픽만)
  const roverLeds = [];                // 로버 LED0~LED5 투명 구 (점등 hook)
  let magSensorBall = null;            // 로버 자기 센서 동작 표시 투명 구
  const irSensorBalls = [];            // 로버 적외선 센서 동작 표시 투명 구 2개
  let worldGroup = null;               // 로버를 제외한 바닥·그리드 묶음 — 로버 전·후진 시 반대 방향으로 이동
  let wheelR = null, wheelL = null;    // 로버 좌·우 바퀴 (전·후진 시 회전)
  const boxes = [];                    // 바닥 위 박스(장애물) — 로버와의 충돌 판정 대상

  // 로버 OLED 가상 화면 — 실제 SSD1306 과 동일하게 128×64 픽셀로 가정한다.
  // 글자 한 칸은 8×8 픽셀 (16자 × 8줄). 캔버스는 OLED 픽셀 1 → canvas 4 픽셀로 확대(=512×256)
  // 해서 PlaneGeometry 텍스처로 입힌다. (firmware: framebuf.text 의 8×8 폰트와 1:1 매핑)
  const OLED_W = 128, OLED_H = 64;
  const OLED_SCALE = 4;                  // 1 OLED px = 4 canvas px
  const OLED_CHAR_W = 8, OLED_CHAR_H = 8;
  let oledCanvas = null;                 // <canvas> — 텍스처 백킹
  let oledCtx = null;                    // 2D 컨텍스트
  let oledTex = null;                    // THREE.CanvasTexture (변경 시 needsUpdate)

  // 로버 총(RoverGun.glb) GUN_FIRE 효과 — 총구 플래시 + 스파크 + 짧은 점광원, 폭발음.
  // 총은 roverGroup 안에 부착되어 위치가 고정되므로(로버는 worldGroup만 움직임),
  // 모델 로딩 시 bbox 에서 가장 긴 축의 절대값이 큰 끝점을 총구로 캐시한다.
  let gunMesh = null;                    // RoverGun.glb 의 root (참조 보유 / hasGun 판정)
  let muzzleFlash = null;                // 그룹 컨테이너 (sphere + light + sparks)
  let muzzleFlashSphere = null;          // 핵심 플래시 구
  let muzzleFlashLight = null;           // 짧은 점광원
  const muzzleSparks = [];               // [{ mesh, vel, age }] — 튀어나가는 스파크 입자
  let muzzleFlashT = 0;                  // 0 = 비활성, >0 = 경과 시간(초)
  const MUZZLE_DUR = 0.35;               // 350ms 동안 플래시 + 스파크 유지
  const muzzleWorldPos = new THREE.Vector3();    // 캐시된 총구 위치(월드)
  const muzzleForward = new THREE.Vector3();     // 캐시된 발사 방향(월드, 단위벡터)
  // 총구 연기 — 발사 직후 짧은 시간 동안 puff 들을 연속 분출, 월드 좌표로 떠다닌다.
  let gunSmokeGroup = null;              // scene 에 부착되는 컨테이너 (총·로버 변환 영향 X)
  const gunSmokePool = [];               // { sprite, active, age, life, vel, scale0, scaleMax, rot, rotSpeed }
  const GUN_SMOKE_POOL = 18;             // 풀 크기 (동시에 떠 있을 수 있는 최대 puff 수)
  const GUN_SMOKE_BURST = 12;            // 발사 1회당 분출 puff 개수
  const GUN_SMOKE_BURST_DUR = 0.18;      // 분출이 퍼지는 시간 — 180ms 동안 12개를 흩뿌림
  let gunSmokeRemaining = 0;             // 이번 발사에서 아직 분출되지 않은 puff 개수
  let gunSmokeAcc = 0;                   // 분출 진행 시간 누적
  const BOX_SPAWN_RANGE = 50;          // 박스 랜덤 분포 범위(±) — 최초 배치·재배치 공용
  const BOX_CLEAR_R = 5;               // 로버(원점) 주위 이 반경 안에는 박스를 두지 않는다
  let obstaclesOn = true;              // 장애물(박스) 설치 여부 — 제거하면 충돌·거리감지에서도 빠진다

  // dispose() 이후 도착하는 비동기 GLB 로드 콜백 차단용 플래그.
  // (토픽 전환 중 로드가 끝나면 죽은 씬에 추가되어 영영 해제되지 않고,
  //  공유 DOM인 loadingEl 을 건드려 새 토픽의 로딩 표시를 조기에 숨긴다.)
  let disposed = false;
  // 로드됐지만 쓰이지 못한 GLB 의 GPU 자원 해제
  function disposeObject3D(root) {
    root.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
      }
    });
  }

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
  key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0003;
  // 그림자 카메라(ortho) 기본 프러스텀(±5)은 너무 좁아 박스 그림자가 잘려 안 보인다.
  // 박스 분포(±50) 전체를 덮도록 크게 넓혀, 멀리 흩어진 박스들의 그림자도 바닥에 그려지게 한다.
  key.shadow.camera.left = -55; key.shadow.camera.right = 55;
  key.shadow.camera.top = 55;   key.shadow.camera.bottom = -55;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 140;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc0f0, 0.5);
  fill.position.set(-4, 2, 4); scene.add(fill);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // 배치 보조용 헬퍼 — 로버처럼 부속을 좌표상에서 정렬해야 하는 토픽에서만 켠다.
  //   - 그리드가 그려진 회색 바닥(XZ 평면) — 선은 1 간격 (size=10 / divisions=10)
  //   - AxesHelper(1): 원점에 X(빨강)/Y(초록)/Z(파랑) 각 길이 1
  if (cfg.helpers) {
    const FLOOR_SIZE = 100;                                           // 100×100 → 1 간격 격자
    // 회색 바닥 — 그림자 전용 ground 바로 아래에 깔아 색이 비치도록.
    // polygonOffset(+) 으로 깊이값을 뒤로 밀어 동일 평면의 다른 물체에 늘 가려지게(Z파이팅에서 지게) 한다.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
      new THREE.MeshStandardMaterial({
        color: 0x3a3a3a, roughness: 0.95, metalness: 0.0,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      }),
    );
    floor.rotation.x = -Math.PI / 2;                                  // y=0 바닥(XZ 평면)
    floor.position.y = -0.001;                                        // 그림자 ground 와 z-fight 방지
    floor.receiveShadow = true;
    floor.renderOrder = -1;                                           // 가장 먼저 그려 다른 물체가 위에 보이도록
    // 1 간격 그리드 선만 표시 (좌표 평면 벽 그리드는 제거).
    const grid = new THREE.GridHelper(FLOOR_SIZE, FLOOR_SIZE, 0x444444, 0x666666);
    grid.position.y = 0.002;                                          // 바닥 위로 살짝 띄워 z-fight 방지
    // 바닥+그리드를 worldGroup 으로 묶는다 — 로버 전·후진은 이 그룹을 반대로 움직여 표현하고,
    // 좌표축(axes)·평면 그리드는 로버와 함께 머물게 두어 좌표계가 늘 로버에 고정되게 한다.
    worldGroup = new THREE.Group();
    worldGroup.add(floor, grid);
    // 바닥 위 장애물 — 폭 1 × 높이 2 박스를 랜덤 위치에 배치한다(바닥에 닿도록 중심 y=1).
    //   worldGroup 에 넣어 로버 전·후진·회전 시 바닥과 함께 움직인다. 로버 근처(반경 2)는 피한다.
    {
      const BOX_COUNT = 150;
      const boxGeom = new THREE.BoxGeometry(1, 2, 1);
      for (let i = 0; i < BOX_COUNT; i++) {
        let x = 0, z = 0;
        do {
          x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
          z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        } while (Math.hypot(x, z) < BOX_CLEAR_R); // 로버 자리(원점 주위)는 비운다
        const box = new THREE.Mesh(
          boxGeom,
          new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.55, 0.5), roughness: 0.8, metalness: 0.0 }),
        );
        box.position.set(x, 1, z);
        box.castShadow = true;
        box.receiveShadow = true;
        worldGroup.add(box);
        boxes.push(box);             // 충돌 판정용
      }
    }
    scene.add(worldGroup);
    const axes = new THREE.AxesHelper(1);
    axes.position.y = 0.003;                                          // 바닥/그리드 와 z-fight 방지
    scene.add(axes);

    // 좌표 평면 그리드(XY · YZ · ZX) — 0.1 간격 (size=2 / divisions=20).
    // g 키 토글로만 보이며, 기본은 숨김.
    const makePlaneGrid = () => new THREE.GridHelper(2, 20, 0x888888, 0x444466);
    const gridXZ = makePlaneGrid();                                   // ZX 평면 (y=0 바닥, GridHelper 기본 방향)
    const gridXY = makePlaneGrid(); gridXY.rotation.x = Math.PI / 2;  // XY 평면 (z=0, X축 기준 90° 세움)
    const gridYZ = makePlaneGrid(); gridYZ.rotation.z = Math.PI / 2;  // YZ 평면 (x=0, Z축 기준 90° 세움)
    planeGrids = new THREE.Group();
    planeGrids.add(gridXZ, gridXY, gridYZ);
    planeGrids.visible = false;
    scene.add(planeGrids);
  }

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
  // 로버 LED0~LED5 — 켜지면 해당 구가 초록색으로 빛난다(emissive 초록 + 불투명도↑). 0이면 투명 흰색 복귀.
  function setRoverLed(num, value) {
    const ball = roverLeds[num];
    if (!ball) return;
    const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : (value ? 1 : 0);
    const m = ball.material;
    if (v > 0) {
      // 채도 우선: 발광량을 낮춰 ACES 톤매핑의 흰빛 날림을 줄이고, 순수 초록 + 높은 불투명도로
      // 색이 또렷하게 보이게 한다(밝기는 약간 낮아짐).
      m.color.setHex(0x00ff22);
      m.emissive.setHex(0x00ff22);
      m.emissiveIntensity = 0.9 * v;
      m.opacity = 0.6 + 0.4 * v;      // 켜질수록 또렷·불투명(본래 색 보존)
    } else {
      m.color.setHex(0xffffff);
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      m.opacity = 0.25;               // 점등 전 투명 흰색
    }
  }

  // OLED 그리기 헬퍼 — buildSim 스코프의 oledCanvas/oledCtx/oledTex 를 직접 갱신.
  // 좌표는 모두 OLED 픽셀(0..127, 0..63) 기준이며 내부에서 ×OLED_SCALE 로 캔버스에 매핑.
  function oledClear() {
    if (!oledCtx) return;
    oledCtx.fillStyle = '#000814';                                  // 어두운 남색 = OFF 픽셀
    oledCtx.fillRect(0, 0, oledCanvas.width, oledCanvas.height);
    if (oledTex) oledTex.needsUpdate = true;
  }
  function oledClearRect(x, y, w, h) {
    if (!oledCtx) return;
    // 화면 경계로 자르기 (펌웨어 framebuf.fill_rect 와 동일한 클리핑 동작)
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(OLED_W, x + w), y1 = Math.min(OLED_H, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    oledCtx.fillStyle = '#000814';
    oledCtx.fillRect(x0 * OLED_SCALE, y0 * OLED_SCALE, (x1 - x0) * OLED_SCALE, (y1 - y0) * OLED_SCALE);
    if (oledTex) oledTex.needsUpdate = true;
  }
  function oledText(x, y, text) {
    if (!oledCtx) return;
    oledCtx.fillStyle = '#7dffff';                                  // 시안색 = ON 픽셀 (단색 SSD1306 톤)
    oledCtx.font = `bold ${OLED_CHAR_H * OLED_SCALE}px monospace`;  // 폰트 높이 = 8 OLED px = 32 canvas px
    oledCtx.textAlign = 'left'; oledCtx.textBaseline = 'top';
    const s = String(text);
    // 각 글자를 8 OLED 픽셀 간격으로 강제 배치 — 실제 framebuf.text 와 동일한 monospace 셀.
    for (let i = 0; i < s.length; i++) {
      const ox = x + i * OLED_CHAR_W;
      if (ox >= OLED_W) break;                                      // 우측 경계 넘으면 잘림(펌웨어 동작과 동일)
      oledCtx.fillText(s[i], ox * OLED_SCALE, y * OLED_SCALE);
    }
    if (oledTex) oledTex.needsUpdate = true;
  }
  function oledIcon(name, x, y) {
    if (!oledCtx) return;
    const bm = OLED_ICONS[name];
    if (!bm) return;
    oledCtx.fillStyle = '#7dffff';
    // 비트맵은 32×32, 1바이트 = 8 수평 픽셀(MSB 가 좌측). icon.py 의 buff 포맷과 동일.
    for (let row = 0; row < 32; row++) {
      for (let bc = 0; bc < 4; bc++) {
        const byte = bm[row * 4 + bc];
        if (!byte) continue;
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (1 << (7 - bit))) {
            const px = x + bc * 8 + bit;
            const py = y + row;
            if (px >= 0 && px < OLED_W && py >= 0 && py < OLED_H) {
              oledCtx.fillRect(px * OLED_SCALE, py * OLED_SCALE, OLED_SCALE, OLED_SCALE);
            }
          }
        }
      }
    }
    if (oledTex) oledTex.needsUpdate = true;
  }

  // 총구 플래시 자원 lazy 생성 — 첫 발사 시점에 한 번 만들어 두고 재사용.
  function ensureMuzzleFlash() {
    if (muzzleFlash || !gunMesh) return;
    muzzleFlash = new THREE.Group();
    muzzleFlashSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffd980, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    muzzleFlash.add(muzzleFlashSphere);
    muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 3, 2);
    muzzleFlash.add(muzzleFlashLight);
    for (let i = 0; i < 12; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 6, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffeeaa, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      muzzleFlash.add(spark);
      muzzleSparks.push({ mesh: spark, vel: new THREE.Vector3(), age: 0 });
    }
    scene.add(muzzleFlash);
    muzzleFlash.visible = false;
  }
  // GUN_FIRE — 총구 위치에 플래시·라이트·스파크 발생시키고 폭발음 재생.
  function setGunFire() {
    if (!gunMesh) return;
    ensureMuzzleFlash();
    muzzleFlash.position.copy(muzzleWorldPos);
    // 스파크 초기화 — 총구 앞으로 산란하며 튀어나간다.
    for (const sp of muzzleSparks) {
      sp.mesh.position.set(0, 0, 0);
      const speed = 1.0 + Math.random() * 1.6;
      sp.vel.copy(muzzleForward).multiplyScalar(speed);
      sp.vel.x += (Math.random() - 0.5) * 0.8;
      sp.vel.y += (Math.random() - 0.5) * 0.6;
      sp.vel.z += (Math.random() - 0.5) * 0.8;
      sp.age = 0;
      sp.mesh.material.opacity = 1;
    }
    muzzleFlashT = 0.0001;            // 활성화 (0 이 아님)
    muzzleFlash.visible = true;
    // 격발음(playGunFire)은 buildSim 스코프 밖(setupSimulation)에 있어 여기서 호출 불가 —
    // applyTopicEffect 에서 setGunFire 호출 직후 별도로 재생한다(playRocketLaunch 패턴과 동일).
    // 총구 연기 분출 시작 — updateGunSmoke 가 BURST_DUR 동안 puff 들을 흩뿌린다.
    gunSmokeRemaining = GUN_SMOKE_BURST;
    gunSmokeAcc = 0;
  }
  // 매 프레임 호출 — 플래시·스파크의 시간적 변화 처리.
  function updateMuzzleFlash(dt) {
    if (muzzleFlashT <= 0 || !muzzleFlash) return;
    muzzleFlashT += dt;
    if (muzzleFlashT >= MUZZLE_DUR) {
      muzzleFlashT = 0;
      muzzleFlash.visible = false;
      return;
    }
    const t = muzzleFlashT / MUZZLE_DUR;   // 0..1 정규화 진행도
    // 메인 플래시: 즉시 최대 → (1-t)^2 로 가파르게 감쇠, 크기는 조금 부풀림.
    const flashI = (1 - t) * (1 - t);
    muzzleFlashSphere.material.opacity = flashI * 0.95;
    muzzleFlashSphere.scale.setScalar(0.7 + t * 1.8);
    muzzleFlashLight.intensity = 5 * flashI;
    // 스파크: 속도 적용 + 마찰 감속 + 약한 중력 + 0.3초 동안 페이드아웃.
    for (const sp of muzzleSparks) {
      sp.age += dt;
      sp.mesh.position.add(sp.vel.clone().multiplyScalar(dt));
      sp.vel.multiplyScalar(0.92);
      sp.vel.y -= 2.5 * dt;
      sp.mesh.material.opacity = Math.max(0, 1 - sp.age / 0.3);
    }
  }

  // 총구 연기 풀 — 발사 시 한 번 만들고 재사용. makeSmokeTex 는 로켓 연기와 동일한 텍스처를 공유.
  function ensureGunSmoke() {
    if (gunSmokeGroup || !gunMesh) return;
    if (!smokeTex) smokeTex = makeSmokeTex();   // 로켓이 먼저 만들지 않았다면 여기서
    gunSmokeGroup = new THREE.Group();
    scene.add(gunSmokeGroup);                    // 월드 좌표 — 로버가 움직여도 연기는 그 자리에 떠 있음
    for (let i = 0; i < GUN_SMOKE_POOL; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, color: 0xd8dde6, transparent: true,
        depthWrite: false, opacity: 0,           // 약간 회색 — 화약 연기 톤
      }));
      sp.visible = false;
      gunSmokeGroup.add(sp);
      gunSmokePool.push({ sprite: sp, active: false, age: 0, life: 1, vel: new THREE.Vector3(),
                          scale0: 0.06, scaleMax: 0.5, rot: 0, rotSpeed: 0 });
    }
  }
  // 총구 위치에서 puff 하나 분출 — 발사 방향으로 흩날리며 천천히 떠오르고 퍼진다.
  function spawnGunSmoke() {
    const p = gunSmokePool.find((q) => !q.active);
    if (!p) return;
    p.active = true; p.age = 0;
    p.life = 1.2 + Math.random() * 0.9;          // 1.2 ~ 2.1초 동안 살아있음
    // 시작 위치 — 총구 위치에 약간의 산란
    p.sprite.position.copy(muzzleWorldPos);
    p.sprite.position.x += (Math.random() - 0.5) * 0.06;
    p.sprite.position.y += (Math.random() - 0.5) * 0.06;
    p.sprite.position.z += (Math.random() - 0.5) * 0.06;
    // 속도 — 총구 forward 로 빠르게 + 측방 산란 + 약한 부양
    const spd = 0.7 + Math.random() * 0.5;
    p.vel.copy(muzzleForward).multiplyScalar(spd);
    p.vel.x += (Math.random() - 0.5) * 0.45;
    p.vel.y += 0.15 + Math.random() * 0.25;
    p.vel.z += (Math.random() - 0.5) * 0.45;
    p.scale0  = 0.08 + Math.random() * 0.08;
    p.scaleMax = 0.45 + Math.random() * 0.45;    // 약 0.45~0.9 까지 팽창 (로켓보다 작음)
    p.rot = Math.random() * Math.PI * 2;
    p.rotSpeed = (Math.random() - 0.5) * 1.2;
    p.sprite.material.opacity = 0;
    p.sprite.material.rotation = p.rot;
    p.sprite.scale.set(p.scale0, p.scale0, 1);
    p.sprite.visible = true;
  }
  function updateGunSmoke(dt) {
    ensureGunSmoke();
    if (!gunSmokeGroup) return;
    // 분출 — gunSmokeRemaining 가 0 보다 클 때만, BURST_DUR 동안 균등 간격으로 흩뿌림.
    if (gunSmokeRemaining > 0) {
      gunSmokeAcc += dt;
      const alreadySpawned = GUN_SMOKE_BURST - gunSmokeRemaining;
      const targetSpawned = Math.min(GUN_SMOKE_BURST, Math.ceil(GUN_SMOKE_BURST * gunSmokeAcc / GUN_SMOKE_BURST_DUR));
      let toSpawn = targetSpawned - alreadySpawned;
      while (toSpawn-- > 0 && gunSmokeRemaining > 0) {
        spawnGunSmoke();
        gunSmokeRemaining--;
      }
    }
    // 활성 puff 갱신 — 팽창·이동·페이드.
    for (const p of gunSmokePool) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { p.active = false; p.sprite.visible = false; continue; }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));     // 공기 저항 — 로켓보다 빠르게 멈춤
      p.vel.y += 0.4 * dt;                                  // 연기는 위로 떠오름
      const grow = 1 - (1 - t) * (1 - t);                   // ease-out 팽창
      const s = p.scale0 + (p.scaleMax - p.scale0) * grow;
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = Math.min(1, t * 8) * (1 - t) * 0.7;
      p.rot += p.rotSpeed * dt;
      p.sprite.material.rotation = p.rot;
    }
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
    makeGLTFLoader().load(cfg.model, (gltf) => {
      if (disposed) { disposeObject3D(gltf.scene); return; }
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
      if (loadingEl && !disposed) loadingEl.textContent = '모델을 불러오지 못했어요 (HTTP 서버에서 실행해야 합니다)';
    });
  } else if (cfg.parts && cfg.parts.length) {
    // 부속 GLB 다중 로드 — 각 파일의 원점/스케일을 그대로 유지해 좌표 그대로 씬에 추가.
    // (모델 정렬·중앙 정렬 없음 — 배치 작업용 뷰)
    // 헬퍼(그리드/축)는 scene 에 그대로 두고, 로버 부속만 roverGroup 으로 묶어 전체를 한 번에 이동.
    const loader = makeGLTFLoader();
    const roverGroup = new THREE.Group();
    roverGroup.position.y = 0.4;     // 전체 로버를 y +0.4 만큼 들어올림
    scene.add(roverGroup);

    // LED0~LED5 자리 — 점등될 위치를 표시하는 투명한 공 6개.
    //   중심: y=0.8, z=0.25 고정 / x 는 LED0(-0.4)~LED5(0.4) 등간격(step 0.16) / 반지름 0.05.
    {
      // roverGroup 이 y +0.4 들려 있으므로, 월드 y≈0.8 이 되도록 로컬 y 는 0.4 로 둔다.
      const LED_COUNT = 6, LED_X0 = -0.4, LED_X1 = 0.4, LED_Y = 0.4, LED_Z = 0.25, LED_R = 0.05;
      const step = (LED_X1 - LED_X0) / (LED_COUNT - 1);
      const ledGeom = new THREE.SphereGeometry(LED_R, 16, 12);
      for (let i = 0; i < LED_COUNT; i++) {
        const ball = new THREE.Mesh(
          ledGeom,
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
        );
        ball.position.set(LED_X0 + step * i, LED_Y, LED_Z);
        roverGroup.add(ball);
        roverLeds.push(ball);   // 추후 점등 hook (LED0..LED5)
      }
      // 자기 센서 동작 표시 구 — LED 와 같은 크기(반지름 0.05).
      //   월드 (0, 0.1, 0.9) 가 되도록 로컬 y 는 0.1 - 0.4 = -0.3.
      magSensorBall = new THREE.Mesh(
        ledGeom,
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
      );
      magSensorBall.position.set(0, -0.3, 0.9);
      roverGroup.add(magSensorBall);
      // 적외선 센서 동작 표시 구 2개 — LED 와 같은 크기(반지름 0.05).
      //   월드 (±0.22, 0.98, 0.1) 가 되도록 로컬 y 는 0.98 - 0.4 = 0.58.
      [-0.22, 0.22].forEach((x) => {
        const ball = new THREE.Mesh(
          ledGeom,
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
        );
        ball.position.set(x, 0.58, 0.1);
        roverGroup.add(ball);
        irSensorBalls.push(ball);
      });
    }
    let remaining = cfg.parts.length;
    cfg.parts.forEach((url) => {
      loader.load(url, (gltf) => {
        if (disposed) { disposeObject3D(gltf.scene); return; }
        const root = gltf.scene;
        // RoverBody 는 본체라 1.0 그대로, 나머지 부속은 본체 기준으로 비율을 맞추기 위해 1/2 축소.
        if (!/RoverBody\.glb$/.test(url)) root.scale.setScalar(0.5);
        root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        if (/RoverWheel\.glb$/.test(url)) {
          // 바퀴는 좌·우 한 쌍을 둔다. 먼저 현재 스케일(=0.5)에서 0.8 추가 축소(→최종 0.4),
          // y축 기준 90° 회전 → 휠 축이 x 방향을 향함. 그 뒤 x = ±0.7 로 평행 이동해 본체 양옆에 배치.
          // (clone 은 deep 이라 scale/머티리얼 공유)
          root.scale.multiplyScalar(0.8);
          wheelR = root;
          wheelL = root.clone();
          wheelR.rotation.y = Math.PI / 2;
          wheelL.rotation.y = Math.PI / 2;
          wheelR.position.set( 0.7, 0, -0.3);
          wheelL.position.set(-0.7, 0, -0.3);
          roverGroup.add(wheelR, wheelL);
        } else if (/RoverRadar\.glb$/.test(url)) {
          // 레이더: 현재 스케일(=0.5) × 0.5 × 0.8 → 최종 0.20. 위치는 (0, 0.5, -0.9).
          root.scale.multiplyScalar(0.5);
          root.scale.multiplyScalar(0.8);
          root.position.set(0, 0.5, -0.9);   // z = -0.7 - 0.2
          // DC 모터 명령(DC_FORWARD/BACKWARD/tFORWARD/tBACKWARD)이 이 레이더를 로컬 y축으로 회전.
          antennaPivot = root;
          roverGroup.add(root);
        } else if (/RoverLED\.glb$/.test(url)) {
          root.position.set(0, 0.35, 0.2);   // y = -0.15 + 0.5,  z = 0.1 + 0.1
          root.rotation.x = Math.PI / 4;
          roverGroup.add(root);
        } else if (/RoverHead\.glb$/.test(url)) {
          root.position.set(0, 0.6, -0.3);   // y = 0.8 - 0.2,  z = 0 - 0.3
          root.rotation.y = Math.PI;         // y축 기준 180°
          roverGroup.add(root);
        } else if (/RoverGun\.glb$/.test(url)) {
          root.position.set(0.55, 0.5, -0.5);
          root.rotation.y = Math.PI / 2;     // y축 기준 90°
          roverGroup.add(root);
          gunMesh = root;
          // 총구 위치/방향 캐시 — 변환이 적용된 월드 bbox 에서 가장 긴 축을
          // 총신으로 보고, 원점에 더 가까운(=로버 바깥쪽 반대편, 즉 실제 총구) 끝점을 잡는다.
          // (이전에 '원점에서 더 먼 쪽' 으로 잡았다가 총신 반대편에서 발사되어 뒤집음.)
          {
            const bbox = new THREE.Box3().setFromObject(root);
            const size = bbox.getSize(new THREE.Vector3());
            const center = bbox.getCenter(new THREE.Vector3());
            let ax = 0;
            if (size.y > size.x && size.y > size.z) ax = 1;
            else if (size.z > size.x) ax = 2;
            const minV = bbox.min.getComponent(ax);
            const maxV = bbox.max.getComponent(ax);
            const muzzleEnd = Math.abs(maxV) > Math.abs(minV) ? minV : maxV;   // 더 가까운 끝
            muzzleWorldPos.copy(center);
            muzzleWorldPos.setComponent(ax, muzzleEnd);
            muzzleForward.set(0, 0, 0);
            muzzleForward.setComponent(ax, Math.sign(muzzleEnd - center.getComponent(ax)) || -1);
          }
        } else if (/RoverOLED\.glb$/.test(url)) {
          root.position.set(0, 0.1, 0.5);   // y = 0.2 - 0.1
          root.rotation.x = -Math.PI / 6;   // x축 기준 -30°
          // OLED 가상 화면 — 128×64 픽셀, 8×8 글자 셀. Canvas 텍스처를 작은 평면에
          // 입혀 +Z 면에 부착. root 의 변환을 제거한 사본으로 bbox 를 구해 평면
          // 위치를 자동 결정한다. (model 의 local +Z 가 화면 정면이라는 일반적인
          // 가정 — 다른 면이라면 위치 조정 필요)
          {
            const probe = root.clone(true);
            probe.position.set(0, 0, 0); probe.rotation.set(0, 0, 0); probe.scale.set(1, 1, 1);
            const box = new THREE.Box3().setFromObject(probe);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            // 공유 canvas/texture 초기화 — buildSim 스코프 변수에 저장해 외부에서 그릴 수 있게 한다.
            oledCanvas = document.createElement('canvas');
            oledCanvas.width = OLED_W * OLED_SCALE;
            oledCanvas.height = OLED_H * OLED_SCALE;
            oledCtx = oledCanvas.getContext('2d');
            oledClear();
            oledText(0, 0, 'ARES READY');      // 부팅 화면 (firmware booting_msg 와 동일 톤)
            oledTex = new THREE.CanvasTexture(oledCanvas);
            oledTex.colorSpace = THREE.SRGBColorSpace;
            oledTex.magFilter = THREE.NearestFilter;   // 픽셀 그대로 — SSD1306 의 도트 느낌
            oledTex.minFilter = THREE.NearestFilter;
            const w = size.x * 0.85 * 0.95 * 0.95 * 0.9;   // 직전 단계에서 한 번 더 95 %, 테두리 가림 회피 위해 90 %
            const h = w * (oledCanvas.height / oledCanvas.width);
            const screen = new THREE.Mesh(
              new THREE.PlaneGeometry(w, h),
              new THREE.MeshBasicMaterial({ map: oledTex, side: THREE.DoubleSide })
            );
            // 하단 모서리 축 기준 회전을 위해 pivot 그룹 사용.
            // pivot 을 화면 하단 위치(+Z 면, y = center.y - h/2)에 두고,
            // 화면은 pivot 의 +Y 로 h/2 만큼 띄워 두면 pivot.rotation.x 가 하단 축 회전이 된다.
            //   - 음의 회전(-10°): 화면 상단이 -Z(로버 쪽)로 기운다.
            const pivot = new THREE.Group();
            pivot.position.set(center.x, center.y - h / 2, box.max.z + 0.001);
            pivot.rotation.x = -Math.PI / 12;   // 로버 쪽으로 15° (10° + 5°)
            screen.position.set(0, h / 2, 0);
            pivot.add(screen);
            root.add(pivot);
            root.userData.oledScreen = screen;   // 추후 텍스트 변경 hook
          }
          roverGroup.add(root);
        } else {
          roverGroup.add(root);
        }
        if (--remaining === 0 && loadingEl && !disposed) loadingEl.style.display = 'none';
      }, undefined, (err) => {
        console.error('부속 로드 실패:', url, err);
        if (--remaining === 0 && loadingEl && !disposed) loadingEl.style.display = 'none';
      });
    });
    // 배치용 카메라 — 그리드(2×2)와 길이 1 축이 잘 보이는 비스듬한 시점.
    frame(0.6, 2.8);
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

  // 로버 전·후진 — 로버는 제자리에 두고 worldGroup(바닥+그리드)을 반대 방향으로 흘려보내
  // 전진(+z)/후진(-z) 을 표현한다. 동시에 바퀴를 굴린다(월드 X축 회전).
  //   servoDir: +1 = 전진, -1 = 후진.
  const SERVO_WORLD_SPEED = 1.2;       // 바닥이 흐르는 속도 (단위/초) — 그리드 1칸 기준
  const SERVO_WHEEL_SPIN  = 4.0;       // 바퀴 회전 각속도 (rad/초)
  const SERVO_TURN_SPEED  = 0.9;       // 제자리 회전 각속도 (rad/초)
  const SERVO_X_AXIS = new THREE.Vector3(1, 0, 0);
  const SERVO_Y_AXIS = new THREE.Vector3(0, 1, 0);
  const SERVO_TURN_PIVOT = new THREE.Vector3(0, 0, -0.3); // 회전축: 두 바퀴 x 중점(0)·바퀴 z(-0.3) 의 수직선
  // 이동(전·후진)과 회전(좌·우)은 동시에 동작할 수 없다 — 하나를 켜면 다른 하나는 끈다.
  let servoOn = false;
  let servoDir = 1;
  function setServoMove(on, dir) {
    servoOn = !!on;
    if (servoOn) servoTurnOn = false;          // 이동 시작 시 회전 정지(상호 배타)
    if (dir !== undefined && dir !== null) servoDir = dir < 0 ? -1 : 1;
  }
  // 로버 제자리 회전(좌/우) — 로버는 고정, worldGroup 을 회전축 기준으로 반대로 돌려 표현한다.
  //   turnDir: +1 = 왼쪽, -1 = 오른쪽 (로버가 왼쪽으로 돌면 worldGroup 은 +Y 로 회전).
  let servoTurnOn = false;
  let servoTurnDir = 1;
  function setServoTurn(on, dir) {
    servoTurnOn = !!on;
    if (servoTurnOn) servoOn = false;          // 회전 시작 시 이동 정지(상호 배타)
    if (dir !== undefined && dir !== null) servoTurnDir = dir < 0 ? -1 : 1;
  }
  function stopServo() { servoOn = false; servoTurnOn = false; }
  // 충돌 판정 — 로버는 원점(0,0)에 고정. 박스(worldGroup 자식)의 월드 XZ 가 로버 반경 안으로
  // 들어오면 충돌로 본다. 가장 가까운 박스까지의 XZ 거리를 돌려준다(박스 없으면 Infinity).
  const BOX_COLLIDE_R = 1.5;           // 로버 중심 ~ 박스 중심 최소 허용 거리
  const _boxTmp = new THREE.Vector3();
  function nearestBoxDist() {
    if (!obstaclesOn) return Infinity;   // 장애물 제거 상태면 충돌 없음
    let m = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      boxes[i].getWorldPosition(_boxTmp);
      const d = Math.hypot(_boxTmp.x, _boxTmp.z);
      if (d < m) m = d;
    }
    return m;
  }
  // 박스 재배치 — worldGroup 변환(누적 이동·회전)을 초기화해 로버를 출발 상태로 되돌린 뒤,
  // 모든 박스를 새 랜덤 위치(로버 주위 BOX_CLEAR_R 는 비움)로 옮긴다. (r 키)
  function respawnBoxes() {
    if (!worldGroup) return;
    worldGroup.position.set(0, 0, 0);
    worldGroup.quaternion.identity();
    for (let i = 0; i < boxes.length; i++) {
      let x = 0, z = 0;
      do {
        x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
      } while (Math.hypot(x, z) < BOX_CLEAR_R);
      boxes[i].position.set(x, 1, z);
    }
  }
  // 장애물 설치/제거 — 박스를 보이거나 숨긴다(숨기면 충돌·거리감지에서도 제외).
  function setObstacles(on) {
    obstaclesOn = !!on;
    for (let i = 0; i < boxes.length; i++) boxes[i].visible = obstaclesOn;
  }

  // 거리 센서(전방) — DISTANCE 명령 시 RoverHead 의 두 구(irSensorBalls)를 붉게 켜고,
  // 전진(+z) 방향으로 ray 를 쏘아 박스까지의 거리를 잰다. 씬 1단위 = 10cm 이므로 ×10 하여 cm 로 반환.
  const DIST_RAY = new THREE.Raycaster();
  const DIST_DIR = new THREE.Vector3(0, 0, 1);   // 전진 방향(월드 +z)
  const _distOrigin = new THREE.Vector3();
  const DIST_NO_HIT = 999;                        // 박스가 없을 때 반환값(cm)
  function setDistanceSensor(on) {
    for (let i = 0; i < irSensorBalls.length; i++) {
      const m = irSensorBalls[i].material;
      if (on) { m.color.setHex(0xff2222); m.emissive.setHex(0xff2222); m.emissiveIntensity = 2.6; m.opacity = 0.9; }
      else    { m.color.setHex(0xffffff); m.emissive.setHex(0x000000); m.emissiveIntensity = 0;   m.opacity = 0.25; }
    }
  }
  const DIST_BOX_INFLATE = 2.0;        // 거리 검사 시 박스 폭(가로·세로)을 이 배율로 키워 검사 대상으로 삼는다
  function measureDistance() {
    if (irSensorBalls.length === 0 || !obstaclesOn) return DIST_NO_HIT;   // 장애물 없으면 감지 없음
    // 검사용으로 박스 폭을 1.5배 키운다(높이는 유지). 측정 사이엔 렌더가 없어 화면엔 안 보인다.
    for (let i = 0; i < boxes.length; i++) boxes[i].scale.set(DIST_BOX_INFLATE, 1, DIST_BOX_INFLATE);
    if (worldGroup) worldGroup.updateMatrixWorld(true);   // 박스 월드 행렬 최신화(레이캐스트 정확도)
    let minDist = Infinity;
    for (let i = 0; i < irSensorBalls.length; i++) {
      irSensorBalls[i].getWorldPosition(_distOrigin);
      DIST_RAY.set(_distOrigin, DIST_DIR);
      const hits = DIST_RAY.intersectObjects(boxes, false);
      if (hits.length && hits[0].distance < minDist) minDist = hits[0].distance;
    }
    for (let i = 0; i < boxes.length; i++) boxes[i].scale.set(1, 1, 1);   // 원래 크기로 원복
    if (!isFinite(minDist)) return DIST_NO_HIT;
    return Math.round(minDist * 10);              // 1단위=10cm → ×10 (0.1단위 → 1cm)
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

  // 로버 부저 웨이브 — BUZZER_ON 동안 두 스피커 위치에서 반구(돔) 음파가 퍼진다(발사대와 동일 컨셉).
  //   스피커는 로버에 고정(월드 좌표). 로버는 제자리이므로 웨이브 메시는 scene 에 직접 둔다.
  const ROVER_SPEAKERS = [
    new THREE.Vector3(-0.5, 0.3, 0.6),
    new THREE.Vector3( 0.5, 0.3, 0.6),
  ];
  const ROVER_WAVE_BASE_R    = 0.15;    // 스피커 반구 초기 반지름(로버 크기에 맞춰 작게)
  const ROVER_WAVE_MAX_SCALE = 7;       // 최종 스케일
  let roverWaveOn = false;
  let roverWaveSpawnTimer = 0;
  const roverWaveRings = [];
  function setRoverWave(on) {
    if (!worldGroup) return;            // 로버 주제에서만
    roverWaveOn = !!on;
    if (!roverWaveOn) roverWaveSpawnTimer = 0;
  }
  function spawnRoverWaves() {
    for (let s = 0; s < ROVER_SPEAKERS.length; s++) {
      const geom = new THREE.SphereGeometry(ROVER_WAVE_BASE_R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: WAVE_COLOR, transparent: true, opacity: WAVE_OPACITY,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(ROVER_SPEAKERS[s]);   // 스피커 위치(월드)에서 돔이 솟아오른다
      scene.add(mesh);
      roverWaveRings.push({ mesh, age: 0 });
    }
  }
  function updateRoverWaves(dt) {
    if (roverWaveOn) {
      roverWaveSpawnTimer += dt;
      while (roverWaveSpawnTimer >= WAVE_SPAWN_INTERVAL) {
        roverWaveSpawnTimer -= WAVE_SPAWN_INTERVAL;
        spawnRoverWaves();
      }
    }
    for (let i = roverWaveRings.length - 1; i >= 0; i--) {
      const r = roverWaveRings[i];
      r.age += dt;
      const t = r.age / WAVE_LIFETIME;
      if (t >= 1) {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        scene.remove(r.mesh);
        roverWaveRings.splice(i, 1);
        continue;
      }
      const scale = 1 + t * (ROVER_WAVE_MAX_SCALE - 1);
      r.mesh.scale.setScalar(scale);
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
    // 로버 전·후진 — worldGroup(바닥+그리드)을 로버 진행 방향의 반대로 흘리고, 바퀴를 굴린다.
    //   전진(servoDir +1, 로버 +z) → 바닥은 -z 로, 바퀴는 +X 축으로 회전.
    if (servoOn && worldGroup) {
      // 바퀴는 충돌 여부와 무관하게 항상 돈다(막히면 헛돎).
      const dTheta = SERVO_WHEEL_SPIN * dt * servoDir;
      if (wheelR) wheelR.rotateOnWorldAxis(SERVO_X_AXIS, dTheta);
      if (wheelL) wheelL.rotateOnWorldAxis(SERVO_X_AXIS, dTheta);
      // 이동 — 미리 적용해 보고, 가장 가까운 박스가 로버 반경 안으로 '더' 가까워지면 차단(되돌림).
      const before = nearestBoxDist();
      const savedZ = worldGroup.position.z;
      worldGroup.position.z -= SERVO_WORLD_SPEED * dt * servoDir;
      const after = nearestBoxDist();
      if (after < BOX_COLLIDE_R && after < before) worldGroup.position.z = savedZ;   // 충돌: 이동 취소
    }
    // 제자리 회전 — worldGroup 을 회전축(SERVO_TURN_PIVOT) 둘레로 돌리고, 바퀴는 좌우 반대로 굴린다.
    if (servoTurnOn && worldGroup) {
      const dSpin = SERVO_WHEEL_SPIN * dt * servoTurnDir;
      if (wheelR) wheelR.rotateOnWorldAxis(SERVO_X_AXIS, -dSpin);             // 왼쪽 회전 시 오른 바퀴 전진
      if (wheelL) wheelL.rotateOnWorldAxis(SERVO_X_AXIS,  dSpin);             // 왼 바퀴 후진
      // 회전 — 미리 적용해 보고, 박스가 로버 반경 안으로 더 가까워지면 차단(되돌림).
      const before = nearestBoxDist();
      const savedQ = worldGroup.quaternion.clone();
      const savedX = worldGroup.position.x, savedZ = worldGroup.position.z;
      // 좌(+1)/우(-1) 방향 — worldGroup 은 로버 회전의 반대로 돈다. (부호는 실제 보이는 방향에 맞춰 보정)
      const dYaw = -SERVO_TURN_SPEED * dt * servoTurnDir;
      worldGroup.rotateOnWorldAxis(SERVO_Y_AXIS, dYaw);                       // 방향(자세) 회전
      worldGroup.position.sub(SERVO_TURN_PIVOT).applyAxisAngle(SERVO_Y_AXIS, dYaw).add(SERVO_TURN_PIVOT); // 축 둘레로 위치 공전
      const after = nearestBoxDist();
      if (after < BOX_COLLIDE_R && after < before) {                          // 충돌: 회전 취소
        worldGroup.quaternion.copy(savedQ);
        worldGroup.position.x = savedX; worldGroup.position.z = savedZ;
      }
    }
    if (LAUNCH) updateLaunchWaves(dt);
    if (worldGroup) updateRoverWaves(dt);
    updateMuzzleFlash(dt);
    if (gunMesh) updateGunSmoke(dt);

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
  // 모드 문자열 비교만으로는 같은 모드 재진입(버튼 연타)을 구분하지 못해
  // 앞선 로드의 인스턴스가 고아로 남는다 — 호출마다 증가하는 토큰으로 구분.
  let trafficLoadToken = 0;
  function placeLamps() {
    if (!TRAFFIC || !trafficRoot || !trafficSlots) return;
    clearAllSlots();
    trafficMode = 'lamps';
    const myToken = ++trafficLoadToken;
    makeGLTFLoader().load(TRAFFIC.lamp, (gltf) => {
      if (disposed || myToken !== trafficLoadToken) { disposeObject3D(gltf.scene); return; }
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
    const myToken = ++trafficLoadToken;
    const n = Math.min(trafficSlots.length, TRAFFIC.hands.length);
    for (let i = 0; i < n; i++) {
      const slot = trafficSlots[i], url = TRAFFIC.hands[i], idx = i;
      makeGLTFLoader().load(url, (gltf) => {
        if (disposed || myToken !== trafficLoadToken) { disposeObject3D(gltf.scene); return; }
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
  function resetTraffic() { ++trafficLoadToken; clearAllSlots(); trafficMode = null; }

  function dispose() {
    disposed = true;                 // 진행 중인 GLB 로드 콜백 무효화
    try { controls.dispose(); } catch {}
    // 풀에 있지만 씬에 안 붙어 있는 연기 puff(Sprite) 재료/텍스처를 직접 정리.
    try {
      smokePool.forEach((p) => p.sprite?.material?.dispose?.());
      gunSmokePool.forEach((p) => p.sprite?.material?.dispose?.());
      smokeTex?.dispose?.();
      oledTex?.dispose?.();
    } catch {}
    // Sprite(LED 글로우, 로켓 화염 등)도 포함해 지오메트리·머티리얼·텍스처 해제
    scene.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
      }
    });
    // PMREM 환경맵 — traverse(isMesh)에 안 잡혀 토픽 전환마다 누적되던 누수
    try {
      scene.environment?.dispose?.();
      scene.environment = null;
      pmrem.dispose();
    } catch {}
    try { renderer.dispose(); } catch {}
    // 컨텍스트 해제를 GC에 맡기지 않는다 — 토픽을 여러 번 오가면
    // 브라우저 WebGL 컨텍스트 상한(8~16개)에 걸려 씬이 소실된다.
    try { renderer.forceContextLoss?.(); } catch {}
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  return {
    render, resize, setEye, setChest, dispose,
    hasEyes: !!EYE, get eyeL() { return eyeL; }, get eyeR() { return eyeR; },
    hasChest: !!CHEST, get chestLed() { return chestLed; },
    get hasLaunchLeds() { return !!LAUNCH && !!launchLeds; }, setLaunchLed,
    get launchLeds() { return launchLeds; },
    get hasLaunchWave() { return !!LAUNCH; }, setLaunchWave,
    get hasRoverWave() { return !!worldGroup; }, setRoverWave,
    hasTraffic: !!TRAFFIC, placeLamps, placeHands, resetTraffic, toggleSlot, setSlot: setSlotOn,
    get hasGrids() { return !!planeGrids; },
    toggleGrids() { if (planeGrids) planeGrids.visible = !planeGrids.visible; return planeGrids ? planeGrids.visible : false; },
    get hasRadar() { return !!antennaPivot; }, setRadar,
    get radarOn() { return radarOn; },
    get hasServo() { return !!worldGroup; }, setServoMove, setServoTurn, stopServo,
    get servoActive() { return servoOn || servoTurnOn; },
    get hasDistanceSensor() { return irSensorBalls.length > 0; }, setDistanceSensor, measureDistance,
    get hasBoxes() { return boxes.length > 0; }, respawnBoxes,
    get obstaclesOn() { return obstaclesOn; }, setObstacles,
    get hasRoverLeds() { return roverLeds.length > 0; }, setRoverLed,
    get hasOled() { return !!oledCanvas; },
    oledClear, oledClearRect, oledText, oledIcon,
    get hasGun() { return !!gunMesh; }, setGunFire,
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
  const ledWrap = card ? card.querySelector('.Sim_Parts-led-buttons') : null;
  const trafficWrap = card ? card.querySelector('.Sim_Parts-traffic-buttons') : null;
  const launchWrap = card ? card.querySelector('.Sim_Parts-launch-buttons') : null;
  const launchLedWrap = card ? card.querySelector('.Sim_Parts-launch-led-buttons') : null;
  const roverWrap = card ? card.querySelector('.Sim_Parts-rover-buttons') : null;
  const radarBtn  = document.getElementById('simRadar');
  const rocketBtn = document.getElementById('simRocket');
  const obstacleBtn = document.getElementById('simObstacle');
  const OBSTACLE_REMOVE  = '<span class="dot"></span>장애물 제거';   // 현재 설치됨 → 누르면 제거
  const OBSTACLE_INSTALL = '<span class="dot"></span>장애물 설치';   // 현재 제거됨 → 누르면 설치
  const simHint = document.getElementById('simHint');
  const HINT_DEFAULT = '로봇: 끌어서 회전 · 휠: 확대 · LED 버튼으로 눈·가슴 켜고 끄기';
  const HINT_TRAFFIC = '1, 2, 3번 키를 눌러 램프를 켜고 끄기';
  const HINT_LAUNCH  = '레이더 가동 · 로켓 발사 버튼을 눌러 발사대를 작동시켜 보세요';
  const HINT_ROVER   = '로버 부속 배치 보기 · 1 간격 그리드 바닥 · g 키: 0.1 평면 그리드 토글 · r 키: 박스 다시 배치';
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
    card.querySelectorAll('.Sim_Parts-led-btn').forEach((b) => b.classList.remove('on'));
    card.querySelectorAll('.Sim_Parts-launch-led-btn').forEach((b) => b.classList.remove('on'));
    card.querySelectorAll('.Sim_Parts-traffic-btn').forEach((b) => {
      // 우주 신호등은 디폴트가 "신호등(램프 배치)" 상태이므로 lamps 버튼을 on 으로 표시
      b.classList.toggle('on', !!cfg.traffic && b.dataset.action === 'lamps');
    });
    if (ledWrap) {
      ledWrap.style.display = (cfg.eyes || cfg.chest) ? '' : 'none';
      // 버튼 단위 표시 — 눈/가슴 중 설정된 쪽만 보이게.
      ledWrap.querySelectorAll('.Sim_Parts-led-btn').forEach((b) => {
        const part = b.dataset.part || 'eye';
        b.style.display = (part === 'chest' ? !!cfg.chest : !!cfg.eyes) ? '' : 'none';
      });
    }
    if (trafficWrap) trafficWrap.style.display = cfg.traffic ? '' : 'none';
    if (launchWrap) launchWrap.style.display = cfg.radar ? '' : 'none';
    if (launchLedWrap) launchLedWrap.style.display = cfg.launch ? '' : 'none';
    if (roverWrap) roverWrap.style.display = cfg.helpers ? '' : 'none';
    // 로버: 처음엔 장애물 설치 상태 → 버튼은 '장애물 제거'
    if (obstacleBtn) { obstacleBtn.classList.add('on'); obstacleBtn.innerHTML = OBSTACLE_REMOVE; }
    if (radarBtn)  { radarBtn.classList.remove('on');  radarBtn.innerHTML  = RADAR_LABEL_OFF;  radarBtn.setAttribute('aria-pressed', 'false'); }
    if (rocketBtn) { rocketBtn.classList.remove('on'); rocketBtn.innerHTML = ROCKET_LABEL_OFF; rocketBtn.setAttribute('aria-pressed', 'false'); }
    if (simHint) {
      simHint.textContent =
        cfg.traffic ? HINT_TRAFFIC :
        cfg.radar   ? HINT_LAUNCH  :
        cfg.parts   ? HINT_ROVER   : HINT_DEFAULT;
    }
    sim = buildSim(THREE, A, stage, loadingEl, cfg);
    builtTopic = topicKey;
  };

  const open = () => {
    card.hidden = false;
    // onOpen 은 호스트(main.js)에서 미션 뷰 data-mode 를 'simulation' 으로
    // 전환해 Sim_Parts-card 가 실제로 레이아웃되도록 만든다.
    // 빌드/리사이즈가 stage.clientWidth 를 읽기 *전에* 호출해야 카메라 종횡비가 맞는다.
    if (typeof onOpen === 'function') {
      try { onOpen(); } catch {}
    }
    if (!sim && sel) sel.value = defaultTopicForMission();  // 첫 오픈: 미션 기본 주제
    const t = (sel && sel.value) || DEFAULT_TOPIC;
    if (!sim || builtTopic !== t) build(t);
    sim.resize();
    cancelAnimationFrame(raf); loop();
    btn.textContent = '코드 확인';        // 누르면 시뮬레이션을 닫고 항상 블록 코딩 모드로
    btn.setAttribute('aria-pressed', 'true');
  };
  // 실제로 카드를 숨기고 렌더 루프를 멈추는 마무리 단계.
  const finalizeClose = () => {
    card.hidden = true;
    cancelAnimationFrame(raf); raf = 0;
    btn.textContent = '시뮬레이션';
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

  btn.addEventListener('click', () => { ensureAudio(); card.hidden ? open() : close(); });

  card.querySelectorAll('.Sim_Parts-led-btn').forEach((b) => {
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
    card.querySelectorAll('.Sim_Parts-traffic-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.action === which);
    });
  };
  card.querySelectorAll('.Sim_Parts-traffic-btn').forEach((b) => {
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

  // 장애물 설치/제거 — 토글. 제거하면 박스가 모두 사라지고(충돌·거리감지도 제외), 설치하면 다시 나타난다.
  if (obstacleBtn) {
    obstacleBtn.addEventListener('click', () => {
      if (!sim || !sim.hasBoxes) return;
      const next = !sim.obstaclesOn;     // true=설치, false=제거
      sim.setObstacles(next);
      obstacleBtn.classList.toggle('on', next);
      obstacleBtn.innerHTML = next ? OBSTACLE_REMOVE : OBSTACLE_INSTALL;
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
    d.className = 'Sim_Parts-log-line' + (cls ? ' ' + cls : '');
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
  // ── 오디오 언락 ────────────────────────────────────────────────
  // 모바일(iOS/Android)은 자동재생 정책상 AudioContext 가 'suspended' 로 시작하고,
  // 사용자 제스처(클릭/터치) 안에서 resume() + 무음 버퍼 재생을 해야 풀린다.
  // 비동기 시뮬레이션 실행 중(awaits 이후) 처음 소리를 내면 제스처 밖이라 막히므로,
  // 실행/열기 버튼 클릭 시점과 첫 입력에서 ensureAudio() 로 미리 풀어둔다.
  let audioCtx = null;
  const ensureAudio = () => {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { console.warn('AudioContext 생성 실패:', e); return null; }
    if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch {} }
    // 아직 'running' 이 아니면 무음(1샘플) 버퍼로 언락 시도 — 제스처 안에서 호출되면 풀린다.
    if (audioCtx.state !== 'running') {
      try {
        const b = audioCtx.createBuffer(1, 1, 22050);
        const s = audioCtx.createBufferSource();
        s.buffer = b; s.connect(audioCtx.destination); s.start(0);
      } catch {}
    }
    return audioCtx;
  };
  // 첫 사용자 입력에서 한 번 언락(안전망 — 어떤 경로로 소리가 나든 그 전에 풀리도록).
  const _unlockOnce = () => ensureAudio();
  document.addEventListener('pointerdown', _unlockOnce, { once: true, passive: true });
  document.addEventListener('touchstart', _unlockOnce, { once: true, passive: true });

  // 부저 비프 — square파로 부저 같은 음색을 내고, 끝에 짧은 페이드로 클릭 노이즈 제거.
  const playBeep = (hz, sec) => {
    if (!hz || sec <= 0) return;
    try {
      const audioCtx = ensureAudio();
      if (!audioCtx) return;
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
      const ctx = ensureAudio();
      if (!ctx) return;
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
  // 총성 — 큰 폭발음. 고역 crack(~80ms) + 저역 boom(~700ms) + 초저역 rumble(~1.1s) 합성.
  //   화이트노이즈를 highpass/lowpass/대역분리 후 가파른 attack + 긴 exp 감쇠로 단발 사운드를 만든다.
  //   매 격발이 동일하게 들리도록 다음을 보장한다:
  //     1) 노이즈 버퍼를 첫 호출 시 한 번 만들어 캐시 (콘텐츠 고정)
  //     2) 직전 발사의 소스가 아직 울리고 있으면 중단 (잔향 중첩으로 진폭 합산되는 변동 차단)
  //     3) 시작 시점에 짧은 attack 램프를 둬 0→peak 점프로 인한 클릭 위상 변동 제거
  //     4) t0 를 currentTime 보다 약간 앞에 두어 스케줄링이 항상 미래에 일어나게 함
  let gunNoiseBuffer = null;
  let activeGunSources = [];
  const playGunFire = () => {
    try {
      const ctx = ensureAudio();
      if (!ctx) return;
      const t0 = ctx.currentTime + 0.005;          // 5ms lead-in (스케줄링 안정)
      if (!gunNoiseBuffer) {
        const bufLen = Math.floor(ctx.sampleRate * 1.5);   // 1.5초 — 럼블 꼬리 수용
        gunNoiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = gunNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      }
      // 직전 발사 소스를 즉시 중단 — 잔향 중첩 차단으로 매 발이 동일하게 들린다.
      for (const s of activeGunSources) { try { s.stop(); } catch {} }
      activeGunSources = [];

      // 저역 boom — 묵직한 폭발 코어 (700ms 동안 감쇠)
      const boomSrc = ctx.createBufferSource(); boomSrc.buffer = gunNoiseBuffer;
      const boomLp = ctx.createBiquadFilter(); boomLp.type = 'lowpass'; boomLp.frequency.value = 280;
      const boomGain = ctx.createGain();
      boomSrc.connect(boomLp); boomLp.connect(boomGain); boomGain.connect(ctx.destination);
      boomGain.gain.setValueAtTime(0.0001, t0);
      boomGain.gain.linearRampToValueAtTime(0.75, t0 + 0.003);           // 3ms snap attack
      boomGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.70);

      // 고역 crack — 째지는 듯한 초기 충격음 (80ms)
      const crackSrc = ctx.createBufferSource(); crackSrc.buffer = gunNoiseBuffer;
      const crackHp = ctx.createBiquadFilter(); crackHp.type = 'highpass'; crackHp.frequency.value = 2000;
      const crackGain = ctx.createGain();
      crackSrc.connect(crackHp); crackHp.connect(crackGain); crackGain.connect(ctx.destination);
      crackGain.gain.setValueAtTime(0.0001, t0);
      crackGain.gain.linearRampToValueAtTime(0.5, t0 + 0.002);           // 2ms snap attack
      crackGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);

      // 초저역 rumble — boom 끝나갈 무렵에 살짝 더 깔리는 우르릉 꼬리 (1.1초)
      //   주파수 컷오프를 시간에 따라 더 내려서 '먼 데서 굴러가는 듯한' 잔향감.
      const rumbleSrc = ctx.createBufferSource(); rumbleSrc.buffer = gunNoiseBuffer;
      const rumbleLp = ctx.createBiquadFilter(); rumbleLp.type = 'lowpass';
      rumbleLp.frequency.setValueAtTime(160, t0);
      rumbleLp.frequency.exponentialRampToValueAtTime(70, t0 + 1.1);
      const rumbleGain = ctx.createGain();
      rumbleSrc.connect(rumbleLp); rumbleLp.connect(rumbleGain); rumbleGain.connect(ctx.destination);
      rumbleGain.gain.setValueAtTime(0.0001, t0);
      rumbleGain.gain.linearRampToValueAtTime(0.35, t0 + 0.04);          // 살짝 늦게 차오름
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.10);

      boomSrc.start(t0);   boomSrc.stop(t0 + 0.75);
      crackSrc.start(t0);  crackSrc.stop(t0 + 0.10);
      rumbleSrc.start(t0); rumbleSrc.stop(t0 + 1.15);
      activeGunSources.push(boomSrc, crackSrc, rumbleSrc);
    } catch (e) { console.warn('gun fire sound 실패:', e); }
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
    } else if (sim.hasRoverLeds) {
      if (num >= 0 && num <= 5) sim.setRoverLed(num, intensity);
    }
  };
  const setAllLedsOff = () => {
    if (sim.hasEyes)       { sim.setEye('R', 0); sim.setEye('L', 0); }
    if (sim.hasChest)      sim.setChest(0);
    if (sim.hasTraffic)    { sim.setSlot(0, 0); sim.setSlot(1, 0); sim.setSlot(2, 0); }
    if (sim.hasLaunchLeds) { for (let i = 0; i <= 5; i++) sim.setLaunchLed(i, 0); }
    if (sim.hasRoverLeds)  { for (let i = 0; i <= 5; i++) sim.setRoverLed(i, 0); }
  };
  const applyTopicEffect = (cmd) => {
    if (!sim) return null;
    // BATCH 는 simSink 에서 서브명령 단위로 순차 처리하므로 여기로 도달하지 않는다.
    // DISTANCE — 거리 센서 두 구를 붉게 켠다. 측정·반환 후(끄기) 처리는 simSink 가 cleanup 으로 수행.
    if (cmd.startsWith('DISTANCE')) {
      if (!sim.hasDistanceSensor) return null;
      sim.setDistanceSensor(true);
      return () => { if (sim) sim.setDistanceSensor(false); };
    }
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
      //   - 발사대:      지면에서 반구 음파 웨이브가 퍼져 나감
      //   - 로버:        두 스피커 위치에서 반구 음파 웨이브가 퍼져 나감
      //   - 신호등 등:   해당 사항 없음 → 부저 전체를 미처리
      const cleanups = [];
      if (sim.hasChest)      { sim.setChest(1);          cleanups.push(() => { if (sim?.hasChest)      sim.setChest(0); }); }
      if (sim.hasLaunchWave) { sim.setLaunchWave(true);  cleanups.push(() => { if (sim?.hasLaunchWave) sim.setLaunchWave(false); }); }
      if (sim.hasRoverWave)  { sim.setRoverWave(true);   cleanups.push(() => { if (sim?.hasRoverWave)  sim.setRoverWave(false); }); }
      if (cleanups.length === 0) return null;
      const parts = cmd.split(',');
      const hz  = parseFloat(parts[1]) || 0;
      const sec = parseFloat(parts[2]) || 0;
      playBeep(hz, sec);
      return () => cleanups.forEach((fn) => fn());
    }
    // 서보(로버 바퀴) — t초 동안 전진/후진. 로버는 제자리, 바닥(worldGroup)이 반대로 흐른다.
    //   SERVO_tFORWARD,t : 바퀴 앞으로 굴러 전진(+z) / SERVO_tBACKWARD,t : 뒤로(-z).
    if (cmd.startsWith('SERVO_tFORWARD,') || cmd.startsWith('SERVO_tBACKWARD,')) {
      if (!sim.hasServo) return null;
      const dir = cmd.startsWith('SERVO_tFORWARD,') ? 1 : -1;
      sim.setServoMove(true, dir);
      return () => { if (sim) sim.setServoMove(false); };
    }
    // 서보(로버 바퀴) 제자리 회전 — t초 동안 왼쪽/오른쪽으로 회전.
    if (cmd.startsWith('SERVO_tLEFT,') || cmd.startsWith('SERVO_tRIGHT,')) {
      if (!sim.hasServo) return null;
      const dir = cmd.startsWith('SERVO_tLEFT,') ? 1 : -1;
      sim.setServoTurn(true, dir);
      return () => { if (sim) sim.setServoTurn(false); };
    }
    // 서보 연속 동작(시간 제약 없음) — SERVO_STOP 전까지 계속. 이동·회전은 상호 배타.
    if (cmd === 'SERVO_FORWARD'  || cmd.startsWith('SERVO_FORWARD,'))  { if (sim.hasServo) sim.setServoMove(true,  1); return null; }
    if (cmd === 'SERVO_BACKWARD' || cmd.startsWith('SERVO_BACKWARD,')) { if (sim.hasServo) sim.setServoMove(true, -1); return null; }
    if (cmd === 'SERVO_LEFT'     || cmd.startsWith('SERVO_LEFT,'))     { if (sim.hasServo) sim.setServoTurn(true,  1); return null; }
    if (cmd === 'SERVO_RIGHT'    || cmd.startsWith('SERVO_RIGHT,'))    { if (sim.hasServo) sim.setServoTurn(true, -1); return null; }
    if (cmd === 'SERVO_STOP'     || cmd.startsWith('SERVO_STOP,'))     { if (sim.hasServo) sim.stopServo();           return null; }
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
    // GUN_FIRE — 토픽별 발사 효과.
    //   · 발사대 토픽: 로켓 발사 (카메라 추적은 시뮬 경로에서 비활성)
    //   · 로버 토픽:   총구 플래시 + 스파크 + 폭발음
    if (cmd === 'GUN_FIRE' || cmd.startsWith('GUN_FIRE,')) {
      if (sim.hasRocket) { sim.setRocketLaunch(true, false); playRocketLaunch(); }
      if (sim.hasGun)    { sim.setGunFire(); playGunFire(); }
      return null;
    }
    // OLED 디스플레이 — 128×64 가상 화면. 8×8 글자 셀로 좌표 텍스트/아이콘을 그린다.
    if (cmd === 'CLEAR_DISPLAY' || cmd.startsWith('CLEAR_DISPLAY')) {
      if (sim.hasOled) sim.oledClear();
      return null;
    }
    // CLEAR_RECT,x,y,w,h — 특정 사각 영역만 지우기 (아이콘 위치만 깔끔히 비우는 용도).
    if (cmd.startsWith('CLEAR_RECT,')) {
      if (!sim.hasOled) return null;
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const w = parseInt(parts[3], 10) || 0;
      const h = parseInt(parts[4], 10) || 0;
      sim.oledClearRect(x, y, w, h);
      return null;
    }
    // MSG,<text> — 펌웨어 _handle_msg 와 동일: fill(0) 후 16자 자동 줄바꿈, y는 8 OLED px 간격.
    if (cmd.startsWith('MSG,')) {
      if (!sim.hasOled) return null;
      sim.oledClear();
      let rem = cmd.slice(4) || 'Hello';
      const MAX_CHARS = 16;          // 한 줄 = 16자 (128 / 8)
      const LINE_H = 8;              // 줄 간격 = 글자 셀 높이 = 8 OLED px
      for (let yp = 0; rem && yp < 64; yp += LINE_H) {
        sim.oledText(0, yp, rem.slice(0, MAX_CHARS));
        rem = rem.slice(MAX_CHARS);
      }
      return null;
    }
    // MSG_XY,x,y,text — 화면을 지우지 않고 좌표에 텍스트 누적 (text 에 콤마 포함 가능).
    if (cmd.startsWith('MSG_XY,')) {
      if (!sim.hasOled) return null;
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const text = parts.slice(3).join(',') || 'Hello';
      sim.oledText(x, y, text);
      return null;
    }
    // ICON,name,x,y — 32×32 아이콘을 누적 (name: rover | mars).
    if (cmd.startsWith('ICON,')) {
      if (!sim.hasOled) return null;
      const parts = cmd.split(',');
      const name = (parts[1] || '').trim().toLowerCase();
      const x = parseInt(parts[2], 10) || 0;
      const y = parseInt(parts[3], 10) || 0;
      sim.oledIcon(name, x, y);
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
    let distMeasured = null;                              // DISTANCE 측정값(cm) — 측정 시 채워짐
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
      const cleanup = applyTopicEffect(command);            // 시작 효과 적용 (LED/부저/거리센서 점등)
      await wait(ackMs + holdMs);
      // 거리 측정은 붉은 빛이 켜져 있는 동안(끄기 직전) 수행한다.
      if (command.startsWith('DISTANCE') && sim && sim.hasDistanceSensor) distMeasured = sim.measureDistance();
      cleanup?.();                                          // 동작 시간 종료 처리 (예: 가슴 LED·거리센서 끔)
    }
    const total = ackMs + holdMs;
    let reply = '1';
    if (command.startsWith('DISTANCE')) reply = `DIST:${distMeasured != null ? distMeasured : 30}`;
    else if (command.startsWith('MAGNET')) reply = 'MAG:0';
    const holdNote = holdMs > 0 ? ` + 대기 ${holdMs}ms` : '';
    logLine(`     ↩ ${reply}  (+${total}ms, ${waitForResponse ? 'Ack' : '비Ack'}${holdNote})`, 'rx');
    return reply;
  };
  const SIM_RUN_LABEL = '▶ 시뮬레이션 해보기';
  const SIM_STOP_LABEL = '⏹ 시뮬레이션 중지';
  let simRunning = false;
  let simAborted = false;
  const SERVO_LINGER_MS = 10000;       // 연속 SERVO 가 켜진 채 끝나면 이만큼 더 유지 후 종료
  if (simRunBtn) simRunBtn.addEventListener('click', async () => {
    ensureAudio();   // 제스처 안에서 오디오 언락 — 이후 비동기 실행 중 비프/효과음이 들리도록
    // 실행 중 다시 누르면 '비상 정지' — 진행 중인 명령 처리를 즉시 중단한다.
    if (simRunning) {
      simAborted = true;
      state.isExecuting = false;       // 모든 블록 루프(반복/while/순차)가 이 플래그를 검사해 멈춘다
      if (activeWaitCancel) activeWaitCancel();   // 진행 중인 대기(연속 SERVO 유지 포함)를 즉시 종료
      return;
    }
    if (!workspace) { logLine('워크스페이스가 준비되지 않았습니다', 'err'); return; }
    simRunning = true; simAborted = false;
    simRunBtn.textContent = SIM_STOP_LABEL;
    simRunBtn.classList.add('running');
    logLine('──── 시뮬레이션 시작 ────', 'sys');
    try {
      await CommandExecutor.simulateWorkspace(workspace, simSink);
      // 블록 실행이 끝나도 연속 SERVO(전·후진/좌·우회전)가 켜져 있으면 바로 종료하지 않고,
      // 정지 타이머(10초)가 끝날 때까지 '실행 중' 상태를 유지한다(그동안 중지 버튼으로 즉시 종료 가능).
      if (!simAborted && sim && sim.hasServo && sim.servoActive) {
        logLine(`연속 SERVO 동작 유지 중 — ${SERVO_LINGER_MS / 1000}초 후 종료`, 'sys');
        await wait(SERVO_LINGER_MS);          // 중지 버튼이 activeWaitCancel 로 즉시 깨운다
        if (sim && sim.hasServo) sim.stopServo();
      }
      logLine(simAborted ? '──── 비상 정지 ────' : '──── 시뮬레이션 종료 ────', 'sys');
    } catch (e) {
      logLine('오류: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      simRunning = false;
      simRunBtn.textContent = SIM_RUN_LABEL;
      simRunBtn.classList.remove('running');
      // 정상 종료 시의 연속 SERVO 유지는 위 try 블록에서 처리(타이머만큼 기다린 뒤 정지)한다.
      // 여기서는 비상 정지 시 진행 중이던 효과(서보·LED·레이더)를 즉시 정리한다.
      if (simAborted) {
        if (sim && sim.hasServo) sim.stopServo();
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

  // 키보드 단축키 (시뮬레이션이 열려 있고, 입력 필드에 포커스가 없을 때)
  //   - 1/2/3 : 우주 신호등 슬롯 토글
  //   - g     : 좌표 평면(XY/YZ/ZX) 0.1 그리드 표시/숨김 토글 (로버 등 helpers 토픽)
  addEventListener('keydown', (e) => {
    if (card.hidden || !sim) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = (t && t.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if ((e.key === 'g' || e.key === 'G') && sim.hasGrids) {
      sim.toggleGrids();
      e.preventDefault();
      return;
    }
    if ((e.key === 'r' || e.key === 'R') && sim.hasBoxes) {
      sim.respawnBoxes();
      e.preventDefault();
      return;
    }
    if (!sim.hasTraffic) return;
    let idx = -1;
    if (e.key === '1') idx = 0;
    else if (e.key === '2') idx = 1;
    else if (e.key === '3') idx = 2;
    if (idx < 0) return;
    sim.toggleSlot(idx);
    e.preventDefault();
  });

  // 모바일: 시뮬레이션 창 더블클릭(더블탭)으로 박스 재배치 — 키보드가 없으므로 r 키 대체.
  const isMobileLike = new URLSearchParams(location.search).get('mobile') === 'true'
    || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isMobileLike && stage) {
    stage.addEventListener('dblclick', () => {
      if (card.hidden || !sim || !sim.hasBoxes) return;
      sim.respawnBoxes();
    });
  }

  return { open, close };
}
