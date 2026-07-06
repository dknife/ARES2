// UI 전용 보조 함수들

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
    window.dispatchEvent(new CustomEvent('ares:contentmode', { detail: { mode } }));

    // 모드 전환 시 스크롤을 상단으로 초기화 (전환 후 각 모드의 상단부터 보이게).
    // 모바일은 window 가 스크롤 컨테이너이므로 window 도 초기화하고,
    // 전환 직후 리플로우가 스크롤을 되돌릴 수 있어 다음 프레임에 한 번 더.
    view.querySelector('.mission-panel')?.scrollTo?.({ top: 0 });
    const toTop = () => {
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    };
    toTop();
    requestAnimationFrame(toTop);

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

