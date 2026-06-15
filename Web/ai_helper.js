// ai_helper.js
// 규칙/템플릿 기반 자연어 → Blockly XML 변환기 (오프라인·무료·LLM 없음).
//
// 3단 구조: 자연어 → 의도(intent) → 블록 디스크립터 → XML.
// 파서 앞단(규칙 매칭)만 나중에 LLM 으로 교체하면 뒷단(빌더·검증)은 재사용 가능.
//
// 지원: 이동/모터/LED/부저·멜로디/화면(한글→로마자)/대기/발사/연결확인,
//       N번 반복, 변수 정해/바꾸기, 센서 측정→변수, 변수 비교 조건문(if).
// 완성형 코드를 못 만들면 ok:false 와 함께 추천 블록(suggest)을 돌려준다.

import { romanizeKorean, hasKorean } from './romanize.js';

// ── 실재하는 블록 타입 화이트리스트 (모르는 타입이 새어 나가면 삽입 거부) ──
const KNOWN_TYPES = new Set([
  'timed_forward', 'timed_backward', 'timed_left', 'timed_right',
  'move_forward', 'move_backward', 'turn_left', 'turn_right', 'stop_moving',
  'main_motor_forward_timed', 'main_motor_backward_timed',
  'main_motor_forward', 'main_motor_backward', 'main_motor_stop',
  'set_lamp', 'led_on', 'led_off', 'led_off_all',
  'send_message', 'clear_display',
  'buzzer_on', 'buzzer_note',
  'gun_fire', 'pico_check_device',
  'time_sleep', 'controls_repeat_ext', 'controls_if', 'controls_whileUntil',
  'check_distance', 'check_magnetic',
  'variables_set', 'variables_get', 'math_change',
  'logic_compare', 'math_number', 'text',
]);

// ── 한글 수사 → 숫자 ──
const KO_NUM = {
  '한': 1, '하나': 1, '두': 2, '둘': 2, '세': 3, '셋': 3, '네': 4, '넷': 4,
  '다섯': 5, '여섯': 6, '일곱': 7, '여덟': 8, '아홉': 9, '열': 10,
};

// ── 계명 → 주파수(Hz) ──
const NOTE_MID = { '도': 262, '레': 294, '미': 330, '파': 349, '솔': 392, '라': 440, '시': 494 };
const NOTE_LOW = { '도': 131, '레': 147, '미': 165, '파': 175, '솔': 196, '라': 220, '시': 247 };
const NOTE_HIGH = { '도': 523, '레': 587, '미': 659, '파': 698, '솔': 784, '라': 880, '시': 988 };

// ── 절(clause) 분리: 접속어/구두점. '~고'(동사 연결어미, 뒤 공백)도 분리. ──
const CONNECTOR_RE = /\s*(?:그리고\s*나서|그리고서|그러고|그리고|그\s*다음에?|그다음에?|그담에?|한\s*다음에?|한다음에?|다음에|이고|이며|고(?=\s)|,|、|→|\n)\s*/g;

function splitClauses(text) {
  return text.split(CONNECTOR_RE).map((s) => s.trim()).filter((s) => s.length > 0);
}

// ── 측정 동작 뒤에 다른 동작/조건이 이어지면, 접속어가 없어도 절을 분리한다 ──
//   "거리를 측정해 결과를 출력해" → "거리를 측정해, 결과를 출력해"
//   "거리를 측정해 거리값이 10보다 작으면 멈춰" → "거리를 측정해, 거리값이 ..."
//   (측정 동사 형태는 그대로 두고 뒤에 구분자만 끼워, 1절의 센서 매칭은 유지)
const MEASURE_BOUNDARY_RE = /((?:거리|적외선|초음파|자기|자석)\s*(?:센서)?\s*(?:를|을)?\s*(?:재고|재서|재어|재|측정하고|측정해서|측정하여|측정해|측정하|측정|확인해서|확인하고|체크해서|체크하고|읽어서|읽고))\s+(?=\S)/g;
function splitMeasureBoundary(text) {
  return text.replace(MEASURE_BOUNDARY_RE, '$1, ');
}

