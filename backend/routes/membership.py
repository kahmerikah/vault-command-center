"""Membership routes — tier management, wallet sync, profile."""
from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from backend.extensions import db
from backend.models.membership import Membership
from backend.models.blockchain import Wallet
from backend.services.activity_service import ActivityService
from backend.utils.responses import error_response, success_response

membership_bp = Blueprint("membership", __name__)

TIER_DEFAULTS = {
    "free":      {"event_quota_monthly": 5,  "booking_quota_monthly": 10, "priority_support": False, "early_access": False},
    "founder":   {"event_quota_monthly": 20, "booking_quota_monthly": 50, "priority_support": False, "early_access": True},
    "operator":  {"event_quota_monthly": 60, "booking_quota_monthly": 150, "priority_support": True,  "early_access": True},
    "executive": {"event_quota_monthly": 999, "booking_quota_monthly": 999, "priority_support": True, "early_access": True},
}


@membership_bp.get("/me")
@jwt_required()
def get_my_membership():
    user_id = get_jwt_identity()
    membership = Membership.query.filter_by(user_id=user_id).first()
    if not membership:
        membership = _bootstrap_membership(user_id)
    _sync_token_balance(membership)
    db.session.commit()
    return success_response(_serialize(membership))


@membership_bp.patch("/me")
@jwt_required()
def update_profile():
    user_id = get_jwt_identity()
    membership = Membership.query.filter_by(user_id=user_id).first()
    if not membership:
        membership = _bootstrap_membership(user_id)

    data = request.get_json(silent=True) or {}
    for field in ("display_name", "avatar_url", "bio", "public_profile"):
        if field in data:
            setattr(membership, field, data[field])
    db.session.commit()
    return success_response(_serialize(membership))


@membership_bp.post("/me/upgrade")
@jwt_required()
def upgrade_tier():
    """Admin/self-service tier upgrade. In production gate behind payment confirmation."""
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    tier = (data.get("tier") or "").strip().lower()
    if tier not in TIER_DEFAULTS:
        return error_response(f"invalid tier; must be one of {list(TIER_DEFAULTS.keys())}", 400)

    membership = Membership.query.filter_by(user_id=user_id).first()
    if not membership:
        membership = _bootstrap_membership(user_id)

    defaults = TIER_DEFAULTS[tier]
    membership.tier = tier
    membership.tier_granted_at = datetime.utcnow()
    membership.event_quota_monthly = defaults["event_quota_monthly"]
    membership.booking_quota_monthly = defaults["booking_quota_monthly"]
    membership.priority_support = defaults["priority_support"]
    membership.early_access = defaults["early_access"]
    membership.benefits = {**(membership.benefits or {}), "tier": tier, "unlocked_at": datetime.utcnow().isoformat()}
    db.session.commit()

    ActivityService.log(
        actor_id=user_id,
        level="info",
        message=f"Membership upgraded to {tier}",
        meta={"tier": tier},
    )
    return success_response(_serialize(membership))


@membership_bp.get("/tiers")
def list_tiers():
    return success_response({
        "tiers": [
            {
                "key": "free",
                "label": "Free",
                "description": "Core platform access.",
                "token_requirement": 0,
                **TIER_DEFAULTS["free"],
            },
            {
                "key": "founder",
                "label": "Founder",
                "description": "Early access + extended limits.",
                "token_requirement": 100,
                **TIER_DEFAULTS["founder"],
            },
            {
                "key": "operator",
                "label": "Operator",
                "description": "Full operational stack + priority support.",
                "token_requirement": 1000,
                **TIER_DEFAULTS["operator"],
            },
            {
                "key": "executive",
                "label": "Executive",
                "description": "Unlimited access + custom modules.",
                "token_requirement": 10000,
                **TIER_DEFAULTS["executive"],
            },
        ]
    })


def _bootstrap_membership(user_id: str) -> Membership:
    wallet = Wallet.query.filter_by(user_id=user_id).first()
    defaults = TIER_DEFAULTS["free"]
    membership = Membership(
        user_id=user_id,
        wallet_id=wallet.id if wallet else None,
        tier="free",
        status="active",
        token_balance=wallet.balance if wallet else 0,
        **defaults,
    )
    db.session.add(membership)
    db.session.flush()
    return membership


def _sync_token_balance(membership: Membership):
    if membership.wallet_id:
        wallet = Wallet.query.get(membership.wallet_id)
        if wallet:
            membership.token_balance = wallet.balance


def _serialize(m: Membership) -> dict:
    return {
        "id": m.id,
        "user_id": m.user_id,
        "wallet_id": m.wallet_id,
        "tier": m.tier,
        "status": m.status,
        "token_balance": str(m.token_balance),
        "benefits": m.benefits or {},
        "tier_granted_at": m.tier_granted_at.isoformat() if m.tier_granted_at else None,
        "tier_expires_at": m.tier_expires_at.isoformat() if m.tier_expires_at else None,
        "display_name": m.display_name,
        "avatar_url": m.avatar_url,
        "bio": m.bio,
        "public_profile": m.public_profile,
        "event_quota_monthly": m.event_quota_monthly,
        "booking_quota_monthly": m.booking_quota_monthly,
        "priority_support": m.priority_support,
        "early_access": m.early_access,
        "created_at": m.created_at.isoformat(),
        "updated_at": m.updated_at.isoformat(),
    }
