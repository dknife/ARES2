(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // landing_game.js
  var landing_game_exports = {};
  __export(landing_game_exports, {
    launchLandingGame: () => launchLandingGame
  });
  function terrainHeight(x, z) {
    return 2.2 * Math.sin(x * 0.25) * Math.cos(z * 0.22) + 1.3 * Math.sin(x * 0.6 + 1.7) * Math.sin(z * 0.5 + 0.6) + 0.7 * Math.cos(x * 1.1 + z * 0.9);
  }
  function launchLandingGame() {
    if (running) return;
    const THREE = window.THREE;
    if (!THREE) {
      alert("3D \uB77C\uC774\uBE0C\uB7EC\uB9AC(three.js)\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      return;
    }
    running = true;
    const G = 3.8;
    const THRUST = 8;
    const DRAG = 0.995;
    const V_SAFE = 4;
    const LEG = 1.85;
    const START_Y = 40;
    const FUEL_MAX = 100;
    const FUEL_RATE = 5.5;
    const PADX = 0, PADZ = 0;
    const groundH = terrainHeight(PADX, PADZ);
    let y = START_Y;
    let vy = 0;
    let fuel = FUEL_MAX;
    let phase = "play";
    let thrusting = false;
    const overlay = document.createElement("div");
    overlay.className = "landing-overlay";
    overlay.innerHTML = `
    <header class="landing-header">
      <span class="landing-brand" aria-label="ARES \uD654\uC131\uD0D0\uC0AC"><img src="assets/design/ares-logo.png" alt="ARES \uD654\uC131\uD0D0\uC0AC"></span>
      <span class="landing-gear" aria-hidden="true"></span>
    </header>
    <div class="landing-stage">
      <canvas class="landing-canvas"></canvas>
      <div class="landing-hud">
        <div class="hud-row"><span>\uACE0\uB3C4</span><b data-hud="alt">0</b> m</div>
        <div class="hud-row"><span>\uD558\uAC15\uC18D\uB3C4</span><b data-hud="spd">0</b> m/s</div>
        <div class="hud-fuel"><i data-hud="fuelbar"></i></div>
      </div>
      <button class="landing-close" title="\uB2EB\uAE30">\u2715</button>
      <div class="landing-help">\uC704\uCABD \uD654\uC0B4\uD45C(\u2191) \uB610\uB294 <b>\uC5ED\uCD94\uC9C4</b> \uBC84\uD2BC\uC744 \uB20C\uB7EC <b>\uAC10\uC18D</b>!<br>\uC9C0\uBA74\uC5D0 <b>\uCC9C\uCC9C\uD788</b> \uB0B4\uB824\uC549\uD788\uBA74 \uCC29\uB959 \uC131\uACF5\uC774\uC5D0\uC694.</div>
      <button class="thrust-btn thrust-main" data-dir="up" aria-label="\uC5ED\uCD94\uC9C4">
        <span class="thrust-ico">\u25B2</span><span class="thrust-label">\uC5ED\uCD94\uC9C4</span>
      </button>
      <div class="landing-result" hidden>
        <div class="landing-result-panel">
          <h2 data-res="title"></h2>
          <p class="landing-result-msg" data-res="msg"></p>
          <p class="landing-result-stat" data-res="stat"></p>
          <div class="landing-result-btns">
            <button class="landing-retry">\uB2E4\uC2DC \uB3C4\uC804</button>
            <button class="landing-quit">\uADF8\uB9CC\uD558\uAE30</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const stage = overlay.querySelector(".landing-stage");
    const canvas = overlay.querySelector(".landing-canvas");
    const hud = {
      alt: overlay.querySelector('[data-hud="alt"]'),
      spd: overlay.querySelector('[data-hud="spd"]'),
      fuelbar: overlay.querySelector('[data-hud="fuelbar"]')
    };
    const resultEl = overlay.querySelector(".landing-result");
    const thrustBtn = overlay.querySelector(".thrust-main");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(657171);
    scene.fog = new THREE.FogExp2(1707808, 0.012);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    const starGeo = new THREE.BufferGeometry();
    const starN = 700, starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 320;
      starPos[i * 3 + 1] = Math.random() * 160 + 20;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 320;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 16777215, size: 0.5, sizeAttenuation: true })));
    scene.add(new THREE.HemisphereLight(16767426, 3807770, 0.9));
    const sun = new THREE.DirectionalLight(16771280, 1.5);
    sun.position.set(-34, 52, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.bias = -6e-4;
    scene.add(sun);
    const SIZE = 120, SEG = 90;
    const terGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    terGeo.rotateX(-Math.PI / 2);
    const tp = terGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      tp.setY(i, terrainHeight(tp.getX(i), tp.getZ(i)));
    }
    terGeo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      terGeo,
      new THREE.MeshStandardMaterial({ color: 11683627, roughness: 0.95, metalness: 0.02, flatShading: true })
    );
    terrain.receiveShadow = true;
    scene.add(terrain);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.2, 40),
      new THREE.MeshBasicMaterial({ color: 5231103, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(PADX, groundH + 0.06, PADZ);
    scene.add(ring);
    const ship = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 14673647, roughness: 0.4, metalness: 0.6 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 16738816, roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 1.7, 16), bodyMat);
    ship.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 16), bodyMat);
    nose.position.y = 1.4;
    ship.add(nose);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.28, 16), trimMat);
    band.position.y = 0.3;
    ship.add(band);
    const legMat = new THREE.MeshStandardMaterial({ color: 8950432, roughness: 0.6, metalness: 0.4 });
    const footMat = new THREE.MeshStandardMaterial({ color: 6055280, roughness: 0.75, metalness: 0.25 });
    const V3 = THREE.Vector3;
    function makeStrut(p0, p1, r) {
      const dir = new V3().subVectors(p1, p0);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), legMat);
      m.position.copy(p0).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
      return m;
    }
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = dx * 0.7071, nz = dz * 0.7071;
      const top = new V3(nx * 0.7, -0.2, nz * 0.7);
      const foot = new V3(nx * 1.9, -1.7, nz * 1.9);
      ship.add(makeStrut(top, foot, 0.09));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 12), footMat);
      pad.position.copy(foot).setY(foot.y - 0.04);
      ship.add(pad);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.7, 14),
      new THREE.MeshBasicMaterial({ color: 6737151, transparent: true, opacity: 0.9 })
    );
    flame.position.y = -1.25;
    flame.rotation.x = Math.PI;
    flame.visible = false;
    ship.add(flame);
    ship.traverse((o) => {
      if (o.isMesh && o !== flame) o.castShadow = true;
    });
    ship.position.set(PADX, y, PADZ);
    scene.add(ship);
    const DUST_N = 160, DUST_ALT = 6.5, DUST_LIFE = 1.1;
    const dustGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(DUST_N * 3);
    const dVel = new Float32Array(DUST_N * 3);
    const dLife = new Float32Array(DUST_N);
    function seedDust(i, fresh) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.7;
      dPos[i * 3] = Math.cos(a) * r;
      dPos[i * 3 + 1] = 0.08;
      dPos[i * 3 + 2] = Math.sin(a) * r;
      const spd = 1.6 + Math.random() * 2.6;
      dVel[i * 3] = Math.cos(a) * spd;
      dVel[i * 3 + 1] = 0.7 + Math.random() * 1.3;
      dVel[i * 3 + 2] = Math.sin(a) * spd;
      dLife[i] = fresh ? Math.random() * DUST_LIFE : 0;
    }
    for (let i = 0; i < DUST_N; i++) seedDust(i, true);
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 14131316,
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.position.set(PADX, groundH, PADZ);
    scene.add(dust);
    const setThrust = (on) => {
      if (phase === "play") thrusting = on;
    };
    const onKey = (down) => (e) => {
      if (e.key !== "ArrowUp") return;
      e.preventDefault();
      setThrust(down);
    };
    const kd = onKey(true), ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const press = (e) => {
      e.preventDefault();
      thrustBtn.classList.add("active");
      setThrust(true);
    };
    const release = (e) => {
      if (e) e.preventDefault();
      thrustBtn.classList.remove("active");
      setThrust(false);
    };
    thrustBtn.addEventListener("pointerdown", press);
    thrustBtn.addEventListener("pointerup", release);
    thrustBtn.addEventListener("pointerleave", release);
    thrustBtn.addEventListener("pointercancel", release);
    let raf = 0;
    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      overlay.remove();
      running = false;
    }
    function restart() {
      y = START_Y;
      vy = 0;
      fuel = FUEL_MAX;
      phase = "play";
      thrusting = false;
      thrustBtn.classList.remove("active");
      resultEl.hidden = true;
    }
    overlay.querySelector(".landing-close").addEventListener("click", cleanup);
    overlay.querySelector(".landing-quit").addEventListener("click", cleanup);
    overlay.querySelector(".landing-retry").addEventListener("click", restart);
    function endGame(ok, stat) {
      phase = ok ? "landed" : "crash";
      thrusting = false;
      thrustBtn.classList.remove("active");
      flame.visible = false;
      resultEl.querySelector('[data-res="title"]').textContent = ok ? "\u{1F389} \uCC29\uB959 \uC131\uACF5!" : "\u{1F4A5} \uCC29\uB959 \uC2E4\uD328";
      resultEl.querySelector('[data-res="msg"]').textContent = ok ? "\uBAA8\uB4E0 \uBBF8\uC158\uC744 \uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4. \uC5EC\uB7EC\uBD84\uC758 \uCF54\uB4DC\uB85C \uD654\uC131\uC5D0 \uB3C4\uCC29\uD588\uC5B4\uC694. \uCD95\uD558\uD574\uC694!" : "\uBAA8\uB4E0 \uBBF8\uC158\uC744 \uC644\uB8CC\uD588\uB294\uB370, \uCC29\uB959\uC5D0 \uBB38\uC81C\uAC00 \uC0DD\uACBC\uC5B4\uC694. \uB2E4\uC2DC \uD55C \uBC88 \uB3C4\uC804\uD574\uC694!";
      resultEl.querySelector('[data-res="stat"]').textContent = stat;
      resultEl.classList.toggle("ok", ok);
      resultEl.hidden = false;
    }
    function onResize() {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);
    onResize();
    let last = performance.now();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1e3;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (phase === "play") {
        let firing = thrusting;
        if (fuel <= 0) firing = false;
        else if (firing) fuel = Math.max(0, fuel - FUEL_RATE * dt);
        vy += (firing ? THRUST : 0) * dt - G * dt;
        vy *= DRAG;
        y += vy * dt;
        flame.visible = firing;
        if (firing) flame.scale.setScalar(0.7 + Math.random() * 0.6);
        if (y - LEG <= groundH) {
          y = groundH + LEG;
          const descend = -vy;
          if (descend <= V_SAFE) {
            endGame(true, `\uCC29\uC9C0 \uC18D\uB3C4 ${descend.toFixed(1)} m/s \xB7 \uB0A8\uC740 \uC5F0\uB8CC ${fuel.toFixed(0)}`);
          } else {
            endGame(false, `\uCC29\uC9C0 \uC18D\uB3C4 ${descend.toFixed(1)} m/s (\uC548\uC804 ${V_SAFE.toFixed(1)} m/s \uC774\uD558\uB85C \uAC10\uC18D!)`);
          }
        }
      }
      ship.position.y = y;
      const altNow = Math.max(0, y - LEG - groundH);
      const dustOn = phase === "play" && flame.visible && altNow < DUST_ALT;
      const dustTarget = dustOn ? Math.min(0.85, (1 - altNow / DUST_ALT) * 0.95) : 0;
      dustMat.opacity += (dustTarget - dustMat.opacity) * 0.15;
      if (dustMat.opacity > 0.01) {
        for (let i = 0; i < DUST_N; i++) {
          dLife[i] += dt;
          if (dLife[i] > DUST_LIFE) {
            if (dustOn) seedDust(i, false);
            else continue;
          }
          dPos[i * 3] += dVel[i * 3] * dt;
          dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt;
          dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
          dVel[i * 3 + 1] -= 1.2 * dt;
        }
        dustGeo.attributes.position.needsUpdate = true;
      }
      hud.alt.textContent = Math.max(0, y - LEG - groundH).toFixed(1);
      hud.spd.textContent = Math.max(0, -vy).toFixed(1);
      hud.fuelbar.style.width = fuel / FUEL_MAX * 100 + "%";
      hud.fuelbar.style.background = fuel < 25 ? "#e74c3c" : "#4fd1ff";
      const camT = Math.min(1, Math.max(0, (y - groundH) / (START_Y - groundH)));
      const midY = (START_Y + groundH) / 2;
      const camY = groundH + 7 + (midY + 3 - (groundH + 7)) * camT;
      const lookY = groundH + 1.5 + (midY - (groundH + 1.5)) * camT;
      const camZ = PADZ + 18 + 24 * camT;
      camera.position.set(PADX, camY, camZ);
      camera.lookAt(PADX, lookY, PADZ);
      ring.material.opacity = 0.35 + Math.sin(now * 4e-3) * 0.25;
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
  }
  var running;
  var init_landing_game = __esm({
    "landing_game.js"() {
      running = false;
    }
  });

  // credits.js?v=20260705m
  var credits_exports = {};
  __export(credits_exports, {
    closeCredits: () => closeCredits,
    openCredits: () => openCredits
  });
  function injectStyleOnce() {
    if (document.getElementById("creditsStyle")) return;
    const st = document.createElement("style");
    st.id = "creditsStyle";
    st.textContent = `
    /* \uC624\uBC84\uB808\uC774\uB294 \uD22C\uBA85 \u2014 \uB4A4\uB85C \uC6D0\uB798 \uC6F9\uC571 \uD654\uBA74\uC774 \uBCF4\uC778\uB2E4 */
    #creditsOverlay { position: fixed; inset: 0; z-index: 10050; background: transparent;
      touch-action: none; }
    /* WebGL \uB80C\uB354 \uACF5\uAC04: \uD654\uBA74 \uC804\uCCB4\uC758 2/3 \uD06C\uAE30(\uAC00\uC6B4\uB370 \uD328\uB110) */
    /* \uC644\uC804 \uD22C\uBA85\xB7\uBB34\uD14C\uB450\uB9AC \uD328\uB110 \u2014 \uB4A4\uC758 \uC571\uC774 \uC120\uBA85\uD558\uAC8C \uADF8\uB300\uB85C \uBE44\uCE5C\uB2E4(\uBE14\uB7EC\xB7\uD14C\uB450\uB9AC\uC120\xB7\uC74C\uC601 \uC5C6\uC74C) */
    #creditsStage { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
      width: 66.6%; height: 66.6%; overflow: hidden;
      background: transparent; border: none; box-shadow: none; }
    #creditsCanvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    #creditsLabels { position: absolute; inset: 0; pointer-events: none; }
    .credit-label { position: absolute; top: 0; left: 0; will-change: transform, opacity;
      color: #ffd21e; white-space: nowrap; font-family: 'GangwonEduTeun','Inter Tight',sans-serif;
      /* \uAC80\uC740 \uD14C\uB450\uB9AC(\uC678\uACFD\uC120) \u2014 4\uBC29\uD5A5 \uC624\uD504\uC14B \uADF8\uB9BC\uC790 + \uC0B4\uC9DD\uC758 \uB4DC\uB86D\uC100\uB3C4 */
      text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000,
        0 0 2px #000, 0 2px 5px rgba(0,0,0,0.55); }
    .credit-label .credit-role { display: block; font-size: 0.92rem; font-weight: 700;
      color: #ffd21e; letter-spacing: .3px; margin-bottom: 1px; }
    .credit-label .credit-name { display: block; font-size: 0.92rem; font-weight: 800; color: #ffd21e; }
    #creditsTitle { position: absolute; top: 14px; left: 0; right: 0; text-align: center;
      color: #fff; font-family: 'GangwonEduTeun','Inter Tight',sans-serif; font-weight: 800;
      font-size: 1.05rem; letter-spacing: 2px; text-shadow: 0 2px 10px rgba(0,0,0,.7);
      pointer-events: none; z-index: 2; }
  `;
    document.head.appendChild(st);
  }
  function openCredits() {
    if (S) return;
    const THREE = window.THREE;
    const ARES3 = window.ARES3 || {};
    const GLTFLoader = ARES3.GLTFLoader;
    if (!THREE || !GLTFLoader) {
      console.warn("[\uD06C\uB808\uB527] THREE \uBBF8\uB85C\uB4DC");
      return;
    }
    injectStyleOnce();
    const overlay = document.createElement("div");
    overlay.id = "creditsOverlay";
    const stage = document.createElement("div");
    stage.id = "creditsStage";
    const canvas = document.createElement("canvas");
    canvas.id = "creditsCanvas";
    const labels = document.createElement("div");
    labels.id = "creditsLabels";
    const title = document.createElement("div");
    title.id = "creditsTitle";
    title.textContent = "\uB9CC\uB4E0 \uC0AC\uB78C\uB4E4";
    stage.append(canvas, labels, title);
    overlay.append(stage);
    document.body.appendChild(overlay);
    overlay.addEventListener("pointerdown", () => closeCredits());
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setClearColor(0, 0);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(329231, CAM_Z - WHEEL_R * 0.1, CAM_Z + WHEEL_R * 1.5);
    if (ARES3.RoomEnvironment) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new ARES3.RoomEnvironment(), 0.04).texture;
      } catch (e) {
      }
    }
    const starGeo = new THREE.BufferGeometry();
    const N = 400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 45 + Math.random() * 40, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 16777215,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      fog: false
    }));
    scene.add(stars);
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
    camera.position.set(0, 2.6, CAM_Z);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(16777215, 12371680, 1));
    const key = new THREE.DirectionalLight(16773856, 2);
    key.position.set(3, 5, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(12374768, 0.5);
    fill.position.set(-4, 2, 4);
    scene.add(fill);
    const items = CREDITS.map(([role, name], i) => {
      const el = document.createElement("div");
      el.className = "credit-label";
      el.style.opacity = "0";
      el.innerHTML = `<span class="credit-role"></span><span class="credit-name"></span>`;
      el.querySelector(".credit-role").textContent = role;
      el.querySelector(".credit-name").textContent = name;
      labels.appendChild(el);
      return { el, holder: null, wrap: null, baseAngle: i / CREDITS.length * Math.PI * 2 };
    });
    function resize() {
      const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    const loader = new GLTFLoader();
    if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
    loader.load("Mesh/EnvAssets/Astronaut.glb", (gltf) => {
      if (!S || S.overlay !== overlay) return;
      const proto = gltf.scene;
      const box = new THREE.Box3().setFromObject(proto);
      const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      const scl = ASTRO_H / (sz.y || 1);
      items.forEach((it) => {
        const model = proto.clone(true);
        model.position.sub(c);
        const wrap = new THREE.Group();
        wrap.scale.setScalar(scl);
        wrap.add(model);
        const mats = [];
        wrap.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false;
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            m.transparent = true;
            m.depthWrite = true;
            mats.push(m);
          });
        });
        const holder = new THREE.Group();
        holder.add(wrap);
        scene.add(holder);
        it.holder = holder;
        it.wrap = wrap;
        it.mats = mats;
      });
    }, void 0, (e) => console.warn("[\uD06C\uB808\uB527] \uC6B0\uC8FC\uC778 \uB85C\uB4DC \uC2E4\uD328", e));
    const clock = new THREE.Clock();
    const world = new THREE.Vector3();
    const wheelCenter = new THREE.Vector3(WHEEL_X, 0, 0);
    const centerToCam = new THREE.Vector3().subVectors(camera.position, wheelCenter).normalize();
    let raf = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      stars.rotation.y += dt * 0.01;
      const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
      for (const it of items) {
        if (!it.holder) {
          it.el.style.opacity = "0";
          continue;
        }
        const th = it.baseAngle - OMEGA * t;
        it.holder.position.set(WHEEL_X, WHEEL_R * Math.cos(th), WHEEL_R * Math.sin(th));
        const ph = t * 0.8 + it.baseAngle * 1.7;
        it.wrap.position.set(Math.sin(ph) * 0.45, Math.sin(ph * 0.6 + 1.1) * 0.28, 0);
        it.wrap.rotation.set(
          Math.sin(ph * 0.5 + 0.7) * 0.14,
          // 앞뒤로 끄덕
          Math.sin(t * 0.7 + it.baseAngle) * 0.22,
          // 좌우 방향 틀기
          Math.sin(ph * 0.85) * 0.2
          // 좌우로 기우뚱(유영감)
        );
        const dot = Math.cos(th) * centerToCam.y + Math.sin(th) * centerToCam.z;
        const front = Math.max(0, dot);
        const op = Math.pow(front, 2.6);
        for (const m of it.mats) m.opacity = op;
        it.wrap.getWorldPosition(world);
        world.project(camera);
        const sx = (world.x * 0.5 + 0.5) * w;
        const sy = (-world.y * 0.5 + 0.5) * h;
        it.el.style.opacity = world.z < 1 ? op.toFixed(2) : "0";
        it.el.style.transform = `translate(${Math.round(sx + 44)}px, ${Math.round(sy)}px) translateY(-50%)`;
      }
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);
    S = {
      overlay,
      onResize,
      stop() {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        try {
          renderer.dispose();
        } catch (e) {
        }
        try {
          scene.traverse((o) => {
            var _a, _b;
            if (o.geometry) (_b = (_a = o.geometry).dispose) == null ? void 0 : _b.call(_a);
            const m = o.material;
            if (m) (Array.isArray(m) ? m : [m]).forEach((x) => {
              var _a2;
              return (_a2 = x == null ? void 0 : x.dispose) == null ? void 0 : _a2.call(x);
            });
          });
        } catch (e) {
        }
      }
    };
    S.onKey = (e) => {
      if (e.key === "Escape") closeCredits();
    };
    window.addEventListener("keydown", S.onKey);
  }
  function closeCredits() {
    if (!S) return;
    const cur = S;
    S = null;
    cur.stop();
    if (cur.onKey) window.removeEventListener("keydown", cur.onKey);
    cur.overlay.remove();
  }
  var CREDITS, WHEEL_R, WHEEL_X, ASTRO_H, OMEGA, CAM_Z, S;
  var init_credits = __esm({
    "credits.js?v=20260705m"() {
      CREDITS = [
        ["\uAC1C\uBC1C\uCC45\uC784", "\uCF54\uB9AC\uC544\uC0AC\uC774\uC5B8\uC2A4 \uC774\uCC3D\uC11D"],
        ["\uAE30\uD68D", "\uCF54\uB9AC\uC544\uC0AC\uC774\uC5B8\uC2A4 \uAE40\uC120\uD615"],
        ["\uAE30\uC220\uCD1D\uAD04", "\uCF54\uB9AC\uC544\uC0AC\uC774\uC5B8\uC2A4 \uAD8C\uC815\uD604"],
        ["\uC81C\uC791\uCD1D\uAD04", "\uCF54\uB9AC\uC544\uC0AC\uC774\uC5B8\uC2A4 \uC11D\uC9C4\uD601"],
        ["\uB514\uC790\uC778 \uAE30\uD68D", "\uCF54\uB9AC\uC544\uC0AC\uC774\uC5B8\uC2A4 \uD5C8\uC784\uACBD"],
        ["\uB514\uC790\uC778 \uCD1D\uAD04", "\uB3D9\uBA85\uB300\uD559\uAD50 \uADF8\uB798\uD53D\uD559\uACFC \uC11C\uBBF8\uB77C"],
        ["\uB514\uC790\uC778 \uBC0F \uC81C\uD488\uC81C\uC791", "\uB3D9\uBA85\uB300\uD559\uAD50 \uAC8C\uC784\uADF8\uB798\uD53D\uD559\uACFC \uC774\uC7AC\uD6C8"],
        ["\uC18C\uD504\uD2B8\uC6E8\uC5B4 \uCD1D\uAD04", "\uB3D9\uBA85\uB300\uD559\uAD50 \uAC8C\uC784\uADF8\uB798\uD53D\uD559\uACFC \uAC15\uC601\uBBFC"],
        ["\uC11C\uBE44\uC2A4 \uAC1C\uBC1C", "\uB3D9\uBA85\uB300\uD559\uAD50 \uAC8C\uC784\uACF5\uD559\uACFC \uC2E0\uC6D0"],
        ["\uD38C\uC6E8\uC5B4 \uBC0F \uBE14\uB85D\uCF54\uB529SW", "\uB3D9\uBA85\uB300\uD559\uAD50 \uAC8C\uC784\uACF5\uD559\uACFC \uC774\uC8FC\uD604"],
        ["WebApp SW", "\uB3D9\uBA85\uB300\uD559\uAD50 \uAC8C\uC784\uACF5\uD559\uACFC \uC774\uC131\uBE48"],
        ["\uB514\uC9C0\uD138 \uD2B8\uC708 \uC5D4\uC9C4", "\uB3D9\uBA85\uB300\uD559\uAD50 \uAC8C\uC784\uACF5\uD559\uACFC \uAE40\uC9C0\uD6C8"],
        ["\uB514\uC9C0\uD138 \uD2B8\uC708 \uC5D4\uC9C4", "\uB3D9\uBA85\uB300\uD559\uAD50 \uAC8C\uC784\uACF5\uD559\uACFC \uC774\uBBFC\uD601"]
      ];
      WHEEL_R = 5.1;
      WHEEL_X = -1.6;
      ASTRO_H = 1.4;
      OMEGA = 2 * Math.PI / 26;
      CAM_Z = 13;
      S = null;
    }
  });

  // state.js
  var DEBUG = false;
  var DEFAULT_BLOCK_NAMES = {
    wheel: "\uC11C\uBCF4 \uBAA8\uD130",
    dcmotor: "DC \uBAA8\uD130",
    buzzer: "\uC18C\uB9AC",
    leds: "LED",
    oled: "\uB514\uC2A4\uD50C\uB808\uC774",
    gun: "\uBC1C\uC0AC",
    sensors: "\uC13C\uC11C"
  };
  var state = {
    // 블루투스 상태
    bluetoothDevice: null,
    bluetoothServer: null,
    uartService: null,
    characteristic: null,
    notificationsEnabled: false,
    readIntervalId: null,
    isConnecting: false,
    connectFailed: false,
    // 마지막 연결 시도가 실패했는지 (재연결 라벨용)
    lastCommand: null,
    // 실행 상태
    isExecuting: false,
    // 액티브 모델 ('gun' 또는 'launchpad')
    activeModel: "gun",
    // 활성화된 모듈 정보 (null 이면 전체 활성화 상태로 취급)
    enabledModules: null,
    // 블럭 이름 (기본값으로 초기화되고, Pico 연결 시 NAMES 값으로 오버라이드 가능)
    blockNames: Object.assign({}, DEFAULT_BLOCK_NAMES),
    // 변수 저장소
    variables: {},
    // Promise 상태
    pendingCommand: null,
    pendingResolve: null,
    pendingReject: null,
    pendingTimeout: null
  };

  // elements.js
  var elements = {
    // 제어 버튼 — connectButton 은 연결/끊기/재연결 4-state 통합 버튼
    connectButton: document.getElementById("connectButton"),
    runButton: document.getElementById("runButton"),
    saveButton: document.getElementById("saveButton"),
    loadButton: document.getElementById("loadButton"),
    // 파일 입력
    fileInput: document.getElementById("fileInput"),
    // 로그 패널
    logContent: document.getElementById("logContent"),
    logContainer: document.getElementById("logContainer"),
    clearLogBtn: document.getElementById("clearLogBtn")
  };

  // logger.js
  var MAX_COMPACT_LINES = 3;
  var MAX_ENTRIES = 500;
  var entries = [];
  function isExpanded() {
    var _a;
    const container = (_a = elements.logContainer) != null ? _a : document.getElementById("logContainer");
    return container == null ? void 0 : container.classList.contains("expanded");
  }
  function render() {
    const expanded = isExpanded();
    const visible = expanded ? entries : entries.filter((e) => !e.verbose).slice(-MAX_COMPACT_LINES);
    elements.logContent.innerHTML = "";
    for (const entry of visible) {
      const logEntry = document.createElement("div");
      logEntry.className = `log-entry log-${entry.type}`;
      const detailHtml = expanded && entry.detail ? `<div class="log-detail">${escapeHtml(entry.detail)}</div>` : "";
      logEntry.innerHTML = `
            <span class="log-timestamp">${entry.timestamp}</span>
            ${escapeHtml(entry.message)}
            ${detailHtml}
        `;
      elements.logContent.appendChild(logEntry);
    }
    if (expanded) {
      elements.logContent.scrollTop = elements.logContent.scrollHeight;
    }
  }
  function escapeHtml(str) {
    return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  var Logger = {
    add(message, type = "info", options = {}) {
      const entry = {
        timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString(),
        message,
        type,
        verbose: !!options.verbose,
        detail: options.detail || ""
      };
      entries.push(entry);
      if (entries.length > MAX_ENTRIES) {
        entries.shift();
      }
      render();
    },
    clear() {
      entries.length = 0;
      elements.logContent.innerHTML = "";
    },
    refresh() {
      render();
    }
  };

  // constants.js
  var BLUETOOTH_CONFIG = {
    // UART 서비스 UUID (HM-10/BT05 호환)
    UART_SERVICE_UUID: "0000ffe0-0000-1000-8000-00805f9b34fb",
    // UART 특성 UUID
    UART_CHARACTERISTIC_UUID: "0000ffe1-0000-1000-8000-00805f9b34fb",
    // BLE 패킷당 최대 바이트
    MAX_CHUNK_SIZE: 20,
    // 명령 사이 딜레이 (ms) - 응답 기반이므로 최소값
    COMMAND_DELAY: 100,
    // BLE 청크 사이 딜레이 (ms). HM-10/BT05 connection interval(30~70ms)을 충분히 넘기는
    // 100ms로 두어 멀티 청크 명령(BATCH, LED 패턴, SYS_SET)의 청크 손실을 줄인다.
    CHUNK_DELAY: 100,
    // 주기적 읽기 간격 (ms)
    READ_INTERVAL: 500,
    // 응답 타임아웃 (ms) - 대부분 명령은 빠르게 응답
    RESPONSE_TIMEOUT: 5e3
  };
  var STATUS_COLORS = {
    GREEN: "#00ff9d",
    RED: "#ff0055",
    ORANGE: "#ffb800"
  };
  var STORAGE_KEYS = {
    SYSTEM_CONFIG: "ares-system-config"
  };
  function loadSavedConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SYSTEM_CONFIG);
      if (saved) {
        const config = JSON.parse(saved);
        if (config.connection_timeout) {
          BLUETOOTH_CONFIG.RESPONSE_TIMEOUT = config.connection_timeout;
        }
        if (config.chunk_size) {
          BLUETOOTH_CONFIG.MAX_CHUNK_SIZE = config.chunk_size;
        }
        if (config.command_delay) {
          BLUETOOTH_CONFIG.COMMAND_DELAY = config.command_delay;
        }
      }
    } catch (e) {
      console.warn("[Constants] \uC124\uC815 \uB85C\uB4DC \uC2E4\uD328:", e);
    }
  }
  loadSavedConfig();

  // bluetooth.js
  var receiveByteBuffer = [];
  var BluetoothManager = {
    // addEventListener/removeEventListener에 같은 참조를 넘기기 위한 bound 핸들러.
    // (매번 .bind(this)로 등록하면 remove가 실패해 재연결마다 리스너가 누적된다.)
    _boundHandleRxData: null,
    _boundOnDeviceDisconnected: null,
    _sendQueue: Promise.resolve(),
    _abortCurrentWrite: false,
    _sendEpoch: 0,
    // 연결
    async connect() {
      if (state.isConnecting) {
        Logger.add("[\uACBD\uACE0] \uC774\uBBF8 \uC5F0\uACB0 \uC2DC\uB3C4 \uC911\uC785\uB2C8\uB2E4", "error");
        return;
      }
      state.isConnecting = true;
      state.connectFailed = false;
      this.updateConnectionStatus(false);
      try {
        Logger.add("[BLE] \uC7A5\uCE58 \uAC80\uC0C9 \uC911...", "info");
        state.bluetoothDevice = await navigator.bluetooth.requestDevice({
          filters: [
            { name: "PicoBLE" },
            { name: "HMSoft" },
            { name: "BT05" },
            // 펌웨어가 AT+NAME{device_name}으로 모듈을 개명하면 위 고정
            // 이름과 달라진다 — UART 서비스를 광고하는 장치는 이름과
            // 무관하게 검색되도록 서비스 필터를 함께 둔다.
            { services: [BLUETOOTH_CONFIG.UART_SERVICE_UUID] }
          ],
          optionalServices: [BLUETOOTH_CONFIG.UART_SERVICE_UUID]
        });
        Logger.add(`[BLE] \uC7A5\uCE58 \uBC1C\uACAC: ${state.bluetoothDevice.name || "Unknown"}`, "info");
        if (!this._boundOnDeviceDisconnected) {
          this._boundOnDeviceDisconnected = this.onDeviceDisconnected.bind(this);
        }
        state.bluetoothDevice.addEventListener(
          "gattserverdisconnected",
          this._boundOnDeviceDisconnected
        );
        state.bluetoothServer = await state.bluetoothDevice.gatt.connect();
        Logger.add("[BLE] GATT \uC5F0\uACB0\uB428", "info");
        await this.delay(2e3);
        state.uartService = await state.bluetoothServer.getPrimaryService(
          BLUETOOTH_CONFIG.UART_SERVICE_UUID
        );
        Logger.add(`[BLE] \uC11C\uBE44\uC2A4 \uC5F0\uACB0\uB428`, "info");
        state.characteristic = await state.uartService.getCharacteristic(
          BLUETOOTH_CONFIG.UART_CHARACTERISTIC_UUID
        );
        Logger.add("[BLE] UART \uD2B9\uC131 \uC5F0\uACB0\uB428", "info");
        try {
          await state.characteristic.startNotifications();
          if (!this._boundHandleRxData) {
            this._boundHandleRxData = this.handleRxData.bind(this);
          }
          state.characteristic.addEventListener(
            "characteristicvaluechanged",
            this._boundHandleRxData
          );
          state.notificationsEnabled = true;
          Logger.add("[BLE] \uC54C\uB9BC \uBAA8\uB4DC \uD65C\uC131\uD654", "info");
        } catch (error) {
          Logger.add(`[BLE] \uC54C\uB9BC \uC2E4\uD328, \uD3F4\uB9C1 \uBAA8\uB4DC\uB85C \uC804\uD658: ${error.message}`, "warning");
          this.startPeriodicReads();
        }
        state.isConnecting = false;
        state.connectFailed = false;
        this.updateConnectionStatus(true);
        Logger.add(`[\uC5F0\uACB0] ${state.bluetoothDevice.name || "Unknown"} \uC5F0\uACB0 \uC644\uB8CC`, "success");
      } catch (error) {
        console.error("BLE \uC5F0\uACB0 \uC624\uB958:", error);
        Logger.add(`[\uC624\uB958] \uC5F0\uACB0 \uC2E4\uD328: ${error.message}`, "error");
        await this.cleanup();
        state.isConnecting = false;
        state.connectFailed = true;
        this.updateConnectionStatus(false);
      }
    },
    // 연결 해제 (알림 중지/리스너 제거는 cleanup이 담당)
    async disconnect() {
      try {
        if (state.bluetoothDevice && state.bluetoothDevice.gatt.connected) {
          await state.bluetoothDevice.gatt.disconnect();
        }
        await this.cleanup();
        state.connectFailed = false;
        this.updateConnectionStatus(false);
        Logger.add("[\uC5F0\uACB0] \uD574\uC81C \uC644\uB8CC", "info");
      } catch (error) {
        console.error("\uC5F0\uACB0 \uD574\uC81C \uC624\uB958:", error);
        Logger.add(`[\uC624\uB958] \uC5F0\uACB0 \uD574\uC81C \uC2E4\uD328: ${error.message}`, "error");
      }
    },
    // 리소스 정리
    async cleanup() {
      receiveByteBuffer = [];
      if (state.characteristic && state.notificationsEnabled) {
        try {
          await state.characteristic.stopNotifications();
          if (this._boundHandleRxData) {
            state.characteristic.removeEventListener(
              "characteristicvaluechanged",
              this._boundHandleRxData
            );
          }
        } catch (e) {
          console.warn("\uC54C\uB9BC \uC815\uB9AC \uC624\uB958:", e);
        }
      }
      if (state.readIntervalId) {
        clearInterval(state.readIntervalId);
        state.readIntervalId = null;
      }
      state.characteristic = null;
      state.uartService = null;
      state.bluetoothServer = null;
      if (state.bluetoothDevice) {
        if (this._boundOnDeviceDisconnected) {
          state.bluetoothDevice.removeEventListener(
            "gattserverdisconnected",
            this._boundOnDeviceDisconnected
          );
        }
        state.bluetoothDevice = null;
      }
      state.notificationsEnabled = false;
      if (state.pendingTimeout) {
        clearTimeout(state.pendingTimeout);
        state.pendingTimeout = null;
      }
      if (state.pendingReject) {
        const reject = state.pendingReject;
        const command = state.pendingCommand;
        state.pendingCommand = null;
        state.pendingResolve = null;
        state.pendingReject = null;
        reject(new Error(`\uC5F0\uACB0\uC774 \uB04A\uC5B4\uC838 \uC751\uB2F5 \uB300\uAE30\uB97C \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4: ${command || "unknown"}`));
      }
      state.pendingCommand = null;
      state.pendingResolve = null;
    },
    // 연결 해제 이벤트
    onDeviceDisconnected() {
      console.log("\uC7A5\uCE58 \uC5F0\uACB0 \uD574\uC81C\uB428");
      this.updateConnectionStatus(false);
      Logger.add("[\uC5F0\uACB0] \uB04A\uC5B4\uC9D0", "warning");
      this.cleanup();
    },
    // 데이터 수신 핸들러
    handleRxData(event) {
      const value = event.target.value;
      for (let i = 0; i < value.byteLength; i++) {
        receiveByteBuffer.push(value.getUint8(i));
      }
      let newlineIndex;
      while ((newlineIndex = receiveByteBuffer.indexOf(10)) !== -1) {
        const lineBytes = new Uint8Array(receiveByteBuffer.slice(0, newlineIndex));
        receiveByteBuffer = receiveByteBuffer.slice(newlineIndex + 1);
        const decoder = new TextDecoder("utf-8");
        const completeMessage = decoder.decode(lineBytes).trim();
        if (completeMessage) {
          this.processReceivedData(completeMessage);
        }
      }
      if (receiveByteBuffer.length > 2048) {
        receiveByteBuffer = [];
      }
    },
    // 수신 데이터 처리
    processReceivedData(receivedData) {
      if (!receivedData) return;
      if (receivedData.startsWith("STATUS,")) {
        const iframe = document.getElementById("dashboardFrame");
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: "status_update",
            data: receivedData
          }, "*");
        }
        this._resolvePromise(receivedData);
        return;
      }
      if (receivedData.startsWith("SYS_VALUES,")) {
        this._handleSysValues(receivedData);
        return;
      }
      if (receivedData.startsWith("MODULES,")) {
        this._handleModules(receivedData);
        return;
      }
      if (receivedData.startsWith("NAMES,")) {
        this._handleNames(receivedData);
        return;
      }
      if (receivedData.startsWith("CALIB_VALUES,")) {
        this._handleCalibValues(receivedData);
        return;
      }
      if (DEBUG) Logger.add(`[\uC218\uC2E0] ${receivedData}`, "info");
      this._resolvePromise(receivedData);
      this._updateBlocklyVariable(receivedData);
    },
    // SYS_VALUES 처리
    _handleSysValues(data) {
      const parts = data.split(",");
      const iframe = document.getElementById("dashboardFrame");
      const max_speed = parts[1];
      const collision_dist = parts[2];
      const auto_stop = parts[3];
      let left_calib = void 0;
      let right_calib = void 0;
      let active_model = void 0;
      let device_name = "";
      if (parts.length >= 8) {
        left_calib = parts[parts.length - 3];
        right_calib = parts[parts.length - 2];
        active_model = parts[parts.length - 1];
        device_name = parts.slice(4, parts.length - 3).join(",");
      } else if (parts.length >= 7) {
        left_calib = parts[parts.length - 2];
        right_calib = parts[parts.length - 1];
        device_name = parts.slice(4, parts.length - 2).join(",");
      } else {
        device_name = parts.slice(4).join(",");
      }
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: "sys_values",
          max_speed,
          collision_dist,
          auto_stop,
          device_name,
          left_calibration: left_calib,
          right_calibration: right_calib,
          active_model,
          connection_timeout: BLUETOOTH_CONFIG.RESPONSE_TIMEOUT
        }, "*");
      }
      if (active_model) {
        state.activeModel = active_model.toLowerCase();
      } else if (device_name.toLowerCase().includes("launchpad") || device_name.includes("\uBC1C\uC0AC\uB300")) {
        state.activeModel = "launchpad";
      }
      if (window.updateToolboxForActiveState) {
        window.updateToolboxForActiveState();
      }
      this._resolvePromise(data);
      Logger.add("[\uC218\uC2E0] \uC2DC\uC2A4\uD15C \uC124\uC815\uAC12", "success");
    },
    // MODULES 처리
    _handleModules(data) {
      try {
        const parts = data.split(",");
        const enabledModules = {};
        for (let i = 1; i < parts.length; i++) {
          const pair = parts[i].split(":");
          if (pair.length === 2) {
            const moduleName = pair[0].trim();
            const status = pair[1].trim();
            enabledModules[moduleName] = status === "ON";
          }
        }
        state.enabledModules = enabledModules;
        if (window.updateToolboxForActiveState) {
          window.updateToolboxForActiveState();
        }
      } catch (e) {
        console.error("[Bluetooth] MODULES \uD30C\uC2F1 \uC624\uB958:", e);
      }
      this._resolvePromise(data);
      Logger.add("[\uC218\uC2E0] \uD65C\uC131\uD654\uB41C \uBAA8\uB4C8 \uC815\uBCF4", "success");
    },
    // NAMES 처리
    _handleNames(data) {
      try {
        const parts = data.split(",");
        const blockNames = Object.assign({}, DEFAULT_BLOCK_NAMES);
        for (let i = 1; i < parts.length; i++) {
          const pair = parts[i].split(":");
          if (pair.length === 2) {
            const key = pair[0].trim();
            const val = pair[1].trim();
            if (key === "model" || key === "theme") {
              state.activeModel = val.toLowerCase();
            } else if (key in blockNames) {
              blockNames[key] = val;
            }
          }
        }
        state.blockNames = blockNames;
        if (window.updateToolboxForActiveState) {
          window.updateToolboxForActiveState();
        }
      } catch (e) {
        console.error("[Bluetooth] NAMES \uD30C\uC2F1 \uC624\uB958:", e);
      }
      this._resolvePromise(data);
      Logger.add("[\uC218\uC2E0] \uBE14\uB85D \uC774\uB984 \uC815\uBCF4", "success");
    },
    // CALIB_VALUES 처리
    _handleCalibValues(data) {
      const parts = data.split(",");
      const iframe = document.getElementById("dashboardFrame");
      if (iframe && iframe.contentWindow && parts.length >= 3) {
        iframe.contentWindow.postMessage({
          type: "calib_values",
          left: parts[1],
          right: parts[2]
        }, "*");
      }
      Logger.add(`[\uC218\uC2E0] \uCE98\uB9AC\uBE0C\uB808\uC774\uC158: \uC88C=${parts[1]}, \uC6B0=${parts[2]}`, "info");
      this._resolvePromise(data);
    },
    // 명령별 기대 응답 접두어. 값 반환 명령 대기 중에 도착한 무관 데이터
    // (대개 직전 blocking 명령의 늦은 ack "1")가 promise를 잘못 resolve해
    // 이후 응답 스트림이 한 칸씩 밀리던 desync를 차단한다.
    _expectedResponsePrefix(command) {
      if (!command) return null;
      switch (command.split(",")[0]) {
        case "DISTANCE":
          return "DIST";
        case "MAGNET":
          return "MAG";
        case "GET_SYS":
          return "SYS_VALUES";
        case "GET_MODULES":
          return "MODULES";
        case "GET_NAMES":
          return "NAMES";
        case "GET_STATUS":
          return "STATUS";
        default:
          return null;
      }
    },
    // Promise 해결
    _resolvePromise(data) {
      if (state.pendingResolve) {
        const expected = this._expectedResponsePrefix(state.pendingCommand);
        if (expected && !String(data).toUpperCase().startsWith(expected)) {
          Logger.add(`[BLE] ${state.pendingCommand} \uB300\uAE30 \uC911 \uBB34\uAD00 \uC751\uB2F5 \uBB34\uC2DC: ${data}`, "warning");
          return;
        }
        if (state.pendingTimeout) clearTimeout(state.pendingTimeout);
        const resolve = state.pendingResolve;
        state.pendingCommand = null;
        state.pendingResolve = null;
        state.pendingReject = null;
        state.pendingTimeout = null;
        resolve(data);
      } else if (DEBUG) {
        Logger.add(`[BLE] \uB300\uAE30 \uC911\uC778 \uBA85\uB839 \uC5C6\uC774 \uC218\uC2E0\uB428: ${data}`, "warning");
      }
    },
    // Blockly 변수 업데이트
    _updateBlocklyVariable(data) {
      const distMatch = data.match(/DIST[:\s]*([\d.]+)/i);
      if (distMatch) {
        state.variables["_last_distance"] = distMatch[1];
      }
      const magMatch = data.match(/MAG[:\s]*([\d]+)/i);
      if (magMatch) {
        state.variables["_last_magnetic"] = magMatch[1];
      }
    },
    // 특성 값 읽기
    async readCharacteristic() {
      if (!state.characteristic || !state.bluetoothDevice.gatt.connected) return;
      try {
        const value = await state.characteristic.readValue();
        const decoder = new TextDecoder();
        const receivedData = decoder.decode(value).trim();
        if (receivedData) {
          if (DEBUG) Logger.add(`[\uC77D\uAE30] ${receivedData}`, "receive");
          this.processReceivedData(receivedData);
        }
      } catch (error) {
        console.error("\uC77D\uAE30 \uC624\uB958:", error);
        Logger.add(`[\uC624\uB958] \uC77D\uAE30 \uC2E4\uD328: ${error.message}`, "error");
      }
    },
    // 주기적 읽기 시작
    startPeriodicReads() {
      if (!state.readIntervalId) {
        state.readIntervalId = setInterval(
          () => this.readCharacteristic(),
          BLUETOOTH_CONFIG.READ_INTERVAL
        );
      }
    },
    // 연결 상태 UI 업데이트 — connectButton 4-state 라벨/색을 갱신.
    // runButton 상태는 main.js 의 updateRunButtonUI 에 위임(이벤트로 통지).
    updateConnectionStatus(connected) {
      if (!connected) {
        state.enabledModules = null;
        state.blockNames = Object.assign({}, DEFAULT_BLOCK_NAMES);
        if (window.updateToolboxForActiveState) {
          window.updateToolboxForActiveState();
        }
      }
      const btn = elements.connectButton;
      if (btn) {
        const label = btn.querySelector(".mobile-nav-label");
        const setLabel = (text) => {
          if (label) label.textContent = text;
          else btn.textContent = text;
        };
        btn.classList.remove("btn-connected", "btn-failed");
        if (connected) {
          setLabel("\uC5F0\uACB0\uB428");
          btn.classList.add("btn-connected");
          btn.disabled = false;
          btn.title = "\uC5F0\uACB0\uC744 \uB04A\uC73C\uB824\uBA74 \uD074\uB9AD";
        } else if (state.isConnecting) {
          setLabel("\uC5F0\uACB0 \uC911\u2026");
          btn.disabled = true;
          btn.title = "\uC5F0\uACB0 \uC2DC\uB3C4 \uC911";
        } else if (state.connectFailed) {
          setLabel("\uC7AC\uC5F0\uACB0");
          btn.classList.add("btn-failed");
          btn.disabled = false;
          btn.title = "\uB2E4\uC2DC \uC5F0\uACB0\uC744 \uC2DC\uB3C4\uD569\uB2C8\uB2E4";
        } else {
          setLabel("\uC2E0\uD638\uC5F0\uACB0");
          btn.disabled = false;
          btn.title = "\uC544\uB808\uC2A4 \uD0D0\uC0AC\uC120\uACFC \uC5F0\uACB0";
        }
      }
      window.dispatchEvent(new CustomEvent("ares:connection", { detail: { connected } }));
      const iframe = document.getElementById("dashboardFrame");
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: "connection_status",
          connected
        }, "*");
      }
    },
    // 상태 메시지 업데이트 — #status 요소가 사라졌으므로 Logger 로만 흘려보낸다.
    updateStatus(message, _color) {
      if (typeof message === "string" && message.trim()) {
        Logger.add(`[\uC0C1\uD0DC] ${message}`, "info");
      }
    },
    // 대기 중인 응답 promise를 즉시 종료한다(비상정지 등).
    // _sendQueue가 [쓰기+응답대기]를 통째로 직렬화하므로, 이걸 끊어야
    // 뒤이어 보내는 STOP_ALL이 앞 명령의 응답/타임아웃까지 기다리지 않고
    // 곧장 전송된다.
    cancelPendingResponse(reason) {
      if (!state.pendingReject) return;
      if (state.pendingTimeout) clearTimeout(state.pendingTimeout);
      const reject = state.pendingReject;
      const command = state.pendingCommand;
      state.pendingCommand = null;
      state.pendingResolve = null;
      state.pendingReject = null;
      state.pendingTimeout = null;
      reject(new Error(`${reason || "\uCDE8\uC18C\uB428"}: ${command || ""}`));
    },
    // 비상정지는 일반 명령 큐를 기다리면 안 된다. 현재 응답 대기와 멀티 청크
    // 전송을 끊도록 표시한 뒤 STOP_ALL을 우선 전송한다.
    async emergencyStop(command = "STOP_ALL") {
      this._abortCurrentWrite = true;
      this._sendEpoch++;
      this.cancelPendingResponse("\uBE44\uC0C1\uC815\uC9C0");
      this._sendQueue = Promise.resolve();
      try {
        let lastError = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            await this._sendDataNow(command, false, null, { priority: true });
            return;
          } catch (error) {
            lastError = error;
            await this.delay(50);
          }
        }
        throw lastError;
      } finally {
        this._abortCurrentWrite = false;
      }
    },
    // 응답 타임아웃 계산. 펌웨어가 blocking 처리하는 시간지정 명령
    // (SERVO_t*/DC_t*/SLEEP/BATCH/SING)은 동작이 끝난 뒤에야 ack를 보내므로
    // 예상 소요시간을 기본 타임아웃에 더한다. (5초 넘는 이동이 항상
    // 타임아웃되고 늦은 ack가 다음 명령 promise를 오염시키던 문제의 근본 수정)
    _estimateTimeoutMs(command) {
      return BLUETOOTH_CONFIG.RESPONSE_TIMEOUT + this._estimateBlockingMs(command);
    },
    _estimateBlockingMs(command) {
      if (typeof command !== "string") return 0;
      if (command.startsWith("BATCH;")) {
        let total = 0;
        for (const sub of command.slice(6).split("|")) {
          total += this._estimateBlockingMs(sub.trim());
        }
        return total;
      }
      const parts = command.split(",");
      const head = parts[0];
      let sec = 0;
      if (head.startsWith("SERVO_t") || head.startsWith("DC_t") || head === "SLEEP" || head === "tFORWARD" || head === "tBACKWARD" || head === "tLEFT" || head === "tRIGHT") {
        sec = parseFloat(parts[1]) || 0;
      } else if (head === "tDCMOTOR") {
        sec = parseFloat(parts[2]) || 0;
      } else if (head === "BUZZER_ON") {
        sec = parseFloat(parts[2]) || 0;
      } else if (head === "SING") {
        sec = 20;
      }
      return Math.min(Math.max(sec, 0), 120) * 1e3;
    },
    // 데이터 전송
    async sendData(data, waitForResponse = false, timeoutMs = null) {
      const epoch = this._sendEpoch;
      const sendTask = () => {
        if (epoch !== this._sendEpoch) {
          throw new Error("\uBE44\uC0C1\uC815\uC9C0\uB85C \uB300\uAE30 \uC911\uC778 \uC804\uC1A1\uC744 \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4.");
        }
        return this._sendDataNow(data, waitForResponse, timeoutMs, { epoch });
      };
      const queuedSend = this._sendQueue.then(sendTask, sendTask);
      this._sendQueue = queuedSend.catch(() => {
      });
      return queuedSend;
    },
    async _sendDataNow(data, waitForResponse = false, timeoutMs = null, options = {}) {
      var _a, _b;
      if (options.epoch !== void 0 && options.epoch !== this._sendEpoch) {
        throw new Error("\uBE44\uC0C1\uC815\uC9C0\uB85C \uD604\uC7AC \uC804\uC1A1\uC744 \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4.");
      }
      if (this._abortCurrentWrite && !options.priority) {
        throw new Error("\uBE44\uC0C1\uC815\uC9C0\uB85C \uD604\uC7AC \uC804\uC1A1\uC744 \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4.");
      }
      if (!state.characteristic) {
        throw new Error("BLE \uC7A5\uCE58\uC5D0 \uC5F0\uACB0\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      }
      if (!((_b = (_a = state.bluetoothDevice) == null ? void 0 : _a.gatt) == null ? void 0 : _b.connected)) {
        throw new Error("BLE \uC5F0\uACB0\uC774 \uB04A\uC5B4\uC84C\uC2B5\uB2C8\uB2E4.");
      }
      Logger.add(`[\uC804\uC1A1] ${data}`, "send");
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data + "\n");
      state.lastCommand = data;
      let responsePromise = null;
      if (waitForResponse) {
        const timeout = timeoutMs || this._estimateTimeoutMs(data);
        responsePromise = new Promise((resolve, reject) => {
          state.pendingCommand = data;
          state.pendingResolve = resolve;
          state.pendingReject = reject;
          state.pendingTimeout = setTimeout(() => {
            const command = state.pendingCommand;
            state.pendingCommand = null;
            state.pendingResolve = null;
            state.pendingReject = null;
            state.pendingTimeout = null;
            reject(new Error(`\uC751\uB2F5 \uC2DC\uAC04 \uCD08\uACFC: ${command || data}`));
          }, timeout);
        });
      }
      const useWithoutResponse = state.characteristic.properties && state.characteristic.properties.writeWithoutResponse;
      try {
        for (let i = 0; i < encodedData.length; i += BLUETOOTH_CONFIG.MAX_CHUNK_SIZE) {
          if (options.epoch !== void 0 && options.epoch !== this._sendEpoch) {
            throw new Error("\uBE44\uC0C1\uC815\uC9C0\uB85C \uD604\uC7AC \uC804\uC1A1\uC744 \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4.");
          }
          if (this._abortCurrentWrite && !options.priority) {
            throw new Error("\uBE44\uC0C1\uC815\uC9C0\uB85C \uD604\uC7AC \uC804\uC1A1\uC744 \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4.");
          }
          const chunk = encodedData.slice(
            i,
            Math.min(i + BLUETOOTH_CONFIG.MAX_CHUNK_SIZE, encodedData.length)
          );
          if (useWithoutResponse) {
            await state.characteristic.writeValueWithoutResponse(chunk);
          } else {
            await state.characteristic.writeValueWithResponse(chunk);
          }
          if (i + BLUETOOTH_CONFIG.MAX_CHUNK_SIZE < encodedData.length) {
            await this.delay(BLUETOOTH_CONFIG.CHUNK_DELAY);
          }
        }
        if (DEBUG) Logger.add(`\uC804\uC1A1 \uC644\uB8CC: ${data}`, "info");
      } catch (error) {
        if (state.pendingTimeout) clearTimeout(state.pendingTimeout);
        state.pendingCommand = null;
        state.pendingResolve = null;
        state.pendingReject = null;
        state.pendingTimeout = null;
        Logger.add(`[\uC624\uB958] \uC804\uC1A1 \uC2E4\uD328: ${data} - ${error.message}`, "error");
        throw error;
      }
      if (!waitForResponse) {
        return "OK";
      }
      return responsePromise;
    },
    // 딜레이 유틸리티
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  };

  // blocklyconfig.js?v=20260705a
  var BATCH_FORBIDDEN_TYPES = /* @__PURE__ */ new Set([
    // 값 반환
    "check_distance",
    "check_magnetic",
    "pico_check_device",
    // 제어 흐름
    "controls_if",
    "controls_whileUntil",
    "controls_repeat_ext",
    // 변수/함수 (제어 흐름은 Web 측 책임)
    "variables_set",
    "assign_variable",
    "math_change",
    "procedures_callnoreturn",
    "procedures_callreturn",
    "procedures_defnoreturn",
    "procedures_defreturn",
    // 중첩 금지
    "batch_block"
  ]);
  var MODULE_LABEL_CONFIG = {
    wheel: { field: "WHEEL_LABEL", emoji: "\u{1F697}", defaultName: "\uC11C\uBCF4 \uBAA8\uD130" },
    dcmotor: { field: "DCMOTOR_LABEL", emoji: "\u26A1", defaultName: "DC \uBAA8\uD130" },
    leds: { field: "LEDS_LABEL", emoji: "\u{1F4A1}", defaultName: "LED" },
    oled: { field: "OLED_LABEL", emoji: "\u{1F5A5}\uFE0F", defaultName: "\uB514\uC2A4\uD50C\uB808\uC774" },
    buzzer: { field: "BUZZER_LABEL", emoji: "\u{1F50A}", defaultName: "\uC18C\uB9AC" },
    sensors: { field: "SENSORS_LABEL", emoji: "\u{1F4E1}", defaultName: "\uC13C\uC11C" },
    gun: { field: "LABEL", emoji: "\u{1F52B}", defaultName: "\uBC1C\uC0AC" }
  };
  var BlocklyConfig = {
    blocks: [
      // 서보 모터 블록 (동작 #cf3d37)
      {
        type: "timed_forward",
        message0: "%1 \uC804\uC9C4 %2 \uCD08 (\uC18D\uB3C4 %3 %%)",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" },
          { type: "input_value", name: "SECONDS", check: "Number" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uC804\uC9C4\uD569\uB2C8\uB2E4."
      },
      {
        type: "timed_backward",
        message0: "%1 \uD6C4\uC9C4 %2 \uCD08 (\uC18D\uB3C4 %3 %%)",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" },
          { type: "input_value", name: "SECONDS", check: "Number" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uD6C4\uC9C4\uD569\uB2C8\uB2E4."
      },
      {
        type: "timed_left",
        message0: "%1 \uC88C\uD68C\uC804 %2 \uCD08 (\uC18D\uB3C4 %3 %%)",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" },
          { type: "input_value", name: "SECONDS", check: "Number" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uC88C\uD68C\uC804\uD569\uB2C8\uB2E4."
      },
      {
        type: "timed_right",
        message0: "%1 \uC6B0\uD68C\uC804 %2 \uCD08 (\uC18D\uB3C4 %3 %%)",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" },
          { type: "input_value", name: "SECONDS", check: "Number" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uC6B0\uD68C\uC804\uD569\uB2C8\uB2E4."
      },
      {
        type: "move_forward",
        message0: "%1 \uACC4\uC18D \uC804\uC9C4 (\uC18D\uB3C4 %2 %%)",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 \uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uACC4\uC18D \uC804\uC9C4\uD569\uB2C8\uB2E4."
      },
      {
        type: "move_backward",
        message0: "%1 \uACC4\uC18D \uD6C4\uC9C4 (\uC18D\uB3C4 %2 %%)",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 \uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uACC4\uC18D \uD6C4\uC9C4\uD569\uB2C8\uB2E4."
      },
      {
        type: "turn_left",
        message0: "%1 \uACC4\uC18D \uC88C\uD68C\uC804 (\uC18D\uB3C4 %2 %%)",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 \uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uACC4\uC18D \uC88C\uD68C\uC804\uD569\uB2C8\uB2E4."
      },
      {
        type: "turn_right",
        message0: "%1 \uACC4\uC18D \uC6B0\uD68C\uC804 (\uC18D\uB3C4 %2 %%)",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 \uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uACC4\uC18D \uC6B0\uD68C\uC804\uD569\uB2C8\uB2E4."
      },
      {
        type: "stop_moving",
        message0: "%1 \uC815\uC9C0",
        args0: [
          { type: "field_label", name: "WHEEL_LABEL", text: "\u{1F697} \uC11C\uBCF4 \uBAA8\uD130" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB97C \uC989\uC2DC \uC815\uC9C0\uD569\uB2C8\uB2E4."
      },
      // DC 모터 블록 (동작 #cf3d37)
      {
        type: "main_motor_forward_timed",
        message0: "%1 \uC804\uC9C4 %2 \uCD08 (\uC18D\uB3C4 %3 %%)",
        args0: [
          { type: "field_label", name: "DCMOTOR_LABEL", text: "\u26A1 DC \uBAA8\uD130" },
          { type: "input_value", name: "SECONDS", check: "Number" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "DC \uBAA8\uD130\uB97C \uC9C0\uC815\uD55C \uC2DC\uAC04\uB9CC\uD07C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uC804\uC9C4\uC2DC\uD0B5\uB2C8\uB2E4."
      },
      {
        type: "main_motor_backward_timed",
        message0: "%1 \uD6C4\uC9C4 %2 \uCD08 (\uC18D\uB3C4 %3 %%)",
        args0: [
          { type: "field_label", name: "DCMOTOR_LABEL", text: "\u26A1 DC \uBAA8\uD130" },
          { type: "input_value", name: "SECONDS", check: "Number" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "DC \uBAA8\uD130\uB97C \uC9C0\uC815\uD55C \uC2DC\uAC04\uB9CC\uD07C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uD6C4\uC9C4\uC2DC\uD0B5\uB2C8\uB2E4."
      },
      {
        type: "main_motor_forward",
        message0: "%1 \uACC4\uC18D \uC804\uC9C4 (\uC18D\uB3C4 %2 %%)",
        args0: [
          { type: "field_label", name: "DCMOTOR_LABEL", text: "\u26A1 DC \uBAA8\uD130" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 DC \uBAA8\uD130\uB97C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uACC4\uC18D \uC804\uC9C4\uC2DC\uD0B5\uB2C8\uB2E4."
      },
      {
        type: "main_motor_backward",
        message0: "%1 \uACC4\uC18D \uD6C4\uC9C4 (\uC18D\uB3C4 %2 %%)",
        args0: [
          { type: "field_label", name: "DCMOTOR_LABEL", text: "\u26A1 DC \uBAA8\uD130" },
          { type: "input_value", name: "SPEED", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 DC \uBAA8\uD130\uB97C \uC9C0\uC815\uD55C \uC18D\uB3C4(0~100%)\uB85C \uACC4\uC18D \uD6C4\uC9C4\uC2DC\uD0B5\uB2C8\uB2E4."
      },
      {
        type: "main_motor_stop",
        message0: "%1 \uC815\uC9C0",
        args0: [
          { type: "field_label", name: "DCMOTOR_LABEL", text: "\u26A1 DC \uBAA8\uD130" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#cf3d37",
        tooltip: "DC \uBAA8\uD130\uB97C \uC989\uC2DC \uC815\uC9C0\uD569\uB2C8\uB2E4."
      },
      // LED 블록 (출력 #d68fa5)
      {
        type: "set_lamp",
        message0: "%1 \uC804\uCCB4 \uC124\uC815 [ %2 %3 %4 %5 %6 %7 ]",
        args0: [
          { type: "field_label", name: "LEDS_LABEL", text: "\u{1F4A1} LED" },
          { type: "input_value", name: "LAMP0", check: "Number" },
          { type: "input_value", name: "LAMP1", check: "Number" },
          { type: "input_value", name: "LAMP2", check: "Number" },
          { type: "input_value", name: "LAMP3", check: "Number" },
          { type: "input_value", name: "LAMP4", check: "Number" },
          { type: "input_value", name: "LAMP5", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "6\uAC1C LED \uBC1D\uAE30\uB97C \uD55C\uBC88\uC5D0 \uC124\uC815\uD569\uB2C8\uB2E4. \uAC12: 0(\uB054)~1(\uCD5C\uB300 \uBC1D\uAE30)"
      },
      {
        type: "led_on",
        message0: "%1 %2 \uBC88 \uCF1C\uAE30 (\uBC1D\uAE30 %3 )",
        args0: [
          { type: "field_label", name: "LEDS_LABEL", text: "\u{1F4A1} LED" },
          { type: "input_value", name: "LED_NUM", check: "Number" },
          { type: "input_value", name: "BRIGHTNESS", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "\uD2B9\uC815 LED(0~5\uBC88)\uB97C \uC9C0\uC815\uD55C \uBC1D\uAE30\uB85C \uCF2D\uB2C8\uB2E4. \uBC88\uD638\uC5D0 \uC22B\uC790\xB7\uBCC0\uC218\xB7\uACC4\uC0B0\uC2DD\uC744 \uAF42\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uBC1D\uAE30: 0~1"
      },
      {
        type: "led_off",
        message0: "%1 %2 \uBC88 \uB044\uAE30",
        args0: [
          { type: "field_label", name: "LEDS_LABEL", text: "\u{1F4A1} LED" },
          { type: "input_value", name: "LED_NUM", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "\uD2B9\uC815 LED(0~5\uBC88)\uB97C \uB055\uB2C8\uB2E4. \uBC88\uD638\uC5D0 \uC22B\uC790\xB7\uBCC0\uC218\xB7\uACC4\uC0B0\uC2DD\uC744 \uAF42\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
      },
      {
        type: "led_off_all",
        message0: "%1 \uC804\uCCB4 \uB044\uAE30",
        args0: [
          { type: "field_label", name: "LEDS_LABEL", text: "\u{1F4A1} LED" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "\uBAA8\uB4E0 LED\uB97C \uD55C\uBC88\uC5D0 \uB055\uB2C8\uB2E4."
      },
      // 디스플레이 블록 (출력 #d68fa5)
      {
        type: "send_message",
        message0: "%1\uC5D0 \uD45C\uC2DC: %2",
        args0: [
          { type: "field_label", name: "OLED_LABEL", text: "\u{1F5A5}\uFE0F \uB514\uC2A4\uD50C\uB808\uC774" },
          { type: "input_value", name: "Msg", check: "String" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "OLED \uB514\uC2A4\uD50C\uB808\uC774\uC5D0 \uD14D\uC2A4\uD2B8\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4."
      },
      {
        type: "clear_display",
        message0: "%1 \uC9C0\uC6B0\uAE30",
        args0: [
          { type: "field_label", name: "OLED_LABEL", text: "\u{1F5A5}\uFE0F \uB514\uC2A4\uD50C\uB808\uC774" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "OLED \uB514\uC2A4\uD50C\uB808\uC774 \uD654\uBA74\uC744 \uAE68\uB057\uD558\uAC8C \uC9C0\uC6C1\uB2C8\uB2E4."
      },
      {
        type: "clear_rect",
        message0: "%1 \uC601\uC5ED \uC9C0\uC6B0\uAE30 (x: %2, y: %3, \uD3ED: %4, \uB192\uC774: %5)",
        args0: [
          { type: "field_label", name: "OLED_LABEL", text: "\u{1F5A5}\uFE0F \uB514\uC2A4\uD50C\uB808\uC774" },
          { type: "input_value", name: "X", check: "Number" },
          { type: "input_value", name: "Y", check: "Number" },
          { type: "input_value", name: "W", check: "Number" },
          { type: "input_value", name: "H", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "OLED \uD654\uBA74\uC5D0\uC11C \uC9C0\uC815\uD55C \uC0AC\uAC01 \uC601\uC5ED\uB9CC \uC9C0\uC6C1\uB2C8\uB2E4. \uAE30\uBCF8 32\xD732 (\uC544\uC774\uCF58 \uD06C\uAE30)."
      },
      {
        type: "send_message_xy",
        message0: "%1 (x: %2, y: %3) \uC5D0 \uD45C\uC2DC: %4",
        args0: [
          { type: "field_label", name: "OLED_LABEL", text: "\u{1F5A5}\uFE0F \uB514\uC2A4\uD50C\uB808\uC774" },
          { type: "input_value", name: "X", check: "Number" },
          { type: "input_value", name: "Y", check: "Number" },
          { type: "input_value", name: "Msg", check: "String" }
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "OLED \uD654\uBA74\uC758 (x, y) \uC88C\uD45C\uC5D0 \uD14D\uC2A4\uD2B8\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uD654\uBA74\uC744 \uC9C0\uC6B0\uC9C0 \uC54A\uC73C\uBBC0\uB85C \uC5EC\uB7EC \uC904\uC744 \uC313\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
      },
      {
        type: "display_icon",
        message0: "%1 \uC544\uC774\uCF58 %2 \uC744(\uB97C) (x: %3, y: %4) \uC5D0 \uD45C\uC2DC",
        args0: [
          { type: "field_label", name: "OLED_LABEL", text: "\u{1F5A5}\uFE0F \uB514\uC2A4\uD50C\uB808\uC774" },
          {
            type: "field_dropdown",
            name: "ICON",
            options: [
              ["\u{1F916} \uB85C\uBD07", "rover"],
              ["\u{1F680} \uD654\uC131\uD0D0\uC0AC\uC120", "mars"],
              ["\u{1F441}\uFE0F \uB72C \uB208", "open_eye"],
              ["\u{1F60C} \uAC10\uC740 \uB208", "closed_eye"]
            ]
          },
          { type: "input_value", name: "X", check: "Number" },
          { type: "input_value", name: "Y", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "OLED \uD654\uBA74\uC758 (x, y) \uC88C\uD45C\uC5D0 32\xD732 \uC544\uC774\uCF58\uC744 \uADF8\uB9BD\uB2C8\uB2E4."
      },
      // 소리 블록 (출력 #d68fa5)
      {
        type: "buzzer_on",
        message0: "%1 %2 Hz\uB85C %3 \uCD08 \uC6B8\uB9AC\uAE30",
        args0: [
          { type: "field_label", name: "BUZZER_LABEL", text: "\u{1F50A} \uC18C\uB9AC" },
          { type: "input_value", name: "FREQ", check: "Number" },
          { type: "input_value", name: "DURATION", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "\uC9C0\uC815\uD55C \uC8FC\uD30C\uC218(Hz)\uC640 \uC2DC\uAC04(\uCD08)\uC73C\uB85C \uBD80\uC800\uB97C \uC6B8\uB9BD\uB2C8\uB2E4. \uC608: 262Hz=\uB3C4, 392Hz=\uC194"
      },
      {
        type: "buzzer_note",
        message0: "%1 \uACC4\uBA85 %2 \uB85C %3 \uCD08 \uC6B8\uB9AC\uAE30",
        args0: [
          { type: "field_label", name: "BUZZER_LABEL", text: "\u{1F50A} \uC18C\uB9AC" },
          { type: "field_dropdown", name: "NOTE", options: [
            // 낮은 옥타브 (C3 ~ B3)
            ["\uB3C4(\u2193)", "131"],
            ["\uB808(\u2193)", "147"],
            ["\uBBF8(\u2193)", "165"],
            ["\uD30C(\u2193)", "175"],
            ["\uC194(\u2193)", "196"],
            ["\uB77C(\u2193)", "220"],
            ["\uC2DC(\u2193)", "247"],
            // 가운데 옥타브 (C4 ~ B4)
            ["\uB3C4", "262"],
            ["\uB808", "294"],
            ["\uBBF8", "330"],
            ["\uD30C", "349"],
            ["\uC194", "392"],
            ["\uB77C", "440"],
            ["\uC2DC", "494"],
            // 높은 옥타브 (C5 ~ B5)
            ["\uB3C4(\u2191)", "523"],
            ["\uB808(\u2191)", "587"],
            ["\uBBF8(\u2191)", "659"],
            ["\uD30C(\u2191)", "698"],
            ["\uC194(\u2191)", "784"],
            ["\uB77C(\u2191)", "880"],
            ["\uC2DC(\u2191)", "988"]
          ] },
          { type: "input_value", name: "DURATION", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#d68fa5",
        tooltip: "\uC120\uD0DD\uD55C \uACC4\uBA85\uC5D0 \uD574\uB2F9\uD558\uB294 \uC8FC\uD30C\uC218\uB85C \uBD80\uC800\uB97C \uC6B8\uB9BD\uB2C8\uB2E4. \uC138 \uC625\uD0C0\uBE0C \uC9C0\uC6D0 \u2014 (\u2193)\uB0AE\uC740 \uC625\uD0C0\uBE0C / \uAE30\uBCF8 \uAC00\uC6B4\uB370 / (\u2191)\uB192\uC740 \uC625\uD0C0\uBE0C. \uAC00\uC6B4\uB370 \uB3C4=262 Hz, \uB77C=440 Hz."
      },
      // 발사 블록 (발사 #dcc342)
      {
        type: "gun_fire",
        message0: "%1",
        args0: [
          {
            type: "field_label",
            name: "LABEL",
            text: "\u{1F52B} \uBC1C\uC0AC \uC2E4\uD589"
          }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#dcc342",
        tooltip: "BB\uD0C4\uC744 \uD55C \uBC1C \uBC1C\uC0AC\uD569\uB2C8\uB2E4."
      },
      // 센서 블록 (감지 #7daa4d)
      {
        type: "pico_check_device",
        message0: "%1 \uC5F0\uACB0 \uD655\uC778",
        args0: [
          { type: "field_label", name: "SENSORS_LABEL", text: "\u{1F4E1} \uC13C\uC11C" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#7daa4d",
        tooltip: "Pico\uC640 \uBE14\uB8E8\uD22C\uC2A4 \uC5F0\uACB0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD569\uB2C8\uB2E4. \uC5F0\uACB0\uB418\uBA74 \uD654\uBA74\uC5D0 'CONNECTED' \uD45C\uC2DC."
      },
      {
        type: "check_distance",
        message0: "%1 \uAC70\uB9AC \uCE21\uC815 \u2192 %2",
        args0: [
          { type: "field_label", name: "SENSORS_LABEL", text: "\u{1F4E1} \uC13C\uC11C" },
          { type: "field_variable", name: "VAR", variable: "\uAC70\uB9AC\uAC12" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#7daa4d",
        tooltip: "\uCD08\uC74C\uD30C \uC13C\uC11C\uB85C \uC804\uBC29 \uBB3C\uCCB4\uAE4C\uC9C0 \uAC70\uB9AC(cm)\uB97C \uCE21\uC815\uD558\uC5EC \uBCC0\uC218\uC5D0 \uC800\uC7A5\uD569\uB2C8\uB2E4."
      },
      {
        type: "check_magnetic",
        message0: "%1 \uC790\uAE30\uC7A5 \uAC10\uC9C0 \u2192 %2",
        args0: [
          { type: "field_label", name: "SENSORS_LABEL", text: "\u{1F4E1} \uC13C\uC11C" },
          { type: "field_variable", name: "VAR", variable: "\uC790\uAE30\uAC12" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#7daa4d",
        tooltip: "\uC790\uAE30\uC7A5 \uC13C\uC11C\uB85C \uC790\uC11D \uAC10\uC9C0 \uC5EC\uBD80(0=\uC5C6\uC74C, 1=\uAC10\uC9C0)\uB97C \uBCC0\uC218\uC5D0 \uC800\uC7A5\uD569\uB2C8\uB2E4."
      },
      // 시간 블록 (제어 #7954B5)
      {
        type: "time_sleep",
        message0: "\u23F1\uFE0F \uAE30\uB2E4\uB9AC\uAE30 %1 \uCD08",
        args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#7954B5",
        tooltip: "\uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uB2E4\uC74C \uBA85\uB839 \uC2E4\uD589\uC744 \uB300\uAE30\uD569\uB2C8\uB2E4."
      },
      // 수학 블록 (Blockly 기본 색상 230)
      {
        type: "math_arithmetic",
        message0: "%1 %2 %3",
        args0: [
          { type: "input_value", name: "A", check: "Number" },
          { type: "field_dropdown", name: "OP", options: [
            ["+", "ADD"],
            ["-", "MINUS"],
            ["\xD7", "MULTIPLY"],
            ["\xF7", "DIVIDE"]
          ] },
          { type: "input_value", name: "B", check: "Number" }
        ],
        inputsInline: true,
        output: "Number",
        colour: "#cacacb",
        tooltip: "\uB450 \uC22B\uC790\uB97C \uC0AC\uCE59\uC5F0\uC0B0\uD569\uB2C8\uB2E4. (+\uB367\uC148, -\uBE84\uC148, \xD7\uACF1\uC148, \xF7\uB098\uB217\uC148)"
      },
      {
        type: "math_random_int",
        message0: "\uB79C\uB364 %1 ~ %2",
        args0: [
          { type: "input_value", name: "FROM", check: "Number" },
          { type: "input_value", name: "TO", check: "Number" }
        ],
        inputsInline: true,
        output: "Number",
        colour: "#cacacb",
        tooltip: "\uC9C0\uC815\uD55C \uBC94\uC704 \uB0B4\uC5D0\uC11C \uBB34\uC791\uC704 \uC815\uC218\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4."
      },
      // 묶음 실행 (제어 #7954B5)
      {
        type: "batch_block",
        message0: "\u{1F680} \uD55C\uAEBC\uBC88\uC5D0 \uC2E4\uD589 %1 %2",
        args0: [
          { type: "input_dummy" },
          { type: "input_statement", name: "DO" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#7954B5",
        tooltip: "\uC548\uC5D0 \uB2F4\uC740 \uBE14\uB85D\uB4E4\uC744 \uD55C \uBB36\uC74C\uC73C\uB85C Pico\uC5D0 \uBCF4\uB0B4 \uBE60\uB974\uAC8C \uCC28\uB840 \uC2E4\uD589\uD569\uB2C8\uB2E4. \uC13C\uC11C\uAC12\uC744 \uBC1B\uB294 \uBE14\uB85D\uACFC \uC81C\uC5B4/\uBC18\uBCF5 \uBE14\uB85D\uC740 \uC548\uC5D0 \uB123\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
      }
    ]
  };
  function attachBatchBlockValidator(BlocklyLib) {
    const proto = BlocklyLib.Blocks["batch_block"];
    if (!proto) return;
    const originalInit = proto.init;
    proto.init = function() {
      originalInit.call(this);
      this.setOnChange((event) => {
        if (!this.workspace || this.isInFlyout) return;
        let bad = null;
        let cur = this.getInputTargetBlock("DO");
        while (cur) {
          if (BATCH_FORBIDDEN_TYPES.has(cur.type)) {
            bad = cur.type;
            break;
          }
          cur = cur.getNextBlock();
        }
        this.setWarningText(bad ? `'${bad}' \uBE14\uB85D\uC740 [\uD55C\uAEBC\uBC88\uC5D0 \uC2E4\uD589] \uC548\uC5D0 \uB123\uC744 \uC218 \uC5C6\uC5B4\uC694. \uBC14\uAE65\uC73C\uB85C \uBE7C\uC8FC\uC138\uC694.` : null);
      });
    };
  }
  function getModuleBlockLabel(blockNames, activeModel, moduleName) {
    const cfg = MODULE_LABEL_CONFIG[moduleName];
    if (!cfg) return "";
    const emoji = moduleName === "gun" && activeModel === "launchpad" ? "\u{1F680}" : cfg.emoji;
    const name = (blockNames == null ? void 0 : blockNames[moduleName]) || cfg.defaultName;
    return `${emoji} ${name}`;
  }
  function updateDynamicLabelFields(block, state2) {
    for (const [moduleName, cfg] of Object.entries(MODULE_LABEL_CONFIG)) {
      const labelField = block.getField(cfg.field);
      if (labelField) {
        const label = moduleName === "gun" ? getGunBlockLabel(state2 == null ? void 0 : state2.blockNames, state2 == null ? void 0 : state2.activeModel) : getModuleBlockLabel(state2 == null ? void 0 : state2.blockNames, state2 == null ? void 0 : state2.activeModel, moduleName);
        labelField.setValue(label);
      }
    }
  }
  function attachDynamicNaming(BlocklyLib, state2) {
    BlocklyConfig.blocks.forEach((blockDef) => {
      const proto = BlocklyLib.Blocks[blockDef.type];
      if (!proto || proto.__aresDynamicNamingAttached) return;
      const originalInit = proto.init;
      proto.init = function() {
        originalInit.call(this);
        updateDynamicLabelFields(this, state2);
        if (this.type === "gun_fire") {
          this.setTooltip(() => getGunBlockTooltip(state2.blockNames, state2.activeModel));
        }
      };
      proto.__aresDynamicNamingAttached = true;
    });
  }
  function getGunBlockLabel(blockNames, activeModel) {
    return `${getModuleBlockLabel(blockNames, activeModel, "gun")} \uC2E4\uD589`;
  }
  function getGunBlockTooltip(blockNames, activeModel) {
    const name = (blockNames == null ? void 0 : blockNames.gun) || "\uBC1C\uC0AC";
    if (activeModel === "launchpad") {
      return `${name}\uB97C \uC2E4\uD589\uD569\uB2C8\uB2E4.`;
    }
    return `BB\uD0C4\uC744 \uD55C \uBC1C \uBC1C\uC0AC\uD569\uB2C8\uB2E4.`;
  }
  function updateWorkspaceBlocks(workspace2, state2) {
    if (!workspace2) return;
    const blocks = workspace2.getAllBlocks(false);
    blocks.forEach((block) => {
      updateDynamicLabelFields(block, state2);
    });
  }

  // blocklyconfig.js
  var BATCH_FORBIDDEN_TYPES2 = /* @__PURE__ */ new Set([
    // 값 반환
    "check_distance",
    "check_magnetic",
    "pico_check_device",
    // 제어 흐름
    "controls_if",
    "controls_whileUntil",
    "controls_repeat_ext",
    // 변수/함수 (제어 흐름은 Web 측 책임)
    "variables_set",
    "assign_variable",
    "math_change",
    "procedures_callnoreturn",
    "procedures_callreturn",
    "procedures_defnoreturn",
    "procedures_defreturn",
    // 중첩 금지
    "batch_block"
  ]);

  // romanize.js
  var CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
  var JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
  var JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
  function romanizeKorean(input) {
    if (input == null) return "";
    let out = "";
    for (const ch of String(input)) {
      const code = ch.codePointAt(0);
      if (code >= 44032 && code <= 55203) {
        const s = code - 44032;
        const cho = Math.floor(s / 588);
        const jung = Math.floor(s % 588 / 28);
        const jong = s % 28;
        out += CHO[cho] + JUNG[jung] + JONG[jong];
      } else if (code <= 127) {
        out += ch;
      }
    }
    return out;
  }
  function hasKorean(input) {
    return /[가-힣ㄱ-ㅣ]/.test(String(input || ""));
  }

  // commandexecutor.js
  var CommandExecutor = {
    // 응답 대기(ack)가 불필요한 명령 — Pico가 즉시 처리하고 응답을 보내지 않는다.
    // (Pico/main.py의 NO_RESPONSE_CMDS와 반드시 동기화할 것.)
    // BUZZER_ON: 펌웨어가 논블로킹으로 음을 '시작만' 하고 즉시 반환하므로 ack 불필요.
    //   음 길이만큼의 페이싱(멜로디 겹침 방지)은 handleLogicBlock에서 웹이 로컬로 처리.
    // 주의: 값 반환 명령(DISTANCE/MAGNET/PING)과 펌웨어가 여전히 blocking 처리하는
    //   SERVO_t*/DC_t*/SLEEP/BATCH/SING은 이 집합에 넣지 말 것(응답 대기 필요).
    // 마지막 그룹(STOP_ALL~CALIB_SET)은 대시보드/비상정지 경로 전용 명령 —
    // 블록 실행기는 생성하지 않지만 펌웨어 NO_RESPONSE_CMDS와의 동기화를 위해 등재.
    FIRE_AND_FORGET_HEADS: /* @__PURE__ */ new Set([
      "LED_ON",
      "LED_OFF",
      "MSG",
      "MSG_XY",
      "ICON",
      "CLEAR_DISPLAY",
      "CLEAR_RECT",
      "SERVO_FORWARD",
      "SERVO_BACKWARD",
      "SERVO_LEFT",
      "SERVO_RIGHT",
      "SERVO_STOP",
      "DC_FORWARD",
      "DC_BACKWARD",
      "DC_STOP",
      "GUN_FIRE",
      "BUZZER_ON",
      "STOP_ALL",
      "STOP",
      "tFORWARD",
      "tBACKWARD",
      "tLEFT",
      "tRIGHT",
      "LED_PATTERN",
      "SING",
      "SYS_SET",
      "CALIB_START",
      "CALIB_SET"
    ]),
    _isFireAndForget(command) {
      if (command.startsWith("[")) return true;
      const head = command.split(",")[0];
      return this.FIRE_AND_FORGET_HEADS.has(head);
    },
    // 전송 경로 추상화: 시뮬레이션 중(simSink 설정)에는 실제 BLE 대신
    // sink 로 명령을 흘려보낸다. sink(command, waitForResponse) 는 회신을
    // 흉내내고 가짜 응답을 반환한다. 평소(simSink=null)에는 실제 BLE 송신.
    // 실제 BLE 는 수신 알림에서 _updateBlocklyVariable 가 DIST/MAG 를 변수에 반영하지만,
    // 시뮬레이션은 그 경로가 없으므로 sink 응답을 여기서 직접 파싱해 동일하게 반영한다.
    simSink: null,
    async _dispatch(command, waitForResponse) {
      if (this.simSink) {
        const reply = await this.simSink(command, waitForResponse);
        this._parseSensorReply(reply);
        return reply;
      }
      return BluetoothManager.sendData(command, waitForResponse);
    },
    // sink/BLE 응답 문자열에서 거리(DIST)·자기(MAG) 값을 추출해 Blockly 변수에 저장.
    // (bluetooth.js 의 _updateBlocklyVariable 와 동일 규칙 — 시뮬레이션용)
    _parseSensorReply(data) {
      if (typeof data !== "string") return;
      const distMatch = data.match(/DIST[:\s]*([\d.]+)/i);
      if (distMatch) state.variables["_last_distance"] = distMatch[1];
      const magMatch = data.match(/MAG[:\s]*([\d]+)/i);
      if (magMatch) state.variables["_last_magnetic"] = magMatch[1];
    },
    // 시간지정 이동/대기의 초 입력 상한 (펌웨어 MAX_TIMED_SEC와 동기화).
    // 펌웨어가 blocking 처리하므로 과도한 값은 비상정지 지연·타임아웃을 유발한다.
    MAX_TIMED_SEC: 60,
    _clampSeconds(raw) {
      const sec = parseFloat(raw);
      if (!isFinite(sec) || sec < 0) return "0";
      return String(Math.min(sec, this.MAX_TIMED_SEC));
    },
    evaluateValueBlock(block) {
      var _a;
      if (!block) return "0";
      if (block.type === "math_number") {
        return block.getFieldValue("NUM") || "0";
      } else if (block.type === "text") {
        return block.getFieldValue("TEXT") || "";
      } else if (block.type === "variables_get") {
        const varId2 = block.getFieldValue("VAR");
        const varName = ((_a = block.workspace.getVariableById(varId2)) == null ? void 0 : _a.name) || "unknown";
        const value = state.variables[varName] || "0";
        if (DEBUG) Logger.add(`\uBCC0\uC218 ${varName} \uAC12: ${value}`, "info");
        return value;
      } else if (block.type === "math_arithmetic") {
        const op = block.getFieldValue("OP");
        const a = this.evaluateValueBlock(block.getInputTargetBlock("A"));
        const b = this.evaluateValueBlock(block.getInputTargetBlock("B"));
        let result = "0";
        try {
          switch (op) {
            case "ADD":
              result = (parseFloat(a) + parseFloat(b)).toString();
              break;
            case "MINUS":
              result = (parseFloat(a) - parseFloat(b)).toString();
              break;
            case "MULTIPLY":
              result = (parseFloat(a) * parseFloat(b)).toString();
              break;
            case "DIVIDE":
              result = parseFloat(b) !== 0 ? (parseFloat(a) / parseFloat(b)).toString() : "0";
              break;
            default:
              result = "0";
          }
          return result;
        } catch (e) {
          return "0";
        }
      } else if (block.type === "logic_compare") {
        const op = block.getFieldValue("OP");
        const a = this.evaluateValueBlock(block.getInputTargetBlock("A"));
        const b = this.evaluateValueBlock(block.getInputTargetBlock("B"));
        let result = false;
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        const isNum = !isNaN(numA) && !isNaN(numB) && String(a).trim() !== "" && String(b).trim() !== "";
        switch (op) {
          case "EQ":
            result = isNum ? numA === numB : a === b;
            break;
          case "NEQ":
            result = isNum ? numA !== numB : a !== b;
            break;
          case "LT":
            result = (isNum ? numA : a) < (isNum ? numB : b);
            break;
          case "LTE":
            result = (isNum ? numA : a) <= (isNum ? numB : b);
            break;
          case "GT":
            result = (isNum ? numA : a) > (isNum ? numB : b);
            break;
          case "GTE":
            result = (isNum ? numA : a) >= (isNum ? numB : b);
            break;
        }
        return result ? "true" : "false";
      } else if (block.type === "logic_operation") {
        const op = block.getFieldValue("OP");
        const a = this.evaluateValueBlock(block.getInputTargetBlock("A")) === "true";
        const b = this.evaluateValueBlock(block.getInputTargetBlock("B")) === "true";
        const result = op === "AND" ? a && b : a || b;
        return result ? "true" : "false";
      } else if (block.type === "logic_negate") {
        const v = this.evaluateValueBlock(block.getInputTargetBlock("BOOL"));
        return v === "true" ? "false" : "true";
      } else if (block.type === "logic_boolean") {
        return block.getFieldValue("BOOL") === "TRUE" ? "true" : "false";
      } else if (block.type === "math_random_int") {
        const from = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("FROM"))) || 0;
        const to = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("TO"))) || 100;
        const min = Math.min(from, to);
        const max = Math.max(from, to);
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        return result.toString();
      } else if (block.type === "procedures_callreturn") {
        if (this._funcResults.has(block.id)) {
          return this._funcResults.get(block.id);
        }
        const funcName = block.getFieldValue("NAME");
        const defBlock = this._findProcedureDefinition(block.workspace, funcName, true);
        if (defBlock) {
          const argNames = defBlock.arguments_ || [];
          for (let i = 0; i < argNames.length; i++) {
            const argBlock = block.getInputTargetBlock("ARG" + i);
            if (argBlock) {
              state.variables[argNames[i]] = this.evaluateValueBlock(argBlock);
            }
          }
          const returnBlock = defBlock.getInputTargetBlock("RETURN");
          if (returnBlock) {
            return this.evaluateValueBlock(returnBlock);
          }
        }
        return "0";
      } else {
        return Blockly.Python.valueToCode(block, "", Blockly.Python.ORDER_ATOMIC) || "0";
      }
    },
    // ----- 반환값 함수 호출의 비동기 사전 해석 -----
    // evaluateValueBlock은 동기 함수라 함수 본문(STACK — 명령 전송 필요)을 직접
    // 실행할 수 없다. 값 평가 전에 여기서 트리 안의 procedures_callreturn을 찾아
    // 본문을 실행하고 반환값을 블록 id로 캐시한다(재평가 시 덮어씀).
    _funcResults: /* @__PURE__ */ new Map(),
    _funcCallDepth: 0,
    MAX_FUNC_CALL_DEPTH: 16,
    _valueInputs(block) {
      const VALUE = Blockly.inputs && Blockly.inputs.inputTypes && Blockly.inputs.inputTypes.VALUE || Blockly.inputTypes && Blockly.inputTypes.VALUE || 1;
      return (block.inputList || []).filter((input) => input.type === VALUE);
    },
    async _resolveFunctionCalls(block) {
      if (!block || !state.isExecuting) return;
      if (block.type === "procedures_callreturn") {
        await this._executeFunctionCall(block);
        return;
      }
      for (const input of this._valueInputs(block)) {
        const target = input.connection && input.connection.targetBlock();
        if (target) await this._resolveFunctionCalls(target);
      }
    },
    async _executeFunctionCall(callBlock) {
      for (const input of this._valueInputs(callBlock)) {
        const target = input.connection && input.connection.targetBlock();
        if (target) await this._resolveFunctionCalls(target);
      }
      const funcName = callBlock.getFieldValue("NAME");
      const defBlock = this._findProcedureDefinition(callBlock.workspace, funcName, true);
      if (!defBlock) {
        Logger.add(`[\uC624\uB958] \uD568\uC218 \uCC3E\uC744 \uC218 \uC5C6\uC74C: ${funcName}`, "error");
        this._funcResults.set(callBlock.id, "0");
        return;
      }
      if (this._funcCallDepth >= this.MAX_FUNC_CALL_DEPTH) {
        Logger.add(`[\uC624\uB958] \uD568\uC218 \uD638\uCD9C\uC774 \uB108\uBB34 \uAE4A\uC2B5\uB2C8\uB2E4(\uC7AC\uADC0 ${this.MAX_FUNC_CALL_DEPTH}\uB2E8\uACC4 \uCD08\uACFC): ${funcName}`, "error");
        this._funcResults.set(callBlock.id, "0");
        return;
      }
      this._funcCallDepth++;
      try {
        await this._setupProcedureArgs(callBlock, defBlock);
        await this.processBlock(defBlock.getInputTargetBlock("STACK"));
        const returnBlock = defBlock.getInputTargetBlock("RETURN");
        let value = "0";
        if (returnBlock) {
          await this._resolveFunctionCalls(returnBlock);
          value = this.evaluateValueBlock(returnBlock);
        }
        this._funcResults.set(callBlock.id, value);
      } finally {
        this._funcCallDepth--;
      }
    },
    async processBlock(block) {
      if (!block) return;
      if (!state.isExecuting) return;
      if (block.type === "batch_block") {
        await this._processBatch(block);
        await this.processBlock(block.getNextBlock());
        return;
      }
      await this._resolveFunctionCalls(block);
      const command = this.generateCommand(block);
      if (command) {
        await this.sendCommand(command);
      }
      await this.handleLogicBlock(block);
      await this.processBlock(block.getNextBlock());
    },
    async _processBatch(block) {
      const commands = [];
      let cur = block.getInputTargetBlock("DO");
      while (cur) {
        if (BATCH_FORBIDDEN_TYPES2.has(cur.type)) {
          Logger.add(`[\uC624\uB958] '${cur.type}' \uBE14\uB85D\uC740 [\uD55C\uAEBC\uBC88\uC5D0 \uC2E4\uD589] \uC548\uC5D0 \uB123\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uBC14\uAE65\uC73C\uB85C \uBE7C\uC8FC\uC138\uC694.`, "error");
          state.isExecuting = false;
          return;
        }
        await this._resolveFunctionCalls(cur);
        const cmd = this.generateCommand(cur);
        if (cmd) commands.push(cmd);
        cur = cur.getNextBlock();
      }
      if (commands.length === 0) {
        if (DEBUG) Logger.add("[\uBB36\uC74C] \uBE44\uC5B4 \uC788\uC5B4 \uAC74\uB108\uB700", "info");
        return;
      }
      const payload = `BATCH;${commands.join("|")}`;
      if (!this.simSink) BluetoothManager.updateStatus("\uBB36\uC74C \uC2E4\uD589 \uC911...", STATUS_COLORS.ORANGE);
      try {
        await this._dispatch(payload, true);
        if (DEBUG) Logger.add(`[\uBB36\uC74C \uC644\uB8CC] ${commands.length}\uAC1C \uBA85\uB839`, "info");
      } catch (error) {
        Logger.add(`[\uC624\uB958] \uBB36\uC74C \uC2E4\uD589 \uC2E4\uD328: ${error.message}`, "error");
        if (error.message.includes("\uC5F0\uACB0") || error.message.includes("BLE")) {
          state.isExecuting = false;
          throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
    generateCommand(block) {
      switch (block.type) {
        case "set_lamp": {
          const lamps = [0, 1, 2, 3, 4, 5].map(
            (i) => parseFloat(this.evaluateValueBlock(block.getInputTargetBlock(`LAMP${i}`)) || "0").toFixed(1)
          );
          return `[${lamps.join(" ")}]`;
        }
        case "led_on": {
          const ledNum = Math.max(0, Math.min(5, parseInt(this.evaluateValueBlock(block.getInputTargetBlock("LED_NUM")), 10) || 0));
          const brightness = this.evaluateValueBlock(block.getInputTargetBlock("BRIGHTNESS")) || "1";
          return `LED_ON,${ledNum},${brightness}`;
        }
        case "led_off": {
          const ledNum = Math.max(0, Math.min(5, parseInt(this.evaluateValueBlock(block.getInputTargetBlock("LED_NUM")), 10) || 0));
          return `LED_OFF,${ledNum}`;
        }
        case "led_off_all":
          return "LED_OFF,ALL";
        case "send_message": {
          const str = romanizeKorean(String(this.evaluateValueBlock(block.getInputTargetBlock("Msg")) || "Hello"));
          return `MSG,${str}`;
        }
        case "send_message_xy": {
          const x = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("X")) || "0", 10) || 0;
          const y = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("Y")) || "0", 10) || 0;
          const str = romanizeKorean(String(this.evaluateValueBlock(block.getInputTargetBlock("Msg")) || "Hello"));
          return `MSG_XY,${x},${y},${str}`;
        }
        case "display_icon": {
          const name = block.getFieldValue("ICON") || "rover";
          const x = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("X")) || "0", 10) || 0;
          const y = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("Y")) || "0", 10) || 0;
          return `ICON,${name},${x},${y}`;
        }
        case "clear_display":
          return "CLEAR_DISPLAY";
        case "clear_rect": {
          const x = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("X")) || "0", 10) || 0;
          const y = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("Y")) || "0", 10) || 0;
          const w = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("W")) || "32", 10) || 32;
          const h = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("H")) || "32", 10) || 32;
          return `CLEAR_RECT,${x},${y},${w},${h}`;
        }
        case "buzzer_on": {
          const freq = Math.trunc(parseFloat(this.evaluateValueBlock(block.getInputTargetBlock("FREQ")) || "262"));
          const duration = this.evaluateValueBlock(block.getInputTargetBlock("DURATION")) || "1";
          return `BUZZER_ON,${freq},${duration}`;
        }
        case "buzzer_note": {
          const freq = parseInt(block.getFieldValue("NOTE"), 10) || 262;
          const duration = this.evaluateValueBlock(block.getInputTargetBlock("DURATION")) || "1";
          return `BUZZER_ON,${freq},${duration}`;
        }
        case "gun_fire":
          return "GUN_FIRE";
        // 서보 모터 (시간 제한) - SERVO_t방향,초,속도
        case "timed_forward": {
          const seconds2 = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0");
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `SERVO_tFORWARD,${seconds2},${speed}`;
        }
        case "timed_backward": {
          const seconds2 = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0");
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `SERVO_tBACKWARD,${seconds2},${speed}`;
        }
        case "timed_right": {
          const seconds2 = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0");
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `SERVO_tRIGHT,${seconds2},${speed}`;
        }
        case "timed_left": {
          const seconds2 = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0");
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `SERVO_tLEFT,${seconds2},${speed}`;
        }
        // 서보 모터 (연속) - SERVO_방향,속도
        case "move_forward": {
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `SERVO_FORWARD,${speed}`;
        }
        case "move_backward": {
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `SERVO_BACKWARD,${speed}`;
        }
        case "turn_left": {
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `SERVO_LEFT,${speed}`;
        }
        case "turn_right": {
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `SERVO_RIGHT,${speed}`;
        }
        case "stop_moving":
          return "SERVO_STOP";
        // DC 모터 (시간 제한) - DC_t방향,초,속도
        case "main_motor_forward_timed": {
          const seconds2 = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "1");
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `DC_tFORWARD,${seconds2},${speed}`;
        }
        case "main_motor_backward_timed": {
          const seconds2 = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "1");
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `DC_tBACKWARD,${seconds2},${speed}`;
        }
        // DC 모터 (연속) - DC_방향,속도
        case "main_motor_forward": {
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `DC_FORWARD,${speed}`;
        }
        case "main_motor_backward": {
          const speed = this.evaluateValueBlock(block.getInputTargetBlock("SPEED")) || "100";
          return `DC_BACKWARD,${speed}`;
        }
        case "main_motor_stop":
          return "DC_STOP";
        case "time_sleep": {
          const seconds2 = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0");
          return `SLEEP,${seconds2}`;
        }
        case "pico_check_device":
          return "PING";
        case "check_distance":
          return "DISTANCE";
        case "check_magnetic":
          return "MAGNET";
        default:
          return null;
      }
    },
    async sendCommand(command) {
      if (!state.isExecuting) {
        Logger.add("[\uC911\uB2E8] \uC2E4\uD589\uC774 \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4", "warning");
        return;
      }
      if (!this.simSink) BluetoothManager.updateStatus("\uBA85\uB839 \uC2E4\uD589 \uC911...", STATUS_COLORS.ORANGE);
      const fireAndForget = this._isFireAndForget(command);
      try {
        await this._dispatch(command, !fireAndForget);
        if (DEBUG) Logger.add(`[\uC644\uB8CC] ${command}`, "info");
      } catch (error) {
        if (error.message.includes("\uC2DC\uAC04 \uCD08\uACFC")) {
          Logger.add(`[\uACBD\uACE0] \uC751\uB2F5 \uB300\uAE30 \uCD08\uACFC: ${command}`, "warning");
        } else {
          Logger.add(`[\uC624\uB958] ${command}: ${error.message}`, "error");
          if (error.message.includes("\uC5F0\uACB0") || error.message.includes("BLE")) {
            state.isExecuting = false;
            throw error;
          }
        }
      }
      const cooldown = fireAndForget ? 40 : 20;
      await new Promise((resolve) => setTimeout(resolve, cooldown));
    },
    async handleLogicBlock(block) {
      var _a, _b, _c;
      if (block.type === "variables_set") {
        const varId2 = block.getFieldValue("VAR");
        const varName = ((_a = block.workspace.getVariableById(varId2)) == null ? void 0 : _a.name) || "unknown";
        const value = this.evaluateValueBlock(block.getInputTargetBlock("VALUE"));
        state.variables[varName] = value;
        if (DEBUG) Logger.add(`${varName} = ${value}`, "info");
      } else if (block.type === "buzzer_on" || block.type === "buzzer_note") {
        if (!this.simSink) {
          const durSec = parseFloat(this.evaluateValueBlock(block.getInputTargetBlock("DURATION")) || "1");
          const ms = Math.max(0, durSec * 1e3);
          for (let waited = 0; waited < ms && state.isExecuting; waited += 50) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(50, ms - waited)));
          }
        }
      } else if (block.type === "assign_variable") {
        const varId2 = block.getFieldValue("VAR");
        const varName = block.workspace.getVariableById(varId2).name;
        const value = this.evaluateValueBlock(block.getInputTargetBlock("VALUE"));
        state.variables[varName] = value;
      } else if (block.type === "math_change") {
        const varId2 = block.getFieldValue("VAR");
        const varName = block.workspace.getVariableById(varId2).name;
        const delta = parseFloat(this.evaluateValueBlock(block.getInputTargetBlock("DELTA")) || "0");
        state.variables[varName] = (parseFloat(state.variables[varName] || "0") + delta).toString();
      } else if (block.type === "check_distance") {
        const varId2 = block.getFieldValue("VAR");
        const varName = ((_b = block.workspace.getVariableById(varId2)) == null ? void 0 : _b.name) || "\uAC70\uB9AC\uAC12";
        await new Promise((resolve) => setTimeout(resolve, 300));
        const distance = state.variables["_last_distance"] || "0";
        state.variables[varName] = distance;
      } else if (block.type === "check_magnetic") {
        const varId2 = block.getFieldValue("VAR");
        const varName = ((_c = block.workspace.getVariableById(varId2)) == null ? void 0 : _c.name) || "\uC790\uAE30\uAC12";
        await new Promise((resolve) => setTimeout(resolve, 300));
        const magnetic = state.variables["_last_magnetic"] || "0";
        state.variables[varName] = magnetic;
      } else if (block.type === "controls_if") {
        let ran = false;
        for (let n = 0; block.getInput("IF" + n); n++) {
          const condition = this.evaluateValueBlock(block.getInputTargetBlock("IF" + n)) === "true";
          if (condition) {
            await this.processBlock(block.getInputTargetBlock("DO" + n));
            ran = true;
            break;
          }
        }
        if (!ran && block.getInput("ELSE")) {
          await this.processBlock(block.getInputTargetBlock("ELSE"));
        }
      } else if (block.type === "controls_whileUntil") {
        const mode = block.getFieldValue("MODE");
        let condition = this.evaluateValueBlock(block.getInputTargetBlock("BOOL")) === "true";
        const maxLoops = 100;
        let loopCount = 0;
        while ((mode === "WHILE" ? condition : !condition) && loopCount < maxLoops && state.isExecuting) {
          const doBlock = block.getInputTargetBlock("DO");
          await this.processBlock(doBlock);
          await this._resolveFunctionCalls(block.getInputTargetBlock("BOOL"));
          condition = this.evaluateValueBlock(block.getInputTargetBlock("BOOL")) === "true";
          loopCount++;
        }
      } else if (block.type === "controls_repeat_ext") {
        const times = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("TIMES")) || "0");
        const maxLoops = 100;
        const loopTimes = Math.min(times, maxLoops);
        for (let i = 0; i < loopTimes && state.isExecuting; i++) {
          await this.processBlock(block.getInputTargetBlock("DO"));
        }
      } else if (block.type === "procedures_defnoreturn" || block.type === "procedures_defreturn") {
      } else if (block.type === "procedures_callnoreturn") {
        const funcName = block.getFieldValue("NAME");
        const defBlock = this._findProcedureDefinition(block.workspace, funcName, false);
        if (defBlock) {
          await this._setupProcedureArgs(block, defBlock);
          const statementsBlock = defBlock.getInputTargetBlock("STACK");
          await this.processBlock(statementsBlock);
        } else {
          Logger.add(`[\uC624\uB958] \uD568\uC218 \uCC3E\uC744 \uC218 \uC5C6\uC74C: ${funcName}`, "error");
        }
      } else if (block.type === "procedures_callreturn") {
        const funcName = block.getFieldValue("NAME");
        const defBlock = this._findProcedureDefinition(block.workspace, funcName, true);
        if (defBlock) {
          await this._setupProcedureArgs(block, defBlock);
          const statementsBlock = defBlock.getInputTargetBlock("STACK");
          await this.processBlock(statementsBlock);
        }
      }
    },
    _findProcedureDefinition(workspace2, name, hasReturn) {
      const defType = hasReturn ? "procedures_defreturn" : "procedures_defnoreturn";
      const allBlocks = workspace2.getAllBlocks();
      for (const block of allBlocks) {
        if (block.type === defType && block.getFieldValue("NAME") === name) {
          return block;
        }
      }
      for (const block of allBlocks) {
        if ((block.type === "procedures_defreturn" || block.type === "procedures_defnoreturn") && block.getFieldValue("NAME") === name) {
          return block;
        }
      }
      return null;
    },
    async _setupProcedureArgs(callBlock, defBlock) {
      const argNames = defBlock.arguments_ || [];
      for (let i = 0; i < argNames.length; i++) {
        const argName = argNames[i];
        const argBlock = callBlock.getInputTargetBlock("ARG" + i);
        if (argBlock) {
          const value = this.evaluateValueBlock(argBlock);
          state.variables[argName] = value;
        }
      }
    },
    async executeWorkspace(workspace2) {
      state.isExecuting = true;
      this._funcResults.clear();
      this._funcCallDepth = 0;
      window.dispatchEvent(new CustomEvent("ares:execution", { detail: { executing: true } }));
      Logger.add("[\uC2E4\uD589] \uD504\uB85C\uADF8\uB7A8 \uC2DC\uC791", "info");
      try {
        const topBlocks = workspace2.getTopBlocks(true);
        for (const block of topBlocks) {
          if (!state.isExecuting) {
            Logger.add("[\uC2E4\uD589] \uC911\uB2E8\uB428", "warning");
            break;
          }
          if (block.type === "procedures_defnoreturn" || block.type === "procedures_defreturn") {
            continue;
          }
          await this.processBlock(block);
        }
        const completed = state.isExecuting;
        if (completed) {
          Logger.add("[\uC2E4\uD589] \uC644\uB8CC", "info");
        }
        state.isExecuting = false;
        window.dispatchEvent(new CustomEvent("ares:execution", { detail: { executing: false } }));
        return completed;
      } catch (error) {
        Logger.add(`[\uC624\uB958] \uD504\uB85C\uADF8\uB7A8 \uC2E4\uD589 \uC2E4\uD328: ${error.message}`, "error");
        state.isExecuting = false;
        window.dispatchEvent(new CustomEvent("ares:execution", { detail: { executing: false } }));
        return false;
      }
    },
    // 시뮬레이션 실행: 실제 BLE 없이 sink(로그)로 명령을 흘려보낸다.
    // executeWorkspace 와 동일한 블록 처리 로직을 재사용하되, 전송은 _dispatch →
    // simSink 로 라우팅된다. (runButton/BLE 상태는 건드리지 않는다)
    async simulateWorkspace(workspace2, sink) {
      if (state.isExecuting) return;
      this.simSink = sink;
      state.isExecuting = true;
      try {
        const topBlocks = workspace2.getTopBlocks(true);
        for (const block of topBlocks) {
          if (!state.isExecuting) break;
          if (block.type === "procedures_defnoreturn" || block.type === "procedures_defreturn") continue;
          await this.processBlock(block);
        }
      } finally {
        state.isExecuting = false;
        this.simSink = null;
      }
    }
  };

  // Sim_Parts/assets.js
  function makeGLTFLoader(A) {
    const loader = new A.GLTFLoader();
    const md = window.MeshoptDecoder;
    if (md) loader.setMeshoptDecoder(md);
    return loader;
  }
  function prepareRoot(root) {
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    });
    return root;
  }
  function disposeRoot(root) {
    var _a;
    (_a = root == null ? void 0 : root.traverse) == null ? void 0 : _a.call(root, (node) => {
      var _a2, _b;
      if (!node.isMesh && !node.isSprite) return;
      (_b = (_a2 = node.geometry) == null ? void 0 : _a2.dispose) == null ? void 0 : _b.call(_a2);
      const material = node.material;
      (Array.isArray(material) ? material : [material]).forEach((m) => {
        var _a3, _b2, _c;
        (_b2 = (_a3 = m == null ? void 0 : m.map) == null ? void 0 : _a3.dispose) == null ? void 0 : _b2.call(_a3);
        (_c = m == null ? void 0 : m.dispose) == null ? void 0 : _c.call(m);
      });
    });
  }
  var Assets = class {
    constructor(ctx) {
      this.ctx = ctx;
    }
    makeLoader() {
      return makeGLTFLoader(this.ctx.A);
    }
    loadModel(url, onLoad, onError) {
      const loader = this.makeLoader();
      loader.load(
        url,
        (gltf) => {
          if (this.ctx.disposed) {
            this.disposeGltf(gltf);
            return;
          }
          const root = prepareRoot(gltf.scene);
          onLoad == null ? void 0 : onLoad(root, gltf);
        },
        void 0,
        (err) => {
          console.error("\uBAA8\uB378 \uB85C\uB4DC \uC2E4\uD328:", url, err);
          onError == null ? void 0 : onError(err);
        }
      );
    }
    loadModels(urls, onPartLoad, onComplete, onError) {
      const list = Array.isArray(urls) ? urls : [];
      if (list.length === 0) {
        onComplete == null ? void 0 : onComplete();
        return;
      }
      const loader = this.makeLoader();
      let remaining = list.length;
      const finishOne = () => {
        remaining -= 1;
        if (remaining === 0) onComplete == null ? void 0 : onComplete();
      };
      list.forEach((url) => {
        loader.load(
          url,
          (gltf) => {
            if (this.ctx.disposed) {
              this.disposeGltf(gltf);
              finishOne();
              return;
            }
            const root = prepareRoot(gltf.scene);
            onPartLoad == null ? void 0 : onPartLoad(url, root, gltf);
            finishOne();
          },
          void 0,
          (err) => {
            console.error("\uBD80\uD488 \uBAA8\uB378 \uB85C\uB4DC \uC2E4\uD328:", url, err);
            onError == null ? void 0 : onError(url, err);
            finishOne();
          }
        );
      });
    }
    disposeRoot(root) {
      disposeRoot(root);
    }
    disposeGltf(gltf) {
      disposeRoot(gltf == null ? void 0 : gltf.scene);
    }
  };

  // Sim_Parts/render.js
  var SERVO_WHEEL_SPIN = 4;
  var SERVO_WORLD_SPEED = 1.2;
  var SERVO_TURN_SPEED = 0.9;
  var BOX_COLLIDE_R = 1.5;
  var RADAR_SPIN = 9;
  var Render = class {
    constructor(ctx) {
      this.ctx = ctx;
    }
    render() {
      var _a, _b, _c, _d;
      const ctx = this.ctx;
      const THREE = ctx.THREE;
      const nowSec = performance.now() * 1e-3;
      const dt = ctx.lastRenderTime > 0 ? Math.min(0.1, nowSec - ctx.lastRenderTime) : 0.016;
      ctx.lastRenderTime = nowSec;
      (_a = ctx.updateSmoothZoom) == null ? void 0 : _a.call(ctx, dt);
      ctx.controls.update();
      (_b = ctx.updateCameraReset) == null ? void 0 : _b.call(ctx, dt);
      (_c = ctx.clampCameraAboveFloor) == null ? void 0 : _c.call(ctx);
      (_d = ctx.updateKeyLight) == null ? void 0 : _d.call(ctx);
      const m = ctx.movement;
      const g = ctx.gun;
      if (m && m.radarOn && m.antennaPivot) {
        m.antennaPivot.rotation.y += RADAR_SPIN * dt * m.radarDir;
      }
      if (m && m.servoOn && ctx.worldGroup) {
        const dTheta = SERVO_WHEEL_SPIN * dt * m.servoDir;
        const xAxis = new THREE.Vector3(1, 0, 0);
        if (m.wheelR) m.wheelR.rotateOnWorldAxis(xAxis, dTheta);
        if (m.wheelL) m.wheelL.rotateOnWorldAxis(xAxis, dTheta);
        const before = m.nearestBoxDist();
        const savedZ = ctx.worldGroup.position.z;
        ctx.worldGroup.position.z -= SERVO_WORLD_SPEED * dt * m.servoDir;
        const after = m.nearestBoxDist();
        if (after < BOX_COLLIDE_R && after < before) {
          ctx.worldGroup.position.z = savedZ;
        }
      }
      if (m && m.servoTurnOn && ctx.worldGroup) {
        const dSpin = SERVO_WHEEL_SPIN * dt * m.servoTurnDir;
        const xAxis = new THREE.Vector3(1, 0, 0);
        const yAxis = new THREE.Vector3(0, 1, 0);
        const turnPivot = new THREE.Vector3(0, 0, -0.3);
        if (m.wheelR) m.wheelR.rotateOnWorldAxis(xAxis, -dSpin);
        if (m.wheelL) m.wheelL.rotateOnWorldAxis(xAxis, dSpin);
        const before = m.nearestBoxDist();
        const savedQ = ctx.worldGroup.quaternion.clone();
        const savedX = ctx.worldGroup.position.x;
        const savedZ = ctx.worldGroup.position.z;
        const dYaw = -SERVO_TURN_SPEED * dt * m.servoTurnDir;
        ctx.worldGroup.rotateOnWorldAxis(yAxis, dYaw);
        ctx.worldGroup.position.sub(turnPivot).applyAxisAngle(yAxis, dYaw).add(turnPivot);
        const after = m.nearestBoxDist();
        if (after < BOX_COLLIDE_R && after < before) {
          ctx.worldGroup.quaternion.copy(savedQ);
          ctx.worldGroup.position.x = savedX;
          ctx.worldGroup.position.z = savedZ;
        }
      }
      if (ctx.rocket && typeof ctx.rocket.updateRocket === "function") {
        ctx.rocket.updateRocket(dt);
      }
      if (ctx.waves && typeof ctx.waves.updateWaves === "function") {
        ctx.waves.updateWaves(dt);
      }
      if (ctx.gun && typeof ctx.gun.updateMuzzleFlash === "function") {
        ctx.gun.updateMuzzleFlash(dt);
      }
      if (ctx.gun && ctx.gun.gunMesh && typeof ctx.gun.updateGunSmoke === "function") {
        ctx.gun.updateGunSmoke(dt);
      }
      if (ctx.objects && typeof ctx.objects.update === "function") {
        ctx.objects.update(dt);
      }
      if (ctx.editor && typeof ctx.editor.update === "function") {
        ctx.editor.update();
      }
      ctx.renderer.render(ctx.scene, ctx.camera);
    }
  };

  // Sim_Parts/topics.js
  var TOPICS = {
    albi: { label: "\uC54C\uBE44\uC640 \uD568\uAED8", model: "Mesh/AlbiRobot/AlbiRobot.min.glb", eyes: { radius: 0.11, left: [0.145, 0.375, 0.12], right: [-0.145, 0.375, 0.12] }, chest: { radius: 0.07, pos: [0, -0.1, 0.135] } },
    traffic: { label: "\uC6B0\uC8FC \uC2E0\uD638\uB4F1", model: "Mesh/LampBox.glb", eyes: null, traffic: { lamp: "Mesh/LampGeneral.glb", hands: ["Mesh/LampHand1.glb", "Mesh/LampHand2.glb", "Mesh/LampHand3.glb"], count: 3 } },
    launchpad: {
      label: "\uBC1C\uC0AC\uB300",
      model: "Mesh/LaunchStation.glb",
      eyes: null,
      postProcess: null,
      radar: true,
      launch: {
        stripCount: 5,
        stripRadius: 0.04,
        stripXFrac: 0.5,
        stripYRange: [0.4275, 0.09068625],
        stripZFrac: 0.8,
        torusRadius: 0.09,
        torusTube: 0.03,
        torusYOffset: -0.08
      }
    },
    rover: { label: "\uB85C\uBC84", eyes: null, helpers: true, parts: [
      "Mesh/RoverParts/RoverBody.glb",
      "Mesh/RoverParts/RoverGun.glb",
      "Mesh/RoverParts/RoverHead.glb",
      "Mesh/RoverParts/RoverLED.glb",
      "Mesh/RoverParts/RoverOLED.glb",
      "Mesh/RoverParts/RoverRadar.glb",
      "Mesh/RoverParts/RoverWheel.glb"
    ] },
    // 개발자 모드 전용 '빈 씬'(SIMULATOR.md 2장) — 모델 없이 시작해 객체를 배치·저장한다.
    // 드롭다운에는 노출하지 않는다(DEV 바 '새 씬' 버튼으로만 진입, 선택 표시는 '선택 없음').
    empty: { label: "\uBE48 \uC52C", eyes: null }
  };
  var TOPIC_ORDER = ["albi", "traffic", "launchpad", "rover"];
  var DEFAULT_TOPIC = "albi";
  var MISSION_TOPIC = {};
  function defaultTopicForMission() {
    var _a, _b;
    const l = ((_a = document.getElementById("lessonSelect")) == null ? void 0 : _a.value) || "";
    const m = ((_b = document.getElementById("missionSelect")) == null ? void 0 : _b.value) || "";
    return MISSION_TOPIC[`L${l}M${m}`] || DEFAULT_TOPIC;
  }
  var OLED_ICONS = {
    rover: new Uint8Array([
      0,
      1,
      192,
      0,
      0,
      1,
      192,
      0,
      0,
      1,
      192,
      0,
      31,
      255,
      255,
      248,
      31,
      255,
      255,
      248,
      30,
      7,
      224,
      120,
      30,
      231,
      231,
      120,
      30,
      23,
      232,
      120,
      30,
      7,
      224,
      120,
      30,
      7,
      224,
      120,
      28,
      255,
      255,
      56,
      31,
      127,
      254,
      248,
      31,
      143,
      241,
      248,
      31,
      240,
      15,
      248,
      30,
      255,
      255,
      120,
      30,
      255,
      255,
      120,
      30,
      255,
      255,
      120,
      0,
      255,
      127,
      0,
      31,
      255,
      127,
      248,
      31,
      252,
      159,
      248,
      31,
      249,
      207,
      248,
      31,
      240,
      7,
      248,
      31,
      231,
      243,
      248,
      31,
      231,
      243,
      248,
      31,
      255,
      255,
      248,
      31,
      255,
      255,
      248,
      31,
      192,
      3,
      248,
      31,
      192,
      3,
      248,
      31,
      192,
      3,
      248,
      31,
      192,
      3,
      248,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]),
    mars: new Uint8Array([
      0,
      0,
      0,
      0,
      12,
      0,
      0,
      0,
      12,
      0,
      126,
      0,
      12,
      1,
      254,
      0,
      12,
      3,
      255,
      0,
      6,
      7,
      255,
      128,
      3,
      15,
      255,
      192,
      0,
      255,
      255,
      224,
      0,
      31,
      255,
      224,
      0,
      63,
      255,
      240,
      0,
      63,
      255,
      240,
      0,
      62,
      1,
      240,
      0,
      60,
      0,
      240,
      0,
      60,
      120,
      112,
      0,
      60,
      248,
      112,
      0,
      60,
      248,
      112,
      0,
      60,
      120,
      112,
      0,
      60,
      0,
      112,
      0,
      60,
      0,
      112,
      0,
      60,
      0,
      112,
      0,
      60,
      0,
      112,
      0,
      63,
      255,
      240,
      0,
      63,
      255,
      240,
      0,
      31,
      255,
      224,
      0,
      7,
      255,
      192,
      0,
      3,
      255,
      128,
      0,
      1,
      254,
      0,
      0,
      0,
      126,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]),
    open_eye: new Uint8Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      255,
      255,
      0,
      7,
      0,
      0,
      224,
      24,
      0,
      0,
      24,
      32,
      0,
      0,
      4,
      64,
      0,
      0,
      2,
      128,
      0,
      0,
      1,
      128,
      3,
      224,
      1,
      128,
      7,
      240,
      1,
      128,
      15,
      248,
      1,
      128,
      15,
      248,
      1,
      128,
      15,
      248,
      1,
      128,
      15,
      248,
      1,
      128,
      7,
      240,
      1,
      128,
      3,
      224,
      1,
      128,
      0,
      0,
      1,
      64,
      0,
      0,
      2,
      32,
      0,
      0,
      4,
      24,
      0,
      0,
      24,
      7,
      0,
      0,
      224,
      0,
      255,
      255,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]),
    closed_eye: new Uint8Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      255,
      255,
      128,
      7,
      0,
      0,
      224,
      24,
      0,
      0,
      24,
      32,
      0,
      0,
      4,
      64,
      0,
      0,
      2,
      128,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ])
  };

  // Sim_Parts/leds.js
  var OLED_W = 128;
  var OLED_H = 64;
  var OLED_SCALE = 4;
  var OLED_CHAR_W = 8;
  var OLED_CHAR_H = 8;
  var Leds = class {
    constructor(ctx) {
      this.ctx = ctx;
      this.channels = /* @__PURE__ */ new Map();
      this.disposables = /* @__PURE__ */ new Set();
      this.oledCanvas = null;
      this.oledCtx = null;
      this.oledTex = null;
    }
    createGlowTexture(stops) {
      const THREE = this.ctx.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const gx = canvas.getContext("2d");
      const grad = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, stops[0]);
      grad.addColorStop(0.25, stops[1]);
      grad.addColorStop(1, stops[2]);
      gx.fillStyle = grad;
      gx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.disposables.add(tex);
      return tex;
    }
    createMeshLed({ radius, pos, palette, glowTex, geometry }) {
      var _a, _b, _c;
      const THREE = this.ctx.THREE;
      const group = new THREE.Group();
      group.position.fromArray(pos);
      const sphere = new THREE.Mesh(
        geometry || new THREE.SphereGeometry(radius, 28, 28),
        new THREE.MeshStandardMaterial({
          color: palette.sphereBase,
          emissive: palette.emissive,
          emissiveIntensity: 0,
          transparent: true,
          opacity: 0.4,
          roughness: 0.2,
          metalness: 0
        })
      );
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex,
        color: palette.glowTint,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.95
      }));
      glow.scale.setScalar(radius * 3.3);
      glow.visible = false;
      const light = new THREE.PointLight(palette.lightColor, 0, radius * 22, 2);
      group.add(sphere, glow, light);
      return {
        type: "mesh-led",
        group,
        sphere,
        glow,
        light,
        on: false,
        intensityScale: (_a = palette.intensityScale) != null ? _a : 1,
        opacityOn: (_b = palette.opacityOn) != null ? _b : 0.92,
        glowScale: (_c = palette.glowScale) != null ? _c : 1
      };
    }
    createBallLed({
      radius = 0.05,
      palette = {}
    } = {}) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
      const THREE = this.ctx.THREE;
      return {
        type: "ball-led",
        mesh: new THREE.Mesh(
          new THREE.SphereGeometry(radius, 16, 12),
          new THREE.MeshStandardMaterial({
            color: (_a = palette.offColor) != null ? _a : 16777215,
            transparent: true,
            opacity: (_b = palette.offOpacity) != null ? _b : 0.25,
            roughness: (_c = palette.roughness) != null ? _c : 0.4,
            metalness: (_d = palette.metalness) != null ? _d : 0
          })
        ),
        on: false,
        offColor: (_e = palette.offColor) != null ? _e : 16777215,
        onColor: (_f = palette.onColor) != null ? _f : 65314,
        offOpacity: (_g = palette.offOpacity) != null ? _g : 0.25,
        onOpacityBase: (_h = palette.onOpacityBase) != null ? _h : 0.6,
        onOpacityBoost: (_i = palette.onOpacityBoost) != null ? _i : 0.4,
        onEmissiveIntensity: (_j = palette.onEmissiveIntensity) != null ? _j : 0.9
      };
    }
    register(id, channel) {
      if (!id || !channel) return channel;
      this.channels.set(id, channel);
      return channel;
    }
    unregister(id) {
      this.channels.delete(id);
    }
    get(id) {
      return this.channels.get(id) || null;
    }
    set(id, value) {
      const channel = this.channels.get(id);
      if (!channel) return;
      this.applyChannel(channel, value);
    }
    setIndexed(prefix, index, value) {
      this.set(`${prefix}-${index}`, value);
    }
    getIndexed(prefix, index) {
      return this.get(`${prefix}-${index}`);
    }
    applyChannel(channel, value) {
      if (!channel) return;
      if (typeof channel.apply === "function") {
        channel.apply(value);
        if ("on" in channel) channel.on = this.toUnit(value) > 0;
        return;
      }
      if (channel.type === "mesh-led") {
        this.applyMeshLed(channel, value);
        return;
      }
      if (channel.type === "ball-led") {
        this.applyBallLed(channel, value);
      }
    }
    applyMeshLed(channel, value) {
      const v = this.toUnit(value);
      channel.on = v > 0;
      channel.sphere.material.emissiveIntensity = 3.2 * v * channel.intensityScale;
      channel.sphere.material.opacity = v > 0 ? 0.4 + (channel.opacityOn - 0.4) * v : 0.4;
      channel.glow.visible = v > 0;
      if (channel.glow.material) {
        channel.glow.material.opacity = 0.95 * v * channel.intensityScale * channel.glowScale;
      }
      channel.light.intensity = 1.8 * v * channel.intensityScale;
    }
    applyBallLed(channel, value) {
      const v = this.toUnit(value);
      const m = channel.mesh.material;
      channel.on = v > 0;
      if (v > 0) {
        m.color.setHex(channel.onColor);
        m.emissive.setHex(channel.onColor);
        m.emissiveIntensity = channel.onEmissiveIntensity * v;
        m.opacity = channel.onOpacityBase + channel.onOpacityBoost * v;
      } else {
        m.color.setHex(channel.offColor);
        m.emissive.setHex(0);
        m.emissiveIntensity = 0;
        m.opacity = channel.offOpacity;
      }
    }
    toUnit(value) {
      return typeof value === "number" ? Math.max(0, Math.min(1, value)) : value ? 1 : 0;
    }
    setupOled(roverGroup, root, editor) {
      const THREE = this.ctx.THREE;
      root.position.set(0, 0.1, 0.5);
      root.rotation.x = -Math.PI / 6;
      const probe = root.clone(true);
      probe.position.set(0, 0, 0);
      probe.rotation.set(0, 0, 0);
      probe.scale.set(1, 1, 1);
      const pbox = new THREE.Box3().setFromObject(probe);
      const psize = pbox.getSize(new THREE.Vector3());
      const pcenter = pbox.getCenter(new THREE.Vector3());
      this.oledCanvas = document.createElement("canvas");
      this.oledCanvas.width = OLED_W * OLED_SCALE;
      this.oledCanvas.height = OLED_H * OLED_SCALE;
      this.oledCtx = this.oledCanvas.getContext("2d");
      this.clear();
      this.text(0, 0, "ARES READY");
      this.oledTex = new THREE.CanvasTexture(this.oledCanvas);
      this.oledTex.colorSpace = THREE.SRGBColorSpace;
      this.oledTex.magFilter = THREE.NearestFilter;
      this.oledTex.minFilter = THREE.NearestFilter;
      this.disposables.add(this.oledTex);
      const w = psize.x * 0.85 * 0.95 * 0.95 * 0.9;
      const h = w * (this.oledCanvas.height / this.oledCanvas.width);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: this.oledTex, side: THREE.DoubleSide })
      );
      const pivot = new THREE.Group();
      pivot.position.set(pcenter.x, pcenter.y - h / 2, pbox.max.z + 1e-3);
      pivot.rotation.x = -Math.PI / 12;
      screen.position.set(0, h / 2, 0);
      pivot.add(screen);
      root.add(pivot);
      roverGroup.add(root);
      editor == null ? void 0 : editor.register(root, "Rover OLED");
    }
    clear() {
      if (!this.oledCtx) return;
      this.oledCtx.fillStyle = "#000814";
      this.oledCtx.fillRect(0, 0, this.oledCanvas.width, this.oledCanvas.height);
      if (this.oledTex) this.oledTex.needsUpdate = true;
    }
    clearRect(x, y, w, h) {
      if (!this.oledCtx) return;
      const x0 = Math.max(0, x);
      const y0 = Math.max(0, y);
      const x1 = Math.min(OLED_W, x + w);
      const y1 = Math.min(OLED_H, y + h);
      if (x1 <= x0 || y1 <= y0) return;
      this.oledCtx.fillStyle = "#000814";
      this.oledCtx.fillRect(x0 * OLED_SCALE, y0 * OLED_SCALE, (x1 - x0) * OLED_SCALE, (y1 - y0) * OLED_SCALE);
      if (this.oledTex) this.oledTex.needsUpdate = true;
    }
    text(x, y, text) {
      if (!this.oledCtx) return;
      this.oledCtx.fillStyle = "#7dffff";
      this.oledCtx.font = `bold ${OLED_CHAR_H * OLED_SCALE}px monospace`;
      this.oledCtx.textAlign = "left";
      this.oledCtx.textBaseline = "top";
      const s = String(text);
      for (let i = 0; i < s.length; i++) {
        const ox = x + i * OLED_CHAR_W;
        if (ox >= OLED_W) break;
        this.oledCtx.fillText(s[i], ox * OLED_SCALE, y * OLED_SCALE);
      }
      if (this.oledTex) this.oledTex.needsUpdate = true;
    }
    icon(name, x, y) {
      if (!this.oledCtx) return;
      const bm = OLED_ICONS[name];
      if (!bm) return;
      this.oledCtx.fillStyle = "#7dffff";
      for (let row = 0; row < 32; row++) {
        for (let bc = 0; bc < 4; bc++) {
          const byte = bm[row * 4 + bc];
          if (!byte) continue;
          for (let bit = 0; bit < 8; bit++) {
            if (byte & 1 << 7 - bit) {
              const px = x + bc * 8 + bit;
              const py = y + row;
              if (px >= 0 && px < OLED_W && py >= 0 && py < OLED_H) {
                this.oledCtx.fillRect(px * OLED_SCALE, py * OLED_SCALE, OLED_SCALE, OLED_SCALE);
              }
            }
          }
        }
      }
      if (this.oledTex) this.oledTex.needsUpdate = true;
    }
    dispose() {
      this.disposables.forEach((item) => {
        var _a;
        return (_a = item == null ? void 0 : item.dispose) == null ? void 0 : _a.call(item);
      });
      this.disposables.clear();
      this.channels.clear();
    }
  };

  // Sim_Parts/movement.js
  var BOX_SPAWN_RANGE = 50;
  var BOX_CLEAR_R = 5;
  var DIST_NO_HIT = 999;
  var DIST_BOX_INFLATE = 2;
  var Movement = class {
    constructor(ctx) {
      this.ctx = ctx;
      this.radarOn = false;
      this.radarDir = 1;
      this.antennaPivot = null;
      this.servoOn = false;
      this.servoDir = 1;
      this.servoTurnOn = false;
      this.servoTurnDir = 1;
      this.obstaclesOn = true;
      this.boxes = [];
      this.irSensorBalls = [];
      this.magSensorBall = null;
      this.wheelR = null;
      this.wheelL = null;
    }
    // Setup floor grid, axes helpers, and 150 random box obstacles
    setupWorld(scene, editor) {
      const THREE = this.ctx.THREE;
      const FLOOR_SIZE = 100;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
        new THREE.MeshStandardMaterial({
          color: 3815994,
          roughness: 0.95,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1e-3;
      floor.receiveShadow = true;
      floor.renderOrder = -1;
      const grid = new THREE.GridHelper(FLOOR_SIZE, FLOOR_SIZE, 4473924, 6710886);
      grid.position.y = 2e-3;
      this.worldGroup = new THREE.Group();
      this.worldGroup.add(floor, grid);
      this.ctx.worldGroup = this.worldGroup;
      const BOX_COUNT = 150;
      const boxGeom = new THREE.BoxGeometry(1, 2, 1);
      for (let i = 0; i < BOX_COUNT; i++) {
        let x = 0, z = 0;
        do {
          x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
          z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        } while (Math.hypot(x, z) < BOX_CLEAR_R);
        const box = new THREE.Mesh(
          boxGeom,
          new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.55, 0.5), roughness: 0.8, metalness: 0 })
        );
        box.position.set(x, 1, z);
        box.castShadow = true;
        box.receiveShadow = true;
        this.worldGroup.add(box);
        this.boxes.push(box);
        editor == null ? void 0 : editor.register(box, `Obstacle ${i + 1}`);
      }
      scene.add(this.worldGroup);
      editor == null ? void 0 : editor.register(this.worldGroup, "Rover World");
      const axes = new THREE.AxesHelper(1);
      axes.position.y = 3e-3;
      scene.add(axes);
      const makePlaneGrid = () => new THREE.GridHelper(2, 20, 8947848, 4473958);
      const gridXZ = makePlaneGrid();
      const gridXY = makePlaneGrid();
      gridXY.rotation.x = Math.PI / 2;
      const gridYZ = makePlaneGrid();
      gridYZ.rotation.z = Math.PI / 2;
      this.ctx.planeGrids = new THREE.Group();
      this.ctx.planeGrids.add(gridXZ, gridXY, gridYZ);
      this.ctx.planeGrids.visible = false;
      scene.add(this.ctx.planeGrids);
    }
    // Setup magnet and distance sensor indicators (spheres)
    setupSensorIndicators(roverGroup) {
      const THREE = this.ctx.THREE;
      const LED_R = 0.05;
      const ledGeom = new THREE.SphereGeometry(LED_R, 16, 12);
      this.magSensorBall = new THREE.Mesh(
        ledGeom,
        new THREE.MeshStandardMaterial({ color: 16777215, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0 })
      );
      this.magSensorBall.position.set(0, -0.3, 0.9);
      roverGroup.add(this.magSensorBall);
      [-0.22, 0.22].forEach((x) => {
        const ball = new THREE.Mesh(
          ledGeom,
          new THREE.MeshStandardMaterial({ color: 16777215, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0 })
        );
        ball.position.set(x, 0.58, 0.1);
        roverGroup.add(ball);
        this.irSensorBalls.push(ball);
      });
    }
    // Position and attach wheels
    setupWheels(roverGroup, root, editor) {
      root.scale.multiplyScalar(0.8);
      this.wheelR = root;
      this.wheelL = root.clone();
      this.wheelR.rotation.y = Math.PI / 2;
      this.wheelL.rotation.y = Math.PI / 2;
      this.wheelR.position.set(0.7, 0, -0.3);
      this.wheelL.position.set(-0.7, 0, -0.3);
      roverGroup.add(this.wheelR, this.wheelL);
      editor == null ? void 0 : editor.register(this.wheelR, "RoverWheel R");
      editor == null ? void 0 : editor.register(this.wheelL, "RoverWheel L");
    }
    // Position and attach radar
    setupRadar(roverGroup, root, editor) {
      root.scale.multiplyScalar(0.5).multiplyScalar(0.8);
      root.position.set(0, 0.5, -0.9);
      this.antennaPivot = root;
      roverGroup.add(root);
      editor == null ? void 0 : editor.register(root, "RoverRadar");
    }
    // Position and attach head
    setupHead(roverGroup, root, editor) {
      root.position.set(0, 0.6, -0.3);
      root.rotation.y = Math.PI;
      roverGroup.add(root);
      editor == null ? void 0 : editor.register(root, "RoverHead");
    }
    setRadar(on, dir) {
      this.radarOn = !!on;
      if (dir !== void 0 && dir !== null) {
        this.radarDir = dir < 0 ? -1 : 1;
      }
    }
    setServoMove(on, dir) {
      this.servoOn = !!on;
      if (this.servoOn) this.servoTurnOn = false;
      if (dir !== void 0 && dir !== null) {
        this.servoDir = dir < 0 ? -1 : 1;
      }
    }
    setServoTurn(on, dir) {
      this.servoTurnOn = !!on;
      if (this.servoTurnOn) this.servoOn = false;
      if (dir !== void 0 && dir !== null) {
        this.servoTurnDir = dir < 0 ? -1 : 1;
      }
    }
    stopServo() {
      this.servoOn = false;
      this.servoTurnOn = false;
    }
    nearestBoxDist() {
      if (!this.obstaclesOn) return Infinity;
      const THREE = this.ctx.THREE;
      const boxTmp = new THREE.Vector3();
      let m = Infinity;
      for (let i = 0; i < this.boxes.length; i++) {
        this.boxes[i].getWorldPosition(boxTmp);
        const d = Math.hypot(boxTmp.x, boxTmp.z);
        if (d < m) m = d;
      }
      return m;
    }
    respawnBoxes() {
      if (!this.ctx.worldGroup) return;
      this.ctx.worldGroup.position.set(0, 0, 0);
      this.ctx.worldGroup.quaternion.identity();
      for (let i = 0; i < this.boxes.length; i++) {
        let x = 0, z = 0;
        do {
          x = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
          z = (Math.random() * 2 - 1) * BOX_SPAWN_RANGE;
        } while (Math.hypot(x, z) < BOX_CLEAR_R);
        this.boxes[i].position.set(x, 1, z);
      }
    }
    setObstacles(on) {
      this.obstaclesOn = !!on;
      for (let i = 0; i < this.boxes.length; i++) {
        this.boxes[i].visible = this.obstaclesOn;
      }
    }
    setDistanceSensor(on) {
      for (let i = 0; i < this.irSensorBalls.length; i++) {
        const m = this.irSensorBalls[i].material;
        if (on) {
          m.color.setHex(16720418);
          m.emissive.setHex(16720418);
          m.emissiveIntensity = 2.6;
          m.opacity = 0.9;
        } else {
          m.color.setHex(16777215);
          m.emissive.setHex(0);
          m.emissiveIntensity = 0;
          m.opacity = 0.25;
        }
      }
    }
    measureDistance() {
      if (this.irSensorBalls.length === 0 || !this.obstaclesOn) {
        return DIST_NO_HIT;
      }
      const THREE = this.ctx.THREE;
      const ray = new THREE.Raycaster();
      const dir = new THREE.Vector3(0, 0, 1);
      const origin = new THREE.Vector3();
      for (let i = 0; i < this.boxes.length; i++) {
        this.boxes[i].scale.set(DIST_BOX_INFLATE, 1, DIST_BOX_INFLATE);
      }
      if (this.ctx.worldGroup) this.ctx.worldGroup.updateMatrixWorld(true);
      let minDist = Infinity;
      for (let i = 0; i < this.irSensorBalls.length; i++) {
        this.irSensorBalls[i].getWorldPosition(origin);
        ray.set(origin, dir);
        const hits = ray.intersectObjects(this.boxes, false);
        if (hits.length && hits[0].distance < minDist) {
          minDist = hits[0].distance;
        }
      }
      for (let i = 0; i < this.boxes.length; i++) {
        this.boxes[i].scale.set(1, 1, 1);
      }
      if (!isFinite(minDist)) return DIST_NO_HIT;
      return Math.round(minDist * 10);
    }
  };

  // Sim_Parts/rocket.js
  var ROCKET_RISE = 10;
  var ROCKET_SPEED = 0.16;
  var SMOKE_POOL = 80;
  var SMOKE_RATE = 42;
  var Rocket = class {
    constructor(ctx) {
      this.ctx = ctx;
      this.rocketGroup = null;
      this.rocketFlameSprite = null;
      this.rocketFlameLight = null;
      this.rocketCentroidLocal = null;
      this.rocketMeshRef = null;
      this.rocketBottomLocal = null;
      this.rocketLaunchOn = false;
      this.rocketAnimT = 0;
      this.savedCamPos = null;
      this.savedTarget = null;
      this.rocketCentroidWorld = null;
      this.smokeGroup = null;
      this.smokeTex = null;
      this.smokePool = [];
      this.smokeSpawnAcc = 0;
    }
    // Static helper to recolor antenna geometry from the loaded Launchpad model
    static recolorAntenna(root, THREE) {
      const meshes = [];
      root.traverse((o) => {
        var _a;
        if (o.isMesh && ((_a = o.geometry) == null ? void 0 : _a.getAttribute("position"))) meshes.push(o);
      });
      if (!meshes.length) return;
      function splitTris(idxArr, posAttr, isInRegion) {
        const insideTris = [], outsideTris = [];
        const triCount = idxArr.length / 3;
        for (let t = 0; t < triCount; t++) {
          const a = idxArr[t * 3], b = idxArr[t * 3 + 1], c = idxArr[t * 3 + 2];
          const allIn = isInRegion(posAttr.getX(a), posAttr.getY(a)) && isInRegion(posAttr.getX(b), posAttr.getY(b)) && isInRegion(posAttr.getX(c), posAttr.getY(c));
          (allIn ? insideTris : outsideTris).push(a, b, c);
        }
        if (!insideTris.length) return null;
        let cx = 0, cy = 0, cz = 0, n = 0;
        const used = new Set(insideTris);
        for (const v of used) {
          cx += posAttr.getX(v);
          cy += posAttr.getY(v);
          cz += posAttr.getZ(v);
          n++;
        }
        return { insideTris, outsideTris, centroid: { x: cx / n, y: cy / n, z: cz / n } };
      }
      for (const mesh of meshes) {
        const geom = mesh.geometry;
        const posAttr = geom.getAttribute("position");
        if (!geom.getIndex() || !posAttr) continue;
        geom.computeBoundingBox();
        const bb = geom.boundingBox;
        const sx = bb.max.x - bb.min.x;
        const sy = bb.max.y - bb.min.y;
        const isAntenna = (x, y) => {
          const fx = (x - bb.min.x) / sx;
          const fy = (y - bb.min.y) / sy;
          return fx > 0.78 && fx < 0.92 && fy > 0.7;
        };
        let split = splitTris(geom.getIndex().array, posAttr, isAntenna);
        if (!split) {
          console.warn("[LaunchStation] \uC548\uD14C\uB098 \uC815\uC810 \uAC10\uC9C0 \uC2E4\uD328");
        } else {
          const { insideTris, outsideTris, centroid } = split;
          const pivotOffsetX = -0.01;
          const pivotX = centroid.x + pivotOffsetX;
          const antennaGeom = geom.clone();
          antennaGeom.setIndex(insideTris);
          const grayMat = new THREE.MeshStandardMaterial({
            color: 10133670,
            metalness: 0.1,
            roughness: 0.7,
            side: THREE.DoubleSide,
            emissive: 4210752,
            emissiveIntensity: 0.6
          });
          const pivot = new THREE.Group();
          pivot.position.set(pivotX, centroid.y, centroid.z);
          const antennaMesh = new THREE.Mesh(antennaGeom, grayMat);
          antennaMesh.position.set(-pivotX, -centroid.y, -centroid.z);
          antennaMesh.castShadow = true;
          antennaMesh.receiveShadow = true;
          antennaMesh.frustumCulled = false;
          pivot.add(antennaMesh);
          mesh.add(pivot);
          root.userData.antennaPivot = pivot;
          geom.setIndex(outsideTris);
        }
        const isRocket = (x, y) => {
          const fx = (x - bb.min.x) / sx;
          const fy = (y - bb.min.y) / sy;
          return fx > 0.28 && fx < 0.46 && fy > 0.68;
        };
        split = splitTris(geom.getIndex().array, posAttr, isRocket);
        if (!split) {
          console.warn("[LaunchStation] \uB85C\uCF13 \uC815\uC810 \uAC10\uC9C0 \uC2E4\uD328");
        } else {
          const { insideTris, outsideTris } = split;
          const rocketGeom = geom.clone();
          rocketGeom.setIndex(insideTris);
          let rxMin = Infinity, rxMax = -Infinity;
          let ryMin = Infinity, ryMax = -Infinity;
          let rzMin = Infinity, rzMax = -Infinity;
          const usedR = new Set(insideTris);
          for (const v of usedR) {
            const x = posAttr.getX(v), y = posAttr.getY(v), z = posAttr.getZ(v);
            if (x < rxMin) rxMin = x;
            if (x > rxMax) rxMax = x;
            if (y < ryMin) ryMin = y;
            if (y > ryMax) ryMax = y;
            if (z < rzMin) rzMin = z;
            if (z > rzMax) rzMax = z;
          }
          const rcx = (rxMin + rxMax) / 2;
          const rcz = (rzMin + rzMax) / 2;
          const rby = ryMin;
          const yellowMat = new THREE.MeshStandardMaterial({
            color: 16110138,
            metalness: 0.05,
            roughness: 0.55,
            side: THREE.DoubleSide,
            emissive: 4864520,
            emissiveIntensity: 0.45
          });
          const rocketGroup = new THREE.Group();
          const rocketMesh = new THREE.Mesh(rocketGeom, yellowMat);
          rocketMesh.castShadow = true;
          rocketMesh.receiveShadow = true;
          rocketMesh.frustumCulled = false;
          rocketGroup.add(rocketMesh);
          const fc = document.createElement("canvas");
          fc.width = fc.height = 128;
          const fcx = fc.getContext("2d");
          const fg = fcx.createRadialGradient(64, 64, 0, 64, 64, 64);
          fg.addColorStop(0, "rgba(255,250,200,1)");
          fg.addColorStop(0.3, "rgba(255,150,40,0.9)");
          fg.addColorStop(0.7, "rgba(255,60,0,0.4)");
          fg.addColorStop(1, "rgba(255,0,0,0)");
          fcx.fillStyle = fg;
          fcx.fillRect(0, 0, 128, 128);
          const flameTex = new THREE.CanvasTexture(fc);
          flameTex.colorSpace = THREE.SRGBColorSpace;
          const flameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: flameTex,
            color: 16755251,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0
          }));
          flameSprite.position.set(rcx, rby - 0.1, rcz);
          flameSprite.scale.set(0.22, 0.5, 1);
          flameSprite.visible = false;
          rocketGroup.add(flameSprite);
          const flameLight = new THREE.PointLight(16748576, 0, 1.8, 2);
          flameLight.position.set(rcx, rby - 0.05, rcz);
          rocketGroup.add(flameLight);
          mesh.add(rocketGroup);
          geom.setIndex(outsideTris);
          root.userData.rocketGroup = rocketGroup;
          root.userData.rocketFlameSprite = flameSprite;
          root.userData.rocketFlameLight = flameLight;
          root.userData.rocketCentroidLocal = new THREE.Vector3(rcx, (ryMin + ryMax) / 2, rcz);
          root.userData.rocketBottomLocal = new THREE.Vector3(rcx, ryMin, rcz);
          root.userData.rocketMeshRef = mesh;
        }
      }
    }
    // Setup Rocket by binding to structural parameters decoded in recolorAntenna
    setupRocket(root) {
      this.rocketGroup = root.userData.rocketGroup;
      this.rocketFlameSprite = root.userData.rocketFlameSprite;
      this.rocketFlameLight = root.userData.rocketFlameLight;
      this.rocketCentroidLocal = root.userData.rocketCentroidLocal;
      this.rocketMeshRef = root.userData.rocketMeshRef;
      this.rocketBottomLocal = root.userData.rocketBottomLocal;
    }
    setRocketLaunch(on, followCamera) {
      const follow = followCamera !== false;
      this.rocketLaunchOn = !!on;
      if (this.rocketLaunchOn && !this.savedCamPos && follow) {
        this.savedCamPos = this.ctx.camera.position.clone();
        this.savedTarget = this.ctx.controls.target.clone();
        if (this.rocketCentroidLocal && this.rocketMeshRef) {
          this.rocketMeshRef.updateMatrixWorld(true);
          this.rocketCentroidWorld = this.rocketCentroidLocal.clone().applyMatrix4(this.rocketMeshRef.matrixWorld);
        }
      }
    }
    makeSmokeTex(THREE) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const cx = cv.getContext("2d");
      const blob = (px, py, r, a) => {
        const g = cx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.5, `rgba(244,246,250,${a * 0.55})`);
        g.addColorStop(1, "rgba(232,236,244,0)");
        cx.fillStyle = g;
        cx.beginPath();
        cx.arc(px, py, r, 0, Math.PI * 2);
        cx.fill();
      };
      blob(64, 64, 46, 0.92);
      blob(44, 54, 30, 0.7);
      blob(82, 56, 28, 0.7);
      blob(54, 82, 26, 0.62);
      blob(82, 82, 24, 0.62);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    ensureSmoke() {
      const THREE = this.ctx.THREE;
      if (this.smokeGroup || !this.rocketMeshRef || !this.rocketBottomLocal) return;
      this.smokeTex = this.makeSmokeTex(THREE);
      this.smokeGroup = new THREE.Group();
      this.rocketMeshRef.add(this.smokeGroup);
      for (let i = 0; i < SMOKE_POOL; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.smokeTex,
          color: 15659510,
          transparent: true,
          depthWrite: false,
          opacity: 0
        }));
        sp.visible = false;
        this.smokeGroup.add(sp);
        this.smokePool.push({
          sprite: sp,
          active: false,
          age: 0,
          life: 1,
          vel: new THREE.Vector3(),
          scale0: 0.18,
          scaleMax: 1.4,
          rot: 0,
          rotSpeed: 0
        });
      }
    }
    spawnSmoke(baseY) {
      const THREE = this.ctx.THREE;
      const p = this.smokePool.find((q) => !q.active);
      if (!p) return;
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * 0.12;
      p.active = true;
      p.age = 0;
      p.life = 1.6 + Math.random() * 1.3;
      p.sprite.position.set(
        this.rocketBottomLocal.x + Math.cos(ang) * rad,
        baseY - 0.05 - Math.random() * 0.06,
        this.rocketBottomLocal.z + Math.sin(ang) * rad
      );
      const spd = 0.5 + Math.random() * 0.8;
      p.vel.set(Math.cos(ang) * spd, -0.15 - Math.random() * 0.25, Math.sin(ang) * spd);
      p.scale0 = 0.16 + Math.random() * 0.12;
      p.scaleMax = 1 + Math.random() * 1;
      p.rot = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 0.8;
      p.sprite.material.opacity = 0;
      p.sprite.material.rotation = p.rot;
      p.sprite.scale.set(p.scale0, p.scale0, 1);
      p.sprite.visible = true;
    }
    updateRocket(dt) {
      if (this.ctx.waves) {
        const THREE = this.ctx.THREE;
        if (!this.ctx.waves.launchWavePosition) {
          this.ctx.waves.launchWavePosition = new THREE.Vector3(0, 0, 0);
        } else {
          this.ctx.waves.launchWavePosition.set(0, 0, 0);
        }
      }
      if (!this.rocketGroup) return;
      const targetT = this.rocketLaunchOn ? 1 : 0;
      if (this.rocketAnimT !== targetT) {
        const dir = Math.sign(targetT - this.rocketAnimT);
        this.rocketAnimT = Math.max(0, Math.min(1, this.rocketAnimT + dir * ROCKET_SPEED * dt));
      }
      const eased = this.rocketLaunchOn ? 1 - (1 - this.rocketAnimT) * (1 - this.rocketAnimT) : this.rocketAnimT * this.rocketAnimT;
      this.rocketGroup.position.y = ROCKET_RISE * eased;
      const showFlame = this.rocketLaunchOn || this.rocketAnimT > 0.01;
      if (this.rocketFlameSprite) {
        this.rocketFlameSprite.visible = showFlame;
        if (showFlame) {
          const wob = 1 + 0.25 * Math.sin(performance.now() * 0.025);
          this.rocketFlameSprite.scale.set(0.22 * wob, 0.5 * wob, 1);
          this.rocketFlameSprite.material.opacity = Math.min(1, this.rocketAnimT * 4) * 0.95;
        }
      }
      if (this.rocketFlameLight) {
        this.rocketFlameLight.intensity = showFlame ? Math.min(1, this.rocketAnimT * 4) * 1.8 : 0;
      }
      this.ensureSmoke();
      if (this.smokeGroup) {
        if (this.rocketLaunchOn) {
          const rate = SMOKE_RATE * (1 + (1 - this.rocketAnimT));
          this.smokeSpawnAcc += dt * rate;
          const baseY = this.rocketBottomLocal.y + this.rocketGroup.position.y;
          while (this.smokeSpawnAcc >= 1) {
            this.smokeSpawnAcc -= 1;
            this.spawnSmoke(baseY);
          }
        } else {
          this.smokeSpawnAcc = 0;
        }
        for (const p of this.smokePool) {
          if (!p.active) continue;
          p.age += dt;
          const t = p.age / p.life;
          if (t >= 1) {
            p.active = false;
            p.sprite.visible = false;
            continue;
          }
          p.sprite.position.addScaledVector(p.vel, dt);
          p.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
          p.vel.y += 0.4 * dt;
          const grow = 1 - (1 - t) * (1 - t);
          const s = p.scale0 + (p.scaleMax - p.scale0) * grow;
          p.sprite.scale.set(s, s, 1);
          p.sprite.material.opacity = Math.min(1, t * 6) * (1 - t) * 0.8;
          p.rot += p.rotSpeed * dt;
          p.sprite.material.rotation = p.rot;
        }
      }
      if (this.savedCamPos && this.savedTarget && this.rocketCentroidWorld) {
        const rocketYNow = this.rocketCentroidWorld.y + ROCKET_RISE * eased;
        if (this.rocketLaunchOn) {
          this.ctx.controls.target.x = this.rocketCentroidWorld.x;
          this.ctx.controls.target.y = rocketYNow;
          this.ctx.controls.target.z = this.rocketCentroidWorld.z;
        } else {
          this.ctx.controls.target.x = this.savedTarget.x + (this.rocketCentroidWorld.x - this.savedTarget.x) * eased;
          this.ctx.controls.target.y = this.savedTarget.y + (rocketYNow - this.savedTarget.y) * eased;
          this.ctx.controls.target.z = this.savedTarget.z + (this.rocketCentroidWorld.z - this.savedTarget.z) * eased;
        }
        this.ctx.camera.position.y = this.savedCamPos.y + ROCKET_RISE * eased;
      }
      if (!this.rocketLaunchOn && this.rocketAnimT === 0 && this.savedCamPos) {
        this.ctx.camera.position.copy(this.savedCamPos);
        this.ctx.controls.target.copy(this.savedTarget);
        this.savedCamPos = null;
        this.savedTarget = null;
        this.rocketCentroidWorld = null;
      }
    }
    dispose() {
      var _a, _b;
      try {
        this.smokePool.forEach((p) => {
          var _a2, _b2, _c;
          return (_c = (_b2 = (_a2 = p.sprite) == null ? void 0 : _a2.material) == null ? void 0 : _b2.dispose) == null ? void 0 : _c.call(_b2);
        });
        (_b = (_a = this.smokeTex) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
      } catch (e) {
      }
    }
  };

  // Sim_Parts/traffic.js
  var TRAFFIC_LAMP_COLORS = [16711680, 16763904, 49200];
  var TRAFFIC_HAND_COLOR = 16763904;
  var TRAFFIC_LAMP_ROT_X = Math.PI / 2;
  var Traffic = class {
    constructor(ctx) {
      this.ctx = ctx;
      this.trafficRoot = null;
      this.trafficBox = null;
      this.trafficSlots = null;
      this.trafficTopY = 0;
      this.trafficSlotState = [];
      this.trafficMode = null;
      this.trafficLoadToken = 0;
    }
    disposeSubtree(obj) {
      obj.traverse((o) => {
        var _a, _b;
        if (o.isMesh) {
          (_b = (_a = o.geometry) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
          const m = o.material;
          (Array.isArray(m) ? m : [m]).forEach((mm) => {
            var _a2;
            return (_a2 = mm == null ? void 0 : mm.dispose) == null ? void 0 : _a2.call(mm);
          });
        }
      });
      if (obj.parent) obj.parent.remove(obj);
    }
    clearSlot(i) {
      const s = this.trafficSlotState[i];
      if (!s) return;
      this.ctx.leds.unregister(`traffic-${i}`);
      if (s.inst) this.disposeSubtree(s.inst);
      if (s.light && s.light.parent) s.light.parent.remove(s.light);
      this.trafficSlotState[i] = null;
    }
    clearAllSlots() {
      for (let i = 0; i < this.trafficSlotState.length; i++) {
        this.clearSlot(i);
      }
    }
    fitOnSlot(inst, slot, widthRatio, rotX) {
      const THREE = this.ctx.THREE;
      if (rotX) inst.rotation.x = rotX;
      inst.updateMatrixWorld(true);
      const tb = new THREE.Box3().setFromObject(inst);
      const ts = tb.getSize(new THREE.Vector3());
      const s = ts.x > 0 ? slot.width * widthRatio / ts.x : 1;
      inst.scale.setScalar(s);
      inst.updateMatrixWorld(true);
      const ib = new THREE.Box3().setFromObject(inst);
      const ic = ib.getCenter(new THREE.Vector3());
      inst.position.set(slot.x - ic.x, this.trafficTopY - ib.min.y, slot.z - ic.z);
    }
    cloneInstanceMaterials(obj) {
      obj.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        }
      });
    }
    collectMaterials(obj) {
      const arr = [];
      obj.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m) arr.push(m);
      });
      return arr;
    }
    makeSlotLight(slot, colorHex) {
      const THREE = this.ctx.THREE;
      const l = new THREE.PointLight(colorHex, 0, slot.width * 6, 2);
      l.position.set(slot.x, this.trafficTopY + slot.width * 0.5, slot.z);
      return l;
    }
    setSlotOn(i, value) {
      const THREE = this.ctx.THREE;
      const s = this.trafficSlotState[i];
      if (!s) return;
      const v = typeof value === "number" ? Math.max(0, Math.min(1, value)) : value ? 1 : 0;
      s.on = v > 0;
      const onCol = new THREE.Color(s.color);
      const offCol = new THREE.Color(6710886);
      for (const m of s.materials) {
        if (m.color !== void 0) m.color.copy(s.on ? onCol : offCol);
        if (m.emissive !== void 0) {
          m.emissive.copy(s.on ? onCol : new THREE.Color(0));
          m.emissiveIntensity = 0.7 * v;
        }
        if (m.metalness !== void 0) m.metalness = Math.min(m.metalness, 0.1);
        if (m.roughness !== void 0) m.roughness = Math.max(m.roughness, 0.55);
        m.transparent = true;
        m.opacity = s.on ? 0.55 + 0.25 * v : 0.55;
        m.depthWrite = false;
        m.needsUpdate = true;
      }
      if (s.light) s.light.intensity = 1.3 * v;
    }
    toggleSlot(i) {
      const s = this.trafficSlotState[i];
      if (!s) return;
      this.setSlotOn(i, !s.on);
    }
    placeLamps(makeGLTFLoader2) {
      const TRAFFIC = this.trafficCfg;
      if (!TRAFFIC || !this.trafficRoot || !this.trafficSlots) return;
      this.clearAllSlots();
      this.trafficMode = "lamps";
      const myToken = ++this.trafficLoadToken;
      makeGLTFLoader2().load(TRAFFIC.lamp, (gltf) => {
        if (this.ctx.disposed || myToken !== this.trafficLoadToken) {
          gltf.scene.traverse((o) => {
            var _a, _b;
            if (o.isMesh || o.isSprite) {
              (_b = (_a = o.geometry) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
              const m = o.material;
              (Array.isArray(m) ? m : [m]).forEach((mm) => {
                var _a2, _b2, _c;
                (_b2 = (_a2 = mm == null ? void 0 : mm.map) == null ? void 0 : _a2.dispose) == null ? void 0 : _b2.call(_a2);
                (_c = mm == null ? void 0 : mm.dispose) == null ? void 0 : _c.call(mm);
              });
            }
          });
          return;
        }
        const template = gltf.scene;
        template.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
          }
        });
        for (let i = 0; i < this.trafficSlots.length; i++) {
          const inst = template.clone(true);
          this.cloneInstanceMaterials(inst);
          this.fitOnSlot(inst, this.trafficSlots[i], 0.7, TRAFFIC_LAMP_ROT_X);
          this.ctx.scene.add(inst);
          const color = TRAFFIC_LAMP_COLORS[i] !== void 0 ? TRAFFIC_LAMP_COLORS[i] : 16777215;
          const light = this.makeSlotLight(this.trafficSlots[i], color);
          this.ctx.scene.add(light);
          this.trafficSlotState[i] = { kind: "lamp", inst, light, color, materials: this.collectMaterials(inst), on: false };
          this.ctx.leds.register(`traffic-${i}`, { apply: (value) => this.setSlotOn(i, value), on: false });
          this.setSlotOn(i, false);
        }
      }, void 0, (err) => console.error("LampGeneral \uB85C\uB4DC \uC2E4\uD328:", err));
    }
    placeHands(makeGLTFLoader2) {
      const TRAFFIC = this.trafficCfg;
      if (!TRAFFIC || !this.trafficRoot || !this.trafficSlots) return;
      this.clearAllSlots();
      this.trafficMode = "hands";
      const myToken = ++this.trafficLoadToken;
      const n = Math.min(this.trafficSlots.length, TRAFFIC.hands.length);
      for (let i = 0; i < n; i++) {
        const slot = this.trafficSlots[i], url = TRAFFIC.hands[i], idx = i;
        makeGLTFLoader2().load(url, (gltf) => {
          if (this.ctx.disposed || myToken !== this.trafficLoadToken) {
            gltf.scene.traverse((o) => {
              var _a, _b;
              if (o.isMesh || o.isSprite) {
                (_b = (_a = o.geometry) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
                const m = o.material;
                (Array.isArray(m) ? m : [m]).forEach((mm) => {
                  var _a2, _b2, _c;
                  (_b2 = (_a2 = mm == null ? void 0 : mm.map) == null ? void 0 : _a2.dispose) == null ? void 0 : _b2.call(_a2);
                  (_c = mm == null ? void 0 : mm.dispose) == null ? void 0 : _c.call(mm);
                });
              }
            });
            return;
          }
          const inst = gltf.scene;
          inst.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              o.frustumCulled = false;
            }
          });
          this.cloneInstanceMaterials(inst);
          this.fitOnSlot(inst, slot, 0.85, 0);
          this.ctx.scene.add(inst);
          const color = TRAFFIC_HAND_COLOR;
          const light = this.makeSlotLight(slot, color);
          this.ctx.scene.add(light);
          this.trafficSlotState[idx] = { kind: "hand", inst, light, color, materials: this.collectMaterials(inst), on: false };
          this.ctx.leds.register(`traffic-${idx}`, { apply: (value) => this.setSlotOn(idx, value), on: false });
          this.setSlotOn(idx, false);
        }, void 0, (err) => console.error("LampHand \uB85C\uB4DC \uC2E4\uD328:", err));
      }
    }
    setupTraffic(root, makeGLTFLoader2, trafficConfig) {
      const THREE = this.ctx.THREE;
      this.trafficCfg = trafficConfig;
      this.trafficRoot = root;
      this.trafficBox = new THREE.Box3().setFromObject(root);
      const tsz = this.trafficBox.getSize(new THREE.Vector3());
      const tcn = this.trafficBox.getCenter(new THREE.Vector3());
      this.trafficTopY = this.trafficBox.max.y;
      const n = Math.max(1, this.trafficCfg ? this.trafficCfg.count || 3 : 3);
      const span = tsz.x * 0.8;
      const start = tcn.x - span / 2;
      const step = n === 1 ? 0 : span / (n - 1);
      const slotW = span / n;
      this.trafficSlots = [];
      for (let i = 0; i < n; i++) {
        this.trafficSlots.push({ x: start + step * i, z: tcn.z, width: slotW });
      }
      this.placeLamps(makeGLTFLoader2);
    }
    resetTraffic() {
      this.trafficLoadToken++;
      this.clearAllSlots();
      this.trafficMode = null;
    }
    dispose() {
      this.clearAllSlots();
    }
  };

  // Sim_Parts/waves.js
  var WAVE_SPAWN_INTERVAL = 0.18;
  var WAVE_LIFETIME = 1.4;
  var WAVE_MAX_SCALE = 5;
  var ROVER_WAVE_MAX_SCALE = 7;
  var WAVE_COLOR = 8969727;
  var WAVE_OPACITY = 0.16;
  var ROVER_WAVE_BASE_R = 0.15;
  var Waves = class {
    constructor(ctx) {
      this.ctx = ctx;
      this.launchWaveOn = false;
      this.launchWaveSpawnTimer = 0;
      this.launchFootprintSize = 1;
      this.launchWaveRings = [];
      this.launchWavePosition = null;
      this.roverWaveOn = false;
      this.roverWaveSpawnTimer = 0;
      this.roverWaveRings = [];
    }
    setLaunchWave(on) {
      this.launchWaveOn = !!on;
      if (!this.launchWaveOn) this.launchWaveSpawnTimer = 0;
    }
    setRoverWave(on) {
      this.roverWaveOn = !!on;
      if (!this.roverWaveOn) this.roverWaveSpawnTimer = 0;
    }
    spawnWaveRing() {
      const THREE = this.ctx.THREE;
      const baseR = this.launchFootprintSize * 0.5;
      const geom = new THREE.SphereGeometry(baseR, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: WAVE_COLOR,
        transparent: true,
        opacity: WAVE_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geom, mat);
      if (this.launchWavePosition) {
        mesh.position.copy(this.launchWavePosition);
      } else {
        mesh.position.set(0, 0, 0);
      }
      this.ctx.scene.add(mesh);
      this.launchWaveRings.push({ mesh, age: 0 });
    }
    spawnRoverWaves() {
      const THREE = this.ctx.THREE;
      const speakers = [
        new THREE.Vector3(-0.5, 0.3, 0.6),
        new THREE.Vector3(0.5, 0.3, 0.6)
      ];
      for (let s = 0; s < speakers.length; s++) {
        const geom = new THREE.SphereGeometry(ROVER_WAVE_BASE_R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
          color: WAVE_COLOR,
          transparent: true,
          opacity: WAVE_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(speakers[s]);
        this.ctx.scene.add(mesh);
        this.roverWaveRings.push({ mesh, age: 0 });
      }
    }
    updateWaves(dt) {
      if (this.launchWaveOn) {
        this.launchWaveSpawnTimer += dt;
        while (this.launchWaveSpawnTimer >= WAVE_SPAWN_INTERVAL) {
          this.launchWaveSpawnTimer -= WAVE_SPAWN_INTERVAL;
          this.spawnWaveRing();
        }
      }
      for (let i = this.launchWaveRings.length - 1; i >= 0; i--) {
        const r = this.launchWaveRings[i];
        r.age += dt;
        const t = r.age / WAVE_LIFETIME;
        if (t >= 1) {
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          this.ctx.scene.remove(r.mesh);
          this.launchWaveRings.splice(i, 1);
          continue;
        }
        const scale = 1 + t * (WAVE_MAX_SCALE - 1);
        r.mesh.scale.setScalar(scale);
        r.mesh.material.opacity = (1 - t) * WAVE_OPACITY;
      }
      if (this.roverWaveOn) {
        this.roverWaveSpawnTimer += dt;
        while (this.roverWaveSpawnTimer >= WAVE_SPAWN_INTERVAL) {
          this.roverWaveSpawnTimer -= WAVE_SPAWN_INTERVAL;
          this.spawnRoverWaves();
        }
      }
      for (let i = this.roverWaveRings.length - 1; i >= 0; i--) {
        const r = this.roverWaveRings[i];
        r.age += dt;
        const t = r.age / WAVE_LIFETIME;
        if (t >= 1) {
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          this.ctx.scene.remove(r.mesh);
          this.roverWaveRings.splice(i, 1);
          continue;
        }
        const scale = 1 + t * (ROVER_WAVE_MAX_SCALE - 1);
        r.mesh.scale.setScalar(scale);
        r.mesh.material.opacity = (1 - t) * WAVE_OPACITY;
      }
    }
    dispose() {
      this.launchWaveRings.forEach((r) => {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
      });
      this.roverWaveRings.forEach((r) => {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
      });
    }
  };

  // Sim_Parts/gun.js
  var MUZZLE_DUR = 0.35;
  var GUN_SMOKE_POOL = 18;
  var GUN_SMOKE_BURST = 12;
  var GUN_SMOKE_BURST_DUR = 0.18;
  var Gun = class {
    constructor(ctx) {
      this.ctx = ctx;
      this.gunMesh = null;
      this.muzzleFlash = null;
      this.muzzleFlashSphere = null;
      this.muzzleFlashLight = null;
      this.muzzleSparks = [];
      this.muzzleFlashT = 0;
      this.muzzleWorldPos = new ctx.THREE.Vector3();
      this.muzzleForward = new ctx.THREE.Vector3();
      this.gunSmokeGroup = null;
      this.smokeTex = null;
      this.gunSmokePool = [];
      this.gunSmokeRemaining = 0;
      this.gunSmokeAcc = 0;
    }
    // Setup the Gun mesh, its positioning, and calculate muzzle parameters
    setupGun(roverGroup, root, editor) {
      const THREE = this.ctx.THREE;
      root.position.set(0.55, 0.5, -0.5);
      root.rotation.y = Math.PI / 2;
      roverGroup.add(root);
      editor == null ? void 0 : editor.register(root, "Rover Gun");
      this.gunMesh = root;
      const bbox = new THREE.Box3().setFromObject(root);
      const size = bbox.getSize(new THREE.Vector3());
      const center = bbox.getCenter(new THREE.Vector3());
      let ax = 0;
      if (size.y > size.x && size.y > size.z) ax = 1;
      else if (size.z > size.x) ax = 2;
      const minV = bbox.min.getComponent(ax);
      const maxV = bbox.max.getComponent(ax);
      const muzzleEnd = Math.abs(maxV) > Math.abs(minV) ? minV : maxV;
      this.muzzleWorldPos.copy(center);
      this.muzzleWorldPos.setComponent(ax, muzzleEnd);
      this.muzzleForward.set(0, 0, 0);
      this.muzzleForward.setComponent(ax, Math.sign(muzzleEnd - center.getComponent(ax)) || -1);
    }
    ensureMuzzleFlash() {
      const THREE = this.ctx.THREE;
      const scene = this.ctx.scene;
      if (this.muzzleFlash || !this.gunMesh) return;
      this.muzzleFlash = new THREE.Group();
      this.muzzleFlashSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 16767360,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      this.muzzleFlash.add(this.muzzleFlashSphere);
      this.muzzleFlashLight = new THREE.PointLight(16755268, 0, 3, 2);
      this.muzzleFlash.add(this.muzzleFlashLight);
      for (let i = 0; i < 12; i++) {
        const spark = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 6, 6),
          new THREE.MeshBasicMaterial({
            color: 16772778,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        );
        this.muzzleFlash.add(spark);
        this.muzzleSparks.push({ mesh: spark, vel: new THREE.Vector3(), age: 0 });
      }
      scene.add(this.muzzleFlash);
      this.muzzleFlash.visible = false;
    }
    setGunFire() {
      if (!this.gunMesh) return;
      this.ensureMuzzleFlash();
      this.muzzleFlash.position.copy(this.muzzleWorldPos);
      for (const sp of this.muzzleSparks) {
        sp.mesh.position.set(0, 0, 0);
        const speed = 1 + Math.random() * 1.6;
        sp.vel.copy(this.muzzleForward).multiplyScalar(speed);
        sp.vel.x += (Math.random() - 0.5) * 0.8;
        sp.vel.y += (Math.random() - 0.5) * 0.6;
        sp.vel.z += (Math.random() - 0.5) * 0.8;
        sp.age = 0;
        sp.mesh.material.opacity = 1;
      }
      this.muzzleFlashT = 1e-4;
      this.muzzleFlash.visible = true;
      this.gunSmokeRemaining = GUN_SMOKE_BURST;
      this.gunSmokeAcc = 0;
    }
    updateMuzzleFlash(dt) {
      if (this.muzzleFlashT <= 0 || !this.muzzleFlash) return;
      this.muzzleFlashT += dt;
      if (this.muzzleFlashT >= MUZZLE_DUR) {
        this.muzzleFlashT = 0;
        this.muzzleFlash.visible = false;
        return;
      }
      const t = this.muzzleFlashT / MUZZLE_DUR;
      const flashI = (1 - t) * (1 - t);
      this.muzzleFlashSphere.material.opacity = flashI * 0.95;
      this.muzzleFlashSphere.scale.setScalar(0.7 + t * 1.8);
      this.muzzleFlashLight.intensity = 5 * flashI;
      for (const sp of this.muzzleSparks) {
        sp.age += dt;
        sp.mesh.position.add(sp.vel.clone().multiplyScalar(dt));
        sp.vel.multiplyScalar(0.92);
        sp.vel.y -= 2.5 * dt;
        sp.mesh.material.opacity = Math.max(0, 1 - sp.age / 0.3);
      }
    }
    makeSmokeTex(THREE) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const cx = cv.getContext("2d");
      const blob = (px, py, r, a) => {
        const g = cx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.5, `rgba(244,246,250,${a * 0.55})`);
        g.addColorStop(1, "rgba(232,236,244,0)");
        cx.fillStyle = g;
        cx.beginPath();
        cx.arc(px, py, r, 0, Math.PI * 2);
        cx.fill();
      };
      blob(64, 64, 46, 0.92);
      blob(44, 54, 30, 0.7);
      blob(82, 56, 28, 0.7);
      blob(54, 82, 26, 0.62);
      blob(82, 82, 24, 0.62);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    ensureGunSmoke() {
      const THREE = this.ctx.THREE;
      const scene = this.ctx.scene;
      if (this.gunSmokeGroup || !this.gunMesh) return;
      this.smokeTex = this.makeSmokeTex(THREE);
      this.gunSmokeGroup = new THREE.Group();
      scene.add(this.gunSmokeGroup);
      for (let i = 0; i < GUN_SMOKE_POOL; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.smokeTex,
          color: 14212582,
          transparent: true,
          depthWrite: false,
          opacity: 0
        }));
        sp.visible = false;
        this.gunSmokeGroup.add(sp);
        this.gunSmokePool.push({
          sprite: sp,
          active: false,
          age: 0,
          life: 1,
          vel: new THREE.Vector3(),
          scale0: 0.06,
          scaleMax: 0.5,
          rot: 0,
          rotSpeed: 0
        });
      }
    }
    spawnGunSmoke() {
      const THREE = this.ctx.THREE;
      const p = this.gunSmokePool.find((q) => !q.active);
      if (!p) return;
      p.active = true;
      p.age = 0;
      p.life = 1.2 + Math.random() * 0.9;
      p.sprite.position.copy(this.muzzleWorldPos);
      p.sprite.position.x += (Math.random() - 0.5) * 0.06;
      p.sprite.position.y += (Math.random() - 0.5) * 0.06;
      p.sprite.position.z += (Math.random() - 0.5) * 0.06;
      const spd = 0.7 + Math.random() * 0.5;
      p.vel.copy(this.muzzleForward).multiplyScalar(spd);
      p.vel.x += (Math.random() - 0.5) * 0.45;
      p.vel.y += 0.15 + Math.random() * 0.25;
      p.vel.z += (Math.random() - 0.5) * 0.45;
      p.scale0 = 0.08 + Math.random() * 0.08;
      p.scaleMax = 0.45 + Math.random() * 0.45;
      p.rot = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 1.2;
      p.sprite.material.opacity = 0;
      p.sprite.material.rotation = p.rot;
      p.sprite.scale.set(p.scale0, p.scale0, 1);
      p.sprite.visible = true;
    }
    updateGunSmoke(dt) {
      if (!this.gunMesh) return;
      this.ensureGunSmoke();
      if (!this.gunSmokeGroup) return;
      if (this.gunSmokeRemaining > 0) {
        this.gunSmokeAcc += dt;
        const alreadySpawned = GUN_SMOKE_BURST - this.gunSmokeRemaining;
        const targetSpawned = Math.min(GUN_SMOKE_BURST, Math.ceil(GUN_SMOKE_BURST * this.gunSmokeAcc / GUN_SMOKE_BURST_DUR));
        let toSpawn = targetSpawned - alreadySpawned;
        while (toSpawn-- > 0 && this.gunSmokeRemaining > 0) {
          this.spawnGunSmoke();
          this.gunSmokeRemaining--;
        }
      }
      for (const p of this.gunSmokePool) {
        if (!p.active) continue;
        p.age += dt;
        const t = p.age / p.life;
        if (t >= 1) {
          p.active = false;
          p.sprite.visible = false;
          continue;
        }
        p.sprite.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
        p.vel.y += 0.4 * dt;
        const grow = 1 - (1 - t) * (1 - t);
        const s = p.scale0 + (p.scaleMax - p.scale0) * grow;
        p.sprite.scale.set(s, s, 1);
        p.sprite.material.opacity = Math.min(1, t * 8) * (1 - t) * 0.7;
        p.rot += p.rotSpeed * dt;
        p.sprite.material.rotation = p.rot;
      }
    }
    dispose() {
      var _a, _b;
      try {
        this.gunSmokePool.forEach((p) => {
          var _a2, _b2, _c;
          return (_c = (_b2 = (_a2 = p.sprite) == null ? void 0 : _a2.material) == null ? void 0 : _b2.dispose) == null ? void 0 : _c.call(_b2);
        });
        (_b = (_a = this.smokeTex) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
      } catch (e) {
      }
    }
  };

  // Sim_Parts/audio.js
  var gunNoiseBuffer = null;
  var activeGunSources = [];
  var Audio = class _Audio {
    constructor(ctx) {
      this.ctx = ctx;
    }
    // Static audio synthesis method for rocket launch
    static playRocketLaunch(audioCtx) {
      if (!audioCtx) return;
      try {
        const t0 = audioCtx.currentTime;
        const DUR = 3.6;
        const bufLen = Math.floor(audioCtx.sampleRate * 2);
        const buffer = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
        const rumbleSrc = audioCtx.createBufferSource();
        rumbleSrc.buffer = buffer;
        rumbleSrc.loop = true;
        const lp = audioCtx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(900, t0);
        lp.frequency.exponentialRampToValueAtTime(250, t0 + DUR);
        const rumbleGain = audioCtx.createGain();
        rumbleSrc.connect(lp);
        lp.connect(rumbleGain);
        rumbleGain.connect(audioCtx.destination);
        const roarSrc = audioCtx.createBufferSource();
        roarSrc.buffer = buffer;
        roarSrc.loop = true;
        const bp = audioCtx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 0.7;
        bp.frequency.setValueAtTime(500, t0);
        bp.frequency.linearRampToValueAtTime(1400, t0 + 0.6);
        bp.frequency.exponentialRampToValueAtTime(700, t0 + DUR);
        const roarGain = audioCtx.createGain();
        roarSrc.connect(bp);
        bp.connect(roarGain);
        roarGain.connect(audioCtx.destination);
        const VOL = 0.16;
        rumbleGain.gain.setValueAtTime(0, t0);
        rumbleGain.gain.linearRampToValueAtTime(VOL, t0 + 0.15);
        rumbleGain.gain.setValueAtTime(VOL, t0 + DUR * 0.5);
        rumbleGain.gain.linearRampToValueAtTime(0, t0 + DUR);
        roarGain.gain.setValueAtTime(0, t0);
        roarGain.gain.linearRampToValueAtTime(VOL * 0.7, t0 + 0.1);
        roarGain.gain.linearRampToValueAtTime(0, t0 + DUR);
        rumbleSrc.start(t0);
        rumbleSrc.stop(t0 + DUR + 0.05);
        roarSrc.start(t0);
        roarSrc.stop(t0 + DUR + 0.05);
      } catch (e) {
        console.warn("rocket launch sound \uC2E4\uD328:", e);
      }
    }
    // Static audio synthesis method for gun fire
    static playGunFire(audioCtx) {
      if (!audioCtx) return;
      try {
        const t0 = audioCtx.currentTime + 5e-3;
        if (!gunNoiseBuffer) {
          const bufLen = Math.floor(audioCtx.sampleRate * 1.5);
          gunNoiseBuffer = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
          const data = gunNoiseBuffer.getChannelData(0);
          for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
        }
        for (const s of activeGunSources) {
          try {
            s.stop();
          } catch (e) {
          }
        }
        activeGunSources = [];
        const boomSrc = audioCtx.createBufferSource();
        boomSrc.buffer = gunNoiseBuffer;
        const boomLp = audioCtx.createBiquadFilter();
        boomLp.type = "lowpass";
        boomLp.frequency.value = 280;
        const boomGain = audioCtx.createGain();
        boomSrc.connect(boomLp);
        boomLp.connect(boomGain);
        boomGain.connect(audioCtx.destination);
        boomGain.gain.setValueAtTime(1e-4, t0);
        boomGain.gain.linearRampToValueAtTime(0.75, t0 + 3e-3);
        boomGain.gain.exponentialRampToValueAtTime(1e-3, t0 + 0.7);
        const crackSrc = audioCtx.createBufferSource();
        crackSrc.buffer = gunNoiseBuffer;
        const crackHp = audioCtx.createBiquadFilter();
        crackHp.type = "highpass";
        crackHp.frequency.value = 2e3;
        const crackGain = audioCtx.createGain();
        crackSrc.connect(crackHp);
        crackHp.connect(crackGain);
        crackGain.connect(audioCtx.destination);
        crackGain.gain.setValueAtTime(1e-4, t0);
        crackGain.gain.linearRampToValueAtTime(0.5, t0 + 2e-3);
        crackGain.gain.exponentialRampToValueAtTime(1e-3, t0 + 0.08);
        const rumbleSrc = audioCtx.createBufferSource();
        rumbleSrc.buffer = gunNoiseBuffer;
        const rumbleLp = audioCtx.createBiquadFilter();
        rumbleLp.type = "lowpass";
        rumbleLp.frequency.setValueAtTime(160, t0);
        rumbleLp.frequency.exponentialRampToValueAtTime(70, t0 + 1.1);
        const rumbleGain = audioCtx.createGain();
        rumbleSrc.connect(rumbleLp);
        rumbleLp.connect(rumbleGain);
        rumbleGain.connect(audioCtx.destination);
        rumbleGain.gain.setValueAtTime(1e-4, t0);
        rumbleGain.gain.linearRampToValueAtTime(0.35, t0 + 0.04);
        rumbleGain.gain.exponentialRampToValueAtTime(1e-3, t0 + 1.1);
        boomSrc.start(t0);
        boomSrc.stop(t0 + 0.75);
        crackSrc.start(t0);
        crackSrc.stop(t0 + 0.1);
        rumbleSrc.start(t0);
        rumbleSrc.stop(t0 + 1.15);
        activeGunSources.push(boomSrc, crackSrc, rumbleSrc);
      } catch (e) {
        console.warn("gun fire sound \uC2E4\uD328:", e);
      }
    }
    // Synthesizes a square wave beep sound
    playBeep(hz, sec) {
      if (!hz || sec <= 0) return;
      try {
        const audioCtx = this.ctx.getAudioCtx();
        if (!audioCtx) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "square";
        o.frequency.value = hz;
        o.connect(g);
        g.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime;
        const t1 = t0 + sec;
        const VOL = 0.06;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(VOL, t0 + 5e-3);
        g.gain.setValueAtTime(VOL, Math.max(t0 + 6e-3, t1 - 0.01));
        g.gain.linearRampToValueAtTime(0, t1);
        o.start(t0);
        o.stop(t1 + 0.02);
      } catch (e) {
        console.warn("beep \uC2E4\uD328:", e);
      }
    }
    playRocketLaunch() {
      const audioCtx = this.ctx.getAudioCtx();
      _Audio.playRocketLaunch(audioCtx);
    }
    playGunFire() {
      const audioCtx = this.ctx.getAudioCtx();
      _Audio.playGunFire(audioCtx);
    }
  };

  // Sim_Parts/dispatch.js
  var Dispatch = class {
    constructor(ctx) {
      this.ctx = ctx;
      this.activeWaitCancel = null;
    }
    commandHoldSeconds(c) {
      const head = c.split(",")[0];
      const parts = c.split(",");
      if (c.startsWith("BATCH;")) {
        return c.slice("BATCH;".length).split("|").reduce((s, sub) => s + this.commandHoldSeconds(sub), 0);
      }
      if (head === "SLEEP") return parseFloat(parts[1]) || 0;
      if (head === "BUZZER_ON") return parseFloat(parts[2]) || 0;
      if (head === "SERVO_tFORWARD" || head === "SERVO_tBACKWARD" || head === "SERVO_tLEFT" || head === "SERVO_tRIGHT") return parseFloat(parts[1]) || 0;
      if (head === "DC_tFORWARD" || head === "DC_tBACKWARD") return parseFloat(parts[1]) || 0;
      return 0;
    }
    setLedByNum(num2, intensity) {
      const ctx = this.ctx;
      const cfg = ctx.cfg;
      if (cfg.eyes) {
        if (num2 === 1) ctx.leds.set("eye-r", intensity);
        else if (num2 === 2) ctx.leds.set("eye-l", intensity);
      } else if (cfg.traffic) {
        if (num2 >= 1 && num2 <= 3) ctx.leds.setIndexed("traffic", num2 - 1, intensity);
      } else if (cfg.launch) {
        if (num2 >= 0 && num2 <= 5) ctx.leds.setIndexed("launch", num2, intensity);
      } else if (cfg.parts) {
        if (num2 >= 0 && num2 <= 5) ctx.leds.setIndexed("rover", num2, intensity);
      }
    }
    setAllLedsOff() {
      const ctx = this.ctx;
      const cfg = ctx.cfg;
      if (cfg.eyes) {
        ctx.leds.set("eye-r", 0);
        ctx.leds.set("eye-l", 0);
      }
      if (cfg.chest) {
        ctx.leds.set("chest", 0);
      }
      if (cfg.traffic) {
        ctx.leds.setIndexed("traffic", 0, 0);
        ctx.leds.setIndexed("traffic", 1, 0);
        ctx.leds.setIndexed("traffic", 2, 0);
      }
      if (cfg.launch) {
        for (let i = 0; i <= 5; i++) ctx.leds.setIndexed("launch", i, 0);
      }
      if (cfg.parts) {
        for (let i = 0; i <= 5; i++) ctx.leds.setIndexed("rover", i, 0);
      }
    }
    applyTopicEffect(cmd) {
      const ctx = this.ctx;
      const cfg = ctx.cfg;
      if (cmd.startsWith("DISTANCE")) {
        if (!cfg.parts || !ctx.movement || ctx.movement.irSensorBalls.length === 0) return null;
        ctx.movement.setDistanceSensor(true);
        return () => {
          ctx.movement.setDistanceSensor(false);
        };
      }
      if (cmd.startsWith("LED_ON,")) {
        const parts = cmd.split(",");
        const num2 = parseInt(parts[1], 10);
        const raw = parseFloat(parts[2]);
        const intensity = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 1));
        this.setLedByNum(num2, intensity);
        return null;
      }
      if (cmd.startsWith("[") && cmd.endsWith("]")) {
        const values = cmd.slice(1, -1).trim().split(/\s+/);
        const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
        for (let i = 0; i <= 5; i++) {
          if (values.length > i) this.setLedByNum(i, toI(values[i]));
        }
        return null;
      }
      if (cmd.startsWith("LED_OFF,")) {
        const arg = cmd.split(",")[1];
        if (arg === "ALL") this.setAllLedsOff();
        else this.setLedByNum(parseInt(arg, 10), 0);
        return null;
      }
      if (cmd.startsWith("BUZZER_ON,")) {
        const cleanups = [];
        if (cfg.chest) {
          ctx.leds.set("chest", 1);
          cleanups.push(() => {
            ctx.leds.set("chest", 0);
          });
        }
        if (cfg.launch) {
          ctx.waves.setLaunchWave(true);
          cleanups.push(() => {
            ctx.waves.setLaunchWave(false);
          });
        }
        if (cfg.parts) {
          ctx.waves.setRoverWave(true);
          cleanups.push(() => {
            ctx.waves.setRoverWave(false);
          });
        }
        if (cleanups.length === 0) return null;
        const parts = cmd.split(",");
        const hz = parseFloat(parts[1]) || 0;
        const sec = parseFloat(parts[2]) || 0;
        ctx.audio.playBeep(hz, sec);
        return () => cleanups.forEach((fn) => fn());
      }
      if (cmd.startsWith("SERVO_tFORWARD,") || cmd.startsWith("SERVO_tBACKWARD,")) {
        if (!cfg.parts) return null;
        const dir = cmd.startsWith("SERVO_tFORWARD,") ? 1 : -1;
        ctx.movement.setServoMove(true, dir);
        return () => {
          ctx.movement.setServoMove(false);
        };
      }
      if (cmd.startsWith("SERVO_tLEFT,") || cmd.startsWith("SERVO_tRIGHT,")) {
        if (!cfg.parts) return null;
        const dir = cmd.startsWith("SERVO_tLEFT,") ? 1 : -1;
        ctx.movement.setServoTurn(true, dir);
        return () => {
          ctx.movement.setServoTurn(false);
        };
      }
      if (cmd === "SERVO_FORWARD" || cmd.startsWith("SERVO_FORWARD,")) {
        if (cfg.parts) ctx.movement.setServoMove(true, 1);
        return null;
      }
      if (cmd === "SERVO_BACKWARD" || cmd.startsWith("SERVO_BACKWARD,")) {
        if (cfg.parts) ctx.movement.setServoMove(true, -1);
        return null;
      }
      if (cmd === "SERVO_LEFT" || cmd.startsWith("SERVO_LEFT,")) {
        if (cfg.parts) ctx.movement.setServoTurn(true, 1);
        return null;
      }
      if (cmd === "SERVO_RIGHT" || cmd.startsWith("SERVO_RIGHT,")) {
        if (cfg.parts) ctx.movement.setServoTurn(true, -1);
        return null;
      }
      if (cmd === "SERVO_STOP" || cmd.startsWith("SERVO_STOP,")) {
        if (cfg.parts) ctx.movement.stopServo();
        return null;
      }
      if (cmd.startsWith("DC_tFORWARD,") || cmd.startsWith("DC_tBACKWARD,")) {
        if (!cfg.radar) return null;
        const dir = cmd.startsWith("DC_tFORWARD,") ? 1 : -1;
        ctx.movement.setRadar(true, dir);
        return () => {
          ctx.movement.setRadar(false);
        };
      }
      if (cmd === "DC_FORWARD" || cmd.startsWith("DC_FORWARD,")) {
        if (cfg.radar) ctx.movement.setRadar(true, 1);
        return null;
      }
      if (cmd === "DC_BACKWARD" || cmd.startsWith("DC_BACKWARD,")) {
        if (cfg.radar) ctx.movement.setRadar(true, -1);
        return null;
      }
      if (cmd === "DC_STOP" || cmd.startsWith("DC_STOP,")) {
        if (cfg.radar) ctx.movement.setRadar(false);
        return null;
      }
      if (cmd === "GUN_FIRE" || cmd.startsWith("GUN_FIRE,")) {
        if (cfg.launch) {
          ctx.rocket.setRocketLaunch(true, false);
          ctx.audio.playRocketLaunch();
        }
        if (cfg.parts && ctx.gun && ctx.gun.gunMesh) {
          ctx.gun.setGunFire();
          ctx.audio.playGunFire();
        }
        if (!cfg.launch && !cfg.parts) {
          ctx.audio.playGunFire();
        }
        return null;
      }
      if (cmd === "CLEAR_DISPLAY" || cmd.startsWith("CLEAR_DISPLAY")) {
        if (cfg.parts) ctx.leds.clear();
        return null;
      }
      if (cmd.startsWith("CLEAR_RECT,")) {
        if (!cfg.parts) return null;
        const parts = cmd.split(",");
        const x = parseInt(parts[1], 10) || 0;
        const y = parseInt(parts[2], 10) || 0;
        const w = parseInt(parts[3], 10) || 0;
        const h = parseInt(parts[4], 10) || 0;
        ctx.leds.clearRect(x, y, w, h);
        return null;
      }
      if (cmd.startsWith("MSG,")) {
        if (!cfg.parts) return null;
        ctx.leds.clear();
        let rem = cmd.slice(4) || "Hello";
        const MAX_CHARS = 16;
        const LINE_H = 8;
        for (let yp = 0; rem && yp < 64; yp += LINE_H) {
          ctx.leds.text(0, yp, rem.slice(0, MAX_CHARS));
          rem = rem.slice(MAX_CHARS);
        }
        return null;
      }
      if (cmd.startsWith("MSG_XY,")) {
        if (!cfg.parts) return null;
        const parts = cmd.split(",");
        const x = parseInt(parts[1], 10) || 0;
        const y = parseInt(parts[2], 10) || 0;
        const text = parts.slice(3).join(",") || "Hello";
        ctx.leds.text(x, y, text);
        return null;
      }
      if (cmd.startsWith("ICON,")) {
        if (!cfg.parts) return null;
        const parts = cmd.split(",");
        const name = (parts[1] || "").trim().toLowerCase();
        const x = parseInt(parts[2], 10) || 0;
        const y = parseInt(parts[3], 10) || 0;
        ctx.leds.icon(name, x, y);
        return null;
      }
      return null;
    }
    // 센서 컴포넌트 질의(SIMULATOR.md 3단계) — 첫 번째 유효 측정값을 쓴다.
    measureComponentDistance() {
      var _a, _b;
      for (const item of ((_a = this.ctx.objects) == null ? void 0 : _a.items) || []) {
        const comp = (_b = item.components) == null ? void 0 : _b.UltraSonic;
        if (!(comp == null ? void 0 : comp.measure)) continue;
        const v = comp.measure(this.ctx, item);
        if (v != null) return v;
      }
      return null;
    }
    measureComponentMagnet() {
      var _a, _b;
      for (const item of ((_a = this.ctx.objects) == null ? void 0 : _a.items) || []) {
        const comp = (_b = item.components) == null ? void 0 : _b.Magnet;
        if (!(comp == null ? void 0 : comp.measure)) continue;
        const v = comp.measure(this.ctx, item);
        if (v != null) return v;
      }
      return null;
    }
    // 명령 효과 = 레거시 토픽 효과 + 컴포넌트 라우팅(SIMULATOR.md 2장) 합성.
    // 둘 다 cleanup 을 반환할 수 있어 합쳐서 돌려준다.
    applyEffect(cmd) {
      var _a, _b;
      const topicCleanup = this.applyTopicEffect(cmd);
      const componentCleanup = ((_b = (_a = this.ctx.objects) == null ? void 0 : _a.routeCommand) == null ? void 0 : _b.call(_a, cmd)) || null;
      if (topicCleanup && componentCleanup) {
        return () => {
          topicCleanup();
          componentCleanup();
        };
      }
      return topicCleanup || componentCleanup;
    }
    cancelActiveWait() {
      if (this.activeWaitCancel) this.activeWaitCancel();
    }
    async simSink(command, waitForResponse) {
      const ctx = this.ctx;
      const ackMs = waitForResponse ? 100 : 20;
      ctx.logLine(`\u2192 ${command}`, waitForResponse ? "tx-ack" : "tx");
      let holdMs = 0;
      let distMeasured = null;
      const wait = (ms) => new Promise((resolve) => {
        const id = setTimeout(() => {
          this.activeWaitCancel = null;
          resolve();
        }, ms);
        this.activeWaitCancel = () => {
          clearTimeout(id);
          this.activeWaitCancel = null;
          resolve();
        };
      });
      if (command.startsWith("BATCH;")) {
        await wait(ackMs);
        const subs = command.slice("BATCH;".length).split("|").filter((s) => s.length > 0);
        for (const sub of subs) {
          if (!ctx.state.isExecuting) break;
          const subHoldMs = Math.round(this.commandHoldSeconds(sub) * 1e3);
          const cleanup = this.applyEffect(sub);
          if (subHoldMs > 0) {
            await wait(subHoldMs);
          }
          cleanup == null ? void 0 : cleanup();
          holdMs += subHoldMs;
        }
      } else {
        holdMs = Math.round(this.commandHoldSeconds(command) * 1e3);
        const cleanup = this.applyEffect(command);
        await wait(ackMs + holdMs);
        if (command.startsWith("DISTANCE")) {
          const compDist = this.measureComponentDistance();
          distMeasured = compDist != null ? compDist : ctx.movement ? ctx.movement.measureDistance() : null;
        }
        cleanup == null ? void 0 : cleanup();
      }
      const total = ackMs + holdMs;
      let reply = "1";
      if (command.startsWith("DISTANCE")) {
        reply = `DIST:${distMeasured != null ? distMeasured : 30}`;
      } else if (command.startsWith("MAGNET")) {
        const compMag = this.measureComponentMagnet();
        reply = `MAG:${compMag != null ? compMag : 0}`;
      }
      const holdNote = holdMs > 0 ? ` + \uB300\uAE30 ${holdMs}ms` : "";
      ctx.logLine(`     \u21A9 ${reply}  (+${total}ms, ${waitForResponse ? "Ack" : "\uBE44Ack"}${holdNote})`, "rx");
      return reply;
    }
  };

  // Sim_Parts/components.js
  function forOwnMeshes(root, fn) {
    var _a;
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== root && ((_a = node.userData) == null ? void 0 : _a.simObject)) continue;
      if (node.isMesh) fn(node);
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
  }
  var LED_LIGHT = { intensity: 2.5, distance: 5, decay: 2 };
  function createLedComponent(ctx, fields = {}) {
    const ledNo = Math.max(0, Math.min(5, parseInt(fields.led_no, 10) || 0));
    const saved = /* @__PURE__ */ new Map();
    let light = null;
    const lightColorFor = (simObject) => {
      var _a, _b, _c, _d, _e;
      const color = new ctx.THREE.Color(16759603);
      const glow = (_b = (_a = simObject.metadata) == null ? void 0 : _a.colors) == null ? void 0 : _b.emissive;
      if (glow) {
        color.setRGB((_c = glow[0]) != null ? _c : 1, (_d = glow[1]) != null ? _d : 1, (_e = glow[2]) != null ? _e : 1, "srgb");
        return color;
      }
      let found = null;
      forOwnMeshes(simObject.root, (mesh) => {
        if (found) return;
        const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (m == null ? void 0 : m.map) {
          found = new ctx.THREE.Color(16777215);
          return;
        }
        if ((m == null ? void 0 : m.color) && m.color.r + m.color.g + m.color.b > 0.05) found = m.color.clone();
      });
      return found || color;
    };
    const setLight = (simObject, t) => {
      var _a, _b;
      if (t > 0) {
        if (!light) {
          light = new ctx.THREE.PointLight(16777215, 0, LED_LIGHT.distance, LED_LIGHT.decay);
          simObject.root.add(light);
        }
        light.color.copy(lightColorFor(simObject));
        light.intensity = LED_LIGHT.intensity * t;
      } else if (light) {
        (_a = light.parent) == null ? void 0 : _a.remove(light);
        (_b = light.dispose) == null ? void 0 : _b.call(light);
        light = null;
      }
    };
    const setEmit = (simObject, intensity) => {
      var _a;
      setLight(simObject, Math.max(0, Math.min(1, intensity)));
      const colors = (_a = simObject.metadata) == null ? void 0 : _a.colors;
      forOwnMeshes(simObject.root, (mesh) => {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j;
          if (!m || m.emissive === void 0) return;
          if (colors) {
            const t = Math.max(0, Math.min(1, intensity));
            const base = colors.base || [1, 1, 1, 1];
            const glow = colors.emissive || [1, 1, 1, 1];
            m.color.setRGB(((_a2 = base[0]) != null ? _a2 : 1) * (1 - t), ((_b = base[1]) != null ? _b : 1) * (1 - t), ((_c = base[2]) != null ? _c : 1) * (1 - t), "srgb");
            m.emissive.setRGB((_d = glow[0]) != null ? _d : 0, (_e = glow[1]) != null ? _e : 0, (_f = glow[2]) != null ? _f : 0, "srgb");
            m.emissiveIntensity = t;
            m.opacity = Math.max(0, Math.min(1, ((_g = base[3]) != null ? _g : 1) * (1 - t) + ((_h = glow[3]) != null ? _h : 1) * t));
            m.transparent = m.opacity < 1;
            m.needsUpdate = true;
            return;
          }
          if (!saved.has(m)) {
            saved.set(m, {
              emissive: m.emissive.clone(),
              intensity: (_i = m.emissiveIntensity) != null ? _i : 1,
              emissiveMap: (_j = m.emissiveMap) != null ? _j : null
            });
          }
          if (intensity > 0) {
            if (m.map) {
              m.emissiveMap = m.map;
              m.emissive.set(16777215);
            } else {
              const base = m.color && m.color.r + m.color.g + m.color.b > 0.05 ? m.color : null;
              if (base) m.emissive.copy(base);
              else m.emissive.set(16759603);
            }
            m.emissiveIntensity = 0.4 + intensity * 1.6;
          } else {
            const orig = saved.get(m);
            m.emissive.copy(orig.emissive);
            m.emissiveIntensity = orig.intensity;
            m.emissiveMap = orig.emissiveMap;
          }
          m.needsUpdate = true;
        });
      });
    };
    return {
      declarative: true,
      type: "LED",
      fields: { led_no: ledNo },
      onCommand(cmd, _ctx, simObject) {
        if (cmd.startsWith("LED_ON,")) {
          const parts = cmd.split(",");
          if (parseInt(parts[1], 10) === ledNo) {
            const b = parseFloat(parts[2]);
            setEmit(simObject, Math.max(0, Math.min(1, Number.isFinite(b) ? b : 1)));
          }
          return null;
        }
        if (cmd.startsWith("LED_OFF,")) {
          const arg = cmd.split(",")[1];
          if (arg === "ALL" || parseInt(arg, 10) === ledNo) setEmit(simObject, 0);
          return null;
        }
        if (cmd.startsWith("[") && cmd.endsWith("]")) {
          const values = cmd.slice(1, -1).trim().split(/\s+/);
          if (values.length > ledNo) {
            setEmit(simObject, Math.max(0, Math.min(1, parseFloat(values[ledNo]) || 0)));
          }
          return null;
        }
        return null;
      },
      dispose(_ctx, simObject) {
        setEmit(simObject, 0);
        saved.clear();
      }
    };
  }
  function makeRingTexture(THREE) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.strokeStyle = "rgba(140,220,255,0.95)";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }
  function createBuzzerComponent(ctx) {
    const THREE = ctx.THREE;
    let ringTex = null;
    const waves = [];
    let activeLeft = 0;
    let spawnCool = 0;
    const spawnRing = (simObject) => {
      if (!ringTex) ringTex = makeRingTexture(THREE);
      const mat = new THREE.SpriteMaterial({
        map: ringTex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      simObject.root.getWorldPosition(sprite.position);
      ctx.scene.add(sprite);
      waves.push({ sprite, age: 0 });
    };
    const WAVE_LIFE = 0.9;
    const WAVE_MAX_R = 1.1;
    return {
      declarative: true,
      type: "Buzzer",
      fields: {},
      get activeWaveCount() {
        return waves.length;
      },
      onCommand(cmd, cctx, simObject) {
        var _a, _b, _c, _d, _e;
        if (!cmd.startsWith("BUZZER_ON,")) return null;
        const parts = cmd.split(",");
        const hz = parseFloat(parts[1]) || 440;
        const sec = Math.max(0.15, parseFloat(parts[2]) || 0.3);
        activeLeft = Math.max(activeLeft, sec);
        spawnCool = 0;
        spawnRing(simObject);
        if (!((_a = cctx.cfg) == null ? void 0 : _a.chest) && !((_b = cctx.cfg) == null ? void 0 : _b.launch) && !((_c = cctx.cfg) == null ? void 0 : _c.parts)) {
          (_e = (_d = cctx.audio) == null ? void 0 : _d.playBeep) == null ? void 0 : _e.call(_d, hz, sec);
        }
        return null;
      },
      update(dt, _ctx, simObject) {
        if (activeLeft > 0) {
          activeLeft -= dt;
          spawnCool -= dt;
          if (spawnCool <= 0) {
            spawnRing(simObject);
            spawnCool = 0.28;
          }
        }
        for (let i = waves.length - 1; i >= 0; i--) {
          const w = waves[i];
          w.age += dt;
          const t = Math.min(1, w.age / WAVE_LIFE);
          const s = 0.15 + t * WAVE_MAX_R * 2;
          w.sprite.scale.set(s, s, 1);
          w.sprite.material.opacity = 0.85 * (1 - t);
          if (t >= 1) {
            ctx.scene.remove(w.sprite);
            w.sprite.material.dispose();
            waves.splice(i, 1);
          }
        }
      },
      dispose() {
        var _a;
        waves.forEach((w) => {
          ctx.scene.remove(w.sprite);
          w.sprite.material.dispose();
        });
        waves.length = 0;
        (_a = ringTex == null ? void 0 : ringTex.dispose) == null ? void 0 : _a.call(ringTex);
        ringTex = null;
      }
    };
  }
  function createOledComponent(ctx) {
    const THREE = ctx.THREE;
    const PX = 2;
    const canvas = document.createElement("canvas");
    canvas.width = 128 * PX;
    canvas.height = 64 * PX;
    const g = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    let quad = null;
    const clear = () => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, canvas.width, canvas.height);
      tex.needsUpdate = true;
    };
    const clearRect = (x, y, w, h) => {
      g.fillStyle = "#000";
      g.fillRect(x * PX, y * PX, w * PX, h * PX);
      tex.needsUpdate = true;
    };
    const text = (x, y, str) => {
      g.fillStyle = "#e8f4ff";
      g.font = `${8 * PX}px 'D2Coding', Menlo, monospace`;
      g.textBaseline = "top";
      g.fillText(str, x * PX, y * PX);
      tex.needsUpdate = true;
    };
    const icon = (name, x, y) => {
      const bits = OLED_ICONS[name];
      if (!bits) return;
      g.fillStyle = "#e8f4ff";
      for (let row = 0; row < 32; row++) {
        for (let byte = 0; byte < 4; byte++) {
          const v = bits[row * 4 + byte];
          for (let bit = 0; bit < 8; bit++) {
            if (v & 128 >> bit) {
              g.fillRect((x + byte * 8 + bit) * PX, (y + row) * PX, PX, PX);
            }
          }
        }
      }
      tex.needsUpdate = true;
    };
    return {
      declarative: true,
      type: "Oled",
      fields: {},
      onAdd(_ctx, simObject) {
        clear();
        quad = new THREE.Mesh(
          new THREE.PlaneGeometry(0.64, 0.32),
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
        );
        quad.position.z = 0.012;
        simObject.root.add(quad);
      },
      onCommand(cmd) {
        if (cmd === "CLEAR_DISPLAY" || cmd.startsWith("CLEAR_DISPLAY")) {
          clear();
          return null;
        }
        if (cmd.startsWith("CLEAR_RECT,")) {
          const p = cmd.split(",");
          clearRect(parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0, parseInt(p[3], 10) || 0, parseInt(p[4], 10) || 0);
          return null;
        }
        if (cmd.startsWith("MSG,")) {
          clear();
          let rem = cmd.slice(4) || "Hello";
          for (let yp = 0; rem && yp < 64; yp += 8) {
            text(0, yp, rem.slice(0, 16));
            rem = rem.slice(16);
          }
          return null;
        }
        if (cmd.startsWith("MSG_XY,")) {
          const p = cmd.split(",");
          text(parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0, p.slice(3).join(",") || "Hello");
          return null;
        }
        if (cmd.startsWith("ICON,")) {
          const p = cmd.split(",");
          icon((p[1] || "").trim().toLowerCase(), parseInt(p[2], 10) || 0, parseInt(p[3], 10) || 0);
          return null;
        }
        return null;
      },
      dispose(_ctx, simObject) {
        if (quad) {
          simObject.root.remove(quad);
          quad.geometry.dispose();
          quad.material.dispose();
          quad = null;
        }
        tex.dispose();
      }
    };
  }
  function fieldVec(THREE, arr, { normalize = true } = {}) {
    if (!Array.isArray(arr) || arr.length !== 3) return null;
    const v = new THREE.Vector3(+arr[0] || 0, +arr[1] || 0, +arr[2] || 0);
    if (normalize) {
      if (v.lengthSq() < 1e-12) return null;
      v.normalize();
    }
    return v;
  }
  function rotateAboutParentAxis(THREE, obj, axisParent, angle, pivotLocal) {
    const q = new THREE.Quaternion().setFromAxisAngle(axisParent, angle);
    if (pivotLocal) {
      const pivot = pivotLocal.clone().applyQuaternion(obj.quaternion).add(obj.position);
      obj.position.sub(pivot).applyQuaternion(q).add(pivot);
    }
    obj.quaternion.premultiply(q);
  }
  function localOffsetToWorld(THREE, obj, offsetLocal) {
    return obj.getWorldPosition(new THREE.Vector3()).add(offsetLocal.clone().applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion())));
  }
  function createDcComponent(ctx, fields = {}) {
    const THREE = ctx.THREE;
    const axisRot = fieldVec(THREE, fields.axis_rotation);
    const axisMove = fieldVec(THREE, fields.axis_translate);
    const rotOffset = fieldVec(THREE, fields.rotation_offset, { normalize: false });
    const ROT_SPEED = 6;
    const MOVE_SPEED = 0.5;
    let dir = 0, speed = 1;
    const stop = () => {
      dir = 0;
    };
    const normSpeed = (v) => {
      const n = parseFloat(v);
      if (!isFinite(n) || n <= 0) return 1;
      return Math.max(0.05, Math.min(1, n > 1 ? n / 100 : n));
    };
    const outFields = {};
    if (axisRot) outFields.axis_rotation = [...fields.axis_rotation];
    if (axisMove) outFields.axis_translate = [...fields.axis_translate];
    if (rotOffset) outFields.rotation_offset = [rotOffset.x, rotOffset.y, rotOffset.z];
    return {
      declarative: true,
      type: "DC",
      fields: outFields,
      // 편집기 표시용 — 회전축이 지나는 점(객체 로컬 기준점). null 이면 원점 통과
      getPivotLocal(field) {
        return field === "rotation_offset" ? rotOffset : null;
      },
      onCommand(cmd) {
        if (cmd === "STOP_ALL" || cmd === "DC_STOP" || cmd.startsWith("DC_STOP,")) {
          stop();
          return null;
        }
        if (cmd.startsWith("DC_tFORWARD,") || cmd.startsWith("DC_tBACKWARD,")) {
          dir = cmd.startsWith("DC_tFORWARD,") ? 1 : -1;
          speed = 1;
          return stop;
        }
        if (cmd === "DC_FORWARD" || cmd.startsWith("DC_FORWARD,")) {
          dir = 1;
          speed = normSpeed(cmd.split(",")[1]);
          return null;
        }
        if (cmd === "DC_BACKWARD" || cmd.startsWith("DC_BACKWARD,")) {
          dir = -1;
          speed = normSpeed(cmd.split(",")[1]);
          return null;
        }
        return null;
      },
      update(dt, _c, simObject) {
        if (!dir) return;
        if (axisRot) rotateAboutParentAxis(THREE, simObject.root, axisRot, dir * speed * ROT_SPEED * dt, rotOffset);
        if (axisMove) simObject.root.position.addScaledVector(axisMove, dir * speed * MOVE_SPEED * dt);
      },
      dispose() {
        stop();
      }
    };
  }
  function createServoComponent(ctx, fields = {}) {
    const THREE = ctx.THREE;
    const wheel = fields.wheel === "right" ? "right" : fields.wheel === "neutral" ? "neutral" : "left";
    const axisRot = fieldVec(THREE, fields.axis_rotation);
    const axisDir = fieldVec(THREE, fields.axis_direction);
    const axisTurn = fieldVec(THREE, fields.axis_turn);
    const rotOffset = fieldVec(THREE, fields.rotation_offset, { normalize: false });
    const turnOffset = fieldVec(THREE, fields.turn_offset, { normalize: false });
    const SPIN = 8;
    const MOVE = 0.4;
    const TURN = 1.5;
    let move = 0, turn = 0;
    const stop = () => {
      move = 0;
      turn = 0;
    };
    const outFields = { wheel };
    if (axisRot) outFields.axis_rotation = [...fields.axis_rotation];
    if (axisDir) outFields.axis_direction = [...fields.axis_direction];
    if (axisTurn) outFields.axis_turn = [...fields.axis_turn];
    if (rotOffset) outFields.rotation_offset = [rotOffset.x, rotOffset.y, rotOffset.z];
    if (turnOffset) outFields.turn_offset = [turnOffset.x, turnOffset.y, turnOffset.z];
    return {
      declarative: true,
      type: "Servo",
      fields: outFields,
      // 편집기 표시용 — 각 축이 지나는 점(객체 로컬 기준점). null 이면 원점 통과
      getPivotLocal(field) {
        if (field === "rotation_offset") return rotOffset;
        if (field === "turn_offset") return turnOffset;
        return null;
      },
      onCommand(cmd) {
        if (cmd === "STOP_ALL" || cmd === "SERVO_STOP" || cmd.startsWith("SERVO_STOP,")) {
          stop();
          return null;
        }
        const is = (p) => cmd.startsWith(p);
        if (is("SERVO_tFORWARD,")) {
          move = 1;
          turn = 0;
          return stop;
        }
        if (is("SERVO_tBACKWARD,")) {
          move = -1;
          turn = 0;
          return stop;
        }
        if (is("SERVO_tLEFT,")) {
          turn = 1;
          move = 0;
          return stop;
        }
        if (is("SERVO_tRIGHT,")) {
          turn = -1;
          move = 0;
          return stop;
        }
        if (cmd === "SERVO_FORWARD" || is("SERVO_FORWARD,")) {
          move = 1;
          turn = 0;
          return null;
        }
        if (cmd === "SERVO_BACKWARD" || is("SERVO_BACKWARD,")) {
          move = -1;
          turn = 0;
          return null;
        }
        if (cmd === "SERVO_LEFT" || is("SERVO_LEFT,")) {
          turn = 1;
          move = 0;
          return null;
        }
        if (cmd === "SERVO_RIGHT" || is("SERVO_RIGHT,")) {
          turn = -1;
          move = 0;
          return null;
        }
        return null;
      },
      update(dt, _c, simObject) {
        const root = simObject.root;
        if (move !== 0) {
          if (axisRot) rotateAboutParentAxis(THREE, root, axisRot, (wheel === "right" ? -1 : 1) * move * SPIN * dt, rotOffset);
          if (axisDir) root.position.addScaledVector(axisDir, move * MOVE * dt);
        }
        if (turn !== 0) {
          const turnSpin = wheel === "left" ? -1 : wheel === "right" ? 1 : 0;
          if (axisRot && turnSpin !== 0) rotateAboutParentAxis(THREE, root, axisRot, turnSpin * turn * SPIN * dt, rotOffset);
          if (axisTurn) rotateAboutParentAxis(THREE, root, axisTurn, turn * TURN * dt, turnOffset);
        }
      },
      dispose() {
        stop();
      }
    };
  }
  function createUltraSonicComponent(ctx, fields = {}) {
    const THREE = ctx.THREE;
    const dirLocal = fieldVec(THREE, fields.detect_direction) || new THREE.Vector3(0, 0, 1);
    const ray = new THREE.Raycaster();
    const under = (node, root) => {
      let n = node;
      while (n) {
        if (n === root) return true;
        n = n.parent;
      }
      return false;
    };
    return {
      declarative: true,
      type: "UltraSonic",
      fields: { detect_direction: [dirLocal.x, dirLocal.y, dirLocal.z] },
      measure(cctx, simObject) {
        var _a, _b, _c;
        cctx.scene.updateMatrixWorld(true);
        const origin = simObject.root.getWorldPosition(new THREE.Vector3());
        const dir = dirLocal.clone().applyQuaternion(simObject.root.getWorldQuaternion(new THREE.Quaternion())).normalize();
        ray.set(origin, dir);
        ray.far = 50;
        const hits = ray.intersectObjects(cctx.scene.children, true);
        for (const h of hits) {
          if (!h.object.isMesh || h.object.isSprite) continue;
          if (under(h.object, simObject.root)) continue;
          if (((_a = cctx.editor) == null ? void 0 : _a.transform) && under(h.object, cctx.editor.transform)) continue;
          if (((_b = cctx.editor) == null ? void 0 : _b.boxHelper) && under(h.object, cctx.editor.boxHelper)) continue;
          if (((_c = cctx.editor) == null ? void 0 : _c.axisHandle) && under(h.object, cctx.editor.axisHandle)) continue;
          return Math.round(h.distance * 100 * 100) / 100;
        }
        return null;
      }
    };
  }
  var MAGNET_RADIUS = 0.05;
  function createMagnetComponent(ctx, fields = {}) {
    const THREE = ctx.THREE;
    const point = fieldVec(THREE, fields.detection_point, { normalize: false }) || new THREE.Vector3();
    const box = new THREE.Box3();
    return {
      declarative: true,
      type: "Magnet",
      fields: { detection_point: [point.x, point.y, point.z] },
      measure(cctx, simObject) {
        var _a, _b;
        cctx.scene.updateMatrixWorld(true);
        const sensor = localOffsetToWorld(THREE, simObject.root, point);
        for (const item of ((_a = cctx.objects) == null ? void 0 : _a.items) || []) {
          if (item === simObject || !((_b = item.components) == null ? void 0 : _b.Metal)) continue;
          box.setFromObject(item.root);
          if (box.distanceToPoint(sensor) <= MAGNET_RADIUS) return 1;
        }
        return 0;
      }
    };
  }
  function createMetalComponent() {
    return { declarative: true, type: "Metal", fields: {} };
  }
  function makeSmokeTexture(THREE) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 60);
    grad.addColorStop(0, "rgba(210,210,215,0.9)");
    grad.addColorStop(0.6, "rgba(160,160,168,0.45)");
    grad.addColorStop(1, "rgba(140,140,148,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }
  function createGunComponent(ctx, fields = {}) {
    const THREE = ctx.THREE;
    const propel = fieldVec(THREE, fields.propel_direction);
    const expl = fieldVec(THREE, fields.explosion, { normalize: false });
    const FLY_SPEED = 6;
    const FLY_TIME = 1.2;
    const RETURN_TIME = 1;
    const SMOKE_LIFE = 1;
    let smokeTex = null;
    let flight = null;
    let home = null;
    let returning = null;
    const smokes = [];
    const outFields = {};
    if (propel) outFields.propel_direction = [propel.x, propel.y, propel.z];
    if (expl) outFields.explosion = [expl.x, expl.y, expl.z];
    const restoreHome = (simObject) => {
      flight = null;
      returning = null;
      if (!home) return;
      simObject.root.position.copy(home);
      home = null;
    };
    const spawnSmoke = (at) => {
      if (!smokeTex) smokeTex = makeSmokeTexture(THREE);
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.8, depthWrite: false });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, i * 0.06, (Math.random() - 0.5) * 0.15));
        sprite.scale.setScalar(0.18 + i * 0.06);
        ctx.scene.add(sprite);
        smokes.push({ sprite, age: -i * 0.12, rise: 0.35 + Math.random() * 0.2 });
      }
    };
    return {
      declarative: true,
      type: "Gun",
      fields: outFields,
      get isFlying() {
        return !!flight;
      },
      onCommand(cmd, _c, simObject) {
        if (cmd === "SIM_END") {
          flight = null;
          if (home) returning = { from: simObject.root.position.clone(), age: 0 };
          return null;
        }
        if (cmd === "SIM_START") {
          if (returning || home) restoreHome(simObject);
          return null;
        }
        if (cmd !== "GUN_FIRE" && !cmd.startsWith("GUN_FIRE,")) return null;
        ctx.scene.updateMatrixWorld(true);
        if (expl) spawnSmoke(localOffsetToWorld(THREE, simObject.root, expl));
        if (!propel) return null;
        const parentObj = simObject.root.parent;
        const dirWorld = propel.clone();
        if (parentObj) dirWorld.applyQuaternion(parentObj.getWorldQuaternion(new THREE.Quaternion()));
        dirWorld.normalize();
        if (!home) home = simObject.root.position.clone();
        flight = { vel: dirWorld.multiplyScalar(FLY_SPEED), age: 0 };
        return null;
      },
      update(dt, _ctx, simObject) {
        if (returning) {
          returning.age += dt;
          const t = Math.min(1, returning.age / RETURN_TIME);
          const ease = t * t * (3 - 2 * t);
          simObject.root.position.lerpVectors(returning.from, home, ease);
          if (t >= 1) {
            home = null;
            returning = null;
          }
        }
        if (flight) {
          flight.age += dt;
          if (flight.age >= FLY_TIME) {
            flight = null;
          } else {
            const delta = flight.vel.clone().multiplyScalar(dt);
            const parent = simObject.root.parent;
            if (parent) {
              delta.applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
            }
            simObject.root.position.add(delta);
          }
        }
        for (let i = smokes.length - 1; i >= 0; i--) {
          const s = smokes[i];
          s.age += dt;
          if (s.age < 0) continue;
          const t = Math.min(1, s.age / SMOKE_LIFE);
          s.sprite.position.y += s.rise * dt;
          s.sprite.scale.setScalar(0.2 + t * 0.65);
          s.sprite.material.opacity = 0.8 * (1 - t);
          if (t >= 1) {
            ctx.scene.remove(s.sprite);
            s.sprite.material.dispose();
            smokes.splice(i, 1);
          }
        }
      },
      dispose(_ctx, simObject) {
        var _a;
        restoreHome(simObject);
        smokes.forEach((s) => {
          ctx.scene.remove(s.sprite);
          s.sprite.material.dispose();
        });
        smokes.length = 0;
        (_a = smokeTex == null ? void 0 : smokeTex.dispose) == null ? void 0 : _a.call(smokeTex);
        smokeTex = null;
      }
    };
  }
  var FACTORIES = {
    LED: createLedComponent,
    Buzzer: createBuzzerComponent,
    Oled: createOledComponent,
    DC: createDcComponent,
    Servo: createServoComponent,
    UltraSonic: createUltraSonicComponent,
    Magnet: createMagnetComponent,
    Metal: createMetalComponent,
    Gun: createGunComponent
  };
  var COMPONENT_TYPES = Object.keys(FACTORIES);
  function createComponent(ctx, type, fields = {}) {
    const make = FACTORIES[type];
    if (!make) throw new Error(`\uC54C \uC218 \uC5C6\uB294 \uCEF4\uD3EC\uB10C\uD2B8: ${type}`);
    return make(ctx, fields);
  }
  function attachComponent(ctx, simObject, type, fields = {}) {
    var _a;
    if (!simObject) return null;
    detachComponent(ctx, simObject, type);
    const comp = createComponent(ctx, type, fields);
    simObject.components[type] = comp;
    (_a = comp.onAdd) == null ? void 0 : _a.call(comp, ctx, simObject);
    if (ctx.objects) ctx.objects.version += 1;
    return comp;
  }
  function detachComponent(ctx, simObject, type) {
    var _a, _b;
    const comp = (_a = simObject == null ? void 0 : simObject.components) == null ? void 0 : _a[type];
    if (!comp) return;
    (_b = comp.dispose) == null ? void 0 : _b.call(comp, ctx, simObject);
    delete simObject.components[type];
    if (ctx.objects) ctx.objects.version += 1;
  }
  function serializeComponents(simObject) {
    return Object.values(simObject.components || {}).filter((c) => c && c.declarative).map((c) => ({ type: c.type, fields: { ...c.fields } }));
  }

  // Sim_Parts/sim_object.js
  function disposeObject3D(root) {
    var _a, _b, _c;
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== root && ((_a = node.userData) == null ? void 0 : _a.simObject)) continue;
      if (node.isMesh || node.isSprite) {
        (_c = (_b = node.geometry) == null ? void 0 : _b.dispose) == null ? void 0 : _c.call(_b);
        const material = node.material;
        (Array.isArray(material) ? material : [material]).forEach((m) => {
          var _a2, _b2, _c2;
          (_b2 = (_a2 = m == null ? void 0 : m.map) == null ? void 0 : _a2.dispose) == null ? void 0 : _b2.call(_a2);
          (_c2 = m == null ? void 0 : m.dispose) == null ? void 0 : _c2.call(m);
        });
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  var SimulationObject = class {
    constructor({
      id = "",
      type = "object",
      label = "Object",
      root,
      components = {},
      selectable = true,
      spawned = false,
      metadata = {}
    }) {
      if (!root) throw new Error("SimulationObject requires a root Object3D.");
      this.id = id;
      this.type = type;
      this.label = label;
      this.root = root;
      this.components = components;
      this.selectable = selectable;
      this.spawned = spawned;
      this.metadata = metadata;
      this.disposed = false;
      this.childHolder = null;
      this.root.userData.simObject = this;
      this.root.userData.simObjectType = type;
      this.root.userData.simEditorLabel = label;
      this.root.userData.simEditorSpawned = spawned;
    }
    setWorldPosition(worldPoint, parent) {
      const localPoint = worldPoint.clone();
      const ref = this.root.parent || parent;
      if (ref) {
        ref.updateWorldMatrix(true, false);
        ref.worldToLocal(localPoint);
      }
      localPoint.y += this.metadata.groundOffset || 0;
      this.root.position.copy(localPoint);
    }
    // 부모 스케일이 하위로 전파되지 않도록 역스케일을 유지한다(매 프레임 동기화).
    syncChildHolderScale() {
      if (!this.childHolder) return;
      const s = this.root.scale;
      const inv = (v) => Math.abs(v) > 1e-6 ? 1 / v : 1;
      this.childHolder.scale.set(inv(s.x), inv(s.y), inv(s.z));
    }
    onAdd(ctx) {
      Object.values(this.components).forEach((component) => {
        var _a;
        (_a = component == null ? void 0 : component.onAdd) == null ? void 0 : _a.call(component, ctx, this);
      });
    }
    update(dt, ctx) {
      Object.values(this.components).forEach((component) => {
        var _a;
        (_a = component == null ? void 0 : component.update) == null ? void 0 : _a.call(component, dt, ctx, this);
      });
      this.syncChildHolderScale();
    }
    dispose(ctx) {
      var _a;
      if (this.disposed) return;
      this.disposed = true;
      Object.values(this.components).forEach((component) => {
        var _a2;
        (_a2 = component == null ? void 0 : component.dispose) == null ? void 0 : _a2.call(component, ctx, this);
      });
      disposeObject3D(this.root);
      (_a = this.root.parent) == null ? void 0 : _a.remove(this.root);
      this.root.userData.simObject = null;
    }
  };
  var SimulationObjectRegistry = class {
    constructor(ctx) {
      this.ctx = ctx;
      this.items = [];
      this.byRoot = /* @__PURE__ */ new Map();
      this.nextId = 1;
      this.version = 0;
    }
    makeId(type = "object") {
      return `${type}-${this.nextId++}`;
    }
    // 부모가 simObject 면 그 자식 홀더(역스케일 그룹)에 부착 — 스케일은 개별 객체에
    // 한정되고 하위 객체로 전달되지 않는다(2026-07-08 규약). 하위 오프셋 거리도 m 유지.
    getAttachPointFor(parentSim) {
      if (!parentSim.childHolder) {
        const holder = new this.ctx.THREE.Group();
        holder.name = "sim-children";
        parentSim.root.add(holder);
        parentSim.childHolder = holder;
        parentSim.syncChildHolderScale();
      }
      return parentSim.childHolder;
    }
    add(simObject, parent = this.ctx.scene) {
      var _a, _b, _c;
      if (!simObject.id) simObject.id = this.makeId(simObject.type);
      const parentSim = (_a = parent == null ? void 0 : parent.userData) == null ? void 0 : _a.simObject;
      const attachTo = parentSim ? this.getAttachPointFor(parentSim) : parent;
      if (!simObject.root.parent) attachTo.add(simObject.root);
      simObject.root.traverse((node) => {
        if (!node.isMesh || node.isSprite) return;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      this.items.push(simObject);
      this.byRoot.set(simObject.root, simObject);
      simObject.root.userData.simObjectId = simObject.id;
      simObject.onAdd(this.ctx);
      (((_b = simObject.metadata) == null ? void 0 : _b.autoComponents) || []).forEach(({ type, fields }) => {
        attachComponent(this.ctx, simObject, type, fields);
      });
      this.version += 1;
      if (simObject.selectable) {
        (_c = this.ctx.editor) == null ? void 0 : _c.register(simObject.root, simObject.label);
      }
      return simObject;
    }
    getByRoot(root) {
      let node = root;
      while (node) {
        const found = this.byRoot.get(node);
        if (found) return found;
        node = node.parent;
      }
      return null;
    }
    getParentOf(simObject) {
      var _a;
      let node = ((_a = simObject == null ? void 0 : simObject.root) == null ? void 0 : _a.parent) || null;
      while (node) {
        const parent = this.byRoot.get(node);
        if (parent) return parent;
        node = node.parent;
      }
      return null;
    }
    getChildrenOf(simObject) {
      return this.items.filter((item) => this.getParentOf(item) === simObject);
    }
    getRoots() {
      return this.items.filter((item) => !this.getParentOf(item));
    }
    update(dt) {
      this.items.forEach((item) => item.update(dt, this.ctx));
    }
    // 블록 코딩 명령을 모든 객체의 컴포넌트에 브로드캐스트한다(SIMULATOR.md 2장).
    // 컴포넌트 onCommand 가 cleanup 을 반환하면 모아 합성 cleanup 으로 돌려준다
    // (dispatch.simSink 가 hold 종료 후 호출).
    routeCommand(cmd) {
      const cleanups = [];
      this.items.forEach((item) => {
        Object.values(item.components || {}).forEach((component) => {
          var _a;
          try {
            const fn = (_a = component == null ? void 0 : component.onCommand) == null ? void 0 : _a.call(component, cmd, this.ctx, item);
            if (typeof fn === "function") cleanups.push(fn);
          } catch (err) {
            console.warn("component onCommand \uC624\uB958:", component == null ? void 0 : component.type, err);
          }
        });
      });
      if (cleanups.length === 0) return null;
      return () => cleanups.forEach((fn) => {
        try {
          fn();
        } catch (e) {
        }
      });
    }
    remove(simObject) {
      var _a;
      if (!simObject) return;
      this.getChildrenOf(simObject).forEach((child) => this.remove(child));
      (_a = this.ctx.editor) == null ? void 0 : _a.unregister(simObject.root);
      this.items = this.items.filter((item) => item !== simObject);
      this.byRoot.delete(simObject.root);
      this.version += 1;
      simObject.dispose(this.ctx);
    }
    dispose() {
      [...this.items].forEach((item) => this.remove(item));
    }
  };

  // Sim_Parts/object_factory.js
  function movementBoxComponent() {
    return {
      onAdd(ctx, simObject) {
        var _a;
        if (!ctx.worldGroup || !((_a = ctx.movement) == null ? void 0 : _a.boxes)) return;
        if (!ctx.movement.boxes.includes(simObject.root)) {
          ctx.movement.boxes.push(simObject.root);
        }
        simObject.root.userData.simEditorMovementBox = true;
      },
      dispose(ctx, simObject) {
        var _a;
        if (!((_a = ctx.movement) == null ? void 0 : _a.boxes)) return;
        ctx.movement.boxes = ctx.movement.boxes.filter((box) => box !== simObject.root);
      }
    };
  }
  var DEFAULT_COLORS = {
    box: { base: [1, 0.48, 0.35, 1], emissive: [1, 1, 1, 1] },
    sphere: { base: [0.31, 0.76, 1, 1], emissive: [1, 1, 1, 1] }
  };
  var defaultColors = (type) => ({
    base: [...DEFAULT_COLORS[type].base],
    emissive: [...DEFAULT_COLORS[type].emissive]
  });
  function applyObjectColors(simObject) {
    var _a, _b;
    const colors = (_a = simObject == null ? void 0 : simObject.metadata) == null ? void 0 : _a.colors;
    const mat = (_b = simObject == null ? void 0 : simObject.root) == null ? void 0 : _b.material;
    if (!colors || !mat || !mat.color) return;
    const [br = 1, bg = 1, bb = 1, ba = 1] = colors.base || [];
    mat.color.setRGB(br, bg, bb, "srgb");
    mat.opacity = Math.max(0, Math.min(1, ba));
    mat.transparent = mat.opacity < 1;
    if (mat.emissive) {
      mat.emissive.setRGB(0, 0, 0);
      mat.emissiveIntensity = 1;
    }
    mat.needsUpdate = true;
  }
  function createPrimitiveObject(ctx, type) {
    var _a;
    const THREE = ctx.THREE;
    const id = ((_a = ctx.objects) == null ? void 0 : _a.makeId(type)) || `${type}-${Date.now()}`;
    if (type === "sphere") {
      const root2 = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 24, 16),
        new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 })
      );
      root2.castShadow = true;
      root2.receiveShadow = true;
      const sim2 = new SimulationObject({
        id,
        type,
        label: `Sphere ${id.split("-").pop()}`,
        root: root2,
        spawned: true,
        metadata: { groundOffset: 0.35, colors: defaultColors("sphere") }
      });
      applyObjectColors(sim2);
      return sim2;
    }
    if (type === "oled") {
      const root2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.36, 0.02),
        new THREE.MeshStandardMaterial({ color: 657932, roughness: 0.35, metalness: 0.2 })
      );
      root2.castShadow = true;
      root2.receiveShadow = true;
      return new SimulationObject({
        id,
        type,
        label: `OLED ${id.split("-").pop()}`,
        root: root2,
        spawned: true,
        metadata: { groundOffset: 0.45, autoComponents: [{ type: "Oled", fields: {} }] }
      });
    }
    if (type === "marker") {
      const root2 = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.75, 12),
        new THREE.MeshStandardMaterial({ color: 15265271, roughness: 0.5, metalness: 0.1 })
      );
      pole.position.y = 0.375;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 20, 12),
        new THREE.MeshStandardMaterial({ color: 16761856, emissive: 16752640, emissiveIntensity: 0.8 })
      );
      head.position.y = 0.82;
      const light = new THREE.PointLight(16761856, 0.7, 2.2);
      light.position.copy(head.position);
      root2.add(pole, head, light);
      return new SimulationObject({
        id,
        type,
        label: `Marker ${id.split("-").pop()}`,
        root: root2,
        spawned: true
      });
    }
    const root = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.02 })
    );
    root.castShadow = true;
    root.receiveShadow = true;
    const sim = new SimulationObject({
      id,
      type: "box",
      label: `Box ${id.split("-").pop()}`,
      root,
      spawned: true,
      components: { movementBox: movementBoxComponent() },
      metadata: { groundOffset: 0.35, colors: defaultColors("box") }
    });
    applyObjectColors(sim);
    return sim;
  }
  function createGlbObject(ctx, url, label) {
    const THREE = ctx.THREE;
    return new Promise((resolve, reject) => {
      ctx.assets.loadModel(url, (model) => {
        var _a;
        model.traverse((node) => {
          if (!node.isMesh) return;
          node.castShadow = true;
          node.receiveShadow = true;
        });
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;
        const holder = new THREE.Group();
        holder.add(model);
        const id = ((_a = ctx.objects) == null ? void 0 : _a.makeId("glb")) || `glb-${Date.now()}`;
        resolve(new SimulationObject({
          id,
          type: "glb",
          label: label || url.split("/").pop().replace(/\.glb$/i, ""),
          root: holder,
          spawned: true,
          metadata: { glbUrl: url }
        }));
      }, reject);
    });
  }

  // Simulation/Simulation_Base.js
  var Simulation_Base = class {
    constructor(ctx) {
      this.ctx = ctx;
    }
    init() {
    }
    loadAndSetupModel(cfg, onLoaded) {
      const ctx = this.ctx;
      const THREE = ctx.THREE;
      const scene = ctx.scene;
      if (!cfg.model) return;
      ctx.assets.loadModel(cfg.model, (root) => {
        var _a;
        let sz = new THREE.Vector3();
        let box = new THREE.Box3();
        box.setFromObject(root);
        box.getSize(sz);
        const c = box.getCenter(new THREE.Vector3());
        root.position.x -= c.x;
        root.position.z -= c.z;
        root.position.y -= box.min.y;
        const modelH = sz.y;
        if (typeof onLoaded === "function") {
          onLoaded(root, modelH);
        }
        scene.add(root);
        (_a = ctx.editor) == null ? void 0 : _a.register(root, cfg.label || "Model");
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        const fov = ctx.camera.fov * Math.PI / 180;
        ctx.frame(modelH * 0.55, maxDim / 2 / Math.tan(fov / 2) * 1.9);
        if (ctx.loadingEl) ctx.loadingEl.style.display = "none";
      }, (err) => {
        if (ctx.loadingEl && !ctx.disposed) {
          ctx.loadingEl.textContent = "\uBAA8\uB378\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694";
        }
      });
    }
    // Base Controller interface methods forwarded to context components
    render() {
      this.ctx.renderEngine.render();
    }
    resize() {
      this.ctx.resize();
    }
    dispose() {
      this.ctx.dispose();
    }
    simSink(command, waitResp) {
      return this.ctx.dispatcher.simSink(command, waitResp);
    }
    cancelActiveWait() {
      this.ctx.dispatcher.cancelActiveWait();
    }
  };

  // Simulation/Simulation_AresRobot.js
  var DEFAULT_ALBI_EYES = {
    radius: 0.11,
    left: [0.145, 0.375, 0.12],
    right: [-0.145, 0.375, 0.12]
  };
  var DEFAULT_ALBI_CHEST = {
    radius: 0.07,
    pos: [0, -0.1, 0.135]
  };
  var EYE_PALETTE = {
    sphereBase: 797208,
    emissive: 65382,
    glowStops: ["rgba(180,255,210,1)", "rgba(40,255,120,0.65)", "rgba(0,255,90,0)"],
    glowTint: 5635993,
    lightColor: 3407735
  };
  var CHEST_PALETTE = {
    sphereBase: 2755596,
    emissive: 16719920,
    glowStops: ["rgba(255,210,200,1)", "rgba(255,60,40,0.65)", "rgba(255,0,0,0)"],
    glowTint: 16733542,
    lightColor: 16724804
  };
  function centerModelOnGround(THREE, root) {
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
  }
  function createAlbiModelObject(ctx, root, label = "Albi Body", options = {}) {
    var _a;
    return new SimulationObject({
      id: ((_a = ctx.objects) == null ? void 0 : _a.makeId("albi-body")) || `albi-body-${Date.now()}`,
      type: "albi-body",
      label,
      root,
      spawned: !!options.spawned,
      metadata: { modelRole: "body" }
    });
  }
  function createAlbiLedObject(ctx, led, label, role, options = {}) {
    var _a;
    return new SimulationObject({
      id: ((_a = ctx.objects) == null ? void 0 : _a.makeId(`albi-${role}`)) || `albi-${role}-${Date.now()}`,
      type: "albi-led",
      label,
      root: led.group,
      spawned: !!options.spawned,
      metadata: {
        led,
        role,
        modelRole: "led"
      }
    });
  }
  async function createSpawnedAlbiObjects(ctx) {
    const THREE = ctx.THREE;
    const model = await new Promise((resolve, reject) => {
      ctx.assets.loadModel("Mesh/AlbiRobot/AlbiRobot.min.glb", resolve, reject);
    });
    centerModelOnGround(ctx.THREE, model);
    const holder = new THREE.Group();
    holder.add(model);
    const eyeCfg = ctx.cfg.eyes || DEFAULT_ALBI_EYES;
    const chestCfg = ctx.cfg.chest || DEFAULT_ALBI_CHEST;
    const eyeGlow = ctx.leds.createGlowTexture(EYE_PALETTE.glowStops);
    const chestGlow = ctx.leds.createGlowTexture(CHEST_PALETTE.glowStops);
    const eyeL = ctx.leds.createMeshLed({ radius: eyeCfg.radius, pos: eyeCfg.left, palette: EYE_PALETTE, glowTex: eyeGlow });
    const eyeR = ctx.leds.createMeshLed({ radius: eyeCfg.radius, pos: eyeCfg.right, palette: EYE_PALETTE, glowTex: eyeGlow });
    const chest = ctx.leds.createMeshLed({ radius: chestCfg.radius, pos: chestCfg.pos, palette: CHEST_PALETTE, glowTex: chestGlow });
    holder.add(eyeL.group, eyeR.group, chest.group);
    return [
      createAlbiModelObject(ctx, holder, "Spawned Albi Body", { spawned: true }),
      createAlbiLedObject(ctx, eyeL, "Spawned Albi Eye L LED", "eye-l", { spawned: true }),
      createAlbiLedObject(ctx, eyeR, "Spawned Albi Eye R LED", "eye-r", { spawned: true }),
      createAlbiLedObject(ctx, chest, "Spawned Albi Chest LED", "chest", { spawned: true })
    ];
  }
  var Simulation_AresRobot = class extends Simulation_Base {
    constructor(ctx) {
      super(ctx);
      this.leds = ctx.leds;
      this.albiGroup = null;
      this.eyeL = null;
      this.eyeR = null;
      this.chestLed = null;
    }
    init() {
      const ctx = this.ctx;
      const THREE = ctx.THREE;
      const cfg = ctx.cfg;
      if (!cfg.model) {
        ctx.frame(0.6, 4.2);
        if (ctx.loadingEl) ctx.loadingEl.style.display = "none";
        return;
      }
      this.albiGroup = new THREE.Group();
      ctx.assets.loadModel(cfg.model, (root) => {
        centerModelOnGround(THREE, root);
        this.albiGroup.add(root);
        const eyes = cfg.eyes;
        const chest = cfg.chest;
        if (eyes) {
          const eyeGlow = this.leds.createGlowTexture(EYE_PALETTE.glowStops);
          this.eyeL = this.leds.register("eye-l", this.leds.createMeshLed({
            radius: eyes.radius,
            pos: eyes.left,
            palette: EYE_PALETTE,
            glowTex: eyeGlow
          }));
          this.eyeR = this.leds.register("eye-r", this.leds.createMeshLed({
            radius: eyes.radius,
            pos: eyes.right,
            palette: EYE_PALETTE,
            glowTex: eyeGlow
          }));
          this.albiGroup.add(this.eyeL.group, this.eyeR.group);
        }
        if (chest) {
          const chestGlow = this.leds.createGlowTexture(CHEST_PALETTE.glowStops);
          this.chestLed = this.leds.register("chest", this.leds.createMeshLed({
            radius: chest.radius,
            pos: chest.pos,
            palette: CHEST_PALETTE,
            glowTex: chestGlow
          }));
          this.albiGroup.add(this.chestLed.group);
        }
        ctx.objects.add(createAlbiModelObject(ctx, this.albiGroup, cfg.label || "Albi Body"), ctx.scene);
        if (this.eyeL) {
          ctx.objects.add(createAlbiLedObject(ctx, this.eyeL, "Albi Eye L LED", "eye-l"), this.albiGroup);
        }
        if (this.eyeR) {
          ctx.objects.add(createAlbiLedObject(ctx, this.eyeR, "Albi Eye R LED", "eye-r"), this.albiGroup);
        }
        if (this.chestLed) {
          ctx.objects.add(createAlbiLedObject(ctx, this.chestLed, "Albi Chest LED", "chest"), this.albiGroup);
        }
        const box = new THREE.Box3().setFromObject(this.albiGroup);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = ctx.camera.fov * Math.PI / 180;
        ctx.frame(size.y * 0.55, maxDim / 2 / Math.tan(fov / 2) * 1.9);
        if (ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = "none";
      }, () => {
        if (ctx.loadingEl && !ctx.disposed) {
          ctx.loadingEl.textContent = "\uBAA8\uB378\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694";
        }
      });
    }
    // Control Methods
    get hasEyes() {
      return !!(this.eyeL && this.eyeR);
    }
    get hasChest() {
      return !!this.chestLed;
    }
    setEye(side, val) {
      this.leds.set(side === "L" ? "eye-l" : "eye-r", val);
    }
    setChest(val) {
      this.leds.set("chest", val);
    }
  };

  // Sim_Parts/editor_controls.js
  var RENAME_HOLD_MS = 600;
  var FIELD_SPECS = {
    LED: [{ key: "led_no", label: "LED \uBC88\uD638 (0~5)", short: "LED \uBC88\uD638", def: "0", kind: "int" }],
    DC: [
      { key: "axis_rotation", label: "DC \uD68C\uC804\uCD95 x,y,z (\uBD80\uBAA8 \uC88C\uD45C\uACC4, \uCCB4\uD06C \uD574\uC81C=\uBBF8\uC0AC\uC6A9)", short: "\uD68C\uC804\uCD95", def: "0,1,0", kind: "vec", optional: true },
      { key: "rotation_offset", label: "\uD68C\uC804 \uAE30\uC900\uC810 \uC624\uD504\uC14B x,y,z (\uAC1D\uCCB4 \uB85C\uCEEC \uC88C\uD45C, \uCCB4\uD06C \uD574\uC81C=\uC6D0\uC810)", short: "\uD68C\uC804 \uAE30\uC900", def: "", kind: "vec", optional: true },
      { key: "axis_translate", label: "DC \uC774\uB3D9\uCD95 x,y,z (\uBD80\uBAA8 \uC88C\uD45C\uACC4, \uCCB4\uD06C \uD574\uC81C=\uBBF8\uC0AC\uC6A9)", short: "\uC774\uB3D9\uCD95", def: "", kind: "vec", optional: true }
    ],
    Servo: [
      { key: "wheel", label: "\uBC14\uD034\uC5F0\uACB0 (left/right/neutral \u2014 neutral \uC740 \uC804\uC9C4=\uBC18\uC2DC\uACC4, \uC120\uD68C \uCC28\uB3D9 \uC5C6\uC74C)", short: "\uBC14\uD034", def: "left", kind: "side" },
      { key: "axis_rotation", label: "\uBC14\uD034 \uC2A4\uD540\uCD95 x,y,z (\uBD80\uBAA8 \uC88C\uD45C\uACC4, \uCCB4\uD06C \uD574\uC81C=\uBBF8\uC0AC\uC6A9)", short: "\uC2A4\uD540\uCD95", def: "1,0,0", kind: "vec", optional: true },
      { key: "rotation_offset", label: "\uC2A4\uD540\uCD95 \uAE30\uC900\uC810 \uC624\uD504\uC14B x,y,z (\uAC1D\uCCB4 \uB85C\uCEEC \uC88C\uD45C, \uCCB4\uD06C \uD574\uC81C=\uC6D0\uC810)", short: "\uC2A4\uD540 \uAE30\uC900", def: "", kind: "vec", optional: true },
      { key: "axis_direction", label: "\uC774\uB3D9 \uBC29\uD5A5 x,y,z (\uBD80\uBAA8 \uC88C\uD45C\uACC4, \uCCB4\uD06C \uD574\uC81C=\uBBF8\uC0AC\uC6A9)", short: "\uC774\uB3D9 \uBC29\uD5A5", def: "", kind: "vec", optional: true },
      { key: "axis_turn", label: "\uC120\uD68C\uCD95 x,y,z (\uBD80\uBAA8 \uC88C\uD45C\uACC4, \uCCB4\uD06C \uD574\uC81C=\uBBF8\uC0AC\uC6A9)", short: "\uC120\uD68C\uCD95", def: "", kind: "vec", optional: true },
      { key: "turn_offset", label: "\uC120\uD68C\uCD95 \uAE30\uC900\uC810 \uC624\uD504\uC14B x,y,z (\uAC1D\uCCB4 \uB85C\uCEEC \uC88C\uD45C, \uCCB4\uD06C \uD574\uC81C=\uC6D0\uC810)", short: "\uC120\uD68C \uAE30\uC900", def: "", kind: "vec", optional: true }
    ],
    UltraSonic: [{ key: "detect_direction", label: "\uAC70\uB9AC \uCE21\uC815 ray \uBC29\uD5A5 x,y,z (\uB85C\uCEEC\uCD95)", short: "ray \uBC29\uD5A5", def: "0,0,1", kind: "vec" }],
    Magnet: [{ key: "detection_point", label: "\uAC10\uC9C0\uC810 \uC624\uD504\uC14B x,y,z (\uB85C\uCEEC \uC88C\uD45C, \uBC18\uACBD 5cm)", short: "\uAC10\uC9C0\uC810", def: "0,0,0", kind: "vec" }],
    Gun: [
      { key: "propel_direction", label: "\uBC1C\uC0AC \uBC29\uD5A5 x,y,z (\uBD80\uBAA8 \uC88C\uD45C\uACC4, \uCCB4\uD06C \uD574\uC81C=\uBBF8\uC0AC\uC6A9)", short: "\uBC1C\uC0AC \uBC29\uD5A5", def: "0,0,1", kind: "vec", optional: true },
      { key: "explosion", label: "\uC5F0\uAE30 \uBC1C\uC0DD\uC810 \uC624\uD504\uC14B x,y,z (\uCCB4\uD06C \uD574\uC81C=\uBBF8\uC0AC\uC6A9)", short: "\uC5F0\uAE30\uC810", def: "", kind: "vec", optional: true }
    ]
  };
  var MODES = ["translate", "rotate", "scale"];
  var SPAWN_MENU = [
    { type: "box", label: "Box" },
    { type: "sphere", label: "Sphere" },
    { type: "marker", label: "Marker" },
    { type: "oled", label: "OLED Panel" },
    { type: "glb", label: "GLB \uBAA8\uB378\u2026" }
  ];
  var EditorControls = class {
    constructor(ctx) {
      var _a;
      this.ctx = ctx;
      this.THREE = ctx.THREE;
      this.A = ctx.A;
      this.camera = ctx.camera;
      this.dom = ctx.renderer.domElement;
      this.orbit = ctx.controls;
      this.TransformControls = (_a = this.A) == null ? void 0 : _a.TransformControls;
      this.enabled = !!this.TransformControls;
      this.selectables = [];
      this.selected = null;
      this.multiSelection = [];
      this._multiOffsets = null;
      this.multiHelpers = [];
      this.multiPivot = null;
      this.mode = "translate";
      this.lastSpawnPoint = new this.THREE.Vector3();
      this.hierarchyVersion = -1;
      this.axisEdit = null;
      this.axisHandle = null;
      this.raycaster = new this.THREE.Raycaster();
      this.pointer = new this.THREE.Vector2();
      this.groundPlane = new this.THREE.Plane(new this.THREE.Vector3(0, 1, 0), 0);
      this.boxHelper = new this.THREE.BoxHelper(new this.THREE.Object3D(), 16765514);
      this.boxHelper.visible = false;
      this.boxHelper.renderOrder = 999;
      this.ctx.scene.add(this.boxHelper);
      this.toolbar = this.createToolbar();
      this.ctx.stage.appendChild(this.toolbar);
      this.axisBar = document.createElement("div");
      this.axisBar.className = "sim-editor-axisbar";
      this.axisBar.hidden = true;
      this.ctx.stage.appendChild(this.axisBar);
      this.menu = this.createContextMenu();
      this.ctx.stage.appendChild(this.menu);
      this.hierarchy = this.createHierarchyPanel();
      this.ctx.stage.appendChild(this.hierarchy);
      this.inspector = this.createInspector();
      this.ctx.stage.appendChild(this.inspector);
      this.devMode = false;
      this.toolbar.hidden = true;
      this.hierarchy.hidden = true;
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onContextMenu = this.onContextMenu.bind(this);
      this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onDraggingChanged = this.onDraggingChanged.bind(this);
      this.onMultiPivotChange = this.onMultiPivotChange.bind(this);
      if (this.enabled) {
        this.transform = new this.TransformControls(this.camera, this.dom);
        this.transform.setMode(this.mode);
        this.transform.setSpace("world");
        this.transform.setSize(0.85);
        this.transform.visible = false;
        this.transform.addEventListener("dragging-changed", this.onDraggingChanged);
        this.transform.addEventListener("objectChange", this.onMultiPivotChange);
        this.ctx.scene.add(this.transform);
        this.multiPivot = new this.THREE.Group();
        this.multiPivot.visible = false;
        this.ctx.scene.add(this.multiPivot);
      } else {
        console.warn("ARES editor controls disabled: TransformControls is not available in window.ARES3.");
      }
      this.dom.addEventListener("pointerdown", this.onPointerDown);
      this.dom.addEventListener("contextmenu", this.onContextMenu);
      document.addEventListener("pointerdown", this.onDocumentPointerDown);
      window.addEventListener("keydown", this.onKeyDown);
    }
    createToolbar() {
      const toolbar = document.createElement("div");
      toolbar.className = "sim-editor-toolbar";
      toolbar.innerHTML = `
      <button type="button" data-mode="translate" title="Move (W)" aria-pressed="true">Move</button>
      <button type="button" data-mode="rotate" title="Rotate (E)" aria-pressed="false">Rotate</button>
      <button type="button" data-mode="scale" title="Scale (R)" aria-pressed="false">Scale</button>
      <span class="sim-editor-selection">No selection</span>
    `;
      toolbar.querySelectorAll("button[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => this.setMode(btn.dataset.mode));
      });
      return toolbar;
    }
    createContextMenu() {
      const menu = document.createElement("div");
      menu.className = "sim-editor-context-menu";
      menu.hidden = true;
      const title = document.createElement("div");
      title.className = "sim-editor-context-title";
      title.textContent = "Create object";
      menu.appendChild(title);
      SPAWN_MENU.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.spawn = item.type;
        btn.textContent = item.label;
        btn.addEventListener("click", () => this.spawn(item.type));
        menu.appendChild(btn);
      });
      const childTitle = document.createElement("div");
      childTitle.className = "sim-editor-context-title";
      childTitle.textContent = "Create child";
      menu.appendChild(childTitle);
      SPAWN_MENU.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.spawnChild = item.type;
        btn.textContent = item.label;
        btn.addEventListener("click", () => this.spawn(item.type, { asChild: true }));
        menu.appendChild(btn);
      });
      const compTitle = document.createElement("div");
      compTitle.className = "sim-editor-context-title";
      compTitle.textContent = "Component";
      menu.appendChild(compTitle);
      this.compSection = document.createElement("div");
      menu.appendChild(this.compSection);
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.dataset.action = "delete-selected";
      deleteBtn.textContent = "Delete runtime object";
      deleteBtn.addEventListener("click", () => this.deleteSelected());
      menu.appendChild(deleteBtn);
      return menu;
    }
    // 선택 객체에 컴포넌트 부착 — 타입별 필드를 prompt 로 입력받는다(개발자 모드 전용).
    // 벡터는 "x,y,z" 형식(객체 로컬 좌표계, SIMULATOR.md 규약 개정), 빈칸 = 선택 필드 미사용.
    attachToSelected(type) {
      const simObject = this.getSelectedSimObject();
      if (!(simObject == null ? void 0 : simObject.spawned)) return;
      const parseVecStr = (s) => {
        const parts = String(s).split(",").map((x) => parseFloat(x));
        return parts.length === 3 && parts.every((n) => isFinite(n)) ? parts : null;
      };
      const fields = {};
      for (const spec of FIELD_SPECS[type] || []) {
        const answer = prompt(`${type} \u2014 ${spec.label}:`, spec.def);
        if (answer === null) return;
        const raw = answer.trim();
        if (!raw) {
          if (spec.optional) continue;
          return;
        }
        if (spec.kind === "int") fields[spec.key] = Math.max(0, Math.min(5, parseInt(raw, 10) || 0));
        else if (spec.kind === "side") {
          const side = raw.toLowerCase();
          fields[spec.key] = side === "right" ? "right" : side === "neutral" ? "neutral" : "left";
        } else {
          const v = parseVecStr(raw);
          if (!v) return;
          fields[spec.key] = v;
        }
      }
      attachComponent(this.ctx, simObject, type, fields);
      this.select(simObject.root);
      this.hideContextMenu();
    }
    detachFromSelected(type) {
      const simObject = this.getSelectedSimObject();
      if (!simObject) return;
      detachComponent(this.ctx, simObject, type);
      this.select(simObject.root);
      this.hideContextMenu();
    }
    // 'Box 1 · LED0+Servo(L)' 형태의 표시용 라벨
    describeObject(simObject) {
      if (!simObject) return null;
      const comps = serializeComponents(simObject).map((c) => {
        if (c.type === "LED") return `LED${c.fields.led_no}`;
        if (c.type === "Servo") return `Servo(${c.fields.wheel === "right" ? "R" : "L"})`;
        return c.type;
      });
      return comps.length ? `${simObject.label} \xB7 ${comps.join("+")}` : simObject.label;
    }
    createHierarchyPanel() {
      var _a;
      const panel = document.createElement("div");
      panel.className = "sim-editor-hierarchy";
      panel.innerHTML = `
      <div class="sim-editor-hierarchy-head">
        <span>Hierarchy</span>
        <button type="button" data-action="toggle-hierarchy" title="Collapse hierarchy">-</button>
      </div>
      <div class="sim-editor-hierarchy-list"></div>
    `;
      (_a = panel.querySelector('[data-action="toggle-hierarchy"]')) == null ? void 0 : _a.addEventListener("click", () => {
        panel.classList.toggle("collapsed");
        const btn = panel.querySelector('[data-action="toggle-hierarchy"]');
        if (btn) btn.textContent = panel.classList.contains("collapsed") ? "+" : "-";
      });
      return panel;
    }
    // 개발자 모드 시각 보조 — 원점 좌표축(x=빨강·y=초록·z=파랑) + 3직교 평면(xz·xy·yz) 그리드.
    // 1 unit = 1 m 규약에 맞춰 10m 범위·0.5m 격자. 라인이라 UltraSonic ray(isMesh 필터)에 안 걸린다.
    ensureDevGrids() {
      if (this.devGrids) return;
      const THREE = this.THREE;
      const group = new THREE.Group();
      group.name = "dev-grids";
      const makeGrid = (opacity) => {
        const grid = new THREE.GridHelper(10, 20, 9418751, 4477038);
        grid.material.transparent = true;
        grid.material.opacity = opacity;
        grid.material.depthWrite = false;
        return grid;
      };
      const xz = makeGrid(0.35);
      const xy = makeGrid(0.15);
      xy.rotation.x = Math.PI / 2;
      const yz = makeGrid(0.15);
      yz.rotation.z = Math.PI / 2;
      const axes = new THREE.AxesHelper(1.6);
      if (axes.material) axes.material.depthWrite = false;
      group.add(xz, xy, yz, axes);
      this.devGrids = group;
      this.ctx.scene.add(group);
    }
    setDevMode(on) {
      var _a, _b, _c, _d;
      this.devMode = !!on;
      (_b = (_a = this.ctx.stage) == null ? void 0 : _a.classList) == null ? void 0 : _b.toggle("sim-devmode", this.devMode);
      this.toolbar.hidden = !this.devMode;
      this.hierarchy.hidden = !this.devMode;
      this.hideContextMenu();
      if (this.glbMenu) this.glbMenu.hidden = true;
      if (this.devMode) this.ensureDevGrids();
      if (this.devGrids) this.devGrids.visible = this.devMode;
      (_d = (_c = this.ctx).setCheckerFloorVisible) == null ? void 0 : _d.call(_c, !this.devMode);
      if (!this.devMode) this.select(null);
      else this.updateHierarchy(true);
      this.updateAxisButtons(this.getSelectedSimObject());
      this.updateInspector();
    }
    // ==== 컴포넌트 인스펙터 — 선택 객체의 직렬화 필드값(JSON)을 씬 드롭박스 아래에서 편집 ====
    createInspector() {
      const panel = document.createElement("div");
      panel.className = "sim-editor-inspector";
      panel.hidden = true;
      panel.innerHTML = `
      <div class="sim-editor-inspector-head">
        <span class="sim-editor-inspector-title">\uCEF4\uD3EC\uB10C\uD2B8</span>
        <button type="button" data-action="apply">\uC801\uC6A9</button>
      </div>
      <div class="sim-editor-inspector-tf">
        <span>\uC704\uCE58</span><input data-tf="p0"><input data-tf="p1"><input data-tf="p2">
        <span>\uD68C\uC804\xB0</span><input data-tf="r0"><input data-tf="r1"><input data-tf="r2">
        <span>\uD06C\uAE30</span><input data-tf="s0"><input data-tf="s1"><input data-tf="s2">
      </div>
      <div class="sim-editor-inspector-colors" hidden>
        <span>\uAE30\uBCF8\uC0C9</span><input data-col="b0" title="R (0~1)"><input data-col="b1" title="G (0~1)"><input data-col="b2" title="B (0~1)"><input data-col="b3" title="A \u2014 \uBD88\uD22C\uBA85\uB3C4 (0~1)">
        <span>\uBC1C\uAD11\uC0C9</span><input data-col="e0" title="R (0~1)"><input data-col="e1" title="G (0~1)"><input data-col="e2" title="B (0~1)"><input data-col="e3" title="A \u2014 \uBC1C\uAD11 \uC2DC \uBD88\uD22C\uBA85\uB3C4 (0~1)">
      </div>
      <div class="sim-editor-inspector-comps"></div>
      <div class="sim-editor-inspector-status" hidden></div>
    `;
      panel.querySelector('[data-action="apply"]').addEventListener("click", () => this.applyInspector());
      panel.addEventListener("keydown", (e) => e.stopPropagation());
      return panel;
    }
    // 트랜스폼 입력칸만 현재 값으로 갱신(포커스 중인 칸은 건드리지 않음)
    refreshInspectorTransform() {
      const simObject = this.getSelectedSimObject();
      if (!this.inspector || this.inspector.hidden || !simObject) return;
      const r = simObject.root;
      const deg = 180 / Math.PI;
      const vals = {
        p0: r.position.x,
        p1: r.position.y,
        p2: r.position.z,
        r0: r.rotation.x * deg,
        r1: r.rotation.y * deg,
        r2: r.rotation.z * deg,
        s0: r.scale.x,
        s1: r.scale.y,
        s2: r.scale.z
      };
      Object.entries(vals).forEach(([key, v]) => {
        const el = this.inspector.querySelector(`[data-tf="${key}"]`);
        if (el && document.activeElement !== el) el.value = Math.round(v * 1e3) / 1e3;
      });
    }
    updateInspector() {
      if (!this.inspector) return;
      const simObject = this.getSelectedSimObject();
      const show = this.devMode && !!(simObject == null ? void 0 : simObject.spawned);
      this.inspector.hidden = !show;
      if (!show) return;
      const head = this.ctx.stage.querySelector(".sim-card-head");
      if (head) {
        const stageRect = this.ctx.stage.getBoundingClientRect();
        const headRect = head.getBoundingClientRect();
        this.inspector.style.top = `${Math.round(headRect.bottom - stageRect.top + 8)}px`;
      }
      this.inspector.querySelector(".sim-editor-inspector-title").textContent = simObject.label;
      this.refreshInspectorTransform();
      this.refreshInspectorColors(simObject);
      this.renderInspectorComponents(simObject);
      this.setInspectorStatus("");
    }
    // 색상 입력칸(기본색·발광색 r,g,b,a) 갱신 — 색상 지원 객체(박스·구)만 노출
    refreshInspectorColors(simObject) {
      var _a, _b;
      const wrap = (_a = this.inspector) == null ? void 0 : _a.querySelector(".sim-editor-inspector-colors");
      if (!wrap) return;
      const colors = (_b = simObject == null ? void 0 : simObject.metadata) == null ? void 0 : _b.colors;
      wrap.hidden = !colors;
      if (!colors) return;
      const vals = {
        b0: colors.base[0],
        b1: colors.base[1],
        b2: colors.base[2],
        b3: colors.base[3],
        e0: colors.emissive[0],
        e1: colors.emissive[1],
        e2: colors.emissive[2],
        e3: colors.emissive[3]
      };
      Object.entries(vals).forEach(([key, v]) => {
        const el = wrap.querySelector(`[data-col="${key}"]`);
        if (el && document.activeElement !== el) el.value = Math.round((v != null ? v : 0) * 1e3) / 1e3;
      });
    }
    // 부착된 컴포넌트들을 필드별 입력칸(트랜스폼과 동일한 방식)으로 렌더
    renderInspectorComponents(simObject) {
      const wrap = this.inspector.querySelector(".sim-editor-inspector-comps");
      wrap.textContent = "";
      serializeComponents(simObject).forEach(({ type, fields }) => {
        const sec = document.createElement("div");
        sec.className = "sim-insp-comp";
        sec.dataset.compType = type;
        const head = document.createElement("div");
        head.className = "sim-insp-comp-head";
        const title = document.createElement("b");
        title.textContent = type;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.title = `${type} \uCEF4\uD3EC\uB10C\uD2B8 \uC81C\uAC70`;
        removeBtn.textContent = "\u2212";
        removeBtn.addEventListener("click", () => this.detachFromSelected(type));
        head.append(title, removeBtn);
        sec.appendChild(head);
        const specs = FIELD_SPECS[type] || [];
        if (specs.length === 0) {
          const none = document.createElement("div");
          none.className = "sim-insp-comp-none";
          none.textContent = "\uD544\uB4DC \uC5C6\uC74C";
          sec.appendChild(none);
        }
        specs.forEach((spec) => {
          const row = document.createElement("div");
          row.className = "sim-insp-row";
          const value = fields == null ? void 0 : fields[spec.key];
          if (spec.kind === "vec" && spec.optional) {
            const use = document.createElement("input");
            use.type = "checkbox";
            use.className = "sim-insp-use";
            use.dataset.use = spec.key;
            use.checked = Array.isArray(value);
            use.title = `${spec.short || spec.key} \u2014 \uCCB4\uD06C \uD574\uC81C \uC2DC \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uC74C`;
            use.addEventListener("change", () => {
              const inputs = row.querySelectorAll(`[data-field="${spec.key}"]`);
              inputs.forEach((el) => {
                el.disabled = !use.checked;
              });
              if (use.checked && Array.from(inputs).every((el) => el.value.trim() === "")) {
                const def = (spec.def || "0,0,0").split(",");
                inputs.forEach((el, i) => {
                  var _a;
                  el.value = (_a = def[i]) != null ? _a : "0";
                });
              }
            });
            row.appendChild(use);
          } else {
            row.appendChild(document.createElement("i"));
          }
          const label = document.createElement("span");
          label.textContent = spec.short || spec.key;
          label.title = spec.label;
          row.appendChild(label);
          if (spec.kind === "vec") {
            for (let i = 0; i < 3; i++) {
              const input = document.createElement("input");
              input.dataset.field = spec.key;
              input.dataset.axis = i;
              input.value = Array.isArray(value) ? value[i] : "";
              if (spec.optional) {
                input.placeholder = "\u2014";
                input.disabled = !Array.isArray(value);
              }
              row.appendChild(input);
            }
          } else if (spec.kind === "side") {
            const select = document.createElement("select");
            select.dataset.field = spec.key;
            ["left", "right", "neutral"].forEach((side) => {
              const o = document.createElement("option");
              o.value = side;
              o.textContent = side;
              select.appendChild(o);
            });
            select.value = ["right", "neutral"].includes(value) ? value : "left";
            row.appendChild(select);
          } else {
            const input = document.createElement("input");
            input.dataset.field = spec.key;
            input.value = value != null ? value : spec.def;
            row.appendChild(input);
          }
          sec.appendChild(row);
        });
        wrap.appendChild(sec);
      });
    }
    // 인스펙터의 필드 입력칸들에서 컴포넌트 목록을 수집
    // (선택 vec = 체크 해제 시 생략, 빈칸 전체도 미사용으로 생략)
    collectInspectorComponents() {
      const list = [];
      this.inspector.querySelectorAll(".sim-insp-comp").forEach((sec) => {
        const type = sec.dataset.compType;
        const fields = {};
        (FIELD_SPECS[type] || []).forEach((spec) => {
          var _a, _b;
          if (spec.kind === "vec") {
            if (spec.optional) {
              const use = sec.querySelector(`[data-use="${spec.key}"]`);
              if (use && !use.checked) return;
            }
            const inputs = sec.querySelectorAll(`[data-field="${spec.key}"]`);
            const raw = Array.from(inputs).map((el) => el.value.trim());
            if (raw.every((v) => v === "")) {
              if (!spec.optional) throw new Error(`${type}.${spec.key} \uAC12\uC774 \uD544\uC694\uD569\uB2C8\uB2E4`);
              return;
            }
            fields[spec.key] = raw.map((v) => {
              const n = parseFloat(v);
              return Number.isFinite(n) ? n : 0;
            });
          } else if (spec.kind === "side") {
            const side = (_a = sec.querySelector(`[data-field="${spec.key}"]`)) == null ? void 0 : _a.value;
            fields[spec.key] = ["right", "neutral"].includes(side) ? side : "left";
          } else {
            const v = parseInt((_b = sec.querySelector(`[data-field="${spec.key}"]`)) == null ? void 0 : _b.value, 10);
            fields[spec.key] = Math.max(0, Math.min(5, Number.isFinite(v) ? v : 0));
          }
        });
        list.push({ type, fields });
      });
      return list;
    }
    setInspectorStatus(msg, isError = false) {
      var _a;
      const el = (_a = this.inspector) == null ? void 0 : _a.querySelector(".sim-editor-inspector-status");
      if (!el) return;
      el.hidden = !msg;
      el.textContent = msg;
      el.classList.toggle("error", isError);
    }
    applyInspector() {
      var _a;
      const simObject = this.getSelectedSimObject();
      if (!simObject) return;
      const root = simObject.root;
      const num2 = (key, fallback) => {
        const el = this.inspector.querySelector(`[data-tf="${key}"]`);
        const v = parseFloat(el == null ? void 0 : el.value);
        return Number.isFinite(v) ? v : fallback;
      };
      const rad = Math.PI / 180;
      root.position.set(num2("p0", root.position.x), num2("p1", root.position.y), num2("p2", root.position.z));
      root.rotation.set(num2("r0", root.rotation.x / rad) * rad, num2("r1", root.rotation.y / rad) * rad, num2("r2", root.rotation.z / rad) * rad);
      root.scale.set(num2("s0", root.scale.x), num2("s1", root.scale.y), num2("s2", root.scale.z));
      const colors = (_a = simObject.metadata) == null ? void 0 : _a.colors;
      if (colors) {
        const col = (key, fallback) => {
          const el = this.inspector.querySelector(`[data-col="${key}"]`);
          const v = parseFloat(el == null ? void 0 : el.value);
          return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
        };
        colors.base = [col("b0", colors.base[0]), col("b1", colors.base[1]), col("b2", colors.base[2]), col("b3", colors.base[3])];
        colors.emissive = [col("e0", colors.emissive[0]), col("e1", colors.emissive[1]), col("e2", colors.emissive[2]), col("e3", colors.emissive[3])];
        applyObjectColors(simObject);
      }
      try {
        const list = this.collectInspectorComponents();
        serializeComponents(simObject).forEach(({ type }) => detachComponent(this.ctx, simObject, type));
        list.forEach((entry) => attachComponent(this.ctx, simObject, entry.type, entry.fields || {}));
        this.select(simObject.root);
        this.setInspectorStatus(`\uC801\uC6A9 \uC644\uB8CC (${list.length}\uAC1C \uCEF4\uD3EC\uB10C\uD2B8)`);
      } catch (err) {
        this.setInspectorStatus("\uC801\uC6A9 \uC2E4\uD328: " + err.message, true);
      }
    }
    // Hierarchy 항목 길게 클릭 → 이름 변경
    renameObject(simObject) {
      if (!simObject) return;
      const name = prompt("\uAC1D\uCCB4 \uC774\uB984:", simObject.label);
      if (name === null || !name.trim()) return;
      simObject.label = name.trim();
      simObject.root.userData.simEditorLabel = simObject.label;
      if (this.ctx.objects) this.ctx.objects.version += 1;
      this.updateHierarchy(true);
      if (this.selected === simObject.root) this.select(simObject.root);
    }
    register(object, label = "Object") {
      if (!object || this.selectables.some((entry) => entry.object === object)) return object;
      object.userData.simEditorLabel = label;
      this.selectables.push({ object, label });
      return object;
    }
    unregister(object) {
      this.selectables = this.selectables.filter((entry) => entry.object !== object);
      if (this.multiSelection.includes(object)) {
        const rest = this.multiSelection.filter((o) => o !== object);
        if (rest.length >= 2) this.applyMultiSelection(rest);
        else this.select(rest[0] || null);
      }
      if (this.selected === object) this.select(null);
    }
    setMode(mode) {
      if (!MODES.includes(mode)) return;
      if (this.isMultiActive() && mode !== "translate") return;
      this.stopAxisEdit();
      this.mode = mode;
      if (this.transform) this.transform.setMode(mode);
      this.toolbar.querySelectorAll("button[data-mode]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
      });
    }
    select(object) {
      var _a, _b;
      this.stopAxisEdit();
      this.clearMultiSelection();
      this.selected = object || null;
      if (this.selected && this.transform) {
        this.transform.setMode(this.mode);
        this.transform.attach(this.selected);
        this.transform.visible = true;
      } else if (this.transform) {
        this.transform.detach();
        this.transform.visible = false;
      }
      this.boxHelper.visible = !!this.selected;
      if (this.selected) this.boxHelper.setFromObject(this.selected);
      const simObject = this.getSelectedSimObject();
      const label = simObject && this.describeObject(simObject) || ((_b = (_a = this.selected) == null ? void 0 : _a.userData) == null ? void 0 : _b.simEditorLabel) || "No selection";
      const text = this.toolbar.querySelector(".sim-editor-selection");
      if (text) text.textContent = label;
      this.updateAxisButtons(simObject);
      this.updateHierarchy(true);
      this.updateInspector();
    }
    // ==== 다중 선택 (Ctrl+클릭, 2026-07-13) ====
    // 2개 이상 선택되면 활성. 기즈모는 선택 객체들의 중점(multiPivot)에 붙고
    // 이동(translate)만 허용한다. Ctrl+V 는 선택 전체를 복제한다.
    isMultiActive() {
      return this.multiSelection.length >= 2;
    }
    isSelectedRoot(root) {
      return this.selected === root || this.multiSelection.includes(root);
    }
    toggleMultiSelect(root) {
      if (!root) return;
      let list = this.multiSelection.slice();
      if (!list.length && this.selected && this.selected !== root) list = [this.selected];
      const idx = list.indexOf(root);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(root);
      if (list.length >= 2) this.applyMultiSelection(list);
      else this.select(list[0] || null);
    }
    applyMultiSelection(list) {
      const THREE = this.THREE;
      this.stopAxisEdit();
      this.clearMultiSelection();
      this.selected = null;
      this.multiSelection = list;
      const centroid = new THREE.Vector3();
      const box = new THREE.Box3();
      const center = new THREE.Vector3();
      list.forEach((root) => {
        box.setFromObject(root);
        if (box.isEmpty()) root.getWorldPosition(center);
        else box.getCenter(center);
        centroid.add(center);
        const helper = new THREE.BoxHelper(root, 16765514);
        helper.renderOrder = 999;
        this.ctx.scene.add(helper);
        this.multiHelpers.push(helper);
      });
      centroid.divideScalar(list.length);
      this._multiOffsets = list.map((root) => {
        const p = new THREE.Vector3();
        root.getWorldPosition(p);
        return p.sub(centroid);
      });
      if (this.multiPivot && this.transform) {
        this.multiPivot.position.copy(centroid);
        this.transform.setMode("translate");
        this.transform.attach(this.multiPivot);
        this.transform.visible = true;
      }
      this.boxHelper.visible = false;
      const text = this.toolbar.querySelector(".sim-editor-selection");
      if (text) text.textContent = `\uB2E4\uC911 \uC120\uD0DD ${list.length}\uAC1C \u2014 \uC774\uB3D9\uB9CC \uAC00\uB2A5`;
      this.updateAxisButtons(null);
      this.updateHierarchy(true);
      this.updateInspector();
    }
    clearMultiSelection() {
      if (this.transform && this.multiPivot && this.transform.object === this.multiPivot) {
        this.transform.detach();
        this.transform.visible = false;
      }
      this.multiSelection = [];
      this._multiOffsets = null;
      this.multiHelpers.forEach((h) => {
        var _a, _b, _c, _d;
        this.ctx.scene.remove(h);
        (_b = (_a = h.geometry) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
        (_d = (_c = h.material) == null ? void 0 : _c.dispose) == null ? void 0 : _d.call(_c);
      });
      this.multiHelpers = [];
    }
    onMultiPivotChange() {
      if (!this.isMultiActive() || !this._multiOffsets) return;
      if (!this.transform || this.transform.object !== this.multiPivot) return;
      const target = new this.THREE.Vector3();
      this.multiSelection.forEach((root, i) => {
        target.copy(this.multiPivot.position).add(this._multiOffsets[i]);
        if (root.parent) root.parent.worldToLocal(target);
        root.position.copy(target);
      });
    }
    // ==== 회전축 편집 (2026-07-09) — 회전 특성 컴포넌트를 가진 객체 선택 시 하단 바에
    // 축 버튼이 나타나고, 핸들을 끌어 옮긴 위치가 회전기준(rotation_offset)·
    // 선회기준(turn_offset) 값이 된다(**객체 로컬 좌표**로 저장 — 변환 상태와 무관). ====
    getAxisEditEntries(simObject) {
      var _a, _b, _c, _d, _e;
      const entries2 = [];
      const dc = (_a = simObject == null ? void 0 : simObject.components) == null ? void 0 : _a.DC;
      if ((_b = dc == null ? void 0 : dc.fields) == null ? void 0 : _b.axis_rotation) {
        entries2.push({ comp: "DC", label: "\uD68C\uC804\uCD95", axisField: "axis_rotation", offsetField: "rotation_offset" });
      }
      const sv = (_c = simObject == null ? void 0 : simObject.components) == null ? void 0 : _c.Servo;
      if ((_d = sv == null ? void 0 : sv.fields) == null ? void 0 : _d.axis_rotation) {
        entries2.push({ comp: "Servo", label: "\uC2A4\uD540\uCD95", axisField: "axis_rotation", offsetField: "rotation_offset" });
      }
      if ((_e = sv == null ? void 0 : sv.fields) == null ? void 0 : _e.axis_turn) {
        entries2.push({ comp: "Servo", label: "\uC120\uD68C\uCD95", axisField: "axis_turn", offsetField: "turn_offset" });
      }
      return entries2;
    }
    updateAxisButtons(simObject) {
      const wrap = this.axisBar;
      if (!wrap) return;
      wrap.textContent = "";
      const entries2 = this.getAxisEditEntries(simObject);
      wrap.hidden = !this.devMode || entries2.length === 0;
      entries2.forEach((entry) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = entry.label;
        btn.title = `${entry.comp} ${entry.label} \uC62E\uAE30\uAE30 \u2014 \uB04C\uC5B4 \uB193\uC740 \uC704\uCE58\uAC00 \uAE30\uC900\uC810 \uC624\uD504\uC14B\uC774 \uB41C\uB2E4`;
        const active = this.axisEdit && this.axisEdit.comp === entry.comp && this.axisEdit.offsetField === entry.offsetField;
        btn.setAttribute("aria-pressed", String(!!active));
        btn.addEventListener("click", () => {
          if (this.axisEdit && this.axisEdit.comp === entry.comp && this.axisEdit.offsetField === entry.offsetField) {
            this.stopAxisEdit();
          } else {
            this.startAxisEdit(entry);
          }
          this.updateAxisButtons(this.getSelectedSimObject());
        });
        wrap.appendChild(btn);
      });
    }
    ensureAxisHandle() {
      if (this.axisHandle) return;
      const THREE = this.THREE;
      const group = new THREE.Group();
      group.name = "sim-axis-handle";
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 12, 8),
        new THREE.MeshBasicMaterial({ color: 16765514, depthTest: false, transparent: true, opacity: 0.9 })
      );
      sphere.renderOrder = 998;
      this.axisLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 16765514, depthTest: false, transparent: true, opacity: 0.75 })
      );
      this.axisLine.renderOrder = 998;
      group.add(sphere, this.axisLine);
      this.axisHandle = group;
    }
    // 핸들을 실제 회전 기준점과 같은 위치에 배치하고 축 라인을 그린다.
    // 기준점은 객체에 붙은 재질점(pivotLocal)이라, 객체가 회전해도 축이 지나는 점은
    // 공간에 고정된다 — 오프셋 필드값을 그대로 더하면 회전 중 그림이 따라 돌아 틀린다.
    syncAxisHandle() {
      var _a, _b;
      if (!this.axisEdit || !this.axisHandle) return;
      const { simObject, comp, offsetField, axisField } = this.axisEdit;
      const component = (_a = simObject.components) == null ? void 0 : _a[comp];
      const fields = component == null ? void 0 : component.fields;
      if (!fields) {
        this.stopAxisEdit();
        return;
      }
      const pivotLocal = ((_b = component.getPivotLocal) == null ? void 0 : _b.call(component, offsetField)) || null;
      const p = simObject.root.position;
      if (pivotLocal) {
        this.axisHandle.position.copy(pivotLocal).applyQuaternion(simObject.root.quaternion).add(p);
      } else {
        this.axisHandle.position.copy(p);
      }
      const a = fields[axisField];
      const dir = new this.THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0);
      if (dir.lengthSq() > 1e-12) {
        dir.normalize();
        this.axisLine.geometry.setFromPoints([dir.clone().multiplyScalar(-1.5), dir.clone().multiplyScalar(1.5)]);
        this.axisLine.visible = true;
      } else {
        this.axisLine.visible = false;
      }
    }
    startAxisEdit(entry) {
      const simObject = this.getSelectedSimObject();
      if (!simObject || !this.transform) return;
      this.stopAxisEdit();
      this.axisEdit = { simObject, ...entry };
      this.ensureAxisHandle();
      (simObject.root.parent || this.ctx.scene).add(this.axisHandle);
      this.syncAxisHandle();
      this.transform.attach(this.axisHandle);
      this.transform.setMode("translate");
    }
    stopAxisEdit() {
      var _a, _b;
      if (!this.axisEdit) return;
      this.axisEdit = null;
      (_b = (_a = this.axisHandle) == null ? void 0 : _a.parent) == null ? void 0 : _b.remove(this.axisHandle);
      if (this.transform) {
        if (this.selected) {
          this.transform.attach(this.selected);
        } else {
          this.transform.detach();
          this.transform.visible = false;
        }
        this.transform.setMode(this.mode);
      }
      this.updateAxisButtons(this.getSelectedSimObject());
    }
    // 핸들 드롭 → 새 오프셋을 **객체 로컬 좌표**로 변환해 컴포넌트 필드에 반영.
    // 로컬로 저장하므로 객체가 어떤 변환 상태여도 축은 항상 같은 자리에 놓인다.
    applyAxisHandleDrop() {
      var _a;
      if (!this.axisEdit || !this.axisHandle) return;
      const { simObject, comp, offsetField } = this.axisEdit;
      const cmp = (_a = simObject.components) == null ? void 0 : _a[comp];
      if (!cmp) {
        this.stopAxisEdit();
        return;
      }
      const root = simObject.root;
      const round3 = (v) => Math.round(v * 1e3) / 1e3;
      const offLocal = this.axisHandle.position.clone().sub(root.position).applyQuaternion(root.quaternion.clone().invert());
      const off = [round3(offLocal.x), round3(offLocal.y), round3(offLocal.z)];
      const fields = { ...cmp.fields };
      if (off.every((v) => v === 0)) delete fields[offsetField];
      else fields[offsetField] = off;
      attachComponent(this.ctx, simObject, comp, fields);
      this.syncAxisHandle();
      this.updateInspector();
    }
    getSpawnParent() {
      return this.ctx.worldGroup || this.ctx.scene;
    }
    getSelectedSimObject() {
      var _a;
      return this.selected ? (_a = this.ctx.objects) == null ? void 0 : _a.getByRoot(this.selected) : null;
    }
    getSpawnParentFor(options = {}) {
      const selectedObject = this.getSelectedSimObject();
      if (options.asChild && selectedObject) {
        return selectedObject.root;
      }
      return this.getSpawnParent();
    }
    async spawn(type, options = {}) {
      if (type === "glb") {
        return this.spawnGlb(options);
      }
      const simObject = createPrimitiveObject(this.ctx, type);
      const parent = this.getSpawnParentFor(options);
      const worldPoint = this.lastSpawnPoint.clone();
      this.ctx.objects.add(simObject, parent);
      simObject.setWorldPosition(worldPoint, parent);
      this.select(simObject.root);
      this.hideContextMenu();
      this.updateHierarchy(true);
      return simObject.root;
    }
    // GLB 스폰(SIMULATOR.md 1장 — glb 로딩) — Web/Mesh 의 자산 목록(Mesh/manifest.json)에서
    // 골라 배치한다. 씬 파일에는 선택한 상대경로(url)가 그대로 기록된다.
    async spawnGlb(options = {}) {
      this.hideContextMenu();
      let models = this.glbModels;
      if (!models) {
        try {
          const res = await fetch("Mesh/manifest.json", { cache: "no-store" });
          const json = res.ok ? await res.json() : null;
          models = Array.isArray(json == null ? void 0 : json.models) ? json.models : null;
        } catch (e) {
          models = null;
        }
        this.glbModels = models;
      }
      if (!models || models.length === 0) {
        const url = prompt("GLB \uACBD\uB85C (Web/ \uAE30\uC900):", "Mesh/LaunchStation.glb");
        if (url && url.trim()) return this.spawnGlbFile(url.trim(), null, options);
        return null;
      }
      this.showGlbMenu(models, options);
      return null;
    }
    // Mesh/ GLB 선택 메뉴 — 컨텍스트 메뉴와 동일한 스타일로 파일 목록을 띄운다
    showGlbMenu(models, options) {
      if (!this.glbMenu) {
        this.glbMenu = document.createElement("div");
        this.glbMenu.className = "sim-editor-context-menu sim-editor-glb-menu";
        this.glbMenu.hidden = true;
        this.ctx.stage.appendChild(this.glbMenu);
      }
      const menu = this.glbMenu;
      menu.textContent = "";
      const title = document.createElement("div");
      title.className = "sim-editor-context-title";
      title.textContent = "GLB \uBAA8\uB378 (Web/Mesh)";
      menu.appendChild(title);
      models.forEach((m) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = m.url.split("/").pop();
        btn.title = m.label ? `${m.label} \u2014 ${m.url}` : m.url;
        btn.addEventListener("click", () => {
          menu.hidden = true;
          this.spawnGlbFile(m.url, null, options);
        });
        menu.appendChild(btn);
      });
      menu.style.left = this.menu.style.left || "12px";
      menu.style.top = this.menu.style.top || "12px";
      menu.hidden = false;
    }
    async spawnGlbFile(url, label, options = {}) {
      const parent = this.getSpawnParentFor(options);
      const worldPoint = this.lastSpawnPoint.clone();
      try {
        const simObject = await createGlbObject(this.ctx, url, label || void 0);
        this.ctx.objects.add(simObject, parent);
        simObject.setWorldPosition(worldPoint, parent);
        this.select(simObject.root);
        this.updateHierarchy(true);
        return simObject.root;
      } catch (err) {
        console.error("GLB \uB85C\uB4DC \uC2E4\uD328:", url, err);
        return null;
      }
    }
    deleteSelected() {
      var _a;
      const object = this.selected;
      const simObject = object ? (_a = this.ctx.objects) == null ? void 0 : _a.getByRoot(object) : null;
      if (!(simObject == null ? void 0 : simObject.spawned)) {
        this.hideContextMenu();
        return;
      }
      this.ctx.objects.remove(simObject);
      this.hideContextMenu();
      this.updateHierarchy(true);
    }
    // Ctrl+V — 선택 객체를 복제해 원본과 같은 부모의 형제(sibling)로 만든다.
    // 라벨은 `원본_dup`, 위치는 원본 바운딩 박스의 x 폭만큼 +x 이동. 하위 객체·컴포넌트도 함께 복제.
    async duplicateSelected() {
      const source = this.getSelectedSimObject();
      if (!(source == null ? void 0 : source.spawned)) return;
      const parent = source.root.parent || this.getSpawnParent();
      const clone = await this.cloneObjectTree(source, parent, true);
      if (!clone) return;
      this.select(clone.root);
      this.updateHierarchy(true);
    }
    // 다중 선택 Ctrl+V — 선택된 모든 객체를 각각 개별 복제와 같은 규약(라벨 `_dup`,
    // 동일 부모의 sibling, 바운딩 박스 x 폭 오프셋)으로 복제한다.
    async duplicateMultiSelected() {
      const roots = new Set(this.multiSelection);
      const sources = this.multiSelection.map((root) => {
        var _a;
        return (_a = this.ctx.objects) == null ? void 0 : _a.getByRoot(root);
      }).filter((s) => s == null ? void 0 : s.spawned).filter((s) => {
        let p = s.root.parent;
        while (p) {
          if (roots.has(p)) return false;
          p = p.parent;
        }
        return true;
      });
      if (!sources.length) return;
      const clones = [];
      for (const source of sources) {
        const parent = source.root.parent || this.getSpawnParent();
        const clone = await this.cloneObjectTree(source, parent, true);
        if (clone) clones.push(clone.root);
      }
      if (clones.length >= 2) this.applyMultiSelection(clones);
      else if (clones.length === 1) this.select(clones[0]);
      this.updateHierarchy(true);
    }
    // 복제 위치 오프셋 — 고정 +1 이 아니라 원본 바운딩 박스의 x 폭만큼 이동한다.
    // Box3 는 월드 기준이므로 부모의 월드 스케일로 나눠 부모 좌표계 단위로 환산.
    getCloneOffsetX(source) {
      const THREE = this.THREE;
      try {
        const box = new THREE.Box3().setFromObject(source.root);
        if (!box.isEmpty()) {
          let width = box.getSize(new THREE.Vector3()).x;
          const parent = source.root.parent;
          if (parent) {
            const ps = parent.getWorldScale(new THREE.Vector3());
            if (ps.x > 1e-6) width /= ps.x;
          }
          if (Number.isFinite(width) && width > 1e-4) return width;
        }
      } catch (e) {
      }
      return 1;
    }
    // 씬 로드(applyScene)와 같은 방식으로 타입별 재생성 → 트랜스폼·라벨·컴포넌트 복사.
    // isTop 인 최상위만 _dup 라벨과 바운딩 박스 x 폭 오프셋을 받고, 하위는 원본 그대로 재귀 복제한다.
    async cloneObjectTree(source, parent, isTop) {
      var _a, _b, _c;
      let sim = null;
      try {
        if (source.type === "albi-body") {
          const list = await createSpawnedAlbiObjects(this.ctx);
          sim = list[0];
          this.ctx.objects.add(sim, parent);
          list.slice(1).forEach((child) => this.ctx.objects.add(child, sim.root));
        } else if (source.type === "glb") {
          if (!((_a = source.metadata) == null ? void 0 : _a.glbUrl)) return null;
          sim = await createGlbObject(this.ctx, source.metadata.glbUrl, source.label);
          this.ctx.objects.add(sim, parent);
        } else {
          sim = createPrimitiveObject(this.ctx, source.type);
          this.ctx.objects.add(sim, parent);
        }
      } catch (err) {
        console.error("\uAC1D\uCCB4 \uBCF5\uC81C \uC2E4\uD328:", source.label, err);
        return null;
      }
      sim.label = isTop ? `${source.label}_dup` : source.label;
      sim.root.userData.simEditorLabel = sim.label;
      sim.root.position.copy(source.root.position);
      sim.root.quaternion.copy(source.root.quaternion);
      sim.root.scale.copy(source.root.scale);
      if (isTop) sim.root.position.x += this.getCloneOffsetX(source);
      if (((_b = source.metadata) == null ? void 0 : _b.colors) && ((_c = sim.metadata) == null ? void 0 : _c.colors)) {
        sim.metadata.colors.base = [...source.metadata.colors.base];
        sim.metadata.colors.emissive = [...source.metadata.colors.emissive];
        applyObjectColors(sim);
      }
      serializeComponents(source).forEach(({ type, fields }) => {
        try {
          attachComponent(this.ctx, sim, type, fields || {});
        } catch (err) {
          console.warn("\uCEF4\uD3EC\uB10C\uD2B8 \uBCF5\uC81C \uC2E4\uD328:", type, err);
        }
      });
      for (const child of this.ctx.objects.getChildrenOf(source)) {
        if (child.type === "albi-led") continue;
        await this.cloneObjectTree(child, sim.root, false);
      }
      return sim;
    }
    onKeyDown(event) {
      var _a, _b;
      if (!this.devMode) return;
      if (event.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(event.target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "v") {
        if (this.isMultiActive()) {
          event.preventDefault();
          this.duplicateMultiSelected();
          return;
        }
        if ((_a = this.getSelectedSimObject()) == null ? void 0 : _a.spawned) {
          event.preventDefault();
          this.duplicateSelected();
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "w") this.setMode("translate");
      else if (key === "e") this.setMode("rotate");
      else if (key === "r") this.setMode("scale");
      else if (key === "escape") {
        this.select(null);
        this.hideContextMenu();
      } else if ((key === "delete" || key === "backspace") && ((_b = this.getSelectedSimObject()) == null ? void 0 : _b.spawned)) {
        this.deleteSelected();
      }
    }
    setPointer(event) {
      const rect = this.dom.getBoundingClientRect();
      this.pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }
    getGroundPoint(event) {
      this.setPointer(event);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const point = new this.THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, point)) return point;
      return this.raycaster.ray.at(4, point);
    }
    pick(event) {
      this.setPointer(event);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const roots = this.selectables.map((entry) => entry.object);
      const hits = this.raycaster.intersectObjects(roots, true);
      for (const hit of hits) {
        let node = hit.object;
        while (node) {
          const entry = this.selectables.find((item) => item.object === node);
          if (entry) return entry.object;
          node = node.parent;
        }
      }
      return null;
    }
    showContextMenu(event) {
      const rect = this.ctx.stage.getBoundingClientRect();
      const menuW = 172;
      const menuH = Math.min(360, rect.height - 16);
      const x = Math.min(Math.max(8, event.clientX - rect.left), Math.max(8, rect.width - menuW - 8));
      const y = Math.min(Math.max(8, event.clientY - rect.top), Math.max(8, rect.height - menuH - 8));
      this.menu.style.left = `${x}px`;
      this.menu.style.top = `${y}px`;
      this.menu.hidden = false;
      this.updateContextMenuState();
    }
    updateContextMenuState() {
      const hasSelectedObject = !!this.getSelectedSimObject();
      this.menu.querySelectorAll("[data-spawn-child]").forEach((btn) => {
        btn.disabled = !hasSelectedObject;
      });
      const deleteBtn = this.menu.querySelector('[data-action="delete-selected"]');
      const selectedObject = this.getSelectedSimObject();
      if (deleteBtn) deleteBtn.disabled = !(selectedObject == null ? void 0 : selectedObject.spawned);
      if (this.compSection) {
        this.compSection.textContent = "";
        const attached = selectedObject ? Object.keys(selectedObject.components || {}).filter((k) => {
          var _a;
          return (_a = selectedObject.components[k]) == null ? void 0 : _a.declarative;
        }) : [];
        COMPONENT_TYPES.forEach((type) => {
          const has = attached.includes(type);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.dataset.component = type;
          btn.textContent = `${has ? "\u2212" : "+"} ${type}`;
          btn.disabled = !(selectedObject == null ? void 0 : selectedObject.spawned);
          btn.addEventListener("click", () => {
            if (has) this.detachFromSelected(type);
            else this.attachToSelected(type);
          });
          this.compSection.appendChild(btn);
        });
      }
    }
    hideContextMenu() {
      this.menu.hidden = true;
    }
    onPointerDown(event) {
      var _a;
      if (!this.devMode) return;
      if (event.button !== 0) return;
      this.hideContextMenu();
      if ((_a = this.transform) == null ? void 0 : _a.axis) return;
      const picked = this.pick(event);
      if (picked) {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) this.toggleMultiSelect(picked);
        else this.select(picked);
      } else {
        this.select(null);
      }
    }
    onContextMenu(event) {
      if (!this.devMode) return;
      event.preventDefault();
      this.lastSpawnPoint.copy(this.getGroundPoint(event));
      const picked = this.pick(event);
      if (picked) this.select(picked);
      this.showContextMenu(event);
    }
    renderHierarchyItem(simObject, depth, list) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "sim-editor-hierarchy-item";
      row.dataset.simObjectId = simObject.id;
      row.style.setProperty("--depth", depth);
      row.setAttribute("aria-pressed", String(this.isSelectedRoot(simObject.root)));
      const type = document.createElement("span");
      type.className = "sim-editor-hierarchy-type";
      type.textContent = simObject.type;
      const label = document.createElement("span");
      label.className = "sim-editor-hierarchy-label";
      label.textContent = simObject.label;
      row.append(type, label);
      let holdTimer = 0, renamed = false;
      row.addEventListener("pointerdown", () => {
        renamed = false;
        holdTimer = setTimeout(() => {
          renamed = true;
          this.select(simObject.root);
          this.renameObject(simObject);
        }, RENAME_HOLD_MS);
      });
      const cancelHold = () => {
        clearTimeout(holdTimer);
      };
      row.addEventListener("pointerup", cancelHold);
      row.addEventListener("pointerleave", cancelHold);
      row.addEventListener("click", (event) => {
        if (renamed) {
          renamed = false;
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          this.toggleMultiSelect(simObject.root);
          return;
        }
        this.select(simObject.root);
      });
      list.appendChild(row);
      this.ctx.objects.getChildrenOf(simObject).forEach((child) => {
        this.renderHierarchyItem(child, depth + 1, list);
      });
    }
    updateHierarchy(force = false) {
      var _a, _b, _c, _d;
      if (!this.hierarchy) return;
      const version = (_b = (_a = this.ctx.objects) == null ? void 0 : _a.version) != null ? _b : 0;
      if (!force && this.hierarchyVersion === version) return;
      this.hierarchyVersion = version;
      const list = this.hierarchy.querySelector(".sim-editor-hierarchy-list");
      if (!list) return;
      list.textContent = "";
      const roots = ((_d = (_c = this.ctx.objects) == null ? void 0 : _c.getRoots) == null ? void 0 : _d.call(_c)) || [];
      if (roots.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sim-editor-hierarchy-empty";
        empty.textContent = "No objects";
        list.appendChild(empty);
        return;
      }
      roots.forEach((simObject) => this.renderHierarchyItem(simObject, 0, list));
    }
    onDocumentPointerDown(event) {
      if (this.glbMenu && !this.glbMenu.hidden && !this.glbMenu.contains(event.target)) {
        this.glbMenu.hidden = true;
      }
      if (this.menu.hidden || this.menu.contains(event.target) || event.target === this.dom) return;
      this.hideContextMenu();
    }
    onDraggingChanged(event) {
      this.orbit.enabled = !event.value;
      if (!event.value) {
        if (this.axisEdit) this.applyAxisHandleDrop();
        this.refreshInspectorTransform();
      }
    }
    update() {
      var _a;
      if (this.selected) this.boxHelper.setFromObject(this.selected);
      if (this.isMultiActive()) this.multiHelpers.forEach((h) => h.update());
      if (this.axisEdit && !((_a = this.transform) == null ? void 0 : _a.dragging)) this.syncAxisHandle();
      this.updateHierarchy();
    }
    dispose() {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
      this.dom.removeEventListener("pointerdown", this.onPointerDown);
      this.dom.removeEventListener("contextmenu", this.onContextMenu);
      document.removeEventListener("pointerdown", this.onDocumentPointerDown);
      window.removeEventListener("keydown", this.onKeyDown);
      (_a = this.toolbar) == null ? void 0 : _a.remove();
      (_b = this.axisBar) == null ? void 0 : _b.remove();
      (_c = this.menu) == null ? void 0 : _c.remove();
      (_d = this.glbMenu) == null ? void 0 : _d.remove();
      (_e = this.hierarchy) == null ? void 0 : _e.remove();
      (_f = this.inspector) == null ? void 0 : _f.remove();
      if (this.transform) {
        this.transform.removeEventListener("dragging-changed", this.onDraggingChanged);
        this.transform.removeEventListener("objectChange", this.onMultiPivotChange);
        this.transform.detach();
        (_h = (_g = this.transform).dispose) == null ? void 0 : _h.call(_g);
        (_i = this.transform.parent) == null ? void 0 : _i.remove(this.transform);
      }
      this.clearMultiSelection();
      if (this.multiPivot) {
        (_j = this.multiPivot.parent) == null ? void 0 : _j.remove(this.multiPivot);
        this.multiPivot = null;
      }
      (_l = (_k = this.boxHelper.geometry) == null ? void 0 : _k.dispose) == null ? void 0 : _l.call(_k);
      (_n = (_m = this.boxHelper.material) == null ? void 0 : _m.dispose) == null ? void 0 : _n.call(_m);
      (_o = this.boxHelper.parent) == null ? void 0 : _o.remove(this.boxHelper);
      if (this.axisHandle) {
        this.axisHandle.traverse((node) => {
          var _a2, _b2, _c2, _d2;
          (_b2 = (_a2 = node.geometry) == null ? void 0 : _a2.dispose) == null ? void 0 : _b2.call(_a2);
          (_d2 = (_c2 = node.material) == null ? void 0 : _c2.dispose) == null ? void 0 : _d2.call(_c2);
        });
        (_p = this.axisHandle.parent) == null ? void 0 : _p.remove(this.axisHandle);
        this.axisHandle = null;
      }
      if (this.devGrids) {
        this.devGrids.traverse((node) => {
          var _a2, _b2, _c2, _d2;
          (_b2 = (_a2 = node.geometry) == null ? void 0 : _a2.dispose) == null ? void 0 : _b2.call(_a2);
          (_d2 = (_c2 = node.material) == null ? void 0 : _c2.dispose) == null ? void 0 : _d2.call(_c2);
        });
        (_q = this.devGrids.parent) == null ? void 0 : _q.remove(this.devGrids);
        this.devGrids = null;
      }
    }
  };

  // Sim_Parts/context.js
  var CAMERA_CONTROL = {
    zoomSpeed: 0.4,
    wheelScale: 25e-4,
    smoothRate: 10,
    minDistanceRatio: 0.35,
    maxDistanceRatio: 3,
    minDistanceFloor: 0.2,
    pinchSpeed: 3
    // 핀치 줌 배율(거리 비율의 지수) — 값이 클수록 빠르게 확대/축소
  };
  var Context = class {
    constructor(THREE, A, stage, loadingEl, cfg, options = {}) {
      this.THREE = THREE;
      this.A = A;
      this.stage = stage;
      this.loadingEl = loadingEl;
      this.cfg = cfg;
      this.logLine = options.logLine;
      this.ensureAudio = options.ensureAudio;
      this.state = options.state;
      this.audioCtx = null;
      this.disposed = false;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.stage.appendChild(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = this.pmrem.fromScene(new A.RoomEnvironment(), 0.04).texture;
      this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
      this.controls = new A.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.enableZoom = false;
      this.smoothZoomTarget = null;
      this.onSmoothZoomWheel = (event) => this.handleSmoothZoomWheel(event);
      this.renderer.domElement.addEventListener("wheel", this.onSmoothZoomWheel, { passive: false });
      this._pinchPointers = /* @__PURE__ */ new Map();
      this._pinchPrevDist = 0;
      this.onPinchDown = (e) => this.handlePinchDown(e);
      this.onPinchMove = (e) => this.handlePinchMove(e);
      this.onPinchUp = (e) => this.handlePinchUp(e);
      const _dom = this.renderer.domElement;
      _dom.addEventListener("pointerdown", this.onPinchDown);
      _dom.addEventListener("pointermove", this.onPinchMove);
      _dom.addEventListener("pointerup", this.onPinchUp);
      _dom.addEventListener("pointercancel", this.onPinchUp);
      this.homeCamPos = null;
      this.homeTarget = null;
      this.camResetTween = null;
      this.scene.add(new THREE.HemisphereLight(13622514, 1910304, 0.34));
      const key = new THREE.DirectionalLight(16768432, 2.6);
      key.position.set(0, 6, -10);
      key.castShadow = true;
      key.shadow.mapSize.set(4096, 4096);
      key.shadow.bias = -3e-4;
      key.shadow.camera.left = -20;
      key.shadow.camera.right = 20;
      key.shadow.camera.top = 20;
      key.shadow.camera.bottom = -20;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 140;
      key.shadow.camera.updateProjectionMatrix();
      this.scene.add(key);
      this.scene.add(key.target);
      this.keyLight = key;
      const fill = new THREE.DirectionalLight(9417968, 0.3);
      fill.position.set(-4, 2, 6);
      this.scene.add(fill);
      this.ground = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.ShadowMaterial({ opacity: 0.38 }));
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.receiveShadow = true;
      this.scene.add(this.ground);
      this.checkerFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 120),
        new THREE.MeshStandardMaterial({ map: this._makeCheckerTexture(), roughness: 0.95, metalness: 0 })
      );
      this.checkerFloor.rotation.x = -Math.PI / 2;
      this.checkerFloor.position.y = -0.01;
      this.checkerFloor.receiveShadow = true;
      this.scene.add(this.checkerFloor);
      this.worldGroup = null;
      this.planeGrids = null;
      this.lastRenderTime = 0;
      this.leds = new Leds(this);
      this.movement = new Movement(this);
      this.gun = new Gun(this);
      this.rocket = new Rocket(this);
      this.traffic = new Traffic(this);
      this.waves = new Waves(this);
      this.audio = new Audio(this);
      this.assets = new Assets(this);
      this.renderEngine = new Render(this);
      this.dispatcher = new Dispatch(this);
      this.objects = new SimulationObjectRegistry(this);
      this.editor = new EditorControls(this);
    }
    // 키 라이트(그림자 광원) — 방향은 월드에 고정하되, 첫 프레임에 초기 카메라의
    // 반대편(역광)으로 잡는다. 초기 화면에서는 그림자가 사용자 쪽으로 드리우고,
    // 이후 카메라가 회전하면 태양처럼 세상에 고정된 조명·그림자가 자연스럽게 보인다.
    // 위치는 종전처럼 카메라 타깃을 평행 추종해 좁은 그림자 프러스텀이 시야를 덮는다.
    updateKeyLight() {
      const t = this.controls.target;
      if (!this._keyDir) {
        const dir = new this.THREE.Vector3().subVectors(t, this.camera.position);
        dir.y = 0;
        const len = dir.length();
        if (len > 1e-3) dir.divideScalar(len);
        else dir.set(0, 0, -1);
        dir.applyAxisAngle(new this.THREE.Vector3(0, 1, 0), -this.THREE.MathUtils.degToRad(30));
        this._keyDir = dir;
      }
      const BACK = 10, HEIGHT = 6;
      this.keyLight.position.set(t.x + this._keyDir.x * BACK, t.y + HEIGHT, t.z + this._keyDir.z * BACK);
      this.keyLight.target.position.copy(t);
    }
    // 사용자 모드에서는 카메라가 바닥 평면 아래로 내려가지 못하게 막는다.
    // 개발자 모드(editor.devMode)는 씬 저작을 위해 바닥 밑 시점을 허용한다.
    clampCameraAboveFloor() {
      var _a;
      if ((_a = this.editor) == null ? void 0 : _a.devMode) return;
      const MIN_Y = 0.15;
      if (this.camera.position.y < MIN_Y) this.camera.position.y = MIN_Y;
    }
    clampCameraDistance(distance) {
      return Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, distance));
    }
    handleSmoothZoomWheel(event) {
      var _a;
      event.preventDefault();
      const lineHeight = 16;
      const pageHeight = this.stage.clientHeight || 300;
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? lineHeight : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? pageHeight : 1;
      const delta = event.deltaY * unit;
      const currentDistance = this.camera.position.distanceTo(this.controls.target);
      const baseDistance = (_a = this.smoothZoomTarget) != null ? _a : currentDistance;
      const scale = Math.exp(delta * CAMERA_CONTROL.wheelScale * CAMERA_CONTROL.zoomSpeed);
      this.smoothZoomTarget = this.clampCameraDistance(baseDistance * scale);
    }
    updateSmoothZoom(dt) {
      if (this.smoothZoomTarget == null) return;
      const target = this.controls.target;
      const offset = this.camera.position.clone().sub(target);
      const currentDistance = offset.length();
      if (currentDistance <= 1e-4) {
        offset.set(0, 0, 1);
      } else {
        offset.normalize();
      }
      const desiredDistance = this.clampCameraDistance(this.smoothZoomTarget);
      const alpha = 1 - Math.exp(-CAMERA_CONTROL.smoothRate * Math.max(0, dt));
      const nextDistance = currentDistance + (desiredDistance - currentDistance) * alpha;
      this.camera.position.copy(target).add(offset.multiplyScalar(nextDistance));
      if (Math.abs(desiredDistance - nextDistance) < 1e-3) {
        this.camera.position.copy(target).add(offset.normalize().multiplyScalar(desiredDistance));
        this.smoothZoomTarget = null;
      }
    }
    // ----- 두 손가락 핀치 줌 -----
    _pinchDistance() {
      const pts = [...this._pinchPointers.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
    handlePinchDown(e) {
      if (e.pointerType !== "touch") return;
      this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pinchPointers.size === 2) this._pinchPrevDist = this._pinchDistance();
    }
    handlePinchMove(e) {
      var _a;
      if (e.pointerType !== "touch" || !this._pinchPointers.has(e.pointerId)) return;
      this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pinchPointers.size !== 2) return;
      const dist = this._pinchDistance();
      if (this._pinchPrevDist > 0 && dist > 0) {
        const base = (_a = this.smoothZoomTarget) != null ? _a : this.camera.position.distanceTo(this.controls.target);
        const ratio = Math.pow(this._pinchPrevDist / dist, CAMERA_CONTROL.pinchSpeed);
        this.smoothZoomTarget = this.clampCameraDistance(base * ratio);
      }
      this._pinchPrevDist = dist;
    }
    handlePinchUp(e) {
      if (e.pointerType !== "touch") return;
      this._pinchPointers.delete(e.pointerId);
      if (this._pinchPointers.size < 2) this._pinchPrevDist = 0;
    }
    // ----- 더블클릭: 처음 시작할 때(frame)의 카메라 상태로 복귀 -----
    resetCameraHome() {
      if (!this.homeCamPos || !this.homeTarget) return;
      this.smoothZoomTarget = null;
      this.camResetTween = {
        fromPos: this.camera.position.clone(),
        fromTarget: this.controls.target.clone(),
        toPos: this.homeCamPos.clone(),
        toTarget: this.homeTarget.clone(),
        t: 0,
        dur: 0.45
      };
    }
    updateCameraReset(dt) {
      const tw = this.camResetTween;
      if (!tw) return;
      tw.t = Math.min(1, tw.t + Math.max(0, dt) / tw.dur);
      const x = tw.t;
      const e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      if (tw.t >= 1) {
        this.camera.position.copy(tw.toPos);
        this.controls.target.copy(tw.toTarget);
        this.camResetTween = null;
      }
    }
    // ----- 사용자 모드 체커 바닥 -----
    _makeCheckerTexture() {
      const THREE = this.THREE;
      const size = 64;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      g.fillStyle = "#565e69";
      g.fillRect(0, 0, size, size);
      g.fillStyle = "#31373f";
      g.fillRect(0, 0, size / 2, size / 2);
      g.fillRect(size / 2, size / 2, size / 2, size / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(60, 60);
      tex.magFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    setCheckerFloorVisible(v) {
      if (this.checkerFloor) this.checkerFloor.visible = !!v;
    }
    getAudioCtx() {
      if (!this.audioCtx && this.ensureAudio) {
        this.audioCtx = this.ensureAudio();
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        try {
          this.audioCtx.resume();
        } catch (e) {
        }
      }
      return this.audioCtx;
    }
    resize() {
      const w = this.stage.clientWidth || 360, h = this.stage.clientHeight || 300;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    frame(cy, dist) {
      this.camera.position.set(0, cy, dist);
      this.camera.near = dist / 100;
      this.camera.far = dist * 100;
      this.camera.updateProjectionMatrix();
      this.controls.minDistance = Math.max(CAMERA_CONTROL.minDistanceFloor, dist * CAMERA_CONTROL.minDistanceRatio);
      this.controls.maxDistance = Math.max(this.controls.minDistance + CAMERA_CONTROL.minDistanceFloor, dist * CAMERA_CONTROL.maxDistanceRatio);
      this.smoothZoomTarget = null;
      this.controls.target.set(0, cy, 0);
      this.controls.update();
      this.homeCamPos = this.camera.position.clone();
      this.homeTarget = this.controls.target.clone();
      this.camResetTween = null;
    }
    dispose() {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
      this.disposed = true;
      if (this.onSmoothZoomWheel) {
        this.renderer.domElement.removeEventListener("wheel", this.onSmoothZoomWheel);
      }
      if (this.onPinchDown) {
        const _dom = this.renderer.domElement;
        _dom.removeEventListener("pointerdown", this.onPinchDown);
        _dom.removeEventListener("pointermove", this.onPinchMove);
        _dom.removeEventListener("pointerup", this.onPinchUp);
        _dom.removeEventListener("pointercancel", this.onPinchUp);
      }
      try {
        this.controls.dispose();
      } catch (e) {
      }
      (_b = (_a = this.objects) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
      this.scene.traverse((o) => {
        var _a2, _b2;
        if (o.isMesh || o.isSprite) {
          (_b2 = (_a2 = o.geometry) == null ? void 0 : _a2.dispose) == null ? void 0 : _b2.call(_a2);
          const m = o.material;
          (Array.isArray(m) ? m : [m]).forEach((mm) => {
            var _a3, _b3, _c2;
            (_b3 = (_a3 = mm == null ? void 0 : mm.map) == null ? void 0 : _a3.dispose) == null ? void 0 : _b3.call(_a3);
            (_c2 = mm == null ? void 0 : mm.dispose) == null ? void 0 : _c2.call(mm);
          });
        }
      });
      try {
        (_d = (_c = this.scene.environment) == null ? void 0 : _c.dispose) == null ? void 0 : _d.call(_c);
        this.scene.environment = null;
        this.pmrem.dispose();
      } catch (e) {
      }
      try {
        this.renderer.dispose();
      } catch (e) {
      }
      try {
        (_f = (_e = this.renderer).forceContextLoss) == null ? void 0 : _f.call(_e);
      } catch (e) {
      }
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      (_h = (_g = this.editor) == null ? void 0 : _g.dispose) == null ? void 0 : _h.call(_g);
      (_j = (_i = this.leds) == null ? void 0 : _i.dispose) == null ? void 0 : _j.call(_i);
      (_l = (_k = this.gun) == null ? void 0 : _k.dispose) == null ? void 0 : _l.call(_k);
      (_n = (_m = this.traffic) == null ? void 0 : _m.dispose) == null ? void 0 : _n.call(_m);
      (_p = (_o = this.waves) == null ? void 0 : _o.dispose) == null ? void 0 : _p.call(_o);
      (_r = (_q = this.rocket) == null ? void 0 : _q.dispose) == null ? void 0 : _r.call(_q);
    }
  };

  // Simulation/Simulation_Rover.js
  function createRoverObject(ctx, root, type, label, metadata = {}) {
    var _a;
    return new SimulationObject({
      id: ((_a = ctx.objects) == null ? void 0 : _a.makeId(type)) || `${type}-${Date.now()}`,
      type,
      label,
      root,
      metadata
    });
  }
  function addRoverObject(ctx, root, type, label, parent, metadata = {}) {
    if (!root || !ctx.objects) return null;
    return ctx.objects.add(createRoverObject(ctx, root, type, label, metadata), parent);
  }
  var Simulation_Rover = class extends Simulation_Base {
    constructor(ctx) {
      super(ctx);
      this.leds = ctx.leds;
      this.movement = ctx.movement;
      this.gun = ctx.gun;
      this.waves = ctx.waves;
      this.roverGroup = null;
    }
    init() {
      const ctx = this.ctx;
      const THREE = ctx.THREE;
      const scene = ctx.scene;
      const cfg = ctx.cfg;
      this.roverGroup = new THREE.Group();
      this.roverGroup.position.y = 0.4;
      scene.add(this.roverGroup);
      ctx.roverGroup = this.roverGroup;
      addRoverObject(ctx, this.roverGroup, "rover-body", cfg.label || "Rover", scene, { modelRole: "body" });
      if (cfg.helpers) {
        this.movement.setupWorld(scene, ctx.editor);
      }
      this.setupRoverIndicators();
      this.movement.setupSensorIndicators(this.roverGroup);
      this.registerSensorIndicators();
      ctx.assets.loadModels(
        cfg.parts,
        (url, root) => {
          var _a, _b;
          if (/RoverWheel\.glb$/.test(url)) {
            this.movement.setupWheels(this.roverGroup, root, ctx.editor);
            addRoverObject(ctx, this.movement.wheelR, "rover-part", "Rover Wheel R", this.roverGroup, { modelRole: "wheel-r" });
            addRoverObject(ctx, this.movement.wheelL, "rover-part", "Rover Wheel L", this.roverGroup, { modelRole: "wheel-l" });
          } else if (/RoverRadar\.glb$/.test(url)) {
            this.movement.setupRadar(this.roverGroup, root, ctx.editor);
            addRoverObject(ctx, root, "rover-part", "Rover Radar", this.roverGroup, { modelRole: "radar" });
          } else if (/RoverLED\.glb$/.test(url)) {
            root.position.set(0, 0.35, 0.2);
            root.rotation.x = Math.PI / 4;
            this.roverGroup.add(root);
            (_a = ctx.editor) == null ? void 0 : _a.register(root, "Rover LED Mesh");
            addRoverObject(ctx, root, "rover-part", "Rover LED Mesh", this.roverGroup, { modelRole: "led-mesh" });
          } else if (/RoverHead\.glb$/.test(url)) {
            this.movement.setupHead(this.roverGroup, root, ctx.editor);
            addRoverObject(ctx, root, "rover-part", "Rover Head", this.roverGroup, { modelRole: "head" });
          } else if (/RoverGun\.glb$/.test(url)) {
            this.gun.setupGun(this.roverGroup, root, ctx.editor);
            addRoverObject(ctx, root, "rover-part", "Rover Gun", this.roverGroup, { modelRole: "gun" });
          } else if (/RoverOLED\.glb$/.test(url)) {
            this.leds.setupOled(this.roverGroup, root, ctx.editor);
            addRoverObject(ctx, root, "rover-part", "Rover OLED", this.roverGroup, { modelRole: "oled" });
          } else {
            this.roverGroup.add(root);
            (_b = ctx.editor) == null ? void 0 : _b.register(root, "Rover Component");
            addRoverObject(ctx, root, "rover-part", "Rover Component", this.roverGroup, { modelRole: "component" });
          }
        },
        () => {
          var _a, _b;
          if (ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = "none";
          (_b = (_a = ctx.editor) == null ? void 0 : _a.updateHierarchy) == null ? void 0 : _b.call(_a, true);
          this.ctx.frame(0.6, 2.8);
        }
      );
    }
    setupRoverIndicators() {
      const count = 6;
      const x0 = -0.4;
      const x1 = 0.4;
      const y = 0.4;
      const z = 0.25;
      const step = (x1 - x0) / (count - 1);
      for (let i = 0; i < count; i++) {
        const led = this.leds.register(`rover-${i}`, this.leds.createBallLed());
        led.mesh.position.set(x0 + step * i, y, z);
        this.roverGroup.add(led.mesh);
        addRoverObject(this.ctx, led.mesh, "rover-led", `Rover LED ${i + 1}`, this.roverGroup, {
          led,
          index: i,
          modelRole: "led"
        });
      }
    }
    registerSensorIndicators() {
      addRoverObject(this.ctx, this.movement.magSensorBall, "rover-sensor", "Rover Magnet Sensor", this.roverGroup, {
        modelRole: "magnet-sensor"
      });
      this.movement.irSensorBalls.forEach((sensor, index) => {
        addRoverObject(this.ctx, sensor, "rover-sensor", `Rover Distance Sensor ${index + 1}`, this.roverGroup, {
          index,
          modelRole: "distance-sensor"
        });
      });
    }
    // Base Controller interface overrides
    dispose() {
      super.dispose();
      if (this.roverGroup && this.roverGroup.parent) {
        this.roverGroup.parent.remove(this.roverGroup);
      }
      if (this.ctx.worldGroup && this.ctx.worldGroup.parent) {
        this.ctx.worldGroup.parent.remove(this.ctx.worldGroup);
      }
    }
    // Getters/setters delegating properties to respective subsystems
    get boxes() {
      return this.movement.boxes;
    }
    get magSensorBall() {
      return this.movement.magSensorBall;
    }
    set magSensorBall(v) {
      this.movement.magSensorBall = v;
    }
    get irSensorBalls() {
      return this.movement.irSensorBalls;
    }
    get wheelR() {
      return this.movement.wheelR;
    }
    set wheelR(v) {
      this.movement.wheelR = v;
    }
    get wheelL() {
      return this.movement.wheelL;
    }
    set wheelL(v) {
      this.movement.wheelL = v;
    }
    get antennaPivot() {
      return this.movement.antennaPivot;
    }
    set antennaPivot(v) {
      this.movement.antennaPivot = v;
    }
    get gunMesh() {
      return this.gun.gunMesh;
    }
    set gunMesh(v) {
      this.gun.gunMesh = v;
    }
    get oledCanvas() {
      return this.leds.oledCanvas;
    }
    set oledCanvas(v) {
      this.leds.oledCanvas = v;
    }
    get oledCtx() {
      return this.leds.oledCtx;
    }
    set oledCtx(v) {
      this.leds.oledCtx = v;
    }
    get oledTex() {
      return this.leds.oledTex;
    }
    set oledTex(v) {
      this.leds.oledTex = v;
    }
    get muzzleWorldPos() {
      return this.gun.muzzleWorldPos;
    }
    get muzzleForward() {
      return this.gun.muzzleForward;
    }
    get obstaclesOn() {
      return this.movement.obstaclesOn;
    }
    set obstaclesOn(v) {
      this.movement.obstaclesOn = v;
    }
    get servoOn() {
      return this.movement.servoOn;
    }
    set servoOn(v) {
      this.movement.servoOn = v;
    }
    get servoDir() {
      return this.movement.servoDir;
    }
    set servoDir(v) {
      this.movement.servoDir = v;
    }
    get servoTurnOn() {
      return this.movement.servoTurnOn;
    }
    set servoTurnOn(v) {
      this.movement.servoTurnOn = v;
    }
    get servoTurnDir() {
      return this.movement.servoTurnDir;
    }
    set servoTurnDir(v) {
      this.movement.servoTurnDir = v;
    }
    get radarOn() {
      return this.movement.radarOn;
    }
    set radarOn(v) {
      this.movement.radarOn = v;
    }
    get radarDir() {
      return this.movement.radarDir;
    }
    set radarDir(v) {
      this.movement.radarDir = v;
    }
    get roverWaveOn() {
      return this.waves.roverWaveOn;
    }
    set roverWaveOn(v) {
      this.waves.roverWaveOn = v;
    }
    // Control Methods
    setRoverLed(num2, value) {
      this.leds.setIndexed("rover", num2, value);
    }
    setServoMove(on, dir) {
      this.movement.setServoMove(on, dir);
    }
    setServoTurn(on, dir) {
      this.movement.setServoTurn(on, dir);
    }
    stopServo() {
      this.movement.stopServo();
    }
    setDistanceSensor(on) {
      this.movement.setDistanceSensor(on);
    }
    measureDistance() {
      return this.movement.measureDistance();
    }
    setRadar(on, dir) {
      this.movement.setRadar(on, dir);
    }
    setObstacles(on) {
      this.movement.setObstacles(on);
    }
    respawnBoxes() {
      this.movement.respawnBoxes();
    }
    setRoverWave(on) {
      this.waves.setRoverWave(on);
    }
    toggleGrids() {
      const grids = this.ctx.planeGrids;
      if (!grids) return;
      grids.visible = !grids.visible;
    }
    oledClear() {
      this.leds.clear();
    }
    oledClearRect(x, y, w, h) {
      this.leds.clearRect(x, y, w, h);
    }
    oledText(x, y, text) {
      this.leds.text(x, y, text);
    }
    oledIcon(name, x, y) {
      this.leds.icon(name, x, y);
    }
    setGunFire() {
      this.gun.setGunFire();
    }
    // Properties checked by outside Simulation_Main wrapper
    get hasRoverLeds() {
      return !!this.leds.get("rover-0");
    }
    get hasDistanceSensor() {
      return this.movement.irSensorBalls.length > 0;
    }
    // worldGroup 은 Movement 가 ctx 에 싣는다(this 에는 없음) — this.worldGroup 을 읽으면
    // 항상 undefined 라 hasServo 가 영구 false 가 되어 SERVO linger·비상정지 stopServo()
    // 가 모두 죽는다. hasGrids 처럼 ctx 를 본다.
    get hasServo() {
      return !!this.ctx.worldGroup;
    }
    get hasRadar() {
      return !!this.movement.antennaPivot;
    }
    get hasGun() {
      return !!this.gun.gunMesh;
    }
    get hasOled() {
      return !!this.leds.oledCanvas;
    }
    get hasRoverWave() {
      return !!this.ctx.worldGroup;
    }
    get hasGrids() {
      return !!this.ctx.planeGrids;
    }
    get servoActive() {
      return this.movement.servoOn || this.movement.servoTurnOn;
    }
    get hasBoxes() {
      return this.movement.boxes.length > 0;
    }
  };

  // Simulation/Simulation_Launcher.js
  var LAUNCH_STRIP_PALETTE = {
    sphereBase: 203274,
    emissive: 65331,
    glowStops: ["rgba(20,255,80,1)", "rgba(0,230,50,0.78)", "rgba(0,255,40,0)"],
    glowTint: 65348,
    lightColor: 65348,
    intensityScale: 0.12,
    opacityOn: 0.99,
    glowScale: 0.55
  };
  var LAUNCH_TORUS_PALETTE = {
    sphereBase: 2032132,
    emissive: 16714270,
    glowStops: ["rgba(255,80,70,1)", "rgba(255,20,25,0.78)", "rgba(255,0,0,0)"],
    glowTint: 16717864,
    lightColor: 16716834,
    intensityScale: 0.45,
    opacityOn: 0.99,
    glowScale: 0.55
  };
  var Simulation_Launcher = class extends Simulation_Base {
    constructor(ctx) {
      super(ctx);
      this.leds = ctx.leds;
      this.rocket = ctx.rocket;
      this.waves = ctx.waves;
      this.movement = ctx.movement;
    }
    init() {
      const ctx = this.ctx;
      const THREE = ctx.THREE;
      const cfg = ctx.cfg;
      const stripGlow = this.leds.createGlowTexture(LAUNCH_STRIP_PALETTE.glowStops);
      const torusGlow = this.leds.createGlowTexture(LAUNCH_TORUS_PALETTE.glowStops);
      this.loadAndSetupModel(cfg, (root) => {
        Rocket.recolorAntenna(root, THREE);
        this.rocket.setupRocket(root);
        this.movement.antennaPivot = root.userData.antennaPivot;
        this.setupLaunchIndicators(root, cfg.launch, stripGlow, torusGlow);
      });
    }
    setupLaunchIndicators(root, launchCfg, stripGlow, torusGlow) {
      const THREE = this.ctx.THREE;
      if (!launchCfg) return;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      this.waves.launchFootprintSize = Math.max(size.x, size.z);
      const lx = box.min.x + size.x * launchCfg.stripXFrac;
      const lz = box.min.z + size.z * launchCfg.stripZFrac;
      const yTop = box.min.y + size.y * launchCfg.stripYRange[0];
      const yBot = box.min.y + size.y * launchCfg.stripYRange[1];
      const count = launchCfg.stripCount;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1);
        const ly = yTop + (yBot - yTop) * t;
        const led = this.leds.register(`launch-${i + 1}`, this.leds.createMeshLed({
          radius: launchCfg.stripRadius,
          pos: [lx, ly, lz],
          palette: LAUNCH_STRIP_PALETTE,
          glowTex: stripGlow
        }));
        root.add(led.group);
      }
      const rb = root.userData.rocketBottomLocal;
      const rmesh = root.userData.rocketMeshRef;
      if (rb && rmesh) {
        const torusGeom = new THREE.TorusGeometry(launchCfg.torusRadius, launchCfg.torusTube, 16, 48);
        torusGeom.rotateX(Math.PI / 2);
        const ring = this.leds.register("launch-0", this.leds.createMeshLed({
          radius: launchCfg.torusRadius,
          pos: [rb.x, rb.y + launchCfg.torusYOffset, rb.z],
          palette: LAUNCH_TORUS_PALETTE,
          glowTex: torusGlow,
          geometry: torusGeom
        }));
        rmesh.add(ring.group);
      }
    }
    // Getters/setters
    get antennaPivot() {
      return this.movement.antennaPivot;
    }
    set antennaPivot(v) {
      this.movement.antennaPivot = v;
    }
    get rocketGroup() {
      return this.rocket.rocketGroup;
    }
    set rocketGroup(v) {
      this.rocket.rocketGroup = v;
    }
    get radarOn() {
      return this.movement.radarOn;
    }
    get radarDir() {
      return this.movement.radarDir;
    }
    get rocketLaunchOn() {
      return this.rocket.rocketLaunchOn;
    }
    get rocketAnimT() {
      return this.rocket.rocketAnimT;
    }
    setLaunchLed(i, value) {
      this.leds.setIndexed("launch", i, value);
    }
    setRadar(on, dir) {
      this.movement.setRadar(on, dir);
    }
    setRocketLaunch(on, followCamera) {
      this.rocket.setRocketLaunch(on, followCamera);
    }
    setLaunchWave(on) {
      this.waves.setLaunchWave(on);
    }
    playRocketLaunch() {
      this.ctx.audio.playRocketLaunch();
    }
    get hasLaunchLeds() {
      return !!this.leds.get("launch-0");
    }
    get hasLaunchWave() {
      return true;
    }
    get hasRadar() {
      return !!this.movement.antennaPivot;
    }
    get hasRocket() {
      return !!this.rocket.rocketGroup;
    }
    get rocketAtRest() {
      return !this.rocket.rocketLaunchOn && this.rocket.rocketAnimT === 0;
    }
  };

  // Simulation/Simulation_Traffic.js
  var Simulation_Traffic = class extends Simulation_Base {
    constructor(ctx) {
      super(ctx);
      this.traffic = ctx.traffic;
    }
    init() {
      const ctx = this.ctx;
      this.loadAndSetupModel(ctx.cfg, (root) => {
        this.traffic.setupTraffic(root, () => makeGLTFLoader(ctx.A), ctx.cfg.traffic);
      });
    }
    // Control Methods
    placeLamps() {
      this.traffic.placeLamps(() => makeGLTFLoader(this.ctx.A));
    }
    placeHands() {
      this.traffic.placeHands(() => makeGLTFLoader(this.ctx.A));
    }
    resetTraffic() {
      this.traffic.resetTraffic();
    }
    toggleSlot(idx) {
      this.traffic.toggleSlot(idx);
    }
    setSlot(idx, val) {
      this.traffic.setSlotOn(idx, val);
    }
    get hasTraffic() {
      return true;
    }
  };

  // Sim_Parts/scene_store.js
  var SCENE_FORMAT_VERSION = 1;
  var AUTO_CHILD_TYPES = /* @__PURE__ */ new Set(["albi-led"]);
  function serializeScene(ctx, { name = "scene", topic = "empty" } = {}) {
    var _a;
    const items = (((_a = ctx.objects) == null ? void 0 : _a.items) || []).filter(
      (o) => o.spawned && !AUTO_CHILD_TYPES.has(o.type)
    );
    const objects = items.map((o) => {
      var _a2, _b;
      const parent = ctx.objects.getParentOf(o);
      const entry = {
        id: o.id,
        type: o.type === "albi-body" ? "albi" : o.type,
        label: o.label,
        // 부모가 토픽 기본 객체(비스폰)면 씬 파일에는 최상위로 저장한다.
        parent: parent && parent.spawned ? parent.id : null,
        position: o.root.position.toArray(),
        quaternion: o.root.quaternion.toArray(),
        scale: o.root.scale.toArray(),
        components: serializeComponents(o)
      };
      if (o.type === "glb" && ((_a2 = o.metadata) == null ? void 0 : _a2.glbUrl)) entry.url = o.metadata.glbUrl;
      if ((_b = o.metadata) == null ? void 0 : _b.colors) {
        entry.colors = {
          base: [...o.metadata.colors.base],
          emissive: [...o.metadata.colors.emissive]
        };
      }
      return entry;
    });
    return { version: SCENE_FORMAT_VERSION, name, unitScale: 1, topic, objects };
  }
  function clearSpawnedObjects(ctx) {
    var _a, _b, _c;
    const spawned = (((_a = ctx.objects) == null ? void 0 : _a.items) || []).filter((o) => o.spawned);
    spawned.filter((o) => {
      const p = ctx.objects.getParentOf(o);
      return !p || !p.spawned;
    }).forEach((o) => ctx.objects.remove(o));
    (_c = (_b = ctx.editor) == null ? void 0 : _b.updateHierarchy) == null ? void 0 : _c.call(_b, true);
  }
  async function applyScene(ctx, json) {
    var _a, _b, _c;
    if (!json || json.version !== SCENE_FORMAT_VERSION || !Array.isArray(json.objects)) {
      throw new Error("\uC62C\uBC14\uB978 \uC52C \uD30C\uC77C\uC774 \uC544\uB2D9\uB2C8\uB2E4 (version/objects \uD655\uC778)");
    }
    clearSpawnedObjects(ctx);
    const byId = /* @__PURE__ */ new Map();
    for (const entry of json.objects) {
      const parentSim = entry.parent ? byId.get(entry.parent) : null;
      const parentRoot = (parentSim == null ? void 0 : parentSim.root) || ctx.worldGroup || ctx.scene;
      let sim;
      if (entry.type === "albi") {
        const list = await createSpawnedAlbiObjects(ctx);
        sim = list[0];
        ctx.objects.add(sim, parentRoot);
        list.slice(1).forEach((child) => ctx.objects.add(child, sim.root));
      } else if (entry.type === "glb") {
        if (!entry.url) {
          console.warn("glb \uB178\uB4DC\uC5D0 url \uC774 \uC5C6\uC2B5\uB2C8\uB2E4:", entry.id);
          continue;
        }
        sim = await createGlbObject(ctx, entry.url, entry.label);
        ctx.objects.add(sim, parentRoot);
      } else {
        sim = createPrimitiveObject(ctx, entry.type);
        ctx.objects.add(sim, parentRoot);
      }
      if (entry.label) {
        sim.label = entry.label;
        sim.root.userData.simEditorLabel = entry.label;
      }
      if (entry.position) sim.root.position.fromArray(entry.position);
      if (entry.quaternion) sim.root.quaternion.fromArray(entry.quaternion);
      if (entry.scale) sim.root.scale.fromArray(entry.scale);
      if (entry.colors && ((_a = sim.metadata) == null ? void 0 : _a.colors)) {
        if (Array.isArray(entry.colors.base)) sim.metadata.colors.base = [...entry.colors.base];
        if (Array.isArray(entry.colors.emissive)) sim.metadata.colors.emissive = [...entry.colors.emissive];
        applyObjectColors(sim);
      }
      (entry.components || []).forEach(({ type, fields }) => {
        try {
          attachComponent(ctx, sim, type, fields || {});
        } catch (err) {
          console.warn("\uCEF4\uD3EC\uB10C\uD2B8 \uBCF5\uC6D0 \uC2E4\uD328:", type, err);
        }
      });
      if (entry.id) byId.set(entry.id, sim);
    }
    (_c = (_b = ctx.editor) == null ? void 0 : _b.updateHierarchy) == null ? void 0 : _c.call(_b, true);
    return json;
  }

  // Simulation/Simulation_Main.js
  var _Simulation_Main = class _Simulation_Main {
    // Factory method to initialize Context and build the matching Simulation subclass instance
    static buildSim(THREE, A, stage, loadingEl, cfg, options = {}) {
      const ctx = new Context(THREE, A, stage, loadingEl, cfg, options);
      let sim;
      if (cfg.parts) {
        sim = new Simulation_Rover(ctx);
      } else if (cfg.traffic) {
        sim = new Simulation_Traffic(ctx);
      } else if (cfg.launch) {
        sim = new Simulation_Launcher(ctx);
      } else {
        sim = new Simulation_AresRobot(ctx);
      }
      if (typeof sim.init === "function") {
        sim.init();
      }
      return sim;
    }
    // 3D 시뮬레이션 초기화 — main.js 의 워크스페이스를 받아 컨트롤러 { open, close } 를 반환.
    static init({ workspace: workspace2, onOpen, onClose }) {
      const btn = document.getElementById("simToggle");
      const card = document.getElementById("simCard");
      const stage = document.getElementById("simStage");
      const loadingEl = document.getElementById("simLoading");
      const ledWrap = card ? card.querySelector(".sim-led-buttons") : null;
      const trafficWrap = card ? card.querySelector(".sim-traffic-buttons") : null;
      const launchWrap = card ? card.querySelector(".sim-launch-buttons") : null;
      const launchLedWrap = card ? card.querySelector(".sim-launch-led-buttons") : null;
      const roverWrap = card ? card.querySelector(".sim-rover-buttons") : null;
      const radarBtn = document.getElementById("simRadar");
      const rocketBtn = document.getElementById("simRocket");
      const obstacleBtn = document.getElementById("simObstacle");
      const OBSTACLE_REMOVE = '<span class="dot"></span>\uC7A5\uC560\uBB3C \uC81C\uAC70';
      const OBSTACLE_INSTALL = '<span class="dot"></span>\uC7A5\uC560\uBB3C \uC124\uCE58';
      const simHint = document.getElementById("simHint");
      const HINT_DEFAULT = "\uB85C\uBD07: \uB04C\uC5B4\uC11C \uD68C\uC804 \xB7 \uD720: \uD655\uB300 \xB7 LED \uBC84\uD2BC\uC73C\uB85C \uB208\xB7\uAC00\uC2B4 \uCF1C\uACE0 \uB044\uAE30";
      const HINT_TRAFFIC = "1, 2, 3\uBC88 \uD0A4\uB97C \uB20C\uB7EC \uB7A8\uD504\uB97C \uCF1C\uACE0 \uB044\uAE30";
      const HINT_LAUNCH = "\uB808\uC774\uB354 \uAC00\uB3D9 \xB7 \uB85C\uCF13 \uBC1C\uC0AC \uBC84\uD2BC\uC744 \uB20C\uB7EC \uBC1C\uC0AC\uB300\uB97C \uC791\uB3D9\uC2DC\uCF1C \uBCF4\uC138\uC694";
      const HINT_ROVER = "\uB85C\uBC84 \uBD80\uC18D \uBC30\uCE58 \uBCF4\uAE30 \xB7 1 \uAC04\uACA9 \uADF8\uB9AC\uB4DC \uBC14\uB2E5 \xB7 g \uD0A4: 0.1 \uD3C9\uBA74 \uADF8\uB9AC\uB4DC \uD1A0\uAE00 \xB7 r \uD0A4: \uBC15\uC2A4 \uB2E4\uC2DC \uBC30\uCE58";
      const RADAR_LABEL_ON = '<span class="dot"></span>\uB808\uC774\uB354';
      const RADAR_LABEL_OFF = '<span class="dot"></span>\uB808\uC774\uB354';
      const ROCKET_LABEL_ON = '<span class="dot"></span>\uB85C\uCF13';
      const ROCKET_LABEL_OFF = '<span class="dot"></span>\uB85C\uCF13';
      const sel = document.getElementById("simTopic");
      if (!btn || !card || !stage) return null;
      const THREE = window.THREE, A = window.ARES3;
      if (!THREE || !A || !A.GLTFLoader) {
        btn.disabled = true;
        btn.title = "3D \uB77C\uC774\uBE0C\uB7EC\uB9AC(three.js)\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4";
        return null;
      }
      if (sel && !sel.options.length) {
        TOPIC_ORDER.forEach((k) => {
          const o = document.createElement("option");
          o.value = k;
          o.textContent = TOPICS[k].label;
          sel.appendChild(o);
        });
        sel.value = DEFAULT_TOPIC;
      }
      let sim = null, raf = 0, builtTopic = null;
      let currentBaseTopic = "empty";
      const loop = () => {
        sim.render();
        raf = requestAnimationFrame(loop);
      };
      const build = (topicKey, baseCfg) => {
        cancelAnimationFrame(raf);
        raf = 0;
        saveWorkScene();
        if (sim) {
          sim.dispose();
          sim = null;
        }
        if (topicKey === "launchpad") {
          state.activeModel = "launchpad";
        } else {
          state.activeModel = "gun";
        }
        if (window.updateToolboxForActiveState) {
          window.updateToolboxForActiveState();
        }
        const cfg = baseCfg || (topicKey.startsWith("scene:") ? TOPICS.empty : TOPICS[topicKey] || TOPICS[DEFAULT_TOPIC]);
        currentBaseTopic = TOPICS[topicKey] ? topicKey : Object.keys(TOPICS).find((k) => TOPICS[k] === cfg) || "empty";
        if (loadingEl) {
          loadingEl.style.display = "";
          loadingEl.textContent = "\uBD88\uB7EC\uC624\uB294 \uC911\u2026";
        }
        card.querySelectorAll(".sim-led-btn").forEach((b) => b.classList.remove("on"));
        card.querySelectorAll(".sim-launch-led-btn").forEach((b) => b.classList.remove("on"));
        card.querySelectorAll(".sim-traffic-btn").forEach((b) => {
          b.classList.toggle("on", !!cfg.traffic && b.dataset.action === "lamps");
        });
        if (ledWrap) {
          ledWrap.style.display = cfg.eyes || cfg.chest ? "" : "none";
          ledWrap.querySelectorAll(".sim-led-btn").forEach((b) => {
            const part = b.dataset.part || "eye";
            b.style.display = (part === "chest" ? !!cfg.chest : !!cfg.eyes) ? "" : "none";
          });
        }
        if (trafficWrap) trafficWrap.style.display = cfg.traffic ? "" : "none";
        if (launchWrap) launchWrap.style.display = cfg.radar ? "" : "none";
        if (launchLedWrap) launchLedWrap.style.display = cfg.launch ? "" : "none";
        if (roverWrap) roverWrap.style.display = cfg.helpers ? "" : "none";
        if (obstacleBtn) {
          obstacleBtn.classList.add("on");
          obstacleBtn.innerHTML = OBSTACLE_REMOVE;
        }
        if (radarBtn) {
          radarBtn.classList.remove("on");
          radarBtn.innerHTML = RADAR_LABEL_OFF;
          radarBtn.setAttribute("aria-pressed", "false");
        }
        if (rocketBtn) {
          rocketBtn.classList.remove("on");
          rocketBtn.innerHTML = ROCKET_LABEL_OFF;
          rocketBtn.setAttribute("aria-pressed", "false");
        }
        if (simHint) {
          simHint.textContent = cfg.traffic ? HINT_TRAFFIC : cfg.radar ? HINT_LAUNCH : cfg.parts ? HINT_ROVER : HINT_DEFAULT;
        }
        sim = _Simulation_Main.buildSim(THREE, A, stage, loadingEl, cfg, { logLine, ensureAudio, state });
        builtTopic = topicKey;
      };
      const open = () => {
        card.hidden = false;
        if (typeof onOpen === "function") {
          try {
            onOpen();
          } catch (e) {
          }
        }
        if (!sim && sel) sel.value = defaultTopicForMission();
        if (sel && !sel.value && sel.options.length && !sim) sel.selectedIndex = 0;
        const t = sel && sel.value || builtTopic || DEFAULT_TOPIC;
        if (!sim || builtTopic !== t) {
          if (t.startsWith("scene:")) {
            build("empty");
            loadSavedScene(t.slice(6));
          } else build(t);
        }
        sim.resize();
        cancelAnimationFrame(raf);
        loop();
        btn.textContent = "\uCF54\uB4DC \uD655\uC778";
        btn.setAttribute("aria-pressed", "true");
      };
      const finalizeClose = () => {
        saveWorkScene();
        card.hidden = true;
        cancelAnimationFrame(raf);
        raf = 0;
        btn.textContent = "\uC2DC\uBBAC\uB808\uC774\uC158";
        btn.setAttribute("aria-pressed", "false");
        if (typeof onClose === "function") {
          try {
            onClose();
          } catch (e) {
          }
        }
      };
      let closing = false;
      function abortActiveSimRun(label) {
        if (!simRunning) return;
        simAborted = true;
        state.isExecuting = false;
        if (sim) sim.cancelActiveWait();
        logLine("\u2500\u2500\u2500\u2500 \uBE44\uC0C1 \uC815\uC9C0 (" + label + ") \u2500\u2500\u2500\u2500", "sys");
      }
      const close = () => {
        if (card.hidden || closing) return;
        abortActiveSimRun("\uBAA8\uB4DC \uC804\uD658");
        if (sim && sim.hasRocket && !sim.rocketAtRest) {
          closing = true;
          sim.setRocketLaunch(false);
          if (rocketBtn) {
            rocketBtn.classList.remove("on");
            rocketBtn.innerHTML = ROCKET_LABEL_OFF;
            rocketBtn.setAttribute("aria-pressed", "false");
          }
          const waitDescend = () => {
            if (!sim || sim.rocketAtRest) {
              closing = false;
              finalizeClose();
              return;
            }
            requestAnimationFrame(waitDescend);
          };
          waitDescend();
          return;
        }
        finalizeClose();
      };
      let devMode = false;
      const devBar = document.createElement("div");
      devBar.className = "sim-devbar";
      devBar.hidden = true;
      devBar.innerHTML = `
      <span class="sim-devbar-tag">DEV</span>
      <select data-dev-menu title="\uC52C \uB3C4\uAD6C \uBA54\uB274">
        <option value="" selected>\uC52C \uBA54\uB274 \u25BE</option>
        <option value="new">\uC0C8 \uC52C</option>
        <option value="save">\uC52C \uC800\uC7A5</option>
        <option value="load">\uC52C \uC5F4\uAE30</option>
        <option value="register">\uC11C\uBE44\uC2A4 \uB4F1\uB85D</option>
        <option value="unregister">\uC11C\uBE44\uC2A4 \uC81C\uAC70</option>
      </select>`;
      stage.appendChild(devBar);
      const devFileInput = document.createElement("input");
      devFileInput.type = "file";
      devFileInput.accept = "application/json,.json";
      devFileInput.hidden = true;
      card.appendChild(devFileInput);
      const applyDevMode = () => {
        var _a, _b, _c;
        (_c = (_b = (_a = sim == null ? void 0 : sim.ctx) == null ? void 0 : _a.editor) == null ? void 0 : _b.setDevMode) == null ? void 0 : _c.call(_b, devMode);
        devBar.hidden = !devMode;
        window.__aresSimDev = devMode && (sim == null ? void 0 : sim.ctx) ? {
          serialize: (opts) => serializeScene(sim.ctx, { topic: sel && sel.value || "empty", ...opts }),
          apply: (json) => applyScene(sim.ctx, json),
          clear: () => clearSpawnedObjects(sim.ctx),
          // 컴포넌트 부착/해제: id 로 객체를 찾는다(생략 시 현재 선택 객체)
          attach: (type, fields, id) => {
            var _a2;
            return attachComponent(sim.ctx, id ? sim.ctx.objects.items.find((o) => o.id === id) : (_a2 = sim.ctx.editor) == null ? void 0 : _a2.getSelectedSimObject(), type, fields || {});
          },
          detach: (type, id) => {
            var _a2;
            return detachComponent(sim.ctx, id ? sim.ctx.objects.items.find((o) => o.id === id) : (_a2 = sim.ctx.editor) == null ? void 0 : _a2.getSelectedSimObject(), type);
          },
          objects: () => sim.ctx.objects.items.map((o) => ({ id: o.id, type: o.type, comps: Object.keys(o.components || {}) })),
          state: (id) => {
            const o = sim.ctx.objects.items.find((x) => x.id === id);
            if (!o) return null;
            const T = sim.ctx.THREE;
            o.root.updateWorldMatrix(true, false);
            const wp = o.root.getWorldPosition(new T.Vector3());
            const ws = o.root.getWorldScale(new T.Vector3());
            return {
              pos: o.root.position.toArray(),
              quat: o.root.quaternion.toArray(),
              scale: o.root.scale.toArray(),
              worldPos: wp.toArray(),
              worldScale: ws.toArray()
            };
          },
          setPos: (id, x, y, z) => {
            const o = sim.ctx.objects.items.find((it) => it.id === id);
            if (o) o.root.position.set(x, y, z);
            return !!o;
          },
          sink: (cmd) => sim.simSink(cmd, false),
          tick: (dt) => sim.ctx.objects.update(dt || 0.016)
          // 수동 프레임 진행(테스트·콘솔용)
        } : void 0;
      };
      window.addEventListener("keydown", (e) => {
        var _a, _b;
        if (!(e.ctrlKey || e.metaKey) || (e.key || "").toLowerCase() !== "e") return;
        if (card.hidden) return;
        e.preventDefault();
        if (devMode) saveWorkScene();
        devMode = !devMode;
        applyDevMode();
        logLine(devMode ? "\u2500\u2500 \uAC1C\uBC1C\uC790 \uBAA8\uB4DC ON (Ctrl+E \uB85C \uD574\uC81C) \u2500\u2500" : "\u2500\u2500 \uAC1C\uBC1C\uC790 \uBAA8\uB4DC OFF \u2500\u2500", "sys");
        if (devMode && !(((_b = (_a = sim == null ? void 0 : sim.ctx) == null ? void 0 : _a.objects) == null ? void 0 : _b.items) || []).some((o) => o.spawned)) {
          maybeOfferRestore();
        }
      });
      const rebuildTo = (topicKey) => {
        if (sel) {
          sel.value = topicKey;
          if (sel.value !== topicKey) sel.selectedIndex = -1;
        }
        build(topicKey);
        applyDevMode();
        sim.resize();
        cancelAnimationFrame(raf);
        loop();
      };
      const WORK_KEY = "ares-sim-workscene";
      const saveWorkScene = () => {
        if (!devMode || !(sim == null ? void 0 : sim.ctx)) return;
        try {
          const json = serializeScene(sim.ctx, { name: "\uC791\uC5C5 \uC52C(\uC784\uC2DC)", topic: currentBaseTopic });
          if (json.objects.length > 0) localStorage.setItem(WORK_KEY, JSON.stringify(json));
        } catch (e) {
        }
      };
      const loadWorkScene = () => {
        try {
          return JSON.parse(localStorage.getItem(WORK_KEY) || "null");
        } catch (e) {
          return null;
        }
      };
      const clearWorkScene = () => {
        try {
          localStorage.removeItem(WORK_KEY);
        } catch (e) {
        }
      };
      const restoreWorkScene = async (saved) => {
        rebuildTo(TOPICS[saved.topic] ? saved.topic : "empty");
        try {
          await applyScene(sim.ctx, saved);
          saveWorkScene();
          logLine(`\uC784\uC2DC \uC791\uC5C5 \uC52C \uBCF5\uC6D0 \u2014 \uAC1D\uCCB4 ${saved.objects.length}\uAC1C`, "sys");
        } catch (err) {
          logLine("\uC784\uC2DC \uC791\uC5C5 \uC52C \uBCF5\uC6D0 \uC2E4\uD328: " + (err && err.message ? err.message : err), "err");
        }
      };
      const hasWorkScene = () => {
        const saved = loadWorkScene();
        return saved && Array.isArray(saved.objects) && saved.objects.length > 0 ? saved : null;
      };
      const maybeOfferRestore = async () => {
        const saved = hasWorkScene();
        if (!saved) return;
        if (!confirm(`\uC784\uC2DC \uC800\uC7A5\uB41C \uC791\uC5C5 \uC52C(\uAC1D\uCCB4 ${saved.objects.length}\uAC1C)\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC774\uC5B4\uC11C \uC791\uC5C5\uD560\uAE4C\uC694?`)) return;
        await restoreWorkScene(saved);
      };
      window.addEventListener("beforeunload", saveWorkScene);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) saveWorkScene();
      });
      const devNewScene = async () => {
        const saved = hasWorkScene();
        if (saved && confirm(`\uC784\uC2DC \uC800\uC7A5\uB41C \uC791\uC5C5 \uC52C(\uAC1D\uCCB4 ${saved.objects.length}\uAC1C)\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC774\uC5B4\uC11C \uC791\uC5C5\uD560\uAE4C\uC694?`)) {
          await restoreWorkScene(saved);
          return;
        }
        rebuildTo("empty");
        clearWorkScene();
      };
      const devSaveScene = async () => {
        if (!(sim == null ? void 0 : sim.ctx)) return;
        const json = serializeScene(sim.ctx, { name: "ares_scene", topic: sel && sel.value || "empty" });
        const text = JSON.stringify(json, null, 2);
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: "ares_scene.json",
              types: [{ description: "ARES \uC52C \uD30C\uC77C", accept: { "application/json": [".json"] } }]
            });
            const w = await handle.createWritable();
            await w.write(text);
            await w.close();
            clearWorkScene();
            logLine(`\uC52C \uC800\uC7A5 \uC644\uB8CC \u2014 ${handle.name} (\uAC1D\uCCB4 ${json.objects.length}\uAC1C)`, "sys");
            return;
          } catch (err) {
            if (err && err.name === "AbortError") return;
          }
        }
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ares_scene.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2e3);
        clearWorkScene();
        logLine(`\uC52C \uC800\uC7A5(\uB2E4\uC6B4\uB85C\uB4DC) \u2014 \uAC1D\uCCB4 ${json.objects.length}\uAC1C`, "sys");
      };
      const devLoadScene = async (file) => {
        try {
          const json = JSON.parse(await file.text());
          const topic = TOPICS[json.topic] ? json.topic : "empty";
          if (!sim || builtTopic !== topic) rebuildTo(topic);
          await applyScene(sim.ctx, json);
          logLine(`\uC52C \uB85C\uB4DC \uC644\uB8CC \u2014 ${json.name || file.name} (\uAC1D\uCCB4 ${json.objects.length}\uAC1C)`, "sys");
        } catch (err) {
          logLine("\uC52C \uB85C\uB4DC \uC2E4\uD328: " + (err && err.message ? err.message : err), "err");
        }
      };
      devBar.addEventListener("change", (e) => {
        const m = e.target.closest("select[data-dev-menu]");
        if (!m) return;
        const action = m.value;
        m.value = "";
        if (action === "new") devNewScene();
        else if (action === "save") devSaveScene();
        else if (action === "load") devFileInput.click();
        else if (action === "register") devRegisterService();
        else if (action === "unregister") devRemoveService();
      });
      devFileInput.addEventListener("change", () => {
        const f = devFileInput.files && devFileInput.files[0];
        devFileInput.value = "";
        if (f) devLoadScene(f);
      });
      let sceneManifest = [];
      let hiddenTopics = [];
      if (sel) {
        fetch("scenes/manifest.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((m) => {
          if (!m) return;
          hiddenTopics = Array.isArray(m.hiddenTopics) ? m.hiddenTopics : [];
          hiddenTopics.forEach((k) => {
            var _a;
            return (_a = sel.querySelector(`option[value="${k}"]`)) == null ? void 0 : _a.remove();
          });
          if (!Array.isArray(m.scenes)) return;
          sceneManifest = m.scenes;
          m.scenes.forEach((s) => {
            const o = document.createElement("option");
            o.value = `scene:${s.id}`;
            o.textContent = s.label || s.id;
            sel.appendChild(o);
          });
        }).catch(() => {
        });
      }
      const loadSavedScene = async (id) => {
        const entry = sceneManifest.find((s) => s.id === id);
        if (!entry) {
          logLine(`\uC52C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${id}`, "err");
          return;
        }
        try {
          const res = await fetch(entry.file, { cache: "no-store" });
          const json = await res.json();
          build(`scene:${id}`, TOPICS[json.topic] || TOPICS.empty);
          applyDevMode();
          sim.resize();
          cancelAnimationFrame(raf);
          loop();
          await applyScene(sim.ctx, json);
          const T = sim.ctx.THREE;
          const bb = new T.Box3();
          sim.ctx.scene.updateMatrixWorld(true);
          sim.ctx.objects.items.forEach((o) => bb.expandByObject(o.root));
          if (!bb.isEmpty()) {
            const size = bb.getSize(new T.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 1);
            const fov = sim.ctx.camera.fov * Math.PI / 180;
            sim.ctx.frame(Math.max(0.5, size.y * 0.55), maxDim / 2 / Math.tan(fov / 2) * 1.9);
          }
          logLine(`\uC52C '${entry.label || id}' \uB85C\uB4DC \uC644\uB8CC (\uAC1D\uCCB4 ${json.objects.length}\uAC1C)`, "sys");
        } catch (err) {
          logLine("\uC52C \uB85C\uB4DC \uC2E4\uD328: " + (err && err.message ? err.message : err), "err");
        }
      };
      if (sel) sel.addEventListener("change", () => {
        abortActiveSimRun("\uC8FC\uC81C \uC804\uD658");
        const v = sel.value;
        if (v.startsWith("scene:")) {
          loadSavedScene(v.slice(6));
          return;
        }
        build(v);
        applyDevMode();
        sim.resize();
        cancelAnimationFrame(raf);
        loop();
      });
      const idbKv = (mode, fn) => new Promise((resolve) => {
        const req = indexedDB.open("ares-sim-dev", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const tx = req.result.transaction("kv", mode);
          const r = fn(tx.objectStore("kv"));
          tx.oncomplete = () => {
            resolve(r && "result" in r ? r.result : null);
            req.result.close();
          };
          tx.onerror = () => {
            resolve(null);
            req.result.close();
          };
        };
      });
      const idbGetDir = () => idbKv("readonly", (store) => store.get("scenesDir"));
      const idbSetDir = (dir) => idbKv("readwrite", (store) => store.put(dir, "scenesDir"));
      const descendToScenes = async (dir) => {
        if (!dir || dir.name === "scenes") return dir;
        try {
          return await (await dir.getDirectoryHandle("Web")).getDirectoryHandle("scenes");
        } catch (e) {
        }
        try {
          return await dir.getDirectoryHandle("scenes");
        } catch (e) {
        }
        return dir;
      };
      let scenesDir = null;
      const ensureScenesDir = async () => {
        if (scenesDir) return scenesDir;
        if (!window.showDirectoryPicker) return null;
        let dir = await idbGetDir();
        if (dir) {
          try {
            let perm = await dir.queryPermission({ mode: "readwrite" });
            if (perm === "prompt") perm = await dir.requestPermission({ mode: "readwrite" });
            if (perm !== "granted") dir = null;
          } catch (e) {
            dir = null;
          }
        }
        if (!dir) {
          try {
            dir = await window.showDirectoryPicker({ id: "ares-scenes", mode: "readwrite" });
          } catch (e) {
            return null;
          }
          dir = await descendToScenes(dir);
          idbSetDir(dir);
        }
        scenesDir = dir;
        return dir;
      };
      const downloadJson = (name, text) => {
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2e3);
      };
      const writeServiceFile = async (name, text) => {
        const dir = await ensureScenesDir();
        if (!dir) {
          downloadJson(name, text);
          return "download";
        }
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(text);
        await w.close();
        return "dir";
      };
      const writeManifest = () => writeServiceFile("manifest.json", JSON.stringify({ hiddenTopics, scenes: sceneManifest }, null, 2) + "\n");
      const devRegisterService = async () => {
        if (!(sim == null ? void 0 : sim.ctx)) return;
        const cur = sel && sel.value || "empty";
        const defId = cur.startsWith("scene:") ? cur.slice(6) : "";
        const id = (prompt("\uB4F1\uB85D\uD560 \uC8FC\uC81C ID (\uC601\uBB38 \uC18C\uBB38\uC790\xB7\uC22B\uC790\xB7-_):", defId) || "").trim();
        if (!id) return;
        if (!/^[a-z0-9_-]+$/.test(id)) {
          logLine("\uC8FC\uC81C ID \uB294 \uC601\uBB38 \uC18C\uBB38\uC790\xB7\uC22B\uC790\xB7-_ \uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4", "err");
          return;
        }
        if (TOPICS[id]) {
          logLine(`'${id}' \uB294 \uAE30\uBCF8 \uC8FC\uC81C ID \uC640 \uACB9\uCCD0 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4`, "err");
          return;
        }
        const prev = sceneManifest.find((s) => s.id === id);
        const label = (prompt("\uC8FC\uC81C \uC774\uB984 (\uB4DC\uB86D\uB2E4\uC6B4 \uD45C\uC2DC):", (prev == null ? void 0 : prev.label) || "") || "").trim();
        if (!label) return;
        const baseTopic = TOPICS[cur] ? cur : "empty";
        const json = serializeScene(sim.ctx, { name: label, topic: baseTopic });
        try {
          const how = await writeServiceFile(`${id}.json`, JSON.stringify(json, null, 2) + "\n");
          if (prev) {
            prev.file = `scenes/${id}.json`;
            prev.label = label;
          } else sceneManifest.push({ id, file: `scenes/${id}.json`, label });
          await writeManifest();
          if (sel) {
            let opt = sel.querySelector(`option[value="scene:${id}"]`);
            if (!opt) {
              opt = document.createElement("option");
              opt.value = `scene:${id}`;
              sel.appendChild(opt);
            }
            opt.textContent = label;
            sel.value = `scene:${id}`;
          }
          builtTopic = `scene:${id}`;
          clearWorkScene();
          logLine(how === "dir" ? `\uC11C\uBE44\uC2A4 \uB4F1\uB85D \uC644\uB8CC \u2014 '${label}' (scenes/${id}.json, \uAC1D\uCCB4 ${json.objects.length}\uAC1C)` : `\uC11C\uBE44\uC2A4 \uB4F1\uB85D \u2014 ${id}.json\xB7manifest.json \uB2E4\uC6B4\uB85C\uB4DC\uB428. Web/scenes/ \uC5D0 \uB123\uC5B4 \uBC18\uC601\uD558\uC138\uC694`, "sys");
        } catch (err) {
          logLine("\uC11C\uBE44\uC2A4 \uB4F1\uB85D \uC2E4\uD328: " + (err && err.message ? err.message : err), "err");
        }
      };
      const devRemoveService = async () => {
        var _a, _b, _c;
        const v = sel && sel.value || "";
        if (!v || v === "empty") {
          logLine("\uC11C\uBE44\uC2A4\uC5D0\uC11C \uC81C\uAC70\uD560 \uC8FC\uC81C\uB97C \uB4DC\uB86D\uB2E4\uC6B4\uC5D0\uC11C \uC120\uD0DD\uD558\uC138\uC694", "err");
          return;
        }
        const isScene = v.startsWith("scene:");
        const id = isScene ? v.slice(6) : v;
        const label = isScene ? ((_a = sceneManifest.find((s) => s.id === id)) == null ? void 0 : _a.label) || id : ((_b = TOPICS[v]) == null ? void 0 : _b.label) || v;
        if (!confirm(`'${label}' \uC8FC\uC81C\uB97C \uC11C\uBE44\uC2A4\uC5D0\uC11C \uC81C\uAC70\uD560\uAE4C\uC694?`)) return;
        try {
          if (isScene) sceneManifest = sceneManifest.filter((s) => s.id !== id);
          else if (!hiddenTopics.includes(v)) hiddenTopics.push(v);
          const how = await writeManifest();
          (_c = sel == null ? void 0 : sel.querySelector(`option[value="${v}"]`)) == null ? void 0 : _c.remove();
          const next = sel && sel.value || DEFAULT_TOPIC;
          if (next.startsWith("scene:")) loadSavedScene(next.slice(6));
          else rebuildTo(next);
          logLine(how === "dir" ? `\uC11C\uBE44\uC2A4 \uC81C\uAC70 \uC644\uB8CC \u2014 '${label}'${isScene ? ` (scenes/${id}.json \uD30C\uC77C\uC740 \uB0A8\uACA8\uB460)` : ""}` : `\uC11C\uBE44\uC2A4 \uC81C\uAC70 \u2014 manifest.json \uB2E4\uC6B4\uB85C\uB4DC\uB428. Web/scenes/ \uC5D0 \uB123\uC5B4 \uBC18\uC601\uD558\uC138\uC694`, "sys");
        } catch (err) {
          logLine("\uC11C\uBE44\uC2A4 \uC81C\uAC70 \uC2E4\uD328: " + (err && err.message ? err.message : err), "err");
        }
      };
      btn.addEventListener("click", () => {
        ensureAudio();
        card.hidden ? open() : close();
      });
      card.querySelectorAll(".sim-led-btn").forEach((b) => {
        b.addEventListener("click", () => {
          if (!sim) return;
          const part = b.dataset.part || "eye";
          if (part === "chest") {
            if (!sim.hasChest) return;
            const cur = sim.chestLed.on;
            sim.setChest(!cur);
            b.classList.toggle("on", !cur);
          } else {
            if (!sim.hasEyes) return;
            const side = b.dataset.side;
            const cur = side === "L" ? sim.eyeL.on : sim.eyeR.on;
            sim.setEye(side, !cur);
            b.classList.toggle("on", !cur);
          }
        });
      });
      const launchLedsBtn = document.getElementById("simLaunchLeds");
      if (launchLedsBtn) {
        launchLedsBtn.addEventListener("click", () => {
          if (!sim || !sim.hasLaunchLeds) return;
          const next = !launchLedsBtn.classList.contains("on");
          for (let i = 0; i <= 5; i++) sim.setLaunchLed(i, next ? 1 : 0);
          launchLedsBtn.classList.toggle("on", next);
        });
      }
      const setTrafficBtn = (which) => {
        card.querySelectorAll(".sim-traffic-btn").forEach((b) => {
          b.classList.toggle("on", b.dataset.action === which);
        });
      };
      card.querySelectorAll(".sim-traffic-btn").forEach((b) => {
        b.addEventListener("click", () => {
          if (!sim || !sim.hasTraffic) return;
          const action = b.dataset.action;
          if (action === "lamps") {
            sim.placeLamps();
            setTrafficBtn("lamps");
          } else if (action === "hand") {
            sim.placeHands();
            setTrafficBtn("hand");
          }
        });
      });
      if (radarBtn) {
        radarBtn.addEventListener("click", () => {
          if (!sim || !sim.hasRadar) return;
          const next = !sim.radarOn;
          sim.setRadar(next);
          radarBtn.classList.toggle("on", next);
          radarBtn.innerHTML = next ? RADAR_LABEL_ON : RADAR_LABEL_OFF;
          radarBtn.setAttribute("aria-pressed", String(next));
        });
      }
      if (obstacleBtn) {
        obstacleBtn.addEventListener("click", () => {
          if (!sim || !sim.hasBoxes) return;
          const next = !sim.obstaclesOn;
          sim.setObstacles(next);
          obstacleBtn.classList.toggle("on", next);
          obstacleBtn.innerHTML = next ? OBSTACLE_REMOVE : OBSTACLE_INSTALL;
        });
      }
      if (rocketBtn) {
        rocketBtn.addEventListener("click", () => {
          if (!sim || !sim.hasRocket) return;
          const next = !sim.rocketLaunchOn;
          sim.setRocketLaunch(next);
          if (next) sim.playRocketLaunch();
          rocketBtn.classList.toggle("on", next);
          rocketBtn.innerHTML = next ? ROCKET_LABEL_ON : ROCKET_LABEL_OFF;
          rocketBtn.setAttribute("aria-pressed", String(next));
        });
      }
      const simLog = document.getElementById("simLog");
      const simClearBtn = document.getElementById("simLogClear");
      const logLine = (text, cls) => {
        if (!simLog) return;
        const d = document.createElement("div");
        d.className = "sim-log-line" + (cls ? " " + cls : "");
        d.textContent = text;
        simLog.appendChild(d);
        simLog.scrollTop = simLog.scrollHeight;
      };
      let audioCtx = null;
      const ensureAudio = () => {
        try {
          if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
          console.warn("AudioContext \uC0DD\uC131 \uC2E4\uD328:", e);
          return null;
        }
        if (audioCtx.state === "suspended") {
          try {
            audioCtx.resume();
          } catch (e) {
          }
        }
        if (audioCtx.state !== "running") {
          try {
            const b = audioCtx.createBuffer(1, 1, 22050);
            const s = audioCtx.createBufferSource();
            s.buffer = b;
            s.connect(audioCtx.destination);
            s.start(0);
          } catch (e) {
          }
        }
        return audioCtx;
      };
      const _unlockOnce = () => ensureAudio();
      document.addEventListener("pointerdown", _unlockOnce, { once: true, passive: true });
      document.addEventListener("touchstart", _unlockOnce, { once: true, passive: true });
      let simRunning = false;
      let simAborted = false;
      const SERVO_LINGER_MS = 1e4;
      async function toggleSimRun() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
        ensureAudio();
        if (simRunning) {
          simAborted = true;
          state.isExecuting = false;
          if (sim) sim.cancelActiveWait();
          return;
        }
        if (!workspace2) {
          logLine("\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4\uAC00 \uC900\uBE44\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4", "err");
          return;
        }
        simRunning = true;
        simAborted = false;
        window.dispatchEvent(new CustomEvent("ares:simrun", { detail: { running: true } }));
        (_c = (_b = (_a = sim == null ? void 0 : sim.ctx) == null ? void 0 : _a.objects) == null ? void 0 : _b.routeCommand) == null ? void 0 : _c.call(_b, "SIM_START");
        logLine("\u2500\u2500\u2500\u2500 \uC2DC\uBBAC\uB808\uC774\uC158 \uC2DC\uC791 \u2500\u2500\u2500\u2500", "sys");
        try {
          await CommandExecutor.simulateWorkspace(workspace2, (cmd, waitResp) => sim.simSink(cmd, waitResp));
          if (!simAborted && sim && sim.hasServo && sim.servoActive) {
            logLine(`\uC5F0\uC18D SERVO \uB3D9\uC791 \uC720\uC9C0 \uC911 \u2014 ${SERVO_LINGER_MS / 1e3}\uCD08 \uD6C4 \uC885\uB8CC`, "sys");
            await new Promise((resolve) => {
              const id = setTimeout(() => {
                if (sim) sim.cancelActiveWait();
                resolve();
              }, SERVO_LINGER_MS);
              const originalCancel = sim.cancelActiveWait;
              if (sim) {
                sim.cancelActiveWait = () => {
                  clearTimeout(id);
                  sim.cancelActiveWait = originalCancel;
                  try {
                    originalCancel.call(sim);
                  } finally {
                    resolve();
                  }
                };
              }
            });
            if (sim && sim.hasServo) sim.stopServo();
          }
          logLine(simAborted ? "\u2500\u2500\u2500\u2500 \uBE44\uC0C1 \uC815\uC9C0 \u2500\u2500\u2500\u2500" : "\u2500\u2500\u2500\u2500 \uC2DC\uBBAC\uB808\uC774\uC158 \uC885\uB8CC \u2500\u2500\u2500\u2500", "sys");
        } catch (e) {
          logLine("\uC624\uB958: " + (e && e.message ? e.message : e), "err");
        } finally {
          simRunning = false;
          window.dispatchEvent(new CustomEvent("ares:simrun", { detail: { running: false } }));
          (_f = (_e = (_d = sim == null ? void 0 : sim.ctx) == null ? void 0 : _d.objects) == null ? void 0 : _e.routeCommand) == null ? void 0 : _f.call(_e, "SIM_END");
          if (simAborted) {
            (_i = (_h = (_g = sim == null ? void 0 : sim.ctx) == null ? void 0 : _g.objects) == null ? void 0 : _h.routeCommand) == null ? void 0 : _i.call(_h, "STOP_ALL");
            (_l = (_k = (_j = sim == null ? void 0 : sim.ctx) == null ? void 0 : _j.objects) == null ? void 0 : _k.routeCommand) == null ? void 0 : _l.call(_k, "LED_OFF,ALL");
            if (sim && sim.hasServo) sim.stopServo();
            if (sim) {
              if (sim.hasEyes) {
                sim.setEye("R", 0);
                sim.setEye("L", 0);
              }
              if (sim.hasChest) sim.setChest(0);
              if (sim.hasTraffic) {
                sim.setSlot(0, 0);
                sim.setSlot(1, 0);
                sim.setSlot(2, 0);
              }
              if (sim.hasLaunchLeds) {
                for (let i = 0; i <= 5; i++) sim.setLaunchLed(i, 0);
              }
              if (sim.hasRoverLeds) {
                for (let i = 0; i <= 5; i++) sim.setRoverLed(i, 0);
              }
              if (sim.hasRadar) sim.setRadar(false);
            }
          }
          if (sim && sim.hasRocket && !sim.rocketAtRest) {
            sim.setRocketLaunch(false);
            if (rocketBtn) {
              rocketBtn.classList.remove("on");
              rocketBtn.innerHTML = ROCKET_LABEL_OFF;
              rocketBtn.setAttribute("aria-pressed", "false");
            }
          }
        }
      }
      if (simClearBtn) simClearBtn.addEventListener("click", () => {
        if (simLog) simLog.textContent = "";
      });
      addEventListener("resize", () => {
        if (!card.hidden && sim) sim.resize();
      });
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
          if (!card.hidden && sim) sim.resize();
        });
        ro.observe(stage);
      }
      addEventListener("keydown", (e) => {
        if (card.hidden || !sim) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        const tag = t && t.tagName || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t && t.isContentEditable) return;
        if ((e.key === "g" || e.key === "G") && sim.hasGrids) {
          sim.toggleGrids();
          e.preventDefault();
          return;
        }
        if ((e.key === "r" || e.key === "R") && sim.hasBoxes) {
          sim.respawnBoxes();
          e.preventDefault();
          return;
        }
        if (!sim.hasTraffic) return;
        let idx = -1;
        if (e.key === "1") idx = 0;
        else if (e.key === "2") idx = 1;
        else if (e.key === "3") idx = 2;
        if (idx < 0) return;
        sim.toggleSlot(idx);
        e.preventDefault();
      });
      if (stage) {
        stage.addEventListener("dblclick", () => {
          if (card.hidden || !sim || !sim.ctx) return;
          sim.ctx.resetCameraHome();
        });
      }
      return { open, close, toggleSimRun, isSimRunning: () => simRunning };
    }
  };
  // Topic metadata and OLED icons constants
  __publicField(_Simulation_Main, "TOPICS", TOPICS);
  __publicField(_Simulation_Main, "TOPIC_ORDER", TOPIC_ORDER);
  __publicField(_Simulation_Main, "DEFAULT_TOPIC", DEFAULT_TOPIC);
  __publicField(_Simulation_Main, "MISSION_TOPIC", MISSION_TOPIC);
  __publicField(_Simulation_Main, "OLED_ICONS", OLED_ICONS);
  // Delegated static helpers
  __publicField(_Simulation_Main, "playRocketLaunch", Audio.playRocketLaunch);
  __publicField(_Simulation_Main, "playGunFire", Audio.playGunFire);
  __publicField(_Simulation_Main, "recolorLaunchpadAntenna", Rocket.recolorAntenna);
  __publicField(_Simulation_Main, "defaultTopicForMission", defaultTopicForMission);
  var Simulation_Main = _Simulation_Main;
  function setupSimulation(options) {
    return Simulation_Main.init(options);
  }

  // ui.js
  function updateBlockCodingButtonUI(btn = document.getElementById("blockCodingButton"), helpers = {}) {
    if (!btn) return;
    const isDashboardVisible2 = helpers.isDashboardVisible || (() => false);
    const isInBlockCodingStage2 = helpers.isInBlockCodingStage || (() => false);
    if (isDashboardVisible2()) {
      btn.textContent = "\u{1F9E9} \uCF54\uB529";
      btn.title = "\uC810\uAC80\uC744 \uB2EB\uACE0 \uCF54\uB529 \uD654\uBA74\uC73C\uB85C \uC774\uB3D9";
    } else if (isInBlockCodingStage2()) {
      btn.textContent = "\u{1F3E0} \uBA54\uC778";
      btn.title = "\uAC1C\uC694 \uD654\uBA74\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30";
    } else {
      btn.textContent = "\u{1F9E9} \uBE14\uB85D\uCF54\uB529";
      btn.title = "\uBBF8\uC158 \uBE14\uB85D\uCF54\uB529 \uD654\uBA74\uC73C\uB85C \uC774\uB3D9";
    }
  }
  function setupLogToggle({ logContainer, logHeader, onToggle }) {
    if (!logContainer || !logHeader) return;
    logContainer.classList.add("compact");
    logContainer.classList.remove("expanded");
    logHeader.addEventListener("click", (e) => {
      var _a;
      if (((_a = e.target) == null ? void 0 : _a.id) === "clearLogBtn") return;
      const expanded = logContainer.classList.toggle("expanded");
      logContainer.classList.toggle("compact", !expanded);
      onToggle == null ? void 0 : onToggle(expanded);
    });
  }
  function setupContentToggle({
    btn,
    view,
    workspace: workspace2,
    getMode,
    setMode,
    getSimController,
    updateBlockCodingButtonUI: refreshBlockCodingButtonUI2
  }) {
    if (!btn || !view || !getMode || !setMode) return null;
    const applyMode = (mode) => {
      var _a, _b, _c, _d;
      const previousMode = getMode();
      const wasSimulation = previousMode === "simulation";
      setMode(mode);
      view.setAttribute("data-mode", mode);
      document.body.setAttribute("data-content-mode", mode);
      window.dispatchEvent(new CustomEvent("ares:contentmode", { detail: { mode } }));
      (_b = (_a = view.querySelector(".mission-panel")) == null ? void 0 : _a.scrollTo) == null ? void 0 : _b.call(_a, { top: 0 });
      const toTop = () => {
        window.scrollTo(0, 0);
        if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      };
      toTop();
      requestAnimationFrame(toTop);
      if (wasSimulation && mode !== "simulation") {
        const sim = getSimController == null ? void 0 : getSimController();
        if (sim) sim.close();
      }
      if (mode === "coding") {
        const tb = (_c = workspace2 == null ? void 0 : workspace2.getToolbox) == null ? void 0 : _c.call(workspace2);
        try {
          (_d = tb == null ? void 0 : tb.show) == null ? void 0 : _d.call(tb);
        } catch (e) {
        }
        setTimeout(() => {
          try {
            Blockly.svgResize(workspace2);
          } catch (e) {
          }
        }, 0);
      }
      if (mode === "description") {
        btn.textContent = "\uBE14\uB85D \uCF54\uB529";
        btn.title = "\uBBF8\uC158 \uC124\uBA85\uC744 \uB2EB\uACE0 \uBE14\uB7ED\uCF54\uB529 \uD654\uBA74\uC73C\uB85C \uC804\uD658";
        btn.disabled = false;
      } else if (mode === "coding") {
        btn.textContent = "\uBBF8\uC158 \uC124\uBA85";
        btn.title = "\uBE14\uB7ED\uCF54\uB529\uC744 \uB2EB\uACE0 \uBBF8\uC158 \uC124\uBA85\uC73C\uB85C \uC804\uD658";
        btn.disabled = false;
      } else {
        btn.disabled = true;
        btn.title = "\uC2DC\uBBAC\uB808\uC774\uC158\uC744 \uB2EB\uC73C\uBA74 \uC774\uC804 \uD654\uBA74\uC73C\uB85C \uB3CC\uC544\uAC11\uB2C8\uB2E4";
      }
      refreshBlockCodingButtonUI2 == null ? void 0 : refreshBlockCodingButtonUI2();
    };
    const setContentMode2 = (mode) => {
      if (!["description", "coding", "simulation"].includes(mode)) return;
      if (getMode() === mode) return;
      applyMode(mode);
    };
    btn.addEventListener("click", () => {
      if (getMode() === "simulation") return;
      applyMode(getMode() === "description" ? "coding" : "description");
    });
    applyMode("description");
    return setContentMode2;
  }

  // ai_helper.js
  var KNOWN_TYPES = /* @__PURE__ */ new Set([
    "timed_forward",
    "timed_backward",
    "timed_left",
    "timed_right",
    "move_forward",
    "move_backward",
    "turn_left",
    "turn_right",
    "stop_moving",
    "main_motor_forward_timed",
    "main_motor_backward_timed",
    "main_motor_forward",
    "main_motor_backward",
    "main_motor_stop",
    "set_lamp",
    "led_on",
    "led_off",
    "led_off_all",
    "send_message",
    "clear_display",
    "buzzer_on",
    "buzzer_note",
    "gun_fire",
    "pico_check_device",
    "time_sleep",
    "controls_repeat_ext",
    "controls_if",
    "controls_whileUntil",
    "check_distance",
    "check_magnetic",
    "variables_set",
    "variables_get",
    "math_change",
    "logic_compare",
    "math_number",
    "text"
  ]);
  var KO_NUM = {
    "\uD55C": 1,
    "\uD558\uB098": 1,
    "\uB450": 2,
    "\uB458": 2,
    "\uC138": 3,
    "\uC14B": 3,
    "\uB124": 4,
    "\uB137": 4,
    "\uB2E4\uC12F": 5,
    "\uC5EC\uC12F": 6,
    "\uC77C\uACF1": 7,
    "\uC5EC\uB35F": 8,
    "\uC544\uD649": 9,
    "\uC5F4": 10
  };
  var NOTE_MID = { "\uB3C4": 262, "\uB808": 294, "\uBBF8": 330, "\uD30C": 349, "\uC194": 392, "\uB77C": 440, "\uC2DC": 494 };
  var NOTE_LOW = { "\uB3C4": 131, "\uB808": 147, "\uBBF8": 165, "\uD30C": 175, "\uC194": 196, "\uB77C": 220, "\uC2DC": 247 };
  var NOTE_HIGH = { "\uB3C4": 523, "\uB808": 587, "\uBBF8": 659, "\uD30C": 698, "\uC194": 784, "\uB77C": 880, "\uC2DC": 988 };
  var CONNECTOR_RE = /\s*(?:그리고\s*나서|그리고서|그러고|그리고|그\s*다음에?|그다음에?|그담에?|한\s*다음에?|한다음에?|다음에|이고|이며|고(?=\s)|,|、|→|\n)\s*/g;
  function splitClauses(text) {
    return text.split(CONNECTOR_RE).map((s) => s.trim()).filter((s) => s.length > 0);
  }
  var MEASURE_BOUNDARY_RE = /((?:거리|적외선|초음파|자기|자석)\s*(?:센서)?\s*(?:를|을)?\s*(?:재고|재서|재어|재|측정하고|측정해서|측정하여|측정해|측정하|측정|확인해서|확인하고|체크해서|체크하고|읽어서|읽고))\s+(?=\S)/g;
  function splitMeasureBoundary(text) {
    return text.replace(MEASURE_BOUNDARY_RE, "$1, ");
  }
  function extractNumber(clause, unitRe, def) {
    const m = clause.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unitRe}`));
    if (m) return { value: parseFloat(m[1]), found: true };
    for (const [word, n] of Object.entries(KO_NUM)) {
      if (new RegExp(`${word}\\s*${unitRe}`).test(clause)) return { value: n, found: true };
    }
    const bare = clause.match(/(\d+(?:\.\d+)?)/);
    if (bare) return { value: parseFloat(bare[1]), found: true };
    return { value: def, found: false };
  }
  var seconds = (c, def = 1) => extractNumber(c, "\uCD08", def);
  var VARS;
  function varId(name) {
    if (!VARS.has(name)) VARS.set(name, "v" + (VARS.size + 1));
    return VARS.get(name);
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function num(n) {
    return { type: "math_number", fields: { NUM: n } };
  }
  function txt(s) {
    return { type: "text", fields: { TEXT: s } };
  }
  function vget(name) {
    return { type: "variables_get", fields: { VAR: { var: name } } };
  }
  function vset(name, val) {
    return { type: "variables_set", fields: { VAR: { var: name } }, values: { VALUE: val } };
  }
  function distanceTo(name) {
    return { type: "check_distance", fields: { VAR: { var: name } } };
  }
  function magneticTo(name) {
    return { type: "check_magnetic", fields: { VAR: { var: name } } };
  }
  function compare(op, a, b) {
    return { type: "logic_compare", fields: { OP: op }, values: { A: a, B: b } };
  }
  function ifThen(cond, body) {
    return { type: "controls_if", values: { IF0: cond }, statements: { DO0: body } };
  }
  function ledOn(n) {
    return { type: "led_on", values: { LED_NUM: num(n), BRIGHTNESS: num(1) } };
  }
  function ledOff(n) {
    return { type: "led_off", values: { LED_NUM: num(n) } };
  }
  function lampAll(v) {
    return { type: "set_lamp", values: Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`LAMP${i}`, num(v)])) };
  }
  function sleepFor(s) {
    return { type: "time_sleep", values: { SECONDS: num(s) } };
  }
  function repeatN(n, body) {
    return { type: "controls_repeat_ext", values: { TIMES: num(n) }, statements: { DO: body } };
  }
  function eyeTargets(c) {
    if (/왼쪽\s*눈|좌측\s*눈|왼눈/.test(c)) return { leds: [2], label: "\uC67C\uCABD \uB208" };
    if (/오른쪽\s*눈|우측\s*눈|오른눈/.test(c)) return { leds: [1], label: "\uC624\uB978\uCABD \uB208" };
    if (/양쪽?\s*눈|두\s*눈|눈/.test(c)) return { leds: [1, 2], label: "\uC591\uCABD \uB208" };
    if (/가슴/.test(c)) return { leds: [3], label: "\uAC00\uC2B4" };
    return null;
  }
  function serializeBlock(desc) {
    let inner = "";
    for (const [name, val] of Object.entries(desc.fields || {})) {
      if (val && typeof val === "object" && val.var !== void 0) {
        inner += `<field name="${name}" id="${varId(val.var)}">${esc(val.var)}</field>`;
      } else {
        inner += `<field name="${name}">${esc(val)}</field>`;
      }
    }
    for (const [name, child] of Object.entries(desc.values || {})) {
      inner += `<value name="${name}">${serializeBlock(child)}</value>`;
    }
    for (const [name, arr] of Object.entries(desc.statements || {})) {
      inner += `<statement name="${name}">${serializeChain(arr)}</statement>`;
    }
    if (desc.next) inner += `<next>${serializeBlock(desc.next)}</next>`;
    return `<block type="${desc.type}">${inner}</block>`;
  }
  function serializeChain(descs) {
    if (!descs.length) return "";
    for (let i = descs.length - 2; i >= 0; i--) descs[i].next = descs[i + 1];
    return serializeBlock(descs[0]);
  }
  function wrapXml(descs) {
    VARS = /* @__PURE__ */ new Map();
    const body = serializeChain(descs.map((d) => ({ ...d })));
    let vx = "";
    if (VARS.size) {
      vx = "<variables>" + [...VARS].map(([n, id]) => `<variable id="${id}">${esc(n)}</variable>`).join("") + "</variables>";
    }
    const withXY = body.replace("<block ", '<block x="40" y="40" ');
    return `<xml xmlns="https://developers.google.com/blockly/xml">${vx}${withXY}</xml>`;
  }
  function extractMessage(clause) {
    let m = clause.match(/["'“”']([^"'“”']+)["'“”']/);
    if (m) return m[1].trim();
    m = clause.match(/(.+?)\s*(?:라고|이라고)\s*(?:화면|표시|보여|써|출력|말)/);
    if (m) return m[1].trim();
    m = clause.match(/화면에?\s*(.+?)\s*(?:라고\s*)?(?:표시|보여|써|출력|나타)/);
    if (m) return m[1].trim();
    m = clause.match(/(.+?)\s*(?:라고\s*)?(?:표시|출력|보여|써)/);
    if (m) return m[1].trim();
    return "\uC548\uB155";
  }
  function extractNotes(clause) {
    const table = /높은/.test(clause) ? NOTE_HIGH : /낮은/.test(clause) ? NOTE_LOW : NOTE_MID;
    const notes = [];
    for (const ch of clause) if (table[ch] !== void 0) notes.push(table[ch]);
    return notes;
  }
  function markVar(ctx, name, sensor) {
    ctx.measured.add(name);
    ctx.lastVar = name;
    ctx.lastSensor = sensor || null;
  }
  function detectOutputVar(c, ctx) {
    for (const v of ctx.measured) if (c.includes(v)) return v;
    if (ctx.lastVar && /결과|측정\s*값|센서\s*값|값을|숫자|수치/.test(c)) return ctx.lastVar;
    return null;
  }
  function matchAction(c, ctx) {
    if (/(?:적외선|거리|초음파)\s*(?:센서)?\s*(?:를)?\s*(?:재|측정|확인|체크|읽)/.test(c)) {
      markVar(ctx, "\uAC70\uB9AC\uAC12", "distance");
      return { node: distanceTo("\uAC70\uB9AC\uAC12"), label: "\uAC70\uB9AC \uCE21\uC815 \u2192 \uAC70\uB9AC\uAC12" };
    }
    if (/(?:자기|자석)\s*(?:센서)?\s*(?:를)?\s*(?:재|측정|확인|감지|체크)/.test(c)) {
      markVar(ctx, "\uC790\uAE30\uAC12", "magnetic");
      return { node: magneticTo("\uC790\uAE30\uAC12"), label: "\uC790\uAE30 \uCE21\uC815 \u2192 \uC790\uAE30\uAC12" };
    }
    let mv = c.match(/([가-힣A-Za-z_]+)\s*(?:을|를|는|=)?\s*(\d+(?:\.\d+)?)\s*(?:으?로)?\s*(?:정해|정하|저장|담아|넣어|로\s*해)/);
    if (mv && !/cm|센티|초|번|밝기/.test(mv[0])) {
      const name = mv[1].replace(/(?:을|를|은|는|이|가|의)$/, "") || mv[1];
      markVar(ctx, name, null);
      return { node: vset(name, num(parseFloat(mv[2]))), label: `${name} = ${mv[2]}` };
    }
    const notes = extractNotes(c);
    if (notes.length >= 2) {
      const dur = seconds(c, 0.5).value;
      const chain = notes.map((f) => ({ type: "buzzer_note", fields: { NOTE: f }, values: { DURATION: num(dur) } }));
      return { node: chain, label: `\uACC4\uBA85 ${notes.length}\uAC1C \uBA5C\uB85C\uB514` };
    }
    if (/노래|멜로디|음악/.test(c)) {
      const tune = [262, 330, 392, 523];
      const chain = tune.map((f) => ({ type: "buzzer_note", fields: { NOTE: f }, values: { DURATION: num(0.4) } }));
      return { node: chain, label: "\uB178\uB798(\uB3C4\uBBF8\uC194\uB3C4) \u2014 \uBD80\uC800" };
    }
    if (/부저|삐|소리|울려|울리|헤르츠|hz/i.test(c)) {
      const hz = c.match(/(\d+)\s*(?:헤르츠|hz)/i);
      const dur = seconds(c, 0.5).value;
      if (hz) return { node: { type: "buzzer_on", values: { FREQ: num(+hz[1]), DURATION: num(dur) } }, label: `${hz[1]}Hz ${dur}\uCD08` };
      const f = notes.length === 1 ? notes[0] : 262;
      return { node: { type: "buzzer_note", fields: { NOTE: f }, values: { DURATION: num(dur) } }, label: `\uBD80\uC800 ${dur}\uCD08` };
    }
    if (/화면\s*지우|화면\s*클리어/.test(c)) {
      return { node: { type: "clear_display" }, label: "\uD654\uBA74 \uC9C0\uC6B0\uAE30" };
    }
    if (/화면|표시|글자|써줘|써\b|보여|출력|말해|알려|인사/.test(c)) {
      if (!/["'“”']/.test(c)) {
        const outVar = detectOutputVar(c, ctx);
        if (outVar) {
          return { node: { type: "send_message", values: { Msg: vget(outVar) } }, label: `\uD654\uBA74\uC5D0 ${outVar} \uAC12 \uD45C\uC2DC` };
        }
      }
      const raw = extractMessage(c);
      const rom = romanizeKorean(raw) || "Hello";
      const note = hasKorean(raw) && rom !== raw ? ` (\uD55C\uAE00\u2192\uB85C\uB9C8\uC790 "${raw}"\u2192"${rom}")` : "";
      return { node: { type: "send_message", values: { Msg: txt(rom) } }, label: `\uD654\uBA74\uC5D0 "${rom}" \uD45C\uC2DC${note}` };
    }
    const eye = eyeTargets(c);
    if (eye || /윙크/.test(c) || /(?:led|엘이디|램프|불|전구|빛)/i.test(c)) {
      const targets = eye ? eye.leds : null;
      const tLabel = eye ? eye.label : "LED";
      const cnt = extractNumber(c, "\uBC88", 4).value;
      const numMatch = c.match(/(\d+)\s*번/);
      if (targets && targets.length >= 2 && /번갈아|교대/.test(c)) {
        const [a, b] = targets;
        const cycle = [ledOn(a), ledOff(b), sleepFor(0.4), ledOff(a), ledOn(b), sleepFor(0.4)];
        return { node: repeatN(cnt, cycle), label: `${tLabel} \uBC88\uAC08\uC544 \uAE5C\uBE61 (${cnt}\uBC88)` };
      }
      if (/깜빡|깜박|반짝|점멸|켰다\s*껐다|껐다\s*켰다|윙크/.test(c)) {
        const wink = /윙크/.test(c);
        const leds = wink ? eye && eye.leds.length === 1 ? eye.leds : [1] : targets;
        const onArr = leds ? leds.map(ledOn) : [lampAll(1)];
        const offArr = leds ? leds.map(ledOff) : [lampAll(0)];
        const cycle = [...onArr, sleepFor(0.4), ...offArr, sleepFor(0.4)];
        return { node: repeatN(cnt, cycle), label: `${wink ? "\uC719\uD06C" : tLabel + " \uAE5C\uBE61"} (${cnt}\uBC88)` };
      }
      if (/끄|꺼|소등|off/i.test(c)) {
        if (targets) return { node: targets.map(ledOff), label: `${tLabel} \uB044\uAE30` };
        if (numMatch) return { node: ledOff(+numMatch[1]), label: `LED ${numMatch[1]}\uBC88 \uB044\uAE30` };
        return { node: { type: "led_off_all" }, label: "LED \uC804\uCCB4 \uB044\uAE30" };
      }
      if (/켜|키|on|밝/i.test(c)) {
        if (targets) return { node: targets.map(ledOn), label: `${tLabel} \uCF1C\uAE30` };
        const brightness = /밝기/.test(c) ? extractNumber(c, "\uBC1D\uAE30", 1).value : 1;
        if (numMatch) return { node: { type: "led_on", values: { LED_NUM: num(+numMatch[1]), BRIGHTNESS: num(brightness) } }, label: `LED ${numMatch[1]}\uBC88 \uCF1C\uAE30` };
        return { node: lampAll(1), label: "LED \uC804\uCCB4 \uCF1C\uAE30" };
      }
    }
    if (/발사|쏴|쏘|로켓|총/.test(c)) return { node: { type: "gun_fire" }, label: "\uBC1C\uC0AC" };
    if (/레이더|radar/i.test(c)) {
      if (/멈춰|멈추|정지|꺼|끄|스톱|그만/.test(c)) return { node: { type: "main_motor_stop" }, label: "\uB808\uC774\uB354 \uC815\uC9C0 (DC\uBAA8\uD130)" };
      const s = seconds(c, 2);
      if (s.found && !/계속/.test(c)) return { node: { type: "main_motor_forward_timed", values: { SECONDS: num(s.value), SPEED: num(100) } }, label: `\uB808\uC774\uB354 ${s.value}\uCD08 \uD68C\uC804 (DC\uBAA8\uD130)` };
      return { node: { type: "main_motor_forward", values: { SPEED: num(100) } }, label: "\uB808\uC774\uB354 \uD68C\uC804 (DC\uBAA8\uD130)" };
    }
    if (/연결\s*(?:확인|상태|됐|되었)|접속\s*확인/.test(c)) return { node: { type: "pico_check_device" }, label: "\uC5F0\uACB0 \uD655\uC778" };
    if (/기다|대기|쉬어|쉬기|잠깐\s*멈/.test(c)) {
      const s = seconds(c, 1).value;
      return { node: { type: "time_sleep", values: { SECONDS: num(s) } }, label: `${s}\uCD08 \uAE30\uB2E4\uB9AC\uAE30` };
    }
    const dc = /디씨|dc|바퀴|카트|메인\s*모터/i.test(c);
    if (/멈춰|멈추|정지|스톱|스탑|그만|서줘|섯/.test(c)) {
      return dc ? { node: { type: "main_motor_stop" }, label: "DC\uBAA8\uD130 \uC815\uC9C0" } : { node: { type: "stop_moving" }, label: "\uC11C\uBCF4 \uC815\uC9C0" };
    }
    let dir = null, ko = "";
    if (/앞|전진|직진|forward|가줘|가기|이동/i.test(c)) {
      dir = "forward";
      ko = "\uC804\uC9C4";
    } else if (/뒤|후진|back/i.test(c)) {
      dir = "backward";
      ko = "\uD6C4\uC9C4";
    } else if (/왼|좌회전|좌측|left/i.test(c)) {
      dir = "left";
      ko = "\uC88C\uD68C\uC804";
    } else if (/오른|우회전|우측|right/i.test(c)) {
      dir = "right";
      ko = "\uC6B0\uD68C\uC804";
    }
    if (dir) {
      const cont = /계속|쭉|끝까지/.test(c);
      const s = seconds(c, 1);
      if (dc && (dir === "forward" || dir === "backward")) {
        if (dir === "forward") return cont ? { node: { type: "main_motor_forward", values: { SPEED: num(100) } }, label: "DC\uBAA8\uD130 \uACC4\uC18D \uC804\uC9C4" } : { node: { type: "main_motor_forward_timed", values: { SECONDS: num(s.value), SPEED: num(100) } }, label: `DC\uBAA8\uD130 \uC804\uC9C4 ${s.value}\uCD08` };
        return cont ? { node: { type: "main_motor_backward", values: { SPEED: num(100) } }, label: "DC\uBAA8\uD130 \uACC4\uC18D \uD6C4\uC9C4" } : { node: { type: "main_motor_backward_timed", values: { SECONDS: num(s.value), SPEED: num(100) } }, label: `DC\uBAA8\uD130 \uD6C4\uC9C4 ${s.value}\uCD08` };
      }
      if (cont) {
        const map2 = { forward: "move_forward", backward: "move_backward", left: "turn_left", right: "turn_right" };
        return { node: { type: map2[dir], values: { SPEED: num(100) } }, label: `\uC11C\uBCF4 \uACC4\uC18D ${ko}` };
      }
      const map = { forward: "timed_forward", backward: "timed_backward", left: "timed_left", right: "timed_right" };
      return { node: { type: map[dir], values: { SECONDS: num(s.value), SPEED: num(100) } }, label: `\uC11C\uBCF4 ${ko} ${s.value}\uCD08` };
    }
    return null;
  }
  var OP_KO = { LT: "<", LTE: "\u2264", GT: ">", GTE: "\u2265", EQ: "=" };
  function detectComparison(condText, ctx) {
    let varName = null, sensor = null;
    if (/적외선|거리|초음파/.test(condText)) {
      varName = "\uAC70\uB9AC\uAC12";
      sensor = "distance";
    } else if (/자기|자석/.test(condText)) {
      varName = "\uC790\uAE30\uAC12";
      sensor = "magnetic";
    } else {
      for (const v of ctx.measured) if (condText.includes(v)) {
        varName = v;
        break;
      }
    }
    if (!varName && ctx.lastVar && /\d/.test(condText) && /작|적|크|많|같|동일|이상|이하|미만|초과|넘|가까|멀|짧|길|아래|위|낮|높|이내/.test(condText)) {
      varName = ctx.lastVar;
      sensor = ctx.lastSensor;
    }
    if (!varName) return null;
    let op = null;
    if (/이하/.test(condText)) op = "LTE";
    else if (/이상/.test(condText)) op = "GTE";
    else if (/작|적|가까|짧|미만|아래|낮|이내/.test(condText)) op = "LT";
    else if (/크|많|멀|길|초과|넘|위|높/.test(condText)) op = "GT";
    else if (/같|동일|이면|==/.test(condText)) op = "EQ";
    let value = null;
    const nm = condText.match(/(\d+(?:\.\d+)?)/);
    if (nm) value = parseFloat(nm[1]);
    else if (sensor === "magnetic" && /감지|있으면|닿|붙/.test(condText)) {
      value = 1;
      op = op || "EQ";
    }
    if (op === null || value === null) return null;
    return { varName, op, value, sensor };
  }
  function parseClause(c, ctx) {
    const cond = c.match(/^(.*?(?:으면|면))\s+(.+)$/);
    if (cond) {
      const info = detectComparison(cond[1], ctx);
      if (info) {
        const body = matchAction(cond[2], ctx);
        if (body) {
          const bodyArr = Array.isArray(body.node) ? body.node : [body.node];
          const prepend = [];
          if (info.sensor && !ctx.measured.has(info.varName)) {
            prepend.push(info.sensor === "distance" ? distanceTo(info.varName) : magneticTo(info.varName));
            markVar(ctx, info.varName, info.sensor);
          }
          const ifNode = ifThen(compare(info.op, vget(info.varName), num(info.value)), bodyArr);
          return {
            node: [...prepend, ifNode],
            label: `\uB9CC\uC57D ${info.varName} ${OP_KO[info.op]} ${info.value} \uC774\uBA74 (${body.label})`
          };
        }
        return { needSuggest: "sensor" };
      }
    }
    const rep = c.match(/(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번\s*(?:씩\s*)?(?:반복|돌려|되풀이)/);
    if (rep) {
      const n = /\d/.test(rep[1]) ? parseInt(rep[1], 10) : KO_NUM[rep[1]] || 3;
      const rest = c.replace(rep[0], " ").trim();
      const inner = rest ? matchAction(rest, ctx) : null;
      if (inner) {
        const body = Array.isArray(inner.node) ? inner.node : [inner.node];
        return { node: { type: "controls_repeat_ext", values: { TIMES: num(n) }, statements: { DO: body } }, label: `${n}\uBC88 \uBC18\uBCF5 (${inner.label})` };
      }
      return { repeatOnly: n };
    }
    return matchAction(c, ctx);
  }
  function collectTypes(desc, out) {
    if (Array.isArray(desc)) {
      desc.forEach((d) => collectTypes(d, out));
      return;
    }
    out.add(desc.type);
    Object.values(desc.values || {}).forEach((v) => collectTypes(v, out));
    Object.values(desc.statements || {}).forEach((a) => collectTypes(a, out));
    if (desc.next) collectTypes(desc.next, out);
  }
  var SUGGEST = {
    sensor: { title: "\uC13C\uC11C\uB85C \uC81C\uC5B4\uD558\uAE30", blocks: ["\u{1F4E1} \uAC70\uB9AC \uCE21\uC815 \u2192 \uBCC0\uC218", "\u{1F522} \uBE44\uAD50 (<, >, =)", "\u2753 \uB9CC\uC57D(if)"], hint: '\uC608: "\uAC70\uB9AC \uCE21\uC815\uD558\uACE0, \uAC70\uB9AC\uAC12\uC774 10\uBCF4\uB2E4 \uC791\uC73C\uBA74 \uBA48\uCDB0"' },
    loop: { title: "\uBC18\uBCF5\uD558\uAE30", blocks: ["\u{1F501} \uBC18\uBCF5 N\uBC88", "\u23F1\uFE0F \uAE30\uB2E4\uB9AC\uAE30"], hint: '\uC608: "3\uBC88 \uBC18\uBCF5 \uC55E\uC73C\uB85C \uAC00\uAE30"' },
    variable: { title: "\uBCC0\uC218 \uC4F0\uAE30", blocks: ["\u{1F4E6} \uBCC0\uC218 \uC815\uD558\uAE30/\uBC14\uAFB8\uAE30", "\u{1F522} \uC218\uD559"], hint: '\uC608: "\uC18D\uB3C4\uB97C 5\uB85C \uC815\uD574"' }
  };
  function suggestionsFor(text) {
    const s = [];
    if (/만약|조건|이면|으면|센서|거리|적외선|자기|자석/.test(text)) s.push(SUGGEST.sensor);
    if (/반복|돌려|계속|동안|까지/.test(text)) s.push(SUGGEST.loop);
    if (/변수|값을|담아|저장|정해/.test(text)) s.push(SUGGEST.variable);
    return s;
  }
  function parse(rawText) {
    const text = (rawText || "").trim();
    if (!text) return { ok: false, error: "\uBB34\uC5C7\uC744 \uD558\uACE0 \uC2F6\uC740\uC9C0 \uC801\uC5B4\uC918\uC694.", unmatched: [], added: [], suggest: [] };
    const replace = /처음부터|새로\s*만들|다\s*지우고|지우고\s*시작|싹\s*지우/.test(text);
    const cleaned = splitMeasureBoundary(
      text.replace(/처음부터|새로\s*만들(?:어줘|어)?|다\s*지우고|지우고\s*시작|싹\s*지우고?/g, " ")
    );
    const clauses = splitClauses(cleaned);
    const ctx = { measured: /* @__PURE__ */ new Set(), lastVar: null, lastSensor: null };
    const descs = [];
    const added = [];
    const unmatched = [];
    let pendingRepeat = null;
    for (const c of clauses) {
      const r = parseClause(c, ctx);
      if (!r || r.needSuggest) {
        unmatched.push(c);
        continue;
      }
      if (r.repeatOnly) {
        pendingRepeat = { n: r.repeatOnly };
        continue;
      }
      const nodes = Array.isArray(r.node) ? r.node : [r.node];
      if (pendingRepeat) {
        descs.push({ type: "controls_repeat_ext", values: { TIMES: num(pendingRepeat.n) }, statements: { DO: nodes } });
        added.push(`${pendingRepeat.n}\uBC88 \uBC18\uBCF5 (${r.label})`);
        pendingRepeat = null;
      } else {
        nodes.forEach((n) => descs.push(n));
        added.push(r.label);
      }
    }
    if (!descs.length) {
      return { ok: false, error: "\uC644\uC131\uB41C \uCF54\uB4DC\uB97C \uB9CC\uB4E4\uAE30 \uC5B4\uB824\uC6CC\uC694.", unmatched, added: [], suggest: suggestionsFor(text) };
    }
    const types = /* @__PURE__ */ new Set();
    collectTypes(descs, types);
    for (const t of types) {
      if (!KNOWN_TYPES.has(t)) return { ok: false, error: `\uB0B4\uBD80 \uC624\uB958: \uC54C \uC218 \uC5C6\uB294 \uBE14\uB85D(${t})`, unmatched, added: [], suggest: [] };
    }
    const suggest = unmatched.length ? suggestionsFor(unmatched.join(" ")) : [];
    return { ok: true, replace, xml: wrapXml(descs), added, unmatched, suggest };
  }

  // main.js
  var LESSON_CATALOG = [
    { n: 1, title: "\uCF54\uB529 \uC785\uBB38\uACFC \uC54C\uBE44 \uB9CC\uB0A8", tag: "theory", hardware: "(\uC774\uB860) Bluetooth \uD398\uC5B4\uB9C1", concept: "\uC21C\uCC28/\uBC18\uBCF5 \uAC1C\uB150, \uC571 \uC124\uCE58" },
    { n: 2, title: "LED \uAE30\uCD08: \uC54C\uBE44\uC758 \uCCAB \uD638\uD761", tag: "LED", hardware: "LED 1\uAC1C", concept: "\uB514\uC9C0\uD138 \uCD9C\uB825 HIGH/LOW, time.sleep" },
    { n: 3, title: "LED 2\uAC1C\uB85C \uD45C\uC815 \uB9CC\uB4E4\uAE30", tag: "WINK", hardware: "LED 2\uAC1C", concept: "\uB2E4\uCC44\uB110 \uB3D9\uC2DC \uC81C\uC5B4, \uC719\uD06C \uB9AC\uB4EC" },
    { n: 4, title: "\uBD80\uC800\uB85C \uC18C\uB9AC \uB9CC\uB4E4\uAE30", tag: "BUZZER", hardware: "\uBD80\uC800", concept: "\uC8FC\uD30C\uC218(Hz) \xD7 \uC9C0\uC18D\uC2DC\uAC04" },
    { n: 5, title: "LED 3\uAC1C\uB85C \uC2E0\uD638\uB4F1 \uB9CC\uB4E4\uAE30", tag: "TRAFFIC", hardware: "LED 3\uAC1C", concept: "\uC2DC\uD000\uC2A4 \uC0AC\uACE0, \uBAA8\uB4DC \uBD84\uAE30" },
    { n: 6, title: "\uB79C\uB364 \uD568\uC218\uC640 \uAC00\uC704\uBC14\uC704\uBCF4 \uAC8C\uC784", tag: "RANDOM", hardware: "LED 3\uAC1C", concept: "random.randint, \uBE44\uACB0\uC815\uC801 \uCF54\uB4DC" },
    { n: 7, title: "DC\uBAA8\uD130 \uC785\uBB38: \uD68C\uC804\uACFC \uB8F0\uB81B", tag: "MOTOR", hardware: "DC\uBAA8\uD130 + \uC6D0\uD310", concept: "\uC815/\uC5ED \uD68C\uC804, PWM \uC18D\uB3C4 \uC870\uC808" },
    { n: 8, title: "\uC54C\uBE44 \uCE74\uD2B8 \uC8FC\uD589", tag: "MOTOR", hardware: "DC\uBAA8\uD130 + \uBC14\uD034 2\uAC1C", concept: "\uC804\xB7\uD6C4\uC9C4 \uC8FC\uD589, \uAC00\uAC10\uC18D \uACE1\uC120" },
    { n: 9, title: "\uBC1C\uC0AC\uB300 \uC81C\uC791\uACFC 1\uBD84\uAE30 \uD68C\uACE0", tag: "theory", hardware: "(\uC81C\uC791/\uC774\uB860)", concept: "1\uBD84\uAE30 \uCD1D\uC815\uB9AC, 2\uBD84\uAE30 \uC608\uACE0" },
    { n: 10, title: "LED 5\uAC1C \uC2DC\uD000\uC2A4\uC640 \uCE74\uC6B4\uD2B8\uB2E4\uC6B4", tag: "SEQUENCE", hardware: "LED 5\uAC1C", concept: "\uBC1C\uC0AC \uC2DC\uD000\uC2A4, \uBAA8\uB4C8\uD654 \uC0AC\uACE0" },
    { n: 11, title: "LED\uC640 \uBD80\uC800 \uB3D9\uAE30\uD654", tag: "SYNC", hardware: "LED 5\uAC1C + \uBD80\uC800", concept: "\uBE5B/\uC18C\uB9AC \uB3D9\uAE30, \uC74C\uACC4(\uB3C4\uB808\uBBF8\uD30C\uC194)" },
    { n: 12, title: "\uD654\uC131 \uB85C\uCF13 \uCD5C\uC885 \uBC1C\uC0AC!", tag: "LAUNCH", hardware: "LED 5\uAC1C + \uBD80\uC800 + DC\uBAA8\uD130", concept: "\uD1B5\uD569 \uC2DC\uB098\uB9AC\uC624, \uC790\uC720 \uCC3D\uC791 \uBC1C\uD45C" },
    { n: "+", title: "\uD654\uC131\uC5D0 \uCC29\uB959\uD558\uAE30", tag: "BONUS", hardware: "\uACE7 \uB9CC\uB098\uC694", concept: "\uC9C0\uAE08\uAE4C\uC9C0 \uBC30\uC6B4 \uBAA8\uB4E0 \uAC83\uC744 \uBAA8\uC544 \uD654\uC131 \uCC29\uB959\uC5D0 \uB3C4\uC804!", bonus: true }
  ];
  var MISSION_PROGRESS_KEY = "ares_completed_missions_v1";
  var LAST_CODING_KEY = "ares_last_coding_mission_v1";
  var lastCodingMission = null;
  function rememberCodingMission(lesson, mission) {
    if (!Number.isFinite(lesson) || !Number.isFinite(mission)) return;
    lastCodingMission = { lesson, mission };
    try {
      localStorage.setItem(LAST_CODING_KEY, JSON.stringify(lastCodingMission));
    } catch (e) {
    }
  }
  function getLastCodingMission() {
    if (lastCodingMission) return lastCodingMission;
    try {
      const o = JSON.parse(localStorage.getItem(LAST_CODING_KEY) || "null");
      if (Number.isFinite(o == null ? void 0 : o.lesson) && Number.isFinite(o == null ? void 0 : o.mission)) {
        lastCodingMission = o;
        return o;
      }
    } catch (e) {
    }
    return null;
  }
  function getCompletedMissions() {
    try {
      const saved = JSON.parse(localStorage.getItem(MISSION_PROGRESS_KEY) || "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch (e) {
      return /* @__PURE__ */ new Set();
    }
  }
  function missionProgressId(lesson, mission) {
    return `${lesson}-${mission}`;
  }
  function isMissionCompleted(lesson, mission) {
    return getCompletedMissions().has(missionProgressId(lesson, mission));
  }
  function completedMissionCount(lesson) {
    const completed = getCompletedMissions();
    let count = 0;
    for (let mission = 1; mission <= 4; mission += 1) {
      if (completed.has(missionProgressId(lesson, mission))) count += 1;
    }
    return count;
  }
  function markMissionCompleted(lesson, mission) {
    var _a;
    if (!lesson || !mission) return;
    const completed = getCompletedMissions();
    const id = missionProgressId(lesson, mission);
    if (completed.has(id)) return;
    completed.add(id);
    try {
      localStorage.setItem(MISSION_PROGRESS_KEY, JSON.stringify([...completed]));
    } catch (e) {
    }
    const lessonItem = document.querySelector(`[data-lesson-item="${lesson}"]`);
    const count = lessonItem == null ? void 0 : lessonItem.querySelector(".flow-count");
    if (count) count.textContent = `${completedMissionCount(lesson)}/4`;
    const missionButton = lessonItem == null ? void 0 : lessonItem.querySelector(`[data-inline-mission="${mission}"]`);
    if (missionButton) {
      missionButton.classList.add("completed");
      (_a = missionButton.querySelector(".inline-mission-check")) == null ? void 0 : _a.removeAttribute("hidden");
    }
  }
  var lessonCache = /* @__PURE__ */ new Map();
  var workspace = null;
  var currentView = "overview";
  var currentLesson = null;
  var currentMission = null;
  var mobileBottomNavBound = false;
  var pendingDashboardOpen = false;
  var mobileDashboardReturnHash = null;
  var mobileAiReturnHash = null;
  var aresBlocklyTheme = null;
  var missionToolboxCategories = null;
  var isFreeCodingMode = false;
  var _contentMode = "description";
  var _preSimMode = "description";
  var setContentMode = null;
  var syncSimCodeWidget = null;
  function getAresBlocklyTheme() {
    if (aresBlocklyTheme) return aresBlocklyTheme;
    aresBlocklyTheme = Blockly.Theme.defineTheme("aresTheme", {
      base: Blockly.Themes.Classic,
      blockStyles: {
        logic_blocks: { colourPrimary: "#cacacb" },
        math_blocks: { colourPrimary: "#cacacb" },
        loop_blocks: { colourPrimary: "#7954B5" },
        variable_blocks: { colourPrimary: "#5483b5" },
        variable_dynamic_blocks: { colourPrimary: "#5483b5" },
        procedure_blocks: { colourPrimary: "#727171" }
      },
      categoryStyles: {
        logic_category: { colour: "#cacacb" },
        math_category: { colour: "#cacacb" },
        loop_category: { colour: "#7954B5" },
        variable_category: { colour: "#5483b5" },
        procedure_category: { colour: "#727171" }
      }
    });
    return aresBlocklyTheme;
  }
  function applyAresBuiltinBlockColours() {
    var _a;
    const ifBlock = (_a = Blockly.Blocks) == null ? void 0 : _a.controls_if;
    if (!ifBlock || ifBlock.__aresColourPatchAttached) return;
    const originalInit = ifBlock.init;
    ifBlock.init = function() {
      originalInit.call(this);
      this.setColour("#7954B5");
    };
    ifBlock.__aresColourPatchAttached = true;
  }
  var TOOLBOX_CATEGORY_COLOURS = {
    category_motion: "#cf3d37",
    category_output: "#d68fa5",
    category_gun: "#dcc342",
    category_sensors: "#7daa4d",
    category_control: "#7954B5",
    category_variables: "#5483b5",
    category_math: "#cacacb",
    category_functions: "#727171"
  };
  var TOOLBOX_MUTED_COLOUR = "#E6E6E6";
  function inferMissionToolboxCategories(mission) {
    if (!mission) return null;
    const text = [
      mission.tag,
      mission.hardware,
      mission.title,
      mission.sampleCode,
      ...mission.goals || []
    ].join("\n").toLowerCase();
    const selected = /* @__PURE__ */ new Set();
    const add = (...ids) => ids.forEach((id) => selected.add(id));
    if (/(forward|backward|left|right|motor|servo|dc_|dc motor|dcmotor|전진|후진|좌회전|우회전|모터|주행|이동|레이더)/i.test(text)) {
      add("category_motion");
    }
    if (/(led|lamp|buzzer|sound|note|oled|display|message|icon|print|화면|표시|출력|소리|부저|멜로디|계명|노래|led|램프|불|신호등)/i.test(text)) {
      add("category_output");
    }
    if (/(gun|fire|launch|rocket|발사|로켓|bb탄)/i.test(text)) {
      add("category_gun");
    }
    if (/(distance|magnet|sensor|ultrasonic|거리|자기|자석|센서|감지|측정)/i.test(text)) {
      add("category_sensors");
    }
    if (/(while|for |if |else|repeat|sleep|time\.sleep|반복|조건|만약|기다|대기|초\b|회 반복|무한)/i.test(text)) {
      add("category_control");
    }
    if (/(=|variable|변수|값|저장|range\(|\bi\b|\bj\b)/i.test(text)) {
      add("category_variables");
    }
    if (/(\+|-|\*|\/|>|<|==|!=|random|randint|계산|비교|랜덤|보다|이상|이하|초과|미만)/i.test(text)) {
      add("category_math");
    }
    if (/(def |function|함수)/i.test(text)) {
      add("category_functions");
    }
    return selected;
  }
  function applyMissionToolboxColours(toolboxEl) {
    if (!toolboxEl) return;
    toolboxEl.querySelectorAll("category[id]").forEach((category) => {
      const id = category.getAttribute("id");
      const defaultColour = TOOLBOX_CATEGORY_COLOURS[id];
      if (!defaultColour) return;
      category.setAttribute("colour", defaultColour);
    });
  }
  function applyMissionToolboxDomState() {
    const selected = isFreeCodingMode ? null : missionToolboxCategories;
    document.querySelectorAll(".blocklyToolboxCategory").forEach((categoryEl, index) => {
      const id = CATEGORY_IDS[index];
      const muted = !!(selected && id && !selected.has(id));
      CATEGORY_IDS.forEach((categoryId) => {
        categoryEl.classList.remove(`ares-cat-${categoryId}`);
      });
      if (id) categoryEl.classList.add(`ares-cat-${id}`);
      categoryEl.classList.toggle("ares-muted-category", muted);
    });
  }
  function updateDynamicToolbox() {
    if (!workspace) return;
    const originalToolbox = document.getElementById("toolbox");
    if (!originalToolbox) return;
    const clonedToolbox = originalToolbox.cloneNode(true);
    applyMissionToolboxColours(clonedToolbox);
    if (state.enabledModules) {
      const modules = state.enabledModules;
      const moduleBlockTypes = {
        wheel: [
          "timed_forward",
          "timed_backward",
          "timed_left",
          "timed_right",
          "move_forward",
          "move_backward",
          "turn_left",
          "turn_right",
          "stop_moving"
        ],
        dcmotor: [
          "main_motor_forward_timed",
          "main_motor_backward_timed",
          "main_motor_forward",
          "main_motor_backward",
          "main_motor_stop"
        ],
        leds: ["led_on", "led_off", "led_off_all", "set_lamp"],
        oled: ["send_message", "send_message_xy", "display_icon", "clear_display", "clear_rect"],
        buzzer: ["buzzer_on", "buzzer_note"],
        gun: ["gun_fire"]
      };
      for (const [moduleName, blockTypes] of Object.entries(moduleBlockTypes)) {
        if (modules[moduleName] === false) {
          blockTypes.forEach((type) => {
            clonedToolbox.querySelectorAll(`block[type="${type}"]`).forEach((block) => block.remove());
          });
        }
      }
      if (modules.distance === false) {
        const block = clonedToolbox.querySelector('block[type="check_distance"]');
        if (block) {
          block.parentNode.removeChild(block);
        }
      }
      if (modules.magsensor === false) {
        const block = clonedToolbox.querySelector('block[type="check_magnetic"]');
        if (block) {
          block.parentNode.removeChild(block);
        }
      }
    }
    workspace.updateToolbox(clonedToolbox);
    requestAnimationFrame(applyMissionToolboxDomState);
  }
  var CATEGORY_COLORS = ["#cf3d37", "#d68fa5", "#dcc342", "#7daa4d", "#7954B5", "#5483b5", "#cacacb", "#727171"];
  var CATEGORY_IDS = [
    "category_motion",
    "category_output",
    "category_gun",
    "category_sensors",
    "category_control",
    "category_variables",
    "category_math",
    "category_functions"
  ];
  function getActiveCategoryColour(index) {
    const id = CATEGORY_IDS[index];
    if (!id) return CATEGORY_COLORS[index];
    if (!isFreeCodingMode && missionToolboxCategories && !missionToolboxCategories.has(id)) {
      return TOOLBOX_MUTED_COLOUR;
    }
    return TOOLBOX_CATEGORY_COLOURS[id] || CATEGORY_COLORS[index];
  }
  function lightenColor(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
    return `rgb(${r}, ${g}, ${b})`;
  }
  function setupFlyoutBehavior(ws) {
    var _a;
    const toolbox = (_a = ws.getToolbox) == null ? void 0 : _a.call(ws);
    if (!toolbox) return;
    const FLYOUT_SCALE_MAX = 0.75;
    const FLYOUT_SCALE_MIN = 0.58;
    const applyFlyoutCfg = () => {
      var _a2, _b;
      const flyout = (_a2 = toolbox.getFlyout) == null ? void 0 : _a2.call(toolbox);
      if (!flyout) return;
      flyout.autoClose = true;
      flyout.GAP_Y = 12;
      try {
        const blocklyDiv = document.getElementById("blocklyDiv");
        const baseWidth = (blocklyDiv == null ? void 0 : blocklyDiv.clientWidth) || window.innerWidth;
        const targetWidth = Math.max(260, Math.floor(baseWidth - 58));
        if (typeof flyout.setWidth === "function") flyout.setWidth(targetWidth);
        else flyout.width_ = targetWidth;
        (_b = flyout.position) == null ? void 0 : _b.call(flyout);
      } catch (e) {
      }
    };
    const fitFlyoutBlocks = () => {
      var _a2, _b, _c, _d;
      const flyout = (_a2 = toolbox.getFlyout) == null ? void 0 : _a2.call(toolbox);
      const flyoutWs = (_b = flyout == null ? void 0 : flyout.getWorkspace) == null ? void 0 : _b.call(flyout);
      const blocklyDiv = document.getElementById("blocklyDiv");
      if (!flyout || !flyoutWs || !blocklyDiv) return;
      const blocks = flyoutWs.getTopBlocks(false);
      const maxBlockWidth = blocks.reduce((max, block) => {
        var _a3;
        const size = (_a3 = block.getHeightWidth) == null ? void 0 : _a3.call(block);
        return Math.max(max, (size == null ? void 0 : size.width) || 0);
      }, 0);
      if (!maxBlockWidth) return;
      const availableWidth = Math.max(210, blocklyDiv.clientWidth - 70);
      const nextScale = Math.max(
        FLYOUT_SCALE_MIN,
        Math.min(FLYOUT_SCALE_MAX, availableWidth / maxBlockWidth)
      );
      flyout.__aresFlyoutScale = nextScale;
      try {
        flyoutWs.setScale(nextScale);
      } catch (e) {
      }
      try {
        (_c = flyout.reflow) == null ? void 0 : _c.call(flyout);
      } catch (e) {
      }
      try {
        (_d = flyout.position) == null ? void 0 : _d.call(flyout);
      } catch (e) {
      }
    };
    applyFlyoutCfg();
    const origSetSelected = toolbox.setSelectedItem.bind(toolbox);
    toolbox.setSelectedItem = function(item) {
      origSetSelected(item);
      applyFlyoutCfg();
      document.body.classList.toggle("toolbox-flyout-open", !!item);
      const idx = toolbox.getToolboxItems().indexOf(item);
      const color = getActiveCategoryColour(idx);
      const bg = document.querySelector(".blocklyFlyoutBackground");
      if (bg && color) bg.style.fill = lightenColor(color, 0.82);
      requestAnimationFrame(() => {
        applyFlyoutCfg();
        fitFlyoutBlocks();
      });
    };
  }
  function setupFlyoutFixedScale(ws) {
    var _a;
    const FLYOUT_SCALE = 0.75;
    const flyout = (_a = ws.getFlyout) == null ? void 0 : _a.call(ws);
    if (!flyout) return;
    const proto = Object.getPrototypeOf(flyout);
    if (proto && typeof proto.getFlyoutScale === "function" && !proto.__aresFixedFlyoutScale) {
      proto.getFlyoutScale = function() {
        return this.__aresFlyoutScale || FLYOUT_SCALE;
      };
      proto.__aresFixedFlyoutScale = true;
    }
    flyout.__aresFlyoutScale = FLYOUT_SCALE;
    try {
      flyout.getWorkspace().setScale(FLYOUT_SCALE);
    } catch (e) {
    }
  }
  function initializeBlockly() {
    if (!navigator.bluetooth) {
      alert("\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 Web Bluetooth API\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. Chrome 56+ \uB610\uB294 Edge 79+\uB97C \uC0AC\uC6A9\uD574\uC8FC\uC138\uC694.");
      Logger.add("[\uC624\uB958] \uBE0C\uB77C\uC6B0\uC800\uAC00 Web Bluetooth API\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4", "error");
    }
    Blockly.defineBlocksWithJsonArray(BlocklyConfig.blocks);
    attachBatchBlockValidator(Blockly);
    attachDynamicNaming(Blockly, state);
    applyKoreanMessages();
    applyAresBuiltinBlockColours();
    const toolboxEl = document.getElementById("toolbox");
    if (toolboxEl && window.matchMedia("(max-width: 768px)").matches) {
      toolboxEl.querySelectorAll("category").forEach((cat) => {
        const name = cat.getAttribute("name") || "";
        const firstToken = name.split(/\s+/)[0];
        if (firstToken) cat.setAttribute("name", firstToken);
      });
    }
    workspace = Blockly.inject("blocklyDiv", {
      toolbox: document.getElementById("toolbox"),
      theme: getAresBlocklyTheme(),
      scrollbars: true,
      trashcan: true,
      zoom: {
        controls: true,
        wheel: true,
        pinch: true,
        startScale: 0.9,
        maxScale: 2,
        minScale: 0.3,
        scaleSpeed: 1.2
      }
    });
    Blockly.Python.init(workspace);
    setupBlockContextMenu(workspace);
    setupFlyoutBehavior(workspace);
    setupFlyoutFixedScale(workspace);
    document.body.classList.remove("toolbox-collapsed");
    window.updateToolboxForActiveState = function() {
      updateDynamicToolbox();
      updateWorkspaceBlocks(workspace, state);
    };
    window.updateToolboxForActiveState();
    const emptyHint = document.getElementById("workspaceEmptyHint");
    let emptyHintSuppressed = false;
    const refreshEmptyHint = () => {
      if (!emptyHint) return;
      emptyHint.hidden = emptyHintSuppressed || workspace.getAllBlocks(false).length > 0;
    };
    const suppressEmptyHintWhileDragging = (event) => {
      var _a;
      const target = event.target;
      if (!((_a = target == null ? void 0 : target.closest) == null ? void 0 : _a.call(target, ".blocklyFlyout, .blocklyToolboxDiv"))) return;
      emptyHintSuppressed = true;
      refreshEmptyHint();
    };
    const restoreEmptyHintAfterDrag = () => {
      if (!emptyHintSuppressed) return;
      setTimeout(() => {
        emptyHintSuppressed = false;
        refreshEmptyHint();
      }, 250);
    };
    workspace.addChangeListener(refreshEmptyHint);
    document.addEventListener("pointerdown", suppressEmptyHintWhileDragging, true);
    document.addEventListener("pointerup", restoreEmptyHintAfterDrag, true);
    document.addEventListener("pointercancel", restoreEmptyHintAfterDrag, true);
    refreshEmptyHint();
    return workspace;
  }
  function setupBlockContextMenu(workspace2) {
    const Reg = Blockly.ContextMenuRegistry.registry;
    const ScopeType = Blockly.ContextMenuRegistry.ScopeType;
    [
      "blockComment",
      "blockInline",
      "blockCollapseExpand",
      "blockDisable",
      "blockHelp",
      "blockDuplicate",
      "blockDelete",
      "cleanWorkspace",
      "collapseWorkspace",
      "expandWorkspace",
      "undoWorkspace",
      "redoWorkspace",
      "workspaceDelete"
    ].forEach((id) => {
      try {
        Reg.unregister(id);
      } catch (_) {
      }
    });
    const offsetAppend = (data, ws) => {
      if (!data) return null;
      data.x = (data.x || 0) + 30;
      data.y = (data.y || 0) + 30;
      const copy = Blockly.serialization.blocks.append(data, ws, { recordUndo: true });
      if (copy && copy.select) copy.select();
      return copy;
    };
    const inGroup = (fn) => {
      Blockly.Events.setGroup(true);
      try {
        fn();
      } finally {
        Blockly.Events.setGroup(false);
      }
    };
    function copyBlock(block) {
      if (!block || block.isInFlyout) return;
      inGroup(() => offsetAppend(
        Blockly.serialization.blocks.save(block, { addCoordinates: true, saveIds: false, addInputBlocks: false, addNextBlocks: false }),
        block.workspace
      ));
    }
    function copyConnected(block) {
      if (!block || block.isInFlyout) return;
      const root = block.getRootBlock ? block.getRootBlock() : block;
      inGroup(() => offsetAppend(
        Blockly.serialization.blocks.save(root, { addCoordinates: true, saveIds: false }),
        block.workspace
      ));
    }
    function copyAll(ws) {
      const tops = ws.getTopBlocks(false);
      if (!tops.length) return;
      inGroup(() => tops.forEach((b) => offsetAppend(
        Blockly.serialization.blocks.save(b, { addCoordinates: true, saveIds: false }),
        ws
      )));
    }
    function deleteBlock(block) {
      if (!block || block.isInFlyout) return;
      inGroup(() => block.dispose(true));
    }
    function deleteConnected(block) {
      if (!block || block.isInFlyout) return;
      const root = block.getRootBlock ? block.getRootBlock() : block;
      inGroup(() => root.dispose(false));
    }
    function deleteAll(ws) {
      const tops = ws.getTopBlocks(false);
      if (!tops.length) return;
      if (!window.confirm("\uBE14\uB85D\uC744 \uBAA8\uB450 \uC9C0\uC6B8\uAE4C\uC694?")) return;
      inGroup(() => tops.forEach((b) => b.dispose(false)));
    }
    const onBlock = (scope) => scope.block && !scope.block.isInFlyout ? "enabled" : "hidden";
    const ITEMS = [
      { id: "aresCopy", text: "\u{1F4C4} \uBCF5\uC0AC", run: (b) => copyBlock(b) },
      { id: "aresDelete", text: "\u{1F5D1}\uFE0F \uC0AD\uC81C", run: (b) => deleteBlock(b) },
      { id: "aresCopyConn", text: "\u{1F4D1} \uC5F0\uACB0\uB41C \uBE14\uB85D \uBCF5\uC0AC", run: (b) => copyConnected(b) },
      { id: "aresDeleteConn", text: "\u{1F5D1}\uFE0F \uC5F0\uACB0\uB41C \uBE14\uB85D \uC0AD\uC81C", run: (b) => deleteConnected(b) },
      { id: "aresCopyAll", text: "\u{1F4CB} \uC804\uCCB4 \uBCF5\uC0AC", run: (b) => copyAll(b.workspace) },
      { id: "aresDeleteAll", text: "\u{1F9F9} \uC804\uCCB4 \uC0AD\uC81C", run: (b) => deleteAll(b.workspace) }
    ];
    ITEMS.forEach((it, i) => Reg.register({
      id: it.id,
      weight: i + 1,
      scopeType: ScopeType.BLOCK,
      displayText: it.text,
      preconditionFn: onBlock,
      callback: (scope) => it.run(scope.block)
    }));
    const wsHas = (scope) => scope.workspace && scope.workspace.getTopBlocks(false).length ? "enabled" : "disabled";
    Reg.register({
      id: "aresCopyAllWs",
      weight: 1,
      scopeType: ScopeType.WORKSPACE,
      displayText: "\u{1F4CB} \uC804\uCCB4 \uBCF5\uC0AC",
      preconditionFn: wsHas,
      callback: (scope) => copyAll(scope.workspace)
    });
    Reg.register({
      id: "aresDeleteAllWs",
      weight: 2,
      scopeType: ScopeType.WORKSPACE,
      displayText: "\u{1F9F9} \uC804\uCCB4 \uC0AD\uC81C",
      preconditionFn: wsHas,
      callback: (scope) => deleteAll(scope.workspace)
    });
    let lastPointer = null;
    const div = workspace2.getInjectionDiv ? workspace2.getInjectionDiv() : document.getElementById("blocklyDiv");
    if (div) div.addEventListener("pointerdown", (e) => {
      lastPointer = e;
    }, true);
    workspace2.addChangeListener((e) => {
      if (e.type !== Blockly.Events.CLICK || e.targetType !== "block" || !e.blockId) return;
      if (!lastPointer || lastPointer.pointerType === "touch") return;
      if (lastPointer.target && lastPointer.target.closest && lastPointer.target.closest(".blocklyEditableText")) return;
      const block = workspace2.getBlockById(e.blockId);
      if (!block || block.isInFlyout) return;
      const options = ITEMS.map((it) => ({ text: it.text, enabled: true, callback: () => it.run(block) }));
      Blockly.ContextMenu.show(lastPointer, options, workspace2.RTL, workspace2);
    });
  }
  function applyKoreanMessages() {
    Blockly.Msg["CONTROLS_REPEAT_TITLE"] = "\uBC18\uBCF5 %1 \uBC88";
    Blockly.Msg["CONTROLS_REPEAT_INPUT_DO"] = "\uC2E4\uD589";
    Blockly.Msg["CONTROLS_REPEAT_TOOLTIP"] = "\uC9C0\uC815\uB41C \uD69F\uC218\uB9CC\uD07C \uBB38\uC7A5\uC744 \uBC18\uBCF5\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_CHANGE_TITLE"] = "%1 \uC5D0 %2 \uB9CC\uD07C \uB354\uD558\uAE30";
    Blockly.Msg["MATH_CHANGE_TOOLTIP"] = "\uBCC0\uC218 '%1'\uC5D0 \uC22B\uC790\uB97C \uB354\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_NUMBER_TOOLTIP"] = "\uC22B\uC790\uC785\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_ADD"] = "\uB450 \uC218\uC758 \uD569\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_SUBTRACT"] = "\uCCAB \uBC88\uC9F8 \uC218\uC5D0\uC11C \uB450 \uBC88\uC9F8 \uC218\uB97C \uBE80 \uACB0\uACFC\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_MULTIPLY"] = "\uB450 \uC218\uC758 \uACF1\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_DIVIDE"] = "\uCCAB \uBC88\uC9F8 \uC218\uB97C \uB450 \uBC88\uC9F8 \uC218\uB85C \uB098\uB208 \uACB0\uACFC\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_POWER"] = "\uCCAB \uBC88\uC9F8 \uC218\uB97C \uB450 \uBC88\uC9F8 \uC218 \uB9CC\uD07C \uC2B9\uD55C \uACB0\uACFC\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["VARIABLES_DEFAULT_NAME"] = "\uBCC0\uC218";
    Blockly.Msg["VARIABLES_GET_TOOLTIP"] = "\uC774 \uBCC0\uC218\uC758 \uAC12\uC744 \uAC00\uC838\uC635\uB2C8\uB2E4.";
    Blockly.Msg["VARIABLES_SET"] = "%1 \uC744(\uB97C) %2 (\uC73C)\uB85C \uC124\uC815";
    Blockly.Msg["VARIABLES_SET_TOOLTIP"] = "\uC774 \uBCC0\uC218\uB97C \uC785\uB825\uAC12\uACFC \uAC19\uAC8C \uC124\uC815\uD569\uB2C8\uB2E4.";
    Blockly.Msg["NEW_VARIABLE"] = "\uC0C8 \uBCC0\uC218 \uC0DD\uC131...";
    Blockly.Msg["NEW_VARIABLE_TITLE"] = "\uC0C8 \uBCC0\uC218 \uC774\uB984:";
    Blockly.Msg["NEW_STRING_VARIABLE"] = "\uC0C8 \uBB38\uC790\uC5F4 \uBCC0\uC218 \uC0DD\uC131...";
    Blockly.Msg["NEW_NUMBER_VARIABLE"] = "\uC0C8 \uC22B\uC790 \uBCC0\uC218 \uC0DD\uC131...";
    Blockly.Msg["NEW_COLOUR_VARIABLE"] = "\uC0C8 \uC0C9\uC0C1 \uBCC0\uC218 \uC0DD\uC131...";
    Blockly.Msg["RENAME_VARIABLE"] = "\uBCC0\uC218 \uC774\uB984 \uBCC0\uACBD...";
    Blockly.Msg["RENAME_VARIABLE_TITLE"] = "\uBAA8\uB4E0 '%1' \uBCC0\uC218 \uC774\uB984\uC744 \uB2E4\uC74C\uC73C\uB85C \uBCC0\uACBD:";
    Blockly.Msg["DELETE_VARIABLE"] = "'%1' \uBCC0\uC218 \uC0AD\uC81C";
    Blockly.Msg["DELETE_VARIABLE_CONFIRMATION"] = "'%2' \uBCC0\uC218\uC758 %1\uAC1C \uC0AC\uC6A9\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?";
    Blockly.Msg["CONTROLS_IF_MSG_IF"] = "\uB9CC\uC57D";
    Blockly.Msg["CONTROLS_IF_MSG_THEN"] = "\uC774\uBA74";
    Blockly.Msg["CONTROLS_IF_MSG_ELSE"] = "\uC544\uB2C8\uBA74";
    Blockly.Msg["CONTROLS_IF_MSG_ELSEIF"] = "\uC544\uB2C8\uBA74 \uB9CC\uC57D";
    Blockly.Msg["CONTROLS_IF_TOOLTIP_1"] = "\uAC12\uC774 \uCC38\uC774\uBA74, \uBB38\uC7A5\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_TOOLTIP_2"] = "\uAC12\uC774 \uCC38\uC774\uBA74 \uCCAB \uBC88\uC9F8 \uBE14\uB85D\uC744, \uC544\uB2C8\uBA74 \uB450 \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_TOOLTIP_3"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uCC38\uC774\uBA74 \uCCAB \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4. \uC544\uB2C8\uBA74 \uB450 \uBC88\uC9F8 \uAC12\uC774 \uCC38\uC774\uBA74 \uB450 \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_TOOLTIP_4"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uCC38\uC774\uBA74 \uCCAB \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4. \uC544\uB2C8\uBA74 \uB450 \uBC88\uC9F8 \uAC12\uC774 \uCC38\uC774\uBA74 \uB450 \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4. \uBAA8\uB450 \uAC70\uC9D3\uC774\uBA74 \uB9C8\uC9C0\uB9C9 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_IF_TITLE_IF"] = "\uB9CC\uC57D";
    Blockly.Msg["CONTROLS_IF_IF_TOOLTIP"] = "\uC139\uC158\uC744 \uCD94\uAC00, \uC81C\uAC70, \uC7AC\uC815\uB82C\uD558\uC5EC \uC774 if \uBE14\uB85D\uC744 \uC7AC\uAD6C\uC131\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_ELSEIF_TITLE_ELSEIF"] = "\uC544\uB2C8\uBA74 \uB9CC\uC57D";
    Blockly.Msg["CONTROLS_IF_ELSEIF_TOOLTIP"] = "if \uBE14\uB85D\uC5D0 \uC870\uAC74\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_ELSE_TITLE_ELSE"] = "\uC544\uB2C8\uBA74";
    Blockly.Msg["CONTROLS_IF_ELSE_TOOLTIP"] = "if \uBE14\uB85D\uC5D0 \uBAA8\uB4E0 \uC870\uAC74\uC774 \uAC70\uC9D3\uC77C \uB54C \uC2E4\uD589\uD560 \uBD80\uBD84\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_WHILE"] = "\uCC38\uC778 \uB3D9\uC548 \uBC18\uBCF5";
    Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_UNTIL"] = "\uCC38\uC774 \uB420 \uB54C\uAE4C\uC9C0 \uBC18\uBCF5";
    Blockly.Msg["CONTROLS_WHILEUNTIL_TOOLTIP_WHILE"] = "\uAC12\uC774 \uCC38\uC778 \uB3D9\uC548 \uBB38\uC7A5\uC744 \uBC18\uBCF5\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_WHILEUNTIL_TOOLTIP_UNTIL"] = "\uAC12\uC774 \uAC70\uC9D3\uC778 \uB3D9\uC548 \uBB38\uC7A5\uC744 \uBC18\uBCF5\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_EQ"] = "\uB450 \uAC12\uC774 \uAC19\uC73C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_NEQ"] = "\uB450 \uAC12\uC774 \uB2E4\uB974\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_LT"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uB450 \uBC88\uC9F8\uBCF4\uB2E4 \uC791\uC73C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_LTE"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uB450 \uBC88\uC9F8\uBCF4\uB2E4 \uC791\uAC70\uB098 \uAC19\uC73C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_GT"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uB450 \uBC88\uC9F8\uBCF4\uB2E4 \uD06C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_GTE"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uB450 \uBC88\uC9F8\uBCF4\uB2E4 \uD06C\uAC70\uB098 \uAC19\uC73C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_BOOLEAN_TRUE"] = "\uCC38";
    Blockly.Msg["LOGIC_BOOLEAN_FALSE"] = "\uAC70\uC9D3";
    Blockly.Msg["LOGIC_BOOLEAN_TOOLTIP"] = "\uCC38 \uB610\uB294 \uAC70\uC9D3\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_NEGATE_TITLE"] = "%1 \uC774(\uAC00) \uC544\uB2C8\uB2E4";
    Blockly.Msg["LOGIC_NEGATE_TOOLTIP"] = "\uC785\uB825\uC774 \uAC70\uC9D3\uC774\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4. \uC785\uB825\uC774 \uCC38\uC774\uBA74 \uAC70\uC9D3\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_OPERATION_AND"] = "\uADF8\uB9AC\uACE0";
    Blockly.Msg["LOGIC_OPERATION_OR"] = "\uB610\uB294";
    Blockly.Msg["LOGIC_OPERATION_TOOLTIP_AND"] = "\uB450 \uAC12\uC774 \uBAA8\uB450 \uCC38\uC774\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_OPERATION_TOOLTIP_OR"] = "\uB450 \uAC12 \uC911 \uD558\uB098\uB77C\uB3C4 \uCC38\uC774\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_DEFNORETURN_TITLE"] = "\uD568\uC218";
    Blockly.Msg["PROCEDURES_DEFNORETURN_PROCEDURE"] = "\uC791\uC5C5";
    Blockly.Msg["PROCEDURES_DEFNORETURN_DO"] = "";
    Blockly.Msg["PROCEDURES_DEFNORETURN_TOOLTIP"] = "\uBC18\uD658\uAC12\uC774 \uC5C6\uB294 \uD568\uC218\uB97C \uB9CC\uB4ED\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_DEFNORETURN_COMMENT"] = "\uC774 \uD568\uC218\uC5D0 \uB300\uD55C \uC124\uBA85...";
    Blockly.Msg["PROCEDURES_DEFRETURN_TITLE"] = "\uD568\uC218 (\uBC18\uD658\uAC12 \uC788\uC74C)";
    Blockly.Msg["PROCEDURES_DEFRETURN_PROCEDURE"] = "\uACC4\uC0B0";
    Blockly.Msg["PROCEDURES_DEFRETURN_DO"] = "";
    Blockly.Msg["PROCEDURES_DEFRETURN_RETURN"] = "\uBC18\uD658";
    Blockly.Msg["PROCEDURES_DEFRETURN_TOOLTIP"] = "\uBC18\uD658\uAC12\uC774 \uC788\uB294 \uD568\uC218\uB97C \uB9CC\uB4ED\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_DEFRETURN_COMMENT"] = "\uC774 \uD568\uC218\uC5D0 \uB300\uD55C \uC124\uBA85...";
    Blockly.Msg["PROCEDURES_CALLNORETURN_TOOLTIP"] = "\uC0AC\uC6A9\uC790 \uC815\uC758 \uD568\uC218 '%1'\uC744(\uB97C) \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_CALLRETURN_TOOLTIP"] = "\uC0AC\uC6A9\uC790 \uC815\uC758 \uD568\uC218 '%1'\uC744(\uB97C) \uC2E4\uD589\uD558\uACE0 \uACB0\uACFC\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_MUTATORCONTAINER_TITLE"] = "\uB9E4\uAC1C\uBCC0\uC218";
    Blockly.Msg["PROCEDURES_MUTATORCONTAINER_TOOLTIP"] = "\uC774 \uD568\uC218\uC5D0 \uC785\uB825\uC744 \uCD94\uAC00, \uC81C\uAC70, \uC7AC\uC815\uB82C\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_MUTATORARG_TITLE"] = "\uC785\uB825 \uC774\uB984:";
    Blockly.Msg["PROCEDURES_MUTATORARG_TOOLTIP"] = "\uD568\uC218\uC5D0 \uC785\uB825(\uB9E4\uAC1C\uBCC0\uC218)\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_HIGHLIGHT_DEF"] = "\uD568\uC218 \uC815\uC758\uB85C \uC774\uB3D9";
    Blockly.Msg["PROCEDURES_CREATE_DO"] = "'%1' \uD638\uCD9C \uBE14\uB85D \uB9CC\uB4E4\uAE30";
    Blockly.Msg["PROCEDURES_IFRETURN_TOOLTIP"] = "\uAC12\uC774 \uCC38\uC774\uBA74 \uB450 \uBC88\uC9F8 \uAC12\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_IFRETURN_WARNING"] = "\uACBD\uACE0: \uC774 \uBE14\uB85D\uC740 \uD568\uC218 \uC815\uC758 \uB0B4\uC5D0\uC11C\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_BEFORE_PARAMS"] = "\uB9E4\uAC1C\uBCC0\uC218:";
    Blockly.Msg["PROCEDURES_CALL_BEFORE_PARAMS"] = "\uB9E4\uAC1C\uBCC0\uC218:";
    Blockly.Msg["PROCEDURES_ADD_PARAMETER"] = "\uB9E4\uAC1C\uBCC0\uC218 \uCD94\uAC00";
    Blockly.Msg["PROCEDURES_REMOVE_PARAMETER"] = "\uB9E4\uAC1C\uBCC0\uC218 \uC81C\uAC70";
  }
  function isBleConnected() {
    var _a, _b;
    return !!((_b = (_a = state.bluetoothDevice) == null ? void 0 : _a.gatt) == null ? void 0 : _b.connected) && !!state.characteristic;
  }
  function validateConnection() {
    if (!isBleConnected()) {
      alert("\uBA3C\uC800 \uD53C\uCF54\uB97C BLE\uB85C \uC5F0\uACB0\uD574\uC8FC\uC138\uC694!");
      Logger.add("[\uC624\uB958] BLE\uAC00 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4", "error");
      return false;
    }
    return true;
  }
  function updateRunButtonUI() {
    const btn = elements.runButton;
    if (!btn) return;
    if (state.isExecuting) {
      btn.textContent = "\u{1F6D1} \uBE44\uC0C1\uC815\uC9C0";
      btn.title = "\uC2E4\uD589 \uC911\uC778 \uBBF8\uC158\uC744 \uC989\uC2DC \uBA48\uCDA5\uB2C8\uB2E4";
      btn.classList.add("btn-stop");
      btn.disabled = false;
      updateMobileBottomNav();
      return;
    }
    btn.textContent = "\u25B6\uFE0F \uBBF8\uC158 \uC804\uC1A1";
    btn.title = "\uBE14\uB85D\uCF54\uB529 \uB0B4\uC6A9\uC744 \uD53C\uCF54\uB85C \uC804\uC1A1\uD574 \uC2E4\uD589";
    btn.classList.remove("btn-stop");
    const inMission = currentView === "mission";
    const dashboardFrame = document.getElementById("dashboardFrame");
    const inDashboard = dashboardFrame && dashboardFrame.style.display === "block";
    btn.disabled = !inMission || inDashboard || !isBleConnected();
    updateMobileBottomNav();
  }
  function setupToolboxActions() {
    const box = document.getElementById("toolboxActions");
    if (!box) return;
    box.addEventListener("click", (event) => {
      var _a, _b;
      const btn = event.target.closest(".tbx-action");
      if (!btn || btn.disabled) return;
      const action = btn.dataset.action;
      if (action === "save") (_a = elements.saveButton) == null ? void 0 : _a.click();
      else if (action === "load") (_b = elements.loadButton) == null ? void 0 : _b.click();
    });
  }
  function isInBlockCodingStage() {
    const dashboardFrame = document.getElementById("dashboardFrame");
    const inDashboard = dashboardFrame && dashboardFrame.style.display === "block";
    return currentView === "mission" && _contentMode === "coding" && !inDashboard;
  }
  function refreshBlockCodingButtonUI() {
    updateBlockCodingButtonUI(void 0, { isDashboardVisible, isInBlockCodingStage });
  }
  function openBlockCodingWorkspace() {
    var _a, _b;
    const lessonValue = parseInt((_a = document.getElementById("lessonSelect")) == null ? void 0 : _a.value, 10);
    const missionValue = parseInt((_b = document.getElementById("missionSelect")) == null ? void 0 : _b.value, 10);
    const lesson = Number.isFinite(lessonValue) ? lessonValue : 1;
    const mission = Number.isFinite(missionValue) ? missionValue : 1;
    const ensureCodingMode = () => {
      const dashboardFrame = document.getElementById("dashboardFrame");
      if (currentView !== "mission") return false;
      if (dashboardFrame && dashboardFrame.style.display === "block") {
        closeDashboardToCoding();
      } else if (setContentMode) {
        setContentMode("coding");
      }
      return true;
    };
    if (currentView === "mission") {
      ensureCodingMode();
      return;
    }
    navigate({ lesson, mission });
    let attempts = 0;
    const poll = () => {
      if (ensureCodingMode()) return;
      if (attempts++ < 60) {
        setTimeout(poll, 50);
      }
    };
    setTimeout(poll, 50);
  }
  function closeDashboardToCoding() {
    closeDashboard();
    const contentToggleBtn = document.getElementById("contentToggleBtn");
    if (contentToggleBtn) contentToggleBtn.style.display = "";
    if (currentView === "mission" && setContentMode) setContentMode("coding");
  }
  function handleBlockCodingButtonClick() {
    if (isDashboardVisible()) {
      closeDashboardToCoding();
      return;
    }
    if (isInBlockCodingStage()) {
      navigate({});
      return;
    }
    openBlockCodingWorkspace();
  }
  function openDashboard() {
    const f = document.getElementById("dashboardFrame");
    if (!f || f.style.display === "block") return;
    f.style.display = "block";
    updateRunButtonUI();
    refreshBlockCodingButtonUI();
    updateMobileBottomNav();
    Logger.add("[\uBAA8\uB4DC] \uC810\uAC80 \uD654\uBA74 \uC5F4\uAE30", "info");
  }
  function closeDashboard() {
    const f = document.getElementById("dashboardFrame");
    if (!f || f.style.display !== "block") return;
    f.style.display = "none";
    updateRunButtonUI();
    refreshBlockCodingButtonUI();
    updateMobileBottomNav();
    Logger.add("[\uBAA8\uB4DC] \uC810\uAC80 \uD654\uBA74 \uB2EB\uAE30", "info");
  }
  function openDashboardFromAnywhere() {
    openDashboard();
  }
  function isDashboardVisible() {
    const dashboardFrame = document.getElementById("dashboardFrame");
    return !!dashboardFrame && dashboardFrame.style.display === "block";
  }
  function isAiPanelOpen() {
    const aiPanel = document.getElementById("aiPanel");
    return !!aiPanel && !aiPanel.hasAttribute("hidden");
  }
  function isLogExpanded() {
    const logContainer = document.getElementById("logContainer");
    return !!logContainer && logContainer.classList.contains("expanded");
  }
  function getMobileActiveAction() {
    if (isAiPanelOpen()) return "ai";
    if (_contentMode === "simulation" && currentView === "mission") return "simulation";
    if (isDashboardVisible()) return "dashboard";
    if (currentView === "mission") return _contentMode === "coding" ? "coding" : "mission";
    return "mission";
  }
  function restoreHash(hash) {
    if (typeof hash !== "string") return;
    const current = window.location.hash || "";
    if (hash === current) return;
    window.location.hash = hash;
  }
  function updateMobileBottomNav() {
    const nav = document.getElementById("mobileBottomNav");
    if (!nav) return;
    const activeAction = getMobileActiveAction();
    nav.querySelectorAll("[data-mobile-action]").forEach((btn) => {
      const active = btn.dataset.mobileAction === activeAction;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    const connectBtn = nav.querySelector('[data-mobile-action="connect"]');
    if (connectBtn) {
      const codingMode = document.body.dataset.contentMode === "coding";
      const simMode = document.body.dataset.contentMode === "simulation";
      const connected = isBleConnected();
      const runnable = codingMode && connected;
      const simRunning = simMode && _simRunning;
      const codingExecuting = codingMode && _codingExecuting;
      const stopping = simRunning || codingExecuting;
      const goRun = runnable && !codingExecuting || simMode && !simRunning;
      connectBtn.classList.toggle("connected", connected);
      connectBtn.classList.toggle("coding-run", goRun);
      connectBtn.classList.toggle("run-stop", stopping);
      connectBtn.setAttribute("aria-pressed", String(connected));
      connectBtn.setAttribute("aria-label", codingExecuting ? "\uBE44\uC0C1 \uC815\uC9C0" : simRunning ? "\uC2DC\uBBAC\uB808\uC774\uC158 \uC911\uC9C0" : simMode ? "\uC2DC\uBBAC\uB808\uC774\uC158 \uBAA8\uC758 \uC2E4\uD589" : runnable ? "\uBE14\uB85D \uCF54\uB529 \uC2E4\uD589" : "\uD0D0\uC0AC\uC120 \uC2E0\uD638 \uC5F0\uACB0");
      const label = connectBtn.querySelector(".mobile-nav-label");
      if (label) {
        label.textContent = codingExecuting ? "\uBE44\uC0C1\uC815\uC9C0" : simRunning ? "\uC2E4\uD5D8\uC911\uB2E8" : simMode ? "\uBAA8\uC758\uC2E4\uD589" : runnable ? "\uC2E4\uD589" : connected ? "\uC5F0\uACB0\uB428" : state.isConnecting ? "\uC5F0\uACB0 \uC911\u2026" : state.connectFailed ? "\uC7AC\uC5F0\uACB0" : "\uC2E0\uD638\uC5F0\uACB0";
      }
    }
  }
  function bindMobileBottomNav() {
    const nav = document.getElementById("mobileBottomNav");
    if (!nav || mobileBottomNavBound) return;
    mobileBottomNavBound = true;
    nav.addEventListener("click", (event) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
      const btn = event.target.closest("[data-mobile-action]");
      if (!btn) return;
      const action = btn.dataset.mobileAction;
      const activeAction = getMobileActiveAction();
      const parsed = parseHash();
      const lesson = (_a = currentLesson != null ? currentLesson : parsed.lesson) != null ? _a : 1;
      const mission = (_b = currentMission != null ? currentMission : parsed.mission) != null ? _b : 1;
      if (action === "connect") {
        (_d = (_c = document.getElementById("connectButton")) == null ? void 0 : _c.blur) == null ? void 0 : _d.call(_c);
        return;
      }
      if (action === activeAction) {
        if (action === "dashboard" && isDashboardVisible()) {
          closeDashboard();
        } else if (action === "ai" && isAiPanelOpen()) {
          (_e = document.getElementById("aiPanel")) == null ? void 0 : _e.setAttribute("hidden", "");
          if (mobileAiReturnHash !== null) {
            const backHash = mobileAiReturnHash;
            mobileAiReturnHash = null;
            restoreHash(backHash);
          }
        } else if (action === "log" && isLogExpanded()) {
          (_f = document.getElementById("logHeader")) == null ? void 0 : _f.click();
        } else if (action === "mission" && currentView !== "overview") {
          mobileDashboardReturnHash = null;
          mobileAiReturnHash = null;
          navigate({});
        } else if (action === "coding" && currentView === "mission") {
          if (setContentMode) setContentMode("coding");
        }
        updateMobileBottomNav();
        (_g = btn.blur) == null ? void 0 : _g.call(btn);
        return;
      }
      switch (action) {
        case "mission":
          mobileDashboardReturnHash = null;
          mobileAiReturnHash = null;
          navigate({});
          break;
        case "coding": {
          const target = getLastCodingMission();
          const codingLesson = (_h = target == null ? void 0 : target.lesson) != null ? _h : lesson;
          const codingMission = (_i = target == null ? void 0 : target.mission) != null ? _i : mission;
          mobileDashboardReturnHash = null;
          mobileAiReturnHash = null;
          openMissionCoding(codingLesson, codingMission);
          break;
        }
        case "simulation": {
          if (currentView === "mission") {
            (_j = document.getElementById("simToggle")) == null ? void 0 : _j.click();
          } else {
            const simTarget = getLastCodingMission();
            const simLesson = (_k = simTarget == null ? void 0 : simTarget.lesson) != null ? _k : lesson;
            const simMission = (_l = simTarget == null ? void 0 : simTarget.mission) != null ? _l : mission;
            navigate({ lesson: simLesson, mission: simMission });
            setTimeout(() => {
              var _a2;
              return (_a2 = document.getElementById("simToggle")) == null ? void 0 : _a2.click();
            }, 450);
          }
          break;
        }
        case "dashboard":
          openDashboardFromAnywhere();
          break;
        case "ai":
          if (currentView !== "mission") {
            const aiTarget = getLastCodingMission();
            const aiLesson = (_m = aiTarget == null ? void 0 : aiTarget.lesson) != null ? _m : lesson;
            const aiMission = (_n = aiTarget == null ? void 0 : aiTarget.mission) != null ? _n : mission;
            mobileAiReturnHash = window.location.hash || "";
            navigate({ lesson: aiLesson, mission: aiMission });
            pendingDashboardOpen = false;
            setTimeout(() => {
              var _a2;
              return (_a2 = document.getElementById("aiHelpButton")) == null ? void 0 : _a2.click();
            }, 450);
          } else {
            mobileAiReturnHash = null;
            (_o = document.getElementById("aiHelpButton")) == null ? void 0 : _o.click();
          }
          break;
        case "log":
          (_p = document.getElementById("logHeader")) == null ? void 0 : _p.click();
          break;
      }
      (_q = btn.blur) == null ? void 0 : _q.call(btn);
    });
    updateMobileBottomNav();
  }
  function parseHash() {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const lessonRaw = parseInt(params.get("lesson"), 10);
    const missionRaw = parseInt(params.get("mission"), 10);
    const lesson = Number.isFinite(lessonRaw) && lessonRaw >= 1 && lessonRaw <= 12 ? lessonRaw : null;
    const mission = Number.isFinite(missionRaw) && missionRaw >= 1 && missionRaw <= 4 ? missionRaw : null;
    return { lesson, mission: lesson ? mission : null };
  }
  function navigate({ lesson = null, mission = null } = {}) {
    let target = "";
    if (lesson) {
      target = `lesson=${lesson}`;
      if (mission) target += `&mission=${mission}`;
    }
    const next = "#" + target;
    if (window.location.hash !== next) {
      window.location.hash = next;
    } else {
      applyRoute();
    }
  }
  async function applyRoute() {
    const { lesson, mission } = parseHash();
    if (lesson && mission) {
      await enterMission(lesson, mission);
    } else if (lesson) {
      await enterLesson(lesson);
    } else {
      enterOverview();
    }
  }
  function resetScrollTop() {
    const toTop = () => {
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    };
    toTop();
    requestAnimationFrame(toTop);
  }
  function showView(view) {
    var _a, _b, _c;
    for (const v of ["overview", "lesson", "mission"]) {
      const el = document.getElementById(v + "View");
      if (el) el.hidden = v !== view;
    }
    currentView = view;
    const activeView = document.getElementById(view + "View");
    if (activeView) {
      activeView.scrollTop = 0;
      (_b = (_a = activeView.querySelector(".mission-panel")) == null ? void 0 : _a.scrollTo) == null ? void 0 : _b.call(_a, { top: 0 });
    }
    resetScrollTop();
    const inMission = view === "mission";
    if (elements.saveButton) elements.saveButton.disabled = !inMission;
    if (elements.loadButton) elements.loadButton.disabled = !inMission;
    const exampleSelect = document.getElementById("exampleSelect");
    if (exampleSelect) {
      exampleSelect.disabled = !inMission;
      exampleSelect.hidden = !inMission;
    }
    const aiHelpButton = document.getElementById("aiHelpButton");
    if (aiHelpButton) aiHelpButton.hidden = !inMission;
    if (!inMission) (_c = document.getElementById("aiPanel")) == null ? void 0 : _c.setAttribute("hidden", "");
    updateRunButtonUI();
    const contentBtn = document.getElementById("contentToggleBtn");
    if (contentBtn) contentBtn.hidden = !inMission;
    const simToggle = document.getElementById("simToggle");
    if (simToggle) simToggle.hidden = !inMission;
    if (!inMission) {
      if (simController) simController.close();
      _preSimMode = "description";
      document.body.removeAttribute("data-content-mode");
    }
    if (inMission && setContentMode) setContentMode("description");
    if (inMission && workspace) {
      setTimeout(() => {
        try {
          Blockly.svgResize(workspace);
        } catch (e) {
        }
      }, 0);
    }
    refreshBlockCodingButtonUI();
    if (!inMission) pendingDashboardOpen = false;
    updateMobileBottomNav();
  }
  async function enterOverview() {
    showView("overview");
    currentLesson = null;
    currentMission = null;
    isFreeCodingMode = false;
    missionToolboxCategories = null;
    if (window.updateToolboxForActiveState) {
      window.updateToolboxForActiveState();
    }
    document.getElementById("lessonSelect").value = "";
    populateMissionSelect(null);
    updateBreadcrumb(null, null);
    const container = document.getElementById("overviewContent");
    if (container && container.dataset.loaded !== "true") {
      try {
        const res = await fetch("overview.html", { cache: "no-store" });
        container.innerHTML = await res.text();
        container.dataset.loaded = "true";
        const tbody = document.getElementById("overviewLessonTableBody");
        if (tbody) {
          tbody.innerHTML = LESSON_CATALOG.map((l) => l.bonus ? `
          <tr class="bonus" data-lesson-item="bonus">
            <td class="lesson-n">${l.n}</td>
            <td class="lesson-title-cell">${escapeHtml2(l.title)}</td>
            <td>${escapeHtml2(l.hardware)}</td>
            <td>${escapeHtml2(l.concept)}</td>
            <td><span class="tag tag-BONUS">${escapeHtml2(l.tag)}</span></td>
          </tr>
         ` : `
          <tr data-lesson="${l.n}">
            <td class="lesson-n">${l.n}</td>
            <td class="lesson-title-cell">
              <a href="#lesson=${l.n}">${escapeHtml2(l.title)}</a>
            </td>
            <td>${escapeHtml2(l.hardware)}</td>
            <td>${escapeHtml2(l.concept)}</td>
            <td><span class="tag tag-${l.tag}">${escapeHtml2(l.tag)}</span></td>
          </tr>
         `).join("");
        }
        const flowContainer = document.getElementById("lessonFlowContainer");
        if (flowContainer) {
          flowContainer.innerHTML = LESSON_CATALOG.map((lesson) => lesson.bonus ? `
           <section class="lesson-accordion-item bonus" data-lesson-item="bonus">
             <button class="flow-step-btn" data-bonus="1" aria-expanded="false" aria-controls="inlineMissionsBonus">
               <span class="flow-num">${lesson.n}</span>
               <span class="flow-main">
                 <strong>${escapeHtml2(lesson.title)}</strong>
                 <small>${escapeHtml2(lesson.hardware)}</small>
               </span>
               <span class="flow-arrow" aria-hidden="true">\u25C0</span>
             </button>
             <div id="inlineMissionsBonus" class="lesson-panel" hidden></div>
           </section>
         ` : `
           <section class="lesson-accordion-item" data-lesson-item="${lesson.n}">
             <button class="flow-step-btn" data-lesson="${lesson.n}" aria-expanded="false" aria-controls="inlineMissions${lesson.n}">
               <span class="flow-num">${lesson.n}</span>
               <span class="flow-main">
                 <strong>${escapeHtml2(lesson.title)}</strong>
                 <small>${escapeHtml2(lesson.hardware)}</small>
               </span>
               <span class="flow-count">${completedMissionCount(lesson.n)}/4</span>
               <span class="flow-arrow" aria-hidden="true">\u25C0</span>
             </button>
             <div id="inlineMissions${lesson.n}" class="lesson-panel" hidden></div>
           </section>
         `).join("");
          flowContainer.addEventListener("click", async (event) => {
            if (event.target.closest(".landing-start-btn")) {
              try {
                const { launchLandingGame: launchLandingGame2 } = await Promise.resolve().then(() => (init_landing_game(), landing_game_exports));
                launchLandingGame2();
              } catch (e) {
                Logger.add(`[\uC624\uB958] \uCC29\uB959 \uAC8C\uC784 \uB85C\uB4DC \uC2E4\uD328: ${e.message}`, "error");
              }
              return;
            }
            const codeBtn = event.target.closest(".mission-code-btn");
            if (codeBtn) {
              openMissionCoding(Number(codeBtn.dataset.lesson), Number(codeBtn.dataset.mission));
              return;
            }
            const missionButton = event.target.closest(".inline-mission-btn");
            if (missionButton) {
              navigate({
                lesson: Number(missionButton.dataset.lesson),
                mission: Number(missionButton.dataset.inlineMission)
              });
              return;
            }
            const lessonButton = event.target.closest(".flow-step-btn");
            if (!lessonButton) return;
            const item = lessonButton.closest(".lesson-accordion-item");
            const panel = item == null ? void 0 : item.querySelector(".lesson-panel");
            if (!panel) return;
            const willOpen = panel.hasAttribute("hidden");
            flowContainer.querySelectorAll(".lesson-panel:not([hidden])").forEach((openPanel) => {
              var _a;
              if (openPanel !== panel) {
                closeAccordion(openPanel);
                (_a = openPanel.previousElementSibling) == null ? void 0 : _a.setAttribute("aria-expanded", "false");
              }
            });
            if (!willOpen) {
              closeAccordion(panel);
              lessonButton.setAttribute("aria-expanded", "false");
              return;
            }
            if (lessonButton.dataset.bonus === "1") {
              panel.innerHTML = `
               <div class="inline-lesson-info bonus-teaser">
                 <h4 class="inline-lesson-info-title">\u{1F680} \uD654\uC131\uC5D0 \uCC29\uB959\uD558\uAE30</h4>
                 <p>\uBD88\uADDC\uCE59\uD55C \uD589\uC131 \uC9C0\uBA74 \uC704\uB85C \uB5A8\uC5B4\uC9C0\uB294 \uC6B0\uC8FC\uC120\uC744 <strong>\uC5ED\uCD94\uC9C4</strong>\uC73C\uB85C \uAC10\uC18D\uD574 \uCC29\uB959\uC2DC\uCF1C\uC694.<br>\uC704\uCABD \uD654\uC0B4\uD45C(\u2191)\uB098 \uD654\uBA74\uC758 <strong>\uC5ED\uCD94\uC9C4</strong> \uBC84\uD2BC\uC744 \uB20C\uB7EC, \uC9C0\uBA74\uC5D0 <strong>\uCC9C\uCC9C\uD788</strong> \uB0B4\uB824\uC549\uD788\uBA74 \uC131\uACF5!</p>
                 <button type="button" class="landing-start-btn">\u{1F6F8} \uCC29\uB959 \uC2E4\uC2DC</button>
               </div>`;
              openAccordion(panel);
              lessonButton.setAttribute("aria-expanded", "true");
              item.scrollIntoView({ block: "nearest", behavior: "smooth" });
              return;
            }
            const lessonNum = Number(lessonButton.dataset.lesson);
            const data = await loadLesson(lessonNum);
            if (!(data == null ? void 0 : data.missions)) return;
            panel.innerHTML = `
             <div class="inline-mission-list">
               ${data.missions.map((m) => renderInlineMissionItem(lessonNum, m)).join("")}
             </div>
           `;
            openAccordion(panel);
            lessonButton.setAttribute("aria-expanded", "true");
            item.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
        }
      } catch (e) {
        container.innerHTML = '<p style="color:#E74C3C">\uAC1C\uC694\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</p>';
        Logger.add(`[\uC624\uB958] overview.html \uB85C\uB4DC \uC2E4\uD328: ${e.message}`, "error");
      }
    }
  }
  function renderInlineMissionItem(n, mission) {
    const completed = isMissionCompleted(n, mission.id);
    return `
    <div class="inline-mission-item" data-mission-item="${mission.id}">
      <button type="button" class="inline-mission-btn${completed ? " completed" : ""}"
              data-lesson="${n}" data-inline-mission="${mission.id}"
              aria-label="${escapeHtml2(mission.title)} \uBBF8\uC158 \uC5F4\uAE30">
        <span class="inline-mission-marker" aria-hidden="true">\u25B6</span>
        <span class="inline-mission-main">
          <strong>${escapeHtml2(mission.title)}</strong>
        </span>
        <span class="inline-mission-check" ${completed ? "" : "hidden"} aria-label="\uC644\uB8CC">\u2713</span>
      </button>
    </div>`;
  }
  var ACCORDION_OPEN_MS = 240;
  var ACCORDION_CLOSE_MS = 180;
  function openAccordion(el) {
    if (!el) return;
    if (el._accTimer) {
      clearTimeout(el._accTimer);
      el._accTimer = null;
    }
    el.classList.remove("accordion-closing", "accordion-opening");
    el.removeAttribute("hidden");
    el.style.setProperty("--acc-h", el.scrollHeight + "px");
    void el.offsetWidth;
    el.classList.add("accordion-opening");
    const done = (e) => {
      if (e && e.target !== el) return;
      el.classList.remove("accordion-opening");
      el.style.removeProperty("--acc-h");
      el.removeEventListener("animationend", done);
      if (el._accTimer) {
        clearTimeout(el._accTimer);
        el._accTimer = null;
      }
    };
    el.addEventListener("animationend", done);
    el._accTimer = setTimeout(done, ACCORDION_OPEN_MS + 120);
  }
  function closeAccordion(el) {
    if (!el || el.hasAttribute("hidden")) return;
    if (el.classList.contains("accordion-closing")) return;
    if (el._accTimer) {
      clearTimeout(el._accTimer);
      el._accTimer = null;
    }
    el.classList.remove("accordion-opening");
    el.style.setProperty("--acc-h", el.scrollHeight + "px");
    void el.offsetWidth;
    el.classList.add("accordion-closing");
    const done = (e) => {
      if (e && e.target !== el) return;
      el.classList.remove("accordion-closing");
      el.style.removeProperty("--acc-h");
      el.setAttribute("hidden", "");
      el.removeEventListener("animationend", done);
      if (el._accTimer) {
        clearTimeout(el._accTimer);
        el._accTimer = null;
      }
    };
    el.addEventListener("animationend", done);
    el._accTimer = setTimeout(done, ACCORDION_CLOSE_MS + 120);
  }
  function openMissionCoding(lesson, mission) {
    if (!Number.isFinite(lesson) || !Number.isFinite(mission)) return;
    navigate({ lesson, mission });
    let attempts = 0;
    const poll = () => {
      if (currentView === "mission" && currentLesson === lesson && currentMission === mission) {
        const dashboardFrame = document.getElementById("dashboardFrame");
        if (dashboardFrame && dashboardFrame.style.display === "block") {
          closeDashboardToCoding();
        } else if (setContentMode) {
          setContentMode("coding");
        }
        return;
      }
      if (attempts++ < 60) setTimeout(poll, 50);
    };
    setTimeout(poll, 50);
  }
  async function enterLesson(n) {
    const data = await loadLesson(n);
    if (!data) {
      enterOverview();
      return;
    }
    showView("lesson");
    currentLesson = n;
    currentMission = null;
    isFreeCodingMode = false;
    missionToolboxCategories = null;
    if (window.updateToolboxForActiveState) {
      window.updateToolboxForActiveState();
    }
    document.getElementById("lessonSelect").value = String(n);
    populateMissionSelect(n, data);
    updateBreadcrumb(n, null);
    document.getElementById("lessonHeading").textContent = `${n}\uCC28\uC2DC \u2014 ${data.title}`;
    document.getElementById("lessonTagBadge").textContent = data.tag;
    document.getElementById("lessonTagBadge").className = `lesson-tag tag-${data.tag}`;
    document.getElementById("lessonHardware").textContent = `\u{1F527} ${data.hardware}`;
    document.getElementById("lessonConcept").textContent = `\u{1F4A1} ${data.concept}`;
    document.getElementById("lessonIntro").textContent = data.intro;
    const ml = document.getElementById("lessonMissionList");
    ml.innerHTML = data.missions.map((m) => `
    <li class="mission-list-item">
      <a href="#lesson=${n}&mission=${m.id}">
        <span class="mission-id">\uBBF8\uC158 ${m.id}</span>
        <span class="mission-list-title">${escapeHtml2(m.title)}</span>
        <span class="mission-list-hw">${escapeHtml2(m.hardware)}</span>
      </a>
    </li>
  `).join("");
    const sm = document.getElementById("lessonSummary");
    if (data.summary) {
      sm.innerHTML = `
      <div class="summary-box summary-${data.summary.type}">
        <h4>${escapeHtml2(data.summary.title)}</h4>
        <p>${escapeHtml2(data.summary.text)}</p>
      </div>
    `;
    } else {
      sm.innerHTML = "";
    }
  }
  async function updateCodingMissionSelect(n, m) {
    const select = document.getElementById("codingMissionSelect");
    if (!select) return;
    const selectedValue = `${n}-${m}`;
    select.innerHTML = "";
    const freeOption = document.createElement("option");
    freeOption.value = "free";
    freeOption.textContent = "\uC790\uC720 \uBAA8\uB4DC - \uC804\uCCB4 \uBE14\uB85D";
    select.appendChild(freeOption);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "\uBBF8\uC158 \uC120\uD0DD";
    select.appendChild(placeholder);
    for (let lesson = 1; lesson <= 12; lesson += 1) {
      const data = await loadLesson(lesson);
      if (!data || !Array.isArray(data.missions)) continue;
      const group = document.createElement("optgroup");
      group.label = `${lesson}\uCC28\uC2DC \xB7 ${data.title || ""}`.trim();
      data.missions.forEach((mission) => {
        const option = document.createElement("option");
        option.value = `${lesson}-${mission.id}`;
        option.textContent = `${lesson}-${mission.id}. ${mission.title}`;
        group.appendChild(option);
      });
      select.appendChild(group);
    }
    select.value = isFreeCodingMode ? "free" : selectedValue;
    select.onchange = () => {
      const value = select.value;
      if (value === "free") {
        isFreeCodingMode = true;
        missionToolboxCategories = null;
        const codingLabel = document.getElementById("codingMissionLabel");
        if (codingLabel) codingLabel.textContent = "\uC790\uC720 \uBAA8\uB4DC - \uC804\uCCB4 \uBE14\uB85D \uC0AC\uC6A9";
        if (window.updateToolboxForActiveState) {
          window.updateToolboxForActiveState();
        } else {
          updateDynamicToolbox();
        }
        requestAnimationFrame(applyMissionToolboxDomState);
        return;
      }
      if (!value) return;
      const [lesson, mission] = value.split("-").map((part) => parseInt(part, 10));
      if (Number.isFinite(lesson) && Number.isFinite(mission)) {
        openMissionCoding(lesson, mission);
      }
    };
  }
  async function enterMission(n, m) {
    const data = await loadLesson(n);
    if (!data) {
      enterOverview();
      return;
    }
    const mission = data.missions.find((x) => x.id === m);
    if (!mission) {
      enterLesson(n);
      return;
    }
    showView("mission");
    currentLesson = n;
    currentMission = m;
    isFreeCodingMode = false;
    missionToolboxCategories = inferMissionToolboxCategories(mission);
    rememberCodingMission(n, m);
    document.getElementById("lessonSelect").value = String(n);
    populateMissionSelect(n, data);
    document.getElementById("missionSelect").value = String(m);
    updateBreadcrumb(n, m);
    if (n >= 9) {
      state.activeModel = "launchpad";
    } else {
      state.activeModel = "gun";
    }
    if (window.updateToolboxForActiveState) {
      window.updateToolboxForActiveState();
    }
    document.getElementById("missionHeading").textContent = `${n}\uCC28\uC2DC \uBBF8\uC158 ${m} - ${mission.title}`;
    const codingLabel = document.getElementById("codingMissionLabel");
    if (codingLabel) codingLabel.textContent = `${n}\uCC28\uC2DC \xB7 \uBBF8\uC158 ${m} \u2014 ${mission.title}`;
    updateCodingMissionSelect(n, m);
    document.getElementById("missionTagBadge").textContent = mission.tag;
    document.getElementById("missionTagBadge").className = `lesson-tag tag-${mission.tag}`;
    document.getElementById("missionHardware").textContent = mission.hardware;
    let agentCode = "";
    try {
      agentCode = (localStorage.getItem("ares-agent-code") || "").replace(/[^A-Za-z0-9]/g, "");
    } catch (_) {
    }
    const aresName = agentCode ? `\uC544\uB808\uC2A4 ${escapeHtml2(agentCode)}` : "\uC544\uB808\uC2A4";
    const storyEl = document.getElementById("missionStory");
    const storyLines = (mission.story || []).map((line) => `
    <div class="story-line story-${line.speaker}">
      <span class="story-avatar"><img src="assets/design/avatar-${line.speaker}.png" alt="${line.speaker === "ares" ? "\uC544\uB808\uC2A4" : "\uC54C\uBE44"}"></span>
      <span class="story-name">${line.speaker === "ares" ? aresName : "\uC54C\uBE44"}</span>
      <span class="story-text">${escapeHtml2(line.text)}</span>
    </div>
  `).join("");
    storyEl.innerHTML = `${storyLines}
    <div class="story-line story-ares story-goal-question">
      <span class="story-avatar"><img src="assets/design/avatar-ares.png" alt="\uC544\uB808\uC2A4"></span>
      <span class="story-name">${aresName}</span>
      <span class="story-text">\uC6B0\uC640! \uADF8\uB7EC\uBA74 \uC624\uB298 \uD559\uC2B5\uBAA9\uD45C\uB294 \uBB50\uC57C?</span>
    </div>`;
    const goalsEl = document.getElementById("missionGoals");
    goalsEl.innerHTML = (mission.goals || []).map((g) => `<li>${escapeHtml2(g)}</li>`).join("");
    document.getElementById("missionSampleCode").textContent = mission.sampleCode || "";
    const prev = document.getElementById("prevMissionBtn");
    const next = document.getElementById("nextMissionBtn");
    prev.disabled = m <= 1 && n <= 1;
    next.disabled = m >= data.missions.length && n >= 12;
    prev.onclick = async () => {
      if (m > 1) navigate({ lesson: n, mission: m - 1 });
      else if (n > 1) {
        const prevData = await loadLesson(n - 1);
        const prevCount = Array.isArray(prevData == null ? void 0 : prevData.missions) ? prevData.missions.length : 4;
        navigate({ lesson: n - 1, mission: Math.max(1, prevCount) });
      }
    };
    next.onclick = async () => {
      if (m < data.missions.length) navigate({ lesson: n, mission: m + 1 });
      else if (n < 12) navigate({ lesson: n + 1, mission: 1 });
    };
    if (workspace) {
      setTimeout(() => {
        try {
          Blockly.svgResize(workspace);
        } catch (e) {
        }
      }, 0);
    }
    if (pendingDashboardOpen) {
      pendingDashboardOpen = false;
      setTimeout(() => {
        if (currentView === "mission" && !isDashboardVisible()) {
          toggleDashboard();
        }
      }, 0);
    }
  }
  async function loadLesson(n) {
    if (!Number.isFinite(Number(n))) return null;
    if (lessonCache.has(n)) return lessonCache.get(n);
    const padded = String(n).padStart(2, "0");
    const url = `Lesson${padded}/lesson.json`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      lessonCache.set(n, json);
      return json;
    } catch (e) {
      Logger.add(`[\uC624\uB958] ${url} \uB85C\uB4DC \uC2E4\uD328: ${e.message}`, "error");
      return null;
    }
  }
  function buildLessonSelect() {
    const sel = document.getElementById("lessonSelect");
    if (!sel) return;
    for (const l of LESSON_CATALOG) {
      if (l.bonus) continue;
      const opt = document.createElement("option");
      opt.value = String(l.n);
      opt.textContent = `${l.n}\uCC28\uC2DC \u2014 ${l.title}`;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      const n = parseInt(sel.value, 10);
      if (Number.isFinite(n)) navigate({ lesson: n });
      else navigate({});
    });
  }
  function populateMissionSelect(n, data = null) {
    const sel = document.getElementById("missionSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">\uBBF8\uC158 \uC120\uD0DD\u2026</option>';
    if (!n) {
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    const missions = (data == null ? void 0 : data.missions) || [];
    if (missions.length === 0) {
      for (let i = 1; i <= 4; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `\uBBF8\uC158 ${i}`;
        sel.appendChild(opt);
      }
    } else {
      for (const m of missions) {
        const opt = document.createElement("option");
        opt.value = String(m.id);
        opt.textContent = `\uBBF8\uC158 ${m.id} \u2014 ${m.title}`;
        sel.appendChild(opt);
      }
    }
  }
  function updateBreadcrumb(n, m) {
    const bc = document.getElementById("breadcrumb");
    if (!bc) return;
    if (n && m) bc.textContent = `${n}\uCC28\uC2DC \u203A \uBBF8\uC158 ${m}`;
    else if (n) bc.textContent = `${n}\uCC28\uC2DC`;
    else bc.textContent = "";
  }
  function escapeHtml2(s) {
    return String(s != null ? s : "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toggleDashboard() {
    if (isDashboardVisible()) closeDashboard();
    else openDashboard();
  }
  var simController = null;
  var _simRunning = false;
  var _codingExecuting = false;
  function initializeAlwaysOnListeners() {
    var _a, _b, _c, _d, _e, _f, _g;
    setupToolboxActions();
    (_a = document.querySelector(".ares-brand")) == null ? void 0 : _a.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const { openCredits: openCredits2 } = await Promise.resolve().then(() => (init_credits(), credits_exports));
        openCredits2();
      } catch (err) {
        Logger.add(`[\uC624\uB958] \uD06C\uB808\uB527 \uB85C\uB4DC \uC2E4\uD328: ${err.message}`, "error");
      }
    });
    (_b = elements.connectButton) == null ? void 0 : _b.addEventListener("click", (e) => {
      var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h;
      const mode = document.body.dataset.contentMode;
      if (mode === "simulation") {
        (_a2 = simController == null ? void 0 : simController.toggleSimRun) == null ? void 0 : _a2.call(simController);
        (_c2 = (_b2 = e.currentTarget) == null ? void 0 : _b2.blur) == null ? void 0 : _c2.call(_b2);
        return;
      }
      if (mode === "coding" && isBleConnected()) {
        (_d2 = elements.runButton) == null ? void 0 : _d2.click();
        (_f2 = (_e2 = e.currentTarget) == null ? void 0 : _e2.blur) == null ? void 0 : _f2.call(_e2);
        return;
      }
      if (isBleConnected()) {
        BluetoothManager.disconnect();
      } else {
        BluetoothManager.connect();
      }
      (_h = (_g2 = e.currentTarget) == null ? void 0 : _g2.blur) == null ? void 0 : _h.call(_g2);
    });
    (_c = elements.clearLogBtn) == null ? void 0 : _c.addEventListener("click", (e) => {
      var _a2, _b2;
      Logger.clear();
      Logger.refresh();
      (_b2 = (_a2 = e.currentTarget) == null ? void 0 : _a2.blur) == null ? void 0 : _b2.call(_a2);
    });
    (_d = document.getElementById("blockCodingButton")) == null ? void 0 : _d.addEventListener("click", (e) => {
      var _a2, _b2;
      handleBlockCodingButtonClick();
      (_b2 = (_a2 = e.currentTarget) == null ? void 0 : _a2.blur) == null ? void 0 : _b2.call(_a2);
    });
    (_e = document.getElementById("inspectButton")) == null ? void 0 : _e.addEventListener("click", (e) => {
      var _a2, _b2;
      openDashboardFromAnywhere();
      (_b2 = (_a2 = e.currentTarget) == null ? void 0 : _a2.blur) == null ? void 0 : _b2.call(_a2);
    });
    window.addEventListener("ares:connection", updateRunButtonUI);
    window.addEventListener("ares:execution", updateRunButtonUI);
    window.addEventListener("ares:contentmode", updateMobileBottomNav);
    window.addEventListener("ares:simrun", (e) => {
      _simRunning = !!(e.detail && e.detail.running);
      updateMobileBottomNav();
    });
    window.addEventListener("ares:execution", (e) => {
      _codingExecuting = !!(e.detail && e.detail.executing);
      updateMobileBottomNav();
    });
    (_f = document.getElementById("homeButton")) == null ? void 0 : _f.addEventListener("click", (e) => {
      var _a2, _b2;
      navigate({});
      (_b2 = (_a2 = e.currentTarget) == null ? void 0 : _a2.blur) == null ? void 0 : _b2.call(_a2);
    });
    (_g = document.getElementById("missionSelect")) == null ? void 0 : _g.addEventListener("change", (e) => {
      const m = parseInt(e.target.value, 10);
      const n = parseInt(document.getElementById("lessonSelect").value, 10);
      if (Number.isFinite(n) && Number.isFinite(m)) {
        navigate({ lesson: n, mission: m });
      }
    });
    window.addEventListener("beforeunload", () => {
      var _a2, _b2;
      if ((_b2 = (_a2 = state.bluetoothDevice) == null ? void 0 : _a2.gatt) == null ? void 0 : _b2.connected) {
        BluetoothManager.disconnect();
      }
    });
    window.addEventListener("hashchange", applyRoute);
  }
  function initializeMissionListeners(ws) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    (_a = elements.runButton) == null ? void 0 : _a.addEventListener("click", async () => {
      if (state.isExecuting) {
        Logger.add("[\uBE44\uC0C1\uC815\uC9C0] \uC2E4\uD589\uB428", "error");
        state.isExecuting = false;
        updateRunButtonUI();
        if (isBleConnected()) {
          try {
            await BluetoothManager.emergencyStop();
            Logger.add("[\uBE44\uC0C1\uC815\uC9C0] \uBAA8\uB4E0 \uD558\uB4DC\uC6E8\uC5B4 \uC815\uC9C0 \uC644\uB8CC", "info");
          } catch (error) {
            Logger.add(`[\uC624\uB958] \uBE44\uC0C1 \uC815\uC9C0 \uC804\uC1A1 \uC2E4\uD328: ${error.message}`, "error");
          }
        } else {
          Logger.add("[\uBE44\uC0C1\uC815\uC9C0] \uBE14\uB8E8\uD22C\uC2A4 \uBBF8\uC5F0\uACB0 - \uBE14\uB85D\uB9CC \uC911\uB2E8\uB428", "info");
        }
        return;
      }
      if (!validateConnection()) return;
      try {
        const completed = await CommandExecutor.executeWorkspace(ws);
        if (completed && currentLesson && currentMission) {
          markMissionCompleted(currentLesson, currentMission);
          Logger.add(`[\uBBF8\uC158] ${currentLesson}\uCC28\uC2DC ${currentMission}\uBC88 \uC644\uB8CC \uAE30\uB85D`, "info");
        }
      } catch (error) {
        console.error("\uBA85\uB839 \uC2E4\uD589 \uC624\uB958:", error);
        alert("\uBA85\uB839 \uC2E4\uD589 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4: " + error.message);
        Logger.add(`[\uC624\uB958] \uBA85\uB839 \uC2E4\uD589 \uC2E4\uD328: ${error.message}`, "error");
      }
    });
    (_b = elements.saveButton) == null ? void 0 : _b.addEventListener("click", async () => {
      const xml = Blockly.Xml.workspaceToDom(ws);
      const xmlText = Blockly.Xml.domToPrettyText(xml);
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: "Ares_Workspace.xml",
            types: [{ description: "ARES \uBBF8\uC158 \uD30C\uC77C", accept: { "application/xml": [".xml"] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(xmlText);
          await writable.close();
          Logger.add(`[\uD30C\uC77C] ${handle.name} \uC800\uC7A5 \uC644\uB8CC`, "info");
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return;
          console.warn("showSaveFilePicker \uC2E4\uD328 \u2192 \uB2E4\uC6B4\uB85C\uB4DC\uB85C \uD3F4\uBC31:", err);
        }
      }
      const fileName = prompt("\uC800\uC7A5\uD560 \uD30C\uC77C \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694 (\uD655\uC7A5\uC790 \uC81C\uC678):", "Ares_Workspace");
      if (!fileName) return;
      const blob = new Blob([xmlText], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.xml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
      Logger.add(`[\uD30C\uC77C] ${fileName}.xml \uB2E4\uC6B4\uB85C\uB4DC`, "info");
    });
    (_c = elements.loadButton) == null ? void 0 : _c.addEventListener("click", () => elements.fileInput.click());
    (_d = elements.fileInput) == null ? void 0 : _d.addEventListener("change", (event) => {
      var _a2;
      const file = (_a2 = event.target.files) == null ? void 0 : _a2[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const xmlText = e.target.result;
        try {
          const xml = Blockly.utils.xml.textToDom(xmlText);
          ws.clear();
          Blockly.Xml.domToWorkspace(xml, ws);
          Logger.add(`[\uD30C\uC77C] ${file.name} \uBD88\uB7EC\uC624\uAE30 \uC644\uB8CC`, "info");
        } catch (err) {
          alert("Blockly \uC791\uC5C5 \uACF5\uAC04\uC744 \uBD88\uB7EC\uC624\uB294 \uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC720\uD6A8\uD55C XML \uD30C\uC77C\uC778\uC9C0 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
          Logger.add(`[\uC624\uB958] ${file.name} \uD30C\uC77C \uB85C\uB4DC \uC2E4\uD328`, "error");
          console.error("Error loading workspace:", err);
        }
      };
      reader.readAsText(file);
    });
    let simCodeWs = null;
    let simCodeActive = false;
    const ensureSimCodeWs = () => {
      if (simCodeWs) return simCodeWs;
      const div = document.getElementById("simCodeBlockly");
      if (!div || !window.Blockly) return null;
      try {
        simCodeWs = Blockly.inject(div, {
          theme: getAresBlocklyTheme(),
          readOnly: true,
          // 편집 불가 — 보기 전용
          scrollbars: true,
          trashcan: false,
          zoom: { startScale: 0.7 }
        });
      } catch (err) {
        console.warn("\uC608\uC81C \uCF54\uB4DC \uC704\uC82F \uC0DD\uC131 \uC2E4\uD328:", err);
        simCodeWs = null;
      }
      return simCodeWs;
    };
    const simExampleLabel = (name) => {
      const sel = document.getElementById("codingExampleSelect");
      const opt = sel && sel.querySelector(`option[value="${name}"]`);
      return (opt ? opt.textContent : name).replace(/\s+/g, " ").trim();
    };
    const updateSimCodeToggleIcon = () => {
      const panel = document.getElementById("simCodePanel");
      const btn = document.getElementById("simCodeToggle");
      if (!panel || !btn) return;
      const collapsed = panel.classList.contains("sim-code-collapsed");
      btn.textContent = collapsed ? "\u25B8" : "\u25BE";
      btn.setAttribute("aria-expanded", String(!collapsed));
    };
    const syncSimCodeFromWorkspace = () => {
      const panel = document.getElementById("simCodePanel");
      if (!simCodeActive || !panel) return;
      if (panel.classList.contains("sim-code-collapsed")) return;
      const wsRO = ensureSimCodeWs();
      if (!wsRO) return;
      try {
        wsRO.clear();
        Blockly.Xml.domToWorkspace(Blockly.Xml.workspaceToDom(ws), wsRO);
      } catch (err) {
        console.warn("\uC608\uC81C \uCF54\uB4DC \uC704\uC82F \uB80C\uB354 \uC2E4\uD328:", err);
      }
      setTimeout(() => {
        try {
          Blockly.svgResize(wsRO);
          wsRO.zoomToFit();
        } catch (e) {
          try {
            wsRO.scrollCenter();
          } catch (e2) {
          }
        }
      }, 60);
    };
    syncSimCodeWidget = syncSimCodeFromWorkspace;
    const activateSimCodeWidget = (name) => {
      const panel = document.getElementById("simCodePanel");
      const titleEl = document.getElementById("simCodeTitle");
      if (!panel) return;
      simCodeActive = true;
      if (titleEl) titleEl.textContent = simExampleLabel(name);
      panel.hidden = false;
      panel.classList.remove("sim-code-collapsed");
      updateSimCodeToggleIcon();
    };
    (_e = document.getElementById("simCodeToggle")) == null ? void 0 : _e.addEventListener("click", () => {
      const panel = document.getElementById("simCodePanel");
      if (!panel) return;
      panel.classList.toggle("sim-code-collapsed");
      updateSimCodeToggleIcon();
      if (!panel.classList.contains("sim-code-collapsed")) syncSimCodeFromWorkspace();
    });
    (_f = document.getElementById("exampleSelect")) == null ? void 0 : _f.addEventListener("change", async (e) => {
      const name = e.target.value;
      if (!name) return;
      const url = new URL(`examples/${name}.xml`, window.location.href).href;
      Logger.add(`[\uC608\uC81C] \uC694\uCCAD: ${url}`, "info");
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const xmlText = await res.text();
        Logger.add(`[\uC608\uC81C] \uB2E4\uC6B4\uB85C\uB4DC ${xmlText.length} bytes`, "info");
        const xml = Blockly.utils.xml.textToDom(xmlText);
        ws.clear();
        Blockly.Xml.domToWorkspace(xml, ws);
        const inSim = document.body.dataset.contentMode === "simulation";
        activateSimCodeWidget(name);
        if (inSim) {
          syncSimCodeFromWorkspace();
        } else {
          if (setContentMode) setContentMode("coding");
          const blocklyDiv = document.getElementById("blocklyDiv");
          const dashboardFrame = document.getElementById("dashboardFrame");
          if (blocklyDiv && dashboardFrame && dashboardFrame.style.display === "block") {
            dashboardFrame.style.display = "none";
            blocklyDiv.style.display = "block";
          }
        }
        Blockly.svgResize(ws);
        ws.scrollCenter();
        const count = ws.getAllBlocks(false).length;
        Logger.add(`[\uC608\uC81C] ${name} \uB85C\uB4DC \uC644\uB8CC \u2014 \uBE14\uB85D ${count}\uAC1C`, "info");
      } catch (err) {
        alert("\uC608\uC81C \uBD88\uB7EC\uC624\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: " + err.message);
        Logger.add(`[\uC624\uB958] \uC608\uC81C \uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328: ${err.message}`, "error");
        console.error("[\uC608\uC81C \uB85C\uB4DC \uC624\uB958]", err);
      } finally {
        e.target.value = "";
      }
    });
    (_g = document.getElementById("codingExampleSelect")) == null ? void 0 : _g.addEventListener("change", (e) => {
      const val = e.target.value;
      e.target.selectedIndex = 0;
      if (!val) return;
      const orig = document.getElementById("exampleSelect");
      if (orig) {
        orig.value = val;
        orig.dispatchEvent(new Event("change"));
      }
    });
    const aiPanel = document.getElementById("aiPanel");
    const aiMessages = document.getElementById("aiMessages");
    const aiInput = document.getElementById("aiInput");
    const aiForm = document.getElementById("aiForm");
    function aiAddMessage(role, html) {
      if (!aiMessages) return;
      const div = document.createElement("div");
      div.className = `ai-msg ai-msg-${role}`;
      div.innerHTML = html;
      aiMessages.appendChild(div);
      aiMessages.scrollTop = aiMessages.scrollHeight;
    }
    function aiEscape(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function aiInsertXml(xmlText, replace) {
      const dom = Blockly.utils.xml.textToDom(xmlText);
      if (replace) {
        ws.clear();
        Blockly.Xml.domToWorkspace(dom, ws);
      } else {
        let tail = null;
        for (const b of ws.getTopBlocks(true)) {
          if (b.previousConnection || b.nextConnection) {
            let cur = b;
            while (cur.getNextBlock()) cur = cur.getNextBlock();
            tail = cur;
            break;
          }
        }
        const ids = Blockly.Xml.domToWorkspace(dom, ws);
        let head = null;
        for (const id of ids) {
          const b = ws.getBlockById(id);
          if (b && b.previousConnection) {
            head = b;
            break;
          }
        }
        if (tail && head && tail.nextConnection && head.previousConnection) {
          tail.nextConnection.connect(head.previousConnection);
        }
      }
      if (setContentMode) setContentMode("coding");
      setTimeout(() => {
        try {
          Blockly.svgResize(ws);
          ws.scrollCenter();
        } catch (e) {
        }
      }, 0);
    }
    function aiFormatSuggest(suggest) {
      if (!suggest || !suggest.length) return "";
      return suggest.map((s) => `<div class="ai-suggest"><b>${aiEscape(s.title)}</b><br>${s.blocks.map(aiEscape).join(" \xB7 ")}<br><span class="ai-hint">${aiEscape(s.hint)}</span></div>`).join("");
    }
    function aiHandle(text) {
      if (!text.trim()) return;
      aiAddMessage("user", aiEscape(text));
      const result = parse(text);
      if (!result.ok) {
        const sug = aiFormatSuggest(result.suggest);
        aiAddMessage(
          "bot",
          sug ? `${aiEscape(result.error)} \uC644\uC131\uC740 \uC5B4\uB835\uC9C0\uB9CC \uC774\uB7F0 \uBE14\uB85D\uB4E4\uC744 \uC368\uBCF4\uC138\uC694:${sug}` : `${aiEscape(result.error)}<br>\uC774\uB807\uAC8C \uB9D0\uD574\uBCFC\uAE4C\uC694? <em>\uC55E\uC73C\uB85C 2\uCD08 \uAC00\uAE30 \xB7 \uBD88 \uCF1C\uC918 \xB7 \uB3C4\uB808\uBBF8 \uC6B8\uB824\uC918</em>`
        );
        Logger.add(`[AI] \uC774\uD574 \uC2E4\uD328: "${text}"`, "warning");
        return;
      }
      try {
        aiInsertXml(result.xml, result.replace);
      } catch (err) {
        aiAddMessage("bot", "\uBE14\uB85D\uC744 \uB123\uB294 \uC911 \uBB38\uC81C\uAC00 \uC0DD\uACBC\uC5B4\uC694. \uB2E4\uC2DC \uB9D0\uD574\uC904\uB798\uC694?");
        Logger.add(`[AI] \uC0BD\uC785 \uC624\uB958: ${err.message}`, "error");
        console.error("[AI \uC0BD\uC785 \uC624\uB958]", err);
        return;
      }
      const list = result.added.map((a) => `\u2022 ${aiEscape(a)}`).join("<br>");
      let msg = `\uCF54\uB529\uCC3D\uC5D0 ${result.added.length}\uAC1C\uB97C \uB123\uC5C8\uC5B4\uC694!<br>${list}`;
      if (result.replace) msg = `\uAE30\uC874 \uBE14\uB85D\uC744 \uC9C0\uC6B0\uACE0 \uC0C8\uB85C \uB123\uC5C8\uC5B4\uC694!<br>${list}`;
      if (result.unmatched && result.unmatched.length) {
        msg += `<br><span class="ai-warn">\uBABB \uC54C\uC544\uB4E4\uC740 \uBD80\uBD84: ${aiEscape(result.unmatched.join(", "))}</span>`;
        const sug = aiFormatSuggest(result.suggest);
        if (sug) msg += `<br>\uC774\uB7F0 \uBE14\uB85D\uB3C4 \uB3C4\uC6C0\uC774 \uB3FC\uC694:${sug}`;
      }
      aiAddMessage("bot", msg);
      Logger.add(`[AI] \uBE14\uB85D ${result.added.length}\uAC1C \uC0DD\uC131 \u2014 "${text}"`, "info");
    }
    (_h = document.getElementById("aiHelpButton")) == null ? void 0 : _h.addEventListener("click", (e) => {
      var _a2, _b2;
      if (!aiPanel) return;
      const open = aiPanel.hasAttribute("hidden");
      if (open) {
        aiPanel.removeAttribute("hidden");
        if (aiMessages && !aiMessages.childElementCount) {
          aiAddMessage("bot", "\uC548\uB155! \uD558\uACE0 \uC2F6\uC740 \uC77C\uC744 \uC801\uC5B4\uC918. \uC608: <em>\uC55E\uC73C\uB85C 3\uCD08 \uAC00\uACE0 \uB3C4\uB808\uBBF8 \uC6B8\uB824\uC918</em>");
        }
        setTimeout(() => aiInput == null ? void 0 : aiInput.focus(), 0);
      } else {
        aiPanel.setAttribute("hidden", "");
      }
      updateMobileBottomNav();
      (_b2 = (_a2 = e.currentTarget) == null ? void 0 : _a2.blur) == null ? void 0 : _b2.call(_a2);
    });
    (_i = document.getElementById("aiCloseButton")) == null ? void 0 : _i.addEventListener("click", (e) => {
      var _a2, _b2;
      aiPanel == null ? void 0 : aiPanel.setAttribute("hidden", "");
      updateMobileBottomNav();
      (_b2 = (_a2 = e.currentTarget) == null ? void 0 : _a2.blur) == null ? void 0 : _b2.call(_a2);
    });
    aiForm == null ? void 0 : aiForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = aiInput.value;
      aiInput.value = "";
      aiHandle(text);
    });
    document.querySelectorAll(".ai-chip").forEach((chip) => {
      chip.addEventListener("click", () => aiHandle(chip.textContent));
    });
    window.addEventListener("message", async (event) => {
      const data = event.data;
      if (!data || !data.type) return;
      if (data.type === "command") {
        const cmd = data.data;
        Logger.add(`[\uB300\uC2DC\uBCF4\uB4DC] ${cmd}`, "info");
        if (cmd === "STOP" || cmd === "STOP_ALL") {
          try {
            state.isExecuting = false;
            updateRunButtonUI();
            await BluetoothManager.emergencyStop(cmd);
            Logger.add("[\uBE44\uC0C1\uC815\uC9C0] \uBAA8\uB4E0 \uD558\uB4DC\uC6E8\uC5B4 \uC815\uC9C0 \uC644\uB8CC", "info");
          } catch (error) {
            Logger.add(`[\uC624\uB958] \uBE44\uC0C1 \uC815\uC9C0 \uC804\uC1A1 \uC2E4\uD328: ${error.message}`, "error");
          }
          return;
        }
        const needsResponse = cmd === "GET_SYS" || cmd === "GET_STATUS" || cmd === "GET_MODULES" || cmd === "GET_NAMES";
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await BluetoothManager.sendData(cmd, needsResponse);
            break;
          } catch (error) {
            if (attempt < 2 && error.message.includes("\uC2DC\uAC04 \uCD08\uACFC")) {
              Logger.add(`[\uC7AC\uC2DC\uB3C4] ${cmd} (${attempt}/2)`, "warning");
              await new Promise((r) => setTimeout(r, 300));
            } else {
              if (error.message.includes("\uC2DC\uAC04 \uCD08\uACFC")) {
                Logger.add(`[\uACBD\uACE0] \uC751\uB2F5 \uC5C6\uC74C: ${cmd}`, "warning");
              } else {
                Logger.add(`[\uC624\uB958] \uC804\uC1A1 \uC2E4\uD328: ${error.message}`, "error");
              }
            }
          }
        }
      }
      if (data.type === "exit_dashboard") {
        if (isDashboardVisible()) closeDashboard();
        return;
      }
      if (data.type === "log_toggle") {
        const logContainer = document.getElementById("logContainer");
        const STORAGE_KEY = "ares.log.visible";
        if (logContainer) {
          document.body.classList.toggle("log-hidden", !data.visible);
          try {
            localStorage.setItem(STORAGE_KEY, String(data.visible));
          } catch (e) {
          }
          try {
            Blockly.svgResize(ws);
          } catch (e) {
          }
          Logger.refresh();
        }
      }
    });
  }
  function main() {
    workspace = initializeBlockly();
    initializeAlwaysOnListeners();
    initializeMissionListeners(workspace);
    buildLessonSelect();
    const logContainer = document.getElementById("logContainer");
    const logHeader = document.getElementById("logHeader");
    setupLogToggle({
      logContainer,
      logHeader,
      onToggle: () => {
        Logger.refresh();
        updateMobileBottomNav();
      }
    });
    setContentMode = setupContentToggle({
      btn: document.getElementById("contentToggleBtn"),
      view: document.getElementById("missionView"),
      workspace,
      getMode: () => _contentMode,
      setMode: (mode) => {
        var _a;
        const wasSimulation = _contentMode === "simulation";
        _contentMode = mode;
        if (wasSimulation && mode !== "simulation" && simController) {
          if ((_a = simController.isSimRunning) == null ? void 0 : _a.call(simController)) {
            Logger.add("[\uBE44\uC0C1\uC815\uC9C0] \uBAA8\uB4DC \uC804\uD658 \u2014 \uC9C4\uD589 \uC911\uC774\uB358 \uC2DC\uBBAC\uB808\uC774\uC158\uC744 \uC911\uB2E8\uD569\uB2C8\uB2E4", "error");
          }
          simController.close();
        }
        if (mode === "simulation") syncSimCodeWidget == null ? void 0 : syncSimCodeWidget();
      },
      getSimController: () => simController,
      updateBlockCodingButtonUI: () => refreshBlockCodingButtonUI()
    });
    bindMobileBottomNav();
    simController = setupSimulation({
      workspace,
      onOpen: () => {
        if (_contentMode !== "simulation") _preSimMode = _contentMode;
        if (setContentMode) setContentMode("simulation");
      },
      onClose: () => {
        if (_contentMode !== "simulation") return;
        if (setContentMode) setContentMode("coding");
      }
    });
    BluetoothManager.updateConnectionStatus(false);
    refreshBlockCodingButtonUI();
    updateMobileBottomNav();
    Logger.add("[\uC2DC\uC791] ARES \uC900\uBE44 \uC644\uB8CC - BLE \uC5F0\uACB0\uC744 \uC2DC\uC791\uD558\uC138\uC694", "info");
    Logger.refresh();
    applyRoute();
  }
  if (window.__ARES_MOBILE_FRAME__) {
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
