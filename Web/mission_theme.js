// ============================================================
// 미션 목록 아이콘 매핑 — 디자인 시안 "미션P_색상가이드00" 기준
//   원본 아이콘: #UI시안/색상가이드/미션P_아이콘/  (1024² PNG)
//   → Web/assets/mission/ 에 96² 로 축소해 두었다(icon_ 접두어 제거).
// 차시별 색상(--acc/--surf/--soft)은 styles.css 하단 팔레트 블록에 있다.
// ============================================================

export const MISSION_ICON_BASE = 'assets/mission/';

/**
 * 차시 번호 → { badge, icon, missions[4] }
 *  badge   : 차시 번호 원형 배지
 *  icon    : 차시 대표 아이콘(헤더)
 *  missions: 미션 1~4 아이콘 (lesson.json 의 mission.id 순서)
 */
export const LESSON_THEME = {
  1:  { icon: 'no1_coding',     missions: ['no1_bulb', 'no1_mobile', 'no1_bluetooth', 'no1_mission-log'] },
  2:  { icon: 'no2_bulb1',      missions: ['no2_bulb2', 'no2_bulb3', 'no2_delay', 'no2_mainboard'] },
  3:  { icon: 'no3_palette',    missions: ['no3_bulb1', 'no3_bulb2', 'no3_surprised', 'no3_rhythm'] },
  4:  { icon: 'no4_sound1',     missions: ['no4_sound2', 'no4_siren', 'no4_meteor', 'no4_sos'] },
  5:  { icon: 'no5_bell',       missions: ['no5_repair', 'no5_traffic-light', 'no5_night', 'no5_siren'] },
  6:  { icon: 'no6_dice',       missions: ['no6_random', 'no6_minus', 'no6_win', 'no6_trophy'] },
  7:  { icon: 'no7_rotate',     missions: ['no7_rotate', 'no7_speed', 'no7_roulette', 'no7_mars'] },
  8:  { icon: 'no8_car',        missions: ['no8_forward', 'no8_backward', 'no8_speed', 'no8_track'] },
  9:  { icon: 'no9_launchpad',  missions: ['no9_assemble', 'no9_inspect', 'no9_launch-plan', 'no9_connect'] },
  10: { icon: 'no10_countdown', missions: ['no10_ready', 'no10_party', 'no10_countdown', 'no10_spotlight'] },
  11: { icon: 'no11_bell',      missions: ['no11_parallel', 'no11_system', 'no11_ceremony', 'no11_sound'] },
  12: { icon: 'no12_rocket',    missions: ['no12_final-check', 'no12_countdown', 'no12_rocket', 'no12_announce'] },
};

const iconUrl = (name) => `${MISSION_ICON_BASE}${name}.png`;

/** 차시 번호 배지 (없는 차시 = 보너스 → null) */
export function lessonBadgeIcon(n) {
  return LESSON_THEME[n] ? iconUrl(`no${n}`) : null;
}

/** 차시 대표 아이콘 */
export function lessonIcon(n) {
  const t = LESSON_THEME[n];
  return t ? iconUrl(t.icon) : null;
}

/** 미션 아이콘 (mission.id 는 1-base) */
export function missionIcon(n, missionId) {
  const t = LESSON_THEME[n];
  const name = t?.missions?.[missionId - 1];
  return name ? iconUrl(name) : null;
}

/** 진행 중 미션 표시용 ▶ 아이콘 (차시 색상으로 칠해져 있다) */
export function missionPlayIcon(n) {
  return LESSON_THEME[n] ? iconUrl(`no${n}_active`) : null;
}
