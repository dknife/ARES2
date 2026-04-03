# DESIGN.md — Sutera 디자인 스타일 레퍼런스

> 출처: https://www.awwwards.com/sites/sutera (Awwwards SOTD 수상작)
> 실제 사이트: https://suteraproperties.com/

---

## 1. 디자인 컨셉 & 분위기

- **키워드**: 미니멀, 모던, 프리미엄, 신뢰감
- **슬로건**: "CREATE VALUE. ENRICH LIVES"
- **전체 톤**: 깔끔한 흑백 기조 + 강렬한 액센트 컬러로 시선 유도
- **브랜드 이미지**: 전문적이고 세련된 엔터프라이즈급 디자인
- **수상**: Awwwards Site of the Day (SOTD)

---

## 2. 색상 팔레트

### 기본 색상
| 용도 | 색상 코드 | 설명 |
|------|-----------|------|
| 배경 (메인) | `#F8F8F8` | 밝은 회색, 부드러운 톤 |
| 배경 (보조) | `#EDEDED` | 중간 회색, 필터/섹션 구분 |
| 배경 (흰색) | `#FFFFFF` | 순백 배경 |
| 텍스트 (기본) | `#222222` | 거의 검정에 가까운 진한 회색 |
| 텍스트 (보조) | `#313131` | 약간 밝은 진한 회색 |

### 액센트 & 강조 색상
| 용도 | 색상 코드 | 설명 |
|------|-----------|------|
| 주 강조색 | `#FA5D29` | 오렌지-레드, CTA·경고·배지 |
| 시안 블루 | `#0693E3` | 활기찬 블루, 테마 포인트 |
| 민트 그린 | `#7BDCB5` | 밝은 청록, 보조 액센트 |
| 노랑 | `#FFF083` | 하이라이트·학습 섹션 |

### 버튼 색상
| 상태 | 색상 코드 |
|------|-----------|
| 기본 배경 | `#222222` |
| 기본 텍스트 | `#FFFFFF` |
| 호버 배경 | `#383838` |

### 그래디언트 프리셋
```css
/* Vivid Cyan to Purple */
background: linear-gradient(135deg, rgb(6,147,227), rgb(155,81,224));
```

---

## 3. 타이포그래피

### 주요 폰트
- **메인 폰트**: `"Inter Tight"` (Awwwards 페이지 기준)
- **보조 폰트**: `"Open Sans"` (실제 사이트)

### 폰트 두께 (Weight)
| 이름 | 값 |
|------|-----|
| Light | 300 |
| Regular | 400 |
| Medium | 500 |
| SemiBold | 600 |
| Bold | 700 |
| Black | 800 |

### 크기 체계 (반응형)
| 용도 | 데스크톱 | 모바일 |
|------|----------|--------|
| Heading-1 (히어로) | 146px ~ 170px | 42px |
| Heading-2 | 36px ~ 42px | 24px ~ 28px |
| Text-large (서브타이틀) | 18px ~ 20px | 16px |
| Text-primary (본문) | 14px ~ 16px | 13px ~ 14px |

### 행간 (Line Height)
- 제목: `1.2`
- 본문: `1.6`

---

## 4. 레이아웃 & 구조

### 그리드 시스템
- **최대 너비**: `1816px` (Awwwards) / `1300px` (실제 사이트)
- **컬럼**: 12열 CSS Grid 기반
- **갭(간격)**: `20px`
- **내부 여백**: `52px` (좌우 패딩)
- **컬럼 마진**: `50px`

### 반응형 브레이크포인트
| 디바이스 | 브레이크포인트 |
|----------|---------------|
| 대형 데스크톱 | 1270px 이상 |
| 데스크톱 | 1024px ~ 1270px |
| 태블릿 | 768px ~ 1024px |
| 모바일 | 576px 이하 |

### 헤더
- 고정(fixed) 헤더
- 높이: `54px` (메인) / `71px` (스크롤 시 고정)
- 데스크톱 전체 높이: `118px`

### 섹션 구성 패턴
```
[고정 헤더/네비게이션]
[히어로 - 풀스크린 이미지/비디오 + 대형 타이포]
[콘텐츠 섹션 - 그리드 기반 카드/텍스트]
[Shape Divider - SVG 웨이브 곡선 구분선]
[CTA 섹션]
[푸터]
```

---

## 5. 애니메이션 & 인터랙션

### 기본 트랜지션
```css
transition: all 0.3s ease;
```

### 텍스트 리빌 애니메이션
```css
/* 라인 단위로 텍스트가 아래에서 위로 나타남 */
animation-duration: 1.2s;
animation-timing-function: cubic-bezier(0.25, 1, 0.5, 1);
transform: translateY(1.3em) → translateY(0);
```

