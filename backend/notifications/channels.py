from backend.services.notification_service import NotificationService


def send_in_app(user_id: str, title: str, body: str):
    return NotificationService.create(user_id=user_id, title=title, body=body, channel="in_app")


def send_email(user_id: str, title: str, body: str):
    # TODO: Implement SMTP provider integration with retries and templates.
    return NotificationService.create(user_id=user_id, title=title, body=body, channel="email")


def send_sms(user_id: str, title: str, body: str):
    # TODO: Implement SMS provider integration (Twilio/Vonage).
    return NotificationService.create(user_id=user_id, title=title, body=body, channel="sms")
