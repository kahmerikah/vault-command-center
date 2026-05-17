from backend.tasks.celery_app import celery_app


@celery_app.task(name="vault.notifications.send_digest")
def send_digest_task():
    # TODO: Aggregate pending notification digests by user and channel.
    return {"status": "queued", "task": "send_digest"}


@celery_app.task(name="vault.analytics.rollup")
def analytics_rollup_task():
    # TODO: Compute pre-aggregated analytics snapshots for fast dashboard queries.
    return {"status": "queued", "task": "analytics_rollup"}
