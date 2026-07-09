import { state } from './state.js';
import { elements } from './elements.js';
import { Logger } from './logger.js';
import { BluetoothManager } from './bluetooth.js';
import { BlocklyConfig, attachBatchBlockValidator, attachDynamicNaming, updateWorkspaceBlocks } from './blocklyconfig.js?v=20260705a';
import { CommandExecutor } from './commandexecutor.js';
import { setupSimulation } from './Simulation/Simulation_Main.js';
import { updateBlockCodingButtonUI, setupLogToggle, setupContentToggle } from './ui.js';
import { parse as aiParse } from './ai_helper.js';

// ============================================================
// 차시 카탈로그 — 네비게이션 드롭다운/개요 표 렌더링에 사용
// ============================================================
const LESSON_CATALOG = [
  { n: 1,  title: "코딩 입문과 알비 만남",         tag: "theory",   hardware: "(이론) Bluetooth 페어링", concept: "순차/반복 개념, 앱 설치" },
  { n: 2,  title: "LED 기초: 알비의 첫 호흡",       tag: "LED",      hardware: "LED 1개",                 concept: "디지털 출력 HIGH/LOW, time.sleep" },
  { n: 3,  title: "LED 2개로 표정 만들기",          tag: "WINK",     hardware: "LED 2개",                 concept: "다채널 동시 제어, 윙크 리듬" },
  { n: 4,  title: "부저로 소리 만들기",             tag: "BUZZER",   hardware: "부저",                     concept: "주파수(Hz) × 지속시간" },
  { n: 5,  title: "LED 3개로 신호등 만들기",        tag: "TRAFFIC",  hardware: "LED 3개",                 concept: "시퀀스 사고, 모드 분기" },
  { n: 6,  title: "랜덤 함수와 가위바위보 게임",    tag: "RANDOM",   hardware: "LED 3개",                 concept: "random.randint, 비결정적 코드" },
  { n: 7,  title: "DC모터 입문: 회전과 룰렛",       tag: "MOTOR",    hardware: "DC모터 + 원판",           concept: "정/역 회전, PWM 속도 조절" },
  { n: 8,  title: "알비 카트 주행",                tag: "MOTOR",    hardware: "DC모터 + 바퀴 2개",       concept: "전·후진 주행, 가감속 곡선" },
  { n: 9,  title: "발사대 제작과 1분기 회고",       tag: "theory",   hardware: "(제작/이론)",             concept: "1분기 총정리, 2분기 예고" },
  { n: 10, title: "LED 5개 시퀀스와 카운트다운",    tag: "SEQUENCE", hardware: "LED 5개",                 concept: "발사 시퀀스, 모듈화 사고" },
  { n: 11, title: "LED와 부저 동기화",             tag: "SYNC",     hardware: "LED 5개 + 부저",          concept: "빛/소리 동기, 음계(도레미파솔)" },
  { n: 12, title: "화성 로켓 최종 발사!",           tag: "LAUNCH",   hardware: "LED 5개 + 부저 + DC모터", concept: "통합 시나리오, 자유 창작 발표" },
  { n: "+", title: "화성에 착륙하기",               tag: "BONUS",    hardware: "곧 만나요",                concept: "지금까지 배운 모든 것을 모아 화성 착륙에 도전!", bonus: true },
];

const MISSION_PROGRESS_KEY = 'ares_completed_missions_v1';
const LAST_CODING_KEY = 'ares_last_coding_mission_v1';

// 마지막으로 블록코딩에 들어간 미션 { lesson, mission } — 하단 "코딩" 탭이 참조
let lastCodingMission = null;

function rememberCodingMission(lesson, mission) {
  if (!Number.isFinite(lesson) || !Number.isFinite(mission)) return;
  lastCodingMission = { lesson, mission };
  try { localStorage.setItem(LAST_CODING_KEY, JSON.stringify(lastCodingMission)); } catch {}
}

function getLastCodingMission() {
  if (lastCodingMission) return lastCodingMission;
  try {
    const o = JSON.parse(localStorage.getItem(LAST_CODING_KEY) || 'null');
    if (Number.isFinite(o?.lesson) && Number.isFinite(o?.mission)) {
      lastCodingMission = o;
      return o;
    }
  } catch {}
  return null;
}

