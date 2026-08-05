// Cloudflare Pages Function — POST /api/chat
// ARES2 웹(Web/ai_chat.js) 대화형 튜터용. 기존 로컬 파이썬 프록시(AI/server.py)를
// 그대로 서버리스로 옮긴 것. 요청/응답 규격을 server.py 와 동일하게 맞췄다.
//
//   요청:  { messages: [ {role:'user'|'bot', content:'...'}, ... ] }
//   응답:  { reply: '...' }            (오류 시 { detail: '...' } + 상태코드)
//
// 키는 대시보드 환경변수 GEMINI_API_KEY(시크릿)에만 저장. 코드·화면에 노출 금지.
// ai_chat.js 가 다른 도메인(github.io 등)에서 호출하므로 CORS 를 허용한다.

// ── 튜터 persona (server.py 의 SYSTEM_PROMPT 와 동일) ──
const SYSTEM_PROMPT = `너는 초등학생이 블록코딩으로 로봇(ARES 화성 탐사 로버)을 움직이도록 도와주는 다정한 코딩 선생님이야.
아이들은 파이썬 같은 코드를 직접 쓰지 않고, 구글 Blockly 블록만 끌어다 붙여서 로봇을 조작해.

가장 중요한 규칙:
1) 정답을 대신 만들어 주지 마. 완성된 블록 배치나 전체 정답을 그냥 알려주지 말고,
   아이가 스스로 생각해서 블록을 고르고 순서를 정하도록 "질문과 힌트"로 유도해.
   (예: "앞으로 가려면 어떤 블록이 필요할까?", "몇 초 동안 갈지 정해볼까?")
2) 한 번에 하나씩, 작은 단계로 안내해. 아이가 한 걸음 해내면 칭찬하고 다음 힌트를 줘.
3) 초등학생 눈높이로 짧고 쉽게, 존댓말 대신 다정한 반말로. 어려운 용어는 풀어서 설명해.
4) 로봇/블록코딩과 관련 없는 질문에는 부드럽게 다시 코딩 주제로 데려와.
5) 답변은 3~4문장 이내로 짧게. 이모지를 가끔 써서 친근하게.

아이가 쓸 수 있는 블록들(참고용, 이 목록 밖의 기능은 없다고 알려줘):
[로봇 조작]
- 램프 세팅 / LED 켜기·끄기: 여러 개의 불(LED)을 켜고 끌 수 있어. (눈=LED, 가슴=LED)
- 메시지 보내기: 로봇 화면에 글자를 보여줘.
- 장치 상태 확인: 로봇과 잘 연결됐는지 확인해.
- 거리 측정: 거리 센서로 앞에 뭐가 얼마나 가까운지 재.
- 자기 측정: 자기(자석) 센서로 값을 재.
- 부저 울리기: 특정 소리(도레미)나 헤르츠를 원하는 시간만큼 울려.
- 앞·뒤·왼쪽·오른쪽 이동: 방향마다 이동 블록이 있고, 몇 초 동안 움직이거나 계속 움직일 수 있어.
- 멈추기: 이동을 멈춰.
- 발사: 로켓/총을 발사해.
[제어문]
- 기다리기: 정한 시간만큼 잠깐 멈춰(딜레이).
- 반복: 안에 든 블록을 정한 횟수만큼 되풀이해.
- 조건(만약~이면): 조건이 맞을 때만 안쪽 블록을 실행해.
- 변수: 값을 담아 두고 이름으로 꺼내 써.
- 수학: 더하기·빼기 같은 간단한 계산과 크기 비교.

[화면 구성 — 아이가 보는 실제 화면이야. 이 이름 그대로 안내해]
- 화면 가운데: 블록을 끌어다 붙이는 "코딩 작업 공간".
- 왼쪽: 블록 서랍(카테고리) — 동작 / 출력 / 발사 / 감지 / 제어 / 변수 / 수학 / 함수.
  · LED·화면(글자 보여주기)·부저는 "출력" 안에 있어.
  · 거리·자기(자석) 센서는 "감지" 안에 있어.
  · 반복·조건(만약~이면)·기다리기는 "제어" 안에 있어.
  · 앞뒤좌우 이동·멈추기는 "동작" 안에, 로켓/총 발사는 "발사" 안에 있어.
- 위쪽 버튼: [🏠 개요] [▶️ 미션 전송](만든 블록을 로봇으로 보내 실행) [💾 미션 저장] [📂 미션 읽기] [🧩 블록코딩] [시뮬레이션] [🤖 AI 도움(=지금 이 대화창)].
- 미션 이동은 [← 이전 미션] [다음 미션 →], 로봇 연결은 "연결" 버튼.
- 블록을 만들려면 "왼쪽 서랍에서 해당 카테고리를 열고, 블록을 가운데 작업 공간으로 끌어다 놓으면 돼" 처럼 실제 조작을 알려줘.
- 참고: 이 대화 아래에 "[지금 화면 상황]"이 함께 오면, 그건 아이가 지금 보고 있는 실제 미션·작업공간이야. 반드시 그것에 맞춰 구체적으로 answer 해.`;

