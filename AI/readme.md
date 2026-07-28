# AI — Gemini 프록시 백엔드

ARES 블록코딩 웹 UI의 **🤖 AI 도움** 패널을 위한 서버.
학생이 스스로 코드를 짜도록 질문·힌트로 유도하는 **대화형 튜터**를, Google Gemini 로 구동한다.

정적 사이트(GitHub Pages)에는 API 키를 둘 수 없으므로, 이 작은 프록시가
`GEMINI_API_KEY` 를 서버에만 보관하고 Gemini 호출을 대신한다.

```
[Web/ai_chat.js]  --POST /api/chat-->  [AI/server.py]  --key + system prompt-->  [Gemini API]
```

## 구성 파일

| 파일 | 역할 |
|------|------|
| `server.py` | FastAPI 프록시. `/api/chat` 엔드포인트 + 튜터 시스템 프롬프트 |
| `requirements.txt` | 파이썬 의존성 |
| `.env.example` | 환경변수 템플릿 (`.env` 로 복사, 커밋 금지) |
| `ai.py` | (참고) 예전 EXAONE 로컬 LLM 스크립트 — 웹과 연결 안 됨 |

## 로컬 실행

```bash
cd AI
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 키 설정 (Windows PowerShell: $env:GEMINI_API_KEY="...")
export GEMINI_API_KEY=여기에_발급받은_키

uvicorn server:app --host 0.0.0.0 --port 8787
```

키는 [Google AI Studio](https://aistudio.google.com/apikey) 에서 무료로 발급.

동작 확인:
```bash
curl http://localhost:8787/health
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"앞으로 가려면 어떤 블록을 써?"}]}'
```

## 웹과 연결

웹은 기본적으로 `http://localhost:8787` 을 바라본다(`Web/constants.js` 의 `AI_CONFIG`).
다른 주소로 바꾸려면 코드 수정 없이 브라우저 콘솔에서:

```js
localStorage.setItem('ares-ai-proxy-url', 'https://내-프록시-주소');
```

## 클라우드 배포 (Render 예시)

1. 이 저장소를 연결하고 **Root Directory** 를 `AI` 로 지정.
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. Environment 에 `GEMINI_API_KEY`, 그리고 배포된 웹 주소로 `ALLOWED_ORIGINS`
   (예: `https://dknife.github.io`) 를 등록.
5. 배포된 URL 을 웹의 `ares-ai-proxy-url` 로 지정(위 참고).

> Railway / Fly.io / Cloud Run 도 동일하게 `uvicorn server:app` 로 실행하면 된다.

## 보안 메모

- `.env` 와 실제 키는 **절대 커밋하지 않는다**(`.gitignore` 처리됨).
- `ALLOWED_ORIGINS` 를 배포된 웹 주소로 좁혀 두면 다른 사이트가 프록시를 도용하기 어렵다.
- 시스템 프롬프트는 서버에서 주입하므로 클라이언트가 튜터 성격을 바꿀 수 없다.