function getCompletedMissions() {
  try {
    const saved = JSON.parse(localStorage.getItem(MISSION_PROGRESS_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function missionProgressId(lesson, mission) {
  return `${lesson}-${mission}`;
}

function isMissionCompleted(lesson, mission) {
  return getCompletedMissions().has(missionProgressId(lesson, mission));
}

function completedMissionCount(lesson) {
  const completed = getCompletedMissions();
  let count = 0;
  for (let mission = 1; mission <= 4; mission += 1) {
    if (completed.has(missionProgressId(lesson, mission))) count += 1;
  }
  return count;
}

function markMissionCompleted(lesson, mission) {
  if (!lesson || !mission) return;
  const completed = getCompletedMissions();
  const id = missionProgressId(lesson, mission);
  if (completed.has(id)) return;
  completed.add(id);
  try { localStorage.setItem(MISSION_PROGRESS_KEY, JSON.stringify([...completed])); } catch {}

  const lessonItem = document.querySelector(`[data-lesson-item="${lesson}"]`);
  const count = lessonItem?.querySelector('.flow-count');
  if (count) count.textContent = `${completedMissionCount(lesson)}/4`;
  const missionButton = lessonItem?.querySelector(`[data-inline-mission="${mission}"]`);
  if (missionButton) {
    missionButton.classList.add('completed');
    missionButton.querySelector('.inline-mission-check')?.removeAttribute('hidden');
  }
}

const lessonCache = new Map(); // n -> lesson.json 객체
let workspace = null;          // Blockly 워크스페이스 (한 번만 inject)
let currentView = 'overview';
let currentLesson = null;
let currentMission = null;
let mobileBottomNavBound = false;
let pendingDashboardOpen = false;
let mobileDashboardReturnHash = null;
let mobileAiReturnHash = null;
let aresBlocklyTheme = null;

// 미션 뷰는 description / coding / simulation 세 모드 중 하나만 표시한다.
// _preSimMode 는 시뮬을 닫았을 때 복귀할 모드(description 또는 coding)를 기억.
let _contentMode = 'description';
let _preSimMode = 'description';
let setContentMode = null;     // setupContentToggle() 에서 등록

function getAresBlocklyTheme() {
  if (aresBlocklyTheme) return aresBlocklyTheme;

  aresBlocklyTheme = Blockly.Theme.defineTheme('aresTheme', {
    base: Blockly.Themes.Classic,
    blockStyles: {
      logic_blocks: { colourPrimary: '#cacacb' },
      math_blocks: { colourPrimary: '#cacacb' },
      loop_blocks: { colourPrimary: '#2b638f' },
      variable_blocks: { colourPrimary: '#5483b5' },
      variable_dynamic_blocks: { colourPrimary: '#5483b5' },
      procedure_blocks: { colourPrimary: '#727171' }
    },
    categoryStyles: {
      logic_category: { colour: '#cacacb' },
      math_category: { colour: '#cacacb' },
      loop_category: { colour: '#2b638f' },
      variable_category: { colour: '#5483b5' },
      procedure_category: { colour: '#727171' }
    }
  });

  return aresBlocklyTheme;
}

function applyAresBuiltinBlockColours() {
  const ifBlock = Blockly.Blocks?.controls_if;
  if (!ifBlock || ifBlock.__aresColourPatchAttached) return;

  const originalInit = ifBlock.init;
  ifBlock.init = function() {
    originalInit.call(this);
    this.setColour('#2b638f');
  };
  ifBlock.__aresColourPatchAttached = true;
}

// ============================================================
// 동적 툴박스 필터링
// ============================================================
function updateDynamicToolbox() {
  if (!workspace) return;
  const originalToolbox = document.getElementById('toolbox');
  if (!originalToolbox) return;

  const clonedToolbox = originalToolbox.cloneNode(true);

  if (state.enabledModules) {
    const modules = state.enabledModules;
    const moduleBlockTypes = {
      wheel: [
        'timed_forward', 'timed_backward', 'timed_left', 'timed_right',
        'move_forward', 'move_backward', 'turn_left', 'turn_right', 'stop_moving'
      ],
      dcmotor: [
        'main_motor_forward_timed', 'main_motor_backward_timed',
        'main_motor_forward', 'main_motor_backward', 'main_motor_stop'
      ],
      leds: ['led_on', 'led_off', 'led_off_all', 'set_lamp'],
      oled: ['send_message', 'send_message_xy', 'display_icon', 'clear_display', 'clear_rect'],
      buzzer: ['buzzer_on', 'buzzer_note'],
      gun: ['gun_fire']
    };

    for (const [moduleName, blockTypes] of Object.entries(moduleBlockTypes)) {
      if (modules[moduleName] === false) {
        blockTypes.forEach((type) => {
          clonedToolbox.querySelectorAll(`block[type="${type}"]`).forEach((block) => block.remove());
        });
      }
    }

    if (modules.distance === false) {
      const block = clonedToolbox.querySelector('block[type="check_distance"]');
      if (block) {
        block.parentNode.removeChild(block);
      }
    }
    if (modules.magsensor === false) {
      const block = clonedToolbox.querySelector('block[type="check_magnetic"]');
      if (block) {
        block.parentNode.removeChild(block);
      }
    }
  }

  workspace.updateToolbox(clonedToolbox);
}

// ============================================================
// Blockly 한글 메시지 + 워크스페이스 초기화
// ============================================================
// 이미지형 툴박스 카테고리 위에 마우스가 놓이면(호버) 그 카테고리의 플라이아웃을
// 연다. Blockly 는 기본적으로 클릭(pointerdown)에서 열리므로, 호버로도 열리게
// setSelectedItem 을 호출한다. 이벤트 위임이라 카테고리 DOM 이 재생성돼도 유지된다.
// 카테고리 색(툴박스 XML 순서와 동일) — 플라이아웃 배경 색조에 사용
const CATEGORY_COLORS = ['#cf3d37', '#d68fa5', '#dcc342', '#7daa4d', '#2b638f', '#5483b5', '#cacacb', '#727171'];

// #RRGGBB 를 흰색 쪽으로 amt(0~1) 만큼 밝게 → 배경용 밝은 톤
function lightenColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `rgb(${r}, ${g}, ${b})`;
}

// 플라이아웃(블록 선택 영역) 동작·모양 설정:
//  - autoClose 켬: 블록 클릭 시 코딩창에 배치+닫힘, 코딩창 클릭 시에도 닫힘
//  - 블록 사이 간격을 절반(기본 GAP_Y 24 → 12)으로
//  - 카테고리 선택 시 배경을 그 카테고리 색의 밝은 톤으로
function setupFlyoutBehavior(ws) {
  const toolbox = ws.getToolbox?.();
  if (!toolbox) return;

  const applyFlyoutCfg = () => {
    const flyout = toolbox.getFlyout?.();
    if (!flyout) return;
    // autoClose=true(기본): 블록을 클릭하면 코딩창에 배치되고 플라이아웃이 닫히며,
    // 코딩창(워크스페이스)을 눌러도 닫힌다.
    flyout.autoClose = true;
    flyout.GAP_Y = 12;   // 블록 사이 간격 절반
  };
  applyFlyoutCfg();

  // 카테고리 선택을 가로채 배경색을 갱신한다(원래 동작은 그대로 수행).
  const origSetSelected = toolbox.setSelectedItem.bind(toolbox);
  toolbox.setSelectedItem = function (item) {
    origSetSelected(item);
    applyFlyoutCfg();
    const idx = toolbox.getToolboxItems().indexOf(item);
    const color = CATEGORY_COLORS[idx];
    const bg = document.querySelector('.blocklyFlyoutBackground');
    if (bg && color) bg.style.fill = lightenColor(color, 0.82);
  };
}

// 블록 선택 메뉴(플라이아웃)의 블록을 워크스페이스 줌과 무관하게 고정 크기로 표시.
// 기본은 flyout.getFlyoutScale() 이 메인 워크스페이스 scale 을 따라가므로, 이를
// 고정값(자연 크기의 0.6배)으로 오버라이드한다.
function setupFlyoutFixedScale(ws) {
  const FLYOUT_SCALE = 0.6;
  const flyout = ws.getFlyout?.();
  if (!flyout) return;
  const proto = Object.getPrototypeOf(flyout);
  if (proto && typeof proto.getFlyoutScale === 'function' && !proto.__aresFixedFlyoutScale) {
    proto.getFlyoutScale = function () { return FLYOUT_SCALE; };
    proto.__aresFixedFlyoutScale = true;
  }
  try { flyout.getWorkspace().setScale(FLYOUT_SCALE); } catch {}
}

// 툴박스 서랍: 기본은 접힘(라벨만 보임). 툴박스를 클릭하면 펼쳐지고(아이콘까지),
// 펼쳐진 상태에서 카테고리를 클릭하면 블록이 열린다. 빈 곳을 클릭하면 다시 접힌다.
function setupToolboxDrawer(ws) {
  const div = document.querySelector('.blocklyToolboxDiv');
  if (!div) return;
  document.body.classList.add('toolbox-collapsed');   // 시작은 접힘

  const reflow = () => { try { Blockly.svgResize(ws); } catch {} };
  const isCollapsed = () => document.body.classList.contains('toolbox-collapsed');
  const collapse = () => {
    if (isCollapsed()) return;
    document.body.classList.add('toolbox-collapsed');
    try { ws.getToolbox().clearSelection(); } catch {}
    reflow();
  };
  const expand = () => {
    if (!isCollapsed()) return;
    document.body.classList.remove('toolbox-collapsed');
    reflow();
  };

  div.addEventListener('pointerdown', (event) => {
    const onCategory = !!(event.target.closest && event.target.closest('.blocklyToolboxCategory'));
    if (isCollapsed()) {
      // 접힘 상태에서 클릭 → 펼친다. 클릭 위치가 특정 카테고리(라벨)면 그 영역의
      // 블록 선택(플라이아웃)까지 함께 연다.
      expand();
      const cat = event.target.closest && event.target.closest('.blocklyToolboxCategory');
      if (cat) {
        const cats = Array.from(div.querySelectorAll('.blocklyToolboxCategory'));
        const idx = cats.indexOf(cat);
        const toolbox = ws.getToolbox && ws.getToolbox();
        const items = (toolbox && toolbox.getToolboxItems) ? toolbox.getToolboxItems() : [];
        if (idx >= 0 && items[idx]) {
          // 펼침(폭 변경·svgResize)이 반영된 뒤 선택되도록 다음 프레임에
          requestAnimationFrame(() => { try { toolbox.setSelectedItem(items[idx]); } catch {} });
        }
      }
      event.stopPropagation();
      event.preventDefault();
    } else if (!onCategory) {
      // 펼침 상태에서 카테고리가 아닌 빈 곳 클릭 → 접기(열린 플라이아웃도 닫음)
      collapse();
      event.stopPropagation();
      event.preventDefault();
    }
    // 펼침 상태 + 카테고리 클릭 → Blockly 기본 선택(플라이아웃 열림)
  }, true);

  // 블록을 선택(플라이아웃에서 코딩창으로 배치)하면 툴박스를 접는다
  ws.addChangeListener((ev) => {
    if (ev && ev.type === Blockly.Events.BLOCK_CREATE) collapse();
  });

  // 코딩 영역(메인 워크스페이스)을 누르면 툴박스를 접는다
  // (툴박스 자체·플라이아웃 클릭은 제외 — 각자 로직으로 처리)
  document.addEventListener('pointerdown', (event) => {
    if (isCollapsed()) return;
    const t = event.target;
    if (!t || !t.closest) return;
    if (!t.closest('#blocklyDiv')) return;
    if (t.closest('.blocklyToolboxDiv') || t.closest('.blocklyFlyout')) return;
    collapse();
  }, true);
}

function initializeBlockly() {
  if (!navigator.bluetooth) {
    alert('이 블라우저는 Web Bluetooth API를 지원하지 않습니다. Chrome 56+ 또는 Edge 79+를 사용해주세요.');
    Logger.add('[오류] 블라우저가 Web Bluetooth API를 지원하지 않습니다', 'error');
  }

  Blockly.defineBlocksWithJsonArray(BlocklyConfig.blocks);
  attachBatchBlockValidator(Blockly);
  attachDynamicNaming(Blockly, state);
  applyKoreanMessages();
  applyAresBuiltinBlockColours();

  // 모바일에서는 카테고리 이름을 emoji 1자로 줄여 글자가 절대 새어 나오지 않도록
  // (Blockly 의 기본 선택 스타일이 텍스트 영역을 펼치는 케이스를 원천 차단)
  const toolboxEl = document.getElementById('toolbox');
  if (toolboxEl && window.matchMedia('(max-width: 768px)').matches) {
    toolboxEl.querySelectorAll('category').forEach((cat) => {
      const name = cat.getAttribute('name') || '';
      const firstToken = name.split(/\s+/)[0];   // 예: "🚗 서보 모터" → "🚗"
      if (firstToken) cat.setAttribute('name', firstToken);
    });
  }

  workspace = Blockly.inject('blocklyDiv', {
    toolbox: document.getElementById('toolbox'),
    theme: getAresBlocklyTheme(),
    scrollbars: true,
    trashcan: true,
    zoom: {
      controls: true,
      wheel: true,
      pinch: true,
      startScale: 0.9,
      maxScale: 2.0,
      minScale: 0.3,
      scaleSpeed: 1.2
    }
  });

  Blockly.Python.init(workspace);
  setupBlockContextMenu(workspace);
  setupFlyoutBehavior(workspace);
  setupFlyoutFixedScale(workspace);
  // 카테고리 툴박스는 항상 펼친 상태로 유지한다.
  document.body.classList.remove('toolbox-collapsed');

  // Register dynamic toolbox / workspace block updates on state change
  window.updateToolboxForActiveState = function() {
    updateDynamicToolbox();
    updateWorkspaceBlocks(workspace, state);
  };

  // Apply initial dynamic toolbox / names
  window.updateToolboxForActiveState();

  // 빈 작업공간에서만 PDF 5페이지의 안내 카드를 표시한다.
  const emptyHint = document.getElementById('workspaceEmptyHint');
  const refreshEmptyHint = () => {
    if (!emptyHint) return;
    emptyHint.hidden = workspace.getAllBlocks(false).length > 0;
  };
  workspace.addChangeListener(refreshEmptyHint);
  refreshEmptyHint();

  return workspace;
}

// ============================================================
// 블록 컨텍스트 메뉴 — 복사 / 삭제 / 전체 삭제 (어린이용 단순 메뉴)
//   · 데스크톱: 블록을 클릭(또는 우클릭)하면 표시
//   · 모바일: 블록을 길게 누르면(롱프레스) 표시 — Blockly 기본 제스처
// 기존의 복잡한 기본 메뉴(주석/접기/비활성화 등)는 제거해 단순화한다.
// ============================================================
function setupBlockContextMenu(workspace) {
  const Reg = Blockly.ContextMenuRegistry.registry;
  const ScopeType = Blockly.ContextMenuRegistry.ScopeType;

  // 1) 기본 메뉴의 잡다한 항목 제거(있으면 무시)
  ['blockComment', 'blockInline', 'blockCollapseExpand', 'blockDisable',
    'blockHelp', 'blockDuplicate', 'blockDelete',
    'cleanWorkspace', 'collapseWorkspace', 'expandWorkspace',
    'undoWorkspace', 'redoWorkspace', 'workspaceDelete'].forEach((id) => {
    try { Reg.unregister(id); } catch (_) { /* 등록 안 돼 있으면 무시 */ }
  });

  // 2) 동작 (네이티브 메뉴와 클릭 메뉴가 공유) ─ undo 묶음으로 처리
  //   · 복사/삭제        → 해당 블록 하나만
  //   · 연결된 블록 복사/삭제 → 그 블록이 속한 스택(묶여 있는 블록들) 전체
  //   · 전체 복사/삭제    → 워크스페이스의 모든 블록
  // 복사는 saveIds:false 로 새 id 를 받아 원본과 충돌하지 않게 한다.
  const offsetAppend = (data, ws) => {
    if (!data) return null;
    data.x = (data.x || 0) + 30;
    data.y = (data.y || 0) + 30;
    const copy = Blockly.serialization.blocks.append(data, ws, { recordUndo: true });
    if (copy && copy.select) copy.select();
    return copy;
  };
  const inGroup = (fn) => {
    Blockly.Events.setGroup(true);
    try { fn(); } finally { Blockly.Events.setGroup(false); }
  };

  // 복사 — 해당 블록만 (입력/하위·다음 스택 제외)
  function copyBlock(block) {
    if (!block || block.isInFlyout) return;
    inGroup(() => offsetAppend(
      Blockly.serialization.blocks.save(block, { addCoordinates: true, saveIds: false, addInputBlocks: false, addNextBlocks: false }),
      block.workspace));
  }
  // 복사 — 연결된 블록 전체 (그 블록이 속한 스택 루트부터 통째로)
  function copyConnected(block) {
    if (!block || block.isInFlyout) return;
    const root = block.getRootBlock ? block.getRootBlock() : block;
    inGroup(() => offsetAppend(
      Blockly.serialization.blocks.save(root, { addCoordinates: true, saveIds: false }),
      block.workspace));
  }
  // 복사 — 전체 (모든 최상위 스택을 각각 복제)
  function copyAll(ws) {
    const tops = ws.getTopBlocks(false);
    if (!tops.length) return;
    inGroup(() => tops.forEach((b) => offsetAppend(
      Blockly.serialization.blocks.save(b, { addCoordinates: true, saveIds: false }), ws)));
  }
  // 삭제 — 해당 블록만 (아래 스택은 위로 이어 붙임)
  function deleteBlock(block) {
    if (!block || block.isInFlyout) return;
    inGroup(() => block.dispose(true));
  }
  // 삭제 — 연결된 블록 전체 (그 블록이 속한 스택 통째로)
  function deleteConnected(block) {
    if (!block || block.isInFlyout) return;
    const root = block.getRootBlock ? block.getRootBlock() : block;
    inGroup(() => root.dispose(false));
  }
  // 삭제 — 전체 (확인 후 모든 스택 제거)
  function deleteAll(ws) {
    const tops = ws.getTopBlocks(false);
    if (!tops.length) return;
    if (!window.confirm('블록을 모두 지울까요?')) return;
    inGroup(() => tops.forEach((b) => b.dispose(false)));
  }

  // 3) 네이티브 메뉴(우클릭/롱프레스)용 레지스트리 등록 (6개)
  const onBlock = (scope) => (scope.block && !scope.block.isInFlyout ? 'enabled' : 'hidden');
  const ITEMS = [
    { id: 'aresCopy', text: '📄 복사', run: (b) => copyBlock(b) },
    { id: 'aresDelete', text: '🗑️ 삭제', run: (b) => deleteBlock(b) },
    { id: 'aresCopyConn', text: '📑 연결된 블록 복사', run: (b) => copyConnected(b) },
    { id: 'aresDeleteConn', text: '🗑️ 연결된 블록 삭제', run: (b) => deleteConnected(b) },
    { id: 'aresCopyAll', text: '📋 전체 복사', run: (b) => copyAll(b.workspace) },
    { id: 'aresDeleteAll', text: '🧹 전체 삭제', run: (b) => deleteAll(b.workspace) },
  ];
  ITEMS.forEach((it, i) => Reg.register({
    id: it.id, weight: i + 1, scopeType: ScopeType.BLOCK, displayText: it.text,
    preconditionFn: onBlock, callback: (scope) => it.run(scope.block),
  }));
  // 빈 캔버스(워크스페이스 영역) 우클릭/롱프레스: 전체 복사/삭제만
  const wsHas = (scope) => (scope.workspace && scope.workspace.getTopBlocks(false).length ? 'enabled' : 'disabled');
  Reg.register({
    id: 'aresCopyAllWs', weight: 1, scopeType: ScopeType.WORKSPACE, displayText: '📋 전체 복사',
    preconditionFn: wsHas, callback: (scope) => copyAll(scope.workspace),
  });
  Reg.register({
    id: 'aresDeleteAllWs', weight: 2, scopeType: ScopeType.WORKSPACE, displayText: '🧹 전체 삭제',
    preconditionFn: wsHas, callback: (scope) => deleteAll(scope.workspace),
  });

  // 4) 데스크톱: 블록을 클릭하면 같은 6개 메뉴 표시 (모바일 터치는 롱프레스로만)
  let lastPointer = null;
  const div = workspace.getInjectionDiv ? workspace.getInjectionDiv() : document.getElementById('blocklyDiv');
  if (div) div.addEventListener('pointerdown', (e) => { lastPointer = e; }, true);

  workspace.addChangeListener((e) => {
    if (e.type !== Blockly.Events.CLICK || e.targetType !== 'block' || !e.blockId) return;
    if (!lastPointer || lastPointer.pointerType === 'touch') return;          // 터치는 롱프레스로
    if (lastPointer.target && lastPointer.target.closest &&
        lastPointer.target.closest('.blocklyEditableText')) return;          // 입력 필드 클릭은 편집 우선
    const block = workspace.getBlockById(e.blockId);
    if (!block || block.isInFlyout) return;
    const options = ITEMS.map((it) => ({ text: it.text, enabled: true, callback: () => it.run(block) }));
    Blockly.ContextMenu.show(lastPointer, options, workspace.RTL, workspace);
  });
}

function applyKoreanMessages() {
  // 반복
  Blockly.Msg["CONTROLS_REPEAT_TITLE"] = "반복 %1 번";
  Blockly.Msg["CONTROLS_REPEAT_INPUT_DO"] = "실행";
  Blockly.Msg["CONTROLS_REPEAT_TOOLTIP"] = "지정된 횟수만큼 문장을 반복합니다.";
  // 수학
  Blockly.Msg["MATH_CHANGE_TITLE"] = "%1 에 %2 만큼 더하기";
  Blockly.Msg["MATH_CHANGE_TOOLTIP"] = "변수 '%1'에 숫자를 더합니다.";
  Blockly.Msg["MATH_NUMBER_TOOLTIP"] = "숫자입니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_ADD"] = "두 수의 합을 반환합니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_SUBTRACT"] = "첫 번째 수에서 두 번째 수를 뺀 결과를 반환합니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_MULTIPLY"] = "두 수의 곱을 반환합니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_DIVIDE"] = "첫 번째 수를 두 번째 수로 나눈 결과를 반환합니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_POWER"] = "첫 번째 수를 두 번째 수 만큼 승한 결과를 반환합니다.";
  // 변수
  Blockly.Msg["VARIABLES_DEFAULT_NAME"] = "변수";
  Blockly.Msg["VARIABLES_GET_TOOLTIP"] = "이 변수의 값을 가져옵니다.";
  Blockly.Msg["VARIABLES_SET"] = "%1 을(를) %2 (으)로 설정";
  Blockly.Msg["VARIABLES_SET_TOOLTIP"] = "이 변수를 입력값과 같게 설정합니다.";
  Blockly.Msg["NEW_VARIABLE"] = "새 변수 생성...";
  Blockly.Msg["NEW_VARIABLE_TITLE"] = "새 변수 이름:";
  Blockly.Msg["NEW_STRING_VARIABLE"] = "새 문자열 변수 생성...";
  Blockly.Msg["NEW_NUMBER_VARIABLE"] = "새 숫자 변수 생성...";
  Blockly.Msg["NEW_COLOUR_VARIABLE"] = "새 색상 변수 생성...";
  Blockly.Msg["RENAME_VARIABLE"] = "변수 이름 변경...";
  Blockly.Msg["RENAME_VARIABLE_TITLE"] = "모든 '%1' 변수 이름을 다음으로 변경:";
  Blockly.Msg["DELETE_VARIABLE"] = "'%1' 변수 삭제";
  Blockly.Msg["DELETE_VARIABLE_CONFIRMATION"] = "'%2' 변수의 %1개 사용을 삭제하시겠습니까?";
  // 제어 (if)
  Blockly.Msg["CONTROLS_IF_MSG_IF"] = "만약";
  Blockly.Msg["CONTROLS_IF_MSG_THEN"] = "이면";
  Blockly.Msg["CONTROLS_IF_MSG_ELSE"] = "아니면";
  Blockly.Msg["CONTROLS_IF_MSG_ELSEIF"] = "아니면 만약";
  Blockly.Msg["CONTROLS_IF_TOOLTIP_1"] = "값이 참이면, 문장을 실행합니다.";
  Blockly.Msg["CONTROLS_IF_TOOLTIP_2"] = "값이 참이면 첫 번째 블록을, 아니면 두 번째 블록을 실행합니다.";
  Blockly.Msg["CONTROLS_IF_TOOLTIP_3"] = "첫 번째 값이 참이면 첫 번째 블록을 실행합니다. 아니면 두 번째 값이 참이면 두 번째 블록을 실행합니다.";
  Blockly.Msg["CONTROLS_IF_TOOLTIP_4"] = "첫 번째 값이 참이면 첫 번째 블록을 실행합니다. 아니면 두 번째 값이 참이면 두 번째 블록을 실행합니다. 모두 거짓이면 마지막 블록을 실행합니다.";
  Blockly.Msg["CONTROLS_IF_IF_TITLE_IF"] = "만약";
  Blockly.Msg["CONTROLS_IF_IF_TOOLTIP"] = "섹션을 추가, 제거, 재정렬하여 이 if 블록을 재구성합니다.";
  Blockly.Msg["CONTROLS_IF_ELSEIF_TITLE_ELSEIF"] = "아니면 만약";
  Blockly.Msg["CONTROLS_IF_ELSEIF_TOOLTIP"] = "if 블록에 조건을 추가합니다.";
  Blockly.Msg["CONTROLS_IF_ELSE_TITLE_ELSE"] = "아니면";
  Blockly.Msg["CONTROLS_IF_ELSE_TOOLTIP"] = "if 블록에 모든 조건이 거짓일 때 실행할 부분을 추가합니다.";
  // 제어 (while)
  Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_WHILE"] = "참인 동안 반복";
  Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_UNTIL"] = "참이 될 때까지 반복";
  Blockly.Msg["CONTROLS_WHILEUNTIL_TOOLTIP_WHILE"] = "값이 참인 동안 문장을 반복합니다.";
  Blockly.Msg["CONTROLS_WHILEUNTIL_TOOLTIP_UNTIL"] = "값이 거짓인 동안 문장을 반복합니다.";
  // 논리
  Blockly.Msg["LOGIC_COMPARE_TOOLTIP_EQ"] = "두 값이 같으면 참을 반환합니다.";
  Blockly.Msg["LOGIC_COMPARE_TOOLTIP_NEQ"] = "두 값이 다르면 참을 반환합니다.";
  Blockly.Msg["LOGIC_COMPARE_TOOLTIP_LT"] = "첫 번째 값이 두 번째보다 작으면 참을 반환합니다.";
  Blockly.Msg["LOGIC_COMPARE_TOOLTIP_LTE"] = "첫 번째 값이 두 번째보다 작거나 같으면 참을 반환합니다.";
  Blockly.Msg["LOGIC_COMPARE_TOOLTIP_GT"] = "첫 번째 값이 두 번째보다 크면 참을 반환합니다.";
  Blockly.Msg["LOGIC_COMPARE_TOOLTIP_GTE"] = "첫 번째 값이 두 번째보다 크거나 같으면 참을 반환합니다.";
  Blockly.Msg["LOGIC_BOOLEAN_TRUE"] = "참";
  Blockly.Msg["LOGIC_BOOLEAN_FALSE"] = "거짓";
  Blockly.Msg["LOGIC_BOOLEAN_TOOLTIP"] = "참 또는 거짓을 반환합니다.";
  Blockly.Msg["LOGIC_NEGATE_TITLE"] = "%1 이(가) 아니다";
  Blockly.Msg["LOGIC_NEGATE_TOOLTIP"] = "입력이 거짓이면 참을 반환합니다. 입력이 참이면 거짓을 반환합니다.";
  Blockly.Msg["LOGIC_OPERATION_AND"] = "그리고";
  Blockly.Msg["LOGIC_OPERATION_OR"] = "또는";
  Blockly.Msg["LOGIC_OPERATION_TOOLTIP_AND"] = "두 값이 모두 참이면 참을 반환합니다.";
  Blockly.Msg["LOGIC_OPERATION_TOOLTIP_OR"] = "두 값 중 하나라도 참이면 참을 반환합니다.";
  // 함수
  Blockly.Msg["PROCEDURES_DEFNORETURN_TITLE"] = "함수";
  Blockly.Msg["PROCEDURES_DEFNORETURN_PROCEDURE"] = "작업";
  Blockly.Msg["PROCEDURES_DEFNORETURN_DO"] = "";
  Blockly.Msg["PROCEDURES_DEFNORETURN_TOOLTIP"] = "반환값이 없는 함수를 만듭니다.";
  Blockly.Msg["PROCEDURES_DEFNORETURN_COMMENT"] = "이 함수에 대한 설명...";
  Blockly.Msg["PROCEDURES_DEFRETURN_TITLE"] = "함수 (반환값 있음)";
  Blockly.Msg["PROCEDURES_DEFRETURN_PROCEDURE"] = "계산";
  Blockly.Msg["PROCEDURES_DEFRETURN_DO"] = "";
  Blockly.Msg["PROCEDURES_DEFRETURN_RETURN"] = "반환";
  Blockly.Msg["PROCEDURES_DEFRETURN_TOOLTIP"] = "반환값이 있는 함수를 만듭니다.";
  Blockly.Msg["PROCEDURES_DEFRETURN_COMMENT"] = "이 함수에 대한 설명...";
  Blockly.Msg["PROCEDURES_CALLNORETURN_TOOLTIP"] = "사용자 정의 함수 '%1'을(를) 실행합니다.";
  Blockly.Msg["PROCEDURES_CALLRETURN_TOOLTIP"] = "사용자 정의 함수 '%1'을(를) 실행하고 결과를 사용합니다.";
  Blockly.Msg["PROCEDURES_MUTATORCONTAINER_TITLE"] = "매개변수";
  Blockly.Msg["PROCEDURES_MUTATORCONTAINER_TOOLTIP"] = "이 함수에 입력을 추가, 제거, 재정렬합니다.";
  Blockly.Msg["PROCEDURES_MUTATORARG_TITLE"] = "입력 이름:";
  Blockly.Msg["PROCEDURES_MUTATORARG_TOOLTIP"] = "함수에 입력(매개변수)을 추가합니다.";
  Blockly.Msg["PROCEDURES_HIGHLIGHT_DEF"] = "함수 정의로 이동";
  Blockly.Msg["PROCEDURES_CREATE_DO"] = "'%1' 호출 블록 만들기";
  Blockly.Msg["PROCEDURES_IFRETURN_TOOLTIP"] = "값이 참이면 두 번째 값을 반환합니다.";
  Blockly.Msg["PROCEDURES_IFRETURN_WARNING"] = "경고: 이 블록은 함수 정의 내에서만 사용할 수 있습니다.";
  Blockly.Msg["PROCEDURES_BEFORE_PARAMS"] = "매개변수:";
  Blockly.Msg["PROCEDURES_CALL_BEFORE_PARAMS"] = "매개변수:";
  Blockly.Msg["PROCEDURES_ADD_PARAMETER"] = "매개변수 추가";
  Blockly.Msg["PROCEDURES_REMOVE_PARAMETER"] = "매개변수 제거";
}

