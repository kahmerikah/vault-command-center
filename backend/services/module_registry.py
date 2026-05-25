from backend.engine.runtime import get_engine_runtime


class ModuleRegistry:
    def __init__(self, app):
        self.app = app

    def bootstrap_from_manifests(self, modules_root: str):
        with self.app.app_context():
            runtime = get_engine_runtime()
            runtime.modules.bootstrap_from_manifests(modules_root)
