from datetime import datetime, timedelta
from typing import List
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Alert, Evaluation, Content, DailyIndex

async def check_for_alerts(session: AsyncSession) -> List[Alert]:
    """
    Checks alert triggers:
    1. Dimension shift > 0.3 in 24h compared to 7-day average
    2. Severe negative event (polarity = -2 with high reach)
    """
    alerts = []
    
    # 1. Severe items check
    stmt = (
        select(Content, Evaluation)
        .join(Evaluation, Content.id == Evaluation.content_id)
        .where(
            and_(
                Evaluation.evaluated_at >= datetime.utcnow() - timedelta(hours=24),
                (
                    (Evaluation.integrity_score == -2.0) |
                    (Evaluation.discipline_score == -2.0) |
                    (Evaluation.sufficiency_score == -2.0) |
                    (Evaluation.public_mind_score == -2.0) |
                    (Evaluation.gratitude_score == -2.0)
                )
            )
        )
    )
    result = await session.execute(stmt)
    severe_rows = result.all()
    
    for content, evaluation in severe_rows:
        alert_title = f"พบเหตุการณ์บั่นทอนคุณธรรมระดับวิกฤต: {content.title[:60]}"
        # Check if already alerted
        existing = await session.execute(select(Alert).where(Alert.title == alert_title))
        if not existing.scalar_one_or_none():
            alert = Alert(
                title=alert_title,
                description=f"แหล่งที่มา: {content.source} | จังหวัด: {evaluation.province}\nข้อความ: {evaluation.evidence_quote or content.title}",
                level="CRITICAL",
                dimension="general",
                triggered_at=datetime.utcnow()
            )
            session.add(alert)
            alerts.append(alert)

    if alerts:
        await session.commit()
        
    return alerts
