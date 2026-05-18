import logging
from flask import Flask
from backend.config import Config
from backend.extensions import cors, db, jwt, limiter, migrate, socketio
from backend.middleware.request_context import request_context_middleware
from backend.middleware.security import apply_security_headers
from backend.models import *  # noqa: F403,F401
from backend.routes import register_routes
from backend.services.auth_service import AuthService
from backend.services.blockchain_service import BlockchainService
from backend.services.module_registry import ModuleRegistry
from backend.sockets.events import register_socket_events
from backend.utils.logger import configure_logging


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
        db.create_all()
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

    ModuleRegistry(app).bootstrap_from_manifests("modules")
    register_routes(app)
    register_socket_events(socketio)

    app.logger.setLevel(logging.INFO)
    app.logger.info("The SOMB Vault initialized")
    return app
