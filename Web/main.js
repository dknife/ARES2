import { state } from './state.js';
import { elements } from './elements.js';
import { Logger } from './logger.js';
import { BluetoothManager } from './bluetooth.js';
import { BlocklyConfig, attachBatchBlockValidator } from './blocklyconfig.js';
import { CommandExecutor } from './commandexecutor.js';
import { setupSimulation } from './simulation.js';
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
];

const lessonCache = new Map(); // n -> lesson.json 객체
let workspace = null;          // Blockly 워크스페이스 (한 번만 inject)
let currentView = 'overview';

// 미션 뷰는 description / coding / simulation 세 모드 중 하나만 표시한다.
// _preSimMode 는 시뮬을 닫았을 때 복귀할 모드(description 또는 coding)를 기억.
let _contentMode = 'description';
let _preSimMode = 'description';
let setContentMode = null;     // setupContentToggle() 에서 등록

// ============================================================
// Blockly 한글 메시지 + 워크스페이스 초기화
// ============================================================
function initializeBlockly() {
  if (!navigator.bluetooth) {
    alert('이 브라우저는 Web Bluetooth API를 지원하지 않습니다. Chrome 56+ 또는 Edge 79+를 사용해주세요.');
    Logger.add('[오류] 브라우저가 Web Bluetooth API를 지원하지 않습니다', 'error');
  }

  Blockly.defineBlocksWithJsonArray(BlocklyConfig.blocks);
  attachBatchBlockValidator(Blockly);
  applyKoreanMessages();

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
  return workspace;
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
    return;
  }
  btn.textContent = '▶️ 미션 전송';
  btn.title = '블록코딩 내용을 피코로 전송해 실행';
  btn.classList.remove('btn-stop');
  const inMission = currentView === 'mission';
  const dashboardFrame = document.getElementById('dashboardFrame');
  const inDashboard = dashboardFrame && dashboardFrame.style.display === 'block';
  btn.disabled = !inMission || inDashboard || !isBleConnected();
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
function showView(view) {
  for (const v of ['overview', 'lesson', 'mission']) {
    const el = document.getElementById(v + 'View');
    if (el) el.hidden = (v !== view);
  }
  currentView = view;

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

  // 시뮬레이션 버튼은 미션 뷰에서만 노출, 뷰를 떠나면 카드 닫기
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
}

