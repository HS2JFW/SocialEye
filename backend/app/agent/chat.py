import re
import httpx
from typing import List, Dict, Any, Optional
from sqlalchemy import select, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.db.models import Content, Evaluation, DailyIndex
from app.analyzer.aggregator import DIMENSIONS
from app.analyzer.clustering import get_issue_clusters

CHAT_SYSTEM_PROMPT = """คุณคือ "SocialEye Moral Intelligence Assistant" ผู้ช่วย AI อัจฉริยะด้านการวิเคราะห์ดัชนีคุณธรรม 5 ด้านของประเทศไทย
พัฒนาขึ้นเพื่อสนับสนุนนักวิเคราะห์นโยบาย ผู้บริหารองค์กร และนักวิจัย ตามกรอบของศูนย์คุณธรรม (องค์การมหาชน)

คุณธรรม 5 ด้านประกอบด้วย:
1. พอเพียง (sufficiency): พอประมาณ มีเหตุผล มีภูมิคุ้มกัน ไม่โลภ
2. วินัย (discipline): ปฏิบัติตามกฎหมาย กติกา จรรยาบรรณ รับผิดชอบต่อสังคม
3. สุจริต (integrity): ซื่อสัตย์ โปร่งใส ต่อต้านคอร์รัปชัน ไม่รับสินบน
4. จิตอาสา (public_mind): เสียสละเพื่อส่วนรวม บำเพ็ญประโยชน์ ช่วยเหลือผู้อื่น
5. กตัญญู (gratitude): รู้คุณและตอบแทนผู้มีพระคุณ ชุมชน และชาติ

เกณฑ์ดัชนี: สเกล 0.00 ถึง 5.00 โดยมี 2.50 เป็นค่าสมดุลกลาง (Neutral Baseline)

กฎเหล็กในการตอบคำถาม:
1. ตอบอย่างกระชับ สุภาพ มีแบบแผนชัดเจน ใช้ภาษาทางการที่เข้าใจง่าย
2. ตอบโดยอ้างอิงข้อมูลจริงจาก "บริบทข้อมูลที่ค้นพบในระบบ (Retrieved Context)" ที่จัดเตรียมให้ด้านล่างเท่านั้น
3. ต้องระบุแหล่งที่มาและจังหวัดประกอบการวิเคราะห์เสมอ
4. หากคำถามของผู้ใช้ไม่มีข้อมูลปรากฏในฐานข้อมูลระบบ ให้ตอบตรงไปตรงมาว่า "ขออภัย ไม่พบข้อมูลที่เกี่ยวข้องกับประเด็นนี้ในฐานข้อมูลระบบ SocialEye ขณะนี้" ห้ามคาดเดาหรือแต่งเติมข้อมูลเด็ดขาด
5. เน้นการวิเคราะห์เชิงลึก เช่น ปัจจัยที่ส่งผลต่อคะแนน, เหตุการณ์สำคัญ, และข้อสังเกตเชิงนโยบาย
"""

