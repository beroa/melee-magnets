#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

ISO_PATH=""
DATASETS_DIR="$REPO_ROOT/server/data/datasets"
TOOLS_DIR="$REPO_ROOT/.tools/melee"

usage() {
  cat <<'EOF'
Usage: scripts/build-framedata-from-iso.sh [--iso <path>] [options]

Builds local framedata-json-fullhitboxes from extracted Melee DAT files.
If --iso is given, extraction runs first.

Options:
  --iso <path>           Optional ISO path; if provided, extraction runs first
  --datasets-dir <path>  Dataset root (default: server/data/datasets)
  --tools-dir <path>     Tool root (default: .tools/melee)
  -h, --help             Show this help text
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

if [[ -n "$ISO_PATH" ]]; then
  "$SCRIPT_DIR/extract-melee-iso.sh" \
    --iso "$ISO_PATH" \
    --datasets-dir "$DATASETS_DIR" \
    --tools-dir "$TOOLS_DIR"
else
  "$SCRIPT_DIR/setup-melee-tools.sh" --tools-dir "$TOOLS_DIR"
fi

PYTHON="$TOOLS_DIR/venv/bin/python"
MELEEDAT2JSON="$TOOLS_DIR/venv/bin/meleedat2json"
FRAME_EXTRACTOR="$TOOLS_DIR/src/meleeFrameDataExtractor/generateFrameData.py"

if [[ ! -x "$PYTHON" ]]; then
  echo "error: expected python at $PYTHON" >&2
  exit 1
fi
if [[ ! -x "$MELEEDAT2JSON" ]]; then
  echo "error: expected meleedat2json at $MELEEDAT2JSON" >&2
  exit 1
fi
if [[ ! -f "$FRAME_EXTRACTOR" ]]; then
  echo "error: frame extractor script not found: $FRAME_EXTRACTOR" >&2
  exit 1
fi

CLEAN_DATS_DIR="$DATASETS_DIR/iso/clean-dats"
DAT_DUMPS_DIR="$DATASETS_DIR/dat-dumps"
FRAMEDATA_DIR="$DATASETS_DIR/framedata-json-fullhitboxes"

if [[ ! -d "$CLEAN_DATS_DIR" ]]; then
  echo "error: clean DAT directory not found: $CLEAN_DATS_DIR" >&2
  echo "hint: run scripts/extract-melee-iso.sh --iso <path>" >&2
  exit 1
fi

mkdir -p "$DAT_DUMPS_DIR" "$FRAMEDATA_DIR"

declare -a CHAR_CODES=(
  Kp Ca Dk Dr Fc Fx Gw Gn Nn Pp Pr Kb Lk Lg Mr Ms Mt Ns Pe Pc Pk Fe Ss Sk Ys Cl Zd
)

declare -A CHAR_NAMES=(
  [Kp]="Bowser"
  [Ca]="Captain Falcon"
  [Dk]="Donkey Kong"
  [Dr]="Dr Mario"
  [Fc]="Falco"
  [Fx]="Fox"
  [Gw]="Game & Watch"
  [Gn]="Ganondorf"
  [Nn]="Ice Climbers - Nana"
  [Pp]="Ice Climbers - Popo"
  [Pr]="Jigglypuff"
  [Kb]="Kirby"
  [Lk]="Link"
  [Lg]="Luigi"
  [Mr]="Mario"
  [Ms]="Marth"
  [Mt]="Mewtwo"
  [Ns]="Ness"
  [Pe]="Peach"
  [Pc]="Pichu"
  [Pk]="Pikachu"
  [Fe]="Roy"
  [Ss]="Samus"
  [Sk]="Sheik"
  [Ys]="Yoshi"
  [Cl]="Young Link"
  [Zd]="Zelda"
)

processed=0
skipped=0

for code in "${CHAR_CODES[@]}"; do
  name="${CHAR_NAMES[$code]}"
  file_stem="${name// /%20}"
  base_dat="$CLEAN_DATS_DIR/Pl${code}.dat"
  anim_dat="$CLEAN_DATS_DIR/Pl${code}AJ.dat"
  dat_dump="$DAT_DUMPS_DIR/${file_stem}.json"
  frame_dump="$FRAMEDATA_DIR/${file_stem}.framedata.json"

  if [[ ! -f "$base_dat" || ! -f "$anim_dat" ]]; then
    echo "skip ${name}: missing $base_dat or $anim_dat" >&2
    skipped=$((skipped + 1))
    continue
  fi

  echo "dump dat: ${name}"
  "$MELEEDAT2JSON" "$base_dat" "$dat_dump" --animfile "$anim_dat"

  echo "build framedata: ${name}"
  "$PYTHON" "$FRAME_EXTRACTOR" "$dat_dump" "$frame_dump" --fullhitboxes

  processed=$((processed + 1))
done

echo "processed characters: $processed"
echo "skipped characters:   $skipped"
echo "framedata dir:        $FRAMEDATA_DIR"
