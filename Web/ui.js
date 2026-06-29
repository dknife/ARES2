// UI 전용 보조 함수들
import { elements } from './elements.js';

// ============================================================
// UI 헬퍼 — HTML 이스케이프
// ============================================================
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// 브레드크럼 업데이트
// ============================================================
export function updateBreadcrumb(n, m) {
  const bc = document.getElementById('breadcrumb');
  if (!bc) return;
  if (n && m) bc.textContent = `${n}차시 › 미션 ${m}`;
  else if (n) bc.textContent = `${n}차시`;
  else bc.textContent = '';
}

// ============================================================
// 강의 사이드바 렌더링
// ============================================================
export function renderCourseSidebar(lessonCatalog, activeLesson = null, activeMission = null) {
  const sidebar = document.getElementById('courseSidebarContent');
  if (!sidebar) return;

  const currentLessonData = lessonCatalog.find((l) => l.n === activeLesson) || null;

  sidebar.innerHTML = `
    <div class="course-sidebar-section">
      <h3>강의 리스트</h3>
      <div class="course-lesson-list">
        ${lessonCatalog.map((lesson) => `
          <button type="button" class="course-lesson-item${activeLesson === lesson.n ? ' active' : ''}" data-lesson="${lesson.n}">
            <span class="course-lesson-num">${lesson.n}차시</span>
            <span class="course-lesson-title">${escapeHtml(lesson.title)}</span>
            <span class="course-lesson-meta">${escapeHtml(lesson.hardware)}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="course-sidebar-section course-sidebar-current">
      <h3>현재 위치</h3>
      ${currentLessonData ? `
        <p class="course-current-title">${currentLessonData.n}차시 — ${escapeHtml(currentLessonData.title)}</p>
        <p class="course-current-meta">${escapeHtml(currentLessonData.concept)}</p>
        <p class="course-current-state">${activeMission ? `미션 ${activeMission} 진행 중` : '수업 내용을 확인하고 미션으로 넘어가세요.'}</p>
      ` : `
        <p class="course-current-meta">왼쪽 강의 리스트에서 차시를 선택하세요.</p>
      `}
    </div>
  `;

  // 강의 버튼 클릭 이벤트: 해당 차시 첫 미션으로 이동
  sidebar.querySelectorAll('.course-lesson-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lessonNum = parseInt(btn.dataset.lesson, 10);
      if (Number.isFinite(lessonNum)) {
        // 버튼이 main.js의 navigate 함수를 호출해야 함
        // window.aresNavigate를 main.js에서 export해 사용
        if (window.aresNavigate) {
          window.aresNavigate({ lesson: lessonNum, mission: 1 });
        }
      }
    });
  });
}

// ============================================================
// 미션 전송 버튼 상태 업데이트
// ============================================================
export function updateRunButtonUI(currentView, isExecuting, isBleConnected) {
  const btn = elements.runButton;
  if (!btn) return;
  if (isExecuting) {
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
  btn.disabled = !inMission || inDashboard || !isBleConnected;
}

export function updateBlockCodingButtonUI(
  btn = document.getElementById('blockCodingButton'),
  helpers = {},
) {
  if (!btn) return;

  const isDashboardVisible = helpers.isDashboardVisible || (() => false);
  const isInBlockCodingStage = helpers.isInBlockCodingStage || (() => false);

  if (isDashboardVisible()) {
    btn.textContent = '🧩 코딩';
    btn.title = '점검을 닫고 코딩 화면으로 이동';
  } else if (isInBlockCodingStage()) {
    btn.textContent = '🏠 메인';
    btn.title = '개요 화면으로 돌아가기';
  } else {
    btn.textContent = '🧩 블록코딩';
    btn.title = '미션 블록코딩 화면으로 이동';
  }
}

export function setupLogToggle({ logContainer, logHeader, onToggle }) {
  if (!logContainer || !logHeader) return;

  logContainer.classList.add('compact');
  logContainer.classList.remove('expanded');

  logHeader.addEventListener('click', (e) => {
    if (e.target?.id === 'clearLogBtn') return;
    const expanded = logContainer.classList.toggle('expanded');
    logContainer.classList.toggle('compact', !expanded);
    onToggle?.(expanded);
  });
}

export function setupContentToggle({
  btn,
  view,
  workspace,
  getMode,
  setMode,
  getSimController,
  updateBlockCodingButtonUI: refreshBlockCodingButtonUI,
}) {
  if (!btn || !view || !getMode || !setMode) return null;

  const applyMode = (mode) => {
    const previousMode = getMode();
    const wasSimulation = previousMode === 'simulation';
    setMode(mode);
    view.setAttribute('data-mode', mode);
    document.body.setAttribute('data-content-mode', mode);

    if (wasSimulation && mode !== 'simulation') {
      const sim = getSimController?.();
      if (sim) sim.close();
    }

    if (mode === 'coding') {
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
      btn.disabled = true;
      btn.title = '시뮬레이션을 닫으면 이전 화면으로 돌아갑니다';
    }

    refreshBlockCodingButtonUI?.();
  };

  const setContentMode = (mode) => {
    if (!['description', 'coding', 'simulation'].includes(mode)) return;
    if (getMode() === mode) return;
    applyMode(mode);
  };

  btn.addEventListener('click', () => {
    if (getMode() === 'simulation') return;
    applyMode(getMode() === 'description' ? 'coding' : 'description');
  });

  applyMode('description');
  return setContentMode;
}

