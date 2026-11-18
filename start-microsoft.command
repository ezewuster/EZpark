#!/bin/zsh
cd -- "${0:A:h}"
if [[ ! -x .venv/bin/python ]]; then
  echo 'Installeer eerst de backend-afhankelijkheden; zie backend/README.md.'
  exit 1
fi
exec .venv/bin/python backend/app.py
