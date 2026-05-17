from backend.app import create_app
from backend.extensions import db
from backend.models import ActivityLog, RegisteredModule
from backend.services.auth_service import AuthService


def seed():
    app = create_app()
    with app.app_context():
        db.create_all()
        AuthService.bootstrap_roles()

        if not RegisteredModule.query.first():
            db.session.add(
                RegisteredModule(
                    key="core",
                    name="Core",
                    description="Core SOMB Vault runtime module",
                    route_prefix="/api/v1/core",
                    is_enabled=True,
                )
            )

        if not ActivityLog.query.first():
            db.session.add(ActivityLog(level="info", message="Vault seeded", metadata={"source": "seed_demo_data"}))

        db.session.commit()


if __name__ == "__main__":
    seed()
    print("Seed complete")
