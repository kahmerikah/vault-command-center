"""Morning and night briefing service.

Assembles a structured briefing payload from live system data.
"""
from datetime import datetime, date
import os
import requests
from backend.extensions import db
from backend.models.booking import Booking
from backend.models.knowledge import BriefingLog
from backend.models.notification import Notification
from backend.models.payment import Payment
from backend.analytics.metrics import dashboard_metrics
from backend.services.activity_service import ActivityService


def _weather(zip_code: str = "90001") -> dict:
    api_key = os.getenv("OPENWEATHER_API_KEY", "")
    if not api_key:
        return {"error": "OPENWEATHER_API_KEY not set"}
    try:
        resp = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"zip": f"{zip_code},US", "appid": api_key, "units": "imperial"},
            timeout=5,
        )
        if resp.ok:
            data = resp.json()
            return {
                "condition": (data.get("weather") or [{}])[0].get("description", ""),
                "temp_f": data.get("main", {}).get("temp"),
                "humidity": data.get("main", {}).get("humidity"),
                "location": data.get("name"),
            }
        return {"error": resp.text[:100]}
    except Exception as exc:
        return {"error": str(exc)}


class BriefingService:
    @staticmethod
    def morning(user_id: str, zip_code: str = "90001") -> dict:
        today = date.today()
        try:
            upcoming_bookings = (
                Booking.query
                .filter_by(user_id=user_id)
                .filter(Booking.starts_at >= datetime.utcnow())
                .order_by(Booking.starts_at)
                .limit(5)
                .all()
            )
            unread_notifications = Notification.query.filter_by(user_id=user_id, is_read=False).count()
            metrics = dashboard_metrics(user_id=user_id)
        except Exception:
            upcoming_bookings = []
            unread_notifications = 0
            metrics = {}

        payload = {
            "kind": "morning",
            "date": today.isoformat(),
            "generated_at": datetime.utcnow().isoformat(),
            "weather": _weather(zip_code),
            "calendar": [
                {
                    "id": b.id,
                    "module": b.module_key,
                    "starts_at": b.starts_at.isoformat(),
                    "ends_at": b.ends_at.isoformat(),
                    "status": b.status,
                }
                for b in upcoming_bookings
            ],
            "finances": {
                "stripe_revenue": metrics.get("stripe_revenue_total") or 0,
                "total_payments": metrics.get("payments_total") or 0,
            },
            "system": {
                "active_users": metrics.get("users_total") or 0,
                "api_calls": metrics.get("api_calls_total") or 0,
                "notifications_unread": unread_notifications,
            },
            "priorities": [
                "Review open bookings" if upcoming_bookings else None,
                "Check unread notifications" if unread_notifications else None,
                "Review server health",
            ],
        }
        payload["priorities"] = [p for p in payload["priorities"] if p]

        try:
            log = BriefingLog(user_id=user_id, kind="morning", payload=payload)
            db.session.add(log)
            db.session.commit()
            ActivityService.log(actor_id=user_id, message="Morning briefing generated", level="info")
        except Exception:
            db.session.rollback()
        return payload

    @staticmethod
    def night(user_id: str) -> dict:
        today = date.today()
        try:
            todays_payments = (
                Payment.query
                .filter(Payment.user_id == user_id)
                .filter(db.func.date(Payment.created_at) == today)
                .all()
            )
            revenue_today = sum(float(p.amount) for p in todays_payments if float(p.amount or 0) > 0)
            metrics = dashboard_metrics(user_id=user_id)
            recent_notifications = (
                Notification.query
                .filter_by(user_id=user_id)
                .order_by(Notification.created_at.desc())
                .limit(10)
                .all()
            )
        except Exception:
            todays_payments = []
            revenue_today = 0
            metrics = {}
            recent_notifications = []

        payload = {
            "kind": "night",
            "date": today.isoformat(),
            "generated_at": datetime.utcnow().isoformat(),
            "spending_summary": {
                "revenue_today": revenue_today,
                "total_payments_today": len(todays_payments),
            },
            "notifications_today": [
                {"id": n.id, "title": n.title, "body": n.body}
                for n in recent_notifications
            ],
            "system_alerts": {
                "active_users": metrics.get("users_total") or 0,
                "error_hint": "Check logs if health checks failed",
            },
            "tomorrow_prep": {
                "hint": "Review scheduled bookings and financial routing rules",
            },
        }

        try:
            log = BriefingLog(user_id=user_id, kind="night", payload=payload)
            db.session.add(log)
            db.session.commit()
            ActivityService.log(actor_id=user_id, message="Night briefing generated", level="info")
        except Exception:
            db.session.rollback()
        return payload
