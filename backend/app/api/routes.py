from datetime import datetime, timedelta, date
from typing import List, Optional
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, File, UploadFile, Response
from fastapi.responses import HTMLResponse
from sqlalchemy import select, func, desc, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db, AsyncSessionLocal
from app.db.models import Content, Evaluation, DailyIndex, Alert, GoldenSample, PolicyReport, DataSource, AuditLog
from app.system_monitor import task_tracker, record_audit_log
from app.analyzer.aggregator import DIMENSIONS, extract_eval_dimension_scores, score_to_5_scale
from app.analyzer.alerts import check_for_alerts
from app.ingest.rss import run_ingestion_pipeline
from app.ingest.foreign_filter import is_foreign_only_news
from app.analyzer.scoring import evaluate_content_with_llm
from app.ingest.scheduler import reschedule_ingest_job
from app.settings_service import (
    get_all_settings,
    get_setting_value,
    update_settings,
    send_test_notification,
    get_llm_config,
    test_llm_connection,
    reset_ai_defaults,
)
from app.analyzer.benchmark import compute_benchmark_metrics
from app.data.seed_data import seed_golden_dataset
from app.analyzer.few_shot import get_embedding
from app.analyzer.clustering import get_issue_clusters
from app.agent.chat import answer_moral_chat
from app.analyzer.map_data import get_thailand_map_overview
from app.rag.graph import graph_manager
from app.agent.policy_advisor import generate_policy_report, generate_report_printable_html
from app.ingest.connectors import import_wisesight_data, run_youtube_connector, run_pantip_connector
from app.db.retention import clean_expired_content, get_backup_and_storage_status
from app.config import settings
from app.auth import (
    Role,
    UserContext,
    get_current_user,
    require_viewer,
    require_analyst,
    require_admin,
)

router = APIRouter()

@router.get("/auth/config")
async def get_auth_config():
    """Public OIDC configuration for the frontend SPA."""
    return {
        "auth_enabled": settings.is_auth_enforced,
        "issuer": settings.OIDC_ISSUER,
        "client_id": settings.OIDC_CLIENT_ID,
    }

