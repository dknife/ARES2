/* ARES 반응형 앱 셸 (모바일/태블릿 프레임)
 * ------------------------------------------------------------------
 * 이 프로젝트의 데스크톱 기본 인터페이스는 "태블릿(768px) 모바일 모드"이다.
 * 데스크톱(넓은 창)에서 접근하면 실제 페이지를 768px 폭(태블릿 기준) iframe
 * 안에 깨끗한 중앙 컬럼으로 렌더링해, 모바일/태블릿 인터페이스를 그대로
 * 보여준다. iframe 내부 뷰포트가 768px 이므로 페이지의
 * @media(max-width:768px) 규칙과 matchMedia 가 자연스럽게 발동한다.
 * (미디어쿼리는 컨테이너가 아니라 뷰포트 폭 기준이므로, 폭을 실제로 768로
 *  만들려면 iframe 프레임이 필요하다.)
 *
 *   (기본) 데스크톱             → 깨끗한 768 중앙 컬럼 프레임
 *   실제 모바일/태블릿(≤768)    → 프레임 없이 직접 렌더링
 *   ?mobile=true               → 기기 크기 선택 미리보기(개발용, 기본 태블릿 768)
 *   ?mobile=true&framed=1      → (미리보기)프레임 내부의 "진짜" 페이지
 *   ?framed=1                  → (기본)프레임 내부의 "진짜" 페이지
 *
 * (각 HTML 의 <head> 맨 앞에 이 스크립트를 넣어야, 페이지 자신의 부트스트랩
 *  보다 먼저 실행되어 백그라운드 이중 실행을 막을 수 있다.)
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var FRAMED = params.get('framed') === '1';
  var DEVICE_PREVIEW = params.get('mobile') === 'true';   // 개발용 기기 크기 미리보기

  // ── 프레임 내부(진짜 페이지) ────────────────────────────────────
  // 내부 링크(예: index → main)가 같은 프레임 안에서 계속 열리도록
  // 파라미터를 유지한다. 외부 링크·앵커·상위경로는 그대로 둔다.
  if (FRAMED) {
    var propagate = function () {
      var anchors = document.querySelectorAll('a[href]');
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        var href = a.getAttribute('href');
        if (!href || /^(https?:|mailto:|tel:|#|\.\.\/)/.test(href)) continue;
        try {
          var u = new URL(href, location.href);
          if (u.origin !== location.origin) continue;
          if (DEVICE_PREVIEW) u.searchParams.set('mobile', 'true');
          u.searchParams.set('framed', '1');
          a.setAttribute('href', u.pathname + u.search + u.hash);
        } catch (e) { /* 무시 */ }
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', propagate);
    } else {
      propagate();
    }
    return;
  }

  // ── 최상위 페이지 ────────────────────────────────────────────────
  // 실제 좁은 화면(태블릿/폰, ≤768)은 이미 모바일 레이아웃이므로 프레임 불필요.
  // 넓은 데스크톱 화면만 768 프레임으로 감싼다.
  var isNarrow = window.matchMedia('(max-width: 768px)').matches;
  if (!DEVICE_PREVIEW && isNarrow) return;

  // 이 페이지 자신의 부트스트랩(three.js, main.js, dashboard init 등)이 프레임
  // 뒤에서 중복 실행되지 않도록 표시한다. (각 페이지가 이 플래그를 보고 init 건너뜀)
  window.__ARES_MOBILE_FRAME__ = true;

  function innerSrc() {
    var u = new URL(location.href);
    u.searchParams.set('mobile', 'true');   // 프레임 내부는 항상 모바일 모드
    u.searchParams.set('framed', '1');
    return u.pathname + u.search + u.hash;
  }

  function boot(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  if (DEVICE_PREVIEW) {
    boot(buildDevicePreview);
  } else {
    boot(buildTabletColumn);
  }

  // ── 기본: 깨끗한 768 중앙 컬럼 ──────────────────────────────────
  function buildTabletColumn() {
    var style = document.createElement('style');
    style.textContent = [
      'html,body.ares-mp{margin:0;height:100%;}',
      'body.ares-mp{background:#e9ebef;display:flex;justify-content:center;',
      'align-items:stretch;overflow:hidden;}',
      'body.ares-mp>iframe{display:block;border:0;width:768px;max-width:100%;',
      'height:100vh;background:#fff;box-shadow:0 0 60px rgba(0,0,0,.18);}',
    ].join('');
    document.head.appendChild(style);

    document.body.className = 'ares-mp';
    document.body.innerHTML =
      '<iframe id="ares-mp-frame" title="ARES" src="' + innerSrc() + '"></iframe>';
  }

  // ── 개발용: 기기 크기 미리보기(?mobile=true) ───────────────────
  function buildDevicePreview() {
    // 프리셋 디바이스(논리 폭/높이, CSS px)
    var DEVICES = [
      { label: '📱 갤럭시 · 360', w: 360, h: 780 },
      { label: '📱 아이폰 · 390', w: 390, h: 844 },
      { label: '📱 큰폰 · 430',   w: 430, h: 932 },
      { label: '💻 태블릿 · 768', w: 768, h: 1024 },
    ];
    var DEFAULT_IDX = 3;   // 기본 태블릿 768(데스크톱 기준 해상도)

    function desktopHref() {
      var u = new URL(location.href);
      u.searchParams.delete('mobile');
      u.searchParams.delete('framed');
      var q = u.searchParams.toString();
      return u.pathname + (q ? '?' + q : '') + u.hash;
    }

    var style = document.createElement('style');
    style.textContent = [
      'body.ares-mp{margin:0;min-height:100vh;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;gap:14px;overflow:auto;',
      'background:#e9ebef;font-family:"Inter Tight",system-ui,sans-serif;padding:20px;box-sizing:border-box;}',
      '.ares-mp-bar{display:flex;align-items:center;gap:14px;font-size:14px;color:#444;flex-wrap:wrap;justify-content:center;}',
      '.ares-mp-bar strong{color:#222;font-weight:700;letter-spacing:.5px;}',
      '.ares-mp-bar .dot{color:#FA5D29;}',
      '.ares-mp-bar select{font:inherit;padding:6px 10px;border:1px solid #ccd;border-radius:8px;background:#fff;color:#333;cursor:pointer;}',
      '.ares-mp-bar a{color:#FA5D29;text-decoration:none;font-weight:600;}',
      '.ares-mp-bar a:hover{text-decoration:underline;}',
      '.ares-mp-device{background:#111;border-radius:38px;padding:12px;',
      'box-shadow:0 24px 70px rgba(0,0,0,.28);flex:0 0 auto;}',
      '.ares-mp-screen{background:#fff;border-radius:26px;overflow:hidden;}',
      '.ares-mp-screen iframe{display:block;border:0;width:100%;height:100%;background:#fff;}',
    ].join('');
    document.head.appendChild(style);

    document.body.className = 'ares-mp';
    document.body.innerHTML =
      '<div class="ares-mp-bar">' +
        '<strong>ARES<span class="dot">.</span> 모바일 미리보기</strong>' +
        '<label>기기 <select id="ares-mp-device"></select></label>' +
        '<a id="ares-mp-desktop" href="#">🖥️ 데스크톱으로</a>' +
      '</div>' +
      '<div class="ares-mp-device"><div class="ares-mp-screen">' +
        '<iframe id="ares-mp-frame" title="모바일 미리보기"></iframe>' +
      '</div></div>';

    var sel = document.getElementById('ares-mp-device');
    DEVICES.forEach(function (d, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = d.label;
      if (i === DEFAULT_IDX) o.selected = true;
      sel.appendChild(o);
    });

    var screen = document.querySelector('.ares-mp-screen');
    var frame = document.getElementById('ares-mp-frame');
    frame.src = innerSrc();

    function applySize() {
      var d = DEVICES[Number(sel.value)];
      // 화면 높이에 맞춰 세로를 줄이되(바/여백 고려), 가로는 디바이스 논리 폭 유지
      var maxH = window.innerHeight - 110;
      screen.style.width = d.w + 'px';
      screen.style.height = Math.max(360, Math.min(d.h, maxH)) + 'px';
    }
    sel.addEventListener('change', applySize);
    window.addEventListener('resize', applySize);
    applySize();

    document.getElementById('ares-mp-desktop').setAttribute('href', desktopHref());
  }
})();
