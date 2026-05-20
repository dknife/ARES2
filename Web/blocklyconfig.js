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

export const BlocklyConfig = {
  blocks: [
    // 서보 모터 블록 (주황색 #FF8C00)
    {
      type: "timed_forward",
      message0: "🚗 서보 전진 %1 초",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터로 지정한 시간(초)만큼 전진합니다."
    },
    {
      type: "timed_backward",
      message0: "🚗 서보 후진 %1 초",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터로 지정한 시간(초)만큼 후진합니다."
    },
    {
      type: "timed_left",
      message0: "🚗 서보 좌회전 %1 초",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터로 지정한 시간(초)만큼 좌회전합니다."
    },
    {
      type: "timed_right",
      message0: "🚗 서보 우회전 %1 초",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터로 지정한 시간(초)만큼 우회전합니다."
    },
    {
      type: "move_forward",
      message0: "🚗 서보 계속 전진",
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "정지 명령 전까지 서보 모터로 계속 전진합니다."
    },
    {
      type: "move_backward",
      message0: "🚗 서보 계속 후진",
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "정지 명령 전까지 서보 모터로 계속 후진합니다."
    },
    {
      type: "turn_left",
      message0: "🚗 서보 계속 좌회전",
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "정지 명령 전까지 서보 모터로 계속 좌회전합니다."
    },
    {
      type: "turn_right",
      message0: "🚗 서보 계속 우회전",
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "정지 명령 전까지 서보 모터로 계속 우회전합니다."
    },
    {
      type: "stop_moving",
      message0: "🚗 서보 정지",
      previousStatement: null,
      nextStatement: null,
      colour: "#FF8C00",
      tooltip: "서보 모터를 즉시 정지합니다."
    },

    // DC 모터 블록 (노랑색 #FFCC00)
    {
      type: "main_motor_forward_timed",
      message0: "⚡ DC모터 전진 %1 초",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "DC 모터를 지정한 시간만큼 전진시킵니다."
    },
    {
      type: "main_motor_backward_timed",
      message0: "⚡ DC모터 후진 %1 초",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "DC 모터를 지정한 시간만큼 후진시킵니다."
    },
    {
      type: "main_motor_forward",
      message0: "⚡ DC모터 계속 전진",
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "정지 명령 전까지 DC 모터를 계속 전진시킵니다."
    },
    {
      type: "main_motor_backward",
      message0: "⚡ DC모터 계속 후진",
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "정지 명령 전까지 DC 모터를 계속 후진시킵니다."
    },
    {
      type: "main_motor_stop",
      message0: "⚡ DC모터 정지",
      previousStatement: null,
      nextStatement: null,
      colour: "#FFCC00",
      tooltip: "DC 모터를 즉시 정지합니다."
    },

    // LED 블록 (빨강색 #FF5555)
    {
      type: "set_lamp",
      message0: "💡 LED 전체 설정 [ %1 %2 %3 %4 %5 ]",
      args0: [
        { type: "input_value", name: "LAMP0", check: "Number" },
        { type: "input_value", name: "LAMP1", check: "Number" },
        { type: "input_value", name: "LAMP2", check: "Number" },
        { type: "input_value", name: "LAMP3", check: "Number" },
        { type: "input_value", name: "LAMP4", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF5555",
      tooltip: "5개 LED 밝기를 한번에 설정합니다. 값: 0(끔)~1(최대 밝기)"
    },
    {
      type: "led_on",
      message0: "💡 LED %1 번 켜기 (밝기 %2 )",
      args0: [
        { type: "input_value", name: "LED_NUM", check: "Number" },
        { type: "input_value", name: "BRIGHTNESS", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF5555",
      tooltip: "특정 LED(1~5번)를 지정한 밝기로 켭니다. 밝기: 0~1"
    },
    {
      type: "led_off",
      message0: "💡 LED %1 끄기",
      args0: [
        { type: "field_dropdown", name: "LED_NUM", options: [
          ["1번", "1"], ["2번", "2"], ["3번", "3"], ["4번", "4"], ["5번", "5"], ["전체", "ALL"]
        ]}
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF5555",
      tooltip: "특정 LED 또는 전체 LED를 끕니다."
    },

    // 메인 LED 블록 (진분홍색 #FF33CC)
    {
      type: "main_led_on",
      message0: "💡 메인 LED 켜기 (밝기 %1 )",
      args0: [{ type: "input_value", name: "BRIGHTNESS", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#FF33CC",
      tooltip: "메인 LED를 지정한 밝기로 켭니다. 밝기: 0 (끔) ~ 1 (최대)"
    },
    {
      type: "main_led_off",
      message0: "💡 메인 LED 끄기",
      previousStatement: null,
      nextStatement: null,
      colour: "#FF33CC",
      tooltip: "메인 LED를 끕니다."
    },

    // 디스플레이 블록 (보라색 #9966FF)
    {
      type: "send_message",
      message0: "🖥️ 화면에 표시: %1",
      args0: [{ type: "input_value", name: "Msg", check: "String" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#9966FF",
      tooltip: "OLED 디스플레이에 텍스트를 표시합니다."
    },
    {
      type: "clear_display",
      message0: "🖥️ 화면 지우기",
      previousStatement: null,
      nextStatement: null,
      colour: "#9966FF",
      tooltip: "OLED 디스플레이 화면을 깨끗하게 지웁니다."
    },

    // 소리 블록 (하늘색 #00CCFF)
    {
      type: "buzzer_on",
      message0: "🔊 부저 %1 Hz로 %2 초 울리기",
      args0: [
        { type: "input_value", name: "FREQ", check: "Number" },
        { type: "input_value", name: "DURATION", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#00CCFF",
      tooltip: "지정한 주파수(Hz)와 시간(초)으로 부저를 울립니다. 예: 262Hz=도, 392Hz=솔"
    },

    // 발사 블록 (빨강주황 #FF4500)
    {
      type: "gun_fire",
      message0: "🔫 발사 실행",
      previousStatement: null,
      nextStatement: null,
      colour: "#FF4500",
      tooltip: "BB탄을 한 발 발사합니다."
    },

    // 센서 블록 (회청색 #5C81A6)
    {
      type: "pico_check_device",
      message0: "📡 연결 확인",
      previousStatement: null,
      nextStatement: null,
      colour: "#5C81A6",
      tooltip: "Pico와 블루투스 연결 상태를 확인합니다. 연결되면 화면에 'CONNECTED' 표시."
    },
    {
      type: "check_distance",
      message0: "📡 거리 측정 → %1",
      args0: [{ type: "field_variable", name: "VAR", variable: "거리값" }],
      previousStatement: null,
      nextStatement: null,
      colour: "#5C81A6",
      tooltip: "초음파 센서로 전방 물체까지 거리(cm)를 측정하여 변수에 저장합니다."
    },
    {
      type: "check_magnetic",
      message0: "📡 자기장 감지 → %1",
      args0: [{ type: "field_variable", name: "VAR", variable: "자기값" }],
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
