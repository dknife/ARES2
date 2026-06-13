// romanize.js
// 한글(완성형 음절) → 로마자 변환. OLED 는 ASCII 글꼴만 그릴 수 있어
// 한글 메시지를 표시 직전에 로마자로 바꾼다. (국어의 로마자 표기법 단순판:
// 음절 단위 매핑 — 자음 동화 등 연음 규칙은 생략, 어린이 OLED 용도엔 충분)

const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

/**
 * 문자열의 한글 음절을 로마자로 바꾼다. 한글이 아닌 문자(ASCII, 숫자, 기호,
 * 공백)는 그대로 두고, 한글도 ASCII 도 아닌 문자는 제거한다(OLED 안전).
 * @param {string} input
 * @returns {string}
 */
export function romanizeKorean(input) {
  if (input == null) return '';
  let out = '';
  for (const ch of String(input)) {
    const code = ch.codePointAt(0);
    // 완성형 한글 음절 (가 ~ 힣)
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const s = code - 0xAC00;
      const cho = Math.floor(s / 588);
      const jung = Math.floor((s % 588) / 28);
      const jong = s % 28;
      out += CHO[cho] + JUNG[jung] + JONG[jong];
    } else if (code <= 0x7F) {
      // ASCII 는 그대로
      out += ch;
    }
    // 그 외(다른 언어/기호)는 OLED 안전을 위해 버린다
  }
  return out;
}

/** 문자열에 한글이 하나라도 있는지 */
export function hasKorean(input) {
  return /[가-힣ㄱ-ㅣ]/.test(String(input || ''));
}
