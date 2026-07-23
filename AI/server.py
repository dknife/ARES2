# server.py
# ARES 블록코딩 도우미 — Google Gemini 프록시 백엔드 (FastAPI)
#
# 역할:
#   · 웹 UI(Web/ai_chat.js)에서 온 대화 메시지를 받아 Gemini API 로 중계한다.
#   · GEMINI_API_KEY 를 서버에만 두어, 정적 사이트(GitHub Pages) 소스에 키가 노출되지 않게 한다.
#   · 시스템 프롬프트(튜터 persona)를 서버에서 강제 주입 → 클라이언트가 성격을 바꿀 수 없다.
#
# 설계 의도(중요):
#   이 도우미는 "정답 블록을 대신 만들어 주지 않는다". 초등학생이 스스로 코드를 짜도록
#   질문·힌트로 유도(소크라테스식)하는 튜터다. (기존 규칙 기반 자동 블록 생성과 다름)
#
# 실행:
#   pip install -r requirements.txt
#   set GEMINI_API_KEY=...        (Windows PowerShell: $env:GEMINI_API_KEY="...")
#   uvicorn server:app --host 0.0.0.0 --port 8787
#
# 환경변수:
#   GEMINI_API_KEY   (필수) Google AI Studio 발급 키
#   GEMINI_MODEL     (선택) 기본 gemini-2.5-flash
#   ALLOWED_ORIGINS  (선택) CORS 허용 오리진, 콤마 구분. 기본은 로컬+github.io 예시.
#                    예: https://dknife.github.io,http://localhost:8000

import os
from typing import List, Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# .env 파일이 있으면 환경변수로 로드(로컬 개발 편의). 없으면 조용히 넘어간다.
# load_dotenv 는 이미 설정된 OS 환경변수를 덮어쓰지 않으므로, 클라우드 환경변수와도 안전.
# 키는 절대 소스에 하드코딩하지 말고 .env(=gitignore됨) 또는 호스팅 환경변수로 둔다.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

# ── 설정 ──────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest").strip()
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)

# CORS: 배포된 웹 오리진만 명시 허용(안전). 콤마로 여러 개.
_DEFAULT_ORIGINS = "https://dknife.github.io"
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()
]
# 로컬 개발 편의: localhost/127.0.0.1 의 어떤 포트든(8000, 5500 Live Server 등) 허용.
# 정규식이라 포트를 매번 맞출 필요가 없다. (운영 배포에선 위 명시 목록만 쓰면 됨)
ALLOWED_ORIGIN_REGEX = os.environ.get(
    "ALLOWED_ORIGIN_REGEX", r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
)

# 대화 폭주 방지 가드
MAX_MESSAGES = 24          # 최근 N턴만 모델에 전달
MAX_CHARS_PER_MSG = 1000   # 메시지당 최대 글자
MAX_OUTPUT_TOKENS = 800

# ── 튜터 persona (서버 강제 주입) ─────────────────────────────────────────────
SYSTEM_PROMPT = """\
너는 초등학생이 블록코딩으로 로봇(ARES 화성 탐사 로버)을 움직이도록 도와주는 다정한 코딩 선생님이야.
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
"""


# ── 요청/응답 스키마 ──────────────────────────────────────────────────────────
class Message(BaseModel):
    role: Literal["user", "bot", "model", "assistant"]
    content: str = Field(..., max_length=MAX_CHARS_PER_MSG)


class ChatRequest(BaseModel):
    messages: List[Message]


class ChatResponse(BaseModel):
    reply: str


# ── 앱 ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="ARES Gemini Proxy", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health():
    return {"ok": True, "model": GEMINI_MODEL, "key_set": bool(GEMINI_API_KEY)}


def _to_gemini_contents(messages: List[Message]):
    """웹 메시지(user/bot) → Gemini contents(user/model) 로 변환."""
    contents = []
    for m in messages[-MAX_MESSAGES:]:
        role = "user" if m.role == "user" else "model"
        text = (m.content or "").strip()[:MAX_CHARS_PER_MSG]
        if not text:
            continue
        contents.append({"role": role, "parts": [{"text": text}]})
    return contents


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="서버에 GEMINI_API_KEY 가 설정되지 않았어요.")

    contents = _to_gemini_contents(req.messages)
    if not contents:
        raise HTTPException(status_code=400, detail="보낼 메시지가 없어요.")

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "topP": 0.95,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                GEMINI_URL,
                params={"key": GEMINI_API_KEY},
                json=payload,
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Gemini 서버에 연결하지 못했어요: {e}")

    if resp.status_code != 200:
        # Gemini 오류 메시지는 내부용 로그로만, 사용자에겐 간단히.
        detail = "AI 응답을 받지 못했어요."
        try:
            err = resp.json().get("error", {}).get("message")
            if err:
                detail = f"AI 오류: {err}"
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=detail)

    data = resp.json()
    reply = _extract_text(data)
    if not reply:
        raise HTTPException(status_code=502, detail="AI가 빈 답을 보냈어요. 다시 물어봐 줄래?")
    return ChatResponse(reply=reply)


def _extract_text(data: dict) -> str:
    """Gemini generateContent 응답에서 텍스트만 뽑는다."""
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts).strip()
    except (KeyError, IndexError, TypeError):
        return ""


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8787")))
