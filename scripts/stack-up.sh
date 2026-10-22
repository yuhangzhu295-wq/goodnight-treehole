#!/usr/bin/env bash
# Bring the local stack up the only way that works on this machine.
#
# The base docker-compose.yml publishes 5432/6379, but native Windows services already own those
# ports (PostgreSQL 18 and a too-old Redis 3.0.504) and cannot be stopped without admin rights.
# .env therefore points at 15432/16379, which only docker-compose.recovery.yml publishes. Starting
# without the override leaves the ports unbound and every API request fails with "cannot reach the
# database" - which looks exactly like a crashed database.
#
# Usage: scripts/stack-up.sh [postgres redis minio]
set -euo pipefail

cd "$(dirname "$0")/.."
SERVICES=("$@")
if [ ${#SERVICES[@]} -eq 0 ]; then SERVICES=(postgres redis minio); fi

echo "[stack] up: ${SERVICES[*]}"
wsl.exe -e bash -lc "cd /mnt/c/Users/zyu33/Projects/goodnight-treehole && docker compose -f docker-compose.yml -f docker-compose.recovery.yml up -d ${SERVICES[*]}"

# WSL2's localhost forwarding takes a moment after a container (re)start; without this the caller
# races the port and sees a connection refused.
for _ in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:15432" 2>/dev/null; then break; fi
  if netstat.exe -ano 2>/dev/null | grep -q ':15432.*LISTENING'; then break; fi
  sleep 1
done
echo "[stack] listening check done"

# A listening port is not a ready database. After an unclean shutdown (this VM gets killed when the
# host runs out of memory) postgres replays WAL and answers "FATAL: the database system is starting
# up" for minutes while the port is already open. Callers that only check the port then start reading
# the API's 500s as product failures. Wait for pg_isready instead.
for _ in $(seq 1 120); do
  if wsl.exe -e bash -lc "docker exec goodnight-treehole-postgres-1 pg_isready -U goodnight -d goodnight_treehole" >/dev/null 2>&1; then
    echo "[stack] postgres accepting queries"
    exit 0
  fi
  sleep 2
done
echo "[stack] WARNING: postgres is listening but not accepting queries yet (crash recovery can take minutes)" >&2
exit 1
