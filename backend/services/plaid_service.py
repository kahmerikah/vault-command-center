"""Plaid integration service implemented over Plaid HTTPS endpoints.

Environment variables:
    PLAID_CLIENT_ID
    PLAID_SECRET
    PLAID_ENV (sandbox | development | production)
"""
import os
from datetime import date, timedelta

import requests

from backend.extensions import db
from backend.models.financial import FinancialAccount, PlaidTransaction
from backend.utils.security import decrypt_value, encrypt_value


def _plaid_base_url() -> str:
    env_map = {
        "sandbox": "https://sandbox.plaid.com",
        "development": "https://development.plaid.com",
        "production": "https://production.plaid.com",
    }
    return env_map.get(os.getenv("PLAID_ENV", "sandbox"), env_map["sandbox"])


def _plaid_credentials() -> dict:
    client_id = os.getenv("PLAID_CLIENT_ID", "").strip()
    secret = os.getenv("PLAID_SECRET", "").strip()
    if not client_id or not secret:
        raise RuntimeError("Plaid credentials are missing (PLAID_CLIENT_ID / PLAID_SECRET)")
    return {"client_id": client_id, "secret": secret}


def _plaid_request(path: str, payload: dict) -> dict:
    body = {**_plaid_credentials(), **(payload or {})}
    response = requests.post(
        f"{_plaid_base_url()}{path}",
        json=body,
        timeout=20,
    )
    data = {}
    try:
        data = response.json() if response.content else {}
    except Exception:
        data = {}

    if response.status_code >= 400:
        message = data.get("error_message") or data.get("display_message") or response.text or "Plaid request failed"
        raise RuntimeError(message)

    return data


class PlaidService:
    @staticmethod
    def create_link_token(user_id: str) -> dict:
        try:
            data = _plaid_request(
                "/link/token/create",
                {
                    "client_name": "SOMB Vault",
                    "language": "en",
                    "country_codes": ["US"],
                    "products": ["transactions"],
                    "user": {"client_user_id": str(user_id)},
                },
            )
            link_token = data.get("link_token")
            if not link_token:
                return {"error": "Plaid response missing link_token"}
            return {"link_token": link_token}
        except Exception as exc:
            return {"error": str(exc)}

    @staticmethod
    def exchange_public_token(user_id: str, public_token: str) -> dict:
        try:
            data = _plaid_request(
                "/item/public_token/exchange",
                {"public_token": public_token},
            )
            access_token = data.get("access_token")
            item_id = data.get("item_id")
            if not access_token or not item_id:
                return {"error": "Plaid exchange response missing access_token or item_id"}

            encrypted = encrypt_value(access_token)
            PlaidService._sync_accounts(user_id, item_id, access_token, encrypted)
            return {"item_id": item_id, "status": "linked"}
        except Exception as exc:
            return {"error": str(exc)}

    @staticmethod
    def _sync_accounts(user_id: str, item_id: str, access_token: str, encrypted_token: str):
        try:
            resp = _plaid_request(
                "/accounts/get",
                {"access_token": access_token},
            )
            institution_name = (resp.get("item") or {}).get("institution_id", "Plaid")
            for acct in resp.get("accounts", []):
                existing = FinancialAccount.query.filter_by(plaid_account_id=acct.get("account_id")).first()
                if not existing:
                    account = FinancialAccount(
                        user_id=user_id,
                        plaid_item_id=item_id,
                        plaid_account_id=acct.get("account_id"),
                        plaid_access_token_enc=encrypted_token,
                        institution_name=institution_name,
                        account_name=acct.get("name", "Account"),
                        account_type=acct.get("type", "depository"),
                        account_subtype=acct.get("subtype"),
                        mask=acct.get("mask"),
                        currency=(acct.get("balances") or {}).get("iso_currency_code", "USD"),
                    )
                    db.session.add(account)
                else:
                    account = existing
                    account.plaid_access_token_enc = encrypted_token
                    account.plaid_item_id = item_id
                    account.institution_name = institution_name

                PlaidService._update_balances(account, acct)
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

    @staticmethod
    def _update_balances(account: FinancialAccount, acct_data: dict):
        balances = acct_data.get("balances") or {}
        account.balance_available = balances.get("available")
        account.balance_current = balances.get("current")
        account.balance_limit = balances.get("limit")

    @staticmethod
    def refresh_balances(user_id: str):
        accounts = FinancialAccount.query.filter_by(user_id=user_id, is_active=True).all()
        results = []
        for account in accounts:
            if not account.plaid_access_token_enc:
                continue
            try:
                access_token = decrypt_value(account.plaid_access_token_enc)
                resp = _plaid_request("/accounts/get", {"access_token": access_token})
                for acct in resp.get("accounts", []):
                    if acct.get("account_id") == account.plaid_account_id:
                        PlaidService._update_balances(account, acct)
                        results.append({"id": account.id, "name": account.account_name, "status": "ok"})
            except Exception as exc:
                results.append({"id": account.id, "name": account.account_name, "error": str(exc)})
        db.session.commit()
        return results

    @staticmethod
    def sync_transactions(user_id: str, days: int = 30) -> dict:
        accounts = FinancialAccount.query.filter_by(user_id=user_id, is_active=True).all()
        total_added = 0
        start_date = (date.today() - timedelta(days=days)).isoformat()
        end_date = date.today().isoformat()

        for account in accounts:
            if not account.plaid_access_token_enc:
                continue
            try:
                access_token = decrypt_value(account.plaid_access_token_enc)
                resp = _plaid_request(
                    "/transactions/get",
                    {
                        "access_token": access_token,
                        "start_date": start_date,
                        "end_date": end_date,
                        "options": {"count": 500, "offset": 0},
                    },
                )

                for tx in resp.get("transactions", []):
                    plaid_tx_id = tx.get("transaction_id")
                    if not plaid_tx_id:
                        continue
                    exists = PlaidTransaction.query.filter_by(plaid_transaction_id=plaid_tx_id).first()
                    if exists:
                        continue

                    categories = tx.get("category") or []
                    row = PlaidTransaction(
                        user_id=user_id,
                        account_id=account.id,
                        plaid_transaction_id=plaid_tx_id,
                        amount=tx.get("amount", 0),
                        currency=(tx.get("iso_currency_code") or "USD"),
                        name=tx.get("name", ""),
                        merchant_name=tx.get("merchant_name"),
                        category=categories[0] if categories else None,
                        category_detail=categories[1] if len(categories) > 1 else None,
                        transaction_date=tx.get("date"),
                        pending=tx.get("pending", False),
                    )
                    db.session.add(row)
                    total_added += 1
                db.session.commit()
            except Exception:
                db.session.rollback()

        return {"transactions_added": total_added}