// ============================================================
// 유틸: BLE 연결 확인
// ============================================================
function isBleConnected() {
  return !!state.bluetoothDevice?.gatt?.connected && !!state.characteristic;
}

function validateConnection() {
  if (!isBleConnected()) {
    alert('먼저 피코를 BLE로 연결해주세요!');
    Logger.add('[오류] BLE가 연결되지 않았습니다', 'error');
    return false;
  }
  return true;
}

// 미션 전송 ↔ 비상정지 통합 버튼의 라벨·색·활성 상태를 한곳에서 갱신.
//   - state.isExecuting=true 면 비상정지(빨강, 항상 활성)
//   - 그 외에는 미션 뷰 + BLE 연결 + 대시보드 모드가 아닐 때만 활성
function updateRunButtonUI() {
  const btn = elements.runButton;
  if (!btn) return;
  if (state.isExecuting) {
    btn.textContent = '🛑 비상정지';
    btn.title = '실행 중인 미션을 즉시 멈춥니다';
    btn.classList.add('btn-stop');
    btn.disabled = false;
    updateMobileBottomNav();
    return;
  }
  btn.textContent = '▶️ 미션 전송';
  btn.title = '블록코딩 내용을 피코로 전송해 실행';
  btn.classList.remove('btn-stop');
  const inMission = currentView === 'mission';
  const dashboardFrame = document.getElementById('dashboardFrame');
  const inDashboard = dashboardFrame && dashboardFrame.style.display === 'block';
  btn.disabled = !inMission || inDashboard || !isBleConnected();
  updateMobileBottomNav();
}


