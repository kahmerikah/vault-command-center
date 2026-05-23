from flask import request
from flask_jwt_extended import decode_token
from flask_socketio import ConnectionRefusedError
from flask_socketio import join_room, leave_room


CONNECTED_SIDS = set()
CONNECTED_USERS = {}


def socket_health():
    return {
        "connected_clients": len(CONNECTED_SIDS),
        "connected_users": len(CONNECTED_USERS),
    }


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

        CONNECTED_SIDS.add(request.sid)
        CONNECTED_USERS[request.sid] = user_id
        join_room(f"user:{user_id}")
        join_room("ops")
        join_room("engine")

        socketio.emit(
            "system:hello",
            {"message": "connected", "sid": request.sid, "user_id": user_id},
            to=request.sid,
        )
        socketio.emit("engine:ready", {"ok": True, "user_id": user_id}, to=request.sid)

    @socketio.on("disconnect")
    def on_disconnect():
        user_id = CONNECTED_USERS.pop(request.sid, None)
        CONNECTED_SIDS.discard(request.sid)
        if user_id:
            leave_room(f"user:{user_id}")
        leave_room("ops")
        leave_room("engine")

    @socketio.on("dashboard:subscribe")
    def on_dashboard_subscribe(payload):
        stream = (payload or {}).get("stream", "main")
        join_room(f"dashboard:{stream}")
        socketio.emit("dashboard:subscribed", {"ok": True, "payload": payload or {}}, to=request.sid)

    @socketio.on("engine:subscribe")
    def on_engine_subscribe(payload):
        payload = payload or {}
        for room in payload.get("rooms", ["engine"]):
            if room:
                join_room(room)
        socketio.emit("engine:subscribed", {"ok": True, "rooms": payload.get("rooms", ["engine"])}, to=request.sid)
