from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.middleware.auth import require_roles
from backend.services.blockchain_service import BlockchainService
from backend.utils.responses import success_response

blockchain_bp = Blueprint("blockchain", __name__)


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
    return success_response({"tx_hash": tx.tx_hash, "status": tx.status, "amount": str(tx.amount)}, 201)
