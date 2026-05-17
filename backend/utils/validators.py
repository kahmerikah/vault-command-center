from email_validator import EmailNotValidError, validate_email


def normalize_email(raw_email: str) -> str:
    email = (raw_email or "").strip().lower()
    result = validate_email(email, check_deliverability=False)
    return result.normalized


def is_valid_email(raw_email: str) -> bool:
    try:
        normalize_email(raw_email)
        return True
    except EmailNotValidError:
        return False
