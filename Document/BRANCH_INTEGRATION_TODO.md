# 브랜치 통합 TODO (main 통합 계획)

> 최종 갱신: **2026-07-03 (금)** · 작성 근거: `origin` 원격 브랜치 분석
> 이 문서는 **다른 디바이스에서도 `git pull` 로 확인**하려고 저장소에 커밋한다.
> 통합 방식은 5일차에 검증한 절차(백업 브랜치 → 순차 머지 → 충돌 해결 → 전 계층 점검)를 따른다.

## 0. 현재 상태 요약
- `main` HEAD: `docs(진행보고): 9일차 보강 …` (진행보고 문서만 반영, **코드 미포함**).
- 9일차(07-03)에 만든 **핵심 기능들은 아직 main 에 없고 팀원 브랜치에 있다.** 아래를 통합해야 9일차 보고 내용이 실제 main 코드와 일치한다.

## 1. 통합 대상 브랜치 (07-03 활성)

| 브랜치 | 담당 | 신규/뒤처짐 | 내용 | 통합 |
|---|---|---|---|---|
| **`ui_07_03`** | 이성빈(bbalganbul) | 1 / 6 | UI 목업 적용 — `Web/assets/design/`(로고·아바타·nav 아이콘 9종), `Web/designpreview/ARES화성탐사.ai·.pdf`(설계안 원본), `main.html`·`main.js`·`overview.html`·`styles.css`·`bluetooth.js` 수정 | **필요** |
| **`Simulation_LeeMinhyuck`** | 이민혁 | 10 / 6 | 시뮬레이션 대개편 + **Hierarchy 편집기** · 객체 상속 생성/삭제 · 우클릭 생성. `Sim_Parts/object_factory.js`·`sim_object.js` 신규, `Simulation/*` 리팩터, 레거시 `Web/simulation.js` 삭제, `styles.css` | **필요** |
| `Jihun` | 김지훈(ChocoOzing) | 5 / 6 | 우클릭 객체 생성 · 상속 생성/삭제(Hierarchy 편집기 토대) | **불필요** — `Jihun ⊂ Simulation_LeeMinhyuck` (LeeMinhyuck 머지에 포함됨) |

### 포함/의존 관계
- **`Jihun` ⊂ `Simulation_LeeMinhyuck`** → `Simulation_LeeMinhyuck` 만 머지하면 Jihun 작업도 함께 들어온다. Jihun 을 따로 머지하지 말 것.

## 2. 충돌 위험 (두 통합 브랜치가 같은 파일 수정)
`ui_07_03` 와 `Simulation_LeeMinhyuck` 가 **동시에 건드리는 파일** → 두 번째 머지에서 수동 해결 필요:
- ⚠ `Web/styles.css`
- ⚠ `Web/main.js`

그 외 파일은 겹치지 않아 자동 머지 가능성이 높다(UI 트랙=`main.html`·`overview.html`·`assets/design`, 시뮬 트랙=`Sim_Parts/*`·`Simulation/*`).

## 3. 권장 통합 순서
```bash
# 0) 통합 직전 main 백업 (되돌릴 안전장치)
git checkout main && git pull
git branch main_20260703 && git push -u origin main_20260703

# 1) UI 먼저 (겹침 적고 자산 추가 위주)
git merge origin/ui_07_03
#   → main.html / overview.html / assets/design 위주, 큰 충돌 없을 것

# 2) 시뮬레이션(+Jihun) 머지 — styles.css / main.js 충돌 수동 해결
git merge origin/Simulation_LeeMinhyuck
#   충돌 시: styles.css 는 양쪽 규칙 병합, main.js 는 UI 배선 + 시뮬 위임 코드 양쪽 유지

# 3) 전 계층 점검 후 push
#   (cd Web && python -m http.server 8000) 로 로컬 구동 점검 → git push
```

## 4. 통합 후 점검 체크리스트
- [ ] `Web/main.html` 로딩 정상(콘솔 에러 0), UI 목업 적용(로고·아바타·nav 아이콘·설정) 표시.
- [ ] 시뮬레이터 **Hierarchy 패널** 동작: `albi-body → Eye L/R·Chest LED·Box` 목록, 선택 시 BoxHelper 기즈모, Move/Rotate/Scale, 우클릭 생성·상속(Create child)·삭제.
- [ ] 레거시 `Web/simulation.js` 삭제 후 참조 잔존 없는지 확인(문서 CLAUDE.md 의 `simulation_backup.js` 는 유지 대상).
- [ ] `styles.css`·`main.js` 병합 후 관제실·개요·블록코딩·대시보드 화면 회귀 확인.
- [ ] 9일차 보고서(MEDIUM 보류분) 재확인: `Web/Simulation/` 죽은 코드 이슈는 이 머지로 재배선되므로 **해소 여부 확인**, `SET_PIN` 미적용은 여전히 후속 과제.
- [ ] BLE 연결·명령 송수신(9일차 코드 점검분과의 정합성) 스모크 테스트.

## 5. 결정 필요 (담당 확인 후 처리)
- [ ] **`newLeeSeongBeen`**(이성빈, 07-02, 신규 1) / **`LEE_SEONGBEEN`**(07-01, 신규 6) — `ui_07_03` 가 이 작업들을 대체하는지 이성빈에게 확인. 대체면 삭제, 아니면 통합 대상에 추가.
- [ ] **`Piiiiiiiico`**(이주현, 신규 0 / 뒤처짐 80) — main 대비 신규 커밋 없음(5일차에 이미 통합). 정리(삭제) 여부 확인.
- [ ] 백업 브랜치 `main_20260629`·`main_20260701` 는 안전장치이므로 **삭제하지 말 것**.

## 6. 통합 완료 후 후속
- [ ] 통합된 main 기준으로 9일차 보고서의 "구현/적용" 서술이 실제 코드와 일치하는지 최종 대조.
- [ ] 필요 시 `Document/진행보고` 보고서에 "통합 머지 반영" 한 줄 추가.