// 툴박스 하단 도구 버튼(저장·읽기) → 기존(숨김) 상단 버튼으로 위임해
// 동일 로직(검증·비상정지·저장 프롬프트·파일입력)을 그대로 실행한다.
function setupToolboxActions() {
  const box = document.getElementById('toolboxActions');
  if (!box) return;
  box.addEventListener('click', (event) => {
    const btn = event.target.closest('.tbx-action');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    if (action === 'save') elements.saveButton?.click();
    else if (action === 'load') elements.loadButton?.click();
  });
}

function isInBlockCodingStage() {
  const dashboardFrame = document.getElementById('dashboardFrame');
  const inDashboard = dashboardFrame && dashboardFrame.style.display === 'block';
  return currentView === 'mission' && _contentMode === 'coding' && !inDashboard;
}

// ui.js의 updateBlockCodingButtonUI에 상태 판별 헬퍼를 넘기는 래퍼.
// (인자 없이 호출하면 헬퍼가 () => false로 고정돼 라벨이 "🧩 블록코딩"에 머문다)
function refreshBlockCodingButtonUI() {
  updateBlockCodingButtonUI(undefined, { isDashboardVisible, isInBlockCodingStage });
}

function openBlockCodingWorkspace() {
  const lessonValue = parseInt(document.getElementById('lessonSelect')?.value, 10);
  const missionValue = parseInt(document.getElementById('missionSelect')?.value, 10);
  const lesson = Number.isFinite(lessonValue) ? lessonValue : 1;
  const mission = Number.isFinite(missionValue) ? missionValue : 1;

  const ensureCodingMode = () => {
    const dashboardFrame = document.getElementById('dashboardFrame');
    if (currentView !== 'mission') return false;
    if (dashboardFrame && dashboardFrame.style.display === 'block') {
      closeDashboardToCoding();
    } else if (setContentMode) {
      setContentMode('coding');
    }
    return true;
  };

  if (currentView === 'mission') {
    ensureCodingMode();
    return;
  }

  navigate({ lesson, mission });

  let attempts = 0;
  const poll = () => {
    if (ensureCodingMode()) return;
    if (attempts++ < 60) {
      setTimeout(poll, 50);
    }
  };
  setTimeout(poll, 50);
}

// 블록코딩 버튼/탭에서 호출: 점검 오버레이를 닫고 (미션 뷰라면) 코딩 모드로 전환.
function closeDashboardToCoding() {
  closeDashboard();
  const contentToggleBtn = document.getElementById('contentToggleBtn');
  if (contentToggleBtn) contentToggleBtn.style.display = '';
  if (currentView === 'mission' && setContentMode) setContentMode('coding');
}

function handleBlockCodingButtonClick() {
  if (isDashboardVisible()) {
    closeDashboardToCoding();
    return;
  }
  if (isInBlockCodingStage()) {
    navigate({});
    return;
  }
  openBlockCodingWorkspace();
}

// 점검(대시보드)은 전역 오버레이다. 개요·미션설명·코딩·시뮬 어느 화면에서든
// 그대로 위에 띄우며, 아래 화면 상태는 건드리지 않는다 → 닫으면 원래 위치로 복귀.
function openDashboard() {
  const f = document.getElementById('dashboardFrame');
  if (!f || f.style.display === 'block') return;
  f.style.display = 'block';
  updateRunButtonUI();
  refreshBlockCodingButtonUI();
  updateMobileBottomNav();
  Logger.add('[모드] 점검 화면 열기', 'info');
}

function closeDashboard() {
  const f = document.getElementById('dashboardFrame');
  if (!f || f.style.display !== 'block') return;
  f.style.display = 'none';
  updateRunButtonUI();
  refreshBlockCodingButtonUI();
  updateMobileBottomNav();
  Logger.add('[모드] 점검 화면 닫기', 'info');
}

// 상단 설정 버튼 / 하단바 점검 탭 공통 진입점 — 어디서 눌러도 오버레이로 연다.
function openDashboardFromAnywhere() {
  openDashboard();
}

function isDashboardVisible() {
  const dashboardFrame = document.getElementById('dashboardFrame');
  return !!dashboardFrame && dashboardFrame.style.display === 'block';
}

function isAiPanelOpen() {
  const aiPanel = document.getElementById('aiPanel');
  return !!aiPanel && !aiPanel.hasAttribute('hidden');
}

function isLogExpanded() {
  const logContainer = document.getElementById('logContainer');
  return !!logContainer && logContainer.classList.contains('expanded');
}

function getMobileActiveAction() {
  if (isAiPanelOpen()) return 'ai';
  if (_contentMode === 'simulation' && currentView === 'mission') return 'simulation';
  if (isDashboardVisible()) return 'dashboard';
  // 미션 설명 화면은 "미션", 실제 블록 코딩 화면만 "코딩" 탭을 활성화한다.
  if (currentView === 'mission') return _contentMode === 'coding' ? 'coding' : 'mission';
  return 'mission';
}

function restoreHash(hash) {
  if (typeof hash !== 'string') return;
  const current = window.location.hash || '';
  if (hash === current) return;
  window.location.hash = hash;
}

function updateMobileBottomNav() {
  const nav = document.getElementById('mobileBottomNav');
  if (!nav) return;

  const activeAction = getMobileActiveAction();

  nav.querySelectorAll('[data-mobile-action]').forEach((btn) => {
    const active = btn.dataset.mobileAction === activeAction;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  const connectBtn = nav.querySelector('[data-mobile-action="connect"]');
  if (connectBtn) {
    const codingMode = document.body.dataset.contentMode === 'coding';
    const simMode = document.body.dataset.contentMode === 'simulation';
    const connected = isBleConnected();
    // 실물 실행은 연결 필요(코딩+연결). 시뮬레이션은 연결 없이 항상 '모의실행'.
    // go(초록·▶): 코딩(연결+미실행) 또는 시뮬(미실행). stop(짙은 주황·■): 코딩 실행중=비상정지 / 시뮬 실행중=실험중단.
    const runnable = codingMode && connected;
    const simRunning = simMode && _simRunning;
    const codingExecuting = codingMode && _codingExecuting;
    const stopping = simRunning || codingExecuting;
    const goRun = (runnable && !codingExecuting) || (simMode && !simRunning);
    connectBtn.classList.toggle('connected', connected);
    connectBtn.classList.toggle('coding-run', goRun);
    connectBtn.classList.toggle('run-stop', stopping);
    connectBtn.setAttribute('aria-pressed', String(connected));
    connectBtn.setAttribute('aria-label', codingExecuting ? '비상 정지' : simRunning ? '시뮬레이션 중지' : simMode ? '시뮬레이션 모의 실행' : runnable ? '블록 코딩 실행' : '탐사선 신호 연결');
    const label = connectBtn.querySelector('.mobile-nav-label');
    if (label) {
      label.textContent = codingExecuting
        ? '비상정지'
        : simRunning
        ? '실험중단'
        : simMode
        ? '모의실행'
        : runnable
        ? '실행'
        : connected
        ? '연결됨'
        : state.isConnecting
          ? '연결 중…'
          : state.connectFailed
            ? '재연결'
            : '신호연결';
    }
  }
}

function bindMobileBottomNav() {
  const nav = document.getElementById('mobileBottomNav');
  if (!nav || mobileBottomNavBound) return;
  mobileBottomNavBound = true;

  nav.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-mobile-action]');
    if (!btn) return;

    const action = btn.dataset.mobileAction;
    const activeAction = getMobileActiveAction();
    const parsed = parseHash();
    const lesson = currentLesson ?? parsed.lesson ?? 1;
    const mission = currentMission ?? parsed.mission ?? 1;

    if (action === 'connect') {
      document.getElementById('connectButton')?.blur?.();
      return;
    }

    // 하단바 재클릭 시 토글 해제
    if (action === activeAction) {
      if (action === 'dashboard' && isDashboardVisible()) {
        // 점검은 전역 오버레이 → 그냥 닫으면 아래 원래 화면으로 복귀
        closeDashboard();
      } else if (action === 'ai' && isAiPanelOpen()) {
        document.getElementById('aiPanel')?.setAttribute('hidden', '');
        if (mobileAiReturnHash !== null) {
          const backHash = mobileAiReturnHash;
          mobileAiReturnHash = null;
          restoreHash(backHash);
        }
      } else if (action === 'log' && isLogExpanded()) {
        document.getElementById('logHeader')?.click();
      } else if (action === 'mission' && currentView !== 'overview') {
        // 차시/미션 코딩 화면에서 "미션" 탭을 다시 누르면 메뉴(개요 아코디언)로 복귀
        mobileDashboardReturnHash = null;
        mobileAiReturnHash = null;
        navigate({});
      } else if (action === 'coding' && currentView === 'mission') {
        // 이미 코딩 영역이면 설명 모드였을 때 블록코딩 모드로 전환
        if (setContentMode) setContentMode('coding');
      }
      updateMobileBottomNav();
      btn.blur?.();
      return;
    }

    switch (action) {
      case 'mission':
        // 통합된 "미션" 탭 → 개요 메뉴(차시·미션 아코디언) 화면을 표시
        mobileDashboardReturnHash = null;
        mobileAiReturnHash = null;
        navigate({});
        break;
      case 'coding': {
        // "코딩" 탭 → 마지막으로 선택한(기록된) 미션의 블록코딩 화면으로 진입
        const target = getLastCodingMission();
        const codingLesson = target?.lesson ?? lesson;
        const codingMission = target?.mission ?? mission;
        mobileDashboardReturnHash = null;
        mobileAiReturnHash = null;
        openMissionCoding(codingLesson, codingMission);
        break;
      }
      case 'simulation': {
        if (currentView === 'mission') {
          document.getElementById('simToggle')?.click();
        } else {
          const simTarget = getLastCodingMission();
          const simLesson = simTarget?.lesson ?? lesson;
          const simMission = simTarget?.mission ?? mission;
          navigate({ lesson: simLesson, mission: simMission });
          setTimeout(() => document.getElementById('simToggle')?.click(), 450);
        }
        break;
      }
      case 'dashboard':
        openDashboardFromAnywhere();
        break;
      case 'ai':
        if (currentView !== 'mission') {
          // 개요/차시 화면에서 AI를 열 때도 1차시 1미션으로 리셋하지 말고
          // 마지막으로 선택(기록)한 미션을 유지한다
          const aiTarget = getLastCodingMission();
          const aiLesson = aiTarget?.lesson ?? lesson;
          const aiMission = aiTarget?.mission ?? mission;
          mobileAiReturnHash = window.location.hash || '';
          navigate({ lesson: aiLesson, mission: aiMission });
          pendingDashboardOpen = false;
          setTimeout(() => document.getElementById('aiHelpButton')?.click(), 450);
        } else {
          mobileAiReturnHash = null;
          document.getElementById('aiHelpButton')?.click();
        }
        break;
      case 'log':
        document.getElementById('logHeader')?.click();
        break;
    }

    btn.blur?.();
  });

  updateMobileBottomNav();
}

