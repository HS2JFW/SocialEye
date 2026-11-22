from datetime import datetime, timedelta, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db, AsyncSessionLocal
from app.db.models import Content, Evaluation, DailyIndex, Alert
from app.analyzer.aggregator import DIMENSIONS
from app.ingest.rss import run_ingestion_pipeline

router = APIRouter()

@router.get("/indices/overview")
async def get_indices_overview(session: AsyncSession = Depends(get_db)):
    """Returns the 5 moral index cards (0.00 to 5.00), sample counts, and 7-day trend."""
    overview = []
    today_str = date.today().isoformat()
    yesterday_str = (date.today() - timedelta(days=1)).isoformat()

    for dim_key, dim_name in DIMENSIONS:
        # Today score
        q_today = select(DailyIndex).where(
            and_(
                DailyIndex.dimension == dim_key,
                DailyIndex.province == "ระดับประเทศ",
                DailyIndex.date == today_str
            )
        )
        today_row = (await session.execute(q_today)).scalar_one_or_none()
        current_score = today_row.score_0_to_5 if today_row else 2.50
        sample_count = today_row.sample_count if today_row else 0

        # Yesterday score
        q_yest = select(DailyIndex).where(
            and_(
                DailyIndex.dimension == dim_key,
                DailyIndex.province == "ระดับประเทศ",
                DailyIndex.date == yesterday_str
            )
        )
        yest_row = (await session.execute(q_yest)).scalar_one_or_none()
        prev_score = yest_row.score_0_to_5 if yest_row else 2.50
        delta = round(current_score - prev_score, 2)

        # Status categorization
        if current_score >= 3.5:
            status = "ยอดเยี่ยม"
            badge_color = "green"
        elif current_score >= 2.6:
            status = "เชิงบวก"
            badge_color = "blue"
        elif current_score >= 2.4:
            status = "สมดุล / เป็นกลาง"
            badge_color = "gray"
        elif current_score >= 1.5:
            status = "เฝ้าระวัง"
            badge_color = "amber"
        else:
            status = "วิกฤต"
            badge_color = "red"

        overview.append({
            "key": dim_key,
            "name": dim_name,
            "score": current_score,
            "prev_score": prev_score,
            "delta": delta,
            "sample_count": sample_count,
            "status": status,
            "badge_color": badge_color
        })

    return {"overview": overview, "updated_at": datetime.utcnow().isoformat()}

@router.get("/indices/timeseries")
async def get_indices_timeseries(days: int = 14, session: AsyncSession = Depends(get_db)):
    """Returns daily moral scores over the specified number of days."""
    start_date = (date.today() - timedelta(days=days)).isoformat()
    q = select(DailyIndex).where(
        and_(
            DailyIndex.province == "ระดับประเทศ",
            DailyIndex.date >= start_date
        )
    ).order_by(DailyIndex.date.asc())
    
    rows = (await session.execute(q)).scalars().all()
    
    # Pivot by date
    by_date = {}
    for r in rows:
        if r.date not in by_date:
            by_date[r.date] = {"date": r.date}
        by_date[r.date][r.dimension] = r.score_0_to_5

    return {"timeseries": list(by_date.values())}

@router.get("/indices/provinces")
async def get_provinces_ranking(session: AsyncSession = Depends(get_db)):
    """Returns moral scores aggregated per province."""
    stmt = (
        select(
            Evaluation.province,
            func.count(Evaluation.id).label("total_items"),
            func.avg(Evaluation.sufficiency_score).label("avg_sufficiency"),
            func.avg(Evaluation.discipline_score).label("avg_discipline"),
            func.avg(Evaluation.integrity_score).label("avg_integrity"),
            func.avg(Evaluation.public_mind_score).label("avg_public_mind"),
            func.avg(Evaluation.gratitude_score).label("avg_gratitude")
        )
        .where(Evaluation.province != "ระดับประเทศ")
        .group_by(Evaluation.province)
        .order_by(desc("total_items"))
    )
    result = await session.execute(stmt)
    provinces = []
    
    for row in result.all():
        prov, total, s_suf, s_dis, s_int, s_pub, s_gra = row
        def to5(v):
            return round(((v + 2.0) / 4.0) * 5.0, 2) if v is not None else 2.50

        provinces.append({
            "province": prov,
            "total_items": total,
            "status": "ข้อมูลเพียงพอ" if total >= 5 else "ข้อมูลเบื้องต้น",
            "scores": {
                "sufficiency": to5(s_suf),
                "discipline": to5(s_dis),
                "integrity": to5(s_int),
                "public_mind": to5(s_pub),
                "gratitude": to5(s_gra)
            }
        })

    return {"provinces": provinces}

