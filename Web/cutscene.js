// ============================================================
// cutscene.js — 차시 미션 컷씬
// ============================================================
// 각 차시(1~12)를 열어 미션 목록을 확인하기 직전, 그 차시 전용 배경
// (assets/background/Lec0N.png)을 전체 화면 컷씬으로 보여준다.
// 컷씬에는 "미션 선택" 메뉴 버튼이 있으며, 누르면 컷씬이 사라지고
// 호출부(main.js)가 해당 차시의 미션을 이어서 노출한다.
//
// 사용법:
//   import { showCutscene } from './cutscene.js';
//   await showCutscene(3, { title: 'LED 2개로 표정 만들기', tag: 'WINK' });
//   // ↑ "미션 선택" 클릭(또는 ESC) 시 Promise 가 resolve 된다.
//
// 배경 이미지는 평범한 CSS background-image 로만 로드하므로 file:// 오프라인
// 빌드에서도 별도 인라인 없이 그대로 표시된다(WebGL 텍스처가 아니라 CORS 무관).

const BG_DIR = 'assets/background';
const STYLE_ID = 'lesson-cutscene-styles';
const FADE_MS = 320;

let activeOverlay = null; // 동시에 하나만 — 새 컷씬 요청 시 이전 것은 즉시 정리
let scrollLock = null;    // 컷씬 표시 중 스크롤을 멈추기 위해 잠근 요소들의 원래 overflow

// ── 스크롤 잠금 ─────────────────────────────────────────────
// 컷씬이 떠 있는 동안 배경 스크롤을 멈춘다. window(html/body)와, 현재 보이는
// 스크롤 컨테이너(#overviewView·#lessonView 등 .content-view)를 함께 잠근다.
// idempotent — 컷씬이 교체될 때 이미 잠겨 있으면 그대로 유지된다.
function lockScroll() {
  if (scrollLock) return;
  const els = [document.documentElement, document.body];
  document.querySelectorAll('.content-view:not([hidden])').forEach((v) => els.push(v));
  scrollLock = els.map((el) => ({ el, overflow: el.style.overflow }));
  scrollLock.forEach(({ el }) => { el.style.overflow = 'hidden'; });
}
function unlockScroll() {
  if (!scrollLock) return;
  scrollLock.forEach(({ el, overflow }) => { el.style.overflow = overflow; });
  scrollLock = null;
}

// ── 스타일은 최초 1회만 주입(모듈 자체가 UI 전담) ─────────────────
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
/* 전체 화면이 아니라 상단 제목 바 아래 ~ 하단 내비 위 콘텐츠 영역에만 렌더한다.
   top/bottom 은 JS(place)가 실제 헤더·하단 내비 위치를 재어 인라인으로 지정. */
