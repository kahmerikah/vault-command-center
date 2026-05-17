from flask_jwt_extended import decode_token


def get_jti(token: str) -> str:
    decoded = decode_token(token)
    return decoded.get("jti", "")