// ============================================================
// 라우터 (URL hash 기반)
//   #                       → overview
//   #lesson=3               → lesson 3 intro
//   #lesson=3&mission=2     → lesson 3 mission 2 (Blockly)
// ============================================================
function parseHash() {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const lessonRaw = parseInt(params.get('lesson'), 10);
  const missionRaw = parseInt(params.get('mission'), 10);
  const lesson = Number.isFinite(lessonRaw) && lessonRaw >= 1 && lessonRaw <= 12 ? lessonRaw : null;
  const mission = Number.isFinite(missionRaw) && missionRaw >= 1 && missionRaw <= 4 ? missionRaw : null;
  return { lesson, mission: lesson ? mission : null };
}

function navigate({ lesson = null, mission = null } = {}) {
  let target = '';
  if (lesson) {
    target = `lesson=${lesson}`;
    if (mission) target += `&mission=${mission}`;
  }
  const next = '#' + target;
  if (window.location.hash !== next) {
    window.location.hash = next;
  } else {
    applyRoute(); // 같은 해시면 hashchange 미발생 → 직접 적용
  }
}

async function applyRoute() {
  const { lesson, mission } = parseHash();
  if (lesson && mission) {
    await enterMission(lesson, mission);
  } else if (lesson) {
    await enterLesson(lesson);
  } else {
    enterOverview();
  }
}

// ============================================================
// 뷰 전환 + 버튼 활성/비활성
// ============================================================
// 뷰/모드 전환 시 페이지 스크롤을 상단으로 되돌린다. 모바일 레이아웃에선 window 가
// 스크롤 컨테이너이고, 전환 직후 콘텐츠 리플로우가 스크롤을 되돌릴 수 있어
// 다음 프레임에 한 번 더 초기화한다.
function resetScrollTop() {
  const toTop = () => {
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  };
  toTop();
  requestAnimationFrame(toTop);
}

function showView(view) {
  for (const v of ['overview', 'lesson', 'mission']) {
    const el = document.getElementById(v + 'View');
    if (el) el.hidden = (v !== view);
  }
  currentView = view;

  // 내비게이션으로 뷰가 바뀌면 그 화면의 스크롤을 항상 상단으로 초기화.
  // 데스크톱(≥769px)은 뷰 요소가 스크롤 컨테이너, 모바일(≤768px)은 뷰가
  // overflow:visible 이라 페이지(window) 자체가 스크롤된다 → 둘 다 초기화.
  const activeView = document.getElementById(view + 'View');
  if (activeView) {
    activeView.scrollTop = 0;
    activeView.querySelector('.mission-panel')?.scrollTo?.({ top: 0 });
  }
  resetScrollTop();

  const inMission = view === 'mission';
  // 미션 뷰일 때만 코딩 관련 버튼 활성화
  if (elements.saveButton) elements.saveButton.disabled = !inMission;
  if (elements.loadButton) elements.loadButton.disabled = !inMission;
  const exampleSelect = document.getElementById('exampleSelect');
  if (exampleSelect) {
    exampleSelect.disabled = !inMission;
    exampleSelect.hidden = !inMission;
  }
  const aiHelpButton = document.getElementById('aiHelpButton');
  if (aiHelpButton) aiHelpButton.hidden = !inMission;
  if (!inMission) document.getElementById('aiPanel')?.setAttribute('hidden', '');
  updateRunButtonUI();

  // 콘텐츠 토글 버튼은 미션 뷰에서만 노출
  const contentBtn = document.getElementById('contentToggleBtn');
  if (contentBtn) contentBtn.hidden = !inMission;

  // 시뮬레이션 버튼은 미션 뷰에서만 노출, 뷰를 떠날 때 카드 닫기
  const simToggle = document.getElementById('simToggle');
  if (simToggle) simToggle.hidden = !inMission;
  if (!inMission) {
    if (simController) simController.close();
    // 닫힘 애니메이션이 뒤늦게 끝나도 _preSimMode 영향을 받지 않도록 초기화
    _preSimMode = 'description';
    document.body.removeAttribute('data-content-mode');   // 네비 즉시 복원(닫힘 애니메이션 대기 안 함)
  }

  // 미션 뷰 진입 시 항상 미션 설명 모드로 시작
  if (inMission && setContentMode) setContentMode('description');

  // 미션 뷰에 진입할 때만 Blockly 리사이즈
  if (inMission && workspace) {
    setTimeout(() => { try { Blockly.svgResize(workspace); } catch {} }, 0);
  }
  refreshBlockCodingButtonUI();
  if (!inMission) pendingDashboardOpen = false;
  updateMobileBottomNav();
}

// ============================================================
// 개요 뷰
// ============================================================
async function enterOverview() {
  showView('overview');
  currentLesson = null;
  currentMission = null;
  document.getElementById('lessonSelect').value = '';
  populateMissionSelect(null);
  updateBreadcrumb(null, null);

  // 개요 콘텐츠 로드 (한 번만)
  const container = document.getElementById('overviewContent');
  if (container && container.dataset.loaded !== 'true') {
    try {
      const res = await fetch('overview.html', { cache: 'no-store' });
      container.innerHTML = await res.text();
      container.dataset.loaded = 'true';

      // 개요 차시 표 렌더링
      const tbody = document.getElementById('overviewLessonTableBody');
      if (tbody) {
        tbody.innerHTML = LESSON_CATALOG.map(l => l.bonus ? `
          <tr class="bonus" data-lesson-item="bonus">
            <td class="lesson-n">${l.n}</td>
            <td class="lesson-title-cell">${escapeHtml(l.title)}</td>
            <td>${escapeHtml(l.hardware)}</td>
            <td>${escapeHtml(l.concept)}</td>
            <td><span class="tag tag-BONUS">${escapeHtml(l.tag)}</span></td>
          </tr>
         ` : `
          <tr data-lesson="${l.n}">
            <td class="lesson-n">${l.n}</td>
            <td class="lesson-title-cell">
              <a href="#lesson=${l.n}">${escapeHtml(l.title)}</a>
            </td>
            <td>${escapeHtml(l.hardware)}</td>
            <td>${escapeHtml(l.concept)}</td>
            <td><span class="tag tag-${l.tag}">${escapeHtml(l.tag)}</span></td>
          </tr>
         `).join('');
       }

       // 12개 차시 + 보너스(+) 항목을 아코디언형 버튼 목록으로 생성
       const flowContainer = document.getElementById('lessonFlowContainer');
       if (flowContainer) {
         flowContainer.innerHTML = LESSON_CATALOG.map(lesson => lesson.bonus ? `
           <section class="lesson-accordion-item bonus" data-lesson-item="bonus">
             <button class="flow-step-btn" data-bonus="1" aria-expanded="false" aria-controls="inlineMissionsBonus">
               <span class="flow-num">${lesson.n}</span>
               <span class="flow-main">
                 <strong>${escapeHtml(lesson.title)}</strong>
                 <small>${escapeHtml(lesson.hardware)}</small>
               </span>
               <span class="flow-arrow" aria-hidden="true">◀</span>
             </button>
             <div id="inlineMissionsBonus" class="lesson-panel" hidden></div>
           </section>
         ` : `
           <section class="lesson-accordion-item" data-lesson-item="${lesson.n}">
             <button class="flow-step-btn" data-lesson="${lesson.n}" aria-expanded="false" aria-controls="inlineMissions${lesson.n}">
               <span class="flow-num">${lesson.n}</span>
               <span class="flow-main">
                 <strong>${escapeHtml(lesson.title)}</strong>
                 <small>${escapeHtml(lesson.hardware)}</small>
               </span>
               <span class="flow-count">${completedMissionCount(lesson.n)}/4</span>
               <span class="flow-arrow" aria-hidden="true">◀</span>
             </button>
             <div id="inlineMissions${lesson.n}" class="lesson-panel" hidden></div>
           </section>
         `).join('');

         flowContainer.addEventListener('click', async (event) => {
           // (0) 「착륙 실시」 버튼 → 착륙 게임 모듈을 필요할 때만 로드해 실행
           if (event.target.closest('.landing-start-btn')) {
             try {
               const { launchLandingGame } = await import('./landing_game.js');
               launchLandingGame();
             } catch (e) {
               Logger.add(`[오류] 착륙 게임 로드 실패: ${e.message}`, 'error');
             }
             return;
           }

           // (1) 미션 코딩 버튼 → 해당 미션 선택 + 블록코딩 모드로 전환
           const codeBtn = event.target.closest('.mission-code-btn');
           if (codeBtn) {
             openMissionCoding(Number(codeBtn.dataset.lesson), Number(codeBtn.dataset.mission));
             return;
           }

           // (2) 미션 버튼 → 미션 상세 정보를 아래로 펼침 (개요를 떠나지 않음)
           const missionButton = event.target.closest('.inline-mission-btn');
           if (missionButton) {
             navigate({
               lesson: Number(missionButton.dataset.lesson),
               mission: Number(missionButton.dataset.inlineMission),
             });
             return;
           }

           // 차시 버튼 → 네 개의 미션 리스트를 펼침
           const lessonButton = event.target.closest('.flow-step-btn');
           if (!lessonButton) return;
           const item = lessonButton.closest('.lesson-accordion-item');
           const panel = item?.querySelector('.lesson-panel');
           if (!panel) return;

           const willOpen = panel.hasAttribute('hidden');
           flowContainer.querySelectorAll('.lesson-panel:not([hidden])').forEach(openPanel => {
             if (openPanel !== panel) {
               closeAccordion(openPanel);
               openPanel.previousElementSibling?.setAttribute('aria-expanded', 'false');
             }
           });

           if (!willOpen) {
             closeAccordion(panel);
             lessonButton.setAttribute('aria-expanded', 'false');
             return;
           }

           // 보너스(+) 항목 — 착륙 게임을 로드하는 「착륙 실시」 버튼을 펼친다
           if (lessonButton.dataset.bonus === '1') {
             panel.innerHTML = `
               <div class="inline-lesson-info bonus-teaser">
                 <h4 class="inline-lesson-info-title">🚀 화성에 착륙하기</h4>
                 <p>불규칙한 행성 지면 위로 떨어지는 우주선을 <strong>역추진</strong>으로 감속해 착륙시켜요.<br>위쪽 화살표(↑)나 화면의 <strong>역추진</strong> 버튼을 눌러, 지면에 <strong>천천히</strong> 내려앉히면 성공!</p>
                 <button type="button" class="landing-start-btn">🛸 착륙 실시</button>
               </div>`;
             openAccordion(panel);
             lessonButton.setAttribute('aria-expanded', 'true');
             item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
             return;
           }

           const lessonNum = Number(lessonButton.dataset.lesson);
           const data = await loadLesson(lessonNum);
           if (!data?.missions) return;
           // PDF 3페이지처럼 펼친 카드 안에는 미션 4개만 간결하게 표시
           panel.innerHTML = `
             <div class="inline-mission-list">
               ${data.missions.map(m => renderInlineMissionItem(lessonNum, m)).join('')}
             </div>
           `;
           openAccordion(panel);
           lessonButton.setAttribute('aria-expanded', 'true');
           item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
         });
       }
     } catch (e) {
      container.innerHTML = '<p style="color:#E74C3C">개요를 불러오지 못했습니다.</p>';
      Logger.add(`[오류] overview.html 로드 실패: ${e.message}`, 'error');
    }
  }
}