.lesson-cutscene {
  position: fixed; left: 0; right: 0; top: 0; bottom: 0; z-index: 9000;
  display: flex; flex-direction: column; justify-content: flex-end;
  overflow: hidden; background: #05030a;
  opacity: 0; transition: opacity ${FADE_MS}ms ease;
  /* 컷씬 위에서의 스크롤/줌 제스처 차단 + 스크롤 체이닝 방지 */
  touch-action: none; overscroll-behavior: contain;
}
.lesson-cutscene.is-visible { opacity: 1; }
/* 배경 이미지 레이어 — 로드 완료 시 서서히 등장 + 느린 줌인 */
.lesson-cutscene-bg {
  position: absolute; inset: 0;
  background-size: cover; background-position: center; background-repeat: no-repeat;
  opacity: 0; transform: scale(1.06);
  transition: opacity 600ms ease, transform 8s ease-out;
}
.lesson-cutscene-bg.is-loaded { opacity: 1; transform: scale(1); }
/* 하단 가독성 그라데이션 */
.lesson-cutscene::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(to top,
    rgba(3,3,12,0.86) 0%, rgba(3,3,12,0.55) 26%,
    rgba(3,3,12,0.10) 52%, rgba(3,3,12,0.28) 100%);
}
.lesson-cutscene-panel {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; text-align: center;
  padding: 0 24px clamp(40px, 9vh, 92px);
  max-width: 760px; margin: 0 auto; width: 100%;
}
.lesson-cutscene-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'GangwonEduTeun','Inter Tight',sans-serif;
  font-size: 0.95rem; font-weight: 800; letter-spacing: 1px;
  color: #FFB27A; text-shadow: 0 2px 10px rgba(0,0,0,0.8);
}
.lesson-cutscene-eyebrow .lc-tag {
  padding: 2px 10px; border-radius: 999px; font-size: 0.78rem;
  background: rgba(255,106,0,0.9); color: #fff; letter-spacing: 0.5px;
}
.lesson-cutscene-title {
  margin: 0;
  font-family: 'GangwonEduTeun','Inter Tight',sans-serif;
  font-size: clamp(1.6rem, 5.2vw, 2.6rem); font-weight: 800; line-height: 1.2;
  color: #fff; text-shadow: 0 3px 22px rgba(0,0,0,0.85);
}
.lesson-cutscene-hint {
  margin: 2px 0 6px; font-size: 0.85rem; font-weight: 600; line-height: 1.5;
  color: #e3e9f6; text-shadow: 0 2px 12px rgba(0,0,0,0.85);
}
.lesson-cutscene-btn {
  font-family: 'GangwonEduTeun','Inter Tight',sans-serif;
  font-size: 1.1rem; font-weight: 800;
  display: inline-flex; align-items: center; gap: 10px;
  min-height: 54px; padding: 0 46px; margin-top: 6px;
  border: none; border-radius: 16px; cursor: pointer;
  background: #FF6A00; color: #fff;
  box-shadow: 0 10px 28px rgba(0,0,0,0.42);
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}
.lesson-cutscene-btn:hover { background: #ff7f22; transform: translateY(-2px); box-shadow: 0 14px 34px rgba(0,0,0,0.5); }
.lesson-cutscene-btn:active { transform: translateY(0); }
.lesson-cutscene-btn:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
.lesson-cutscene-btn .lc-arrow { font-size: 1.15em; }
@media (max-width: 480px) {
  .lesson-cutscene-panel { padding-bottom: 34px; gap: 11px; }
  .lesson-cutscene-btn { width: min(100%, 320px); justify-content: center; }
}
@media (prefers-reduced-motion: reduce) {
  .lesson-cutscene, .lesson-cutscene-bg { transition: opacity 120ms linear; }
  .lesson-cutscene-bg { transform: none; }
}`;
  document.head.appendChild(style);
}

/**
 * 차시 컷씬을 전체 화면으로 띄우고, "미션 선택" 클릭(또는 ESC) 시 resolve.
 * @param {number} lessonNumber 1~12 차시 번호 (배경 파일 Lec0N.png 결정)
 * @param {{title?: string, tag?: string, hint?: string}} [opts]
 * @returns {Promise<void>}
 */
export function showCutscene(lessonNumber, opts = {}) {
  injectStyles();

  // 이전 컷씬이 남아 있으면 즉시 제거(중복 방지) — 리스너도 함께 정리
  if (activeOverlay) {
    if (activeOverlay._onKey) document.removeEventListener('keydown', activeOverlay._onKey);
    if (activeOverlay._place) {
      window.removeEventListener('resize', activeOverlay._place);
      window.removeEventListener('orientationchange', activeOverlay._place);
    }
    activeOverlay.remove();
    activeOverlay = null;
  }

  const padded = String(lessonNumber).padStart(2, '0');
  const { title = '', tag = '', hint = '준비가 되면 미션을 골라 시작해요!' } = opts;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'lesson-cutscene';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `${lessonNumber}차시 컷씬`);

    const bg = document.createElement('div');
    bg.className = 'lesson-cutscene-bg';

    const panel = document.createElement('div');
    panel.className = 'lesson-cutscene-panel';
    panel.innerHTML = `
      <span class="lesson-cutscene-eyebrow">
        <span>${lessonNumber}차시</span>
        ${tag ? `<span class="lc-tag">${escapeHtml(tag)}</span>` : ''}
      </span>
      ${title ? `<h2 class="lesson-cutscene-title">${escapeHtml(title)}</h2>` : ''}
      <p class="lesson-cutscene-hint">${escapeHtml(hint)}</p>
      <button type="button" class="lesson-cutscene-btn">
        <span class="lc-arrow" aria-hidden="true">▶</span>미션 선택
      </button>`;

    overlay.appendChild(bg);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    // 컷씬을 "상단 제목 바 아래 ~ 하단 내비 위" 영역에만 맞춘다.
    // 헤더/하단 내비의 실제 위치를 재어 fixed 오버레이의 top/bottom 을 지정.
    const place = () => {
      const header = document.querySelector('.header');
      const bottomNav = document.getElementById('mobileBottomNav');
      const vh = window.innerHeight;
      const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
      let bottomGap = 0; // 뷰포트 하단에서 컷씬 하단까지의 여백(= 하단 내비 높이)
      // 하단 내비는 position:fixed 라 offsetParent 로 판정하면 안 된다(항상 null).
      // 표시 여부는 computed display 로, 높이는 rect 로 잰다.
      if (bottomNav) {
        const cs = getComputedStyle(bottomNav);
        if (cs.display !== 'none' && cs.visibility !== 'hidden') {
          const nr = bottomNav.getBoundingClientRect();
          if (nr.height > 0 && nr.top < vh) bottomGap = Math.max(0, vh - nr.top);
        }
      }
      overlay.style.top = `${top}px`;
      overlay.style.bottom = `${bottomGap}px`;
    };
    place();
    overlay._place = place;
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);

    // 컷씬이 렌더링되는 동안 배경 스크롤 정지
    lockScroll();

    // 배경 이미지 프리로드 → 로드되면 부드럽게 등장(실패해도 버튼은 항상 노출)
    const src = `${BG_DIR}/Lec${padded}.png`;
    const img = new Image();
    const reveal = () => {
      bg.style.backgroundImage = `url('${src}')`;
      requestAnimationFrame(() => bg.classList.add('is-loaded'));
    };
    img.onload = reveal;
    img.onerror = reveal; // 배경이 없어도 컷씬 흐름은 유지
    img.src = src;

    // 한 프레임 뒤 페이드 인
    requestAnimationFrame(() => overlay.classList.add('is-visible'));

    let done = false;
    const dismiss = () => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('orientationchange', place);
      unlockScroll(); // 배경 스크롤 복원
      overlay.classList.remove('is-visible');
      const cleanup = () => {
        overlay.remove();
        if (activeOverlay === overlay) activeOverlay = null;
        resolve();
      };
      overlay.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, FADE_MS + 80); // transitionend 누락 대비 안전망
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    overlay._onKey = onKey;
    document.addEventListener('keydown', onKey);

    const btn = panel.querySelector('.lesson-cutscene-btn');
    btn.addEventListener('click', dismiss);
    // 접근성: 컷씬이 뜨면 "미션 선택" 버튼에 포커스
    requestAnimationFrame(() => btn.focus({ preventScroll: true }));
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
