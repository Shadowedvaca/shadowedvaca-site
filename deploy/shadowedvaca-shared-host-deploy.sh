#!/usr/bin/env bash
set -euo pipefail

deploy_sha="${1:-}"
environment="${2:-}"
archive="${3:-}"

if ! printf '%s\n' "$deploy_sha" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "ERROR: invalid deployment commit"
  exit 1
fi

case "$environment" in
  development)
    compose_file=docker-compose.dev.yml
    image_name=shadowedvaca-site-dev
    web_root=/var/www/dev.shadowedvaca.com
    ;;
  test)
    compose_file=docker-compose.test.yml
    image_name=shadowedvaca-site-test
    web_root=/var/www/test.shadowedvaca.com
    ;;
  *)
    echo "ERROR: shared-host deploy supports development or test only"
    exit 1
    ;;
esac

expected_archive="/tmp/shadowedvaca-site-$environment-$deploy_sha.tar.gz"
if [ "$archive" != "$expected_archive" ] || [ ! -f "$archive" ]; then
  echo "ERROR: expected exact-SHA static archive is unavailable"
  exit 1
fi

project_root=/opt/shadowedvaca-site
stage_dir="/tmp/shadowedvaca-site-$environment-$deploy_sha-static"
backup_root="/opt/backups/shadowedvaca-site/$environment"
next_static="$backup_root/previous-static.next-$deploy_sha"
previous_static="$backup_root/previous-static"
candidate_script="$0"

rm -rf -- "$stage_dir"
install -d -m 0755 "$stage_dir"
tar -xzf "$archive" -C "$stage_dir"
test -s "$stage_dir/index.html"
test -s "$stage_dir/login.html"
test -s "$stage_dir/register.html"
echo "Inactive static artifact staged for commit $deploy_sha"

lock_path=/run/lock/shared-platform-deployment.lock
echo "Waiting up to 2700 seconds for shared deployment lock: $lock_path"
exec 9>"$lock_path"
if ! flock -w 2700 9; then
  rm -rf -- "$stage_dir"
  rm -f -- "$archive" "$candidate_script"
  echo "ERROR: timed out waiting for shared deployment lock"
  exit 1
fi
echo "Shared deployment lock acquired for Shadowedvaca $environment at commit $deploy_sha"

static_mutation_started=false
api_mutation_started=false
prior_image_available=false

compose() {
  docker compose \
    --project-directory "$project_root" \
    -f "$project_root/$compose_file" \
    "$@"
}

release_lock() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    echo "==> Bounded Shadowedvaca $environment diagnostics"
    compose ps || true
    compose logs --no-color --tail 100 app db || true
    if [ "$api_mutation_started" = true ] && [ "$prior_image_available" = true ]; then
      docker image tag "$image_name:previous" "$image_name" || true
      compose up -d --no-build --force-recreate app || true
      echo "Attempted app rollback to the prior scoped image"
    fi
    if [ "$static_mutation_started" = true ] && [ -d "$next_static" ]; then
      find "$web_root" -mindepth 1 -maxdepth 1 ! -name .well-known \
        -exec rm -rf -- {} +
      cp -a "$next_static"/. "$web_root"/
      echo "Restored prior static files after failed deployment"
    fi
  fi
  rm -rf -- "$stage_dir" "$next_static"
  rm -f -- "$archive" "$candidate_script"
  echo "Shared deployment lock released for Shadowedvaca $environment with status $status"
  exec 9>&-
  exit "$status"
}
trap release_lock EXIT

root_available_kib="$(df -Pk / | awk 'NR == 2 {print $4}')"
swap_total_kib="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
mem_available_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
swap_free_kib="$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)"
headroom_kib="$((mem_available_kib + swap_free_kib))"
printf 'Shared deployment admission: root_available_kib=%s swap_total_kib=%s headroom_kib=%s\n' \
  "$root_available_kib" "$swap_total_kib" "$headroom_kib"
test "$root_available_kib" -ge 12582912
test "$swap_total_kib" -ge 1048576
test "$headroom_kib" -ge 2097152
echo "Shared deployment admission passed before Shadowedvaca $environment mutation"

cd "$project_root"
git fetch --no-tags --prune origin
git checkout --detach "$deploy_sha"
test "$(git rev-parse HEAD)" = "$deploy_sha"
cmp "$candidate_script" deploy/shadowedvaca-shared-host-deploy.sh

install -d -m 0700 "$backup_root"
rm -rf -- "$next_static"
install -d -m 0700 "$next_static"
if [ -d "$web_root" ]; then
  cp -a "$web_root"/. "$next_static"/
else
  install -d -m 0755 "$web_root"
fi

static_mutation_started=true
find "$web_root" -mindepth 1 -maxdepth 1 ! -name .well-known \
  -exec rm -rf -- {} +
cp -a "$stage_dir"/. "$web_root"/
printf '%s\n' "$deploy_sha" > "$web_root/.deployment-sha"
chmod 0444 "$web_root/.deployment-sha"

if docker image inspect "$image_name" >/dev/null 2>&1; then
  docker image tag "$image_name" "$image_name:previous"
  prior_image_available=true
fi
api_mutation_started=true
compose build app
compose up -d --force-recreate app

health="$(
  curl --fail --silent --show-error \
    --retry 10 --retry-delay 2 --retry-connrefused \
    http://127.0.0.1:8200/api/health
)"
printf '%s' "$health" | python3 -c \
  'import json,sys; assert json.load(sys.stdin)=={"ok": True}'
test "$(cat "$web_root/.deployment-sha")" = "$deploy_sha"
test "$(git rev-parse HEAD)" = "$deploy_sha"
compose ps --status running --services | grep -qx app

rm -rf -- "$previous_static"
mv "$next_static" "$previous_static"
static_mutation_started=false
api_mutation_started=false
echo "Shadowedvaca $environment deployment identity verified at commit $deploy_sha"
