#!/bin/bash
# Runs a SQL file against the project database inside the WSL2 Docker container.
# Usage: wsl -d Ubuntu -- bash <repo>/work/psql.sh <relative-sql-file>
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker exec -i goodnight-treehole-postgres-1 \
  psql -U goodnight -d goodnight_treehole -v ON_ERROR_STOP=1 -f - < "$repo/$1"