// ============================================================
// 개요 인라인 렌더 헬퍼 (차시 → 미션 목록)
// ============================================================
function renderInlineMissionItem(n, mission) {
  const completed = isMissionCompleted(n, mission.id);
  return `
    <div class="inline-mission-item" data-mission-item="${mission.id}">
      <button type="button" class="inline-mission-btn${completed ? ' completed' : ''}"
              data-lesson="${n}" data-inline-mission="${mission.id}"
              aria-label="${escapeHtml(mission.title)} 미션 열기">
        <span class="inline-mission-marker" aria-hidden="true">▶</span>
        <span class="inline-mission-main">
          <strong>${escapeHtml(mission.title)}</strong>
        </span>
        <span class="inline-mission-check" ${completed ? '' : 'hidden'} aria-label="완료">✓</span>
      </button>
    </div>`;
}

// 아코디언 여닫이 애니메이션 (열림 240ms / 닫힘 180ms). CSS 클래스로 제어하고,
// 실제 콘텐츠 높이를 --acc-h 로 넘겨 높이 변화가 자연스럽게 보이도록 한다.
const ACCORDION_OPEN_MS = 240;
const ACCORDION_CLOSE_MS = 180;

function openAccordion(el) {
  if (!el) return;
  if (el._accTimer) { clearTimeout(el._accTimer); el._accTimer = null; }
  el.classList.remove('accordion-closing', 'accordion-opening');
  el.removeAttribute('hidden');
  el.style.setProperty('--acc-h', el.scrollHeight + 'px'); // 표시 후 전체 높이 측정
  void el.offsetWidth;                                     // 리플로우 → 애니메이션 재시작 보장
  el.classList.add('accordion-opening');
  const done = (e) => {
    if (e && e.target !== el) return;
    el.classList.remove('accordion-opening');
    el.style.removeProperty('--acc-h');
    el.removeEventListener('animationend', done);
    if (el._accTimer) { clearTimeout(el._accTimer); el._accTimer = null; }
  };
  el.addEventListener('animationend', done);
  el._accTimer = setTimeout(done, ACCORDION_OPEN_MS + 120);
}

function closeAccordion(el) {
  if (!el || el.hasAttribute('hidden')) return;
  if (el.classList.contains('accordion-closing')) return; // 이미 닫히는 중이면 무시
  if (el._accTimer) { clearTimeout(el._accTimer); el._accTimer = null; }
  el.classList.remove('accordion-opening');
  el.style.setProperty('--acc-h', el.scrollHeight + 'px');
  void el.offsetWidth;
  el.classList.add('accordion-closing');
  const done = (e) => {
    if (e && e.target !== el) return;
    el.classList.remove('accordion-closing');
    el.style.removeProperty('--acc-h');
    el.setAttribute('hidden', '');               // 애니메이션이 끝난 뒤에야 숨김
    el.removeEventListener('animationend', done);
    if (el._accTimer) { clearTimeout(el._accTimer); el._accTimer = null; }
  };
  el.addEventListener('animationend', done);
  el._accTimer = setTimeout(done, ACCORDION_CLOSE_MS + 120);
}

// 미션 코딩 시작 → 해당 미션으로 이동 후 블록코딩 모드로 전환
function openMissionCoding(lesson, mission) {
  if (!Number.isFinite(lesson) || !Number.isFinite(mission)) return;
  navigate({ lesson, mission });
  // 미션 뷰 진입은 해시 변경 후 비동기로 이뤄지므로, 진입을 확인한 뒤 코딩 모드로 전환
  let attempts = 0;
  const poll = () => {
    if (currentView === 'mission') {
      // 점검(대시보드) iframe이 열려 있으면 닫아야 blocklyDiv가 드러난다
      // (openBlockCodingWorkspace와 동일한 처리 — 안 닫으면 화면에 갇힘)
      const dashboardFrame = document.getElementById('dashboardFrame');
      if (dashboardFrame && dashboardFrame.style.display === 'block') {
        closeDashboardToCoding();
      } else if (setContentMode) {
        setContentMode('coding');
      }
      return;
    }
    if (attempts++ < 60) setTimeout(poll, 50);
  };
  setTimeout(poll, 50);
}

// ============================================================
// 차시 소개 뷰
// ============================================================
async function enterLesson(n) {
  const data = await loadLesson(n);
  if (!data) {
    enterOverview();
    return;
  }
  showView('lesson');
  currentLesson = n;
  currentMission = null;
  document.getElementById('lessonSelect').value = String(n);
  populateMissionSelect(n, data);
  updateBreadcrumb(n, null);

  document.getElementById('lessonHeading').textContent = `${n}차시 — ${data.title}`;
  document.getElementById('lessonTagBadge').textContent = data.tag;
  document.getElementById('lessonTagBadge').className = `lesson-tag tag-${data.tag}`;
  document.getElementById('lessonHardware').textContent = `🔧 ${data.hardware}`;
  document.getElementById('lessonConcept').textContent = `💡 ${data.concept}`;
  document.getElementById('lessonIntro').textContent = data.intro;

  const ml = document.getElementById('lessonMissionList');
  ml.innerHTML = data.missions.map(m => `
    <li class="mission-list-item">
      <a href="#lesson=${n}&mission=${m.id}">
        <span class="mission-id">미션 ${m.id}</span>
        <span class="mission-list-title">${escapeHtml(m.title)}</span>
        <span class="mission-list-hw">${escapeHtml(m.hardware)}</span>
      </a>
    </li>
  `).join('');

  const sm = document.getElementById('lessonSummary');
  if (data.summary) {
    sm.innerHTML = `
      <div class="summary-box summary-${data.summary.type}">
        <h4>${escapeHtml(data.summary.title)}</h4>
        <p>${escapeHtml(data.summary.text)}</p>
      </div>
    `;
  } else {
    sm.innerHTML = '';
  }
}

// ============================================================
// 미션 코딩 뷰
// ============================================================
async function enterMission(n, m) {
  const data = await loadLesson(n);
  if (!data) { enterOverview(); return; }
  const mission = data.missions.find(x => x.id === m);
  if (!mission) { enterLesson(n); return; }

  showView('mission');
  currentLesson = n;
  currentMission = m;
  rememberCodingMission(n, m);   // 하단 "코딩" 탭이 돌아올 미션으로 기록
  document.getElementById('lessonSelect').value = String(n);
  populateMissionSelect(n, data);
  document.getElementById('missionSelect').value = String(m);
  updateBreadcrumb(n, m);

  // Set active model based on lesson (9-12 are launchpad, 1-8 are gun)
  if (n >= 9) {
    state.activeModel = 'launchpad';
  } else {
    state.activeModel = 'gun';
  }
  if (window.updateToolboxForActiveState) {
    window.updateToolboxForActiveState();
  }

  document.getElementById('missionHeading').textContent = `${n}차시 미션 ${m} - ${mission.title}`;
  // 코딩 영역 상단 배너: 기록된(현재) 차시·미션 표시
  const codingLabel = document.getElementById('codingMissionLabel');
  if (codingLabel) codingLabel.textContent = `${n}차시 · 미션 ${m} — ${mission.title}`;
  document.getElementById('missionTagBadge').textContent = mission.tag;
  document.getElementById('missionTagBadge').className = `lesson-tag tag-${mission.tag}`;
  document.getElementById('missionHardware').textContent = mission.hardware;

  // 스토리
  const storyEl = document.getElementById('missionStory');
  const storyLines = (mission.story || []).map(line => `
    <div class="story-line story-${line.speaker}">
      <span class="story-avatar"><img src="assets/design/avatar-${line.speaker}.png" alt="${line.speaker === 'ares' ? '아레스' : '알비'}"></span>
      <span class="story-name">${line.speaker === 'ares' ? '아레스' : '알비'}</span>
      <span class="story-text">${escapeHtml(line.text)}</span>
    </div>
  `).join('');
  storyEl.innerHTML = `${storyLines}
    <div class="story-line story-ares story-goal-question">
      <span class="story-avatar"><img src="assets/design/avatar-ares.png" alt="아레스"></span>
      <span class="story-name">아레스</span>
      <span class="story-text">우와! 그러면 오늘 학습목표는 뭐야?</span>
    </div>`;

  // 학습 목표
  const goalsEl = document.getElementById('missionGoals');
  goalsEl.innerHTML = (mission.goals || []).map(g => `<li>${escapeHtml(g)}</li>`).join('');

  // 샘플 코드
  document.getElementById('missionSampleCode').textContent = mission.sampleCode || '';

  // 이전/다음 미션 버튼
  const prev = document.getElementById('prevMissionBtn');
  const next = document.getElementById('nextMissionBtn');
  prev.disabled = (m <= 1 && n <= 1);
  next.disabled = (m >= 4 && n >= 12);
  prev.onclick = () => {
    if (m > 1) navigate({ lesson: n, mission: m - 1 });
    else if (n > 1) navigate({ lesson: n - 1, mission: 4 });
  };
  next.onclick = () => {
    if (m < 4) navigate({ lesson: n, mission: m + 1 });
    else if (n < 12) navigate({ lesson: n + 1, mission: 1 });
  };

  // Blockly 리사이즈
  if (workspace) {
    setTimeout(() => { try { Blockly.svgResize(workspace); } catch {} }, 0);
  }

  if (pendingDashboardOpen) {
    pendingDashboardOpen = false;
    setTimeout(() => {
      if (currentView === 'mission' && !isDashboardVisible()) {
        toggleDashboard();
      }
    }, 0);
  }
}

