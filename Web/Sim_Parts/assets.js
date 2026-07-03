// Web/Sim_Parts/assets.js
// GLTF asset loading, model bounding box centering, and multi-part placement.

import { recolorAntenna } from './rocket.js';
import { createAlbiLedObject, createAlbiModelObject } from './object_factory.js';

export function makeGLTFLoader(A) {
  const loader = new A.GLTFLoader();
  const md = window.MeshoptDecoder;
  if (md) loader.setMeshoptDecoder(md);
  return loader;
}

export class Assets {
  constructor(ctx) {
    this.ctx = ctx;
  }

  // Create a standard GLTF loader using ARES3 context
  makeLoader() {
    return makeGLTFLoader(this.ctx.A);
  }

  // Load a single GLTF model and apply standard shadow settings
  loadModel(url, onLoad, onError) {
    const loader = this.makeLoader();
    loader.load(
      url,
      (gltf) => {
        if (this.ctx.disposed) {
          this.disposeGltf(gltf);
          return;
        }
        const root = gltf.scene;
        root.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
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

        if (cfg.eyes || cfg.chest) {
          this.ctx.objects.add(createAlbiModelObject(this.ctx, root, cfg.label || 'Albi Body'), scene);
          if (this.ctx.leds.eyeL) {
            this.ctx.objects.add(createAlbiLedObject(this.ctx, this.ctx.leds.eyeL, 'Albi Eye L LED', 'eye-l'), root);
          }
          if (this.ctx.leds.eyeR) {
            this.ctx.objects.add(createAlbiLedObject(this.ctx, this.ctx.leds.eyeR, 'Albi Eye R LED', 'eye-r'), root);
          }
          if (this.ctx.leds.chestLed) {
            this.ctx.objects.add(createAlbiLedObject(this.ctx, this.ctx.leds.chestLed, 'Albi Chest LED', 'chest'), root);
          }
        } else {
          scene.add(root);
          this.ctx.editor?.register(root, cfg.label || 'Model');
        }

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
          this.ctx.editor?.register(box, `Obstacle ${i + 1}`);
        }
        scene.add(this.ctx.worldGroup);
        this.ctx.editor?.register(this.ctx.worldGroup, 'Rover World');

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
        if (onLoad) onLoad(root);
      },
      undefined,
      (err) => {
        console.error('모델 로드 실패:', url, err);
        if (onError) onError(err);
      }
    );
  }

  // Load multiple GLTF models concurrently (used for multi-part rovers, etc.)
  loadModels(urls, onPartLoad, onComplete, onError) {
    const loader = this.makeLoader();
    let remaining = urls.length;
    if (remaining === 0) {
      if (onComplete) onComplete();
      return;
    }

    urls.forEach((url) => {
      loader.load(
        url,
        (gltf) => {
          if (this.ctx.disposed) {
            this.disposeGltf(gltf);
            return;
          }
          const root = gltf.scene;
          root.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              o.frustumCulled = false;
            }
          });

          if (onPartLoad) onPartLoad(url, root);

          remaining--;
          if (remaining === 0 && onComplete) {
            onComplete();
          }
        },
        undefined,
        (err) => {
          console.error('부속 모델 로드 실패:', url, err);
          if (onError) onError(url, err);
          remaining--;
          if (remaining === 0 && onComplete) {
            onComplete();
          }
        }
      );
    });
  }

  // Properly dispose GLTF geometries and materials to avoid RAM leaks
  disposeGltf(gltf) {
    gltf.scene.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => {
          mm?.map?.dispose?.();
          mm?.dispose?.();
        });
      }
    });
  }
}
