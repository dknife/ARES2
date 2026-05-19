# COMMENTPOLICY — 코드 블록 내 한글 주석 처리 정책

## 정책 요약

XeLaTeX 한글 문서의 코드 블록에는 **`listings` 사용을 금지**하고
**`minted` (Pygments 기반)** 를 사용한다. 컴파일은 반드시
`xelatex -shell-escape main.tex` 로 한다.

---

## 1. 배경 — 무엇이 문제였나

`listings` + `kotex` 조합에서, 한글과 ASCII 숫자가 인접한 주석이 PDF
출력에서 **글리프 박스 순서가 뒤집히는** 현상이 관찰되었다.

| 원본 코드 주석            | PDF 출력 (불량)        |
|--------------------------|------------------------|
| `# 2차시 미션1: LED ...`  | `# 차시2 미션1: LED ...` |
| `# LED 1번 켜기`          | `# LED 번1 켜기`         |
| `# 1초 기다리기`          | `# 초1 기다리기`         |
| `# 0.5초 끄기`            | `# 초0.5 끄기`           |

규칙성: **한글 단어가 통째로 앞당겨지고, 인접 ASCII 숫자가 한글 뒤로
이동**. 단순 자간(letter-spacing) 보정으로 설명되지 않는 *글리프
순서 자체의 역전*이다.

---

## 2. 진단 — 변수 분리 검증

최소 재현 문서로 다음 변수를 하나씩 제거하며 컴파일한 결과:

| 테스트 | 변경                                    | 결과     |
|-------|-----------------------------------------|----------|
| A     | listings baseline                       | 뒤집힘   |
| B     | `commentstyle`에서 `\itshape` 제거      | 뒤집힘   |
| C     | `columns=fullflexible` → `columns=fixed` | 뒤집힘 + 추가 공백 |
| D     | 모든 스타일·색상 제거 (`basicstyle`만)  | 뒤집힘   |
| E     | `verbatim` 환경으로 교체 (listings 미사용) | **정상** |

**결론**: 원인은 `listings` 자체. fontspec / kotex / KoPub 폰트 /
`LetterSpace` / `\itshape` / `columns` / 색상 — 전부 무죄.

### 메커니즘

`listings`는 입력을 한 바이트씩 분해해 각 문자에 스타일을 적용하는
ASCII 시대 패키지이다. UTF-8 한글(3바이트)을 ``unknown character'' 그룹
으로 모아 별도 박스로 묶고, ASCII 부분은 정상 박스로 처리하면서, 두
박스가 PDF content stream에 *다른 순서로* 들어간다. 그 결과 한글 단어가
통째로 앞당겨지고 인접 숫자가 뒤로 밀려 보인다.

TEST C에서 `led_on (1 , 1.0)` 처럼 ASCII 사이에 비대칭 공백이 생긴 것은
`listings`가 한글을 ``폭 0의 빈 토큰''으로 인식한다는 결정적 증거였다.

---

## 3. 해결 — minted로 교체

`minted`는 코드를 LaTeX 바깥의 Pygments(Python)가 토큰화한 뒤 결과만
LaTeX으로 넘긴다. 따라서 한글 UTF-8 바이트를 listings처럼 잘못 묶을
여지가 *원천적으로* 없다.

### 3.1 `preamble.tex` 변경

```latex
%% 사용 중단:
%% \usepackage{listings}
%% \lstdefinestyle{python}{...}
%% \AtBeginEnvironment{labbox}{\boxcodeon}...

%% 사용:
\usepackage{minted}
\usemintedstyle{friendly}
\setminted{
  fontsize=\footnotesize,
  bgcolor=codebackground,
  frame=leftline,
  framerule=0.8pt,
  rulecolor=\color{accentcopper},
  breaklines=true,
  breakanywhere=true,
  tabsize=4,
  linenos=false,
  autogobble=true,
}
\setminted[python]{python3=true}
```

### 3.2 코드 블록 작성 규칙

새 코드 블록을 추가할 때는 다음 한 가지 패턴만 사용한다:

```latex
\begin{minted}{python}
# 한글 주석과 ASCII 숫자 혼용 OK: 2차시 미션1
led_on(1, 1.0)   # LED 1번 켜기
\end{minted}
```

`tcolorbox` 박스(`labbox`, `keypoint` 등) 안에서도 그대로 사용 가능.

### 3.3 컴파일 명령

```bash
xelatex -shell-escape main.tex
xelatex -shell-escape main.tex   # 목차/참조 수렴
```

`-shell-escape`는 minted가 Pygments 외부 프로세스를 호출하기 위해 필요.
**이 옵션 없이는 컴파일 실패**한다.

---

## 4. 환경 요구사항

| 구성 요소  | 버전                                | 확인 명령                  |
|------------|------------------------------------|----------------------------|
| Python     | 3.x (3.14 확인됨)                  | `python --version`         |
| Pygments   | 2.x (2.20 확인됨)                  | `pip show Pygments`        |
| XeLaTeX    | MiKTeX 또는 TeX Live               | `xelatex --version`        |
| KoPub 폰트 | Batang Medium/Bold, Dotum Medium/Bold | `fc-list \| grep KoPub`  |
| D2Coding   | TTC                                | `fc-list \| grep D2Coding` |

Pygments 미설치 환경에서는: `python -m pip install Pygments`

---

## 5. 금지 사항

- **`\usepackage{listings}` 사용 금지** (한글이 포함된 코드 블록에서).
- **`\begin{lstlisting}` 환경 사용 금지**. 모두 `\begin{minted}{<lang>}`
  으로 작성.
- **`-shell-escape` 옵션 생략 금지**. 컴파일 스크립트·CI에 항상 포함.

---

## 6. 트레이드오프

- **+** 한글 처리 안전, 자동 syntax highlighting 품질 향상.
- **+** Pygments가 지원하는 모든 언어(Python, JS, C, Bash 등) 동일 패턴
  으로 사용 가능.
- **−** 외부 의존(Python + Pygments). 컴파일 환경 이식 시 함께 설치 필요.
- **−** `-shell-escape`는 임의 셸 명령 실행 권한을 부여하므로, 신뢰 가능한
  소스에서 받은 `.tex`만 컴파일할 것.
- **−** 컴파일 시간 다소 증가 (코드 블록당 외부 프로세스 호출).

---

## 7. 참고

- 본 문서 작성 배경: 2026-05-19, `Missions/main.tex` 컴파일 중 한글
  주석 글리프 역전 발견 → 진단 → minted 전환으로 해결.
- 검증 PDF: 같은 코드(`# 2차시 미션1: LED 점등 테스트` 외)가 listings
  에서 깨졌고 minted 전환 후 정상 출력됨을 확인.
- 동일 문제는 `kotex` + `listings` 조합을 쓰는 모든 한글 LaTeX 문서에서
  재현될 수 있으므로, 향후 새 한글 LaTeX 프로젝트에도 본 정책을 그대로
  적용한다.
