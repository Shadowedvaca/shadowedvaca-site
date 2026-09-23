"""Static and local contracts for shared non-production deployments."""

from pathlib import Path
import subprocess
import time


ROOT = Path(__file__).resolve().parents[1]
DEV_WORKFLOW = ROOT / ".github/workflows/deploy-dev.yml"
TEST_WORKFLOW = ROOT / ".github/workflows/deploy-test.yml"
PROD_WORKFLOW = ROOT / ".github/workflows/deploy.yml"
DEPLOY_SCRIPT = ROOT / "deploy/shadowedvaca-shared-host-deploy.sh"


def test_nonproduction_workflows_stage_and_activate_one_immutable_commit():
    for path, environment in (
        (DEV_WORKFLOW, "development"),
        (TEST_WORKFLOW, "test"),
    ):
        source = path.read_text(encoding="utf-8")

        for required in (
            "timeout-minutes: 75",
            "cancel-in-progress: false",
            "contents: read",
            'sha="$(git rev-parse HEAD)"',
            "steps.release.outputs.sha",
            "Package immutable static artifact",
            "Stage inactive exact-SHA deployment artifacts",
            "deploy/shadowedvaca-shared-host-deploy.sh",
            f"shadowedvaca-site-{environment}-$DEPLOY_SHA.tar.gz",
            f"'$DEPLOY_SHA' {environment}",
            f"https://{'dev' if environment == 'development' else 'test'}.shadowedvaca.com/api/health",
            "StrictHostKeyChecking=yes",
            "--retry-all-errors",
            "Remove runner SSH material",
        ):
            assert required in source

        assert source.index("Package immutable static artifact") < source.index(
            "Stage inactive exact-SHA deployment artifacts"
        ) < source.index(f"Activate exact-SHA {environment} deployment")

        for forbidden in (
            "git pull",
            "docker system prune",
            "docker builder prune",
            "docker image prune",
            "docker volume prune",
            "StrictHostKeyChecking=no",
        ):
            assert forbidden not in source


def test_shared_host_script_admits_before_any_active_mutation():
    source = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    for required in (
        "/run/lock/shared-platform-deployment.lock",
        "flock -w 2700 9",
        "trap release_lock EXIT",
        "root_available_kib",
        "swap_total_kib",
        "headroom_kib",
        'test "$root_available_kib" -ge 12582912',
        'test "$swap_total_kib" -ge 1048576',
        'test "$headroom_kib" -ge 2097152',
        'git checkout --detach "$deploy_sha"',
        'cmp "$candidate_script" deploy/shadowedvaca-shared-host-deploy.sh',
        'backup_root="/opt/backups/shadowedvaca-site/$environment"',
        'printf \'%s\\n\' "$deploy_sha" > "$web_root/.deployment-sha"',
        'compose logs --no-color --tail 100 app db',
        'docker image tag "$image_name:previous" "$image_name"',
        'compose up -d --no-build --force-recreate app',
        "App rollback to the prior scoped image verified healthy",
        "Restored prior static files after failed deployment",
        "--retry-all-errors",
        'exit "$status"',
        "deployment identity verified at commit $deploy_sha",
    ):
        assert required in source

    lock = source.index("flock -w 2700 9")
    admission = source.index("root_available_kib=")
    checkout = source.index('git checkout --detach "$deploy_sha"')
    static_activation = source.index(
        'find "$web_root" -mindepth 1 -maxdepth 1 ! -name .well-known', checkout
    )
    build = source.index("compose build app")
    health = source.index("\nlocal_health\n", build)
    identity = source.index("deployment identity verified at commit")
    assert lock < admission < checkout < static_activation < build < health < identity
    assert source.count("! -name .well-known") == 2

    for forbidden in (
        "docker system prune",
        "docker builder prune",
        "docker image prune",
        "docker volume prune",
        "docker compose down",
        "/var/www/shadowedvaca.com",
        "docker-compose.prod.yml",
    ):
        assert forbidden not in source


def test_common_flock_serializes_contenders(tmp_path):
    lock_path = tmp_path / "shared-platform-deployment.lock"
    holder = subprocess.Popen(
        [
            "bash",
            "-c",
            'exec 9>"$1"; flock 9; printf ready; sleep 0.35',
            "holder",
            str(lock_path),
        ],
        stdout=subprocess.PIPE,
        text=True,
    )
    assert holder.stdout is not None
    assert holder.stdout.read(5) == "ready"

    started = time.monotonic()
    subprocess.run(
        [
            "bash",
            "-c",
            'exec 9>"$1"; flock -w 2 9',
            "contender",
            str(lock_path),
        ],
        check=True,
    )
    elapsed = time.monotonic() - started
    holder.wait(timeout=2)
    assert elapsed >= 0.2


def test_production_workflow_is_not_part_of_the_shared_host_change():
    source = PROD_WORKFLOW.read_text(encoding="utf-8")
    assert "/run/lock/shared-platform-deployment.lock" not in source
    assert "PROD_HOST" in source
    assert "prod-v*" in source
