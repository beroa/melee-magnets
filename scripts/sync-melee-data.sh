#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="server/data/datasets/framedata-json-fullhitboxes"
BASE_URL="https://melee.theshoemaker.de/framedata-json-fullhitboxes"

mkdir -p "$DATA_DIR"

tmp_list="$(mktemp)"
trap 'rm -f "$tmp_list"' EXIT

curl -s "$BASE_URL/" \
  | rg -o 'href="[^"]+\.framedata\.json"' \
  | sed -E 's/^href="(.*)"$/\1/' \
  | sed 's/&amp;/\&/g' \
  > "$tmp_list"

while IFS= read -r encoded_file; do
  [[ -z "$encoded_file" ]] && continue
  curl -fsSL "$BASE_URL/$encoded_file" -o "$DATA_DIR/$encoded_file"
  echo "synced $encoded_file"
done < "$tmp_list"

echo "done: $(find "$DATA_DIR" -maxdepth 1 -type f -name '*.json' | wc -l | tr -d ' ') files"