@router.get("/feed")
async def get_content_feed(limit: int = 30, offset: int = 0, session: AsyncSession = Depends(get_db)):
    """Returns real-time analyzed news/social feed with moral evaluations and quotes."""
    stmt = (
        select(Content, Evaluation)
        .join(Evaluation, Content.id == Evaluation.content_id)
        .order_by(desc(Content.published_at))
        .offset(offset)
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    items = []

    for content, evaluation in rows:
        items.append({
            "id": content.id,
            "url": content.url,
            "title": content.title,
            "source": content.source,
            "published_at": content.published_at.isoformat() if content.published_at else None,
            "reach": content.reach,
            "evaluation": {
                "id": evaluation.id,
                "province": evaluation.province,
                "evidence_quote": evaluation.evidence_quote,
                "flags": evaluation.flags or [],
                "scores": {
                    "sufficiency": evaluation.sufficiency_score,
                    "discipline": evaluation.discipline_score,
                    "integrity": evaluation.integrity_score,
                    "public_mind": evaluation.public_mind_score,
                    "gratitude": evaluation.gratitude_score
                },
                "rationale": evaluation.rationale,
                "is_reviewed": evaluation.is_reviewed
            }
        })

    return {"feed": items}

@router.post("/content/{evaluation_id}/label")
async def review_content_label(
    evaluation_id: int,
    payload: dict,
    session: AsyncSession = Depends(get_db)
):
    """Allows an analyst or human reviewer to correct moral scores and add review notes."""
    stmt = select(Evaluation).where(Evaluation.id == evaluation_id)
    evaluation = (await session.execute(stmt)).scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation record not found")

    if "sufficiency" in payload:
        evaluation.sufficiency_score = payload["sufficiency"]
    if "discipline" in payload:
        evaluation.discipline_score = payload["discipline"]
    if "integrity" in payload:
        evaluation.integrity_score = payload["integrity"]
    if "public_mind" in payload:
        evaluation.public_mind_score = payload["public_mind"]
    if "gratitude" in payload:
        evaluation.gratitude_score = payload["gratitude"]
    if "reviewer_notes" in payload:
        evaluation.reviewer_notes = payload["reviewer_notes"]
    if "province" in payload:
        evaluation.province = payload["province"]

    evaluation.is_reviewed = True
    evaluation.reviewed_by = payload.get("reviewed_by", "Analyst")
    await session.commit()

    return {"status": "success", "message": "บันทึกการตรวจสอบเรียบร้อย"}

@router.get("/alerts")
async def get_alerts(limit: int = 20, session: AsyncSession = Depends(get_db)):
    """Returns recent anomaly alerts."""
    q = select(Alert).order_by(desc(Alert.triggered_at)).limit(limit)
    rows = (await session.execute(q)).scalars().all()
    return {"alerts": rows}

async def _bg_run_ingest():
    try:
        async with AsyncSessionLocal() as session:
            await run_ingestion_pipeline(session, max_items_per_feed=2)
    except Exception as e:
        print(f"Background ingest error: {e}")

@router.post("/ingest/trigger")
async def trigger_manual_ingest(background_tasks: BackgroundTasks):
    """Manually triggers an ingestion and AI evaluation cycle in the background."""
    background_tasks.add_task(_bg_run_ingest)
    return {"status": "success", "message": "เริ่มกระบวนการดึงและวิเคราะห์ข่าวในพื้นหลังแล้ว ระบบจะอัปเดตข้อมูลอัตโนมัติ"}
