import { state } from './state.js';
import { elements } from './elements.js';
import { Logger } from './logger.js';
import { BluetoothManager } from './bluetooth.js';
import { BlocklyConfig } from './blocklyconfig.js';
import { CommandExecutor } from './commandexecutor.js';

// Blockly 워크스페이스 초기화
function initializeBlockly() {
  // 브라우저 블루투스 지원 확인
  if (!navigator.bluetooth) {
    alert('이 브라우저는 Web Bluetooth API를 지원하지 않습니다. Chrome 56+ 또는 Edge 79+를 사용해주세요.');
    Logger.add('[오류] 브라우저가 Web Bluetooth API를 지원하지 않습니다', 'error');
  }

  // 커스텀 블록 정의 등록
  Blockly.defineBlocksWithJsonArray(BlocklyConfig.blocks);

  // 한글 메시지 오버라이드 - 반복
  Blockly.Msg["CONTROLS_REPEAT_TITLE"] = "반복 %1 번";
  Blockly.Msg["CONTROLS_REPEAT_INPUT_DO"] = "실행";
  Blockly.Msg["CONTROLS_REPEAT_TOOLTIP"] = "지정된 횟수만큼 문장을 반복합니다.";

  // 한글 메시지 오버라이드 - 수학
  Blockly.Msg["MATH_CHANGE_TITLE"] = "%1 에 %2 만큼 더하기";
  Blockly.Msg["MATH_CHANGE_TOOLTIP"] = "변수 '%1'에 숫자를 더합니다.";
  Blockly.Msg["MATH_NUMBER_TOOLTIP"] = "숫자입니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_ADD"] = "두 수의 합을 반환합니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_SUBTRACT"] = "첫 번째 수에서 두 번째 수를 뺀 결과를 반환합니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_MULTIPLY"] = "두 수의 곱을 반환합니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_DIVIDE"] = "첫 번째 수를 두 번째 수로 나눈 결과를 반환합니다.";
  Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_POWER"] = "첫 번째 수를 두 번째 수 만큼 승한 결과를 반환합니다.";

  // 한글 메시지 오버라이드 - 변수
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

  // 한글 메시지 오버라이드 - 제어 (if)
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
  
  // 한글 메시지 오버라이드 - 제어 (while)
  Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_WHILE"] = "참인 동안 반복";
  Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_UNTIL"] = "참이 될 때까지 반복";
  Blockly.Msg["CONTROLS_WHILEUNTIL_TOOLTIP_WHILE"] = "값이 참인 동안 문장을 반복합니다.";
  Blockly.Msg["CONTROLS_WHILEUNTIL_TOOLTIP_UNTIL"] = "값이 거짓인 동안 문장을 반복합니다.";
  
  // 한글 메시지 오버라이드 - 논리
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

  // 한글 메시지 오버라이드 - 함수(프로시저)
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

  // 워크스페이스 초기화
  const workspace = Blockly.inject('blocklyDiv', {
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

// BLE 연결 상태 확인
function isBleConnected() {
  return !!state.bluetoothDevice?.gatt?.connected && !!state.characteristic;
}

// 연결 검증 및 경고 표시
function validateConnection() {
  if (!isBleConnected()) {
    alert('먼저 피코를 BLE로 연결해주세요!');
    Logger.add('[오류] BLE가 연결되지 않았습니다', 'error');
    return false;
  }
  return true;
}

// 대시보드 전환
function toggleDashboard() {
  const blocklyDiv = document.getElementById('blocklyDiv');
  const dashboardFrame = document.getElementById('dashboardFrame');
  const dashboardButton = document.getElementById('dashboardButton');
  const toolboxToggleBtn = document.getElementById('toolboxToggleBtn');

  if (!blocklyDiv || !dashboardFrame || !dashboardButton) return;

  const isDashboardHidden = dashboardFrame.style.display === 'none' || dashboardFrame.style.display === '';

  if (isDashboardHidden) {
    // 대시보드 모드로 전환
    blocklyDiv.style.display = 'none';
    dashboardFrame.style.display = 'block';
    if (toolboxToggleBtn) toolboxToggleBtn.style.display = 'none';
    dashboardButton.textContent = '🧩 블록코딩';

    elements.runButton.disabled = true;
    elements.saveButton.disabled = true;
    elements.loadButton.disabled = true;
    BluetoothManager.updateConnectionStatus(isBleConnected());
    Logger.add('[모드] 대시보드 전환', 'info');
  } else {
    // 블록코딩 모드로 전환
    blocklyDiv.style.display = 'block';
    dashboardFrame.style.display = 'none';
    if (toolboxToggleBtn) toolboxToggleBtn.style.display = '';
    dashboardButton.textContent = '📊 대시보드';

    elements.saveButton.disabled = false;
    elements.loadButton.disabled = false;
    elements.runButton.disabled = !isBleConnected();
    BluetoothManager.updateConnectionStatus(isBleConnected());
    Logger.add('[모드] 블록코딩 전환', 'info');
  }
}

// 로그 컨테이너 접힘/펼침 설정
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

// 로그 표시/숨김 버튼 설정
function setupLogVisibilityButton(workspace) {
  const btn = document.getElementById('logToggleButton');
  const logContainer = document.getElementById('logContainer');
  if (!btn || !logContainer) return;

  const STORAGE_KEY = 'ares.log.visible';

  const readVisible = () => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === null) return true;
      return v === 'true';
    } catch {
      return true;
    }
  };

  const writeVisible = (visible) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(visible));
    } catch {}
  };

  const applyVisible = (visible) => {
    document.body.classList.toggle('log-hidden', !visible);
    btn.setAttribute('aria-pressed', String(visible));
    btn.title = visible ? '통신 로그 숨기기' : '통신 로그 보기';
    btn.textContent = visible ? '📝 로그 끄기' : '📝 로그 켜기';
    
    if (workspace) {
      setTimeout(() => {
        try { Blockly.svgResize(workspace); } catch {}
      }, 0);
    }
  };

  applyVisible(readVisible());

  btn.addEventListener('click', () => {
    const nextVisible = document.body.classList.contains('log-hidden');
    applyVisible(nextVisible);
    writeVisible(nextVisible);
    Logger.refresh();
  });
}

