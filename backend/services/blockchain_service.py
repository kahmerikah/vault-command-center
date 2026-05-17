from uuid import uuid4
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
    def add_transaction(wallet_id: str, tx_type: str, amount):
        tx = ChainTransaction(
            wallet_id=wallet_id,
            tx_hash=f"tx_{uuid4().hex}",
            tx_type=tx_type,
            amount=amount,
            status="confirmed",
        )
        db.session.add(tx)
        db.session.commit()
        socketio.emit("chain:transaction", {"tx_hash": tx.tx_hash, "amount": str(tx.amount)})
        return tx
