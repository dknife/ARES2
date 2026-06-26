// Web/Sim_Parts/assets.js
// GLTF asset loading, model bounding box centering, and multi-part placement.

import { recolorAntenna } from './rocket.js';

export function makeGLTFLoader(A) {
  const loader = new A.GLTFLoader();
  const md = window.MeshoptDecoder;
  if (md) loader.setMeshoptDecoder(md);
  return loader;
}

export class AssetLoader {
  constructor(ctx) {
    this.ctx = ctx;
  }

  loadAssets() {
    const THREE = this.ctx.THREE;
    const A = this.ctx.A;
    const cfg = this.ctx.cfg;
    const scene = this.ctx.scene;

    // Base setup of LEDs
    this.ctx.leds.init(cfg.eyes, cfg.chest, cfg.launch);

    if (cfg.model) {
      makeGLTFLoader(A).load(cfg.model, (gltf) => {
        if (this.ctx.disposed) {
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

        root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        box.setFromObject(root);
        box.getSize(sz);
        const c = box.getCenter(new THREE.Vector3());
        root.position.x -= c.x;
        root.position.z -= c.z;
        root.position.y -= box.min.y;
        modelH = sz.y;

        if (cfg.postProcess || cfg.label === '발사대') {
          recolorAntenna(root, THREE);
        }

        // Attach Albi eye/chest LEDs if available
        if (this.ctx.leds) {
          if (this.ctx.leds.eyeL) root.add(this.ctx.leds.eyeL.group);
          if (this.ctx.leds.eyeR) root.add(this.ctx.leds.eyeR.group);
          if (this.ctx.leds.chestLed) root.add(this.ctx.leds.chestLed.group);
        }

        // Attach Launchpad elements if available
        const LAUNCH = cfg.launch;
        if (LAUNCH && this.ctx.leds) {
          this.ctx.waves.launchFootprintSize = Math.max(sz.x, sz.z);
          const lx = box.min.x + sz.x * LAUNCH.stripXFrac;
          const lz = box.min.z + sz.z * LAUNCH.stripZFrac;
          const yTop = box.min.y + sz.y * LAUNCH.stripYRange[0];
          const yBot = box.min.y + sz.y * LAUNCH.stripYRange[1];
          const n = LAUNCH.stripCount;
          for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : i / (n - 1);
            const ly = yTop + (yBot - yTop) * t;
            const led = this.ctx.leds.makeLed(LAUNCH.stripRadius, [lx, ly, lz], THREE.simPalettes?.launchStrip || {
              sphereBase: 0x031a0a, emissive: 0x00ff33, glowTint: 0x00ff44, lightColor: 0x00ff44,
              intensityScale: 0.12, opacityOn: 0.99, glowScale: 0.55
            }, this.ctx.leds.launchStripGlowTex);
            root.add(led.group);
            this.ctx.leds.launchLeds[i + 1] = led;
          }
          
          const rb = root.userData.rocketBottomLocal;
          const rmesh = root.userData.rocketMeshRef;
          if (rb && rmesh) {
            const torusGeom = new THREE.TorusGeometry(LAUNCH.torusRadius, LAUNCH.torusTube, 16, 48);
            torusGeom.rotateX(Math.PI / 2);
            const led0 = this.ctx.leds.makeLed(LAUNCH.torusRadius, [rb.x, rb.y + LAUNCH.torusYOffset, rb.z], {
              sphereBase: 0x1f0204, emissive: 0xff0a1e, glowTint: 0xff1828, lightColor: 0xff1422,
              intensityScale: 0.45, opacityOn: 0.99, glowScale: 0.55
            }, this.ctx.leds.launchGlowTex, torusGeom);
            rmesh.add(led0.group);
            this.ctx.leds.launchLeds[0] = led0;
          }

          this.ctx.rocket.rocketGroup = root.userData.rocketGroup;
          this.ctx.rocket.rocketFlameSprite = root.userData.rocketFlameSprite;
          this.ctx.rocket.rocketFlameLight = root.userData.rocketFlameLight;
          this.ctx.rocket.rocketCentroidLocal = root.userData.rocketCentroidLocal;
          this.ctx.rocket.rocketMeshRef = root.userData.rocketMeshRef;
          this.ctx.rocket.rocketBottomLocal = root.userData.rocketBottomLocal;
          this.ctx.movement.antennaPivot = root.userData.antennaPivot;
        }

        // Attach traffic lights
        if (cfg.traffic) {
          this.ctx.traffic.setupTraffic(root, () => makeGLTFLoader(A), cfg.traffic);
        }

        scene.add(root);

        const maxDim = Math.max(sz.x, sz.y, sz.z);
        const fov = this.ctx.camera.fov * Math.PI / 180;
        this.ctx.frame(modelH * 0.55, (maxDim / 2) / Math.tan(fov / 2) * 1.9);
        if (this.ctx.loadingEl) this.ctx.loadingEl.style.display = 'none';
      }, undefined, (err) => {
        console.error('시뮬레이션 모델 로드 실패:', err);
        if (this.ctx.loadingEl && !this.ctx.disposed) this.ctx.loadingEl.textContent = '모델을 불러오지 못했어요';
      });
    } else if (cfg.parts) {
      const loader = makeGLTFLoader(A);
      const roverGroup = new THREE.Group();
      roverGroup.position.y = 0.4;
      scene.add(roverGroup);
      this.ctx.roverGroup = roverGroup;

      // Helper setups
      if (cfg.helpers) {
        const FLOOR_SIZE = 100;
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
          new THREE.MeshStandardMaterial({
            color: 0x3a3a3a, roughness: 0.95, metalness: 0.0,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
          }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.001;
        floor.receiveShadow = true;
        floor.renderOrder = -1;

        const grid = new THREE.GridHelper(FLOOR_SIZE, FLOOR_SIZE, 0x444444, 0x666666);
        grid.position.y = 0.002;
        
        this.ctx.worldGroup = new THREE.Group();
        this.ctx.worldGroup.add(floor, grid);
        
        const BOX_COUNT = 150;
        const boxGeom = new THREE.BoxGeometry(1, 2, 1);
        for (let i = 0; i < BOX_COUNT; i++) {
          let x = 0, z = 0;
          do {
            x = (Math.random() * 2 - 1) * 50;
            z = (Math.random() * 2 - 1) * 50;
          } while (Math.hypot(x, z) < 5);
          const box = new THREE.Mesh(
            boxGeom,
            new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.55, 0.5), roughness: 0.8, metalness: 0.0 }),
          );
          box.position.set(x, 1, z);
          box.castShadow = true;
          box.receiveShadow = true;
          this.ctx.worldGroup.add(box);
          this.ctx.movement.boxes.push(box);
        }
        scene.add(this.ctx.worldGroup);

        const axes = new THREE.AxesHelper(1);
        axes.position.y = 0.003;
        scene.add(axes);
        
        const makePlaneGrid = () => new THREE.GridHelper(2, 20, 0x888888, 0x444466);
        const gridXZ = makePlaneGrid();
        const gridXY = makePlaneGrid(); gridXY.rotation.x = Math.PI / 2;
        const gridYZ = makePlaneGrid(); gridYZ.rotation.z = Math.PI / 2;
        this.ctx.planeGrids = new THREE.Group();
        this.ctx.planeGrids.add(gridXZ, gridXY, gridYZ);
        this.ctx.planeGrids.visible = false;
        scene.add(this.ctx.planeGrids);
      }

