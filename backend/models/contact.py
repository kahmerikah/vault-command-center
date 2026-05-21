from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class Contact(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "contacts"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    prefix = db.Column(db.String(64), nullable=True)
    first_name = db.Column(db.String(128), nullable=True, index=True)
    middle_name = db.Column(db.String(128), nullable=True)
    last_name = db.Column(db.String(128), nullable=True, index=True)
    suffix = db.Column(db.String(64), nullable=True)
    nickname = db.Column(db.String(128), nullable=True, index=True)
    company = db.Column(db.String(255), nullable=True, index=True)
    job_title = db.Column(db.String(255), nullable=True)
    department = db.Column(db.String(255), nullable=True)
    photo_url = db.Column(db.Text, nullable=True)
    linked_contact_ids = db.Column(db.JSON, default=list, nullable=False)
    phones = db.Column(db.JSON, default=list, nullable=False)
    emails = db.Column(db.JSON, default=list, nullable=False)
    addresses = db.Column(db.JSON, default=list, nullable=False)
    urls = db.Column(db.JSON, default=list, nullable=False)
    social_profiles = db.Column(db.JSON, default=list, nullable=False)
    birthday = db.Column(db.Date, nullable=True)
    anniversary = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    groups = db.Column(db.Text, nullable=True)
    is_favorite = db.Column(db.Boolean, default=False, nullable=False, index=True)
    is_archived = db.Column(db.Boolean, default=False, nullable=False)
    source = db.Column(db.String(64), nullable=True)