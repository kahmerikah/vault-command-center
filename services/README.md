# Services Adapters

This directory is reserved for optional integration adapters that bridge existing SOMB projects into The SOMB Vault.

Suggested adapters:
- kirknet_adapter.py
- drivechain_adapter.py
- plaid_adapter.py
- everbridge_adapter.py
- shopify_adapter.py

Design rule:
- Keep adapters thin.
- Translate external payloads into Vault service interfaces.
- Avoid embedding business logic in adapters.
