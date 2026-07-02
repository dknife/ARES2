// Simulation_Main.js
// Subsystem orchestrator for 3D simulations, delegating to the modular Sim_Parts library.

import { Context } from '../Sim_Parts/context.js';
import { TOPICS, TOPIC_ORDER, DEFAULT_TOPIC, MISSION_TOPIC, defaultTopicForMission, OLED_ICONS } from '../Sim_Parts/topics.js';
import { Rocket } from '../Sim_Parts/rocket.js';
import { Audio } from '../Sim_Parts/audio.js';

import { Simulation_Rover } from './Simulation_Rover.js';
import { Simulation_Launcher } from './Simulation_Launcher.js';
import { Simulation_Traffic } from './Simulation_Traffic.js';
import { Simulation_AresRobot } from './Simulation_AresRobot.js';

export class Simulation_Main {
  // Topic metadata and OLED icons constants
  static TOPICS = TOPICS;
  static TOPIC_ORDER = TOPIC_ORDER;
  static DEFAULT_TOPIC = DEFAULT_TOPIC;
  static MISSION_TOPIC = MISSION_TOPIC;
  static OLED_ICONS = OLED_ICONS;

  // Delegated static helpers
  static playRocketLaunch = Audio.playRocketLaunch;
  static playGunFire = Audio.playGunFire;
  static recolorLaunchpadAntenna = Rocket.recolorAntenna;
  static defaultTopicForMission = defaultTopicForMission;

  // Factory method to initialize Context and build the matching Simulation subclass instance
  static buildSim(THREE, A, stage, loadingEl, cfg, options = {}) {
    const ctx = new Context(THREE, A, stage, loadingEl, cfg, options);

    if (cfg.parts) {
      return new Simulation_Rover(ctx);
    } else if (cfg.traffic) {
      return new Simulation_Traffic(ctx);
    } else if (cfg.launch) {
      return new Simulation_Launcher(ctx);
    } else {
      return new Simulation_AresRobot(ctx);
    }
  }
}

export {
  TOPICS,
  TOPIC_ORDER,
  DEFAULT_TOPIC,
  MISSION_TOPIC,
  defaultTopicForMission,
  OLED_ICONS
};