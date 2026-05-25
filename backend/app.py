import logging
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path

from flask import Flask
from backend.config import Config
from backend.engine.runtime import EngineRuntime, set_engine_runtime
from backend.extensions import cors, db, jwt, limiter, migrate, socketio
from backend.middleware.request_context import request_context_middleware
from backend.middleware.security import apply_security_headers
from backend.models import *  # noqa: F403,F401
from backend.routes import register_routes
from backend.services.auth_service import AuthService
from backend.services.blockchain_service import BlockchainService
from backend.services.knowledge_service import KnowledgeService
from backend.sockets.events import register_socket_events
from backend.utils.logger import configure_logging


@contextmanager
def _database_bootstrap_lock():
    lock_path = Path(tempfile.gettempdir()) / "somb_vault_db_bootstrap.lock"
    with open(lock_path, "w") as lock_file:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_file, fcntl.LOCK_EX)

        try:
            yield
        finally:
            if os.name == "nt":
                import msvcrt

                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(lock_file, fcntl.LOCK_UN)


def _ensure_booking_columns():
    columns = {
        "title": "VARCHAR(255)",
        "event_type": "VARCHAR(64)",
        "location": "VARCHAR(512)",
        "description": "TEXT",
        "attendees": "JSON",
        "tags": "JSON",
        "priority": "VARCHAR(16)",
        "color": "VARCHAR(16)",
        "is_public": "BOOLEAN NOT NULL DEFAULT FALSE",
        "is_all_day": "BOOLEAN NOT NULL DEFAULT FALSE",
        "recurrence_rule": "VARCHAR(256)",
        "linked_module": "VARCHAR(64)",
        "linked_entity_id": "VARCHAR(36)",
    }

    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    if "bookings" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("bookings")}
    use_if_not_exists = db.engine.dialect.name != "sqlite"
    statements = []
    for name, ddl in columns.items():
        if name in existing_columns:
            continue
        clause = f"ADD COLUMN IF NOT EXISTS {name} {ddl}" if use_if_not_exists else f"ADD COLUMN {name} {ddl}"
        statements.append(f"ALTER TABLE bookings {clause}")
    if not statements:
        return

    for statement in statements:
        db.session.execute(text(statement))
    db.session.commit()


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    configure_logging(app)

    cors.init_app(app, origins=app.config["ALLOWED_ORIGINS"], supports_credentials=True)
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)
    socketio.init_app(app, cors_allowed_origins=app.config["ALLOWED_ORIGINS"])

    @jwt.token_in_blocklist_loader
    def is_token_revoked(_jwt_header, jwt_payload):
        token_type = jwt_payload.get("type")
        if token_type != "refresh":
            return False

        jti = jwt_payload.get("jti")
        if not jti:
            return True

        from backend.models import Session  # Lazy import avoids circular model loading during app init.

        session = Session.query.filter_by(refresh_token_jti=jti, is_revoked=False).first()
        return session is None

    request_context_middleware(app)
    apply_security_headers(app)

    with app.app_context():
        # Bootstrap in one place so fresh installs can run without a manual migration step.
        with _database_bootstrap_lock():
            db.create_all()
        _ensure_booking_columns()
        AuthService.bootstrap_roles()
        system_user = AuthService.bootstrap_system_user(
            username=app.config["SYSTEM_USERNAME"],
            email=app.config["SYSTEM_EMAIL"],
            password=app.config["SYSTEM_PASSWORD"],
        )
        if system_user:
            BlockchainService.bootstrap_platform_chain(
                system_user_id=system_user.id,
                genesis_supply=app.config["PLATFORM_GENESIS_SUPPLY"],
            )
            # Keep canonical platform knowledge/patterns indexed for reuse.
            try:
                KnowledgeService.ensure_platform_knowledge(user_id=system_user.id)
            except Exception:
                app.logger.warning("Knowledge bootstrap skipped during app init", exc_info=True)

        engine = EngineRuntime(app)
        engine.bootstrap("modules")
        set_engine_runtime(engine)

    register_routes(app)
    register_socket_events(socketio)

    app.logger.setLevel(logging.INFO)
    app.logger.info("The SOMB Vault initialized")
    return app
