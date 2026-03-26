# LifeOS Domain Invariants (Calendar-First)

1. Calendar is the primary execution authority for scheduling.
2. No mutation executes before explicit approval.
3. ClickUp task creation is explicit-only (`mode=clickup_task`).
4. Calendar success cannot be rolled back because ClickUp fails; return partial success.
5. Every approved proposal uses an idempotency key.
6. Error responses must include deterministic stage + reason.
7. Routing uses synced workspace/space/list structure plus semantic extraction only.
8. No life-area ontology is allowed in structural routing.
