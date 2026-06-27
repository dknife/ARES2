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
