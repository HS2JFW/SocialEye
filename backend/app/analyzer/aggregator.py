from datetime import datetime, date
from typing import Dict, Any, List, Optional
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Content, Evaluation, DailyIndex

DIMENSIONS = [
    ("sufficiency", "พอเพียง"),
    ("discipline", "วินัย"),
    ("integrity", "สุจริต"),
    ("public_mind", "จิตอาสา"),
    ("gratitude", "กตัญญู")
]

def score_to_5_scale(mean_score_minus2_to_plus2: float) -> float:
    """Formula: ((mean + 2) / 4) * 5.0 -> 0.00 to 5.00"""
    if mean_score_minus2_to_plus2 is None:
        return 2.50
    s = ((mean_score_minus2_to_plus2 + 2.0) / 4.0) * 5.0
    return max(0.0, min(5.0, round(s, 2)))

async def calculate_daily_indices(session: AsyncSession, target_date: Optional[str] = None):
    """Aggregates all evaluated items into daily 0.00-5.00 moral indices."""
    if not target_date:
        target_date = date.today().isoformat()

    # Query all evaluations
    stmt = (
        select(Content, Evaluation)
        .join(Evaluation, Content.id == Evaluation.content_id)
    )
    result = await session.execute(stmt)
    rows = result.all()

    for dim_key, dim_name in DIMENSIONS:
        scores = []
        weights = []
        
        for content, eval_obj in rows:
            # Weight = reach * confidence * (0.5 if unverified)
            w = float(content.reach or 1000) * float(eval_obj.confidence or 1.0)
            if eval_obj.flags and "unverified" in eval_obj.flags:
                w *= 0.5

            # Entity-Level Aggregation (v2 Rubric): each non-zero actor contributes without canceling others
            entities = getattr(eval_obj, "entity_evaluations", None) or []
            if entities:
                for ent in entities:
                    sc_obj = (ent.get("scores") or {}).get(dim_key) or {}
                    ent_val = sc_obj.get("score")
                    if isinstance(ent_val, (int, float)) and ent_val != 0:
                        scores.append(float(ent_val))
                        weights.append(w)
            else:
                val = getattr(eval_obj, f"{dim_key}_score")
                if val is not None:
                    scores.append(val)
                    weights.append(w)

        if scores and sum(weights) > 0:
            weighted_mean = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
            final_score = score_to_5_scale(weighted_mean)
        else:
            final_score = 2.50

        # Save or update DailyIndex
        q = select(DailyIndex).where(
            and_(
                DailyIndex.date == target_date,
                DailyIndex.dimension == dim_key,
                DailyIndex.province == "ระดับประเทศ"
            )
        )
        existing = (await session.execute(q)).scalar_one_or_none()
        if existing:
            existing.score_0_to_5 = final_score
            existing.sample_count = len(scores)
            existing.calculated_at = datetime.utcnow()
        else:
            new_idx = DailyIndex(
                date=target_date,
                dimension=dim_key,
                province="ระดับประเทศ",
                score_0_to_5=final_score,
                sample_count=len(scores),
                calculated_at=datetime.utcnow()
            )
            session.add(new_idx)

    await session.commit()
