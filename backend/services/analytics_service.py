from backend.extensions import db
from backend.models import AnalyticsEvent


class AnalyticsService:
    @staticmethod
    def track(module_key: str, event_type: str, payload=None, user_id=None):
        event = AnalyticsEvent(
            module_key=module_key, event_type=event_type, payload=payload or {}, user_id=user_id
        )
        db.session.add(event)
        db.session.commit()
        return event
