from flask_jwt_extended import create_access_token, create_refresh_token
from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer
from backend.auth.tokens import get_jti
from backend.extensions import db
from backend.models import Role, Session, User
from backend.utils.security import hash_password, verify_password


DEFAULT_ROLES = ["super_admin", "admin", "moderator", "seller", "member", "guest"]


class AuthService:
    @staticmethod
    def bootstrap_roles():
        for role_name in DEFAULT_ROLES:
            if not Role.query.filter_by(name=role_name).first():
                db.session.add(Role(name=role_name, description=f"{role_name} role"))
        db.session.commit()

    @staticmethod
    def bootstrap_system_user(username: str, email: str, password: str):
        if not password:
            return None

        role = Role.query.filter_by(name="super_admin").first()
        if not role:
            role = Role(name="super_admin", description="super admin role")
            db.session.add(role)
            db.session.commit()

        user = User.query.filter((User.username == username) | (User.email == email)).first()
        if user:
            changed = False
            if user.username != username:
                user.username = username
                changed = True
            if user.email != email:
                user.email = email
                changed = True
            if user.role_id != role.id:
                user.role_id = role.id
                changed = True
            if not user.is_verified:
                user.is_verified = True
                changed = True
            if not user.is_active:
                user.is_active = True
                changed = True
            try:
                user.password_hash = hash_password(password)
            except Exception:
                return None
            changed = True
            if changed:
                db.session.commit()
            return user

        user = User(
            username=username,
            email=email,
            password_hash="",
            role_id=role.id,
            is_verified=True,
            is_active=True,
        )
        try:
            user.password_hash = hash_password(password)
        except Exception:
            return None
        db.session.add(user)
        db.session.commit()
        return user

    @staticmethod
    def _reset_serializer(secret_key: str):
        return URLSafeTimedSerializer(secret_key=secret_key, salt="password-reset")

    @staticmethod
    def issue_password_reset_token(identity: str, secret_key: str):
        user = User.query.filter((User.username == identity) | (User.email == identity)).first()
        if not user:
            return None

        serializer = AuthService._reset_serializer(secret_key)
        return serializer.dumps({"uid": user.id})

    @staticmethod
    def reset_password_with_token(reset_token: str, new_password: str, secret_key: str, max_age_seconds: int):
        serializer = AuthService._reset_serializer(secret_key)

        try:
            payload = serializer.loads(reset_token, max_age=max_age_seconds)
        except SignatureExpired as exc:
            raise ValueError("reset token expired") from exc
        except BadData as exc:
            raise ValueError("invalid reset token") from exc

        user = User.query.filter_by(id=payload.get("uid")).first()
        if not user:
            raise ValueError("invalid reset token")

        user.password_hash = hash_password(new_password)
        Session.query.filter_by(user_id=user.id, is_revoked=False).update({"is_revoked": True})
        db.session.commit()
        return user

    @staticmethod
    def register(username: str, email: str, password: str, role_name: str = "member"):
        role = Role.query.filter_by(name=role_name).first()
        if not role:
            raise ValueError("invalid role")
        if User.query.filter((User.username == username) | (User.email == email)).first():
            raise ValueError("user already exists")

        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role_id=role.id,
            is_verified=False,
        )
        db.session.add(user)
        db.session.commit()
        return user

    @staticmethod
    def login(identity: str, password: str, user_agent: str = "", ip_address: str = ""):
        user = User.query.filter((User.username == identity) | (User.email == identity)).first()
        if not user or not verify_password(password, user.password_hash):
            raise ValueError("invalid credentials")
        if not user.is_active:
            raise ValueError("user is inactive")

        permissions = [permission.code for permission in user.role.permissions]
        claims = {"role": user.role.name, "username": user.username, "permissions": permissions}
        access = create_access_token(identity=user.id, additional_claims=claims)
        refresh = create_refresh_token(identity=user.id, additional_claims=claims)

        session = Session(
            user_id=user.id,
            refresh_token_jti=get_jti(refresh),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        db.session.add(session)
        db.session.commit()

        return {"access_token": access, "refresh_token": refresh, "user": user}

    @staticmethod
    def refresh(user_id: str, refresh_jti: str):
        user = User.query.filter_by(id=user_id).first()
        if not user or not user.is_active:
            raise ValueError("invalid session")

        session = Session.query.filter_by(refresh_token_jti=refresh_jti, user_id=user_id, is_revoked=False).first()
        if not session:
            raise ValueError("invalid session")

        permissions = [permission.code for permission in user.role.permissions]
        claims = {"role": user.role.name, "username": user.username, "permissions": permissions}
        new_access = create_access_token(identity=user.id, additional_claims=claims)
        new_refresh = create_refresh_token(identity=user.id, additional_claims=claims)

        session.is_revoked = True
        db.session.add(
            Session(
                user_id=user.id,
                refresh_token_jti=get_jti(new_refresh),
                user_agent=session.user_agent,
                ip_address=session.ip_address,
            )
        )
        db.session.commit()

        return {
            "access_token": new_access,
            "refresh_token": new_refresh,
            "user": user,
        }

    @staticmethod
    def revoke_refresh_session(user_id: str, refresh_jti: str):
        session = Session.query.filter_by(refresh_token_jti=refresh_jti, user_id=user_id, is_revoked=False).first()
        if session:
            session.is_revoked = True
            db.session.commit()
