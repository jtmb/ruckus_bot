#!/usr/bin/env bash
# Isolated one-command local verification. Local only: no deployment, no live-service mutation,
# no production/cluster database, no real secrets, and no generated output inside the checkout.
#
# HOW IT WORKS
#   The existing H-backed Docker daemon runs a throwaway MySQL 8.4 fixture and a Node 24 verifier.
#   The verifier SHARES the fixture container's network namespace (network_mode: service:mysql), so
#   it reaches MySQL at literal 127.0.0.1:3306 inside one isolated private namespace. There is no
#   host network, no host port, no published port and no cluster/host MySQL. The checkout is
#   bind-mounted READ-ONLY at /src; the verifier copies source into a container-local writable /work
#   (on the H-backed Docker root) where npm ci/build write, never into the working tree. MySQL readiness is gated by its healthcheck (no shell
#   polling) and the whole run is bounded by a timeout.
#
#   Fixture credentials are GENERATED per run and are never operator inputs: no password is written
#   to SQL, Compose, argv or any retained file. The MySQL init script and the generated Compose file
#   contain only fixed identifiers and environment-variable references; the secrets reach the two
#   containers via Compose env interpolation. Generated scratch lives in a private, uniquely named
#   run directory under the operator-supplied allocated H directory and is removed on exit. The only
#   retained evidence is a small log. Secret-bearing data is never placed on the 9p H mount.
#
# EXACT INVOCATION (the only operator inputs are an allocated H path and the destructive opt-in)
#   RUCKUS_VERIFY_H_DIR=/mnt/h/AgentArtifacts/projects/ruckus_bot/verify \
#   TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS=1 \
#     ./scripts/verify.sh
#   - RUCKUS_VERIFY_H_DIR                  : allocated path under .../projects/ruckus_bot/.
#   - TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS=1 : explicit opt-in; any other value aborts.
#   - VERIFY_DRY_RUN=1 (optional)          : generate and validate the workflow only; start nothing.
#   No operator credential, production dump, cluster endpoint or runtime MYSQL_* value is read.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"

fail() { echo "FAIL: $*" >&2; exit 1; }

# Tracked-file check. grep (not grep -q) consumes all of git ls-files' output, so a match cannot
# close the pipe early and give git a SIGPIPE that pipefail would misreport as a failed check.
if git ls-files | grep -E '(^|/)node_modules/' >/dev/null 2>&1; then
  fail "node_modules is tracked in git (remove it from the index first)"
fi

# --- Fail-closed preflight: explicit opt-in only; credentials/host/port are not operator inputs. ---
[ "${TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS:-}" = "1" ] || \
  fail "set TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS=1 for a throwaway loopback test database (see header)"
command -v docker >/dev/null || fail "docker CLI is required (existing H-backed daemon)"
docker info >/dev/null 2>&1 || fail "Docker daemon is unreachable"
command -v python3 >/dev/null || fail "python3 is required for the stdlib-only ops test suite"

