import json
from pathlib import Path
from backend.extensions import db
from backend.models import RegisteredModule


class ModuleRegistry:
    def __init__(self, app):
        self.app = app

    def bootstrap_from_manifests(self, modules_root: str):
        root = Path(modules_root)
        if not root.exists():
            return

        with self.app.app_context():
            for module_dir in root.iterdir():
                manifest = module_dir / "module.json"
                if not manifest.exists():
                    continue
                payload = json.loads(manifest.read_text(encoding="utf-8"))
                current = RegisteredModule.query.filter_by(key=payload["key"]).first()
                if current:
                    current.name = payload.get("name", current.name)
                    current.description = payload.get("description", current.description)
                    current.route_prefix = payload.get("route_prefix", current.route_prefix)
                    current.is_enabled = payload.get("is_enabled", current.is_enabled)
                else:
                    db.session.add(
                        RegisteredModule(
                            key=payload["key"],
                            name=payload.get("name", payload["key"]),
                            description=payload.get("description", ""),
                            route_prefix=payload.get("route_prefix", f"/api/v1/{payload['key']}"),
                            is_enabled=payload.get("is_enabled", True),
                        )
                    )
            db.session.commit()
