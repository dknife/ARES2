// Blockly 블록 정의

// [한꺼번에 실행] 블록 안에 넣을 수 없는 블록 타입.
// 값 반환(센서 응답이 batch 끝의 단일 ACK와 충돌)과 제어 흐름(Web 측 평탄화가
// 정의되지 않음)을 차단한다. batch_block 자기 자신도 중첩 금지.
export const BATCH_FORBIDDEN_TYPES = new Set([
  // 값 반환
  'check_distance', 'check_magnetic', 'pico_check_device',
  // 제어 흐름
  'controls_if', 'controls_whileUntil', 'controls_repeat_ext',
  // 변수/함수 (제어 흐름은 Web 측 책임)
  'variables_set', 'assign_variable', 'math_change',
  'procedures_callnoreturn', 'procedures_callreturn',
  'procedures_defnoreturn', 'procedures_defreturn',
  // 중첩 금지
  'batch_block',
]);

const MODULE_LABEL_CONFIG = {
  wheel: { field: 'WHEEL_LABEL', emoji: '🚗', defaultName: '서보 모터' },
  dcmotor: { field: 'DCMOTOR_LABEL', emoji: '⚡', defaultName: 'DC 모터' },
  leds: { field: 'LEDS_LABEL', emoji: '💡', defaultName: 'LED' },
  oled: { field: 'OLED_LABEL', emoji: '🖥️', defaultName: '디스플레이' },
  buzzer: { field: 'BUZZER_LABEL', emoji: '🔊', defaultName: '소리' },
  sensors: { field: 'SENSORS_LABEL', emoji: '📡', defaultName: '센서' },
  gun: { field: 'LABEL', emoji: '🔫', defaultName: '발사' }
};

