// Web/perf_tier.js
// 저사양 기기(태블릿 등) 감지 + 품질 티어링 + WebGL 초기화 가드.
//
// 클래식 스크립트로 로드해 window.AresPerf 로 노출한다(three-bundle 다음, 소비 코드 이전).
// index.html 의 인라인 스크립트와 Sim_Parts/context.js(모듈) 양쪽에서 공용으로 쓴다.
//
// 해결하는 문제(2026-07-14):
//   1) 저사양 태블릿에서 3D 페이지가 "전혀 안 보임" — WebGLRenderer 생성 실패 예외가
//      스크립트 전체를 죽여 로딩 문구만 남던 문제. createRenderer 가 try/catch 로 감싸고
//      실패 시 null 을 돌려주며 showFallback 으로 안내 화면을 띄운다.
//   2) 느림/검은 화면 — 4096² 그림자맵·MSAA·고배율 픽셀비가 약한 GPU 를 압도. 티어에 따라
//      그림자맵 캡·안티앨리어싱·픽셀비를 낮춘다.
//
// 강제 지정(디버깅/실기기 확인): URL 에 ?perf=low 또는 ?perf=high 를 붙이면 감지를 덮어쓴다.
(function () {
  'use strict';

  function probeMaxTextureSize() {
    // WebGL 자체가 없으면 0 을 돌려 "3D 불가"로 판정한다.
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return 0;
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) { try { lose.loseContext(); } catch (e) {} }
      return max;
    } catch (e) {
      return 0;
    }
  }

  function detect() {
    const nav = navigator || {};
    const mem = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;      // GB (Chrome 계열만)
    const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null;
    let coarse = false;
    try { coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) {}
    const maxTex = probeMaxTextureSize();

    const webglAvailable = maxTex > 0;
    const lowMem = mem !== null && mem <= 4;          // 4GB 이하
    const lowCores = cores !== null && cores <= 4;    // 코어 4개 이하
    const smallTex = maxTex > 0 && maxTex < 4096;     // 오래된/약한 GPU

    // 저사양 판정: 메모리 부족 · 약한 GPU(작은 텍스처 한도) · (코어 적음 + 터치기기).
    // 코어만 적은 데스크톱은 제외하되, 코어 적음 + coarse(터치)면 태블릿으로 보고 다운그레이드.
    let isLow = lowMem || smallTex || (lowCores && coarse);

    // URL 강제 지정
    let forced = null;
    try {
      const p = new URLSearchParams(window.location.search).get('perf');
      if (p === 'low' || p === 'high') forced = p;
    } catch (e) {}
    if (forced === 'low') isLow = true;
    if (forced === 'high') isLow = false;

    // 그림자맵 캡: 저사양 1024, 고사양 4096. 단 GPU 텍스처 한도를 절대 넘지 않는다.
    let shadowMapCap = isLow ? 1024 : 4096;
    if (maxTex > 0) shadowMapCap = Math.min(shadowMapCap, maxTex);

    return {
      webglAvailable,
      isLow,
      tier: isLow ? 'low' : 'high',
      forced,
      maxTextureSize: maxTex,
      deviceMemory: mem,
      hardwareConcurrency: cores,
      coarsePointer: coarse,
      // 렌더러 티어 파라미터
      antialias: !isLow,
      maxPixelRatio: isLow ? 1.5 : 2,
      shadowType: isLow ? 'pcf' : 'pcfsoft',   // pcf(가벼움) vs pcfsoft(부드럽지만 무거움)
      shadowMapCap,
    };
  }

  const perf = detect();

  // 그림자맵 한 변 크기를 티어 캡으로 제한한다. 호출부는 원하는 값을 넘기고,
  // 저사양이면 캡으로 낮춰 4096² render target 할당 실패(→검은 화면)를 막는다.
  perf.shadowSize = function (desired) {
    return Math.max(256, Math.min(desired || perf.shadowMapCap, perf.shadowMapCap));
  };

  // 가드된 WebGLRenderer 생성. 실패 시 예외를 삼키고 null 을 돌려준다(호출부가 폴백 처리).
  // 티어에 맞춘 antialias · pixelRatio · shadowMap 설정을 함께 적용한다.
  perf.createRenderer = function (THREE, opts) {
    opts = opts || {};
    if (!perf.webglAvailable) {
      console.warn('[AresPerf] WebGL 미지원 기기 — 3D 렌더러를 생성하지 않습니다.');
      return null;
    }
    try {
      const params = {
        antialias: perf.antialias,
        alpha: !!opts.alpha,
        powerPreference: opts.powerPreference || 'default',
      };
      if (opts.canvas) params.canvas = opts.canvas;   // 기존 <canvas> 재사용(컷씬 등)
      const renderer = new THREE.WebGLRenderer(params);
      const dpr = window.devicePixelRatio || 1;
      renderer.setPixelRatio(Math.min(dpr, perf.maxPixelRatio));
      renderer.shadowMap.enabled = opts.shadows !== false;
      renderer.shadowMap.type = perf.shadowType === 'pcfsoft'
        ? THREE.PCFSoftShadowMap
        : THREE.PCFShadowMap;
      return renderer;
    } catch (e) {
      console.error('[AresPerf] WebGLRenderer 초기화 실패:', e);
      return null;
    }
  };

  // 3D 를 띄울 수 없을 때(WebGL 미지원·컨텍스트 생성 실패) stage 안에 안내 화면을 넣는다.
  perf.showFallback = function (stage, message) {
    if (!stage) return;
    message = message || '이 기기에서는 3D 화면을 표시할 수 없어요.';
    try {
      let el = stage.querySelector('.ares-webgl-fallback');
      if (!el) {
        el = document.createElement('div');
        el.className = 'ares-webgl-fallback';
        el.style.cssText = [
          'position:absolute', 'inset:0', 'display:flex', 'flex-direction:column',
          'align-items:center', 'justify-content:center', 'gap:10px', 'text-align:center',
          'padding:24px', 'color:#cfd6e6', 'font-size:15px', 'line-height:1.5',
          'background:radial-gradient(circle at 50% 40%, #131a2e 0%, #05060f 70%)',
          'z-index:2', 'pointer-events:none',
        ].join(';');
        stage.appendChild(el);
      }
      el.innerHTML =
        '<div style="font-size:34px">🛰️</div>' +
        '<div>' + message + '</div>' +
        '<div style="font-size:13px;opacity:.7">최신 브라우저나 사양이 더 높은 기기에서 시도해 주세요.</div>';
    } catch (e) {}
  };

  window.AresPerf = perf;
  if (perf.isLow || !perf.webglAvailable) {
    console.info('[AresPerf] tier=' + perf.tier +
      ' webgl=' + perf.webglAvailable +
      ' maxTex=' + perf.maxTextureSize +
      ' mem=' + perf.deviceMemory +
      ' cores=' + perf.hardwareConcurrency +
      ' → antialias=' + perf.antialias +
      ' pixelRatio≤' + perf.maxPixelRatio +
      ' shadowCap=' + perf.shadowMapCap);
  }
})();
