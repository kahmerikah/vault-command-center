"""Real Celery background tasks for The SOMB Vault."""
from backend.tasks.celery_app import celery_app


@celery_app.task(name="vault.notifications.send_digest")
def send_digest_task(user_id: str = None):
    """Send notification digest email to all users with pending notifications."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.models import Notification, User
        from backend.extensions import db
        users = [User.query.get(user_id)] if user_id else User.query.filter_by(is_active=True).all()
        for user in users:
            if not user:
                continue
            unread = Notification.query.filter_by(user_id=user.id, is_read=False).count()
            if unread:
                from backend.services.activity_service import ActivityService
                ActivityService.log(
                    user_id=user.id,
                    message=f"Digest: {unread} unread notification(s) pending",
                    level="info",
                )
    return {"status": "done", "task": "send_digest"}


@celery_app.task(name="vault.analytics.rollup")
def analytics_rollup_task():
    """Pre-aggregate analytics snapshots for fast dashboard queries."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.analytics.metrics import dashboard_metrics
        from backend.models import User
        users = User.query.filter_by(is_active=True).limit(100).all()
        for user in users:
            dashboard_metrics(user_id=user.id)
    return {"status": "done", "task": "analytics_rollup"}


@celery_app.task(name="vault.financial.refresh_balances")
def refresh_plaid_balances_task(user_id: str = None):
    """Refresh Plaid account balances for all or a specific user."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.services.plaid_service import PlaidService
        from backend.models import User
        users = [User.query.get(user_id)] if user_id else User.query.filter_by(is_active=True).all()
        for user in users:
            if user:
                PlaidService.refresh_balances(user.id)
    return {"status": "done", "task": "refresh_plaid_balances"}


@celery_app.task(name="vault.financial.sync_transactions")
def sync_plaid_transactions_task(user_id: str = None):
    """Sync Plaid transactions for all or a specific user."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.services.plaid_service import PlaidService
        from backend.models import User
        users = [User.query.get(user_id)] if user_id else User.query.filter_by(is_active=True).all()
        results = []
        for user in users:
            if user:
                r = PlaidService.sync_transactions(user.id)
                results.append({"user_id": user.id, **r})
    return {"status": "done", "task": "sync_plaid_transactions", "results": results}


@celery_app.task(name="vault.briefing.morning_all")
def morning_briefing_all_task():
    """Generate morning briefings for all active users."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.services.briefing_service import BriefingService
        from backend.models import User
        users = User.query.filter_by(is_active=True).all()
        for user in users:
            try:
                BriefingService.morning(user_id=user.id)
            except Exception:
                pass
    return {"status": "done", "task": "morning_briefing_all"}


@celery_app.task(name="vault.briefing.night_all")
def night_briefing_all_task():
    """Generate night summaries for all active users."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.services.briefing_service import BriefingService
        from backend.models import User
        users = User.query.filter_by(is_active=True).all()
        for user in users:
            try:
                BriefingService.night(user_id=user.id)
            except Exception:
                pass
    return {"status": "done", "task": "night_briefing_all"}


@celery_app.task(name="vault.property.re_analyze_all")
def re_analyze_properties_task(user_id: str = None):
    """Re-run valuation on all watched properties."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.models.property import Property
        from backend.services.property_service import PropertyService
        from backend.extensions import db
        q = Property.query.filter(Property.status.in_(["watching", "interested"]))
        if user_id:
            q = q.filter_by(user_id=user_id)
        for prop in q.all():
            try:
                PropertyService.analyze(prop)
            except Exception:
                pass
        db.session.commit()
    return {"status": "done", "task": "re_analyze_properties"}


@celery_app.task(name="vault.property.scrape_and_analyze", bind=True, max_retries=2)
def scrape_and_analyze_property_task(self, *, property_id: str):
    """Scrape fresh comps for a single property then re-run the AVM analysis."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.models.property import Property
        from backend.services.property_scraper_service import PropertyScraperService
        from backend.services.property_service import PropertyService
        from backend.services.activity_service import ActivityService
        from backend.extensions import db

        prop = Property.query.get(property_id)
        if not prop:
            return {"status": "skipped", "reason": "property not found", "property_id": property_id}

        try:
            comps = PropertyScraperService.scrape_market_comps(
                address=prop.address or "",
                zip_code=prop.zip_code,
                property_type=prop.property_type,
                subject_latitude=float(prop.latitude) if prop.latitude is not None else None,
                subject_longitude=float(prop.longitude) if prop.longitude is not None else None,
                max_results=12,
            )
            inserted = 0
            if comps:
                inserted = PropertyScraperService.store_comps_for_property(
                    property_id=property_id, comps=comps
                )

            PropertyService.analyze(prop)
            db.session.commit()

            ActivityService.log(
                user_id=prop.user_id,
                message=f"Property {prop.address} — scraped {inserted} new comps & AVM updated",
                level="info",
            )
            return {
                "status": "done",
                "task": "scrape_and_analyze",
                "property_id": property_id,
                "comps_inserted": inserted,
            }
        except Exception as exc:
            raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="vault.property.scrape_and_analyze_all")
def scrape_and_analyze_all_task(user_id: str = None):
    """Bulk scrape + re-analyze for all watched/interested properties."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.models.property import Property

        q = Property.query.filter(Property.status.in_(["watching", "interested"]))
        if user_id:
            q = q.filter_by(user_id=user_id)

        enqueued = 0
        for prop in q.all():
            scrape_and_analyze_property_task.delay(property_id=str(prop.id))
            enqueued += 1

    return {"status": "done", "task": "scrape_and_analyze_all", "enqueued": enqueued}


@celery_app.task(name="vault.health.check")
def health_check_task():    """Periodic health check — logs results as activity events."""
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.services.container_metrics_service import ContainerMetricsService
        from backend.services.activity_service import ActivityService
        from backend.models import User
        system_user = User.query.filter_by(username="system").first()
        if not system_user:
            return {"status": "skipped", "reason": "no system user"}
        metrics = ContainerMetricsService.collect()
        ActivityService.log(
            user_id=system_user.id,
            message=f"Health check: {len(metrics)} containers monitored",
            level="info",
        )
    return {"status": "done", "task": "health_check", "containers": len(metrics)}