export const BlocklyConfig = {
  blocks: [
    // 서보 모터 블록 (주황색 #FF8C00)
    {
      type: "timed_forward",
      message0: "%1 전진 %2 초 (속도 %3 %%)",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" },
        { type: "input_value", name: "SECONDS", check: "Number" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터로 지정한 시간(초)만큼 지정한 속도(0~100%)로 전진합니다."
    },
    {
      type: "timed_backward",
      message0: "%1 후진 %2 초 (속도 %3 %%)",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" },
        { type: "input_value", name: "SECONDS", check: "Number" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터로 지정한 시간(초)만큼 지정한 속도(0~100%)로 후진합니다."
    },
    {
      type: "timed_left",
      message0: "%1 좌회전 %2 초 (속도 %3 %%)",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" },
        { type: "input_value", name: "SECONDS", check: "Number" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터로 지정한 시간(초)만큼 지정한 속도(0~100%)로 좌회전합니다."
    },
    {
      type: "timed_right",
      message0: "%1 우회전 %2 초 (속도 %3 %%)",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" },
        { type: "input_value", name: "SECONDS", check: "Number" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터로 지정한 시간(초)만큼 지정한 속도(0~100%)로 우회전합니다."
    },
    {
      type: "move_forward",
      message0: "%1 계속 전진 (속도 %2 %%)",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "정지 명령 전까지 서보 모터로 지정한 속도(0~100%)로 계속 전진합니다."
    },
    {
      type: "move_backward",
      message0: "%1 계속 후진 (속도 %2 %%)",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "정지 명령 전까지 서보 모터로 지정한 속도(0~100%)로 계속 후진합니다."
    },
    {
      type: "turn_left",
      message0: "%1 계속 좌회전 (속도 %2 %%)",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "정지 명령 전까지 서보 모터로 지정한 속도(0~100%)로 계속 좌회전합니다."
    },
    {
      type: "turn_right",
      message0: "%1 계속 우회전 (속도 %2 %%)",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "정지 명령 전까지 서보 모터로 지정한 속도(0~100%)로 계속 우회전합니다."
    },
    {
      type: "stop_moving",
      message0: "%1 정지",
      args0: [
        { type: "field_label", name: "WHEEL_LABEL", text: "🚗 서보 모터" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터를 즉시 정지합니다."
    },

    // DC 모터 블록 (노랑색 #FFCC00)
    {
      type: "main_motor_forward_timed",
      message0: "%1 전진 %2 초 (속도 %3 %%)",
      args0: [
        { type: "field_label", name: "DCMOTOR_LABEL", text: "⚡ DC 모터" },
        { type: "input_value", name: "SECONDS", check: "Number" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "DC 모터를 지정한 시간만큼 지정한 속도(0~100%)로 전진시킵니다."
    },
    {
      type: "main_motor_backward_timed",
      message0: "%1 후진 %2 초 (속도 %3 %%)",
      args0: [
        { type: "field_label", name: "DCMOTOR_LABEL", text: "⚡ DC 모터" },
        { type: "input_value", name: "SECONDS", check: "Number" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "DC 모터를 지정한 시간만큼 지정한 속도(0~100%)로 후진시킵니다."
    },
    {
      type: "main_motor_forward",
      message0: "%1 계속 전진 (속도 %2 %%)",
      args0: [
        { type: "field_label", name: "DCMOTOR_LABEL", text: "⚡ DC 모터" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "정지 명령 전까지 DC 모터를 지정한 속도(0~100%)로 계속 전진시킵니다."
    },
    {
      type: "main_motor_backward",
      message0: "%1 계속 후진 (속도 %2 %%)",
      args0: [
        { type: "field_label", name: "DCMOTOR_LABEL", text: "⚡ DC 모터" },
        { type: "input_value", name: "SPEED", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "정지 명령 전까지 DC 모터를 지정한 속도(0~100%)로 계속 후진시킵니다."
    },
    {
      type: "main_motor_stop",
      message0: "%1 정지",
      args0: [
        { type: "field_label", name: "DCMOTOR_LABEL", text: "⚡ DC 모터" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "DC 모터를 즉시 정지합니다."
    },

    // LED 블록 (빨강색 #FF5555)
    {
      type: "set_lamp",
      message0: "%1 전체 설정 [ %2 %3 %4 %5 %6 %7 ]",
      args0: [
        { type: "field_label", name: "LEDS_LABEL", text: "💡 LED" },
        { type: "input_value", name: "LAMP0", check: "Number" },
        { type: "input_value", name: "LAMP1", check: "Number" },
        { type: "input_value", name: "LAMP2", check: "Number" },
        { type: "input_value", name: "LAMP3", check: "Number" },
        { type: "input_value", name: "LAMP4", check: "Number" },
        { type: "input_value", name: "LAMP5", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF5555",
      tooltip: "6개 LED 밝기를 한번에 설정합니다. 값: 0(끔)~1(최대 밝기)"
    },
    {
      type: "led_on",
      message0: "%1 %2 번 켜기 (밝기 %3 )",
      args0: [
        { type: "field_label", name: "LEDS_LABEL", text: "💡 LED" },
        { type: "input_value", name: "LED_NUM", check: "Number" },
        { type: "input_value", name: "BRIGHTNESS", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF5555",
      tooltip: "특정 LED(0~5번)를 지정한 밝기로 켭니다. 번호에 숫자·변수·계산식을 꽂을 수 있습니다. 밝기: 0~1"
    },
    {
      type: "led_off",
      message0: "%1 %2 번 끄기",
      args0: [
        { type: "field_label", name: "LEDS_LABEL", text: "💡 LED" },
        { type: "input_value", name: "LED_NUM", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF5555",
      tooltip: "특정 LED(0~5번)를 끕니다. 번호에 숫자·변수·계산식을 꽂을 수 있습니다."
    },
    {
      type: "led_off_all",
      message0: "%1 전체 끄기",
      args0: [
        { type: "field_label", name: "LEDS_LABEL", text: "💡 LED" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF5555",
      tooltip: "모든 LED를 한번에 끕니다."
    },

    // 디스플레이 블록 (보라색 #9966FF)
    {
      type: "send_message",
      message0: "%1에 표시: %2",
      args0: [
        { type: "field_label", name: "OLED_LABEL", text: "🖥️ 디스플레이" },
        { type: "input_value", name: "Msg", check: "String" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#9966FF",
      tooltip: "OLED 디스플레이에 텍스트를 표시합니다."
    },
    {
      type: "clear_display",
      message0: "%1 지우기",
      args0: [
        { type: "field_label", name: "OLED_LABEL", text: "🖥️ 디스플레이" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#9966FF",
      tooltip: "OLED 디스플레이 화면을 깨끗하게 지웁니다."
    },
    {
      type: "clear_rect",
      message0: "%1 영역 지우기 (x: %2, y: %3, 폭: %4, 높이: %5)",
      args0: [
        { type: "field_label", name: "OLED_LABEL", text: "🖥️ 디스플레이" },
        { type: "input_value", name: "X", check: "Number" },
        { type: "input_value", name: "Y", check: "Number" },
        { type: "input_value", name: "W", check: "Number" },
        { type: "input_value", name: "H", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#9966FF",
      tooltip: "OLED 화면에서 지정한 사각 영역만 지웁니다. 기본 32×32 (아이콘 크기)."
    },
    {
      type: "send_message_xy",
      message0: "%1 (x: %2, y: %3) 에 표시: %4",
      args0: [
        { type: "field_label", name: "OLED_LABEL", text: "🖥️ 디스플레이" },
        { type: "input_value", name: "X", check: "Number" },
        { type: "input_value", name: "Y", check: "Number" },
        { type: "input_value", name: "Msg", check: "String" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#9966FF",
      tooltip: "OLED 화면의 (x, y) 좌표에 텍스트를 표시합니다. 화면을 지우지 않으므로 여러 줄을 쌓을 수 있습니다."
    },
    {
      type: "display_icon",
      message0: "%1 아이콘 %2 을(를) (x: %3, y: %4) 에 표시",
      args0: [
        { type: "field_label", name: "OLED_LABEL", text: "🖥️ 디스플레이" },
        {
          type: "field_dropdown",
          name: "ICON",
          options: [
            ["🤖 로봇", "rover"],
            ["🚀 화성탐사선", "mars"],
            ["👁️ 뜬 눈", "open_eye"],
            ["😌 감은 눈", "closed_eye"]
          ]
        },
        { type: "input_value", name: "X", check: "Number" },
        { type: "input_value", name: "Y", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#9966FF",
      tooltip: "OLED 화면의 (x, y) 좌표에 32×32 아이콘을 그립니다."
    },

    // 소리 블록 (하늘색 #00CCFF)
    {
      type: "buzzer_on",
      message0: "%1 %2 Hz로 %3 초 울리기",
      args0: [
        { type: "field_label", name: "BUZZER_LABEL", text: "🔊 소리" },
        { type: "input_value", name: "FREQ", check: "Number" },
        { type: "input_value", name: "DURATION", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#00CCFF",
      tooltip: "지정한 주파수(Hz)와 시간(초)으로 부저를 울립니다. 예: 262Hz=도, 392Hz=솔"
    },
    {
      type: "buzzer_note",
      message0: "%1 계명 %2 로 %3 초 울리기",
      args0: [
        { type: "field_label", name: "BUZZER_LABEL", text: "🔊 소리" },
        { type: "field_dropdown", name: "NOTE", options: [
          // 낮은 옥타브 (C3 ~ B3)
          ["도(↓)", "131"],
          ["레(↓)", "147"],
          ["미(↓)", "165"],
          ["파(↓)", "175"],
          ["솔(↓)", "196"],
          ["라(↓)", "220"],
          ["시(↓)", "247"],
          // 가운데 옥타브 (C4 ~ B4)
          ["도",   "262"],
          ["레",   "294"],
          ["미",   "330"],
          ["파",   "349"],
          ["솔",   "392"],
          ["라",   "440"],
          ["시",   "494"],
          // 높은 옥타브 (C5 ~ B5)
          ["도(↑)", "523"],
          ["레(↑)", "587"],
          ["미(↑)", "659"],
          ["파(↑)", "698"],
          ["솔(↑)", "784"],
          ["라(↑)", "880"],
          ["시(↑)", "988"]
        ]},
        { type: "input_value", name: "DURATION", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#00CCFF",
      tooltip: "선택한 계명에 해당하는 주파수로 부저를 울립니다. 세 옥타브 지원 — (↓)낮은 옥타브 / 기본 가운데 / (↑)높은 옥타브. 가운데 도=262 Hz, 라=440 Hz."
    },

    // 발사 블록 (빨강주황 #FF4500)
    {
      type: "gun_fire",
      message0: "%1",
      args0: [
        {
          type: "field_label",
          name: "LABEL",
          text: "🔫 발사 실행"
        }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF4500",
      tooltip: "BB탄을 한 발 발사합니다."
    },

    // 센서 블록 (회청색 #5C81A6)
    {
      type: "pico_check_device",
      message0: "%1 연결 확인",
      args0: [
        { type: "field_label", name: "SENSORS_LABEL", text: "📡 센서" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#5C81A6",
      tooltip: "Pico와 블루투스 연결 상태를 확인합니다. 연결되면 화면에 'CONNECTED' 표시."
    },
    {
      type: "check_distance",
      message0: "%1 거리 측정 → %2",
      args0: [
        { type: "field_label", name: "SENSORS_LABEL", text: "📡 센서" },
        { type: "field_variable", name: "VAR", variable: "거리값" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#5C81A6",
      tooltip: "초음파 센서로 전방 물체까지 거리(cm)를 측정하여 변수에 저장합니다."
    },
    {
      type: "check_magnetic",
      message0: "%1 자기장 감지 → %2",
      args0: [
        { type: "field_label", name: "SENSORS_LABEL", text: "📡 센서" },
        { type: "field_variable", name: "VAR", variable: "자기값" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#5C81A6",
      tooltip: "자기장 센서로 자석 감지 여부(0=없음, 1=감지)를 변수에 저장합니다."
    },

    // 시간 블록 (초록색 #5CA65C)
    {
      type: "time_sleep",
      message0: "⏱️ 기다리기 %1 초",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#5CA65C",
      tooltip: "지정한 시간(초)만큼 다음 명령 실행을 대기합니다."
    },

    // 수학 블록 (Blockly 기본 색상 230)
    {
      type: "math_arithmetic",
      message0: "%1 %2 %3",
      args0: [
        { type: "input_value", name: "A", check: "Number" },
        { type: "field_dropdown", name: "OP", options: [
          ["+", "ADD"], ["-", "MINUS"], ["×", "MULTIPLY"], ["÷", "DIVIDE"]
        ]},
        { type: "input_value", name: "B", check: "Number" }
      ],
      inputsInline: true,
      output: "Number",
      colour: 230,
      tooltip: "두 숫자를 사칙연산합니다. (+덧셈, -뺄셈, ×곱셈, ÷나눗셈)"
    },
    {
      type: "math_random_int",
      message0: "랜덤 %1 ~ %2",
      args0: [
        { type: "input_value", name: "FROM", check: "Number" },
        { type: "input_value", name: "TO", check: "Number" }
      ],
      inputsInline: true,
      output: "Number",
      colour: 230,
      tooltip: "지정한 범위 내에서 무작위 정수를 반환합니다."
    },

    // 묶음 실행 (보라색 #8E44AD)
    {
      type: "batch_block",
      message0: "🚀 한꺼번에 실행 %1 %2",
      args0: [
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#8E44AD",
      tooltip: "안에 담은 블록들을 한 묶음으로 Pico에 보내 빠르게 차례 실행합니다. 센서값을 받는 블록과 제어/반복 블록은 안에 넣을 수 없습니다."
    }
  ]
};

// batch_block에 자식 검증 onchange 핸들러를 부착한다.
// Blockly가 defineBlocksWithJsonArray로 만든 init 위에 onchange를 덧붙여
// 학생이 금지 블록을 드래그하면 노란 경고를 띄운다.
export function attachBatchBlockValidator(BlocklyLib) {
  const proto = BlocklyLib.Blocks['batch_block'];
  if (!proto) return;
  const originalInit = proto.init;
  proto.init = function() {
    originalInit.call(this);
    this.setOnChange((event) => {
      // 워크스페이스 전체 이벤트 중 자기 자식 관련만 처리
      if (!this.workspace || this.isInFlyout) return;
      let bad = null;
      let cur = this.getInputTargetBlock('DO');
      while (cur) {
        if (BATCH_FORBIDDEN_TYPES.has(cur.type)) { bad = cur.type; break; }
        cur = cur.getNextBlock();
      }
      this.setWarningText(bad
        ? `'${bad}' 블록은 [한꺼번에 실행] 안에 넣을 수 없어요. 바깥으로 빼주세요.`
        : null);
    });
  };
}

function getModuleBlockLabel(blockNames, activeModel, moduleName) {
  const cfg = MODULE_LABEL_CONFIG[moduleName];
  if (!cfg) return '';
  const emoji = moduleName === 'gun' && activeModel === 'launchpad' ? '🚀' : cfg.emoji;
  const name = blockNames?.[moduleName] || cfg.defaultName;
  return `${emoji} ${name}`;
}

function updateDynamicLabelFields(block, state) {
  for (const [moduleName, cfg] of Object.entries(MODULE_LABEL_CONFIG)) {
    const labelField = block.getField(cfg.field);
    if (labelField) {
      const label = moduleName === 'gun'
        ? getGunBlockLabel(state?.blockNames, state?.activeModel)
        : getModuleBlockLabel(state?.blockNames, state?.activeModel, moduleName);
      labelField.setValue(label);
    }
  }
}

// 모델별 동적 블록 이름 변경 기능 부착
export function attachDynamicNaming(BlocklyLib, state) {
  BlocklyConfig.blocks.forEach((blockDef) => {
    const proto = BlocklyLib.Blocks[blockDef.type];
    if (!proto || proto.__aresDynamicNamingAttached) return;
    const originalInit = proto.init;
    proto.init = function() {
      originalInit.call(this);
      updateDynamicLabelFields(this, state);
      if (this.type === 'gun_fire') {
        this.setTooltip(() => getGunBlockTooltip(state.blockNames, state.activeModel));
      }
    };
    proto.__aresDynamicNamingAttached = true;
  });
}

export function getGunBlockLabel(blockNames, activeModel) {
  return `${getModuleBlockLabel(blockNames, activeModel, 'gun')} 실행`;
}

export function getGunBlockTooltip(blockNames, activeModel) {
  const name = blockNames?.gun || '발사';
  if (activeModel === 'launchpad') {
    return `${name}를 실행합니다.`;
  }
  return `BB탄을 한 발 발사합니다.`;
}

export function updateWorkspaceBlocks(workspace, state) {
  if (!workspace) return;
  const blocks = workspace.getAllBlocks(false);
  blocks.forEach((block) => {
    updateDynamicLabelFields(block, state);
  });
}
