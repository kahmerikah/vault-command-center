from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.middleware.auth import require_roles
from backend.models import ChainTransaction, Wallet
from backend.services.activity_service import ActivityService
from backend.services.blockchain_service import BlockchainService
from backend.utils.responses import success_response

blockchain_bp = Blueprint("blockchain", __name__)


@blockchain_bp.get("/transactions")
@jwt_required()
def list_transactions():
    page = max(int(request.args.get("page", 1)), 1)
    limit = min(max(int(request.args.get("limit", 20)), 1), 100)
    wallet_id = (request.args.get("wallet_id") or "").strip()

    query = ChainTransaction.query
    if wallet_id:
        query = query.filter_by(wallet_id=wallet_id)

    paged = query.order_by(ChainTransaction.created_at.desc()).paginate(page=page, per_page=limit, error_out=False)
    return success_response(
        {
            "items": [
                {
                    "id": tx.id,
                    "wallet_id": tx.wallet_id,
                    "tx_hash": tx.tx_hash,
                    "tx_type": tx.tx_type,
                    "amount": str(tx.amount),
                    "status": tx.status,
                    "created_at": tx.created_at.isoformat(),
                }
                for tx in paged.items
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": paged.total,
                "pages": paged.pages,
            },
        }
    )


@blockchain_bp.get("/metrics")
@jwt_required()
def metrics():
    return success_response(
        {
            "wallets_total": Wallet.query.count(),
            "tx_total": ChainTransaction.query.count(),
            "confirmed_total": ChainTransaction.query.filter_by(status="confirmed").count(),
            "mint_total": ChainTransaction.query.filter_by(tx_type="mint").count(),
        }
    )


@blockchain_bp.post("/wallet")
@jwt_required()
def ensure_wallet():
    wallet = BlockchainService.ensure_wallet(get_jwt_identity())
    return success_response({"wallet_id": wallet.id, "address": wallet.address, "balance": str(wallet.balance)})


@blockchain_bp.post("/transactions")
@jwt_required()
def create_transaction():
    payload = request.get_json(silent=True) or {}
    tx = BlockchainService.add_transaction(
        wallet_id=payload["wallet_id"],
        tx_type=payload.get("tx_type", "transfer"),
        amount=payload.get("amount", "0"),
    )
    ActivityService.log(
        message=f"Blockchain transaction: {tx.tx_type}",
        actor_id=get_jwt_identity(),
        meta={"tx_hash": tx.tx_hash, "amount": str(tx.amount), "wallet_id": tx.wallet_id},
    )
    return success_response({"tx_hash": tx.tx_hash, "status": tx.status}, 201)


@blockchain_bp.post("/mint")
@jwt_required()
@require_roles("super_admin")
def mint_tokens():
    payload = request.get_json(silent=True) or {}
    tx = BlockchainService.add_transaction(
        wallet_id=payload["wallet_id"],
        tx_type="mint",
        amount=payload.get("amount", "0"),
    )
    ActivityService.log(
        message="Blockchain mint executed",
        actor_id=get_jwt_identity(),
        level="warning",
        meta={"tx_hash": tx.tx_hash, "amount": str(tx.amount), "wallet_id": tx.wallet_id},
    )
    return success_response({"tx_hash": tx.tx_hash, "status": tx.status, "amount": str(tx.amount)}, 201)
