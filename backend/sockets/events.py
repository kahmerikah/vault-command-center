from flask import request
from flask_jwt_extended import decode_token
from flask_socketio import ConnectionRefusedError


def register_socket_events(socketio):
    @socketio.on("connect")
    def on_connect(auth):
        token = (auth or {}).get("token") if isinstance(auth, dict) else None
        if not token:
            raise ConnectionRefusedError("authentication required")

        try:
            decoded = decode_token(token)
        except Exception as exc:
            raise ConnectionRefusedError("invalid token") from exc

        user_id = decoded.get("sub")
        if not user_id:
            raise ConnectionRefusedError("invalid token")

        socketio.emit(
            "system:hello",
            {"message": "connected", "sid": request.sid, "user_id": user_id},
            to=request.sid,
        )

    @socketio.on("dashboard:subscribe")
    def on_dashboard_subscribe(payload):
        socketio.emit("dashboard:subscribed", {"ok": True, "payload": payload or {}}, to=request.sid)
