// Simulation_AresRobot.js
// Subsystem wrapper for the Ares Albi Robot (albi) topic, reusing the modular LedsSubsystem.

import { Simulation_Base } from './Simulation_Base.js';
import { SimulationObject } from '../Sim_Parts/sim_object.js';

export const DEFAULT_ALBI_EYES = {
  radius: 0.11,
  left: [0.145, 0.375, 0.12],
  right: [-0.145, 0.375, 0.12],
};

export const DEFAULT_ALBI_CHEST = {
  radius: 0.07,
  pos: [0, -0.10, 0.135],
};

export const EYE_PALETTE = {
  sphereBase: 0x0c2a18,
  emissive: 0x00ff66,
  glowStops: ['rgba(180,255,210,1)', 'rgba(40,255,120,0.65)', 'rgba(0,255,90,0)'],
  glowTint: 0x55ff99,
  lightColor: 0x33ff77,
};

export const CHEST_PALETTE = {
  sphereBase: 0x2a0c0c,
  emissive: 0xff2030,
  glowStops: ['rgba(255,210,200,1)', 'rgba(255,60,40,0.65)', 'rgba(255,0,0,0)'],
  glowTint: 0xff5566,
  lightColor: 0xff3344,
};

function centerModelOnGround(THREE, root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
}

function createAlbiModelObject(ctx, root, label = 'Albi Body', options = {}) {
  return new SimulationObject({
    id: ctx.objects?.makeId('albi-body') || `albi-body-${Date.now()}`,
    type: 'albi-body',
    label,
    root,
    spawned: !!options.spawned,
    metadata: { modelRole: 'body' },
  });
}

function createAlbiLedObject(ctx, led, label, role, options = {}) {
  return new SimulationObject({
    id: ctx.objects?.makeId(`albi-${role}`) || `albi-${role}-${Date.now()}`,
    type: 'albi-led',
    label,
    root: led.group,
    spawned: !!options.spawned,
    metadata: {
      led,
      role,
      modelRole: 'led',
    },
  });
}

export async function createSpawnedAlbiObjects(ctx) {
  const THREE = ctx.THREE;
  const model = await new Promise((resolve, reject) => {
    ctx.assets.loadModel('Mesh/AlbiRobot/AlbiRobot.min.glb', resolve, reject);
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
    createAlbiModelObject(ctx, holder, 'Spawned Albi Body', { spawned: true }),
    createAlbiLedObject(ctx, eyeL, 'Spawned Albi Eye L LED', 'eye-l', { spawned: true }),
    createAlbiLedObject(ctx, eyeR, 'Spawned Albi Eye R LED', 'eye-r', { spawned: true }),
    createAlbiLedObject(ctx, chest, 'Spawned Albi Chest LED', 'chest', { spawned: true }),
  ];
}

export class Simulation_AresRobot extends Simulation_Base {
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

    // 빈 씬(개발자 모드): 모델 없이 기본 카메라 프레이밍만 하고 로딩 표시를 닫는다.
    if (!cfg.model) {
      ctx.frame(0.6, 4.2);
      if (ctx.loadingEl) ctx.loadingEl.style.display = 'none';
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
        this.eyeL = this.leds.register('eye-l', this.leds.createMeshLed({
          radius: eyes.radius,
          pos: eyes.left,
          palette: EYE_PALETTE,
          glowTex: eyeGlow,
        }));
        this.eyeR = this.leds.register('eye-r', this.leds.createMeshLed({
          radius: eyes.radius,
          pos: eyes.right,
          palette: EYE_PALETTE,
          glowTex: eyeGlow,
        }));
        this.albiGroup.add(this.eyeL.group, this.eyeR.group);
      }

      if (chest) {
        const chestGlow = this.leds.createGlowTexture(CHEST_PALETTE.glowStops);
        this.chestLed = this.leds.register('chest', this.leds.createMeshLed({
          radius: chest.radius,
          pos: chest.pos,
          palette: CHEST_PALETTE,
          glowTex: chestGlow,
        }));
        this.albiGroup.add(this.chestLed.group);
      }

      ctx.objects.add(createAlbiModelObject(ctx, this.albiGroup, cfg.label || 'Albi Body'), ctx.scene);
      if (this.eyeL) {
        ctx.objects.add(createAlbiLedObject(ctx, this.eyeL, 'Albi Eye L LED', 'eye-l'), this.albiGroup);
      }
      if (this.eyeR) {
        ctx.objects.add(createAlbiLedObject(ctx, this.eyeR, 'Albi Eye R LED', 'eye-r'), this.albiGroup);
      }
      if (this.chestLed) {
        ctx.objects.add(createAlbiLedObject(ctx, this.chestLed, 'Albi Chest LED', 'chest'), this.albiGroup);
      }

      const box = new THREE.Box3().setFromObject(this.albiGroup);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = ctx.camera.fov * Math.PI / 180;
      ctx.frame(size.y * 0.55, (maxDim / 2) / Math.tan(fov / 2) * 1.9);
      if (ctx.loadingEl && !ctx.disposed) ctx.loadingEl.style.display = 'none';
    }, () => {
      if (ctx.loadingEl && !ctx.disposed) {
        ctx.loadingEl.textContent = '모델을 불러오지 못했어요';
      }
    });
  }

  // Control Methods
  get hasEyes() { return !!(this.eyeL && this.eyeR); }
  get hasChest() { return !!this.chestLed; }

  setEye(side, val) {
    this.leds.set(side === 'L' ? 'eye-l' : 'eye-r', val);
  }

  setChest(val) {
    this.leds.set('chest', val);
  }
}
