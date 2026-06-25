// Simulation_Main.js
// Common entry and orchestrator for the 3D Simulation.

import { initAresRobot } from './Simulation_AresRobot.js';
import { initLauncher, playRocketLaunch, recolorLaunchpadAntenna } from './Simulation_Launcher.js';
import { initRover, playGunFire } from './Simulation_Rover.js';
import { initTraffic } from './Simulation_Traffic.js';

// Constants
export const TOPICS = {
  albi:      { label: '알비와 함께',   model: 'Mesh/AlbiStaticLow.glb', eyes: { radius: 0.11, left: [0.145, 0.375, 0.12], right: [-0.145, 0.375, 0.12] }, chest: { radius: 0.07, pos: [0, -0.10, 0.135] } },
  traffic:   { label: '우주 신호등',   model: 'Mesh/LampBox.glb',       eyes: null, traffic: { lamp: 'Mesh/LampGeneral.glb', hands: ['Mesh/LampHand1.glb', 'Mesh/LampHand2.glb', 'Mesh/LampHand3.glb'], count: 3 } },
  launchpad: { label: '발사대', model: 'Mesh/LaunchStation.glb', eyes: null, postProcess: recolorLaunchpadAntenna, radar: true,
    launch: {
      stripCount: 5,
      stripRadius: 0.04,
      stripXFrac: 0.50,
      stripYRange: [0.4275, 0.09068625],
      stripZFrac: 0.80,
      torusRadius: 0.09,
      torusTube:   0.03,
      torusYOffset: -0.08,
    },
  },
  rover: { label: '로버', eyes: null, helpers: true, parts: [
    'Mesh/RoverParts/RoverBody.glb',
    'Mesh/RoverParts/RoverGun.glb',
    'Mesh/RoverParts/RoverHead.glb',
    'Mesh/RoverParts/RoverLED.glb',
    'Mesh/RoverParts/RoverOLED.glb',
    'Mesh/RoverParts/RoverRadar.glb',
    'Mesh/RoverParts/RoverWheel.glb',
  ] },
};

export const TOPIC_ORDER = ['albi', 'traffic', 'launchpad', 'rover'];
export const DEFAULT_TOPIC = 'albi';
export const MISSION_TOPIC = {};

export function defaultTopicForMission() {
  const l = document.getElementById('lessonSelect')?.value || '';
  const m = document.getElementById('missionSelect')?.value || '';
  return MISSION_TOPIC[`L${l}M${m}`] || DEFAULT_TOPIC;
}

