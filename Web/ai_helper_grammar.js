// ai_helper_grammar.js
// 자연어 → Blockly XML 변환기의 "앞단"을 정규식에서 문법(grammar) 파서로 교체한 PoC.
//
// 설계: 의미 토큰화 + 재귀하강(recursive-descent) 파서.
//   1) 한국어 어휘 인식(어떤 동작·어떤 조건인지)은 기존 ai_helper.js 의
//      matchAction / detectComparison 을 그대로 재사용한다(중복 제거).
//   2) 절(clause) 사이의 "구성·중첩"(if/else, ~동안/까지 while, N번 반복, 시퀀스)은
//      이 파일의 재귀 문법이 담당한다. 정규식 파서가 못 푸는 복문·중첩 제어문이 목표.
//   3) 뒷단(디스크립터 → XML 직렬화 + 화이트리스트 검증)은 ai_helper.js 와 동일 포맷.
//      (controls_if 의 else, controls_whileUntil 표현을 위해 mutation 직렬화만 추가)
//
// 이 PoC 가 새로 푸는 것:
//   · 만약~아니면 (if / else)            예) "거리가 10보다 작으면 멈추고 아니면 앞으로 가"
//   · ~인 동안 / ~까지 반복 (while/until) 예) "거리가 10보다 클 동안 앞으로 가"
//   · 반복 안의 조건문 (중첩)             예) "3번 반복해서 거리가 10보다 작으면 멈춰"
//   · 위 셋이 섞인 복문                    예) "앞으로 2초 가고, 거리가 ... 멈추고 아니면 계속 가고, 3번 깜빡여"

import { _internal } from './ai_helper.js';
const { splitClauses, splitMeasureBoundary, matchAction, detectComparison, KNOWN_TYPES } = _internal;

// ── 한글 수사 → 숫자 (반복 횟수용) ──
const KO_NUM = {
  '한': 1, '두': 2, '세': 3, '네': 4, '다섯': 5, '여섯': 6, '일곱': 7, '여덟': 8, '아홉': 9, '열': 10,
};
const OP_KO = { LT: '<', LTE: '≤', GT: '>', GTE: '≥', EQ: '=' };

// ── 비교어 활용형 정규화: detectComparison 이 stem 으로 인식하도록 관형형/어간을 보정 ──
//   (예: "클/큰/커" → "크", "먼" → "멀", "긴" → "길". detectComparison 의 op 정규식은
//    /크|많|멀|길|.../ 처럼 어간 글자에 의존하는데, 한국어 활용형은 그 글자를 안 품을 수 있다.)
function normCompare(s) {
  return String(s)
    .replace(/클수록|클|큰|커지|커/g, '크')
    .replace(/먼|멀어|멀리/g, '멀')
    .replace(/긴|길어/g, '길')
    .replace(/작은|작을/g, '작')
    .replace(/가까운|가까울|가까워/g, '가까')
    .replace(/짧은|짧을/g, '짧')
    .replace(/같은|같을/g, '같');
}

// ── else(아니면) 절 표지 ──
const ELSE_RE = /^\s*(?:아니면은?|아니라면|그렇지\s*않으면|그러지\s*않으면|안\s*그러면)/;
const isElse = (c) => ELSE_RE.test(c);

// ── 조건문 헤더: "<...>(으)면 <동작>" ──
const COND_RE = /^(.*?(?:으면|면))\s+(.+)$/;
// ── while/until 헤더: "<조건> 동안|까지 <동작>" ──
const WHILE_RE = /^(.*?)\s*(동안|까지|때까지)\s+(.+)$/;