// ============================================================
// lesson.json 로더 + 캐시
// ============================================================
async function loadLesson(n) {
  if (!Number.isFinite(Number(n))) return null;   // 보너스(+) 등 비정상 차시 방어
  if (lessonCache.has(n)) return lessonCache.get(n);
  const padded = String(n).padStart(2, '0');
  const url = `Lesson${padded}/lesson.json`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    lessonCache.set(n, json);
    return json;
  } catch (e) {
    Logger.add(`[오류] ${url} 로드 실패: ${e.message}`, 'error');
    return null;
  }
}

// ============================================================
// 네비게이션 UI
// ============================================================
function buildLessonSelect() {
  const sel = document.getElementById('lessonSelect');
  if (!sel) return;
  for (const l of LESSON_CATALOG) {
    if (l.bonus) continue;   // 보너스(+) 항목은 드롭다운에서 제외
    const opt = document.createElement('option');
    opt.value = String(l.n);
    opt.textContent = `${l.n}차시 — ${l.title}`;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    const n = parseInt(sel.value, 10);
    if (Number.isFinite(n)) navigate({ lesson: n });
    else navigate({});
  });
}

function populateMissionSelect(n, data = null) {
  const sel = document.getElementById('missionSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">미션 선택…</option>';
  if (!n) { sel.disabled = true; return; }
  sel.disabled = false;

  const missions = data?.missions || [];
  if (missions.length === 0) {
    // 데이터 로드 전이라면 1~4 기본
    for (let i = 1; i <= 4; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `미션 ${i}`;
      sel.appendChild(opt);
    }
  } else {
    for (const m of missions) {
      const opt = document.createElement('option');
      opt.value = String(m.id);
      opt.textContent = `미션 ${m.id} — ${m.title}`;
      sel.appendChild(opt);
    }
  }
}

function updateBreadcrumb(n, m) {
  const bc = document.getElementById('breadcrumb');
  if (!bc) return;
  if (n && m) bc.textContent = `${n}차시 › 미션 ${m}`;
  else if (n) bc.textContent = `${n}차시`;
  else bc.textContent = '';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// 대시보드 전환
// ============================================================
function toggleDashboard() {
  if (isDashboardVisible()) closeDashboard();
  else openDashboard();
}


// ============================================================
// 로그 컨테이너 토글
// ============================================================
// ============================================================
// 3D 시뮬레이션 컨트롤러 — 실제 구현은 Simulation/Simulation_Main.js
//   showView() 에서 미션 뷰를 떠날 때 close() 호출.
// ============================================================
let simController = null;
let _simRunning = false;      // 시뮬레이션(모의실행) 진행 여부 — 중앙 버튼 상태에 반영
let _codingExecuting = false; // 코딩 모드 실행(전송) 진행 여부 — '비상정지' 표시에 반영

// ============================================================
// 콘텐츠 모드 토글 — 미션 설명 ↔ 블럭코딩 단일 버튼
//   미션 뷰는 description / coding / simulation 중 하나만 표시한다.
//   시뮬레이션은 simToggle 로 진입하며, 닫으면 직전 모드(description 또는 coding)로 복귀.
// ============================================================
// ============================================================
// 항상 켜 있는 이벤트 리스너 (BLE, 비상 정지, 로그 등)
// ============================================================
function initializeAlwaysOnListeners() {
  // 툴박스 하단 도구 버튼(저장·읽기) 위임 배선
  setupToolboxActions();

  // 상단 ARES 로고 → "만든 사람들"(크레딧) WebGL 오버레이 (필요할 때만 로드)
  document.querySelector('.ares-brand')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const { openCredits } = await import('./credits.js?v=20260705m');
      openCredits();
    } catch (err) {
      Logger.add(`[오류] 크레딧 로드 실패: ${err.message}`, 'error');
    }
  });

  // 신호 연결 통합 버튼: 현재 상태에 따라 connect / disconnect / retry 분기
  elements.connectButton?.addEventListener('click', (e) => {
    const mode = document.body.dataset.contentMode;
    // 시뮬레이션 모드: 연결 없이 모의실행/실험중단 — 시뮬 컨트롤러의 toggleSimRun 호출.
    if (mode === 'simulation') {
      simController?.toggleSimRun?.();
      e.currentTarget?.blur?.();
      return;
    }
    // 코딩 모드라도 연결돼 있어야 실행. 미연결이면 실행 대신 연결을 시도한다.
    if (mode === 'coding' && isBleConnected()) {
      elements.runButton?.click();
      e.currentTarget?.blur?.();
      return;
    }
    if (isBleConnected()) {
      BluetoothManager.disconnect();
    } else {
      BluetoothManager.connect();
    }
    e.currentTarget?.blur?.();
  });

  // 로그 지우기
  elements.clearLogBtn?.addEventListener('click', (e) => {
    Logger.clear();
    Logger.refresh();
    e.currentTarget?.blur?.();
  });

  // 블록코딩 바로가기
  document.getElementById('blockCodingButton')?.addEventListener('click', (e) => {
    handleBlockCodingButtonClick();
    e.currentTarget?.blur?.();
  });

  // 상단 점검 버튼: 미션 뷰로 이동 후 대시보드(점검화면)를 토글
  document.getElementById('inspectButton')?.addEventListener('click', (e) => {
    openDashboardFromAnywhere();
    e.currentTarget?.blur?.();
  });

  // 연결 상태 변화 / 실행 시작·종료 → runButton 라벨/활성 갱신
  window.addEventListener('ares:connection', updateRunButtonUI);
  window.addEventListener('ares:execution',  updateRunButtonUI);
  window.addEventListener('ares:contentmode', updateMobileBottomNav);
  window.addEventListener('ares:simrun', (e) => {
    _simRunning = !!(e.detail && e.detail.running);
    updateMobileBottomNav();
  });
  window.addEventListener('ares:execution', (e) => {
    _codingExecuting = !!(e.detail && e.detail.executing);
    updateMobileBottomNav();
  });

  // 홈(개요)
  document.getElementById('homeButton')?.addEventListener('click', (e) => {
    navigate({});
    e.currentTarget?.blur?.();
  });

  // 미션 드롭다운
  document.getElementById('missionSelect')?.addEventListener('change', (e) => {
    const m = parseInt(e.target.value, 10);
    const n = parseInt(document.getElementById('lessonSelect').value, 10);
    if (Number.isFinite(n) && Number.isFinite(m)) {
      navigate({ lesson: n, mission: m });
    }
  });

  // 페이지 종료 시 연결 해제
  window.addEventListener('beforeunload', () => {
    if (state.bluetoothDevice?.gatt?.connected) {
      BluetoothManager.disconnect();
    }
  });

  // 해시 변경 시 라우트 적용
  window.addEventListener('hashchange', applyRoute);
}

