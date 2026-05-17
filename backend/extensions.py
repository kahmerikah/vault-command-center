from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
limiter = Limiter(key_func=get_remote_address, default_limits=["120 per minute"])
# eventlet is selected in gunicorn. Threading fallback keeps local dev simple.
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")
