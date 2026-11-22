import feedparser
from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Content, Evaluation
from app.analyzer.scoring import evaluate_content_with_llm
from app.analyzer.aggregator import calculate_daily_indices
from app.analyzer.alerts import check_for_alerts

RSS_FEEDS = [
    {"source": "Thai PBS", "url": "https://www.thaipbs.or.th/rss/news/general"},
    {"source": "Thairath", "url": "https://www.thairath.co.th/rss/news"},
    {"source": "Matichon", "url": "https://www.matichon.co.th/feed"},
    {"source": "Khaosod", "url": "https://www.khaosod.co.th/feed"},
    {"source": "Dailynews", "url": "https://www.dailynews.co.th/feed/"},
    {"source": "Prachachat", "url": "https://www.prachachat.net/feed"},
    {"source": "The Standard", "url": "https://thestandard.co/feed/"},
    {"source": "Thai Post", "url": "https://www.thaipost.net/feed/"},
    {"source": "Google News", "url": "https://news.google.com/rss/search?q=%E0%B8%84%E0%B8%AD%E0%B8%A3%E0%B9%8C%E0%B8%A3%E0%B8%B1%E0%B8%9B%E0%B8%8A%E0%B8%B1%E0%B8%99+OR+%E0%B8%88%E0%B8%B4%E0%B8%95%E0%B8%AD%E0%B8%B2%E0%B8%81%E0%B8%B2+OR+%E0%B8%9E%E0%B8%AD%E0%B9%80%E0%B8%9E%E0%B8%B5%E0%B8%A2%E0%B8%87+OR+%E0%B8%81%E0%B8%95%E0%B8%B1%E0%B8%8D%E0%B8%8D%E0%B8%B9&hl=th&gl=TH&ceid=TH:th"}
]

async def run_ingestion_pipeline(session: AsyncSession, max_items_per_feed: int = 5) -> Dict[str, Any]:
    """Fetches latest RSS news, saves new content, evaluates with LLM, and recalculates indices."""
    new_contents_count = 0
    evaluated_count = 0

    for feed_info in RSS_FEEDS:
        try:
            feed = feedparser.parse(feed_info["url"])
            items = feed.entries[:max_items_per_feed]
            
            for item in items:
                link = getattr(item, "link", None)
                title = getattr(item, "title", "").strip()
                summary = getattr(item, "summary", "") or getattr(item, "description", "")
                
                if not link or not title:
                    continue

                # Check if already exists
                stmt = select(Content).where(Content.url == link)
                existing = (await session.execute(stmt)).scalar_one_or_none()
                if existing:
                    continue

                # Clean summary / text
                text_content = f"{title}. {summary}"

                content_obj = Content(
                    url=link,
                    title=title,
                    text=text_content,
                    source=feed_info["source"],
                    published_at=datetime.utcnow(),
                    reach=1000
                )
                session.add(content_obj)
                await session.flush()
                new_contents_count += 1

                # Evaluate with LLM (with dynamic few-shot)
                eval_res = await evaluate_content_with_llm(title, text_content, session=session)
                
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
                    evaluated_at=datetime.utcnow()
                )
                session.add(eval_obj)
                evaluated_count += 1

            await session.commit()
        except Exception as e:
            # Continue on individual feed failure
            print(f"Error fetching feed {feed_info['source']}: {e}")

    # Recalculate daily indices
    await calculate_daily_indices(session)
    
    # Check alert rules
    alerts = await check_for_alerts(session)

    return {
        "new_contents": new_contents_count,
        "evaluated": evaluated_count,
        "new_alerts": len(alerts)
    }

def json_rationales(eval_res: Dict[str, Any]) -> str:
    parts = []
    for dim in ["sufficiency", "discipline", "integrity", "public_mind", "gratitude"]:
        info = eval_res.get(dim, {})
        if info.get("score") is not None:
            parts.append(f"{dim}: {info.get('score')} ({info.get('rationale')})")
    return " | ".join(parts) if parts else "ไม่มีนัยยะทางคุณธรรมเด่นชัด"
