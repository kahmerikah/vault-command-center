from uuid import uuid4
from decimal import Decimal
from backend.extensions import db, socketio
from backend.models import ChainTransaction, Wallet


class BlockchainService:
    @staticmethod
    def ensure_wallet(user_id: str):
        wallet = Wallet.query.filter_by(user_id=user_id).first()
        if wallet:
            return wallet
        wallet = Wallet(user_id=user_id, address=f"vault_{uuid4().hex[:24]}")
        db.session.add(wallet)
        db.session.commit()
        return wallet

    @staticmethod
    def bootstrap_platform_chain(system_user_id: str, genesis_supply: str):
        wallet = BlockchainService.ensure_wallet(system_user_id)
        existing = ChainTransaction.query.filter_by(wallet_id=wallet.id, tx_type="genesis").first()
        if existing:
            return wallet

        BlockchainService.add_transaction(
            wallet_id=wallet.id,
            tx_type="genesis",
            amount=genesis_supply,
        )
        return wallet

    @staticmethod
    def add_transaction(wallet_id: str, tx_type: str, amount):
        wallet = Wallet.query.filter_by(id=wallet_id).first()
        if not wallet:
            raise ValueError("wallet not found")

        amount_decimal = Decimal(str(amount))
        tx = ChainTransaction(
            wallet_id=wallet_id,
            tx_hash=f"tx_{uuid4().hex}",
            tx_type=tx_type,
            amount=amount_decimal,
            status="confirmed",
        )

        if tx_type in {"genesis", "mint", "credit"}:
            wallet.balance = Decimal(wallet.balance) + amount_decimal
        elif tx_type in {"burn", "debit"}:
            wallet.balance = Decimal(wallet.balance) - amount_decimal

        db.session.add(tx)
        db.session.commit()
        socketio.emit("chain:transaction", {"tx_hash": tx.tx_hash, "amount": str(tx.amount)})
        return tx
