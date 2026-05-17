from pathlib import Path
from flask import current_app


class StorageProvider:
    def save_bytes(self, relative_path: str, payload: bytes) -> str:
        raise NotImplementedError


class LocalStorageProvider(StorageProvider):
    def save_bytes(self, relative_path: str, payload: bytes) -> str:
        base = Path(current_app.config["LOCAL_STORAGE_PATH"])
        absolute_path = base / relative_path
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_bytes(payload)
        return str(absolute_path)


def get_storage_provider() -> StorageProvider:
    provider = current_app.config.get("STORAGE_PROVIDER", "local")
    if provider == "local":
        return LocalStorageProvider()
    # TODO: Add cloud storage adapter implementations (S3/GCS/Azure).
    return LocalStorageProvider()