# The active daemon's DockerRootDir must physically be on the admitted H mount, not WSL ext4.
DOCKER_ROOT="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)"
[ -n "$DOCKER_ROOT" ] || fail "could not read the active daemon DockerRootDir"
mountpoint -q /mnt/h || fail "/mnt/h is not mounted (physical H is required)"
case "$(realpath -m "$DOCKER_ROOT")" in
  /mnt/h/*) ;;
  *) fail "active DockerRootDir ($DOCKER_ROOT) is not on physical H (/mnt/h)" ;;
esac

# --- Generated output must stay inside the allocated H project path. ---
H_ROOT="/mnt/h/AgentArtifacts/projects/ruckus_bot"
: "${RUCKUS_VERIFY_H_DIR:?set RUCKUS_VERIFY_H_DIR under $H_ROOT/ (see header)}"
H_DIR="$(realpath -m "$RUCKUS_VERIFY_H_DIR")"
case "$H_DIR" in
  "$H_ROOT"/*) ;;
  *) fail "RUCKUS_VERIFY_H_DIR must resolve under $H_ROOT/ (got $H_DIR)" ;;
esac

# Capacity: combined H-project usage + full planned peak against the per-repo allowance, physical
# free bytes, and a best-effort inode check (9p/drvfs does not report inodes faithfully).
ALLOWANCE=100000000000  # 100 GB ceiling; ruckus_bot has no KFC-style exception.
PEAK=6442450944         # ~6 GiB: cached image layers + npm volumes + MySQL data for one run.
[ -d "$H_ROOT" ] || fail "H project root is missing: $H_ROOT"
USED="$(du -sb "$H_ROOT" 2>/dev/null | awk '{print $1}')"
[ -n "${USED:-}" ] || fail "could not measure H project usage"
[ "$((USED + PEAK))" -le "$ALLOWANCE" ] || \
  fail "H usage ($USED B) + planned peak ($PEAK B) exceeds the 100 GB allowance; clean/reconcile first"
avail="$(df -B1 "$H_ROOT" | awk 'NR==2{print $4}')"
[ "${avail:-0}" -ge "$PEAK" ] || fail "less than 6 GiB free on physical H; cannot start isolated verify"
# The Docker root is not readable by this user, so measure inodes on the accessible H project root.
if ifree="$(df -i "$H_ROOT" 2>/dev/null | awk 'NR==2{print $4}')"; then
  case "${ifree:-}" in
    ''|*[!0-9]*) echo "NOTE: inode count not reported for $H_ROOT (9p); inode check skipped" ;;
    *) [ "$ifree" -ge 100000 ] || fail "only $ifree free inodes on H; npm ci needs more" ;;
  esac
else
  echo "NOTE: inode count unavailable for $H_ROOT; inode check skipped"
fi

# Reuse compatible cached images; never pull a replacement image or duplicate dependencies.
for img in mysql:8.4 node:24-bookworm-slim; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    echo "reuse cached image: $img"
  else
    echo "image not cached (compose will fetch, no forced pull): $img"
  fi
done

for d in api bot dashboard; do
  [ -f "$d/package-lock.json" ] || fail "missing $d/package-lock.json (npm ci requires it)"
done

# --- Unique run identity and generated fixture-only secrets (hex only: safe in SQL and YAML). ---
umask 077
RUNID="$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
ROOTPW="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
FIXTUREPW="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
PROJECT="ruckus_verify_$RUNID"   # random, not PID: no collision with another worker's run.
RUN_DIR="$H_DIR/run-$RUNID"
mkdir -p "$RUN_DIR" || fail "cannot create private run dir $RUN_DIR"

COMPOSE="$RUN_DIR/docker-compose.verify.yml"
INITSH="$RUN_DIR/01-fixture.sh"
LOG="$H_DIR/verify-$RUNID.log"

# Read interrupted state; never auto-remove a container we did not create in this run.
existing="$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" --format '{{.ID}}' 2>/dev/null)"
[ -z "$existing" ] || fail "unexpected containers for fresh project $PROJECT: $existing (inspect before retry)"

# Cleanup is scoped to this exact project (no --remove-orphans), checks ownership before removal,
# and surfaces any failure instead of hiding it behind '|| true'. The original exit code is kept.
# shellcheck disable=SC2329  # invoked indirectly via the EXIT trap below.
cleanup() {
  local rc=$? down_rc=0 owned remaining rm_rc=0
  trap - EXIT
  if [ -n "${PROJECT:-}" ] && [ -n "${COMPOSE:-}" ] && [ -f "$COMPOSE" ]; then
    owned="$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" --format '{{.ID}}' 2>/dev/null)"
    if [ -n "$owned" ]; then
      docker compose -f "$COMPOSE" -p "$PROJECT" down --volumes >/dev/null 2>&1 || down_rc=$?
      [ "$down_rc" -eq 0 ] || echo "FAIL: cleanup (docker compose down --volumes) failed rc=$down_rc for $PROJECT" >&2
      remaining="$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" --format '{{.ID}}' 2>/dev/null)"
      if [ -n "$remaining" ]; then
        echo "FAIL: containers remain after cleanup for $PROJECT: $remaining" >&2
        down_rc=1
      fi
    fi
  fi
  if [ -n "${RUN_DIR:-}" ] && [ -d "$RUN_DIR" ]; then
    rm -rf -- "$RUN_DIR" || { rm_rc=$?; echo "FAIL: could not remove private run dir $RUN_DIR (rc=$rm_rc)" >&2; }
  fi
  [ "$down_rc" -eq 0 ] && [ "$rm_rc" -eq 0 ] || exit 1
  exit "$rc"
}
trap cleanup EXIT

# MySQL init script: no secret in the file; the fixture password comes from the injected env var.
# The fixture user is scoped to the bot's default schema and the API test-schema prefix, with NO
# global grant and NO GRANT OPTION. This seed runs only on first init of the throwaway volume.
cat > "$INITSH" <<'SH'
#!/bin/bash
# Purpose: provision only the throwaway fixture on first MySQL init.
# Inputs: MYSQL_ROOT_PASSWORD (image env) and RUCKUS_FIXTURE_PASSWORD (injected via Compose).
# Outputs: a 'ruckus' schema and a user limited to 'ruckus' and 'ruckus_test%' schemas.
# Side effects: DDL inside the isolated throwaway container only.
# Failure: set -e aborts MySQL initialisation if any statement fails.
set -e
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS \`ruckus\` CHARACTER SET utf8mb4;
CREATE USER 'verify_fixture'@'%' IDENTIFIED BY '$RUCKUS_FIXTURE_PASSWORD';
GRANT ALL PRIVILEGES ON \`ruckus\`.* TO 'verify_fixture'@'%';
GRANT ALL PRIVILEGES ON \`ruckus_test%\`.* TO 'verify_fixture'@'%';
FLUSH PRIVILEGES;
SQL
SH
# No chmod here: the H mount is 9p/drvfs and does not honour it. This script holds no secret, so
# private data is never placed on 9p; the fixture password travels only through container env.

# Isolated workflow: verify shares the MySQL namespace (literal loopback), no host network or port.
# Secrets appear only as ${...} references; Compose resolves them from the env set on the up command.
cat > "$COMPOSE" <<YAML
services:
  mysql:
    image: mysql:8.4
    command: --bind-address=127.0.0.1
    environment:
      MYSQL_ROOT_PASSWORD: \${RUCKUS_VERIFY_ROOTPW}
      RUCKUS_FIXTURE_PASSWORD: \${RUCKUS_VERIFY_FIXTUREPW}
    volumes:
      - $INITSH:/docker-entrypoint-initdb.d/01-fixture.sh:ro
      - verify-mysql:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h127.0.0.1 -P3306 -uroot -p\$\$MYSQL_ROOT_PASSWORD --silent"]
      interval: 2s
      timeout: 3s
      retries: 40
    logging:
      options:
        max-size: "10m"
        max-file: "3"
    labels:
      com.ruckus.verify.run: "$RUNID"
  verify:
    image: node:24-bookworm-slim
    network_mode: "service:mysql"
    depends_on:
      mysql:
        condition: service_healthy
    working_dir: /work
    volumes:
      - $REPO:/src:ro
    environment:
      npm_config_cache: /tmp/npm-cache
      TEST_MYSQL_ALLOW_DESTRUCTIVE_TESTS: "1"
      TEST_MYSQL_HOST: "127.0.0.1"
      TEST_MYSQL_PORT: "3306"
      TEST_MYSQL_USER: "verify_fixture"
      TEST_MYSQL_PASSWORD: \${RUCKUS_VERIFY_FIXTUREPW}
    command: >-
      bash -lc '
        set -e;
        cp -a /src/. /work/;
        for d in api bot dashboard; do echo "== \$\$d: npm ci + audit"; npm ci --silent --prefix "\$\$d" && npm audit --omit=dev --prefix "\$\$d"; done;
        echo "== api tests"; npm test --prefix api;
        echo "== bot tests"; npm test --prefix bot;
        echo "== dashboard tests"; node --test dashboard/test/guard.test.mjs dashboard/test/logs.test.mjs dashboard/test/logs.routes.test.mjs;
        echo "== dashboard build (no API running)"; npm run build --prefix dashboard >/dev/null;
        echo "ALL CHECKS PASSED"
      '
    labels:
      com.ruckus.verify.run: "$RUNID"
volumes:
  verify-mysql:
YAML

# --- Inventory every existing suite before running any of them. ---
echo "== test suite inventory"
for d in api bot dashboard ops; do
  n="$(find "$d" -type f \( -name '*.test.js' -o -name '*.test.mjs' -o -name 'test_*.py' \) \
        -not -path '*/node_modules/*' | wc -l)"
  [ "$n" -ge 1 ] || fail "no test files discovered under $d/"
  echo "  $d: $n test file(s)"
done

echo "== generated compose config (isolated, no host network/port)"
RUCKUS_VERIFY_ROOTPW="$ROOTPW" RUCKUS_VERIFY_FIXTUREPW="$FIXTUREPW" \
  docker compose -f "$COMPOSE" -p "$PROJECT" config -q || fail "generated compose file is invalid"
echo "== source compose config"
BOT_TOKEN=x docker compose config -q || fail "repository compose file is invalid"

# Dry-run: generate and validate everything, but start no containers and install no dependencies.
if [ "${VERIFY_DRY_RUN:-0}" = "1" ]; then
  echo "DRY RUN: isolated workflow validated; no containers started, no dependencies installed, no credentials retained"
  exit 0
fi

# Ops guard tests are pure stdlib and need no container (host execution writes only /tmp/opencode).
echo "== ops tests (host, stdlib only)"
python3 -m unittest discover -s ops/tests -p 'test_*.py' -v || fail "ops fail-closed guard tests failed"

echo "== isolated verify (H-backed daemon, bounded 15m; log: $LOG)"
set +e
RUCKUS_VERIFY_ROOTPW="$ROOTPW" RUCKUS_VERIFY_FIXTUREPW="$FIXTUREPW" \
  timeout 900s docker compose -f "$COMPOSE" -p "$PROJECT" up --abort-on-container-exit --exit-code-from verify 2>&1 | tee "$LOG"
rc=${PIPESTATUS[0]}
set -e
exit "$rc"
