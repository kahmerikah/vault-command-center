from __future__ import annotations

from datetime import datetime
from pathlib import Path
import shutil
import subprocess


class SystemSyncService:
    @staticmethod
    def pull_and_sync_env() -> dict:
        repo_root = Path(__file__).resolve().parents[2]
        try:
            pull_result = SystemSyncService._git_pull(repo_root)
            env_result = SystemSyncService._sync_env_from_example(repo_root)
            return {
                "ok": True,
                "repo_root": str(repo_root),
                "git": pull_result,
                "env_sync": env_result,
            }
        except Exception as exc:
            return {
                "ok": False,
                "repo_root": str(repo_root),
                "error": str(exc),
                "git": {"fetch_ok": False, "pull_ok": False},
                "env_sync": {"ok": False},
            }

    @staticmethod
    def _git_pull(repo_root: Path) -> dict:
        try:
            fetch = subprocess.run(
                ["git", "fetch", "origin"],
                cwd=repo_root,
                capture_output=True,
                text=True,
            )
            pull = subprocess.run(
                ["git", "pull", "origin", "master"],
                cwd=repo_root,
                capture_output=True,
                text=True,
            )
            head = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=repo_root,
                capture_output=True,
                text=True,
            )
            return {
                "fetch_ok": fetch.returncode == 0,
                "pull_ok": pull.returncode == 0,
                "fetch_output": (fetch.stdout + fetch.stderr).strip(),
                "pull_output": (pull.stdout + pull.stderr).strip(),
                "head": head.stdout.strip(),
            }
        except FileNotFoundError:
            return {
                "fetch_ok": False,
                "pull_ok": False,
                "fetch_output": "git binary not installed in backend container",
                "pull_output": "git binary not installed in backend container",
                "head": "",
            }

    @staticmethod
    def _sync_env_from_example(repo_root: Path) -> dict:
        env_path = repo_root / ".env"
        example_path = repo_root / ".env.example"

        if not example_path.exists():
            return {"ok": False, "error": ".env.example not found"}

        existing_lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
        example_lines = example_path.read_text(encoding="utf-8").splitlines()

        existing_map = SystemSyncService._parse_env_map(existing_lines)
        example_map = SystemSyncService._parse_env_map(example_lines)

        backup_path = None
        if env_path.exists():
            ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
            backup_path = repo_root / f".env.backup.{ts}"
            shutil.copy2(env_path, backup_path)

        output_lines = []
        seen_keys = set()
        added_keys = []

        for raw_line in example_lines:
            line = raw_line.rstrip("\n")
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in line:
                output_lines.append(line)
                continue

            key, default_value = line.split("=", 1)
            key = key.strip()
            seen_keys.add(key)
            if key in existing_map:
                output_lines.append(f"{key}={existing_map[key]}")
            else:
                output_lines.append(f"{key}={default_value}")
                added_keys.append(key)

        extra_keys = [key for key in existing_map.keys() if key not in seen_keys]
        if extra_keys:
            output_lines.append("")
            output_lines.append("# Preserved extra keys from existing .env")
            for key in extra_keys:
                output_lines.append(f"{key}={existing_map[key]}")

        env_path.write_text("\n".join(output_lines) + "\n", encoding="utf-8")

        return {
            "ok": True,
            "backup_path": str(backup_path) if backup_path else None,
            "added_keys": added_keys,
            "preserved_extra_keys": extra_keys,
            "example_keys_count": len(example_map),
            "final_keys_count": len(SystemSyncService._parse_env_map(output_lines)),
        }

    @staticmethod
    def _parse_env_map(lines: list[str]) -> dict:
        result = {}
        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            result[key.strip()] = value
        return result
