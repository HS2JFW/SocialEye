from datetime import datetime, timedelta
from typing import Dict, Any
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Content, AuditLog
from app.system_monitor import task_tracker


async def clean_expired_content(session: AsyncSession, retention_days: int = 90) -> Dict[str, Any]:
    """PDPA Automated Compliance: Deletes raw content older than retention_days and audit logs older than 365 days."""
    task_id = task_tracker.start_task("pdpa_retention", f"กำลังล้างข้อมูลดิบเก่าเกิน {retention_days} วันตามนโยบาย PDPA")
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        stmt_count = select(Content).where(Content.created_at < cutoff_date)
        expired_records = (await session.execute(stmt_count)).scalars().all()
        count = len(expired_records)

        if count > 0:
            await session.execute(delete(Content).where(Content.created_at < cutoff_date))

        # Audit logs retained separately for 365 days (1 fiscal year)
        audit_cutoff = datetime.utcnow() - timedelta(days=365)
        await session.execute(delete(AuditLog).where(AuditLog.created_at < audit_cutoff))
        await session.commit()

        msg = f"ลบข้อมูลดิบเก่าเกิน {retention_days} วันเรียบร้อยแล้ว {count} รายการ (Audit Log เก็บแยก 365 วัน)"
        task_tracker.finish_task(task_id, msg, status="completed")
        return {
            "status": "success",
            "retention_policy_days": retention_days,
            "audit_retention_days": 365,
            "cutoff_date": cutoff_date.isoformat(),
            "expired_items_deleted": count,
            "message": msg,
        }
    except Exception as exc:
        task_tracker.finish_task(task_id, f"ล้างข้อมูลไม่สำเร็จ: {exc}", status="failed")
        raise


def get_backup_and_storage_status() -> Dict[str, Any]:
    """Returns status of Garage S3 & Cloudflare R2 backup configuration."""
    return {
        "primary_database": "PostgreSQL with asyncpg & pgvector",
        "graph_database": "Neo4j Community (bolt://localhost:7687)",
        "backup_destination": "Garage S3 Object Storage (Coolify Managed Daily Backup)",
        "r2_sync_option": "Cloudflare R2 Sync Enabled (Option 39 Active)",
        "retention_period": "30 days snapshot history, 90 days PDPA raw content purge, 365 days Audit Log",
        "status": "active",
    }