@router.get("/auth/me")
async def get_authenticated_user(
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """Returns the authenticated user's profile and canonical SocialEye role."""
    await record_audit_log(
        session, user, "auth.session_verified", "auth", user.sub,
        summary=f"เข้าสู่ระบบด้วยสิทธิ์ {user.role.value}", dedupe_minutes=30
    )
    return {
        "sub": user.sub,
        "email": user.email,
        "name": user.name,
        "display_identity": user.display_identity,
        "role": user.role.value,
        "groups": user.groups,
        "auth_enabled": settings.is_auth_enforced,
    }

@router.get("/system/status")
async def get_system_live_status(_: UserContext = Depends(require_viewer)):
    """Returns currently running and recent background tasks for live UI status."""
    return task_tracker.get_status_snapshot()

@router.get("/indices/overview")
async def get_indices_overview(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
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
async def get_indices_timeseries(
    days: int = 14,
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
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
async def get_provinces_ranking(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Returns moral scores aggregated per province using Entity-Level Aggregation."""
    stmt = (
        select(Evaluation)
        .where(Evaluation.province != "ระดับประเทศ")
    )
    eval_rows = (await session.execute(stmt)).scalars().all()

    prov_buckets = {}
    for ev in eval_rows:
        prov = ev.province
        if prov not in prov_buckets:
            prov_buckets[prov] = {"total_items": 0, "dims": {k: [] for k, _ in DIMENSIONS}}
        prov_buckets[prov]["total_items"] += 1
        for dim_key, _ in DIMENSIONS:
            prov_buckets[prov]["dims"][dim_key].extend(extract_eval_dimension_scores(ev, dim_key))

    provinces = []
    for prov, bucket in sorted(prov_buckets.items(), key=lambda x: x[1]["total_items"], reverse=True):
        total = bucket["total_items"]
        provinces.append({
            "province": prov,
            "total_items": total,
            "status": "ข้อมูลเพียงพอ" if total >= 5 else "ข้อมูลเบื้องต้น",
            "scores": {
                dim_key: (score_to_5_scale(sum(bucket["dims"][dim_key]) / len(bucket["dims"][dim_key])) if bucket["dims"][dim_key] else 2.50)
                for dim_key, _ in DIMENSIONS
            }
        })

    return {"provinces": provinces}

@router.get("/feed")
async def get_content_feed(
    limit: int = 30,
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
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
            "text": content.text,
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
                "original_ai_scores": evaluation.original_ai_scores,
                "news_summary": evaluation.news_summary,
                "overall_virtues": evaluation.overall_virtues,
                "entity_evaluations": evaluation.entity_evaluations or [],
                "rationale": evaluation.rationale,
                "is_reviewed": evaluation.is_reviewed,
                "reviewed_by": evaluation.reviewed_by,
                "reviewer_notes": evaluation.reviewer_notes
            }
        })

    return {"feed": items}

@router.post("/content/{evaluation_id}/label")
async def review_content_label(
    evaluation_id: int,
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_analyst),
):
    """
    Allows an analyst or human reviewer to correct moral scores, add review notes,
    and optionally promote the sample to the Golden Dataset.
    """
    stmt = select(Evaluation, Content).join(Content, Content.id == Evaluation.content_id).where(Evaluation.id == evaluation_id)
    row = (await session.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Evaluation record not found")

    evaluation, content = row

    # Retain original AI scores if not already set
    if not evaluation.original_ai_scores:
        evaluation.original_ai_scores = {
            "sufficiency": evaluation.sufficiency_score,
            "discipline": evaluation.discipline_score,
            "integrity": evaluation.integrity_score,
            "public_mind": evaluation.public_mind_score,
            "gratitude": evaluation.gratitude_score
        }

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
    evaluation.reviewed_by = user.display_identity

    # Optionally promote to Golden Dataset
    promoted_to_golden = False
    if payload.get("promote_to_golden"):
        emb = await get_embedding(f"{content.title} {content.text}")
        golden = GoldenSample(
            title=content.title,
            text=content.text,
            source=content.source,
            sufficiency_score=evaluation.sufficiency_score,
            discipline_score=evaluation.discipline_score,
            integrity_score=evaluation.integrity_score,
            public_mind_score=evaluation.public_mind_score,
            gratitude_score=evaluation.gratitude_score,
            evidence_quote=evaluation.evidence_quote or content.title,
            rationale=payload.get("reviewer_notes") or evaluation.rationale,
            province=evaluation.province,
            category=payload.get("category", "general"),
            embedding=emb,
            created_by=evaluation.reviewed_by
        )
        session.add(golden)
        promoted_to_golden = True

    await session.commit()
    await record_audit_log(
        session, user, "content.label", "evaluation", str(evaluation_id),
        summary=f"ตรวจสอบ/ปรับแก้คะแนนข่าว ID {evaluation_id}" + (" (นำเข้า Golden Set)" if promoted_to_golden else ""),
        details={"promoted_to_golden": promoted_to_golden, "province": evaluation.province},
    )

    return {
        "status": "success",
        "message": "บันทึกการตรวจสอบเรียบร้อย" + (" และนำเข้าสู่ชุดข้อมูลทองคำแล้ว" if promoted_to_golden else ""),
        "promoted_to_golden": promoted_to_golden
    }

# --- Phase 2: Quality & Human-in-the-Loop Endpoints ---

@router.get("/quality/benchmark")
async def get_quality_benchmark(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Returns AI vs Human agreement, Cohen's Kappa, QWK, and Target Gate Status (>= 70%)."""
    metrics = await compute_benchmark_metrics(session)
    return metrics

@router.get("/quality/queue")
async def get_review_queue(
    limit: int = 20,
    offset: int = 0,
    status: str = "unreviewed", # "unreviewed", "reviewed", "all"
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Returns queue of news items prioritized for human evaluation & labeling."""
    query = select(Content, Evaluation).join(Evaluation, Content.id == Evaluation.content_id)
    if status == "unreviewed":
        query = query.where(Evaluation.is_reviewed == False)
    elif status == "reviewed":
        query = query.where(Evaluation.is_reviewed == True)

    query = query.order_by(desc(Content.reach), desc(Content.published_at)).offset(offset).limit(limit)
    rows = (await session.execute(query)).all()

    items = []
    for content, evaluation in rows:
        items.append({
            "id": evaluation.id,
            "content_id": content.id,
            "title": content.title,
            "text": content.text,
            "source": content.source,
            "reach": content.reach,
            "published_at": content.published_at.isoformat() if content.published_at else None,
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
            "original_ai_scores": evaluation.original_ai_scores,
            "news_summary": evaluation.news_summary,
            "overall_virtues": evaluation.overall_virtues,
            "entity_evaluations": evaluation.entity_evaluations or [],
            "rationale": evaluation.rationale,
            "is_reviewed": evaluation.is_reviewed,
            "reviewed_by": evaluation.reviewed_by,
            "reviewer_notes": evaluation.reviewer_notes
        })

    # Count pending
    count_stmt = select(func.count(Evaluation.id)).where(Evaluation.is_reviewed == False)
    pending_count = (await session.execute(count_stmt)).scalar() or 0

    return {
        "pending_count": pending_count,
        "items": items
    }

@router.get("/quality/golden-samples")
async def get_golden_samples(
    category: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Retrieves curated Golden Dataset samples."""
    stmt = select(GoldenSample)
    if category:
        stmt = stmt.where(GoldenSample.category == category)
    if q:
        stmt = stmt.where(GoldenSample.title.ilike(f"%{q}%"))

    stmt = stmt.order_by(desc(GoldenSample.id)).offset(offset).limit(limit)
    samples = (await session.execute(stmt)).scalars().all()

    return {
        "total": len(samples),
        "samples": [
            {
                "id": s.id,
                "title": s.title,
                "text": s.text,
                "source": s.source,
                "province": s.province,
                "category": s.category,
                "scores": {
                    "sufficiency": s.sufficiency_score,
                    "discipline": s.discipline_score,
                    "integrity": s.integrity_score,
                    "public_mind": s.public_mind_score,
                    "gratitude": s.gratitude_score
                },
                "evidence_quote": s.evidence_quote,
                "rationale": s.rationale,
                "created_by": s.created_by,
                "has_embedding": bool(s.embedding)
            }
            for s in samples
        ]
    }

@router.post("/quality/golden-samples")
async def create_golden_sample(
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_analyst),
):
    """Manually adds a new sample into the Golden Dataset."""
    title = payload.get("title")
    text = payload.get("text", "")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    emb = await get_embedding(f"{title} {text}")
    sample = GoldenSample(
        title=title,
        text=text,
        source=payload.get("source", "Manual Annotation"),
        sufficiency_score=payload.get("sufficiency"),
        discipline_score=payload.get("discipline"),
        integrity_score=payload.get("integrity"),
        public_mind_score=payload.get("public_mind"),
        gratitude_score=payload.get("gratitude"),
        evidence_quote=payload.get("evidence_quote", ""),
        rationale=payload.get("rationale", ""),
        province=payload.get("province", "ระดับประเทศ"),
        category=payload.get("category", "general"),
        embedding=emb,
        created_by=user.display_identity
    )
    session.add(sample)
    await session.commit()
    await session.refresh(sample)
    await record_audit_log(
        session, user, "golden_sample.create", "golden_sample", str(sample.id),
        summary=f"เพิ่ม Golden Sample: {sample.title[:60]}",
    )

    return {"status": "success", "id": sample.id, "message": "เพิ่มตัวอย่างเข้าชุดข้อมูลทองคำเรียบร้อย"}

@router.delete("/quality/golden-samples/{sample_id}")
async def delete_golden_sample(
    sample_id: int,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_analyst),
):
    """Deletes a Golden Sample by ID."""
    stmt = select(GoldenSample).where(GoldenSample.id == sample_id)
    sample = (await session.execute(stmt)).scalar_one_or_none()
    if not sample:
        raise HTTPException(status_code=404, detail="Golden sample not found")

    await session.delete(sample)
    await session.commit()
    await record_audit_log(
        session, user, "golden_sample.delete", "golden_sample", str(sample_id),
        summary=f"ลบ Golden Sample ID {sample_id}",
    )
    return {"status": "success", "message": "ลบตัวอย่างเรียบร้อย"}

@router.post("/quality/seed")
async def trigger_seed_dataset(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_admin),
):
    """Triggers populating initial Golden Dataset."""
    count = await seed_golden_dataset(session)
    return {"status": "success", "message": f"นำเข้าชุดข้อมูลทองคำเรียบร้อย (มีทั้งหมด {count} รายการ)"}

@router.get("/alerts")
async def get_alerts(
    limit: int = 20,
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Returns recent anomaly alerts."""
    q = select(Alert).order_by(desc(Alert.triggered_at)).limit(limit)
    rows = (await session.execute(q)).scalars().all()
    return {"alerts": rows}

# --- Phase 3: Intelligence & Knowledge Graph Endpoints ---

@router.post("/chat")
async def chat_moral_assistant(
    payload: dict,
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Conversational Moral Intelligence Chat Agent powered by Gemma-4 and RAG."""
    messages = payload.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="Messages list is required")
    res = await answer_moral_chat(messages, session)
    return res

@router.get("/topics/clusters")
async def get_clusters_endpoint(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Returns dynamic moral issue clusters with narrative summaries and momentum."""
    clusters = await get_issue_clusters(session)
    return {"clusters": clusters}

@router.get("/map/provinces")
async def get_map_provinces_endpoint(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Returns regional and 77-province aggregated moral index data for interactive choropleth map."""
    map_data = await get_thailand_map_overview(session)
    return map_data

@router.get("/graph/overview")
async def get_graph_overview_endpoint(_: UserContext = Depends(require_viewer)):
    """Returns Knowledge Graph (Neo4j / In-Memory) entity relationship overview."""
    overview = await graph_manager.get_graph_overview()
    return overview

@router.get("/graph/network")
async def get_graph_network_endpoint(
    dimension: str = "all",
    polarity: str = "all",
    limit: int = 30,
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Returns Tripartite Moral Network (Entity <-> Dimension <-> Province) for interactive visualization."""
    return await graph_manager.get_moral_network(
        db_session=session,
        dimension=dimension,
        polarity=polarity,
        limit_entities=limit,
    )

async def _bg_run_ingest():
    try:
        async with AsyncSessionLocal() as session:
            await run_ingestion_pipeline(session, max_items_per_feed=2)
    except Exception as e:
        print(f"Background ingest error: {e}")

@router.post("/ingest/trigger")
async def trigger_manual_ingest(
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Manually triggers an ingestion and AI evaluation cycle in the background."""
    background_tasks.add_task(_bg_run_ingest)
    await record_audit_log(
        session, user, "ingest.trigger", "ingestion", "rss",
        summary="สั่งดึงและวิเคราะห์ข่าวจาก RSS ในพื้นหลัง",
    )
    return {"status": "success", "message": "เริ่มกระบวนการดึงและวิเคราะห์ข่าวในพื้นหลังแล้ว ระบบจะอัปเดตข้อมูลอัตโนมัติ"}

# =============================================================================
# PHASE 4: POLICY REPORTS, DATA CONNECTORS, AND PDPA RETENTION
# =============================================================================

@router.get("/reports")
async def get_reports_list(
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_viewer),
):
    """Lists generated moral policy reports."""
    stmt = select(PolicyReport)
    if user.role == Role.VIEWER:
        stmt = stmt.where(PolicyReport.status == "published")
    stmt = stmt.order_by(desc(PolicyReport.created_at)).limit(30)
    reports = (await session.execute(stmt)).scalars().all()
    return {"reports": reports}

@router.post("/reports/generate")
async def create_policy_report(
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_analyst),
):
    """Triggers the Policy Advisor Agent to synthesize a new policy report."""
    report_type = payload.get("report_type", "weekly")
    days = int(payload.get("days", 7 if report_type == "weekly" else 30))
    tid = task_tracker.start_task("report_generate", f"กำลังร่างรายงานเชิงนโยบาย ({report_type})")
    try:
        report = await generate_policy_report(session, report_type=report_type, days=days)
        task_tracker.finish_task(tid, f"สร้างรายงานสำเร็จ: {report.title[:50]}", status="completed")
    except Exception as exc:
        task_tracker.finish_task(tid, f"สร้างรายงานไม่สำเร็จ: {exc}", status="failed")
        raise
    await record_audit_log(
        session, user, "report.generate", "policy_report", str(report.id),
        summary=f"สร้างร่างรายงานนโยบาย: {report.title[:60]}",
        details={"report_type": report_type, "days": days},
    )
    return {
        "status": "success",
        "message": "สร้างรายงานข้อเสนอแนะเชิงนโยบายสำเร็จ",
        "report": report
    }

@router.get("/reports/{report_id}")
async def get_report_details(
    report_id: int,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_viewer),
):
    """Retrieves full details of a specific policy report."""
    report = await session.get(PolicyReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if user.role == Role.VIEWER and report.status != "published":
        raise HTTPException(status_code=403, detail="สิทธิ์ Viewer สามารถดูได้เฉพาะรายงานที่เผยแพร่แล้วเท่านั้น")
    return {"report": report}

@router.get("/reports/{report_id}/html", response_class=HTMLResponse)
async def get_report_printable_view(
    report_id: int,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_viewer),
):
    """Renders official TH Sarabun formatted printable HTML view for Save to PDF."""
    report = await session.get(PolicyReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if user.role == Role.VIEWER and report.status != "published":
        raise HTTPException(status_code=403, detail="สิทธิ์ Viewer สามารถดูได้เฉพาะรายงานที่เผยแพร่แล้วเท่านั้น")
    html_content = generate_report_printable_html(report)
    return HTMLResponse(content=html_content, status_code=200)

@router.post("/reports/{report_id}/review")
async def review_and_publish_report(
    report_id: int,
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_analyst),
):
    """Allows an Analyst to review, add notes, and publish an AI-drafted report."""
    report = await session.get(PolicyReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.status = payload.get("status", "published")
    report.reviewed_by = user.display_identity
    report.reviewer_notes = payload.get("reviewer_notes", report.reviewer_notes)
    if "executive_summary" in payload:
        report.executive_summary = payload["executive_summary"]
    
    await session.commit()
    await session.refresh(report)
    await record_audit_log(
        session, user, "report.review", "policy_report", str(report_id),
        summary=f"อัปเดตสถานะรายงานเป็น {report.status}: {report.title[:60]}",
        details={"status": report.status},
    )
    return {"status": "success", "message": "อัปเดตและเผยแพร่รายงานสำเร็จ", "report": report}

@router.get("/reports/export/csv")
async def export_indices_csv(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Exports daily moral indices as UTF-8-BOM CSV compatible with Excel."""
    stmt = (
        select(DailyIndex)
        .where(DailyIndex.province == "ระดับประเทศ")
        .order_by(desc(DailyIndex.date), DailyIndex.dimension)
        .limit(200)
    )
    rows = (await session.execute(stmt)).scalars().all()

    dim_map = dict(DIMENSIONS)
    output = io.StringIO()
    # Write UTF-8 BOM
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(["วันที่ (Date)", "รหัสมิติ (Dimension Key)", "มิติคุณธรรม (Dimension Name)", "คะแนนดัชนี (0.00-5.00)", "จำนวนข่าว (Sample Count)", "ขอบเขต (Scope)"])

    for r in rows:
        writer.writerow([
            r.date,
            r.dimension,
            dim_map.get(r.dimension, r.dimension),
            f"{r.score_0_to_5:.2f}",
            r.sample_count,
            r.province
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="moral_indices_export.csv"'}
    )

@router.get("/reports/export/provinces/csv")
async def export_provinces_csv(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_viewer),
):
    """Exports 77 provinces moral scores as UTF-8-BOM CSV compatible with Excel."""
    map_data = await get_thailand_map_overview(session)
    provinces_list = map_data.get("provinces", [])

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow([
        "จังหวัด (Province)", "ภูมิภาค (Region)", "ดัชนีคุณธรรมรวม (Overall)", 
        "พอเพียง (Sufficiency)", "มีวินัย (Discipline)", "สุจริต (Integrity)", 
        "จิตอาสา (Public Mind)", "กตัญญู (Gratitude)", "จำนวนข่าว (News Count)", "สถานะข้อมูล"
    ])

    for p in provinces_list:
        scores = p.get("scores", {})
        writer.writerow([
            p.get("province"),
            p.get("region"),
            f"{p.get('overall_score', 2.50):.2f}",
            f"{scores.get('sufficiency', 2.50):.2f}",
            f"{scores.get('discipline', 2.50):.2f}",
            f"{scores.get('integrity', 2.50):.2f}",
            f"{scores.get('public_mind', 2.50):.2f}",
            f"{scores.get('gratitude', 2.50):.2f}",
            p.get("total_items", 0),
            p.get("status", "ข้อมูลเบื้องต้น")
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="thailand_77_provinces_moral.csv"'}
    )

@router.post("/ingest/wisesight")
async def upload_wisesight_file(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Uploads and ingests a Wisesight Trend CSV or JSON file into SocialEye."""
    contents = await file.read()
    tid = task_tracker.start_task("wisesight_import", f"กำลังนำเข้าข้อมูล Wisesight ({file.filename})")
    try:
        res = await import_wisesight_data(session, contents, file.filename or "wisesight.csv")
        task_tracker.finish_task(tid, f"นำเข้า Wisesight สำเร็จ ({res.get('imported_items', 0)} รายการ)", status="completed")
    except Exception as exc:
        task_tracker.finish_task(tid, f"นำเข้า Wisesight ล้มเหลว: {exc}", status="failed")
        raise
    await record_audit_log(
        session, user, "ingest.wisesight", "ingestion", file.filename or "wisesight",
        summary=f"นำเข้าไฟล์ Wisesight: {file.filename}",
        details=res,
    )
    return res

@router.post("/ingest/youtube")
async def trigger_youtube_feed(
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Ingests latest video news from Thai news YouTube channels."""
    tid = task_tracker.start_task("youtube_ingest", "กำลังดึงคลิปข่าวล่าสุดจาก YouTube")
    try:
        res = await run_youtube_connector(session)
        task_tracker.finish_task(tid, f"ดึงคลิป YouTube สำเร็จ ({res.get('new_videos_ingested', 0)} รายการ)", status="completed")
    except Exception as exc:
        task_tracker.finish_task(tid, f"ดึงคลิป YouTube ล้มเหลว: {exc}", status="failed")
        raise
    await record_audit_log(
        session, user, "ingest.youtube", "ingestion", "youtube",
        summary="สั่งดึงคลิปข่าวจาก YouTube", details=res,
    )
    return res

@router.post("/ingest/pantip")
async def trigger_pantip_scan(
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Triggers Pantip public community discussions scanner."""
    tid = task_tracker.start_task("pantip_ingest", "กำลังตรวจสอบกระทู้สาธารณะจาก Pantip")
    try:
        res = await run_pantip_connector(session)
        task_tracker.finish_task(tid, f"ตรวจสอบ Pantip สำเร็จ ({res.get('new_topics_ingested', 0)} กระทู้)", status="completed")
    except Exception as exc:
        task_tracker.finish_task(tid, f"ตรวจสอบ Pantip ล้มเหลว: {exc}", status="failed")
        raise
    await record_audit_log(
        session, user, "ingest.pantip", "ingestion", "pantip",
        summary="สั่งสแกนกระทู้ Pantip", details=res,
    )
    return res

@router.get("/admin/backup")
async def get_backup_status(_: UserContext = Depends(require_admin)):
    """Returns Garage S3 and Cloudflare R2 backup status."""
    return get_backup_and_storage_status()

@router.post("/admin/retention/run")
async def trigger_retention_cleanup(
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Runs PDPA retention cleanup on raw data using configured retention_days."""
    days = int(await get_setting_value(session, "retention_days", 90))
    res = await clean_expired_content(session, retention_days=days)
    await record_audit_log(
        session, user, "pdpa.retention_run", "retention", str(days),
        summary=res.get("message", "รัน PDPA Retention Cleanup"),
        details={"retention_days": days, "deleted": res.get("expired_items_deleted", 0)},
    )
    return res

@router.get("/admin/settings")
async def get_admin_settings(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_admin),
):
    """Returns system settings (with secrets masked) and read-only runtime info."""
    data = await get_all_settings(session, mask_secrets=True)
    llm_cfg = await get_llm_config(session)
    data["runtime"] = {
        "app_env": settings.APP_ENV,
        "auth_enabled": settings.is_auth_enforced,
        "oidc_issuer": settings.OIDC_ISSUER,
        "oidc_client_id": settings.OIDC_CLIENT_ID,
        "litellm_model": llm_cfg["model"],
        "embedding_model": llm_cfg["embedding_model"],
        "auth_console_url": "https://auth.addpay.in.th/if/admin/",
    }
    return data

@router.put("/admin/settings")
async def update_admin_settings(
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Updates system settings with Audit Trail and reschedules background ingest if interval changed."""
    updates = payload.get("settings") if isinstance(payload.get("settings"), dict) else payload
    result = await update_settings(session, updates, updated_by=user.display_identity)
    if "ingest_interval_minutes" in updates:
        try:
            reschedule_ingest_job(int(updates["ingest_interval_minutes"]))
        except Exception:
            pass
    await record_audit_log(
        session, user, "settings.update", "system_settings", "global",
        summary=f"อัปเดตการตั้งค่าระบบ ({', '.join(list(updates.keys())[:5])})",
        details=updates,
    )
    return {"status": "success", "message": "บันทึกการตั้งค่าระบบเรียบร้อย", **result}

@router.post("/admin/alerts/test")
async def test_alert_channel(
    payload: dict,
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_admin),
):
    """Sends a test alert via LINE OA or Email SMTP."""
    channel = payload.get("channel", "line")
    return await send_test_notification(session, channel=channel)

@router.post("/admin/llm/test")
async def test_llm_gateway(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_admin),
):
    """Tests connection to the configured LLM Endpoint and lists available models."""
    return await test_llm_connection(session)

@router.post("/admin/settings/reset")
async def reset_admin_ai_defaults(
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Resets System Prompts and/or Moral Rubric to factory defaults."""
    target = payload.get("target", "all")
    result = await reset_ai_defaults(session, target=target, updated_by=user.display_identity)
    return {"status": "success", "message": "คืนค่าเริ่มต้นเรียบร้อย", **result}

async def _bg_reevaluate_recent(limit: int = 30):
    from app.analyzer.aggregator import calculate_daily_indices
    task_id = task_tracker.start_task("reevaluate", f"กำลังประเมินข่าวล่าสุด {limit} รายการซ้ำด้วย Rubrics ใหม่", total=limit)
    try:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(Content, Evaluation)
                .join(Evaluation, Content.id == Evaluation.content_id)
                .where(Evaluation.is_reviewed == False)
                .order_by(desc(Content.published_at))
                .limit(limit)
            )
            rows = (await session.execute(stmt)).all()
            total_rows = len(rows)
            removed_foreign = 0
            updated_count = 0
            task_tracker.update_task(task_id, total=total_rows)

            for idx, (content, ev) in enumerate(rows, start=1):
                task_tracker.update_task(
                    task_id,
                    message=f"กำลังประเมินข่าวซ้ำ ({idx}/{total_rows}): {content.title[:40]}",
                    current=idx,
                    total=total_rows,
                )
                if is_foreign_only_news(content.url, content.title, content.text):
                    await session.delete(content)
                    removed_foreign += 1
                    continue
                eval_res = await evaluate_content_with_llm(content.title, content.text, session=session)
                if eval_res.get("is_thai_domestic") is False:
                    await session.delete(content)
                    removed_foreign += 1
                    continue
                orig_scores = {
                    "sufficiency": eval_res.get("sufficiency", {}).get("score"),
                    "discipline": eval_res.get("discipline", {}).get("score"),
                    "integrity": eval_res.get("integrity", {}).get("score"),
                    "public_mind": eval_res.get("public_mind", {}).get("score"),
                    "gratitude": eval_res.get("gratitude", {}).get("score"),
                }
                ev.sufficiency_score = orig_scores["sufficiency"]
                ev.discipline_score = orig_scores["discipline"]
                ev.integrity_score = orig_scores["integrity"]
                ev.public_mind_score = orig_scores["public_mind"]
                ev.gratitude_score = orig_scores["gratitude"]
                ev.evidence_quote = eval_res.get("evidence_quote")
                ev.province = eval_res.get("province", ev.province)
                ev.flags = eval_res.get("flags", [])
                ev.original_ai_scores = orig_scores
                ev.news_summary = eval_res.get("news_summary")
                ev.overall_virtues = eval_res.get("overall_virtues")
                ev.entity_evaluations = eval_res.get("entity_evaluations")
                ev.evaluated_at = datetime.utcnow()
                updated_count += 1
            await session.commit()
            await calculate_daily_indices(session)
            await check_for_alerts(session)
            task_tracker.finish_task(
                task_id,
                f"ประเมินข่าวซ้ำสำเร็จ {updated_count} รายการ (คัดกรองข่าวต่างประเทศออก {removed_foreign} รายการ)",
                status="completed",
            )
    except Exception as e:
        task_tracker.finish_task(task_id, f"ประเมินข่าวซ้ำล้มเหลว: {e}", status="failed")
        print(f"Background re-evaluate error: {e}")

@router.post("/admin/reevaluate")
async def trigger_reevaluate_recent(
    background_tasks: BackgroundTasks,
    limit: int = 30,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Re-evaluates recent unreviewed news items using the latest Rubrics v2 and foreign-news filter."""
    safe_limit = max(1, min(100, int(limit)))
    background_tasks.add_task(_bg_reevaluate_recent, safe_limit)
    await record_audit_log(
        session, user, "system.reevaluate", "evaluation", "batch",
        summary=f"สั่งประเมินข่าวล่าสุด {safe_limit} รายการซ้ำด้วย Rubrics ใหม่",
        details={"limit": safe_limit},
    )
    return {
        "status": "success",
        "message": f"เริ่มประเมินข่าวล่าสุด {safe_limit} รายการซ้ำด้วย Rubrics ใหม่และคัดกรองข่าวต่างประเทศในพื้นหลังแล้ว",
    }

@router.get("/admin/sources")
async def list_data_sources(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_admin),
):
    """Lists all configured RSS and Google News data sources."""
    rows = (await session.execute(select(DataSource).order_by(DataSource.id.asc()))).scalars().all()
    return {
        "sources": [
            {
                "id": s.id,
                "name": s.name,
                "source_type": s.source_type,
                "url": s.url,
                "keywords": s.keywords or [],
                "is_enabled": s.is_enabled,
                "updated_by": s.updated_by,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in rows
        ]
    }

@router.post("/admin/sources")
async def create_data_source(
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Adds a new RSS or Google News data source."""
    name = (payload.get("name") or "").strip()
    url = (payload.get("url") or "").strip()
    if not name or not url:
        raise HTTPException(status_code=400, detail="กรุณาระบุชื่อแหล่งข้อมูลและ URL")

    raw_kw = payload.get("keywords") or []
    if isinstance(raw_kw, str):
        raw_kw = [k.strip() for k in raw_kw.split(",") if k.strip()]

    src = DataSource(
        name=name,
        source_type=payload.get("source_type") or ("google_news" if "news.google.com" in url else "rss"),
        url=url,
        keywords=raw_kw,
        is_enabled=bool(payload.get("is_enabled", True)),
        created_by=user.display_identity,
        updated_by=user.display_identity,
    )
    session.add(src)
    await session.commit()
    await session.refresh(src)
    await record_audit_log(
        session, user, "data_source.create", "data_source", str(src.id),
        summary=f"เพิ่มแหล่งข้อมูล: {src.name}",
        details={"url": src.url, "source_type": src.source_type},
    )
    return {"status": "success", "id": src.id, "message": "เพิ่มแหล่งข้อมูลเรียบร้อย"}

@router.patch("/admin/sources/{source_id}")
async def update_data_source(
    source_id: int,
    payload: dict,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Updates or toggles a configured data source."""
    src = await session.get(DataSource, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="Data source not found")

    if "name" in payload:
        src.name = str(payload["name"]).strip()
    if "url" in payload:
        src.url = str(payload["url"]).strip()
    if "is_enabled" in payload:
        src.is_enabled = bool(payload["is_enabled"])
    if "keywords" in payload:
        raw_kw = payload["keywords"]
        if isinstance(raw_kw, str):
            raw_kw = [k.strip() for k in raw_kw.split(",") if k.strip()]
        src.keywords = raw_kw
    src.updated_by = user.display_identity
    await session.commit()
    await record_audit_log(
        session, user, "data_source.update", "data_source", str(source_id),
        summary=f"แก้ไขแหล่งข้อมูล: {src.name} ({'เปิด' if src.is_enabled else 'ปิด'})",
        details={"is_enabled": src.is_enabled},
    )
    return {"status": "success", "message": "อัปเดตแหล่งข้อมูลเรียบร้อย"}

@router.delete("/admin/sources/{source_id}")
async def delete_data_source(
    source_id: int,
    session: AsyncSession = Depends(get_db),
    user: UserContext = Depends(require_admin),
):
    """Deletes a data source."""
    src = await session.get(DataSource, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="Data source not found")
    name_copy = src.name
    await session.delete(src)
    await session.commit()
    await record_audit_log(
        session, user, "data_source.delete", "data_source", str(source_id),
        summary=f"ลบแหล่งข้อมูล: {name_copy}",
    )
    return {"status": "success", "message": "ลบแหล่งข้อมูลเรียบร้อย"}


@router.get("/admin/audit-logs")
async def list_audit_logs(
    resource_type: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_admin),
):
    """Lists chronological Audit Log entries for security and compliance review."""
    stmt = select(AuditLog)
    if resource_type and resource_type != "all":
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if q and q.strip():
        kw = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                AuditLog.actor_name.ilike(kw),
                AuditLog.actor_email.ilike(kw),
                AuditLog.action.ilike(kw),
                AuditLog.summary.ilike(kw),
            )
        )
    stmt = stmt.order_by(desc(AuditLog.created_at), desc(AuditLog.id)).offset(offset).limit(min(200, limit))
    rows = (await session.execute(stmt)).scalars().all()
    return {
        "logs": [
            {
                "id": r.id,
                "actor_name": r.actor_name,
                "actor_email": r.actor_email,
                "actor_role": r.actor_role,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "summary": r.summary,
                "details": r.details,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.get("/admin/audit-logs/export/csv")
async def export_audit_logs_csv(
    session: AsyncSession = Depends(get_db),
    _: UserContext = Depends(require_admin),
):
    """Exports up to 1,000 latest Audit Log entries as UTF-8 BOM CSV for Excel."""
    stmt = select(AuditLog).order_by(desc(AuditLog.created_at), desc(AuditLog.id)).limit(1000)
    rows = (await session.execute(stmt)).scalars().all()

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(["เวลา (UTC)", "ผู้ดำเนินการ", "อีเมล", "บทบาท", "การกระทำ (Action)", "ประเภททรัพยากร", "รหัสทรัพยากร", "สรุปรายละเอียด"])
    for r in rows:
        writer.writerow([
            r.created_at.isoformat() if r.created_at else "",
            r.actor_name or "",
            r.actor_email or "",
            r.actor_role or "",
            r.action or "",
            r.resource_type or "",
            r.resource_id or "",
            r.summary or "",
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="socialeye_audit_logs.csv"'},
    )
