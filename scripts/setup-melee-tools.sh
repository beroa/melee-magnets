#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

TOOLS_DIR="$REPO_ROOT/.tools/melee"
FORCE=0

usage() {
  cat <<'EOF'
Usage: scripts/setup-melee-tools.sh [--tools-dir <path>] [--force]

Bootstraps local Melee extraction tooling into a Python virtualenv:
  - gciso
  - meleeDat2Json
  - meleeFrameDataExtractor (source checkout)
  - HSDLib (source checkout; used by hurtbox cache extractor)

Options:
  --tools-dir <path>   Override tool root directory (default: .tools/melee)
  --force              Remove the tool directory before reinstalling
  -h, --help           Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tools-dir)
      TOOLS_DIR="${2:-}"
      if [[ -z "$TOOLS_DIR" ]]; then
        echo "error: --tools-dir requires a value" >&2
        exit 2
      fi
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command not found: $cmd" >&2
    exit 1
  fi
}

sync_repo() {
  local name="$1"
  local url="$2"
  local dst="$SRC_DIR/$name"

  if [[ -d "$dst/.git" ]]; then
    git -C "$dst" fetch --depth=1 origin
    git -C "$dst" reset --hard FETCH_HEAD
  else
    git clone --depth=1 "$url" "$dst"
  fi
}

require_command git
require_command python3

if [[ "$FORCE" -eq 1 && -d "$TOOLS_DIR" ]]; then
  rm -rf -- "$TOOLS_DIR"
fi

VENV_DIR="$TOOLS_DIR/venv"
SRC_DIR="$TOOLS_DIR/src"
mkdir -p "$SRC_DIR"

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"

"$PYTHON" -m pip install --upgrade pip setuptools wheel

sync_repo "gciso" "https://github.com/pfirsich/gciso"
sync_repo "meleeDat2Json" "https://github.com/pfirsich/meleeDat2Json"
sync_repo "meleeFrameDataExtractor" "https://github.com/pfirsich/meleeFrameDataExtractor"
sync_repo "HSDLib" "https://github.com/Ploaj/HSDLib"

"$PIP" install --upgrade "$SRC_DIR/gciso" "$SRC_DIR/meleeDat2Json"

if [[ ! -x "$VENV_DIR/bin/meleedat2json" ]]; then
  echo "error: expected meleedat2json in $VENV_DIR/bin but it was not installed" >&2
  exit 1
fi

cat <<EOF
Melee tools are ready.
  tools dir: $TOOLS_DIR
  python:    $PYTHON
  command:   $VENV_DIR/bin/meleedat2json
EOF
