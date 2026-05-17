from backend.services.blockchain_service import BlockchainService


def ensure_wallet_for_user(user_id: str):
    return BlockchainService.ensure_wallet(user_id)
