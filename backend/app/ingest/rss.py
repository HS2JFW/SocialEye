import feedparser
from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Content, Evaluation, DataSource
from app.analyzer.scoring import evaluate_content_with_llm
from app.analyzer.aggregator import calculate_daily_indices
from app.analyzer.alerts import check_for_alerts
from app.ingest.foreign_filter import is_foreign_only_news
from app.rag.graph import graph_manager
from app.system_monitor import task_tracker

RSS_FEEDS = [
    # 1. สำนักข่าวอิศรา (สืบสวนทุจริต คอร์รัปชัน และความโปร่งใสภาครัฐ)
    {"source": "สำนักข่าวอิศรา", "url": "https://www.isranews.org/index.php?format=feed&type=rss"},

    # 2. มติชน (เฉพาะหมวดการเมือง ภูมิภาค/ท้องถิ่น และสังคมในประเทศ)
    {"source": "มติชน การเมือง", "url": "https://www.matichon.co.th/politics/feed"},
    {"source": "มติชน ภูมิภาค", "url": "https://www.matichon.co.th/local/feed"},
    {"source": "มติชน สังคม", "url": "https://www.matichon.co.th/social/feed"},

    # 3. ข่าวสด (เฉพาะข่าวในประเทศ ทั่วไทย และอาชญากรรม)
    {"source": "ข่าวสด ทั่วไทย", "url": "https://www.khaosod.co.th/around-thailand/feed"},
    {"source": "ข่าวสด การเมือง", "url": "https://www.khaosod.co.th/politics/feed"},
    {"source": "ข่าวสด อาชญากรรม", "url": "https://www.khaosod.co.th/crime/feed"},

    # 4. สำนักข่าวไทย (MCOT อสมท - การเมือง สังคม และภูมิภาคในประเทศ)
    {"source": "สำนักข่าวไทย การเมือง", "url": "https://tna.mcot.net/category/politics/feed"},
    {"source": "สำนักข่าวไทย สังคม/ภูมิภาค", "url": "https://tna.mcot.net/category/social/feed"},

    # 5. The Standard (เฉพาะข่าวในประเทศ และการเมืองไทย)
    {"source": "The Standard ในประเทศ", "url": "https://thestandard.co/category/news/thailand/feed/"},
    {"source": "The Standard การเมือง", "url": "https://thestandard.co/category/news/politics/feed/"},

    # 6. ประชาชาติธุรกิจ (การเมืองในประเทศ และเศรษฐกิจท้องถิ่น/ภูมิภาค)
    {"source": "ประชาชาติธุรกิจ การเมือง", "url": "https://www.prachachat.net/politics/feed"},
    {"source": "ประชาชาติธุรกิจ ภูมิภาค", "url": "https://www.prachachat.net/local-economy/feed"},

    # 7. คมชัดลึก (การเมือง และอาชญากรรม/ความปลอดภัยในประเทศ)
    {"source": "คมชัดลึก การเมือง", "url": "https://www.komchadluek.net/rss/category/politics.xml"},
    {"source": "คมชัดลึก อาชญากรรม", "url": "https://www.komchadluek.net/rss/category/crime.xml"},

    # 8. ประชาไท (สิทธิชุมชน สังคม การเมืองในประเทศ)
    {"source": "ประชาไท", "url": "https://prachatai.com/journal/rss.xml"},

    # 9. ไทยรัฐ (ข่าวในประเทศ)
    {"source": "ไทยรัฐ", "url": "https://www.thairath.co.th/rss/news"},

    # 10. Google News - หมวดในประเทศเฉพาะ (National Domestic News)
    {"source": "Google News ในประเทศ", "url": "https://news.google.com/rss/headlines/section/topic/NATION?hl=th&gl=TH&ceid=TH:th"},

    # 11. Google News - เจาะจงข่าวภูมิภาค ป.ป.ช. และจิตอาสา/คุณธรรม
    {"source": "Google News ท้องถิ่น/จิตอาสา", "url": "https://news.google.com/rss/search?q=%E0%B8%82%E0%B9%88%E0%B8%B2%E0%B8%A7%E0%B8%A0%E0%B8%B9%E0%B8%A1%E0%B8%B4%E0%B8%A0%E0%B8%B2%E0%B8%81+OR+%E0%B8%9B%E0%B8%9B%E0%B8%8A+OR+%E0%B8%88%E0%B8%B4%E0%B8%95%E0%B8%AD%E0%B8%B2%E0%B8%81%E0%B8%B2&hl=th&gl=TH&ceid=TH:th"},

    # 12. Google News - เจาะจงข่าวปราบปรามทุจริต/คอร์รัปชันในประเทศ
    {"source": "Google News ตรวจสอบทุจริต", "url": "https://news.google.com/rss/search?q=%E0%B8%AD%E0%B8%B2%E0%B8%8A%E0%B8%8D%E0%B8%B2%E0%B8%81%E0%B8%A3%E0%B8%A3%E0%B8%A1+OR+%E0%B8%97%E0%B8%B8%E0%B8%88%E0%B8%A3%E0%B8%B4%E0%B8%95&hl=th&gl=TH&ceid=TH:th"},

    # 13. Thai PBS ข่าวในประเทศ (ผ่าน Google News Feed)
    {"source": "Thai PBS", "url": "https://news.google.com/rss/search?q=site:thaipbs.or.th&hl=th&gl=TH&ceid=TH:th"}
]

