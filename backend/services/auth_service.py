from flask_jwt_extended import create_access_token, create_refresh_token
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

        claims = {"role": user.role.name, "username": user.username}
        access = create_access_token(identity=user.id, additional_claims=claims)
        refresh = create_refresh_token(identity=user.id, additional_claims=claims)

        session = Session(
            user_id=user.id,
            refresh_token_jti=refresh.split(".")[-1],
            user_agent=user_agent,
            ip_address=ip_address,
        )
        db.session.add(session)
        db.session.commit()

        return {"access_token": access, "refresh_token": refresh, "user": user}
