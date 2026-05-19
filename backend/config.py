import os
from datetime import timedelta
from time import time


class Config:
    STARTED_AT_EPOCH = int(time())
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///vault.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "30"))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "30"))
    )
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
    API_VERSION = os.getenv("API_VERSION", "v1")
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", FRONTEND_ORIGIN).split(",")
        if origin.strip()
    ]
    STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "local")
    LOCAL_STORAGE_PATH = os.getenv("LOCAL_STORAGE_PATH", "./storage")
    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
    SYSTEM_USERNAME = os.getenv("SYSTEM_USERNAME", "system")
    SYSTEM_EMAIL = os.getenv("SYSTEM_EMAIL", "system@localhost")
    SYSTEM_PASSWORD = os.getenv("SYSTEM_PASSWORD", "")
    PLATFORM_GENESIS_SUPPLY = int(os.getenv("PLATFORM_GENESIS_SUPPLY", "1000000"))
    PASSWORD_RESET_TOKEN_EXP_SECONDS = int(os.getenv("PASSWORD_RESET_TOKEN_EXP_SECONDS", "1800"))
    # Plaid
    PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID", "")
    PLAID_SECRET = os.getenv("PLAID_SECRET", "")
    PLAID_ENV = os.getenv("PLAID_ENV", "sandbox")
    # Dwolla
    DWOLLA_KEY = os.getenv("DWOLLA_KEY", "")
    DWOLLA_SECRET = os.getenv("DWOLLA_SECRET", "")
    DWOLLA_ENV = os.getenv("DWOLLA_ENV", "sandbox")
    # Property Intelligence
    RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
    RAPIDAPI_HOST_ZILLOW = os.getenv("RAPIDAPI_HOST_ZILLOW", "zillow-com1.p.rapidapi.com")
    # Weather (for briefings)
    OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
    # Google Calendar
    GOOGLE_CALENDAR_CLIENT_ID = os.getenv("GOOGLE_CALENDAR_CLIENT_ID", "")
    GOOGLE_CALENDAR_CLIENT_SECRET = os.getenv("GOOGLE_CALENDAR_CLIENT_SECRET", "")