export const OLED_ICONS = {
  rover: new Uint8Array([
    0x00,0x01,0xC0,0x00, 0x00,0x01,0xC0,0x00, 0x00,0x01,0xC0,0x00, 0x1F,0xFF,0xFF,0xF8,
    0x1F,0xFF,0xFF,0xF8, 0x1E,0x07,0xE0,0x78, 0x1E,0xE7,0xE7,0x78, 0x1E,0x17,0xE8,0x78,
    0x1E,0x07,0xE0,0x78, 0x1E,0x07,0xE0,0x78, 0x1C,0xFF,0xFF,0x38, 0x1F,0x7F,0xFE,0xF8,
    0x1F,0x8F,0xF1,0xF8, 0x1F,0xF0,0x0F,0xF8, 0x1E,0xFF,0xFF,0x78, 0x1E,0xFF,0xFF,0x78,
    0x1E,0xFF,0xFF,0x78, 0x00,0xFF,0x7F,0x00, 0x1F,0xFF,0x7F,0xF8, 0x1F,0xFC,0x9F,0xF8,
    0x1F,0xF9,0xCF,0xF8, 0x1F,0xF0,0x07,0xF8, 0x1F,0xE7,0xF3,0xF8, 0x1F,0xE7,0xF3,0xF8,
    0x1F,0xFF,0xFF,0xF8, 0x1F,0xFF,0xFF,0xF8, 0x1F,0xC0,0x03,0xF8, 0x1F,0xC0,0x03,0xF8,
    0x1F,0xC0,0x03,0xF8, 0x1F,0xC0,0x03,0xF8, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
  ]),
  mars: new Uint8Array([
    0x00,0x00,0x00,0x00, 0x0C,0x00,0x00,0x00, 0x0C,0x00,0x7E,0x00, 0x0C,0x01,0xFE,0x00,
    0x0C,0x03,0xFF,0x00, 0x06,0x07,0xFF,0x80, 0x03,0x0F,0xFF,0xC0, 0x00,0xFF,0xFF,0xE0,
    0x00,0x1F,0xFF,0xE0, 0x00,0x3F,0xFF,0xF0, 0x00,0x3F,0xFF,0xF0, 0x00,0x3E,0x01,0xF0,
    0x00,0x3C,0x00,0xF0, 0x00,0x3C,0x78,0x70, 0x00,0x3C,0xF8,0x70, 0x00,0x3C,0xF8,0x70,
    0x00,0x3C,0x78,0x70, 0x00,0x3C,0x00,0x70, 0x00,0x3C,0x00,0x70, 0x00,0x3C,0x00,0x70,
    0x00,0x3C,0x00,0x70, 0x00,0x3F,0xFF,0xF0, 0x00,0x3F,0xFF,0xF0, 0x00,0x1F,0xFF,0xE0,
    0x00,0x07,0xFF,0xC0, 0x00,0x03,0xFF,0x80, 0x00,0x01,0xFE,0x00, 0x00,0x00,0x7E,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
  ]),
  open_eye: new Uint8Array([
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0xFF,0xFF,0x00, 0x07,0x00,0x00,0xE0,
    0x18,0x00,0x00,0x18, 0x20,0x00,0x00,0x04, 0x40,0x00,0x00,0x02, 0x80,0x00,0x00,0x01,
    0x80,0x03,0xE0,0x01, 0x80,0x07,0xF0,0x01, 0x80,0x0F,0xF8,0x01, 0x80,0x0F,0xF8,0x01,
    0x80,0x0F,0xF8,0x01, 0x80,0x0F,0xF8,0x01, 0x80,0x07,0xF0,0x01, 0x80,0x03,0xE0,0x01,
    0x80,0x00,0x00,0x01, 0x40,0x00,0x00,0x02, 0x20,0x00,0x00,0x04, 0x18,0x00,0x00,0x18,
    0x07,0x00,0x00,0xE0, 0x00,0xFF,0xFF,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
  ]),
  closed_eye: new Uint8Array([
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x01,0xFF,0xFF,0x80, 0x07,0x00,0x00,0xE0, 0x18,0x00,0x00,0x18, 0x20,0x00,0x00,0x04,
    0x40,0x00,0x00,0x02, 0x80,0x00,0x00,0x01, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
  ]),
};

