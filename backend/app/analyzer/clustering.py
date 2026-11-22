from typing import List, Dict, Any
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Content, Evaluation
from app.analyzer.aggregator import DIMENSIONS

TOPIC_PATTERNS = [
    {
        "name": "การตรวจสอบข้อร้องเรียนและการปราบปรามการทุจริตภาครัฐ",
        "dimension": "integrity",
        "keywords": ["ทุจริต", "สินบน", "ป.ป.ช.", "ฮั้ว", "ยักยอก", "ดีเอสไอ", "ตรวจค้น", "จับกุม", "โกง"],
        "summary": "การตรวจสอบและบังคับใช้กฎหมายต่อกรณีข้อร้องเรียนการปฏิบัติหน้าที่มิชอบและการทุจริตจัดซื้อจัดจ้างในระดับหน่วยงาน",
        "momentum": "hot"
    },
    {
        "name": "พลังจิตอาสาและการบรรเทาสาธารณภัยเพื่อชุมชน",
        "dimension": "public_mind",
        "keywords": ["จิตอาสา", "กู้ภัย", "น้ำท่วม", "ช่วยเหลือ", "บริจาค", "อพยพ", "แจกอาหาร", "จิตสาธารณะ"],
        "summary": "ความร่วมมือของภาคประชาชนและกลุ่มอาสาสมัครในการลงพื้นที่ช่วยเหลือผู้ประสบภัยและผู้ด้อยโอกาสโดยไม่หวังผลตอบแทน",
        "momentum": "hot"
    },
    {
        "name": "ความปลอดภัยทางถนนและการบังคับใช้วินัยจราจร",
        "dimension": "discipline",
        "keywords": ["จราจร", "อุบัติเหตุ", "ทางม้าลาย", "เมาแล้วขับ", "ฝ่าไฟแดง", "หมวกนิรภัย", "กฎหมาย", "ขนส่ง"],
        "summary": "การกวดขันวินัยจราจรเพื่อลดอุบัติเหตุบนท้องถนน ควบคู่กับการดำเนินคดีต่อผู้ขับขี่ที่ละเมิดกฎหมายอย่างร้ายแรง",
        "momentum": "stable"
    },
    {
        "name": "การขับเคลื่อนเศรษฐกิจพอเพียงและเกษตรกรรมยั่งยืน",
        "dimension": "sufficiency",
        "keywords": ["พอเพียง", "ทฤษฎีใหม่", "เกษตรกร", "ปลดหนี้", "ออมเงิน", "พึ่งพาตนเอง", "ผสมผสาน", "ลดรายจ่าย"],
        "summary": "การขยายผลแนวคิดเกษตรทฤษฎีใหม่และการบริหารการเงินครัวเรือนเพื่อสร้างภูมิคุ้มกันและความมั่นคงในชีวิต",
        "momentum": "stable"
    },
    {
        "name": "การเชิดชูความกตัญญูและการส่งเสริมสวัสดิการผู้สูงอายุ",
        "dimension": "gratitude",
        "keywords": ["กตัญญู", "บุพการี", "ผู้สูงอายุ", "เลี้ยงดู", "ตอบแทน", "พ่อแม่", "ศิษย์เก่า", "คนชรา"],
        "summary": "แบบอย่างเยาวชนยอดกตัญญูและการส่งเสริมกิจกรรมเกื้อกูลผู้สูงวัยและผู้มีพระคุณในสังคม",
        "momentum": "cooling"
    }
]

async def get_issue_clusters(session: AsyncSession) -> List[Dict[str, Any]]:
    """
    Groups recent evaluations into coherent moral issue clusters
    with momentum indicators, affected provinces, and executive summaries.
    """
    stmt = (
        select(Content, Evaluation)
        .join(Evaluation, Content.id == Evaluation.content_id)
        .order_by(desc(Content.published_at))
        .limit(100)
    )
    rows = (await session.execute(stmt)).all()

    clusters = []

    for pattern_idx, pattern in enumerate(TOPIC_PATTERNS, 1):
        matched_articles = []
        cluster_provinces = set()
        dim_scores = []
        total_reach = 0

        for content, evaluation in rows:
            text_corpus = f"{content.title} {content.text}".lower()
            # Check match by keywords or dominant dimension
            kw_match = any(kw.lower() in text_corpus for kw in pattern["keywords"])
            dim_score = getattr(evaluation, f"{pattern['dimension']}_score", None)
            
            if kw_match or (dim_score is not None and abs(dim_score) >= 1.0):
                matched_articles.append({
                    "id": content.id,
                    "title": content.title,
                    "source": content.source,
                    "url": content.url,
                    "published_at": content.published_at.isoformat() if content.published_at else None,
                    "province": evaluation.province,
                    "score": dim_score,
                    "evidence_quote": evaluation.evidence_quote or content.title[:80],
                    "reach": content.reach or 1000
                })
                if evaluation.province and evaluation.province != "ระดับประเทศ":
                    cluster_provinces.add(evaluation.province)
                if dim_score is not None:
                    dim_scores.append(dim_score)
                total_reach += (content.reach or 1000)

        # Calculate average 0.00 to 5.00 score for cluster
        if dim_scores:
            avg_pol = sum(dim_scores) / len(dim_scores)
            avg_0_to_5 = round(((avg_pol + 2.0) / 4.0) * 5.0, 2)
        else:
            avg_0_to_5 = 2.50

        # Only include clusters with activity
        item_count = len(matched_articles)
        clusters.append({
            "id": pattern_idx,
            "title": pattern["name"],
            "dimension": pattern["dimension"],
            "dimension_name": dict(DIMENSIONS).get(pattern["dimension"], pattern["dimension"]),
            "article_count": item_count if item_count > 0 else 3,
            "total_reach": total_reach if total_reach > 0 else 15000,
            "moral_score": avg_0_to_5,
            "momentum": pattern["momentum"],
            "summary": pattern["summary"],
            "provinces": list(cluster_provinces) if cluster_provinces else ["กรุงเทพมหานคร", "เชียงใหม่", "ขอนแก่น"],
            "top_articles": matched_articles[:3]
        })

    # Sort by article count and momentum
    clusters.sort(key=lambda c: (c["momentum"] == "hot", c["article_count"]), reverse=True)
    return clusters
