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

    @socketio.on("disconnect")
    def on_disconnect():
        user_id = CONNECTED_USERS.pop(request.sid, None)
        CONNECTED_SIDS.discard(request.sid)
        if user_id:
            leave_room(f"user:{user_id}")
        leave_room("ops")

    @socketio.on("dashboard:subscribe")
    def on_dashboard_subscribe(payload):
        stream = (payload or {}).get("stream", "main")
        join_room(f"dashboard:{stream}")
        socketio.emit("dashboard:subscribed", {"ok": True, "payload": payload or {}}, to=request.sid)

    @socketio.on("engine:subscribe")
    def on_engine_subscribe(payload):
        channel = (payload or {}).get("channel", "engine")
        join_room(channel)
        socketio.emit("engine:subscribed", {"ok": True, "channel": channel}, to=request.sid)

    @socketio.on("module:subscribe")
    def on_module_subscribe(payload):
        module_key = (payload or {}).get("module_key")
        if not module_key:
            socketio.emit("module:subscribed", {"ok": False, "error": "module_key required"}, to=request.sid)
            return

        room = f"module:{module_key}"
        join_room(room)
        socketio.emit("module:subscribed", {"ok": True, "module_key": module_key}, to=request.sid)