// ── 숫자 추출 ──
function extractNumber(clause, unitRe, def) {
  const m = clause.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unitRe}`));
  if (m) return { value: parseFloat(m[1]), found: true };
  for (const [word, n] of Object.entries(KO_NUM)) {
    if (new RegExp(`${word}\\s*${unitRe}`).test(clause)) return { value: n, found: true };
  }
  const bare = clause.match(/(\d+(?:\.\d+)?)/);
  if (bare) return { value: parseFloat(bare[1]), found: true };
  return { value: def, found: false };
}
const seconds = (c, def = 1) => extractNumber(c, '초', def);

// ════════════════════════════════════════════════════════════
// XML 빌더 (변수 선언 자동 수집 포함)
// ════════════════════════════════════════════════════════════
let VARS; // name -> id (parse 1회당 wrapXml 에서 초기화)
function varId(name) {
  if (!VARS.has(name)) VARS.set(name, 'v' + (VARS.size + 1));
  return VARS.get(name);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function num(n) { return { type: 'math_number', fields: { NUM: n } }; }
function txt(s) { return { type: 'text', fields: { TEXT: s } }; }
function vget(name) { return { type: 'variables_get', fields: { VAR: { var: name } } }; }
function vset(name, val) { return { type: 'variables_set', fields: { VAR: { var: name } }, values: { VALUE: val } }; }
function distanceTo(name) { return { type: 'check_distance', fields: { VAR: { var: name } } }; }
function magneticTo(name) { return { type: 'check_magnetic', fields: { VAR: { var: name } } }; }
function compare(op, a, b) { return { type: 'logic_compare', fields: { OP: op }, values: { A: a, B: b } }; }
function ifThen(cond, body) { return { type: 'controls_if', values: { IF0: cond }, statements: { DO0: body } }; }
function ledOn(n) { return { type: 'led_on', values: { LED_NUM: num(n), BRIGHTNESS: num(1) } }; }
function ledOff(n) { return { type: 'led_off', values: { LED_NUM: num(n) } }; }
function lampAll(v) { return { type: 'set_lamp', values: Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`LAMP${i}`, num(v)])) }; }
function sleepFor(s) { return { type: 'time_sleep', values: { SECONDS: num(s) } }; }
function repeatN(n, body) { return { type: 'controls_repeat_ext', values: { TIMES: num(n) }, statements: { DO: body } }; }
// 눈/가슴 → LED 번호 (시뮬 매핑: 오른눈=LED1, 왼눈=LED2, 가슴=LED3)
function eyeTargets(c) {
  if (/왼쪽\s*눈|좌측\s*눈|왼눈/.test(c)) return { leds: [2], label: '왼쪽 눈' };
  if (/오른쪽\s*눈|우측\s*눈|오른눈/.test(c)) return { leds: [1], label: '오른쪽 눈' };
  if (/양쪽?\s*눈|두\s*눈|눈/.test(c)) return { leds: [1, 2], label: '양쪽 눈' };
  if (/가슴/.test(c)) return { leds: [3], label: '가슴' };
  return null;
}

function serializeBlock(desc) {
  let inner = '';
  for (const [name, val] of Object.entries(desc.fields || {})) {
    if (val && typeof val === 'object' && val.var !== undefined) {
      inner += `<field name="${name}" id="${varId(val.var)}">${esc(val.var)}</field>`;
    } else {
      inner += `<field name="${name}">${esc(val)}</field>`;
    }
  }
  for (const [name, child] of Object.entries(desc.values || {})) {
    inner += `<value name="${name}">${serializeBlock(child)}</value>`;
  }
  for (const [name, arr] of Object.entries(desc.statements || {})) {
    inner += `<statement name="${name}">${serializeChain(arr)}</statement>`;
  }
  if (desc.next) inner += `<next>${serializeBlock(desc.next)}</next>`;
  return `<block type="${desc.type}">${inner}</block>`;
}
function serializeChain(descs) {
  if (!descs.length) return '';
  for (let i = descs.length - 2; i >= 0; i--) descs[i].next = descs[i + 1];
  return serializeBlock(descs[0]);
}
function wrapXml(descs) {
  VARS = new Map();
  const body = serializeChain(descs.map((d) => ({ ...d }))); // varId() 가 여기서 변수 수집
  let vx = '';
  if (VARS.size) {
    vx = '<variables>' + [...VARS].map(([n, id]) => `<variable id="${id}">${esc(n)}</variable>`).join('') + '</variables>';
  }
  const withXY = body.replace('<block ', '<block x="40" y="40" ');
  return `<xml xmlns="https://developers.google.com/blockly/xml">${vx}${withXY}</xml>`;
}

// ── 메시지 추출 ──
function extractMessage(clause) {
  let m = clause.match(/["'“”']([^"'“”']+)["'“”']/);
  if (m) return m[1].trim();
  m = clause.match(/(.+?)\s*(?:라고|이라고)\s*(?:화면|표시|보여|써|출력|말)/);
  if (m) return m[1].trim();
  m = clause.match(/화면에?\s*(.+?)\s*(?:라고\s*)?(?:표시|보여|써|출력|나타)/);
  if (m) return m[1].trim();
  m = clause.match(/(.+?)\s*(?:라고\s*)?(?:표시|출력|보여|써)/);
  if (m) return m[1].trim();
  return '안녕';
}

// ── 계명 시퀀스 추출 ──
function extractNotes(clause) {
  const table = /높은/.test(clause) ? NOTE_HIGH : /낮은/.test(clause) ? NOTE_LOW : NOTE_MID;
  const notes = [];
  for (const ch of clause) if (table[ch] !== undefined) notes.push(table[ch]);
  return notes;
}

// ── 변수 생성 기록: 측정/대입한 변수와 "직전 변수"를 ctx 에 남긴다 ──
//   ctx.lastVar 는 "결과를 출력해" / "10보다 작으면" 처럼 이름을 생략한
//   참조가 어떤 변수를 가리키는지 해석하는 데 쓰인다.
function markVar(ctx, name, sensor) {
  ctx.measured.add(name);
  ctx.lastVar = name;
  ctx.lastSensor = sensor || null;
}

// ── 출력 대상 변수 해석: "결과/거리값/측정값을 출력" → 변수명 (없으면 null) ──
function detectOutputVar(c, ctx) {
  // 1) 이미 만든 변수 이름을 직접 말한 경우 ("거리값을 보여줘")
  for (const v of ctx.measured) if (c.includes(v)) return v;
  // 2) "결과/측정값/센서값/값을/숫자/수치" → 직전에 측정·생성한 변수
  if (ctx.lastVar && /결과|측정\s*값|센서\s*값|값을|숫자|수치/.test(c)) return ctx.lastVar;
  return null;
}

// ════════════════════════════════════════════════════════════
// 동작(action) 규칙 — 절 하나 → { node, label } 또는 null
// ════════════════════════════════════════════════════════════
function matchAction(c, ctx) {
  // 0) 센서 측정 → 변수
  if (/(?:적외선|거리|초음파)\s*(?:센서)?\s*(?:를)?\s*(?:재|측정|확인|체크|읽)/.test(c)) {
    markVar(ctx, '거리값', 'distance');
    return { node: distanceTo('거리값'), label: '거리 측정 → 거리값' };
  }
  if (/(?:자기|자석)\s*(?:센서)?\s*(?:를)?\s*(?:재|측정|확인|감지|체크)/.test(c)) {
    markVar(ctx, '자기값', 'magnetic');
    return { node: magneticTo('자기값'), label: '자기 측정 → 자기값' };
  }

  // 1) 변수 정하기: "속도를 5로 정해/저장"
  let mv = c.match(/([가-힣A-Za-z_]+)\s*(?:을|를|는|=)?\s*(\d+(?:\.\d+)?)\s*(?:으?로)?\s*(?:정해|정하|저장|담아|넣어|로\s*해)/);
  if (mv && !/cm|센티|초|번|밝기/.test(mv[0])) {
    const name = mv[1].replace(/(?:을|를|은|는|이|가|의)$/, '') || mv[1];
    markVar(ctx, name, null);
    return { node: vset(name, num(parseFloat(mv[2]))), label: `${name} = ${mv[2]}` };
  }

  // 2) 멜로디
  const notes = extractNotes(c);
  if (notes.length >= 2) {
    const dur = seconds(c, 0.5).value;
    const chain = notes.map((f) => ({ type: 'buzzer_note', fields: { NOTE: f }, values: { DURATION: num(dur) } }));
    return { node: chain, label: `계명 ${notes.length}개 멜로디` };
  }
  // 노래/멜로디/음악 (계명 미지정) → 기본 멜로디(도미솔도). 소리는 부저로 매핑.
  if (/노래|멜로디|음악/.test(c)) {
    const tune = [262, 330, 392, 523];
    const chain = tune.map((f) => ({ type: 'buzzer_note', fields: { NOTE: f }, values: { DURATION: num(0.4) } }));
    return { node: chain, label: '노래(도미솔도) — 부저' };
  }

  // 3) 부저 / 소리
  if (/부저|삐|소리|울려|울리|헤르츠|hz/i.test(c)) {
    const hz = c.match(/(\d+)\s*(?:헤르츠|hz)/i);
    const dur = seconds(c, 0.5).value;
    if (hz) return { node: { type: 'buzzer_on', values: { FREQ: num(+hz[1]), DURATION: num(dur) } }, label: `${hz[1]}Hz ${dur}초` };
    const f = notes.length === 1 ? notes[0] : 262;
    return { node: { type: 'buzzer_note', fields: { NOTE: f }, values: { DURATION: num(dur) } }, label: `부저 ${dur}초` };
  }

  // 4) 화면 표시 (한글 → 로마자)
  if (/화면\s*지우|화면\s*클리어/.test(c)) {
    return { node: { type: 'clear_display' }, label: '화면 지우기' };
  }
  if (/화면|표시|글자|써줘|써\b|보여|출력|말해|알려|인사/.test(c)) {
    // 측정·변수 결과 출력: "결과를 출력해", "거리값을 보여줘" → 변수값을 화면에.
    // 따옴표가 있으면 사용자가 적은 문자 그대로 출력하려는 의도이므로 변수 해석 생략.
    if (!/["'“”']/.test(c)) {
      const outVar = detectOutputVar(c, ctx);
      if (outVar) {
        return { node: { type: 'send_message', values: { Msg: vget(outVar) } }, label: `화면에 ${outVar} 값 표시` };
      }
    }
    const raw = extractMessage(c);
    const rom = romanizeKorean(raw) || 'Hello';
    const note = (hasKorean(raw) && rom !== raw) ? ` (한글→로마자 "${raw}"→"${rom}")` : '';
    return { node: { type: 'send_message', values: { Msg: txt(rom) } }, label: `화면에 "${rom}" 표시${note}` };
  }

  // 5) LED / 눈 / 가슴 (의미 매핑 + 행동 패턴)
  //   눈=LED(오른눈1·왼눈2), 가슴=LED3. "번갈아 켰다 껐다 / 깜빡 / 윙크" 같은
  //   간접 요구를 led_on/off + 기다리기 + 반복 조합으로 생성한다.
  const eye = eyeTargets(c);
  if (eye || /윙크/.test(c) || /(?:led|엘이디|램프|불|전구|빛)/i.test(c)) {
    const targets = eye ? eye.leds : null;          // null = 전체(set_lamp)
    const tLabel = eye ? eye.label : 'LED';
    const cnt = extractNumber(c, '번', 4).value;
    const numMatch = c.match(/(\d+)\s*번/);

    // 번갈아 켰다 껐다 (2개 이상 대상)
    if (targets && targets.length >= 2 && /번갈아|교대/.test(c)) {
      const [a, b] = targets;
      const cycle = [ledOn(a), ledOff(b), sleepFor(0.4), ledOff(a), ledOn(b), sleepFor(0.4)];
      return { node: repeatN(cnt, cycle), label: `${tLabel} 번갈아 깜빡 (${cnt}번)` };
    }
    // 깜빡임 / 켰다 껐다 / 윙크
    if (/깜빡|깜박|반짝|점멸|켰다\s*껐다|껐다\s*켰다|윙크/.test(c)) {
      const wink = /윙크/.test(c);
      // 윙크는 한쪽 눈만 — 지정된 눈이 있으면 그 눈, 없으면 오른눈(LED1)
      const leds = wink ? (eye && eye.leds.length === 1 ? eye.leds : [1]) : targets;
      const onArr = leds ? leds.map(ledOn) : [lampAll(1)];
      const offArr = leds ? leds.map(ledOff) : [lampAll(0)];
      const cycle = [...onArr, sleepFor(0.4), ...offArr, sleepFor(0.4)];
      return { node: repeatN(cnt, cycle), label: `${wink ? '윙크' : tLabel + ' 깜빡'} (${cnt}번)` };
    }
    // 끄기
    if (/끄|꺼|소등|off/i.test(c)) {
      if (targets) return { node: targets.map(ledOff), label: `${tLabel} 끄기` };
      if (numMatch) return { node: ledOff(+numMatch[1]), label: `LED ${numMatch[1]}번 끄기` };
      return { node: { type: 'led_off_all' }, label: 'LED 전체 끄기' };
    }
    // 켜기
    if (/켜|키|on|밝/i.test(c)) {
      if (targets) return { node: targets.map(ledOn), label: `${tLabel} 켜기` };
      const brightness = /밝기/.test(c) ? extractNumber(c, '밝기', 1).value : 1;
      if (numMatch) return { node: { type: 'led_on', values: { LED_NUM: num(+numMatch[1]), BRIGHTNESS: num(brightness) } }, label: `LED ${numMatch[1]}번 켜기` };
      return { node: lampAll(1), label: 'LED 전체 켜기' };
    }
  }

  // 6) 발사 (로켓 발사 / 총 쏘기 — 둘 다 gun_fire 로 매핑)
  if (/발사|쏴|쏘|로켓|총/.test(c)) return { node: { type: 'gun_fire' }, label: '발사' };

  // 6.5) 레이더(발사대) = DC 모터 회전
  if (/레이더|radar/i.test(c)) {
    if (/멈춰|멈추|정지|꺼|끄|스톱|그만/.test(c)) return { node: { type: 'main_motor_stop' }, label: '레이더 정지 (DC모터)' };
    const s = seconds(c, 2);
    if (s.found && !/계속/.test(c)) return { node: { type: 'main_motor_forward_timed', values: { SECONDS: num(s.value) } }, label: `레이더 ${s.value}초 회전 (DC모터)` };
    return { node: { type: 'main_motor_forward' }, label: '레이더 회전 (DC모터)' };
  }

  // 7) 연결 확인
  if (/연결\s*(?:확인|상태|됐|되었)|접속\s*확인/.test(c)) return { node: { type: 'pico_check_device' }, label: '연결 확인' };

  // 8) 기다리기
  if (/기다|대기|쉬어|쉬기|잠깐\s*멈/.test(c)) {
    const s = seconds(c, 1).value;
    return { node: { type: 'time_sleep', values: { SECONDS: num(s) } }, label: `${s}초 기다리기` };
  }

  // 9) 이동
  const dc = /디씨|dc|바퀴|카트|메인\s*모터/i.test(c);
  if (/멈춰|멈추|정지|스톱|스탑|그만|서줘|섯/.test(c)) {
    return dc ? { node: { type: 'main_motor_stop' }, label: 'DC모터 정지' } : { node: { type: 'stop_moving' }, label: '서보 정지' };
  }
  let dir = null, ko = '';
  if (/앞|전진|직진|forward|가줘|가기|이동/i.test(c)) { dir = 'forward'; ko = '전진'; }
  else if (/뒤|후진|back/i.test(c)) { dir = 'backward'; ko = '후진'; }
  else if (/왼|좌회전|좌측|left/i.test(c)) { dir = 'left'; ko = '좌회전'; }
  else if (/오른|우회전|우측|right/i.test(c)) { dir = 'right'; ko = '우회전'; }
  if (dir) {
    const cont = /계속|쭉|끝까지/.test(c);
    const s = seconds(c, 1);
    if (dc && (dir === 'forward' || dir === 'backward')) {
      if (dir === 'forward') return cont ? { node: { type: 'main_motor_forward' }, label: 'DC모터 계속 전진' } : { node: { type: 'main_motor_forward_timed', values: { SECONDS: num(s.value) } }, label: `DC모터 전진 ${s.value}초` };
      return cont ? { node: { type: 'main_motor_backward' }, label: 'DC모터 계속 후진' } : { node: { type: 'main_motor_backward_timed', values: { SECONDS: num(s.value) } }, label: `DC모터 후진 ${s.value}초` };
    }
    if (cont) {
      const map = { forward: 'move_forward', backward: 'move_backward', left: 'turn_left', right: 'turn_right' };
      return { node: { type: map[dir] }, label: `서보 계속 ${ko}` };
    }
    const map = { forward: 'timed_forward', backward: 'timed_backward', left: 'timed_left', right: 'timed_right' };
    return { node: { type: map[dir], values: { SECONDS: num(s.value) } }, label: `서보 ${ko} ${s.value}초` };
  }

  return null;
}

// ── 조건 비교 해석: "거리가 10보다 작으면" → {varName, op, value, sensor} ──
const OP_KO = { LT: '<', LTE: '≤', GT: '>', GTE: '≥', EQ: '=' };
function detectComparison(condText, ctx) {
  let varName = null, sensor = null;
  if (/적외선|거리|초음파/.test(condText)) { varName = '거리값'; sensor = 'distance'; }
  else if (/자기|자석/.test(condText)) { varName = '자기값'; sensor = 'magnetic'; }
  else {
    // 이미 만든 변수 이름이 조건에 등장하면 사용
    for (const v of ctx.measured) if (condText.includes(v)) { varName = v; break; }
  }
  // 변수명을 생략한 비교 ("10보다 작으면") → 직전에 측정·생성한 변수에 결부
  if (!varName && ctx.lastVar && /\d/.test(condText)
      && /작|적|크|많|같|동일|이상|이하|미만|초과|넘|가까|멀|짧|길|아래|위|낮|높|이내/.test(condText)) {
    varName = ctx.lastVar;
    sensor = ctx.lastSensor;
  }
  if (!varName) return null;

  let op = null;
  if (/이하/.test(condText)) op = 'LTE';
  else if (/이상/.test(condText)) op = 'GTE';
  else if (/작|적|가까|짧|미만|아래|낮|이내/.test(condText)) op = 'LT';
  else if (/크|많|멀|길|초과|넘|위|높/.test(condText)) op = 'GT';
  else if (/같|동일|이면|==/.test(condText)) op = 'EQ';

  let value = null;
  const nm = condText.match(/(\d+(?:\.\d+)?)/);
  if (nm) value = parseFloat(nm[1]);
  else if (sensor === 'magnetic' && /감지|있으면|닿|붙/.test(condText)) { value = 1; op = op || 'EQ'; }

  if (op === null || value === null) return null;
  return { varName, op, value, sensor };
}

// ── 절 파싱: 조건문 → 반복 → 단순 동작 순서 ──
function parseClause(c, ctx) {
  // 1) 조건문 "~(으)면 <동작>"
  const cond = c.match(/^(.*?(?:으면|면))\s+(.+)$/);
  if (cond) {
    const info = detectComparison(cond[1], ctx);
    if (info) {
      const body = matchAction(cond[2], ctx);
      if (body) {
        const bodyArr = Array.isArray(body.node) ? body.node : [body.node];
        const prepend = [];
        if (info.sensor && !ctx.measured.has(info.varName)) {
          // 아직 측정 전이면 조건 앞에 센서 측정 블록을 자동으로 끼운다
          prepend.push(info.sensor === 'distance' ? distanceTo(info.varName) : magneticTo(info.varName));
          markVar(ctx, info.varName, info.sensor);
        }
        const ifNode = ifThen(compare(info.op, vget(info.varName), num(info.value)), bodyArr);
        return {
          node: [...prepend, ifNode],
          label: `만약 ${info.varName} ${OP_KO[info.op]} ${info.value} 이면 (${body.label})`,
        };
      }
      // 조건은 이해했지만 동작을 못 만든 경우 → 추천으로 유도
      return { needSuggest: 'sensor' };
    }
  }

  // 2) "N번 반복 <동작>"
  const rep = c.match(/(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번\s*(?:씩\s*)?(?:반복|돌려|되풀이)/);
  if (rep) {
    const n = /\d/.test(rep[1]) ? parseInt(rep[1], 10) : (KO_NUM[rep[1]] || 3);
    const rest = c.replace(rep[0], ' ').trim();
    const inner = rest ? matchAction(rest, ctx) : null;
    if (inner) {
      const body = Array.isArray(inner.node) ? inner.node : [inner.node];
      return { node: { type: 'controls_repeat_ext', values: { TIMES: num(n) }, statements: { DO: body } }, label: `${n}번 반복 (${inner.label})` };
    }
    return { repeatOnly: n };
  }

  // 3) 단순 동작
  return matchAction(c, ctx);
}

// ── 화이트리스트 검증 ──
function collectTypes(desc, out) {
  if (Array.isArray(desc)) { desc.forEach((d) => collectTypes(d, out)); return; }
  out.add(desc.type);
  Object.values(desc.values || {}).forEach((v) => collectTypes(v, out));
  Object.values(desc.statements || {}).forEach((a) => collectTypes(a, out));
  if (desc.next) collectTypes(desc.next, out);
}

// ── 추천 블록 (완성 못 할 때) ──
const SUGGEST = {
  sensor: { title: '센서로 제어하기', blocks: ['📡 거리 측정 → 변수', '🔢 비교 (<, >, =)', '❓ 만약(if)'], hint: '예: "거리 측정하고, 거리값이 10보다 작으면 멈춰"' },
  loop: { title: '반복하기', blocks: ['🔁 반복 N번', '⏱️ 기다리기'], hint: '예: "3번 반복 앞으로 가기"' },
  variable: { title: '변수 쓰기', blocks: ['📦 변수 정하기/바꾸기', '🔢 수학'], hint: '예: "속도를 5로 정해"' },
};
function suggestionsFor(text) {
  const s = [];
  if (/만약|조건|이면|으면|센서|거리|적외선|자기|자석/.test(text)) s.push(SUGGEST.sensor);
  if (/반복|돌려|계속|동안|까지/.test(text)) s.push(SUGGEST.loop);
  if (/변수|값을|담아|저장|정해/.test(text)) s.push(SUGGEST.variable);
  return s;
}

// ════════════════════════════════════════════════════════════
// 공개 API
//   parse(text) → { ok, replace, xml, added:[label], unmatched:[clause], error, suggest:[{title,blocks,hint}] }
// ════════════════════════════════════════════════════════════
export function parse(rawText) {
  const text = (rawText || '').trim();
  if (!text) return { ok: false, error: '무엇을 하고 싶은지 적어줘요.', unmatched: [], added: [], suggest: [] };

  const replace = /처음부터|새로\s*만들|다\s*지우고|지우고\s*시작|싹\s*지우/.test(text);
  const cleaned = splitMeasureBoundary(
    text.replace(/처음부터|새로\s*만들(?:어줘|어)?|다\s*지우고|지우고\s*시작|싹\s*지우고?/g, ' ')
  );

  const clauses = splitClauses(cleaned);
  const ctx = { measured: new Set(), lastVar: null, lastSensor: null };
  const descs = [];
  const added = [];
  const unmatched = [];
  let pendingRepeat = null;

  for (const c of clauses) {
    const r = parseClause(c, ctx);
    if (!r || r.needSuggest) { unmatched.push(c); continue; }
    if (r.repeatOnly) { pendingRepeat = { n: r.repeatOnly }; continue; }

    const nodes = Array.isArray(r.node) ? r.node : [r.node];
    if (pendingRepeat) {
      descs.push({ type: 'controls_repeat_ext', values: { TIMES: num(pendingRepeat.n) }, statements: { DO: nodes } });
      added.push(`${pendingRepeat.n}번 반복 (${r.label})`);
      pendingRepeat = null;
    } else {
      nodes.forEach((n) => descs.push(n));
      added.push(r.label);
    }
  }

  if (!descs.length) {
    return { ok: false, error: '완성된 코드를 만들기 어려워요.', unmatched, added: [], suggest: suggestionsFor(text) };
  }

  const types = new Set();
  collectTypes(descs, types);
  for (const t of types) {
    if (!KNOWN_TYPES.has(t)) return { ok: false, error: `내부 오류: 알 수 없는 블록(${t})`, unmatched, added: [], suggest: [] };
  }

  const suggest = unmatched.length ? suggestionsFor(unmatched.join(' ')) : [];
  return { ok: true, replace, xml: wrapXml(descs), added, unmatched, suggest };
}

export const _internal = { splitClauses, splitMeasureBoundary, matchAction, parseClause, detectComparison, detectOutputVar, KNOWN_TYPES };