export function buildSim(THREE, A, stage, loadingEl, cfg, options = {}) {
  const { GLTFLoader, OrbitControls, RoomEnvironment } = A;
  const { logLine, ensureAudio, state } = options;

  function makeGLTFLoader() {
    const loader = new GLTFLoader();
    const md = window.MeshoptDecoder;
    if (md) loader.setMeshoptDecoder(md);
    return loader;
  }

  let disposed = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x32402f, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
  key.position.set(3, 6, 5); key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0003;
  key.shadow.camera.left = -55; key.shadow.camera.right = 55;
  key.shadow.camera.top = 55;   key.shadow.camera.bottom = -55;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 140;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  
  const fill = new THREE.DirectionalLight(0x9fc0f0, 0.5);
  fill.position.set(-4, 2, 4); scene.add(fill);
  
  const ground = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // Setup context object
  const ctx = {
    THREE,
    scene,
    camera,
    controls,
    cfg,
    loadingEl,
    get disposed() { return disposed; },
    worldGroup: null
  };

  // Subsystems
  const ares = (cfg.eyes || cfg.chest) ? initAresRobot(ctx) : null;
  const launcher = cfg.launch ? initLauncher(ctx) : null;
  const rover = cfg.parts ? initRover(ctx, makeGLTFLoader, OLED_ICONS) : null;
  const traffic = cfg.traffic ? initTraffic(ctx, makeGLTFLoader) : null;

  const frame = (cy, dist) => {
    camera.position.set(0, cy, dist);
    camera.near = dist / 100; camera.far = dist * 100; camera.updateProjectionMatrix();
    controls.target.set(0, cy, 0); controls.update();
  };

  if (cfg.model) {
    makeGLTFLoader().load(cfg.model, (gltf) => {
      if (disposed) {
        gltf.scene.traverse((o) => {
          if (o.isMesh || o.isSprite) {
            o.geometry?.dispose?.();
            const m = o.material;
            (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
          }
        });
        return;
      }
      const root = gltf.scene;
      let sz = new THREE.Vector3();
      let box = new THREE.Box3();
      let modelH = 0;
      
      if (!cfg.postProcess) {
        box.setFromObject(root);
        box.getSize(sz);
        const center = box.getCenter(new THREE.Vector3());
        root.position.sub(center);
        root.position.y += sz.y / 2;
        root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        box.setFromObject(root);
        box.getSize(sz);
        modelH = sz.y;
      } else {
        root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        box.setFromObject(root);
        box.getSize(sz);
        modelH = sz.y;
        cfg.postProcess(root, THREE);
      }

      // Attach model to subsystems
      if (ares) ares.attachToRoot(root);
      if (launcher) launcher.attachToRoot(root, box, sz);
      if (traffic) traffic.setupTraffic(root);

      scene.add(root);

      const maxDim = Math.max(sz.x, sz.y, sz.z);
      const fov = camera.fov * Math.PI / 180;
      frame(modelH * 0.55, (maxDim / 2) / Math.tan(fov / 2) * 1.9);
      if (loadingEl) loadingEl.style.display = 'none';
    }, undefined, (err) => {
      console.error('시뮬레이션 모델 로드 실패:', err);
      if (loadingEl && !disposed) loadingEl.textContent = '모델을 불러오지 못했어요 (HTTP 서버에서 실행해야 합니다)';
    });
  } else if (!cfg.parts) {
    const ph = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x5fa8e6, wireframe: true, transparent: true, opacity: 0.35 })
    );
    ph.position.y = 0.5;
    scene.add(ph);
    frame(0.5, 2.6);
    if (loadingEl) { loadingEl.style.display = ''; loadingEl.textContent = '🚧 준비 중인 시뮬레이션입니다 (빈 객체)'; }
  }

  function resize() {
    const w = stage.clientWidth || 360, h = stage.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();

  // Render loop update
  let lastRenderTime = 0;
  function render() {
    const nowSec = performance.now() * 0.001;
    const dt = lastRenderTime > 0 ? Math.min(0.1, nowSec - lastRenderTime) : 0.016;
    lastRenderTime = nowSec;
    controls.update();

    if (launcher) launcher.update(dt);
    if (rover) rover.update(dt);

    renderer.render(scene, camera);
  }

  function getAudioCtx() {
    if (ensureAudio) return ensureAudio();
    return null;
  }

  // Beep synthesis
  const playBeep = (hz, sec) => {
    if (!hz || sec <= 0) return;
    try {
      const audioCtx = getAudioCtx();
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = hz;
      o.connect(g); g.connect(audioCtx.destination);
      const t0 = audioCtx.currentTime;
      const t1 = t0 + sec;
      const VOL = 0.06;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(VOL, t0 + 0.005);
      g.gain.setValueAtTime(VOL, Math.max(t0 + 0.006, t1 - 0.01));
      g.gain.linearRampToValueAtTime(0, t1);
      o.start(t0); o.stop(t1 + 0.02);
    } catch (e) { console.warn('beep 실패:', e); }
  };

  const setLedByNum = (num, intensity) => {
    if (ares && ares.hasEyes) {
      if (num === 1) ares.setEye('R', intensity);
      else if (num === 2) ares.setEye('L', intensity);
    } else if (traffic) {
      if (num >= 1 && num <= 3) traffic.setSlotOn(num - 1, intensity);
    } else if (launcher && launcher.hasLaunchLeds) {
      if (num >= 0 && num <= 5) launcher.setLaunchLed(num, intensity);
    } else if (rover && rover.hasRoverLeds) {
      if (num >= 0 && num <= 5) rover.setRoverLed(num, intensity);
    }
  };

  const setAllLedsOff = () => {
    if (ares) {
      if (ares.hasEyes) { ares.setEye('R', 0); ares.setEye('L', 0); }
      if (ares.hasChest) ares.setChest(0);
    }
    if (traffic) { traffic.setSlotOn(0, 0); traffic.setSlotOn(1, 0); traffic.setSlotOn(2, 0); }
    if (launcher && launcher.hasLaunchLeds) { for (let i = 0; i <= 5; i++) launcher.setLaunchLed(i, 0); }
    if (rover && rover.hasRoverLeds) { for (let i = 0; i <= 5; i++) rover.setRoverLed(i, 0); }
  };

  const applyTopicEffect = (cmd) => {
    if (cmd.startsWith('DISTANCE')) {
      if (!rover || !rover.hasDistanceSensor) return null;
      rover.setDistanceSensor(true);
      return () => { if (rover) rover.setDistanceSensor(false); };
    }
    if (cmd.startsWith('LED_ON,')) {
      const parts = cmd.split(',');
      const num = parseInt(parts[1], 10);
      const intensity = Math.max(0, Math.min(1, parseFloat(parts[2])));
      setLedByNum(num, intensity);
      return null;
    }
    if (cmd.startsWith('[') && cmd.endsWith(']')) {
      const values = cmd.slice(1, -1).trim().split(/\s+/);
      const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
      for (let i = 0; i <= 5; i++) {
        if (values.length > i) setLedByNum(i, toI(values[i]));
      }
      return null;
    }
    if (cmd.startsWith('LED_OFF,')) {
      const arg = cmd.split(',')[1];
      if (arg === 'ALL') setAllLedsOff();
      else setLedByNum(parseInt(arg, 10), 0);
      return null;
    }
    if (cmd.startsWith('BUZZER_ON,')) {
      const cleanups = [];
      if (ares && ares.hasChest) { ares.setChest(1); cleanups.push(() => { if (ares?.hasChest) ares.setChest(0); }); }
      if (launcher && launcher.hasLaunchWave) { launcher.setLaunchWave(true); cleanups.push(() => { if (launcher?.hasLaunchWave) launcher.setLaunchWave(false); }); }
      if (rover && rover.hasRoverWave) { rover.setRoverWave(true); cleanups.push(() => { if (rover?.hasRoverWave) rover.setRoverWave(false); }); }
      if (cleanups.length === 0) return null;
      const parts = cmd.split(',');
      const hz  = parseFloat(parts[1]) || 0;
      const sec = parseFloat(parts[2]) || 0;
      playBeep(hz, sec);
      return () => cleanups.forEach((fn) => fn());
    }
    if (cmd.startsWith('SERVO_tFORWARD,') || cmd.startsWith('SERVO_tBACKWARD,')) {
      if (!rover || !rover.hasServo) return null;
      const dir = cmd.startsWith('SERVO_tFORWARD,') ? 1 : -1;
      rover.setServoMove(true, dir);
      return () => { if (rover) rover.setServoMove(false); };
    }
    if (cmd.startsWith('SERVO_tLEFT,') || cmd.startsWith('SERVO_tRIGHT,')) {
      if (!rover || !rover.hasServo) return null;
      const dir = cmd.startsWith('SERVO_tLEFT,') ? 1 : -1;
      rover.setServoTurn(true, dir);
      return () => { if (rover) rover.setServoTurn(false); };
    }
    if (cmd === 'SERVO_FORWARD'  || cmd.startsWith('SERVO_FORWARD,'))  { if (rover && rover.hasServo) rover.setServoMove(true,  1); return null; }
    if (cmd === 'SERVO_BACKWARD' || cmd.startsWith('SERVO_BACKWARD,')) { if (rover && rover.hasServo) rover.setServoMove(true, -1); return null; }
    if (cmd === 'SERVO_LEFT'     || cmd.startsWith('SERVO_LEFT,'))     { if (rover && rover.hasServo) rover.setServoTurn(true,  1); return null; }
    if (cmd === 'SERVO_RIGHT'    || cmd.startsWith('SERVO_RIGHT,'))    { if (rover && rover.hasServo) rover.setServoTurn(true, -1); return null; }
    if (cmd === 'SERVO_STOP'     || cmd.startsWith('SERVO_STOP,'))     { if (rover && rover.hasServo) rover.stopServo();           return null; }
    
    if (cmd.startsWith('DC_tFORWARD,') || cmd.startsWith('DC_tBACKWARD,')) {
      if (launcher && launcher.hasRadar) {
        const dir = cmd.startsWith('DC_tFORWARD,') ? 1 : -1;
        launcher.setRadar(true, dir);
        return () => { if (launcher) launcher.setRadar(false); };
      }
      if (rover && rover.hasRadar) {
        const dir = cmd.startsWith('DC_tFORWARD,') ? 1 : -1;
        rover.setRadar(true, dir);
        return () => { if (rover) rover.setRadar(false); };
      }
      return null;
    }
    if (cmd === 'DC_FORWARD'  || cmd.startsWith('DC_FORWARD,')) {
      if (launcher && launcher.hasRadar) launcher.setRadar(true,  1);
      if (rover && rover.hasRadar) rover.setRadar(true, 1);
      return null;
    }
    if (cmd === 'DC_BACKWARD' || cmd.startsWith('DC_BACKWARD,')) {
      if (launcher && launcher.hasRadar) launcher.setRadar(true, -1);
      if (rover && rover.hasRadar) rover.setRadar(true, -1);
      return null;
    }
    if (cmd === 'DC_STOP' || cmd.startsWith('DC_STOP,')) {
      if (launcher && launcher.hasRadar) launcher.setRadar(false);
      if (rover && rover.hasRadar) rover.setRadar(false);
      return null;
    }
    if (cmd === 'GUN_FIRE' || cmd.startsWith('GUN_FIRE,')) {
      if (launcher && launcher.hasRocket) { launcher.setRocketLaunch(true, false); playRocketLaunch(getAudioCtx()); }
      if (rover && rover.hasGun) { rover.setGunFire(); playGunFire(getAudioCtx()); }
      return null;
    }
    if (cmd === 'CLEAR_DISPLAY' || cmd.startsWith('CLEAR_DISPLAY')) {
      if (rover && rover.hasOled) rover.oledClear();
      return null;
    }
    if (cmd.startsWith('CLEAR_RECT,')) {
      if (!rover || !rover.hasOled) return null;
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const w = parseInt(parts[3], 10) || 0;
      const h = parseInt(parts[4], 10) || 0;
      rover.oledClearRect(x, y, w, h);
      return null;
    }
    if (cmd.startsWith('MSG,')) {
      if (!rover || !rover.hasOled) return null;
      rover.oledClear();
      let rem = cmd.slice(4) || 'Hello';
      const MAX_CHARS = 16;
      const LINE_H = 8;
      for (let yp = 0; rem && yp < 64; yp += LINE_H) {
        rover.oledText(0, yp, rem.slice(0, MAX_CHARS));
        rem = rem.slice(MAX_CHARS);
      }
      return null;
    }
    if (cmd.startsWith('MSG_XY,')) {
      if (!rover || !rover.hasOled) return null;
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const text = parts.slice(3).join(',') || 'Hello';
      rover.oledText(x, y, text);
      return null;
    }
    if (cmd.startsWith('ICON,')) {
      if (!rover || !rover.hasOled) return null;
      const parts = cmd.split(',');
      const name = (parts[1] || '').trim().toLowerCase();
      const x = parseInt(parts[2], 10) || 0;
      const y = parseInt(parts[3], 10) || 0;
      rover.oledIcon(name, x, y);
      return null;
    }
    return null;
  };

  const commandHoldSeconds = (c) => {
    const head = c.split(',')[0];
    const parts = c.split(',');
    if (c.startsWith('BATCH;')) {
      return c.slice('BATCH;'.length).split('|').reduce((s, sub) => s + commandHoldSeconds(sub), 0);
    }
    if (head === 'SLEEP')                          return parseFloat(parts[1]) || 0;
    if (head === 'BUZZER_ON')                      return parseFloat(parts[2]) || 0;
    if (head === 'SERVO_tFORWARD'  || head === 'SERVO_tBACKWARD' ||
        head === 'SERVO_tLEFT'     || head === 'SERVO_tRIGHT')   return parseFloat(parts[1]) || 0;
    if (head === 'DC_tFORWARD'     || head === 'DC_tBACKWARD')   return parseFloat(parts[1]) || 0;
    return 0;
  };

  let activeWaitCancel = null;
  const wait = (ms) => new Promise((resolve) => {
    const id = setTimeout(() => { activeWaitCancel = null; resolve(); }, ms);
    activeWaitCancel = () => { clearTimeout(id); activeWaitCancel = null; resolve(); };
  });

  const simSink = async (command, waitForResponse) => {
    const ackMs = waitForResponse ? 100 : 20;
    logLine(`→ ${command}`, waitForResponse ? 'tx-ack' : 'tx');
    let holdMs = 0;
    let distMeasured = null;
    if (command.startsWith('BATCH;')) {
      await wait(ackMs);
      const subs = command.slice('BATCH;'.length).split('|').filter((s) => s.length > 0);
      for (const sub of subs) {
        if (!state.isExecuting) break;
        const subHoldMs = Math.round(commandHoldSeconds(sub) * 1000);
        const cleanup = applyTopicEffect(sub);
        if (subHoldMs > 0) await wait(subHoldMs);
        cleanup?.();
        holdMs += subHoldMs;
      }
    } else {
      holdMs = Math.round(commandHoldSeconds(command) * 1000);
      const cleanup = applyTopicEffect(command);
      await wait(ackMs + holdMs);
      if (command.startsWith('DISTANCE') && rover && rover.hasDistanceSensor) distMeasured = rover.measureDistance();
      cleanup?.();
    }
    const total = ackMs + holdMs;
    let reply = '1';
    if (command.startsWith('DISTANCE')) reply = `DIST:${distMeasured != null ? distMeasured : 30}`;
    else if (command.startsWith('MAGNET')) reply = 'MAG:0';
    const holdNote = holdMs > 0 ? ` + 대기 ${holdMs}ms` : '';
    logLine(`     ↩ ${reply}  (+${total}ms, ${waitForResponse ? 'Ack' : '비Ack'}${holdNote})`, 'rx');
    return reply;
  };

  function dispose() {
    disposed = true;
    try { controls.dispose(); } catch {}
    
    // Subsystem disposers
    if (ares) ares.dispose();
    if (launcher) launcher.dispose();
    if (rover) rover.dispose();
    if (traffic) traffic.dispose();

    scene.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
      }
    });

    try {
      scene.environment?.dispose?.();
      scene.environment = null;
      pmrem.dispose();
    } catch {}
    try { renderer.dispose(); } catch {}
    try { renderer.forceContextLoss?.(); } catch {}
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  // Construct standard API object returned from buildSim
  const api = {
    render, resize, dispose,
    
    // Ares / Albi
    get hasEyes() { return ares ? ares.hasEyes : false; },
    get eyeL() { return ares ? ares.eyeL : null; },
    get eyeR() { return ares ? ares.eyeR : null; },
    setEye(side, val) { if (ares) ares.setEye(side, val); },
    get hasChest() { return ares ? ares.hasChest : false; },
    get chestLed() { return ares ? ares.chestLed : null; },
    setChest(val) { if (ares) ares.setChest(val); },
    
    // Launcher / Launchpad
    get hasLaunchLeds() { return launcher ? launcher.hasLaunchLeds : false; },
    get launchLeds() { return launcher ? launcher.launchLeds : null; },
    setLaunchLed(i, val) { if (launcher) launcher.setLaunchLed(i, val); },
    get hasLaunchWave() { return launcher ? launcher.hasLaunchWave : false; },
    setLaunchWave(val) { if (launcher) launcher.setLaunchWave(val); },
    get hasRocket() { return launcher ? launcher.hasRocket : false; },
    get rocketLaunchOn() { return launcher ? launcher.rocketLaunchOn : false; },
    get rocketAtRest() { return launcher ? launcher.rocketAtRest : true; },
    setRocketLaunch(on, follow) { if (launcher) launcher.setRocketLaunch(on, follow); },

    // Traffic light
    get hasTraffic() { return traffic ? traffic.hasTraffic : false; },
    placeLamps() { if (traffic) traffic.placeLamps(); },
    placeHands() { if (traffic) traffic.placeHands(); },
    resetTraffic() { if (traffic) traffic.resetTraffic(); },
    toggleSlot(idx) { if (traffic) traffic.toggleSlot(idx); },
    setSlot(idx, val) { if (traffic) traffic.setSlotOn(idx, val); },

    // Rover specific
    get hasRoverLeds() { return rover ? rover.hasRoverLeds : false; },
    setRoverLed(num, val) { if (rover) rover.setRoverLed(num, val); },
    get hasServo() { return rover ? rover.hasServo : false; },
    setServoMove(on, dir) { if (rover) rover.setServoMove(on, dir); },
    setServoTurn(on, dir) { if (rover) rover.setServoTurn(on, dir); },
    stopServo() { if (rover) rover.stopServo(); },
    get servoActive() { return rover ? rover.servoActive : false; },
    get hasDistanceSensor() { return rover ? rover.hasDistanceSensor : false; },
    setDistanceSensor(on) { if (rover) rover.setDistanceSensor(on); },
    measureDistance() { return rover ? rover.measureDistance() : 999; },
    get hasBoxes() { return rover ? rover.hasBoxes : false; },
    respawnBoxes() {
      if (rover) rover.respawnBoxes();
      // Also allow respawning boxes if in helper mode but rover didn't handle it
    },
    get obstaclesOn() { return rover ? rover.obstaclesOn : true; },
    setObstacles(on) { if (rover) rover.setObstacles(on); },
    get hasRoverWave() { return rover ? rover.hasRoverWave : false; },
    setRoverWave(on) { if (rover) rover.setRoverWave(on); },
    get hasOled() { return rover ? rover.hasOled : false; },
    oledClear() { if (rover) rover.oledClear(); },
    oledClearRect(x, y, w, h) { if (rover) rover.oledClearRect(x, y, w, h); },
    oledText(x, y, text) { if (rover) rover.oledText(x, y, text); },
    oledIcon(name, x, y) { if (rover) rover.oledIcon(name, x, y); },
    get hasGun() { return rover ? rover.hasGun : false; },
    setGunFire() { if (rover) rover.setGunFire(); },

    // Common/Radar
    get hasRadar() {
      if (launcher && launcher.hasRadar) return true;
      if (rover && rover.hasRadar) return true;
      return false;
    },
    get radarOn() {
      if (launcher) return launcher.radarOn;
      if (rover) return rover.radarOn;
      return false;
    },
    setRadar(on, dir) {
      if (launcher) launcher.setRadar(on, dir);
      if (rover) rover.setRadar(on, dir);
    },

    get hasGrids() { return !!ctx.worldGroup; }, // Grid representation
    toggleGrids() {
      const grids = scene.getObjectByProperty('type', 'Group'); // find grids group
      const planeGridsGroup = scene.children.find(o => o.children && o.children.length === 3 && o.children[0].type === 'GridHelper');
      if (planeGridsGroup) {
        planeGridsGroup.visible = !planeGridsGroup.visible;
        return planeGridsGroup.visible;
      }
      return false;
    },

    // Execution engine API
    simSink,
    cancelActiveWait() { if (activeWaitCancel) activeWaitCancel(); },
    playRocketLaunch() { playRocketLaunch(getAudioCtx()); },
    playGunFire() { playGunFire(getAudioCtx()); }
  };

  return api;
}