// 이벤트 리스너 초기화
function initializeEventListeners(workspace) {
  // 연결/해제 버튼
  elements.connectButton.addEventListener('click', () => BluetoothManager.connect());
  elements.disconnectButton.addEventListener('click', () => BluetoothManager.disconnect());

  // 로그 지우기 버튼
  elements.clearLogBtn.addEventListener('click', () => {
    Logger.clear();
    Logger.refresh();
  });

  // 대시보드 버튼
  const dashboardButton = document.getElementById('dashboardButton');
  dashboardButton?.addEventListener('click', toggleDashboard);

  // 비상 정지 버튼
  const emergencyStopButton = document.getElementById('emergencyStopButton');
  emergencyStopButton?.addEventListener('click', async () => {
    Logger.add('[비상정지] 실행됨', 'error');
    state.isExecuting = false;
    
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
  });

  // 명령 실행 버튼
  elements.runButton.addEventListener('click', async () => {
    if (!validateConnection()) return;
    if (state.isExecuting) {
      alert('이미 명령이 실행 중입니다. 잠시만 기다려주세요.');
      return;
    }
    try {
      await CommandExecutor.executeWorkspace(workspace);
    } catch (error) {
      console.error('명령 실행 오류:', error);
      alert('명령 실행 중 오류가 발생했습니다: ' + error.message);
      Logger.add(`[오류] 명령 실행 실패: ${error.message}`, 'error');
    }
  });

  // 저장 버튼
  elements.saveButton.addEventListener('click', () => {
    const xml = Blockly.Xml.workspaceToDom(workspace);
    const xmlText = Blockly.utils.xml.domToText(xml);
    const fileName = prompt("저장할 파일 이름을 입력하세요 (확장자 제외):", "Ares_Workspace");
    if (!fileName) return;

    const blob = new Blob([xmlText], { type: 'text/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xml`;
    link.click();
  });

  // 대시보드 메시지 수신 리스너
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || !data.type) return;
    
    // 대시보드 명령 처리
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
    
    // 로그 토글 처리
    if (data.type === 'log_toggle') {
      const logContainer = document.getElementById('logContainer');
      const btn = document.getElementById('logToggleButton');
      const STORAGE_KEY = 'ares.log.visible';
      
      if (logContainer) {
        document.body.classList.toggle('log-hidden', !data.visible);
        try { localStorage.setItem(STORAGE_KEY, String(data.visible)); } catch {}
        
        if (btn) {
          btn.setAttribute('aria-pressed', String(data.visible));
          btn.title = data.visible ? '통신 로그 숨기기' : '통신 로그 보기';
          btn.textContent = data.visible ? '📝 로그 끄기' : '📝 로그 켜기';
        }
        
        try { Blockly.svgResize(workspace); } catch {}
        Logger.refresh();
      }
    }
  });

  // 불러오기 버튼
  elements.loadButton.addEventListener('click', () => elements.fileInput.click());

  // 예제 불러오기 버튼 (GitHub Pages / 로컬 서버에서 fetch)
  const exampleButton = document.getElementById('exampleButton');
  exampleButton?.addEventListener('click', async () => {
    const url = 'examples/radar_demo.xml';
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xmlText = await res.text();
      const xml = Blockly.utils.xml.textToDom(xmlText);
      workspace.clear();
      Blockly.Xml.domToWorkspace(xml, workspace);
      Logger.add('[예제] radar_demo 불러오기 완료', 'info');
    } catch (err) {
      alert('예제 불러오기에 실패했습니다: ' + err.message);
      Logger.add(`[오류] 예제 불러오기 실패: ${err.message}`, 'error');
    }
  });

  // 파일 입력 처리
  elements.fileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const xmlText = e.target.result;
      try {
        const xml = Blockly.utils.xml.textToDom(xmlText);
        workspace.clear();
        Blockly.Xml.domToWorkspace(xml, workspace);
        Logger.add(`[파일] ${file.name} 불러오기 완료`, 'info');
      } catch (err) {
        alert('Blockly 작업 공간을 불러오는 데 실패했습니다. 유효한 XML 파일인지 확인해주세요.');
        Logger.add(`[오류] ${file.name} 파일 로드 실패`, 'error');
        console.error('Error loading workspace:', err);
      }
    };
    reader.readAsText(file);
  });

  // 페이지 종료 시 연결 해제
  window.addEventListener('beforeunload', () => {
    if (state.bluetoothDevice?.gatt?.connected) {
      BluetoothManager.disconnect();
    }
  });

  // 블럭코딩 토글 설정 (드릴다운 없이 단순 열기/닫기만)
  {
    const STORAGE_KEY = 'ares.toolbox.opened';
    let opened = true;

    const getMainContent = () => document.querySelector('.main-content');
    const getToolboxDiv = () => document.querySelector('.blocklyToolboxDiv');

    const readOpened = () => {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === null) return null;
        return v === 'true';
      } catch { return null; }
    };

    const writeOpened = (v) => {
      try { localStorage.setItem(STORAGE_KEY, String(v)); } catch {}
    };

    // 토글 버튼 생성
    const getOrCreateToggleBtn = () => {
      let btn = document.getElementById('toolboxToggleBtn');
      if (btn) return btn;

      btn = document.createElement('button');
      btn.id = 'toolboxToggleBtn';
      btn.type = 'button';
      btn.title = '블럭코딩 열기/닫기';
      btn.setAttribute('aria-pressed', 'true');

      const stop = (e) => e.stopPropagation();
      btn.addEventListener('pointerdown', stop, true);
      btn.addEventListener('mousedown', stop, true);
      btn.addEventListener('touchstart', stop, true);

      const mainContent = getMainContent();
      if (mainContent) mainContent.appendChild(btn);
      return btn;
    };

    // 토글 버튼 위치 설정
    const placeToggleBtn = () => {
      const btn = getOrCreateToggleBtn();
      const toolboxDiv = getToolboxDiv();
      const mainContent = getMainContent();

      if (opened && toolboxDiv && toolboxDiv.offsetWidth > 0 && toolboxDiv.offsetHeight > 0) {
        if (btn.parentElement !== toolboxDiv) toolboxDiv.prepend(btn);
        btn.classList.remove('toolbox-toggle--handle');
        btn.classList.add('toolbox-toggle--inside');
        return;
      }

      if (mainContent && btn.parentElement !== mainContent) mainContent.appendChild(btn);
      btn.classList.remove('toolbox-toggle--inside');
      btn.classList.add('toolbox-toggle--handle');
    };

    // 토글 버튼 텍스트 업데이트
    const updateToggleText = () => {
      const btn = document.getElementById('toolboxToggleBtn');
      if (!btn) return;
      btn.textContent = opened ? '🧩 블럭코딩 닫기' : '🧩 블럭코딩 열기';
      btn.setAttribute('aria-pressed', String(opened));
      btn.title = opened ? '블럭코딩 숨기기' : '블럭코딩 보기';
    };

    // 블럭코딩 영역 표시/숨김 적용
    const applyToolboxVisibility = (nextOpened) => {
      opened = nextOpened;

      const tb = workspace.getToolbox?.();
      if (tb?.show && tb?.hide) {
        opened ? tb.show() : tb.hide();
      } else {
        const toolboxDiv = getToolboxDiv();
        if (toolboxDiv) toolboxDiv.style.display = opened ? '' : 'none';
      }

      placeToggleBtn();
      updateToggleText();
      Blockly.svgResize(workspace);
    };

    // 초기 상태 적용
    const defaultOpened = !window.matchMedia('(max-width: 768px)').matches;
    const savedOpened = readOpened();
    applyToolboxVisibility(savedOpened === null ? defaultOpened : savedOpened);

    // 토글 버튼 클릭 이벤트
    getOrCreateToggleBtn().addEventListener('click', (e) => {
      e.stopPropagation();
      applyToolboxVisibility(!opened);
      writeOpened(opened);
    });
  }
}

// 메인 함수
function main() {
  const workspace = initializeBlockly();
  initializeEventListeners(workspace);

  const logContainer = document.getElementById('logContainer');
  if (logContainer) logContainer.classList.add('compact');

  setupLogToggle();
  setupLogVisibilityButton(workspace);

  BluetoothManager.updateConnectionStatus(false);
  Logger.add('[시작] ARES 준비 완료 - BLE 연결을 시작하세요', 'info');
  Logger.refresh();
}

// 앱 시작
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