// ============================================================
// 개요 뷰
// ============================================================
async function enterOverview() {
  showView('overview');
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
        tbody.innerHTML = LESSON_CATALOG.map(l => `
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
    } catch (e) {
      container.innerHTML = '<p style="color:#E74C3C">개요를 불러오지 못했습니다.</p>';
      Logger.add(`[오류] overview.html 로드 실패: ${e.message}`, 'error');
    }
  }
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
  document.getElementById('lessonSelect').value = String(n);
  populateMissionSelect(n, data);
  document.getElementById('missionSelect').value = String(m);
  updateBreadcrumb(n, m);

  document.getElementById('missionHeading').textContent = `${n}차시 미션 ${m} — ${mission.title}`;
  document.getElementById('missionTagBadge').textContent = mission.tag;
  document.getElementById('missionTagBadge').className = `lesson-tag tag-${mission.tag}`;
  document.getElementById('missionHardware').textContent = `🔧 ${mission.hardware}`;

  // 스토리
  const storyEl = document.getElementById('missionStory');
  storyEl.innerHTML = (mission.story || []).map(line => `
    <div class="story-line story-${line.speaker}">
      <span class="story-avatar">${line.speaker === 'ares' ? '🧑‍🚀' : '🤖'}</span>
      <span class="story-name">${line.speaker === 'ares' ? '아레스' : '알비'}</span>
      <span class="story-text">${escapeHtml(line.text)}</span>
    </div>
  `).join('');

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
}

// ============================================================
// lesson.json 로더 + 캐시
// ============================================================
async function loadLesson(n) {
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
  const blocklyDiv = document.getElementById('blocklyDiv');
  const dashboardFrame = document.getElementById('dashboardFrame');
  const dashboardButton = document.getElementById('dashboardButton');
  const contentToggleBtn = document.getElementById('contentToggleBtn');

  if (!blocklyDiv || !dashboardFrame || !dashboardButton) return;

  // 미션 뷰가 아닌 경우 미션 뷰로 보내고, 대시보드 모드는 유지
  if (currentView !== 'mission') {
    // 가장 최근 미션 또는 1차시 미션1로 이동 후 대시보드 켜기
    navigate({ lesson: 1, mission: 1 });
    setTimeout(() => toggleDashboard(), 100);
    return;
  }

  // 대시보드는 mission-workspace 안에 있으므로 coding 모드여야 보인다.
  if (setContentMode) setContentMode('coding');

  const isDashboardHidden = dashboardFrame.style.display === 'none' || dashboardFrame.style.display === '';

  if (isDashboardHidden) {
    blocklyDiv.style.display = 'none';
    dashboardFrame.style.display = 'block';
    if (contentToggleBtn) contentToggleBtn.style.display = 'none';
    dashboardButton.textContent = '🧩 코딩';

    if (elements.saveButton) elements.saveButton.disabled = true;
    if (elements.loadButton) elements.loadButton.disabled = true;
    updateRunButtonUI();
    Logger.add('[모드] 대시보드 전환', 'info');
  } else {
    blocklyDiv.style.display = 'block';
    dashboardFrame.style.display = 'none';
    if (contentToggleBtn) contentToggleBtn.style.display = '';
    dashboardButton.textContent = '🔍 점검';

    if (elements.saveButton) elements.saveButton.disabled = false;
    if (elements.loadButton) elements.loadButton.disabled = false;
    updateRunButtonUI();
    Logger.add('[모드] 블록코딩 전환', 'info');
  }
}

// ============================================================
// 로그 컨테이너 토글
// ============================================================
function setupLogToggle() {
  const logContainer = document.getElementById('logContainer');
  const logHeader = document.getElementById('logHeader');
  if (!logContainer || !logHeader) return;

  logContainer.classList.add('compact');
  logContainer.classList.remove('expanded');

  logHeader.addEventListener('click', (e) => {
    if (e.target?.id === 'clearLogBtn') return;
    const expanded = logContainer.classList.toggle('expanded');
    logContainer.classList.toggle('compact', !expanded);
    Logger.refresh();
  });
}

// ============================================================
// 3D 시뮬레이션 컨트롤러 — 실제 구현은 simulation.js
//   showView() 에서 미션 뷰를 떠날 때 close() 호출.
// ============================================================
let simController = null;

// ============================================================
// 콘텐츠 모드 토글 — 미션 설명 ↔ 블럭코딩 단일 버튼
//   미션 뷰는 description / coding / simulation 중 하나만 표시한다.
//   시뮬레이션은 simToggle 로 진입하며, 닫으면 직전 모드(description 또는 coding)로 복귀.
// ============================================================
function setupContentToggle() {
  const btn = document.getElementById('contentToggleBtn');
  const view = document.getElementById('missionView');
  if (!btn || !view) return;

  const applyMode = (mode) => {
    const wasSimulation = _contentMode === 'simulation';
    _contentMode = mode;
    view.setAttribute('data-mode', mode);
    // 네비게이션(#missionNav)은 #missionView 바깥이라 body 속성으로 모드를 전달해 제어.
    //   coding/simulation 모드: 개요·차시·미션 선택을 숨겨 단순화.
    document.body.setAttribute('data-content-mode', mode);

    // 시뮬레이션 → 다른 모드로 전환할 때는 sim 도 정리
    // (렌더 루프 중지 + simToggle 버튼 '열기' 로 복귀).
    // simController.close() 내부 가드(card.hidden/closing) 가 있어 중복 호출은 안전하다.
    if (wasSimulation && mode !== 'simulation' && simController) {
      simController.close();
    }

    if (mode === 'coding') {
      // 블럭코딩 모드 진입 시 툴박스도 함께 표시
      const tb = workspace?.getToolbox?.();
      try { tb?.show?.(); } catch {}
      setTimeout(() => { try { Blockly.svgResize(workspace); } catch {} }, 0);
    }

    if (mode === 'description') {
      btn.textContent = '블록 코딩';
      btn.title = '미션 설명을 닫고 블럭코딩 화면으로 전환';
      btn.disabled = false;
    } else if (mode === 'coding') {
      btn.textContent = '미션 설명';
      btn.title = '블럭코딩을 닫고 미션 설명으로 전환';
      btn.disabled = false;
    } else {
      // simulation 모드에서는 시뮬레이션 닫기(simToggle)로만 빠져나간다.
      btn.disabled = true;
      btn.title = '시뮬레이션을 닫으면 이전 화면으로 돌아갑니다';
    }
  };

  // 외부(showView/simController)에서 모드를 강제할 때 사용하는 setter
  setContentMode = (mode) => {
    if (!['description', 'coding', 'simulation'].includes(mode)) return;
    if (_contentMode === mode) return;
    applyMode(mode);
  };

  btn.addEventListener('click', () => {
    if (_contentMode === 'simulation') return; // 안전장치 (disabled)
    applyMode(_contentMode === 'description' ? 'coding' : 'description');
  });

  applyMode('description');
}

// ============================================================
// 항상 켜 있는 이벤트 리스너 (BLE, 비상 정지, 로그 등)
// ============================================================
function initializeAlwaysOnListeners() {
  // 신호 연결 통합 버튼: 현재 상태에 따라 connect / disconnect / retry 분기
  elements.connectButton?.addEventListener('click', () => {
    if (isBleConnected()) {
      BluetoothManager.disconnect();
    } else {
      BluetoothManager.connect();
    }
  });

  // 로그 지우기
  elements.clearLogBtn?.addEventListener('click', () => {
    Logger.clear();
    Logger.refresh();
  });

  // 대시보드
  document.getElementById('dashboardButton')?.addEventListener('click', toggleDashboard);

  // 연결 상태 변화 / 실행 시작·종료 → runButton 라벨/활성 갱신
  window.addEventListener('ares:connection', updateRunButtonUI);
  window.addEventListener('ares:execution',  updateRunButtonUI);

  // 홈(개요)
  document.getElementById('homeButton')?.addEventListener('click', () => navigate({}));

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
          await BluetoothManager.sendData('STOP_ALL', false);
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
      await CommandExecutor.executeWorkspace(ws);
    } catch (error) {
      console.error('명령 실행 오류:', error);
      alert('명령 실행 중 오류가 발생했습니다: ' + error.message);
      Logger.add(`[오류] 명령 실행 실패: ${error.message}`, 'error');
    }
  });

  // 저장
  elements.saveButton?.addEventListener('click', () => {
    const xml = Blockly.Xml.workspaceToDom(ws);
    const xmlText = Blockly.Xml.domToPrettyText(xml);
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

  document.getElementById('aiHelpButton')?.addEventListener('click', () => {
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
  });
  document.getElementById('aiCloseButton')?.addEventListener('click', () => aiPanel?.setAttribute('hidden', ''));
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
      const needsResponse = cmd === 'GET_SYS' || cmd === 'GET_STATUS';
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
      // dashboard iframe 안의 "점검완료 관제실로 복귀" 버튼.
      // 현재 대시보드가 표시 중이면 블록 코딩 뷰로 토글.
      const dashboardFrame = document.getElementById('dashboardFrame');
      if (dashboardFrame && dashboardFrame.style.display === 'block') {
        toggleDashboard();
      }
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
  if (logContainer) logContainer.classList.add('compact');
  setupLogToggle();
  setupContentToggle();
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
