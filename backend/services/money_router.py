"""Automated money routing engine.

Reads AllocationRule rows for a user, evaluates trigger conditions, and
computes transfer amounts. Actual ACH execution is delegated to DwollaService
and recorded as RoutingEvent rows.

In the initial phase, routes are simulated (status='simulated') unless
execute=True is passed and Dwolla credentials are configured.
"""
from decimal import Decimal
from typing import Optional
from backend.extensions import db
from backend.models.financial import AllocationRule, FinancialAccount, RoutingEvent
from backend.services.activity_service import ActivityService
from backend.services.notification_service import NotificationService


class MoneyRouter:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def run(self, trigger: str = "income_received", income_amount: Optional[Decimal] = None,
            source_account_id: Optional[str] = None, execute: bool = False) -> list:
        """Evaluate all active rules for a trigger and produce routing decisions."""
        rules = (
            AllocationRule.query
            .filter_by(user_id=self.user_id, is_active=True, trigger=trigger)
            .order_by(AllocationRule.priority)
            .all()
        )
        if not rules:
            return []

        source_balance = Decimal("0")
        if source_account_id:
            src = FinancialAccount.query.get(source_account_id)
            source_balance = Decimal(str(src.balance_available or 0)) if src else Decimal("0")

        base_amount = income_amount or source_balance
        events = []

        for rule in rules:
            pct = Decimal(str(rule.allocation_pct)) / Decimal("100")
            raw_amount = (base_amount * pct).quantize(Decimal("0.01"))

            if rule.max_transfer_amount:
                raw_amount = min(raw_amount, Decimal(str(rule.max_transfer_amount)))
            if rule.min_balance_threshold and source_balance < Decimal(str(rule.min_balance_threshold)):
                continue
            if raw_amount <= Decimal("0"):
                continue

            status = "simulated"
            dwolla_id = None

            if execute:
                dest = FinancialAccount.query.get(rule.destination_account_id) if rule.destination_account_id else None
                if dest:
                    from backend.services.dwolla_service import DwollaService
                    result = DwollaService.initiate_transfer(
                        source_url=f"plaid://{source_account_id}",
                        destination_url=f"dwolla://{dest.id}",
                        amount=str(raw_amount),
                    )
                    if "error" not in result:
                        status = "queued"
                        dwolla_id = result.get("transfer_id")
                    else:
                        status = "failed"

            event = RoutingEvent(
                user_id=self.user_id,
                trigger=trigger,
                source_account_id=source_account_id,
                rule_id=rule.id,
                amount_routed=raw_amount,
                destination_tag=rule.destination_tag,
                status=status,
                dwolla_transfer_id=dwolla_id,
                notes=rule.description,
            )
            db.session.add(event)
            events.append({
                "rule": rule.name,
                "destination": rule.destination_tag,
                "amount": str(raw_amount),
                "status": status,
            })

        db.session.commit()

        if events:
            ActivityService.log(
                user_id=self.user_id,
                message=f"Money routing run: {len(events)} rules evaluated for trigger={trigger}",
                level="info",
            )
            NotificationService.create(
                user_id=self.user_id,
                title="Money Router",
                body=f"{len(events)} routing decisions generated for {trigger}",
                kind="financial",
            )

        return events