// 대화 폭주 방지 가드 (server.py 와 동일)
const MAX_MESSAGES = 24;         // 최근 N턴만 모델에 전달
const MAX_CHARS_PER_MSG = 1000;  // 메시지당 최대 글자
const MAX_OUTPUT_TOKENS = 800;

// 간단 사용량 제한: 기기(IP)당 1분 20회
const hits = new Map();
function rateOk(ip) {
  const now = Date.now();
  const q = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (q.length >= 20) { hits.set(ip, q); return false; }
  q.push(now); hits.set(ip, q); return true;
}

// CORS: 요청 오리진을 그대로 반영해 허용(자격증명 미사용이라 안전). 프리플라이트도 처리.
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// 웹 메시지(user/bot) → Gemini contents(user/model) 로 변환
function toGeminiContents(messages) {
  const contents = [];
  for (const m of messages.slice(-MAX_MESSAGES)) {
    const role = m && m.role === 'user' ? 'user' : 'model';
    const text = String((m && m.content) || '').trim().slice(0, MAX_CHARS_PER_MSG);
    if (!text) continue;
    contents.push({ role, parts: [{ text }] });
  }
  return contents;
}

// CORS 프리플라이트(OPTIONS) 응답
export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request);
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateOk(ip)) return j({ detail: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }, 429, cors);

    const key = env.GEMINI_API_KEY;
    if (!key) return j({ detail: '서버에 GEMINI_API_KEY 가 설정되지 않았어요.' }, 503, cors);

    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const contents = toGeminiContents(messages);
    if (!contents.length) return j({ detail: '보낼 메시지가 없어요.' }, 400, cors);

    // 프론트가 보낸 "지금 화면 상황"(현재 미션·작업공간 블록). 있으면 시스템 프롬프트에 덧붙인다.
    const context = typeof body.context === 'string' ? body.context.slice(0, 4000) : '';
    const sysText = context
      ? SYSTEM_PROMPT + '\n\n[지금 화면 상황 — 아이가 보고 있는 실제 상태야. 이걸 근거로 답해]\n' + context
      : SYSTEM_PROMPT;

    // 모델 고정: gemini-flash (일반 Flash, lite 보다 한 단계 위). 대시보드 GEMINI_MODEL
    // 변수(현재 lite)보다 이 코드값을 우선한다. 다시 env 로 제어하려면 env.GEMINI_MODEL 을 앞에 둘 것.
    const model = 'gemini-flash-latest';
    let resp;
    try {
      resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: sysText }] },
            contents,
            generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: MAX_OUTPUT_TOKENS },
          }) });
    } catch (e) {
      return j({ detail: 'Gemini 서버에 연결하지 못했어요.' }, 502, cors);
    }

    if (!resp.ok) {
      let detail = 'AI 응답을 받지 못했어요.';
      try { const err = (await resp.json())?.error?.message; if (err) detail = 'AI 오류: ' + err; } catch (e) { /* 무시 */ }
      return j({ detail }, 502, cors);
    }

    const data = await resp.json();
    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const reply = parts.map((p) => p.text || '').join('').trim();
    if (!reply) return j({ detail: 'AI가 빈 답을 보냈어요. 다시 물어봐 줄래?' }, 502, cors);
    return j({ reply }, 200, cors);
  } catch (e) {
    return j({ detail: 'AI 응답 실패' }, 502, cors);
  }
}

function j(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
