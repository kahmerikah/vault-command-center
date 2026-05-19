"""Dwolla ACH transfer service.

Requires environment variables:
    DWOLLA_KEY
    DWOLLA_SECRET
    DWOLLA_ENV  (sandbox | production)

If dwollav2 SDK is not installed, operations return structured errors so the
platform continues to function without ACH capability.
"""
import os


def _dwolla_client():
    try:
        import dwollav2
        env = os.getenv("DWOLLA_ENV", "sandbox")
        client = dwollav2.Client(
            key=os.getenv("DWOLLA_KEY", ""),
            secret=os.getenv("DWOLLA_SECRET", ""),
            environment=env,
        )
        return client
    except ImportError:
        return None


class DwollaService:
    @staticmethod
    def create_customer(user_id: str, first_name: str, last_name: str, email: str) -> dict:
        client = _dwolla_client()
        if not client:
            return {"error": "dwollav2 SDK not installed", "hint": "pip install dwollav2"}
        try:
            token = client.Auth.client()
            resp = token.post("customers", {
                "firstName": first_name,
                "lastName": last_name,
                "email": email,
                "type": "receive-only",
            })
            location = resp.headers.get("location", "")
            customer_id = location.split("/")[-1]
            return {"dwolla_customer_id": customer_id, "status": "created"}
        except Exception as exc:
            return {"error": str(exc)}

    @staticmethod
    def initiate_transfer(source_url: str, destination_url: str, amount: str, currency: str = "USD") -> dict:
        client = _dwolla_client()
        if not client:
            return {"error": "dwollav2 SDK not installed"}
        try:
            token = client.Auth.client()
            request_body = {
                "_links": {
                    "source": {"href": source_url},
                    "destination": {"href": destination_url},
                },
                "amount": {"currency": currency, "value": amount},
            }
            resp = token.post("transfers", request_body)
            transfer_url = resp.headers.get("location", "")
            transfer_id = transfer_url.split("/")[-1]
            return {"transfer_id": transfer_id, "status": "pending", "location": transfer_url}
        except Exception as exc:
            return {"error": str(exc)}

    @staticmethod
    def get_transfer_status(transfer_id: str) -> dict:
        client = _dwolla_client()
        if not client:
            return {"error": "dwollav2 SDK not installed"}
        try:
            token = client.Auth.client()
            env = os.getenv("DWOLLA_ENV", "sandbox")
            base = "https://api-sandbox.dwolla.com" if env == "sandbox" else "https://api.dwolla.com"
            resp = token.get(f"transfers/{transfer_id}")
            return {"status": resp.body.get("status"), "amount": resp.body.get("amount")}
        except Exception as exc:
            return {"error": str(exc)}