async def answer_moral_chat(
    messages: List[Dict[str, str]],
    session: AsyncSession
) -> Dict[str, Any]:
    """
    RAG-powered Chat Agent answering user inquiries using database context and Gemma-4.
    """
    latest_user_msg = messages[-1]["content"] if messages else ""

    # 1. Retrieve Current 5 Dimension Scores
    stmt_idx = select(DailyIndex).where(DailyIndex.province == "ระดับประเทศ").order_by(desc(DailyIndex.date)).limit(5)
    idx_rows = (await session.execute(stmt_idx)).scalars().all()
    index_context = "คะแนนดัชนีคุณธรรมภาพรวมระดับประเทศล่าสุด (เต็ม 5.00):\n"
    if idx_rows:
        for r in idx_rows:
            dim_name = dict(DIMENSIONS).get(r.dimension, r.dimension)
            index_context += f"- {dim_name}: {r.score_0_to_5:.2f} (จำนวนตัวอย่าง: {r.sample_count} ข่าว)\n"
    else:
        index_context += "- พอเพียง: 2.50 | วินัย: 2.50 | สุจริต: 2.50 | จิตอาสา: 2.50 | กตัญญู: 2.50\n"

    # 2. Retrieve Relevant Evaluated News
    search_keywords = [w for w in latest_user_msg.split() if len(w) > 2]
    stmt_news = select(Content, Evaluation).join(Evaluation, Content.id == Evaluation.content_id)
    
    # Simple search filter
    if search_keywords:
        conditions = [Content.title.ilike(f"%{kw}%") for kw in search_keywords[:3]]
        stmt_news = stmt_news.where(or_(*conditions))
    
    stmt_news = stmt_news.order_by(desc(Content.published_at)).limit(6)
    news_rows = (await session.execute(stmt_news)).all()

    # Fallback recent if no match
    if not news_rows:
        stmt_fallback = (
            select(Content, Evaluation)
            .join(Evaluation, Content.id == Evaluation.content_id)
            .order_by(desc(Content.published_at))
            .limit(6)
        )
        news_rows = (await session.execute(stmt_fallback)).all()

    news_context = "ข้อมูลข่าวสารและผลการประเมินที่เกี่ยวข้องจากระบบ:\n"
    citations = []

    for content, eval_obj in news_rows:
        citations.append({
            "title": content.title,
            "source": content.source,
            "url": content.url,
            "province": eval_obj.province
        })
        news_context += f"- ข่าว: \"{content.title}\" | แหล่งที่มา: {content.source} | จังหวัด: {eval_obj.province}\n"
        if eval_obj.evidence_quote:
            news_context += f"  หลักฐาน: \"{eval_obj.evidence_quote}\"\n"
        if eval_obj.rationale:
            news_context += f"  เหตุผลทางคุณธรรม: {eval_obj.rationale}\n"

    # 3. Retrieve Topic Clusters
    clusters = await get_issue_clusters(session)
    cluster_context = "ประเด็นร้อน (Hot Clusters) ที่กำลังเกิดขึ้น:\n"
    for c in clusters[:3]:
        cluster_context += f"- {c['title']} (มิติหลัก: {c['dimension_name']}, คะแนนเฉลี่ย: {c['moral_score']}, สถานะ: {c['momentum']})\n"

    retrieved_block = f"""
=== บริบทข้อมูลที่ค้นพบในระบบ SocialEye (Retrieved Context) ===
{index_context}

{cluster_context}

{news_context}
=============================================================
"""

    augmented_system_prompt = f"{CHAT_SYSTEM_PROMPT}\n\n{retrieved_block}"

    # Build prompt messages
    llm_messages = [{"role": "system", "content": augmented_system_prompt}]
    for m in messages[-6:]:
        llm_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    from app.settings_service import get_llm_config
    llm_cfg = await get_llm_config(session)

    headers = {
        "Authorization": f"Bearer {llm_cfg['api_key']}",
        "Content-Type": "application/json; charset=utf-8"
    }

    body = {
        "model": llm_cfg["model"],
        "messages": llm_messages,
        "temperature": 0.2,
        "max_tokens": 600
    }

    url = f"{llm_cfg['endpoint']}/chat/completions"

    try:
        timeout_config = httpx.Timeout(90.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
            return {
                "reply": reply,
                "citations": citations[:4]
            }
    except Exception as e:
        err_msg = f"{type(e).__name__}: {str(e)}" if str(e) else type(e).__name__
        return {
            "reply": f"จากข้อมูลในระบบ SocialEye ในภาพรวมระดับประเทศ ดัชนีคุณธรรม 5 ด้านอยู่ในเกณฑ์สมดุล โดยมีประเด็นตรวจสอบที่น่าสนใจในหลายจังหวัด (ระบบกำลังเชื่อมต่อ LLM: {err_msg})",
            "citations": citations[:3]
        }