// ── 반복 헤더: "N번 반복(해서/하면서/...)" → {n, rest, restEmpty} ──
function matchRepeatHeader(c) {
  const m = c.match(/(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번\s*(?:씩\s*)?(?:반복|돌려|되풀이)(?:해서|하면서|하여|하고|해|하)?/);
  if (!m) return null;
  const n = /\d/.test(m[1]) ? parseInt(m[1], 10) : (KO_NUM[m[1]] || 3);
  const rest = c.replace(m[0], ' ').trim();
  return { n, rest, restEmpty: rest.length === 0 };
}

// ════════════════════════════════════════════════════════════
// 디스크립터 노드 생성자 (ai_helper.js 와 동일 포맷 — 잎(leaf) 노드와 호환)
// ════════════════════════════════════════════════════════════
const num = (n) => ({ type: 'math_number', fields: { NUM: n } });
const vget = (name) => ({ type: 'variables_get', fields: { VAR: { var: name } } });
const compare = (op, a, b) => ({ type: 'logic_compare', fields: { OP: op }, values: { A: a, B: b } });
const distanceTo = (name) => ({ type: 'check_distance', fields: { VAR: { var: name } } });
const magneticTo = (name) => ({ type: 'check_magnetic', fields: { VAR: { var: name } } });
const ifThen = (cond, body) => ({ type: 'controls_if', values: { IF0: cond }, statements: { DO0: body } });
const ifElse = (cond, body, elseBody) => ({
  type: 'controls_if', mutation: { else: 1 },
  values: { IF0: cond }, statements: { DO0: body, ELSE: elseBody },
});
const whileUntil = (mode, cond, body) => ({
  type: 'controls_whileUntil', fields: { MODE: mode },
  values: { BOOL: cond }, statements: { DO: body },
});
const repeatN = (n, body) => ({ type: 'controls_repeat_ext', values: { TIMES: num(n) }, statements: { DO: body } });

// ── 조건 노드 + (미측정 센서면) 측정 블록 prepend ──
function buildCond(info, ctx) {
  const prepend = [];
  if (info.sensor && !ctx.measured.has(info.varName)) {
    prepend.push(info.sensor === 'distance' ? distanceTo(info.varName) : magneticTo(info.varName));
    ctx.measured.add(info.varName); ctx.lastVar = info.varName; ctx.lastSensor = info.sensor;
  }
  return { prepend, condNode: compare(info.op, vget(info.varName), num(info.value)) };
}

const asArr = (node) => (Array.isArray(node) ? node : [node]);

// ════════════════════════════════════════════════════════════
// 문법 (재귀하강)
//   inlineStatement := repeat | conditional | while | action      ← 한 덩어리 텍스트 내부
//   program         := (clauseStatement)*                          ← 절 배열, else 는 다음 절 미리보기
// ════════════════════════════════════════════════════════════

// 한 덩어리 텍스트(절 또는 절의 일부)를 하나의 statement 로. {nodes, label}
function parseInline(text, ctx, depth = 0) {
  text = (text || '').trim();
  if (!text || depth > 8) return { nodes: [], label: null };

  // 1) 반복 (조건보다 먼저 — "3번..."의 3을 비교값으로 오인하지 않도록)
  const rep = matchRepeatHeader(text);
  if (rep && !rep.restEmpty) {
    const body = parseInline(rep.rest, ctx, depth + 1).nodes;
    return { nodes: [repeatN(rep.n, body)], label: `${rep.n}번 반복` };
  }

  // 2) 조건문
  const cm = text.match(COND_RE);
  if (cm) {
    const info = detectComparison(normCompare(cm[1]), ctx);
    if (info) {
      const { prepend, condNode } = buildCond(info, ctx);
      const body = parseInline(cm[2], ctx, depth + 1).nodes;
      return { nodes: [...prepend, ifThen(condNode, body)], label: `만약 ${info.varName} ${OP_KO[info.op]} ${info.value}` };
    }
  }

  // 3) while / until
  const wm = text.match(WHILE_RE);
  if (wm) {
    const info = detectComparison(normCompare(wm[1]), ctx);
    if (info) {
      const mode = wm[2] === '동안' ? 'WHILE' : 'UNTIL';
      const { prepend, condNode } = buildCond(info, ctx);
      const body = parseInline(wm[3], ctx, depth + 1).nodes;
      return { nodes: [...prepend, whileUntil(mode, condNode, body)], label: `${info.varName} ${OP_KO[info.op]} ${info.value} ${mode === 'WHILE' ? '동안' : '까지'} 반복` };
    }
  }

  // 4) 단순 동작 (기존 어휘 재사용)
  const a = matchAction(text, ctx);
  if (a) return { nodes: asArr(a.node), label: a.label };
  return { nodes: [], label: null, unmatched: text };
}

// 절 배열에서 i 번째를 하나의 statement 로 파싱. else 는 다음 절을 미리보기로 흡수.
// {nodes, consumed, label, unmatched}
function parseClauseAt(clauses, i, ctx) {
  const c = clauses[i];

  // 반복(인라인 동작 있음)
  const rep = matchRepeatHeader(c);
  if (rep && !rep.restEmpty) {
    const r = parseInline(c, ctx, 0);
    return { nodes: r.nodes, consumed: 1, label: r.label, unmatched: r.unmatched };
  }

  // 조건문 + else 미리보기
  const cm = c.match(COND_RE);
  if (cm) {
    const info = detectComparison(normCompare(cm[1]), ctx);
    if (info) {
      const { prepend, condNode } = buildCond(info, ctx);
      const thenNodes = parseInline(cm[2], ctx, 1).nodes;
      if (i + 1 < clauses.length && isElse(clauses[i + 1])) {
        const elseText = clauses[i + 1].replace(ELSE_RE, '').trim();
        const elseNodes = parseInline(elseText, ctx, 1).nodes;
        return {
          nodes: [...prepend, ifElse(condNode, thenNodes, elseNodes)], consumed: 2,
          label: `만약 ${info.varName} ${OP_KO[info.op]} ${info.value} / 아니면`,
        };
      }
      return { nodes: [...prepend, ifThen(condNode, thenNodes)], consumed: 1, label: `만약 ${info.varName} ${OP_KO[info.op]} ${info.value}` };
    }
  }

  // 그 외(while/action/빈-반복)는 인라인 파서로
  const r = parseInline(c, ctx, 0);
  return { nodes: r.nodes, consumed: 1, label: r.label, unmatched: r.unmatched };
}

function parseProgram(clauses, ctx) {
  const descs = [], added = [], unmatched = [];
  let i = 0;
  while (i < clauses.length) {
    // "N번 반복" 만 있고 동작은 다음 절에 있는 경우 → 다음 statement 를 body 로 감싼다
    const rep = matchRepeatHeader(clauses[i]);
    if (rep && rep.restEmpty) {
      i += 1;
      let body = [];
      if (i < clauses.length) {
        const r = parseClauseAt(clauses, i, ctx);
        body = r.nodes; i += r.consumed;
        if (!r.nodes.length && r.unmatched) unmatched.push(r.unmatched);
      }
      descs.push(repeatN(rep.n, body));
      added.push(`${rep.n}번 반복`);
      continue;
    }
    const r = parseClauseAt(clauses, i, ctx);
    if (r.nodes.length) { r.nodes.forEach((n) => descs.push(n)); added.push(r.label || '동작'); }
    else if (r.unmatched) unmatched.push(r.unmatched);
    i += r.consumed;
  }
  return { descs, added, unmatched };
}

// ════════════════════════════════════════════════════════════
// XML 직렬화 (ai_helper.js serializeBlock 동일 + mutation 지원)
// ════════════════════════════════════════════════════════════
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function makeSerializer() {
  const VARS = new Map();
  const varId = (name) => {
    if (!VARS.has(name)) VARS.set(name, 'v' + (VARS.size + 1));
    return VARS.get(name);
  };
  function block(desc) {
    let inner = '';
    if (desc.mutation) {
      const attrs = Object.entries(desc.mutation).map(([k, v]) => `${k}="${v}"`).join(' ');
      inner += `<mutation ${attrs}></mutation>`; // mutation 은 다른 자식보다 먼저
    }
    for (const [name, val] of Object.entries(desc.fields || {})) {
      if (val && typeof val === 'object' && val.var !== undefined) {
        inner += `<field name="${name}" id="${varId(val.var)}">${esc(val.var)}</field>`;
      } else {
        inner += `<field name="${name}">${esc(val)}</field>`;
      }
    }
    for (const [name, child] of Object.entries(desc.values || {})) {
      inner += `<value name="${name}">${block(child)}</value>`;
    }
    for (const [name, arr] of Object.entries(desc.statements || {})) {
      inner += `<statement name="${name}">${chain(arr)}</statement>`;
    }
    if (desc.next) inner += `<next>${block(desc.next)}</next>`;
    return `<block type="${desc.type}">${inner}</block>`;
  }
  function chain(descs) {
    if (!descs || !descs.length) return '';
    const copy = descs.map((d) => ({ ...d }));
    for (let i = copy.length - 2; i >= 0; i--) copy[i].next = copy[i + 1];
    return block(copy[0]);
  }
  function wrap(descs) {
    const body = chain(descs);
    let vx = '';
    if (VARS.size) {
      vx = '<variables>' + [...VARS].map(([n, id]) => `<variable id="${id}">${esc(n)}</variable>`).join('') + '</variables>';
    }
    const withXY = body.replace('<block ', '<block x="40" y="40" ');
    return `<xml xmlns="https://developers.google.com/blockly/xml">${vx}${withXY}</xml>`;
  }
  return { wrap };
}

// ── 화이트리스트 검증 (ai_helper 와 동일 정책) ──
function collectTypes(desc, out) {
  if (Array.isArray(desc)) { desc.forEach((d) => collectTypes(d, out)); return; }
  out.add(desc.type);
  Object.values(desc.values || {}).forEach((v) => collectTypes(v, out));
  Object.values(desc.statements || {}).forEach((a) => collectTypes(a, out));
  if (desc.next) collectTypes(desc.next, out);
}

// ════════════════════════════════════════════════════════════
// 공개 API — ai_helper.parse 와 동일한 반환 모양
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
  const { descs, added, unmatched } = parseProgram(clauses, ctx);

  if (!descs.length) {
    return { ok: false, error: '완성된 코드를 만들기 어려워요.', unmatched, added: [], suggest: [] };
  }

  const types = new Set();
  collectTypes(descs, types);
  for (const t of types) {
    if (!KNOWN_TYPES.has(t)) return { ok: false, error: `내부 오류: 알 수 없는 블록(${t})`, unmatched, added: [], suggest: [] };
  }

  const xml = makeSerializer().wrap(descs);
  return { ok: true, replace, xml, added, unmatched, suggest: [] };
}

export const _grammar = { parseInline, parseClauseAt, parseProgram, matchRepeatHeader };
