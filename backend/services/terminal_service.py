from datetime import datetime

from backend.models import (
    ActivityLog,
    Booking,
    ChainTransaction,
    Notification,
    Payment,
    RegisteredModule,
    Session,
    User,
)


class TerminalService:
    @staticmethod
    def allowed_commands():
        return [
            "help",
            "status",
            "health",
            "users",
            "sessions",
            "payments",
            "bookings",
            "chain",
            "modules",
            "notifications",
            "activity",
        ]

    @staticmethod
    def dispatch(command: str):
        cmd = (command or "").strip().lower()
        if not cmd:
            return ["error: command is required"]
        if cmd not in TerminalService.allowed_commands():
            return [f"error: unsupported command '{cmd}'", "hint: run 'help' for available commands"]

        now = datetime.utcnow().isoformat() + "Z"

        if cmd == "help":
            return ["available commands:"] + [f"- {name}" for name in TerminalService.allowed_commands()]

        if cmd == "status":
            return [
                f"[{now}] vault operational snapshot",
                f"users={User.query.filter_by(is_active=True).count()}",
                f"sessions={Session.query.filter_by(is_revoked=False).count()}",
                f"payments={Payment.query.count()}",
                f"bookings={Booking.query.count()}",
                f"chain_tx={ChainTransaction.query.count()}",
                f"modules={RegisteredModule.query.filter_by(is_enabled=True).count()}",
            ]

        if cmd == "health":
            return [
                f"[{now}] health probes",
                "db=ok",
                "redis=check /health/system",
                "ws=check /health/system",
            ]

        if cmd == "users":
            rows = User.query.order_by(User.created_at.desc()).limit(10).all()
            return ["recent users:"] + [f"{row.username} active={row.is_active} verified={row.is_verified}" for row in rows]

        if cmd == "sessions":
            rows = Session.query.order_by(Session.created_at.desc()).limit(10).all()
            return ["recent sessions:"] + [
                f"{row.id[:8]} revoked={row.is_revoked} ip={row.ip_address or 'n/a'}" for row in rows
            ]

        if cmd == "payments":
            rows = Payment.query.order_by(Payment.created_at.desc()).limit(10).all()
            return ["recent payments:"] + [
                f"{row.provider_payment_id} status={row.status} amount={row.amount} {row.currency}" for row in rows
            ]

        if cmd == "bookings":
            rows = Booking.query.order_by(Booking.starts_at.desc()).limit(10).all()
            return ["recent bookings:"] + [
                f"{row.id[:8]} module={row.module_key} status={row.status} starts={row.starts_at.isoformat()}" for row in rows
            ]

        if cmd == "chain":
            rows = ChainTransaction.query.order_by(ChainTransaction.created_at.desc()).limit(10).all()
            return ["recent chain tx:"] + [
                f"{row.tx_hash} type={row.tx_type} amount={row.amount} status={row.status}" for row in rows
            ]

        if cmd == "modules":
            rows = RegisteredModule.query.order_by(RegisteredModule.name.asc()).all()
            return ["modules:"] + [
                f"{row.key} enabled={row.is_enabled} route={row.route_prefix}" for row in rows
            ]

        if cmd == "notifications":
            rows = Notification.query.order_by(Notification.created_at.desc()).limit(10).all()
            return ["recent notifications:"] + [
                f"{row.title} read={row.is_read} channel={row.channel}" for row in rows
            ]

        rows = ActivityLog.query.order_by(ActivityLog.created_at.desc()).limit(10).all()
        return ["recent activity:"] + [
            f"[{row.level}] {row.message}" for row in rows
        ]
