"""Plaid integration service.

Requires environment variables:
    PLAID_CLIENT_ID
    PLAID_SECRET
    PLAID_ENV  (sandbox | development | production)

If the plaid-python SDK is not installed, the service degrades gracefully and
returns structured errors so the rest of the platform continues to function.
"""
import os
from typing import Optional
from backend.extensions import db
from backend.models.financial import FinancialAccount, PlaidTransaction
from backend.utils.security import encrypt_value, decrypt_value


def _plaid_client():
    try:
        from plaid.api import plaid_api
        from plaid.model.country_code import CountryCode
        from plaid.model.products import Products
        from plaid import ApiClient, Configuration
        env_map = {
            "sandbox": "https://sandbox.plaid.com",
            "development": "https://development.plaid.com",
            "production": "https://production.plaid.com",
        }
        plaid_env = os.getenv("PLAID_ENV", "sandbox")
        host = env_map.get(plaid_env, env_map["sandbox"])
        config = Configuration(
            host=host,
            api_key={
                "clientId": os.getenv("PLAID_CLIENT_ID", ""),
                "secret": os.getenv("PLAID_SECRET", ""),
            },
        )
        return plaid_api.PlaidApi(ApiClient(config))
    except ImportError:
        return None


class PlaidService:
    @staticmethod
    def create_link_token(user_id: str) -> dict:
        client = _plaid_client()
        if not client:
            return {"error": "plaid SDK not installed", "hint": "pip install plaid-python"}
        try:
            from plaid.model.link_token_create_request import LinkTokenCreateRequest
            from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
            from plaid.model.products import Products
            from plaid.model.country_code import CountryCode
            request = LinkTokenCreateRequest(
                products=[Products("transactions")],
                client_name="SOMB Vault",
                country_codes=[CountryCode("US")],
                language="en",
                user=LinkTokenCreateRequestUser(client_user_id=str(user_id)),
            )
            resp = client.link_token_create(request)
            return {"link_token": resp["link_token"]}
        except Exception as exc:
            return {"error": str(exc)}

    @staticmethod
    def exchange_public_token(user_id: str, public_token: str) -> dict:
        client = _plaid_client()
        if not client:
            return {"error": "plaid SDK not installed"}
        try:
            from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
            resp = client.item_public_token_exchange(
                ItemPublicTokenExchangeRequest(public_token=public_token)
            )
            access_token = resp["access_token"]
            item_id = resp["item_id"]
            encrypted = encrypt_value(access_token)
            PlaidService._sync_accounts(user_id, item_id, access_token, encrypted)
            return {"item_id": item_id, "status": "linked"}
        except Exception as exc:
            return {"error": str(exc)}

    @staticmethod
    def _sync_accounts(user_id: str, item_id: str, access_token: str, encrypted_token: str):
        client = _plaid_client()
        if not client:
            return
        try:
            from plaid.model.accounts_get_request import AccountsGetRequest
            resp = client.accounts_get(AccountsGetRequest(access_token=access_token))
            institution_name = (resp.get("item") or {}).get("institution_id", "Unknown")
            for acct in resp.get("accounts", []):
                existing = FinancialAccount.query.filter_by(
                    plaid_account_id=acct["account_id"]
                ).first()
                if not existing:
                    fa = FinancialAccount(
                        user_id=user_id,
                        plaid_item_id=item_id,
                        plaid_account_id=acct["account_id"],
                        plaid_access_token_enc=encrypted_token,
                        institution_name=institution_name,
                        account_name=acct.get("name", "Account"),
                        account_type=acct.get("type", "depository"),
                        account_subtype=acct.get("subtype"),
                        mask=acct.get("mask"),
                        currency=(acct.get("balances") or {}).get("iso_currency_code", "USD"),
                    )
                    db.session.add(fa)
                else:
                    existing.plaid_access_token_enc = encrypted_token
                PlaidService._update_balances(existing or fa, acct)
            db.session.commit()
        except Exception:
            db.session.rollback()

    @staticmethod
    def _update_balances(account: FinancialAccount, acct_data: dict):
        balances = acct_data.get("balances") or {}
        account.balance_available = balances.get("available")
        account.balance_current = balances.get("current")
        account.balance_limit = balances.get("limit")

    @staticmethod
    def refresh_balances(user_id: str) -> list:
        accounts = FinancialAccount.query.filter_by(user_id=user_id, is_active=True).all()
        client = _plaid_client()
        results = []
        for account in accounts:
            if not account.plaid_access_token_enc:
                continue
            try:
                access_token = decrypt_value(account.plaid_access_token_enc)
                from plaid.model.accounts_get_request import AccountsGetRequest
                resp = client.accounts_get(AccountsGetRequest(access_token=access_token))
                for acct in resp.get("accounts", []):
                    if acct["account_id"] == account.plaid_account_id:
                        PlaidService._update_balances(account, acct)
                        results.append({"id": account.id, "name": account.account_name, "status": "ok"})
            except Exception as exc:
                results.append({"id": account.id, "name": account.account_name, "error": str(exc)})
        db.session.commit()
        return results

    @staticmethod
    def sync_transactions(user_id: str, days: int = 30) -> dict:
        accounts = FinancialAccount.query.filter_by(user_id=user_id, is_active=True).all()
        client = _plaid_client()
        if not client:
            return {"error": "plaid SDK not installed"}
        total_added = 0
        from datetime import date, timedelta
        start_date = (date.today() - timedelta(days=days)).isoformat()
        end_date = date.today().isoformat()
        for account in accounts:
            if not account.plaid_access_token_enc:
                continue
            try:
                access_token = decrypt_value(account.plaid_access_token_enc)
                from plaid.model.transactions_get_request import TransactionsGetRequest
                from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
                req = TransactionsGetRequest(
                    access_token=access_token,
                    start_date=start_date,
                    end_date=end_date,
                    options=TransactionsGetRequestOptions(count=500, offset=0),
                )
                resp = client.transactions_get(req)
                for tx in resp.get("transactions", []):
                    exists = PlaidTransaction.query.filter_by(
                        plaid_transaction_id=tx["transaction_id"]
                    ).first()
                    if exists:
                        continue
                    cat = tx.get("category") or []
                    pt = PlaidTransaction(
                        user_id=user_id,
                        account_id=account.id,
                        plaid_transaction_id=tx["transaction_id"],
                        amount=tx.get("amount", 0),
                        currency=(tx.get("iso_currency_code") or "USD"),
                        name=tx.get("name", ""),
                        merchant_name=tx.get("merchant_name"),
                        category=cat[0] if cat else None,
                        category_detail=cat[1] if len(cat) > 1 else None,
                        transaction_date=tx["date"],
                        pending=tx.get("pending", False),
                    )
                    db.session.add(pt)
                    total_added += 1
                db.session.commit()
            except Exception:
                db.session.rollback()
        return {"transactions_added": total_added}
