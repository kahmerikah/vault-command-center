from backend.services.blockchain_service import BlockchainService


def mint(wallet_id: str, amount):
    return BlockchainService.add_transaction(wallet_id=wallet_id, tx_type="mint", amount=amount)


def transfer(wallet_id: str, amount):
    return BlockchainService.add_transaction(wallet_id=wallet_id, tx_type="transfer", amount=amount)
