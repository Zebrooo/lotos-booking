#!/usr/bin/env bash
# scripts/new-migration.sh <имя> — новый файл миграции с именем по времени создания.
set -euo pipefail
name="${1:?имя миграции, например: core}"
f="migrations/$(date -u +%Y%m%d%H%M%S)_${name}.sql"
printf -- "-- %s\n\n" "$name" > "$f"
echo "$f"
