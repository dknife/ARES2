// ai_chat.js
// 대화형 AI 튜터 클라이언트 — Gemini 프록시 백엔드(AI/server.py)와 주고받는다.
//
// 기존 ai_helper.js(규칙 기반 자동 블록 생성)와 달리, 이 모듈은 "정답 블록을
// 대신 만들지 않고" 학생이 스스로 코드를 짜도록 유도하는 대화형 Q&A 를 담당한다.
// 블록 삽입/워크스페이스 조작은 하지 않는다 — 순수하게 대화 왕복만 처리한다.
//
// API:
//   const chat = new AiChat();
//   const reply = await chat.send('앞으로 가고 싶어');   // 봇 답변(문자열)
//   chat.reset();                                          // 대화 기록 비우기
//   chat.history                                           // [{role:'user'|'bot', content}]

import { AI_CONFIG } from './constants.js';

export class AiChat {
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl || AI_CONFIG.PROXY_BASE_URL || '').replace(/\/+$/, '');
    this.timeout = opts.timeout || AI_CONFIG.REQUEST_TIMEOUT || 30000;
    // 서버에 보낼 최근 대화. 서버 쪽에서도 길이를 자르지만 여기서도 가볍게 유지.
    this.history = [];
    this.maxHistory = opts.maxHistory || 20;
  }

  reset() {
    this.history = [];
  }

  // 사용자 메시지를 보내고 봇 답변 문자열을 돌려준다. 실패 시 Error 를 throw.
  async send(userText) {
    const text = (userText || '').trim();
    if (!text) throw new Error('메시지가 비어 있어요.');

    this.history.push({ role: 'user', content: text });
    this._trim();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let resp;
    try {
      resp = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.history }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      // 사용자가 보낸 메시지는 남겨두되(재시도 대비), 네트워크 실패를 알린다.
      if (err.name === 'AbortError') throw new Error('AI 응답이 너무 오래 걸려요. 잠시 후 다시 해볼까?');
      throw new Error('AI 서버에 연결하지 못했어요. 인터넷이나 서버 주소를 확인해줘.');
    }
    clearTimeout(timer);

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json())?.detail || ''; } catch (e) { /* 본문 없음 */ }
      throw new Error(detail || `AI 서버 오류(${resp.status})`);
    }

    let data;
    try { data = await resp.json(); } catch (e) { throw new Error('AI 응답을 읽지 못했어요.'); }
    const reply = (data && data.reply || '').trim();
    if (!reply) throw new Error('AI가 빈 답을 보냈어요. 다시 물어봐 줄래?');

    this.history.push({ role: 'bot', content: reply });
    this._trim();
    return reply;
  }

  _trim() {
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }
}
