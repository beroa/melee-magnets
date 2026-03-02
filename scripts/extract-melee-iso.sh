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
Usage: scripts/extract-melee-iso.sh --iso <path-to-GALE01.iso> [options]

Extracts Melee fighter DAT/AJ/model files from an ISO into local cache folders.

Options:
  --iso <path>           Path to NTSC 1.02 Melee ISO
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

if [[ -z "$ISO_PATH" ]]; then
  echo "error: --iso is required" >&2
  usage >&2
  exit 2
fi

if [[ ! -f "$ISO_PATH" ]]; then
  echo "error: ISO path does not exist: $ISO_PATH" >&2
  exit 1
fi

"$SCRIPT_DIR/setup-melee-tools.sh" --tools-dir "$TOOLS_DIR"

PYTHON="$TOOLS_DIR/venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  echo "error: Python venv not found at $PYTHON" >&2
  exit 1
fi

ISO_DATA_DIR="$DATASETS_DIR/iso"
CLEAN_DATS_DIR="$ISO_DATA_DIR/clean-dats"
MODEL_DATS_DIR="$ISO_DATA_DIR/model-dats"
MANIFEST_PATH="$ISO_DATA_DIR/extraction-manifest.json"

mkdir -p "$CLEAN_DATS_DIR" "$MODEL_DATS_DIR"

"$PYTHON" - "$ISO_PATH" "$CLEAN_DATS_DIR" "$MODEL_DATS_DIR" "$MANIFEST_PATH" <<'PY'
import json
import os
import re
import sys
from datetime import datetime, timezone

import gciso

iso_path, clean_dir, model_dir, manifest_path = sys.argv[1:5]

char_codes = [
    "Kp",  # Bowser
    "Ca",  # Captain Falcon
    "Dk",  # Donkey Kong
    "Dr",  # Dr Mario
    "Fc",  # Falco
    "Fx",  # Fox
    "Gw",  # Game & Watch
    "Gn",  # Ganondorf
    "Nn",  # Ice Climbers - Nana
    "Pp",  # Ice Climbers - Popo
    "Pr",  # Jigglypuff
    "Kb",  # Kirby
    "Lk",  # Link
    "Lg",  # Luigi
    "Mr",  # Mario
    "Ms",  # Marth
    "Mt",  # Mewtwo
    "Ns",  # Ness
    "Pe",  # Peach
    "Pc",  # Pichu
    "Pk",  # Pikachu
    "Fe",  # Roy
    "Ss",  # Samus
    "Sk",  # Sheik
    "Ys",  # Yoshi
    "Cl",  # Young Link
    "Zd",  # Zelda
]

os.makedirs(clean_dir, exist_ok=True)
os.makedirs(model_dir, exist_ok=True)

manifest = {
    "isoPath": os.path.abspath(iso_path),
    "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
    "cleanDats": [],
    "modelDats": {},
    "missingCleanDats": [],
    "missingModelDats": [],
}


def write_file(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


with gciso.IsoFile(iso_path) as iso:
    root_entries = []
    for entry in iso.listDir(b"/"):
        if isinstance(entry, bytes):
            root_entries.append(entry.decode("ascii"))
        else:
            root_entries.append(str(entry))

    root_set = set(root_entries)
    manifest["rootFileCount"] = len(root_entries)

    for code in char_codes:
        for filename in (f"Pl{code}.dat", f"Pl{code}AJ.dat"):
            if filename not in root_set:
                manifest["missingCleanDats"].append(filename)
                continue
            payload = iso.readFile(filename.encode("ascii"), 0)
            write_file(os.path.join(clean_dir, filename), payload)
            manifest["cleanDats"].append(filename)

        model_pattern = re.compile(rf"^Pl{code}[A-Za-z0-9]{{2}}\.dat$")
        candidates = sorted(
            [
                name
                for name in root_entries
                if model_pattern.match(name)
                and name != f"Pl{code}.dat"
                and name != f"Pl{code}AJ.dat"
            ]
        )

        preferred = f"Pl{code}Nr.dat"
        chosen = preferred if preferred in candidates else (candidates[0] if candidates else None)
        if chosen is None:
            manifest["missingModelDats"].append(code)
            continue

        payload = iso.readFile(chosen.encode("ascii"), 0)
        write_file(os.path.join(model_dir, chosen), payload)
        manifest["modelDats"][code] = chosen


with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

print(f"clean dat files: {len(manifest['cleanDats'])}")
print(f"model dat files: {len(manifest['modelDats'])}")
print(f"missing clean dat files: {len(manifest['missingCleanDats'])}")
print(f"missing model dat entries: {len(manifest['missingModelDats'])}")
print(f"manifest: {manifest_path}")
PY

cat <<EOF
ISO extraction complete.
  clean dats: $CLEAN_DATS_DIR
  model dats: $MODEL_DATS_DIR
  manifest:   $MANIFEST_PATH
EOF