async def run_ingestion_pipeline(session: AsyncSession, max_items_per_feed: int = 5) -> Dict[str, Any]:
    """Fetches latest RSS news from enabled DataSource records, evaluates with LLM, and recalculates indices."""
    new_contents_count = 0
    evaluated_count = 0
    headers_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    db_sources = (await session.execute(select(DataSource).where(DataSource.is_enabled == True))).scalars().all()
    if db_sources:
        feeds_to_run = [
            {"source": s.name, "url": s.url, "keywords": s.keywords or []}
            for s in db_sources
            if s.source_type in ("rss", "google_news")
        ]
    else:
        feeds_to_run = [{"source": f["source"], "url": f["url"], "keywords": []} for f in RSS_FEEDS]

    task_id = task_tracker.start_task("rss_ingest", "กำลังดึงและวิเคราะห์ข่าวจากแหล่งข้อมูล RSS", total=len(feeds_to_run))
    try:
        for feed_idx, feed_info in enumerate(feeds_to_run, start=1):
            task_tracker.update_task(
                task_id,
                message=f"กำลังดึงข่าว ({feed_idx}/{len(feeds_to_run)}): {feed_info['source']}",
                current=feed_idx,
                total=len(feeds_to_run),
            )
            try:
                feed = feedparser.parse(feed_info["url"], agent=headers_agent)
                items = feed.entries[:max_items_per_feed]
                kw_list = [str(k).strip().lower() for k in (feed_info.get("keywords") or []) if str(k).strip()]

                for item in items:
                    link = getattr(item, "link", None)
                    title = getattr(item, "title", "").strip()
                    summary = getattr(item, "summary", "") or getattr(item, "description", "")

                    if not link or not title:
                        continue

                    if kw_list:
                        combined = f"{title} {summary}".lower()
                        if not any(kw in combined for kw in kw_list):
                            continue

                    stmt = select(Content).where(Content.url == link)
                    existing = (await session.execute(stmt)).scalar_one_or_none()
                    if existing:
                        continue

                    if is_foreign_only_news(link, title, summary):
                        continue

                    text_content = f"{title}. {summary}"

                    eval_res = await evaluate_content_with_llm(title, text_content, session=session)
                    if eval_res.get("is_thai_domestic") is False:
                        continue

                    pub_time = datetime.utcnow()
                    if getattr(item, "published_parsed", None):
                        try:
                            pub_time = datetime(*item.published_parsed[:6])
                        except Exception:
                            pub_time = datetime.utcnow()

                    content_obj = Content(
                        url=link,
                        title=title,
                        text=text_content,
                        source=feed_info["source"],
                        published_at=pub_time,
                        reach=1000
                    )
                    session.add(content_obj)
                    await session.flush()
                    new_contents_count += 1

                    orig_scores = {
                        "sufficiency": eval_res.get("sufficiency", {}).get("score"),
                        "discipline": eval_res.get("discipline", {}).get("score"),
                        "integrity": eval_res.get("integrity", {}).get("score"),
                        "public_mind": eval_res.get("public_mind", {}).get("score"),
                        "gratitude": eval_res.get("gratitude", {}).get("score"),
                    }

                    eval_obj = Evaluation(
                        content_id=content_obj.id,
                        sufficiency_score=orig_scores["sufficiency"],
                        discipline_score=orig_scores["discipline"],
                        integrity_score=orig_scores["integrity"],
                        public_mind_score=orig_scores["public_mind"],
                        gratitude_score=orig_scores["gratitude"],
                        evidence_quote=eval_res.get("evidence_quote"),
                        province=eval_res.get("province", "ระดับประเทศ"),
                        flags=eval_res.get("flags", []),
                        rationale=json_rationales(eval_res),
                        original_ai_scores=orig_scores,
                        news_summary=eval_res.get("news_summary"),
                        overall_virtues=eval_res.get("overall_virtues"),
                        entity_evaluations=eval_res.get("entity_evaluations"),
                        evaluated_at=datetime.utcnow()
                    )
                    session.add(eval_obj)
                    evaluated_count += 1

                    try:
                        await graph_manager.sync_evaluation_to_graph(
                            content_id=content_obj.id,
                            title=title,
                            text=text_content,
                            province=eval_obj.province,
                            scores=orig_scores,
                            evidence_quote=eval_obj.evidence_quote,
                            rationale=eval_obj.rationale,
                            entity_evaluations=eval_res.get("entity_evaluations"),
                        )
                    except Exception as ge:
                        print(f"[Ingest] Graph sync notice: {ge}")

                await session.commit()
            except Exception as e:
                print(f"Error fetching feed {feed_info['source']}: {e}")

        task_tracker.update_task(task_id, message="กำลังคำนวณดัชนีคุณธรรมและตรวจสอบการแจ้งเตือน...")
        await calculate_daily_indices(session)
        alerts = await check_for_alerts(session)
        task_tracker.finish_task(
            task_id,
            f"ดึงและวิเคราะห์ข่าวสำเร็จ ({evaluated_count} ข่าวใหม่, แจ้งเตือน {len(alerts)} รายการ)",
            status="completed",
        )
        return {
            "new_contents": new_contents_count,
            "evaluated": evaluated_count,
            "new_alerts": len(alerts)
        }
    except Exception as exc:
        task_tracker.finish_task(task_id, f"ดึงข้อมูลข่าวล้มเหลว: {exc}", status="failed")
        raise

def json_rationales(eval_res: Dict[str, Any]) -> str:
    parts = []
    for dim in ["sufficiency", "discipline", "integrity", "public_mind", "gratitude"]:
        info = eval_res.get(dim, {})
        if info.get("score") is not None:
            parts.append(f"{dim}: {info.get('score')} ({info.get('rationale')})")
    return " | ".join(parts) if parts else "ไม่มีนัยยะทางคุณธรรมเด่นชัด"
