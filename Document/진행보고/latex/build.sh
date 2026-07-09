#!/usr/bin/env bash
# ============================================================
# build.sh — ARES 현장 진행 보고 LaTeX 빌드
# XeLaTeX + bibtex (biblatex backend=bibtex)
# 사용:  ./build.sh        (빌드)
#        ./build.sh clean  (보조파일 정리)
# ============================================================
set -e
cd "$(dirname "$0")"
DOC=ProgressReport

if [ "$1" = "clean" ]; then
  rm -f $DOC.aux $DOC.bbl $DOC.blg $DOC.bcf $DOC.out $DOC.toc \
        $DOC.run.xml $DOC.log *.log $DOC-blx.bib
  echo "보조파일 정리 완료."
  exit 0
fi

echo "[1/4] xelatex (1차)"; xelatex -interaction=nonstopmode "$DOC.tex" >/dev/null
echo "[2/4] bibtex";        bibtex "$DOC" >/dev/null 2>&1 || true
echo "[3/4] xelatex (2차)"; xelatex -interaction=nonstopmode "$DOC.tex" >/dev/null
echo "[4/4] xelatex (3차)"; xelatex -interaction=nonstopmode "$DOC.tex" >/dev/null

PAGES=$(python3 -c "import re;d=open('$DOC.log',encoding='utf-8',errors='ignore').read();print(re.findall(r'Output written.*\((\d+) page',d)[-1])" 2>/dev/null || echo '?')
UNDEF=$(grep -c 'Citation.*undefined' "$DOC.log" 2>/dev/null || echo '?')
echo "완료 → $DOC.pdf (${PAGES}p, 미해결 인용 ${UNDEF}건)"
echo "참고: MiKTeX 업데이트 nag로 인한 'rerun BibTeX' 경고는 무해하며 출력에 영향 없음."

# ── 산출물 공유(2026-07-09 절차 변경) ──────────────────────────
# PDF 는 저장소에 커밋하지 않는다(.gitignore). 대신 GitHub Releases 의
# progress-report 태그 자산으로 갱신해 고정 링크로 공유한다:
#   https://github.com/dknife/ARES2/releases/download/progress-report/ProgressReport.pdf
if command -v gh >/dev/null 2>&1; then
  if gh release upload progress-report "$DOC.pdf" --repo dknife/ARES2 --clobber >/dev/null 2>&1; then
    echo "Releases 업로드 완료 → progress-report/$DOC.pdf"
  else
    echo "경고: Releases 업로드 실패 — 'gh auth status' 확인 후 수동 업로드:"
    echo "  gh release upload progress-report \"$DOC.pdf\" --repo dknife/ARES2 --clobber"
  fi
else
  echo "경고: gh CLI 없음 — $DOC.pdf 를 Releases(progress-report) 에 수동 업로드 필요"
fi