// ============================================================
// 미션 뷰 전용 이벤트 (Blockly 워크스페이스 의존)
// ============================================================
function initializeMissionListeners(ws) {
  // 미션 전송 / 비상정지 통합 버튼
  elements.runButton?.addEventListener('click', async () => {
    if (state.isExecuting) {
      // 비상정지 모드 — 실행 중인 명령 흐름을 중단하고 STOP_ALL 전송
      Logger.add('[비상정지] 실행됨', 'error');
      state.isExecuting = false;
      updateRunButtonUI();
      if (isBleConnected()) {
        try {
          await BluetoothManager.emergencyStop();
          Logger.add('[비상정지] 모든 하드웨어 정지 완료', 'info');
        } catch (error) {
          Logger.add(`[오류] 비상 정지 전송 실패: ${error.message}`, 'error');
        }
      } else {
        Logger.add('[비상정지] 블루투스 미연결 - 블록만 중단됨', 'info');
      }
      return;
    }
    if (!validateConnection()) return;
    try {
      const completed = await CommandExecutor.executeWorkspace(ws);
      if (completed && currentLesson && currentMission) {
        markMissionCompleted(currentLesson, currentMission);
        Logger.add(`[미션] ${currentLesson}차시 ${currentMission}번 완료 기록`, 'info');
      }
    } catch (error) {
      console.error('명령 실행 오류:', error);
      alert('명령 실행 중 오류가 발생했습니다: ' + error.message);
      Logger.add(`[오류] 명령 실행 실패: ${error.message}`, 'error');
    }
  });

  // 저장 — 지원 브라우저(Chrome/Edge)에서는 "다른 이름으로 저장" 창으로 위치·이름을
  // 직접 지정. 미지원/차단 시 기존 다운로드(브라우저 다운로드 폴더) 방식으로 폴백.
  elements.saveButton?.addEventListener('click', async () => {
    const xml = Blockly.Xml.workspaceToDom(ws);
    const xmlText = Blockly.Xml.domToPrettyText(xml);

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'Ares_Workspace.xml',
          types: [{ description: 'ARES 미션 파일', accept: { 'application/xml': ['.xml'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(xmlText);
        await writable.close();
        Logger.add(`[파일] ${handle.name} 저장 완료`, 'info');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;   // 사용자가 저장창을 취소
        // iframe 차단 등으로 실패하면 아래 다운로드 방식으로 폴백
        console.warn('showSaveFilePicker 실패 → 다운로드로 폴백:', err);
      }
    }

    // 폴백: 파일명만 입력받아 브라우저 다운로드 폴더에 저장
    const fileName = prompt("저장할 파일 이름을 입력하세요 (확장자 제외):", "Ares_Workspace");
    if (!fileName) return;
    const blob = new Blob([xmlText], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Logger.add(`[파일] ${fileName}.xml 다운로드`, 'info');
  });

  // 불러오기
  elements.loadButton?.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const xmlText = e.target.result;
      try {
        const xml = Blockly.utils.xml.textToDom(xmlText);
        ws.clear();
        Blockly.Xml.domToWorkspace(xml, ws);
        Logger.add(`[파일] ${file.name} 불러오기 완료`, 'info');
      } catch (err) {
        alert('Blockly 작업 공간을 불러오는 데 실패했습니다. 유효한 XML 파일인지 확인해주세요.');
        Logger.add(`[오류] ${file.name} 파일 로드 실패`, 'error');
        console.error('Error loading workspace:', err);
      }
    };
    reader.readAsText(file);
  });

  // 예제 드롭다운
  document.getElementById('exampleSelect')?.addEventListener('change', async (e) => {
    const name = e.target.value;
    if (!name) return;
    const url = new URL(`examples/${name}.xml`, window.location.href).href;
    Logger.add(`[예제] 요청: ${url}`, 'info');
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const xmlText = await res.text();
      Logger.add(`[예제] 다운로드 ${xmlText.length} bytes`, 'info');
      const xml = Blockly.utils.xml.textToDom(xmlText);
      ws.clear();
      Blockly.Xml.domToWorkspace(xml, ws);

      // 예제 적재 시 블록코딩 화면으로 자동 전환
      if (setContentMode) setContentMode('coding');
      const blocklyDiv = document.getElementById('blocklyDiv');
      const dashboardFrame = document.getElementById('dashboardFrame');
      if (blocklyDiv && dashboardFrame && dashboardFrame.style.display === 'block') {
        dashboardFrame.style.display = 'none';
        blocklyDiv.style.display = 'block';
      }
      Blockly.svgResize(ws);
      ws.scrollCenter();
      const count = ws.getAllBlocks(false).length;
      Logger.add(`[예제] ${name} 로드 완료 — 블록 ${count}개`, 'info');
    } catch (err) {
      alert('예제 불러오기에 실패했습니다: ' + err.message);
      Logger.add(`[오류] 예제 불러오기 실패: ${err.message}`, 'error');
      console.error('[예제 로드 오류]', err);
    } finally {
      e.target.value = '';
    }
  });

  // 배너의 예제 드롭다운 → 기존 exampleSelect 로 위임(예제 로드 로직 재사용)
  document.getElementById('codingExampleSelect')?.addEventListener('change', (e) => {
    const val = e.target.value;
    e.target.selectedIndex = 0;   // 배너 드롭다운은 다시 "예제 선택"으로 복귀
    if (!val) return;
    const orig = document.getElementById('exampleSelect');
    if (orig) { orig.value = val; orig.dispatchEvent(new Event('change')); }
  });

  // ===== 🤖 AI 도움 — 자연어 → 블록 (오프라인 규칙 기반, 외부 통신 없음) =====
  const aiPanel = document.getElementById('aiPanel');
  const aiMessages = document.getElementById('aiMessages');
  const aiInput = document.getElementById('aiInput');
  const aiForm = document.getElementById('aiForm');

  function aiAddMessage(role, html) {
    if (!aiMessages) return;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role}`;
    div.innerHTML = html;
    aiMessages.appendChild(div);
    aiMessages.scrollTop = aiMessages.scrollHeight;
  }

  function aiEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 생성된 XML 을 워크스페이스에 삽입. replace=true 면 기존 블록을 지우고,
  // 아니면 기존 블록 스택의 끝에 이어 붙인다.
  function aiInsertXml(xmlText, replace) {
    const dom = Blockly.utils.xml.textToDom(xmlText);
    if (replace) {
      ws.clear();
      Blockly.Xml.domToWorkspace(dom, ws);
    } else {
      // 기존 첫 명령 스택의 마지막 블록을 찾아 둔다
      let tail = null;
      for (const b of ws.getTopBlocks(true)) {
        if (b.previousConnection || b.nextConnection) {
          let cur = b;
          while (cur.getNextBlock()) cur = cur.getNextBlock();
          tail = cur;
          break;
        }
      }
      const ids = Blockly.Xml.domToWorkspace(dom, ws);
      let head = null;
      for (const id of ids) {
        const b = ws.getBlockById(id);
        if (b && b.previousConnection) { head = b; break; }
      }
      if (tail && head && tail.nextConnection && head.previousConnection) {
        tail.nextConnection.connect(head.previousConnection);
      }
    }
    if (setContentMode) setContentMode('coding');
    setTimeout(() => { try { Blockly.svgResize(ws); ws.scrollCenter(); } catch {} }, 0);
  }

  // 추천 블록 목록을 HTML 로 (완성형 코드를 못 만들 때 "이런 블록을 써보세요")
  function aiFormatSuggest(suggest) {
    if (!suggest || !suggest.length) return '';
    return suggest.map((s) =>
      `<div class="ai-suggest"><b>${aiEscape(s.title)}</b><br>${s.blocks.map(aiEscape).join(' · ')}` +
      `<br><span class="ai-hint">${aiEscape(s.hint)}</span></div>`).join('');
  }

  function aiHandle(text) {
    if (!text.trim()) return;
    aiAddMessage('user', aiEscape(text));
    const result = aiParse(text);
    if (!result.ok) {
      const sug = aiFormatSuggest(result.suggest);
      aiAddMessage('bot',
        sug
          ? `${aiEscape(result.error)} 완성은 어렵지만 이런 블록들을 써보세요:${sug}`
          : `${aiEscape(result.error)}<br>이렇게 말해볼까요? <em>앞으로 2초 가기 · 불 켜줘 · 도레미 울려줘</em>`);
      Logger.add(`[AI] 이해 실패: "${text}"`, 'warning');
      return;
    }
    try {
      aiInsertXml(result.xml, result.replace);
    } catch (err) {
      aiAddMessage('bot', '블록을 넣는 중 문제가 생겼어요. 다시 말해줄래요?');
      Logger.add(`[AI] 삽입 오류: ${err.message}`, 'error');
      console.error('[AI 삽입 오류]', err);
      return;
    }
    const list = result.added.map((a) => `• ${aiEscape(a)}`).join('<br>');
    let msg = `코딩창에 ${result.added.length}개를 넣었어요!<br>${list}`;
    if (result.replace) msg = `기존 블록을 지우고 새로 넣었어요!<br>${list}`;
    if (result.unmatched && result.unmatched.length) {
      msg += `<br><span class="ai-warn">못 알아들은 부분: ${aiEscape(result.unmatched.join(', '))}</span>`;
      const sug = aiFormatSuggest(result.suggest);
      if (sug) msg += `<br>이런 블록도 도움이 돼요:${sug}`;
    }
    aiAddMessage('bot', msg);
    Logger.add(`[AI] 블록 ${result.added.length}개 생성 — "${text}"`, 'info');
  }

  document.getElementById('aiHelpButton')?.addEventListener('click', (e) => {
    if (!aiPanel) return;
    const open = aiPanel.hasAttribute('hidden');
    if (open) {
      aiPanel.removeAttribute('hidden');
      if (aiMessages && !aiMessages.childElementCount) {
        aiAddMessage('bot', '안녕! 하고 싶은 일을 적어줘. 예: <em>앞으로 3초 가고 도레미 울려줘</em>');
      }
      setTimeout(() => aiInput?.focus(), 0);
    } else {
      aiPanel.setAttribute('hidden', '');
    }
    updateMobileBottomNav();
    e.currentTarget?.blur?.();
  });
  document.getElementById('aiCloseButton')?.addEventListener('click', (e) => {
    aiPanel?.setAttribute('hidden', '');
    updateMobileBottomNav();
    e.currentTarget?.blur?.();
  });
  aiForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = aiInput.value;
    aiInput.value = '';
    aiHandle(text);
  });
  document.querySelectorAll('.ai-chip').forEach((chip) => {
    chip.addEventListener('click', () => aiHandle(chip.textContent));
  });

  // 대시보드 메시지 (iframe → main)
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || !data.type) return;
    if (data.type === 'command') {
      const cmd = data.data;
      Logger.add(`[대시보드] ${cmd}`, 'info');
      if (cmd === 'STOP' || cmd === 'STOP_ALL') {
        try {
          state.isExecuting = false;
          updateRunButtonUI();
          await BluetoothManager.emergencyStop(cmd);
          Logger.add('[비상정지] 모든 하드웨어 정지 완료', 'info');
        } catch (error) {
          Logger.add(`[오류] 비상 정지 전송 실패: ${error.message}`, 'error');
        }
        return;
      }
      const needsResponse = cmd === 'GET_SYS' || cmd === 'GET_STATUS' || cmd === 'GET_MODULES' || cmd === 'GET_NAMES';
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await BluetoothManager.sendData(cmd, needsResponse);
          break;
        } catch (error) {
          if (attempt < 2 && error.message.includes('시간 초과')) {
            Logger.add(`[재시도] ${cmd} (${attempt}/2)`, 'warning');
            await new Promise(r => setTimeout(r, 300));
          } else {
            if (error.message.includes('시간 초과')) {
              Logger.add(`[경고] 응답 없음: ${cmd}`, 'warning');
            } else {
              Logger.add(`[오류] 전송 실패: ${error.message}`, 'error');
            }
          }
        }
      }
    }
    if (data.type === 'exit_dashboard') {
      // dashboard iframe 안의 "점검완료 복귀" 버튼 → 오버레이만 닫아
      // 점검을 열기 직전에 있던 원래 화면(개요/미션설명/코딩/시뮬)으로 복귀.
      if (isDashboardVisible()) closeDashboard();
      return;
    }
    if (data.type === 'log_toggle') {
      const logContainer = document.getElementById('logContainer');
      const STORAGE_KEY = 'ares.log.visible';
      if (logContainer) {
        document.body.classList.toggle('log-hidden', !data.visible);
        try { localStorage.setItem(STORAGE_KEY, String(data.visible)); } catch {}
        try { Blockly.svgResize(ws); } catch {}
        Logger.refresh();
      }
    }
  });
}

// ============================================================
// 메인 진입점
// ============================================================
function main() {
  // 1) Blockly 워크스페이스 한 번만 inject (미션 뷰에서만 보이지만 미리 준비)
  workspace = initializeBlockly();

  // 2) 항상 켜 있는 이벤트
  initializeAlwaysOnListeners();

  // 3) Blockly 의존 이벤트
  initializeMissionListeners(workspace);

  // 4) 네비게이션 UI
  buildLessonSelect();

  // 5) 로그 토글 + 콘텐츠 모드 토글
  const logContainer = document.getElementById('logContainer');
  const logHeader = document.getElementById('logHeader');
  setupLogToggle({
    logContainer,
    logHeader,
    onToggle: () => {
      Logger.refresh();
      updateMobileBottomNav();
    },
  });
  setContentMode = setupContentToggle({
    btn: document.getElementById('contentToggleBtn'),
    view: document.getElementById('missionView'),
    workspace,
    getMode: () => _contentMode,
    setMode: (mode) => {
      const wasSimulation = _contentMode === 'simulation';
      _contentMode = mode;
      if (wasSimulation && mode !== 'simulation' && simController) {
        simController.close();
      }
    },
    getSimController: () => simController,
    updateBlockCodingButtonUI: () => refreshBlockCodingButtonUI(),
  });
  bindMobileBottomNav();
  simController = setupSimulation({
    workspace,
    onOpen: () => {
      // 시뮬을 열면 직전 모드를 기억하고 simulation 모드로 전환
      if (_contentMode !== 'simulation') _preSimMode = _contentMode;
      if (setContentMode) setContentMode('simulation');
    },
    onClose: () => {
      // '코드 확인' 으로 시뮬을 닫으면 항상 블록 코딩 모드로 이동한다.
      // 단, 호스트가 이미 다른 모드로 전환한 뒤(예제 적재 등) 정리 차원에서
      // close() 가 호출된 경우에는 그 모드를 덮어쓰지 않는다.
      if (_contentMode !== 'simulation') return;
      if (setContentMode) setContentMode('coding');
    },
  });

  // 6) 상태 초기화 + 라우팅
  BluetoothManager.updateConnectionStatus(false);
  refreshBlockCodingButtonUI();
  updateMobileBottomNav();
  Logger.add('[시작] ARES 준비 완료 - BLE 연결을 시작하세요', 'info');
  Logger.refresh();

  applyRoute();
}

// 최상위 ?mobile=true 진입 시에는 모바일 미리보기 프레임이 화면을 대체하므로
// 관제실 본 UI 를 프레임 뒤에서 중복 초기화하지 않는다. 실제 UI 는 프레임 안(framed=1)에서 구동.
if (window.__ARES_MOBILE_FRAME__) {
  // no-op — mobile-preview.js 가 프레임을 구성한다
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
