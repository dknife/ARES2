/* ARES 모바일 미리보기
 * ------------------------------------------------------------------
 * 데스크톱 브라우저에서 ?mobile=true 로 접근하면 휴대폰 크기 프레임(iframe)
 * 안에 실제 페이지를 띄워, 기존 반응형(@media) 디자인을 그대로 "모바일 모습"
 * 으로 확인할 수 있게 한다. 프레임 폭이 좁으므로 페이지의
 * @media(max-width:…) 규칙과 matchMedia 가 자연스럽게 발동된다.
 *
 *   index.html?mobile=true            → 휴대폰 프레임을 만들고 그 안에
 *                                       같은 페이지(framed=1)를 로드
 *   index.html?mobile=true&framed=1   → 프레임 내부의 "진짜" 페이지.
 *                                       정상 동작 + 내부 링크에 파라미터 전파
 *
 * (각 HTML 의 <head> 맨 앞에 이 스크립트를 넣어야, 페이지 자신의 부트스트랩
 *  보다 먼저 실행되어 백그라운드 이중 실행을 막을 수 있다.)
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  if (params.get('mobile') !== 'true') return;   // 일반 데스크톱: 아무 동작 안 함

  var FRAMED = params.get('framed') === '1';

  // ── 프레임 내부(진짜 페이지) ────────────────────────────────────
  // 내부 링크(예: index → main)가 같은 프레임 안에서 계속 모바일로 열리도록
  // mobile/framed 파라미터를 유지한다. 외부 링크·앵커·상위경로는 그대로 둔다.
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
          u.searchParams.set('mobile', 'true');
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

  // ── 최상위 페이지: 휴대폰 프레임을 만든다 ──────────────────────────
  // 이 페이지 자신의 부트스트랩(index 의 three.js, main.js 등)이 프레임 뒤에서
  // 중복 실행되지 않도록 표시한다. (각 페이지가 이 플래그를 보고 init 을 건너뜀)
  window.__ARES_MOBILE_FRAME__ = true;

  // 프리셋 디바이스(논리 폭/높이, CSS px)
  var DEVICES = [
    { label: '📱 갤럭시 · 360', w: 360, h: 780 },
    { label: '📱 아이폰 · 390', w: 390, h: 844 },
    { label: '📱 큰폰 · 430',   w: 430, h: 932 },
    { label: '💻 태블릿 · 768', w: 768, h: 1024 },
  ];
  var DEFAULT_IDX = 1;

  function innerSrc() {
    var u = new URL(location.href);
    u.searchParams.set('mobile', 'true');
    u.searchParams.set('framed', '1');
    return u.pathname + u.search + u.hash;
  }

  function desktopHref() {
    var u = new URL(location.href);
    u.searchParams.delete('mobile');
    u.searchParams.delete('framed');
    var q = u.searchParams.toString();
    return u.pathname + (q ? '?' + q : '') + u.hash;
  }

  function build() {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
