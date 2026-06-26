// Simulation_Main.js
// Subsystem orchestrator for 3D simulations, delegating to the modular Sim_Parts library.

import { buildSim as baseBuildSim } from '../Sim_Parts/context.js';
import { TOPICS, TOPIC_ORDER, DEFAULT_TOPIC, MISSION_TOPIC, defaultTopicForMission, OLED_ICONS } from '../Sim_Parts/topics.js';
import { playRocketLaunch, playGunFire } from '../Sim_Parts/audio.js';
import { recolorAntenna as recolorLaunchpadAntenna } from '../Sim_Parts/rocket.js';

export function buildSim(THREE, A, stage, loadingEl, cfg, options = {}) {
  return baseBuildSim(THREE, A, stage, loadingEl, cfg, options);
}

export {
  TOPICS,
  TOPIC_ORDER,
  DEFAULT_TOPIC,
  MISSION_TOPIC,
  defaultTopicForMission,
  OLED_ICONS,
  playRocketLaunch,
  playGunFire,
  recolorLaunchpadAntenna
};