### Split Heading 효과
- 단어별 순차(stagger) 등장
- 문자 단위 리빌 옵션
- 라인 브레이크 애니메이션

### 스크롤 기반 효과
- 요소가 뷰포트에 진입할 때 페이드인
- `wpb_animate_when_almost_visible` 패턴
- 스크롤 시 요소 노출 트리거

### 호버 효과
```css
/* 이미지 호버 */
filter: brightness(80%);

/* 버튼 호버 */
background-color: #383838;
```

### 로딩 애니메이션
```css
/* 스피너 회전 */
@keyframes loadingSpinner {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
animation: loadingSpinner 0.6s linear infinite;

/* 펄스 효과 */
@keyframes aniCountPulse { /* 1초 */ }
```

---

## 6. 이미지 & 미디어

### 종횡비
| 용도 | 비율 |
|------|------|
| 일반 사이트 이미지 | `16 / 12` |
| 파노라마 | `2 / 1` |
| 데스크톱 스크린샷 | `19 / 10` |

### 이미지 처리
```css
object-fit: cover;
max-width: 100%;
```

### 레이지 로딩
- `.nectar-lazy` 클래스 기반 지연 로딩
- 뷰포트 진입 시 이미지 로드

### 비디오
- YouTube 임베드 통합
- 인라인 비디오 플레이어

---

## 7. UI 컴포넌트

### 버튼
```css
height: 48px;
padding: 0 24px;           /* 또는 0.667em 1.333em */
border-radius: 8px;
background: #222;
color: #fff;
border: none;
font: inherit;
cursor: pointer;
transition: background 0.3s ease;
```

### 카드
```css
border-radius: 8px ~ 16px;
background: rgba(255,255,255,0.9);  /* 반투명 흰색 */
/* 또는 */
background: #222;                    /* 다크 카드 */
box-shadow: 0 2px 8px rgba(0,0,0,0.1);
transition: transform 0.3s ease, filter 0.3s ease;
```
- 호버 시 스케일 + 필터 효과

### 네비게이션
- 햄버거 메뉴 + 슬라이드아웃 패널
- 드롭다운: 호버 인텐트 방식 (의도적 호버만 반응)
- 모바일: 999px 이하에서 전환

### 입력 필드
```css
height: 48px;
padding: 0 16px;
border: none;
border-bottom: 1px solid #ededed;
```

### Shape Divider (섹션 구분선)
```css
position: absolute;
bottom: 0;
height: 150px;             /* 데스크톱 */
/* SVG 기반 웨이브/곡선 */
/* 모바일에서 높이 차등 처리 */
```

---

## 8. 특별한 디자인 기법

### 미니멀 흑백 + 포인트 컬러
- 기본은 흑백·회색 톤으로 깔끔하게 유지
- `#FA5D29` 오렌지 액센트로 주목도 높은 요소에만 컬러 사용

### 대형 타이포그래피 히어로
- 히어로 섹션에 100px+ 초대형 텍스트
- 텍스트 자체가 비주얼 역할

### SVG 웨이브 디바이더
- 섹션 간 부드러운 곡선 전환
- 딱딱한 직선 구분 대신 유기적 형태

### 스크롤 연동 애니메이션
- 스크롤 위치에 따라 요소 순차 등장
- 자연스러운 스토리텔링 흐름

### 접근성
- skip-to-content 링크
- 스크린 리더용 텍스트
- 시맨틱 HTML 구조

---

## 9. 기술 스택

- HTML5 시맨틱 마크업
- CSS3 (Grid, Flexbox, Container Queries)
- SVG 아이콘 & 디바이더
- TrueType 폰트 (.ttf)
- JavaScript (스크롤 애니메이션, 인터랙션)
- YouTube API (비디오 임베드)
- 레이지 로딩 (이미지 최적화)
- 반응형 프리페칭 (링크 프리로드)

---

## 10. LearnLangs 적용 시 참고 포인트

이 디자인에서 LearnLangs에 적용할 수 있는 요소들:

1. **색상 체계**: 밝은 회색(`#F8F8F8`) 배경 + 진한 텍스트(`#222`) + 오렌지 액센트(`#FA5D29`)
2. **타이포그래피**: Inter Tight 또는 유사 산세리프, 명확한 크기 위계
3. **카드 스타일**: `border-radius: 8~16px`, 부드러운 그림자, 호버 효과
4. **버튼**: 48px 높이, 8px 라운드, 진한 배경 + 흰 텍스트
5. **애니메이션**: 0.3초 기본 트랜지션, 스크롤 시 페이드인
6. **레이아웃**: 깔끔한 그리드, 충분한 여백, 반응형
