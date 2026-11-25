from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.ingest.rss import run_ingestion_pipeline
from app.settings_service import get_setting_value

scheduler = AsyncIOScheduler()


async def scheduled_job():
    print("[SocialEye Scheduler] Starting scheduled ingest & evaluation job...")
    async with AsyncSessionLocal() as session:
        max_items = int(await get_setting_value(session, "max_items_per_feed", settings.MAX_ITEMS_PER_FEED))
        result = await run_ingestion_pipeline(session, max_items_per_feed=max_items)
        print(f"[SocialEye Scheduler] Completed job: {result}")


def start_scheduler():
    scheduler.add_job(
        scheduled_job,
        "interval",
        minutes=settings.INGEST_INTERVAL_MINUTES,
        id="socialeye_ingest_job",
        replace_existing=True,
    )
    scheduler.start()


def reschedule_ingest_job(minutes: int):
    safe_minutes = max(5, int(minutes))
    if scheduler.running:
        scheduler.reschedule_job("socialeye_ingest_job", trigger="interval", minutes=safe_minutes)


def stop_scheduler():
    scheduler.shutdown()