      // Setup sensor indicator balls
      {
        const LED_COUNT = 6, LED_X0 = -0.4, LED_X1 = 0.4, LED_Y = 0.4, LED_Z = 0.25, LED_R = 0.05;
        const step = (LED_X1 - LED_X0) / (LED_COUNT - 1);
        const ledGeom = new THREE.SphereGeometry(LED_R, 16, 12);
        for (let i = 0; i < LED_COUNT; i++) {
          const ball = new THREE.Mesh(
            ledGeom,
            new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
          );
          ball.position.set(LED_X0 + step * i, LED_Y, LED_Z);
          roverGroup.add(ball);
          this.ctx.leds.roverLeds.push(ball);
        }
        
        this.ctx.movement.magSensorBall = new THREE.Mesh(
          ledGeom,
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
        );
        this.ctx.movement.magSensorBall.position.set(0, -0.3, 0.9);
        roverGroup.add(this.ctx.movement.magSensorBall);

        [-0.22, 0.22].forEach((x) => {
          const ball = new THREE.Mesh(
            ledGeom,
            new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.4, metalness: 0.0 }),
          );
          ball.position.set(x, 0.58, 0.1);
          roverGroup.add(ball);
          this.ctx.movement.irSensorBalls.push(ball);
        });
      }

      // Multi-part loading
      let remaining = cfg.parts.length;
      cfg.parts.forEach((url) => {
        loader.load(url, (gltf) => {
          if (this.ctx.disposed) {
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
          if (!/RoverBody\.glb$/.test(url)) root.scale.setScalar(0.5);
          root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
          
          if (/RoverWheel\.glb$/.test(url)) {
            root.scale.multiplyScalar(0.8);
            this.ctx.movement.wheelR = root;
            this.ctx.movement.wheelL = root.clone();
            this.ctx.movement.wheelR.rotation.y = Math.PI / 2;
            this.ctx.movement.wheelL.rotation.y = Math.PI / 2;
            this.ctx.movement.wheelR.position.set( 0.7, 0, -0.3);
            this.ctx.movement.wheelL.position.set(-0.7, 0, -0.3);
            roverGroup.add(this.ctx.movement.wheelR, this.ctx.movement.wheelL);
          } else if (/RoverRadar\.glb$/.test(url)) {
            root.scale.multiplyScalar(0.5).multiplyScalar(0.8);
            root.position.set(0, 0.5, -0.9);
            this.ctx.movement.antennaPivot = root;
            roverGroup.add(root);
          } else if (/RoverLED\.glb$/.test(url)) {
            root.position.set(0, 0.35, 0.2);
            root.rotation.x = Math.PI / 4;
            roverGroup.add(root);
          } else if (/RoverHead\.glb$/.test(url)) {
            root.position.set(0, 0.6, -0.3);
            root.rotation.y = Math.PI;
            roverGroup.add(root);
          } else if (/RoverGun\.glb$/.test(url)) {
            root.position.set(0.55, 0.5, -0.5);
            root.rotation.y = Math.PI / 2;
            roverGroup.add(root);
            this.ctx.gun.gunMesh = root;
            {
              const bbox = new THREE.Box3().setFromObject(root);
              const size = bbox.getSize(new THREE.Vector3());
              const center = bbox.getCenter(new THREE.Vector3());
              let ax = 0;
              if (size.y > size.x && size.y > size.z) ax = 1;
              else if (size.z > size.x) ax = 2;
              const minV = bbox.min.getComponent(ax);
              const maxV = bbox.max.getComponent(ax);
              const muzzleEnd = Math.abs(maxV) > Math.abs(minV) ? minV : maxV;
              this.ctx.gun.muzzleWorldPos.copy(center);
              this.ctx.gun.muzzleWorldPos.setComponent(ax, muzzleEnd);
              this.ctx.gun.muzzleForward.set(0, 0, 0);
              this.ctx.gun.muzzleForward.setComponent(ax, Math.sign(muzzleEnd - center.getComponent(ax)) || -1);
            }
          } else if (/RoverOLED\.glb$/.test(url)) {
            root.position.set(0, 0.1, 0.5);
            root.rotation.x = -Math.PI / 6;
            {
              const probe = root.clone(true);
              probe.position.set(0, 0, 0); probe.rotation.set(0, 0, 0); probe.scale.set(1, 1, 1);
              const pbox = new THREE.Box3().setFromObject(probe);
              const psize = pbox.getSize(new THREE.Vector3());
              const pcenter = pbox.getCenter(new THREE.Vector3());
              
              this.ctx.oled.oledCanvas = document.createElement('canvas');
              this.ctx.oled.oledCanvas.width = 128 * 4;
              this.ctx.oled.oledCanvas.height = 64 * 4;
              this.ctx.oled.oledCtx = this.ctx.oled.oledCanvas.getContext('2d');
              
              this.ctx.oled.clear();
              this.ctx.oled.text(0, 0, 'ARES READY');

              this.ctx.oled.oledTex = new THREE.CanvasTexture(this.ctx.oled.oledCanvas);
              this.ctx.oled.oledTex.colorSpace = THREE.SRGBColorSpace;
              this.ctx.oled.oledTex.magFilter = THREE.NearestFilter;
              this.ctx.oled.oledTex.minFilter = THREE.NearestFilter;
              
              const w = psize.x * 0.85 * 0.95 * 0.95 * 0.9;
              const h = w * (this.ctx.oled.oledCanvas.height / this.ctx.oled.oledCanvas.width);
              const screen = new THREE.Mesh(
                new THREE.PlaneGeometry(w, h),
                new THREE.MeshBasicMaterial({ map: this.ctx.oled.oledTex, side: THREE.DoubleSide })
              );
              const pivot = new THREE.Group();
              pivot.position.set(pcenter.x, pcenter.y - h / 2, pbox.max.z + 0.001);
              pivot.rotation.x = -Math.PI / 12;
              screen.position.set(0, h / 2, 0);
              pivot.add(screen);
              root.add(pivot);
            }
            roverGroup.add(root);
          } else {
            roverGroup.add(root);
          }
          
          if (--remaining === 0 && this.ctx.loadingEl && !this.ctx.disposed) {
            this.ctx.loadingEl.style.display = 'none';
          }
        }, undefined, (err) => {
          console.error('부속 로드 실패:', url, err);
          if (--remaining === 0 && this.ctx.loadingEl && !this.ctx.disposed) {
            this.ctx.loadingEl.style.display = 'none';
          }
        });
      });
      this.ctx.frame(0.6, 2.8);
    }
  }
}
