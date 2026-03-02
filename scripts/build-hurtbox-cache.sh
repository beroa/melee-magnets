#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

DATASETS_DIR="$REPO_ROOT/server/data/datasets"
TOOLS_DIR="$REPO_ROOT/.tools/melee"
PROJECT_PATH="$REPO_ROOT/tools/hurtbox-cache-extractor/hurtbox-cache-extractor.csproj"
CHARACTER_FILTER=""

usage() {
  cat <<'EOF'
Usage: scripts/build-hurtbox-cache.sh [options]

Builds per-frame real hurtbox/hitbox cache files from extracted Melee DATs.

Options:
  --datasets-dir <path>   Dataset root (default: server/data/datasets)
  --tools-dir <path>      Tool root (default: .tools/melee)
  --project <path>        Dotnet project path (default: tools/hurtbox-cache-extractor/hurtbox-cache-extractor.csproj)
  --character <value>     Optional character code or name filter (e.g. Kp, Bowser)
  -h, --help              Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --datasets-dir)
      DATASETS_DIR="${2:-}"
      if [[ -z "$DATASETS_DIR" ]]; then
        echo "error: --datasets-dir requires a value" >&2
        exit 2
      fi
      shift 2
      ;;
    --tools-dir)
      TOOLS_DIR="${2:-}"
      if [[ -z "$TOOLS_DIR" ]]; then
        echo "error: --tools-dir requires a value" >&2
        exit 2
      fi
      shift 2
      ;;
    --project)
      PROJECT_PATH="${2:-}"
      if [[ -z "$PROJECT_PATH" ]]; then
        echo "error: --project requires a value" >&2
        exit 2
      fi
      shift 2
      ;;
    --character)
      CHARACTER_FILTER="${2:-}"
      if [[ -z "$CHARACTER_FILTER" ]]; then
        echo "error: --character requires a value" >&2
        exit 2
      fi
      shift 2
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

if ! command -v dotnet >/dev/null 2>&1; then
  echo "error: dotnet is required to build hurtbox cache" >&2
  exit 1
fi

if [[ ! -f "$PROJECT_PATH" ]]; then
  echo "error: extractor project not found: $PROJECT_PATH" >&2
  exit 1
fi

"$SCRIPT_DIR/setup-melee-tools.sh" --tools-dir "$TOOLS_DIR"

CLEAN_DATS_DIR="$DATASETS_DIR/iso/clean-dats"
MODEL_DATS_DIR="$DATASETS_DIR/iso/model-dats"
FRAMEDATA_DIR="$DATASETS_DIR/framedata-json-fullhitboxes"
OUT_DIR="$DATASETS_DIR/hurtboxes-real"

if [[ ! -d "$CLEAN_DATS_DIR" ]]; then
  echo "error: clean DAT directory not found: $CLEAN_DATS_DIR" >&2
  echo "hint: run scripts/extract-melee-iso.sh --iso <path>" >&2
  exit 1
fi

if [[ ! -d "$MODEL_DATS_DIR" ]]; then
  echo "error: model DAT directory not found: $MODEL_DATS_DIR" >&2
  echo "hint: run scripts/extract-melee-iso.sh --iso <path>" >&2
  exit 1
fi

if [[ ! -d "$FRAMEDATA_DIR" ]]; then
  echo "error: framedata directory not found: $FRAMEDATA_DIR" >&2
  echo "hint: run scripts/build-framedata-from-iso.sh" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

args=(
  --clean-dats "$CLEAN_DATS_DIR"
  --model-dats "$MODEL_DATS_DIR"
  --framedata-dir "$FRAMEDATA_DIR"
  --out-dir "$OUT_DIR"
)

if [[ -n "$CHARACTER_FILTER" ]]; then
  args+=(--character "$CHARACTER_FILTER")
fi

echo "building hurtbox cache with $PROJECT_PATH"
dotnet run --project "$PROJECT_PATH" -- "${args[@]}"
