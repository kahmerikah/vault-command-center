import os


def oauth_providers_config():
    google_client_id = os.getenv("GOOGLE_CALENDAR_CLIENT_ID", "").strip()
    google_client_secret = os.getenv("GOOGLE_CALENDAR_CLIENT_SECRET", "").strip()
    google_redirect_uri = os.getenv("GOOGLE_CALENDAR_REDIRECT_URI", "").strip()

    microsoft_client_id = os.getenv("MICROSOFT_CLIENT_ID", "").strip()
    microsoft_client_secret = os.getenv("MICROSOFT_CLIENT_SECRET", "").strip()
    microsoft_redirect_uri = os.getenv("MICROSOFT_REDIRECT_URI", "").strip()
    microsoft_tenant_id = os.getenv("MICROSOFT_TENANT_ID", "common").strip() or "common"

    return {
        "google": {
            "enabled": bool(google_client_id and google_client_secret and google_redirect_uri),
            "client_id": google_client_id,
            "redirect_uri": google_redirect_uri,
            "scopes": [scope for scope in os.getenv("GOOGLE_CALENDAR_SCOPES", "").split() if scope],
            "calendar_provider": True,
        },
        "microsoft": {
            "enabled": bool(microsoft_client_id and microsoft_client_secret and microsoft_redirect_uri),
            "client_id": microsoft_client_id,
            "redirect_uri": microsoft_redirect_uri,
            "tenant_id": microsoft_tenant_id,
            "scopes": [scope for scope in os.getenv("MICROSOFT_SCOPES", "").split() if scope],
            "calendar_provider": True,
        },
        "ical": {
            "enabled": True,
            "calendar_provider": True,
            "mode": "ics_or_caldav",
        },
        "zillow": {
            "enabled": bool(os.getenv("RAPIDAPI_KEY", "").strip()),
            "calendar_provider": False,
            "mode": "server_side_api",
        },
    }
