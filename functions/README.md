# `functions/` — Cloudflare Pages 서버리스 함수 (AI 튜터 프록시)

이 폴더는 **Cloudflare Pages Functions** 코드다. 웹 UI의 **🤖 AI 도움(대화형 튜터)** 이
쓰는 **Gemini 프록시 백엔드**를 담는다.

> 한 줄 요약: 정적 사이트(브라우저) 코드에 Google Gemini API 키를 둘 수 없으므로,
> 이 작은 서버 함수가 키를 서버에만 숨긴 채 Gemini 호출을 **대신**해 준다.

---

## 왜 프록시가 필요한가

AI(Google Gemini)를 쓰려면 API 키가 필요한데, 키를 프론트엔드(브라우저) 코드에 넣으면
누구나 개발자도구로 열어서 훔쳐 쓸 수 있다(요금 도용 위험). 그래서 중간에 **프록시 서버**를 둔다.

```
[Web/ai_chat.js]  --POST /api/chat-->  [functions/api/chat.js]  --키 + 시스템 프롬프트-->  [Gemini API]
      (브라우저)                              (Cloudflare, 키 보관)                          (구글)
```

브라우저는 이 함수한테만 부탁하고, **실제 키를 아는 건 이 함수뿐**이다.

---

## 파일

| 파일 | 엔드포인트 | 역할 |
|------|-----------|------|
| `api/chat.js` | `POST /api/chat` | 대화형 튜터. 여러 턴 대화를 받아 Gemini 답변을 돌려준다 |

> Cloudflare Pages 규칙: `functions/` 아래의 **파일 경로가 그대로 URL**이 된다.
> `functions/api/chat.js` → `/api/chat`

### 요청/응답 규격 (`api/chat.js`)

```jsonc
// 요청 (POST /api/chat)
{ "messages": [ { "role": "user", "content": "앞으로 가고 싶어" }, ... ] }
//   role 은 'user'(아이) / 'bot'(튜터). 최근 24턴까지, 메시지당 1000자까지.

// 응답
{ "reply": "앞으로 가려면 어떤 블록이 필요할까? 한번 찾아볼까? 😊" }

// 오류 시
{ "detail": "사람이 읽을 수 있는 오류 메시지" }   // + HTTP 4xx/5xx
```

- 튜터는 **정답 블록을 대신 만들지 않고** 질문·힌트로 유도한다(소크라테스식). 이 성격은
  함수 안 `SYSTEM_PROMPT`에 서버에서 강제 주입되므로 클라이언트가 바꿀 수 없다.
- 남용 방지: 기기(IP)당 1분 20회 제한 내장.
- 다른 도메인(GitHub Pages 등)에서 호출하므로 **CORS 허용 + OPTIONS 프리플라이트**를 처리한다.

---

## ⚠️ 중요: 이 폴더는 언제 "실제로" 동작하나

**ARES2 웹은 현재 GitHub Pages(`deploy-pages.yml`)로 배포된다. GitHub Pages 는
Cloudflare Functions 를 실행하지 않는다.** 즉 이 폴더는 GitHub Pages 배포에서는 **동작하지 않는다.**

그럼 지금 AI 튜터는 어떻게 도나?
→ **별도로 Cloudflare Pages 에 배포된 프록시**(`https://ares2-ai.pages.dev`)를 호출한다.
   웹이 바라보는 주소는 `Web/constants.js` 의 `AI_CONFIG.PROXY_BASE_URL` 에 있다.

```
현재 구조 (방향 A — 별도 배포 재활용):
  ARES2 웹(GitHub Pages)  ──POST──▶  https://ares2-ai.pages.dev/api/chat
                                     (ares2ai_cloudflare 프로젝트에 있는 같은 chat.js)
```

이 `functions/` 폴더는 **그 프록시와 동일한 소스를 이 저장소에도 버전관리용으로 보관**하는 것이다.
목적:
1. 프록시 코드가 메인 저장소에서 함께 관리·리뷰되도록.
2. 나중에 **ARES2 자체를 Cloudflare Pages 로 배포(방향 B)** 하면, 이 폴더가 그대로
   `같은 도메인/api/chat` 으로 살아나 **CORS 없이** 동작한다.

---

## 사용법

### A) 지금처럼 별도 배포를 쓰는 경우 (기본)
이 폴더는 건드릴 필요 없다. 프록시 로직을 고쳤다면, 실제 서비스되는 배포
(`ares2ai_cloudflare` 프로젝트)의 `functions/api/chat.js` 도 함께 맞추고 재배포해야 한다.
두 사본을 동일하게 유지할 것.

### B) ARES2 자체를 Cloudflare Pages 로 배포하는 경우
이 폴더가 곧바로 `/api/chat` 으로 동작한다.

```bash
# 1) 로그인
npx wrangler login

# 2) 저장소 루트에서 배포 (functions/ 가 자동 인식됨)
npx wrangler pages deploy . --project-name <프로젝트명>

# 3) 키를 Secret 으로 등록 (코드엔 절대 넣지 않는다)
npx wrangler pages secret put GEMINI_API_KEY --project-name <프로젝트명>

# 4) 웹이 같은 도메인을 보도록 constants.js 의 PROXY_BASE_URL 을
#    배포 도메인(또는 상대경로)으로 맞춘다
```

> Cloudflare 대시보드 > Pages > 프로젝트 > Settings > Variables and Secrets 에서
> 환경변수를 넣어도 된다.

### 로컬에서 함수까지 실행해 테스트
정적 서버(`python -m http.server`)로는 `/api/chat` 이 **404** 다(함수를 안 돌림).
함수까지 돌리려면:

```bash
# 프로젝트 루트에 .dev.vars 파일 생성 (로컬 전용, 커밋 금지):
#   GEMINI_API_KEY=발급받은_키
npx wrangler pages dev .
```

동작 확인:
```bash
curl -X POST http://localhost:8788/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"앞으로 가려면 어떤 블록을 써?"}]}'
```

---

## 환경변수

| 이름 | 필수 | 설명 |
|------|:---:|------|
| `GEMINI_API_KEY` | ✅ | Google AI Studio 발급 키. **Secret 으로 저장**, 코드/화면 노출 금지 |
| `GEMINI_MODEL` | ⬜ | 사용할 모델. 기본 `gemini-flash-latest` |

키는 [Google AI Studio](https://aistudio.google.com/apikey) 에서 발급한다.

---

## 참고: 예전 로컬 파이썬 프록시

이 함수는 예전에 `AI/server.py`(FastAPI) 가 하던 일을 **서버리스로 옮긴 것**이다.
`server.py` 는 로컬 서버를 직접 켜야 했지만(항상 켜둘 곳 필요), 이 함수는 Cloudflare 가
요청이 올 때만 실행한다(항상 켜져 있고 관리 불필요). `server.py` 계열은 정리되었고,
로컬 개발이 꼭 필요하면 위 "로컬에서 함수까지 실행" 방식을 쓰면 된다.
