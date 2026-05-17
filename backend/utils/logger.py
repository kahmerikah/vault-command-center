import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def configure_logging(app):
    logs_dir = Path("logs")
    logs_dir.mkdir(exist_ok=True)
    handler = RotatingFileHandler(logs_dir / "vault.log", maxBytes=2_000_000, backupCount=5)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s [%(message)s]")
    )
    app.logger.addHandler(handler)
