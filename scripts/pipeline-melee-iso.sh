#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

ISO_PATH=""
DATASETS_DIR="$REPO_ROOT/server/data/datasets"
TOOLS_DIR="$REPO_ROOT/.tools/melee"
HURTBOX_PROJECT="$REPO_ROOT/tools/hurtbox-cache-extractor/hurtbox-cache-extractor.csproj"
SKIP_FRAMEDATA=0
SKIP_HURTBOX_CACHE=0

usage() {
  cat <<'EOF'
Usage: scripts/pipeline-melee-iso.sh --iso <path> [options]

End-to-end ISO pipeline:
  1) bootstrap tooling
  2) extract fighter DAT/AJ/model files from ISO
  3) build framedata-json-fullhitboxes
  4) build real hurtbox/hitbox cache

Options:
  --iso <path>             Path to NTSC 1.02 Melee ISO
  --datasets-dir <path>    Dataset root (default: server/data/datasets)
  --tools-dir <path>       Tool root (default: .tools/melee)
  --hurtbox-project <path> Override extractor .csproj path
  --skip-framedata         Skip framedata generation
  --skip-hurtbox-cache     Skip real hurtbox/hitbox cache generation
  -h, --help               Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iso)
      ISO_PATH="${2:-}"
      if [[ -z "$ISO_PATH" ]]; then
        echo "error: --iso requires a value" >&2
        exit 2
      fi
      shift 2
      ;;
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
    --hurtbox-project)
      HURTBOX_PROJECT="${2:-}"
      if [[ -z "$HURTBOX_PROJECT" ]]; then
        echo "error: --hurtbox-project requires a value" >&2
        exit 2
      fi
      shift 2
      ;;
    --skip-framedata)
      SKIP_FRAMEDATA=1
      shift
      ;;
    --skip-hurtbox-cache)
      SKIP_HURTBOX_CACHE=1
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

if [[ -z "$ISO_PATH" ]]; then
  echo "error: --iso is required" >&2
  usage >&2
  exit 2
fi

"$SCRIPT_DIR/extract-melee-iso.sh" \
  --iso "$ISO_PATH" \
  --datasets-dir "$DATASETS_DIR" \
  --tools-dir "$TOOLS_DIR"

if [[ "$SKIP_FRAMEDATA" -eq 0 ]]; then
  "$SCRIPT_DIR/build-framedata-from-iso.sh" \
    --datasets-dir "$DATASETS_DIR" \
    --tools-dir "$TOOLS_DIR"
fi

if [[ "$SKIP_HURTBOX_CACHE" -eq 0 ]]; then
  "$SCRIPT_DIR/build-hurtbox-cache.sh" \
    --datasets-dir "$DATASETS_DIR" \
    --tools-dir "$TOOLS_DIR" \
    --project "$HURTBOX_PROJECT"
fi

echo "pipeline complete."
