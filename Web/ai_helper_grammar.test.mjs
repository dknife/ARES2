// ai_helper_grammar.test.mjs
// PoC 검증: 문법 파서가 정규식 파서(ai_helper.js)가 못 푸는 복문/중첩 제어문을
// 처리하는지 확인한다. node 로 직접 실행:  node Web/ai_helper_grammar.test.mjs
//
// 각 케이스: 문법 파서 결과가 기대 구조를 담는지 assert + 정규식 파서 결과를 대조 출력.

import { parse as grammarParse } from './ai_helper_grammar.js';
import { parse as regexParse } from './ai_helper.js';

let pass = 0, fail = 0;
const fails = [];

// XML 안에서 부분문자열들이 "이 순서대로" 등장하는지 (중첩 구조 확인용)
function inOrder(xml, parts) {
  let idx = -1;
  for (const p of parts) {
    const at = xml.indexOf(p, idx + 1);
    if (at === -1) return false;
    idx = at;
  }
  return true;
}

function check(name, input, expectFns) {
  const g = grammarParse(input);
  const r = regexParse(input);
  const problems = [];
  if (!g.ok) problems.push(`grammar ok=false (${g.error || ''})`);
  else for (const [desc, fn] of expectFns) if (!fn(g.xml)) problems.push(`기대 불충족: ${desc}`);

  const regexHas = (() => {
    if (!r.ok) return '정규식: ok=false';
    const flags = [];
    if (r.xml.includes('else="1"')) flags.push('else');
    if (r.xml.includes('controls_whileUntil')) flags.push('while');
    return `정규식: ok, ${flags.length ? flags.join('+') : 'else/while 없음'}`;
  })();

  if (problems.length === 0) {
    pass++;
    console.log(`✅ ${name}`);
    console.log(`   입력: ${input}`);
    console.log(`   문법: ${g.added.join(' → ')}`);
    console.log(`   대조 ${regexHas}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`❌ ${name}`);
    console.log(`   입력: ${input}`);
    problems.forEach((p) => console.log(`   - ${p}`));
    console.log(`   grammar.xml: ${g.xml || '(none)'}`);
  }
  console.log('');
}

// ── 1) if / else ──
check('① 만약~아니면 (if/else)',
  '거리를 측정하고 거리가 10보다 작으면 멈추고 아니면 앞으로 가', [
  ['controls_if + else mutation', (x) => x.includes('controls_if') && x.includes('else="1"')],
  ['then=멈춤, else=전진 순서', (x) => inOrder(x, ['controls_if', '<statement name="DO0">', 'stop_moving', '<statement name="ELSE">', 'timed_forward'])],
  ['거리 측정 블록 포함', (x) => x.includes('check_distance')],
]);

// ── 2) while (~동안) ──
check('② ~동안 반복 (while)',
  '거리가 10보다 클 동안 앞으로 가', [
  ['controls_whileUntil + MODE WHILE', (x) => x.includes('controls_whileUntil') && inOrder(x, ['MODE">WHILE'])],
  ['조건 비교(GT) 포함', (x) => inOrder(x, ['logic_compare', 'OP">GT'])],
  ['센서 자동 측정 prepend', (x) => inOrder(x, ['check_distance', 'controls_whileUntil'])],
]);

// ── 3) 반복 안의 조건문 (중첩) ──
check('③ 반복 속 조건문 (중첩)',
  '3번 반복해서 거리가 10보다 작으면 멈춰', [
  ['repeat → DO → if 순서', (x) => inOrder(x, ['controls_repeat_ext', '<statement name="DO">', 'controls_if', 'stop_moving'])],
  ['반복 횟수 3', (x) => inOrder(x, ['controls_repeat_ext', 'NUM">3'])],
]);

// ── 4) 복문 (시퀀스 + if/else + 반복) ──
//   ※ matchAction 어휘 한계를 피해 문법 능력만 검증: '앞으로 가', '불을' 사용.
check('④ 복문 종합',
  '앞으로 2초 가고, 거리가 10보다 작으면 멈추고 아니면 앞으로 가고, 불을 3번 깜빡여', [
  ['전진 2초', (x) => inOrder(x, ['timed_forward', 'NUM">2'])],
  ['if/else (멈춤 / 전진)', (x) => inOrder(x, ['controls_if', 'else="1"', 'stop_moving', 'ELSE', 'timed_forward'])],
  ['깜빡임 반복', (x) => x.includes('controls_repeat_ext') && (x.includes('led_on') || x.includes('set_lamp'))],
]);

// ── 5) 단순 명령은 기존과 동등하게 동작(회귀 방지) ──
check('⑤ 단순 명령 회귀',
  '앞으로 3초 가', [
  ['timed_forward 3초', (x) => inOrder(x, ['timed_forward', 'NUM">3'])],
]);

console.log('─'.repeat(50));
console.log(`결과: ${pass} 통과 / ${fail} 실패`);
if (fail) { console.log('실패:', fails.join(', ')); process.exit(1); }
