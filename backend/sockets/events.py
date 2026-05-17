from flask import request


def register_socket_events(socketio):
    @socketio.on("connect")
    def on_connect():
        socketio.emit("system:hello", {"message": "Connected to The SOMB Vault", "sid": request.sid})

    @socketio.on("dashboard:subscribe")
    def on_dashboard_subscribe(payload):
        socketio.emit("dashboard:subscribed", {"ok": True, "payload": payload or {}})
