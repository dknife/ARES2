// Simulation_AresRobot.js
// Subsystem wrapper for the Ares Albi Robot (albi) topic, reusing the modular LedsSubsystem.

import { Simulation_Base } from './Simulation_Base.js';
import { createAlbiLedObject, createAlbiModelObject } from '../Sim_Parts/object_factory.js';

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

export async function createSpawnedAlbiObjects(ctx) {
  const THREE = ctx.THREE;
  const gltf = await new Promise((resolve, reject) => {
    const loader = new ctx.A.GLTFLoader();
    const md = window.MeshoptDecoder;
    if (md) loader.setMeshoptDecoder(md);
    loader.load('Mesh/AlbiStaticLow.glb', resolve, undefined, reject);
  });
  const model = gltf.scene;

  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.frustumCulled = false;
  });

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

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
    this.eyeL = null;
    this.eyeR = null;
    this.chestLed = null;
  }

  init() {
    this.loadAndSetupModel(this.ctx.cfg, (root) => {
      const cfg = this.ctx.cfg;
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
        root.add(this.eyeL.group, this.eyeR.group);
      }

      if (chest) {
        const chestGlow = this.leds.createGlowTexture(CHEST_PALETTE.glowStops);
        this.chestLed = this.leds.register('chest', this.leds.createMeshLed({
          radius: chest.radius,
          pos: chest.pos,
          palette: CHEST_PALETTE,
          glowTex: chestGlow,
        }));
        root.add(this.chestLed.group);
      }

      this.ctx.objects.add(createAlbiModelObject(this.ctx, root, cfg.label || 'Albi Body'), this.ctx.scene);
      if (this.eyeL) {
        this.ctx.objects.add(createAlbiLedObject(this.ctx, this.eyeL, 'Albi Eye L LED', 'eye-l'), root);
      }
      if (this.eyeR) {
        this.ctx.objects.add(createAlbiLedObject(this.ctx, this.eyeR, 'Albi Eye R LED', 'eye-r'), root);
      }
      if (this.chestLed) {
        this.ctx.objects.add(createAlbiLedObject(this.ctx, this.chestLed, 'Albi Chest LED', 'chest'), root);
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
