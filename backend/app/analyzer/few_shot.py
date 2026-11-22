import math
import httpx
from typing import List, Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.db.models import GoldenSample

async def get_embedding(text: str) -> Optional[List[float]]:
    """Fetches text vector embedding via LiteLLM Gateway."""
    if not text or not text.strip():
        return None
        
    url = f"{settings.LITELLM_ENDPOINT.rstrip('/')}/embeddings"
    headers = {
        "Authorization": f"Bearer {settings.LITELLM_API_KEY}",
        "Content-Type": "application/json; charset=utf-8"
    }
    body = {
        "model": settings.LITELLM_EMBEDDING_MODEL,
        "input": text[:1000]
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code == 200:
                data = resp.json()
                return data["data"][0]["embedding"]
    except Exception as e:
        print(f"[FewShot] Embedding warning: {e}")
    return None

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)

async def get_dynamic_few_shot_prompt(session: AsyncSession, query_text: str, top_k: int = 3) -> str:
    """
    Retrieves the most semantically relevant Golden Samples from the database
    and formats them as in-context learning few-shot examples for the LLM.
    """
    stmt = select(GoldenSample)
    samples = (await session.execute(stmt)).scalars().all()
    if not samples:
        return ""

    query_vec = await get_embedding(query_text)
    scored_samples = []

    for s in samples:
        sim = 0.0
        if query_vec and s.embedding:
            sim = cosine_similarity(query_vec, s.embedding)
        else:
            # Fallback simple keyword match
            keywords = [w for w in query_text.split() if len(w) > 3]
            match_count = sum(1 for kw in keywords if kw in s.title or kw in s.text)
            sim = match_count / (len(keywords) + 1)
        scored_samples.append((sim, s))

    # Sort descending by similarity
    scored_samples.sort(key=lambda x: x[0], reverse=True)
    selected = [s for _, s in scored_samples[:top_k]]

    lines = [
        "\n--- ตัวอย่างการให้คะแนนมาตรฐานโดยผู้เชี่ยวชาญ (Few-Shot Learning Examples) ---"
    ]
    for idx, s in enumerate(selected, 1):
        lines.append(f"[ตัวอย่างที่ {idx}] หัวข้อ: {s.title}")
        lines.append(f"เนื้อหา: {s.text[:200]}...")
        lines.append("การประเมิน:")
        lines.append(f"- พอเพียง (sufficiency): {s.sufficiency_score}")
        lines.append(f"- วินัย (discipline): {s.discipline_score}")
        lines.append(f"- สุจริต (integrity): {s.integrity_score}")
        lines.append(f"- จิตอาสา (public_mind): {s.public_mind_score}")
        lines.append(f"- กตัญญู (gratitude): {s.gratitude_score}")
        if s.evidence_quote:
            lines.append(f"- ข้อความอ้างอิง: \"{s.evidence_quote}\"")
        if s.rationale:
            lines.append(f"- เหตุผล: {s.rationale}")
        lines.append("")

    lines.append("--- จบตัวอย่าง โปรดใช้เกณฑ์และมาตรฐานเดียวกับตัวอย่างข้างต้นในการประเมินข่าวต่อไปนี้ ---\n")
    return "\n".join(lines)
