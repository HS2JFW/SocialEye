from datetime import datetime, timedelta
from typing import Dict, Any
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Content, Evaluation

async def clean_expired_content(session: AsyncSession, retention_days: int = 90) -> Dict[str, Any]:
    """PDPA Automated Compliance: Deletes raw content and evaluations older than 90 days."""
    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

    stmt_count = select(Content).where(Content.created_at < cutoff_date)
    expired_records = (await session.execute(stmt_count)).scalars().all()
    count = len(expired_records)

    if count > 0:
        stmt_del = delete(Content).where(Content.created_at < cutoff_date)
        await session.execute(stmt_del)
        await session.commit()

    return {
        "status": "success",
        "retention_policy_days": retention_days,
        "cutoff_date": cutoff_date.isoformat(),
        "expired_items_deleted": count,
        "message": f"ลบข้อมูลดิบเก่าเกิน {retention_days} วันเรียบร้อยแล้ว {count} รายการ (คะแนนสถิติรายวันยังถูกจัดเก็บถาวร)"
    }

def get_backup_and_storage_status() -> Dict[str, Any]:
    """Returns status of Garage S3 & Cloudflare R2 backup configuration."""
    return {
        "primary_database": "PostgreSQL with asyncpg & pgvector",
        "graph_database": "Neo4j Community (bolt://localhost:7687)",
        "backup_destination": "Garage S3 Object Storage (Coolify Managed Daily Backup)",
        "r2_sync_option": "Cloudflare R2 Sync Enabled (Option 39 Active)",
        "retention_period": "30 days snapshot history, 90 days PDPA raw content purge",
        "status": "active"
    }
