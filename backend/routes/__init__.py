from backend.auth.oauth import oauth_providers_config
from backend.routes.analytics import analytics_bp
from backend.routes.api_gateway import gateway_bp
from backend.routes.auth import auth_bp
from backend.routes.blockchain import blockchain_bp
from backend.routes.bookings import bookings_bp
from backend.routes.contacts import contacts_bp
from backend.routes.briefing import briefing_bp
from backend.routes.dashboard import dashboard_bp
from backend.routes.engine import engine_bp
from backend.routes.membership import membership_bp
from backend.routes.os_layer import os_bp
from backend.routes.financial import financial_bp
from backend.routes.health import health_bp
from backend.routes.integrations import integrations_bp
from backend.routes.knowledge import knowledge_bp
from backend.routes.mobile import mobile_bp
from backend.routes.modules import modules_bp
from backend.routes.notifications import notifications_bp
from backend.routes.ops import ops_bp
from backend.routes.payments import payments_bp
from backend.routes.property import property_bp
from backend.payments.webhooks import webhook_bp


def register_routes(app):
    version = app.config["API_VERSION"]
    base = f"/api/{version}"

    app.register_blueprint(health_bp, url_prefix=base)
    app.register_blueprint(engine_bp, url_prefix=f"{base}/engine")
    app.register_blueprint(gateway_bp, url_prefix=f"{base}/gateway")
    app.register_blueprint(auth_bp, url_prefix=f"{base}/auth")
    app.register_blueprint(dashboard_bp, url_prefix=f"{base}/dashboard")
    app.register_blueprint(ops_bp, url_prefix=f"{base}/ops")
    app.register_blueprint(modules_bp, url_prefix=f"{base}/modules")
    app.register_blueprint(payments_bp, url_prefix=f"{base}/payments")
    app.register_blueprint(notifications_bp, url_prefix=f"{base}/notifications")
    app.register_blueprint(bookings_bp, url_prefix=f"{base}/bookings")
    app.register_blueprint(contacts_bp, url_prefix=f"{base}/contacts")
    app.register_blueprint(blockchain_bp, url_prefix=f"{base}/blockchain")
    app.register_blueprint(analytics_bp, url_prefix=f"{base}/analytics")
    app.register_blueprint(webhook_bp, url_prefix=f"{base}/webhooks")
    # New OS layers
    app.register_blueprint(financial_bp, url_prefix=f"{base}/financial")
    app.register_blueprint(property_bp, url_prefix=f"{base}/property")
    app.register_blueprint(integrations_bp, url_prefix=f"{base}/integrations")
    app.register_blueprint(knowledge_bp, url_prefix=f"{base}/knowledge")
    app.register_blueprint(briefing_bp, url_prefix=f"{base}/briefing")
    app.register_blueprint(mobile_bp, url_prefix=f"{base}/mobile")
    app.register_blueprint(membership_bp, url_prefix=f"{base}/membership")
    app.register_blueprint(os_bp, url_prefix=f"{base}/os")

    app.config["OAUTH_PROVIDERS"] = oauth_providers_config()
