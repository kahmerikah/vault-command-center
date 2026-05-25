from decimal import Decimal
from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class Property(db.Model, IdMixin, TimestampMixin):
    """Tracked real estate property."""
    __tablename__ = "properties"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    address = db.Column(db.String(255), nullable=False)
    city = db.Column(db.String(128), nullable=True)
    state = db.Column(db.String(64), nullable=True)
    zip_code = db.Column(db.String(16), nullable=False)
    property_type = db.Column(db.String(64), nullable=False)  # single_family/condo/multi_family/land/commercial
    bedrooms = db.Column(db.Integer, nullable=True)
    bathrooms = db.Column(db.Numeric(4, 1), nullable=True)
    sqft = db.Column(db.Integer, nullable=True)
    lot_size_sqft = db.Column(db.Integer, nullable=True)
    latitude = db.Column(db.Numeric(10, 7), nullable=True)
    longitude = db.Column(db.Numeric(10, 7), nullable=True)
    year_built = db.Column(db.Integer, nullable=True)
    listing_price = db.Column(db.Numeric(15, 2), nullable=True)
    estimated_value = db.Column(db.Numeric(15, 2), nullable=True)
    estimated_rent = db.Column(db.Numeric(10, 2), nullable=True)
    area_avg_price = db.Column(db.Numeric(15, 2), nullable=True)
    area_avg_price_sqft = db.Column(db.Numeric(10, 2), nullable=True)
    deal_score = db.Column(db.Numeric(5, 2), nullable=True)   # 0–100
    deal_verdict = db.Column(db.String(32), nullable=True)     # good_deal/fair/overpriced
    price_deviation_pct = db.Column(db.Numeric(7, 4), nullable=True)  # % vs area avg
    roi_estimate_pct = db.Column(db.Numeric(7, 4), nullable=True)
    cap_rate_pct = db.Column(db.Numeric(7, 4), nullable=True)
    monthly_mortgage_est = db.Column(db.Numeric(10, 2), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(32), default="watching", nullable=False)  # watching/interested/passed/acquired
    source = db.Column(db.String(64), nullable=True)    # manual/iphone_shortcut/api
    last_analyzed_at = db.Column(db.DateTime, nullable=True)


class PropertyComp(db.Model, IdMixin, TimestampMixin):
    """Comparable sale near a tracked property."""
    __tablename__ = "property_comps"

    property_id = db.Column(db.String(36), db.ForeignKey("properties.id"), nullable=False, index=True)
    address = db.Column(db.String(255), nullable=False)
    sale_price = db.Column(db.Numeric(15, 2), nullable=False)
    sqft = db.Column(db.Integer, nullable=True)
    bedrooms = db.Column(db.Integer, nullable=True)
    bathrooms = db.Column(db.Numeric(4, 1), nullable=True)
    price_per_sqft = db.Column(db.Numeric(10, 2), nullable=True)
    sale_date = db.Column(db.Date, nullable=True)
    distance_miles = db.Column(db.Numeric(6, 2), nullable=True)
    latitude = db.Column(db.Numeric(10, 7), nullable=True)
    longitude = db.Column(db.Numeric(10, 7), nullable=True)
    source = db.Column(db.String(64), nullable=True)
