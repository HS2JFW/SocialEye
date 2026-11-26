from typing import Dict, Any, List
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Evaluation, Content
from app.analyzer.aggregator import DIMENSIONS, extract_eval_dimension_scores, score_to_5_scale

REGIONS = {
    "ภาคเหนือ": [
        "เชียงใหม่", "เชียงราย", "ลำปาง", "ลำพูน", "แม่ฮ่องสอน", 
        "น่าน", "พะเยา", "แพร่", "อุตรดิตถ์"
    ],
    "ภาคตะวันออกเฉียงเหนือ": [
        "ขอนแก่น", "นครราชสีมา", "อุดรธานี", "อุบลราชธานี", "บุรีรัมย์", 
        "สุรินทร์", "ร้อยเอ็ด", "ศรีสะเกษ", "มหาสารคาม", "ชัยภูมิ", 
        "กาฬสินธุ์", "สกลนคร", "นครพนม", "เลย", "ยโสธร", 
        "หนองคาย", "บึงกาฬ", "หนองบัวลำภู", "อำนาจเจริญ", "มุกดาหาร"
    ],
    "ภาคกลาง": [
        "กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี", "สมุทรปราการ", "สมุทรสาคร", 
        "สมุทรสงคราม", "พระนครศรีอยุธยา", "สระบุรี", "ลพบุรี", "ชัยนาท", 
        "อ่างทอง", "สิงห์บุรี", "สุพรรณบุรี", "นครปฐม", "นครนายก", 
        "เพชรบูรณ์", "พิษณุโลก", "นครสวรรค์", "พิจิตร", "กำแพงเพชร", 
        "อุทัยธานี", "สุโขทัย"
    ],
    "ภาคตะวันออก": [
        "ชลบุรี", "ระยอง", "จันทบุรี", "ตราด", "ฉะเชิงเทรา", "ปราจีนบุรี", "สระแก้ว"
    ],
    "ภาคตะวันตก": [
        "ราชบุรี", "กาญจนบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์", "ตาก"
    ],
    "ภาคใต้": [
        "นครศรีธรรมราช", "สงขลา", "ภูเก็ต", "สุราษฎร์ธานี", "กระบี่", 
        "พังงา", "ตรัง", "พัทลุง", "สตูล", "ชุมพร", "ระนอง", 
        "ยะลา", "ปัตตานี", "นราธิวาส"
    ]
}

def get_region_for_province(province_name: str) -> str:
    for reg, provs in REGIONS.items():
        if province_name in provs:
            return reg
    return "ภาคกลาง"

async def get_thailand_map_overview(session: AsyncSession) -> Dict[str, Any]:
    """
    Computes comprehensive moral health statistics across 6 regions and 77 provinces
    using Entity-Level Aggregation (respecting human-reviewed overrides).
    """
    stmt = (
        select(Evaluation)
        .where(Evaluation.province != "ระดับประเทศ")
    )
    eval_rows = (await session.execute(stmt)).scalars().all()

    prov_buckets: Dict[str, Dict[str, Any]] = {}
    for ev in eval_rows:
        prov = ev.province
        if prov not in prov_buckets:
            prov_buckets[prov] = {
                "total_items": 0,
                "dims": {k: [] for k, _ in DIMENSIONS},
            }
        prov_buckets[prov]["total_items"] += 1
        for dim_key, _ in DIMENSIONS:
            prov_buckets[prov]["dims"][dim_key].extend(extract_eval_dimension_scores(ev, dim_key))

    db_provinces = {}
    for prov, bucket in prov_buckets.items():
        scores = {}
        for dim_key, _ in DIMENSIONS:
            vals = bucket["dims"][dim_key]
            scores[dim_key] = score_to_5_scale(sum(vals) / len(vals)) if vals else 2.50
        overall = round(sum(scores.values()) / 5.0, 2)
        total = bucket["total_items"]
        db_provinces[prov] = {
            "total_items": total,
            "overall_score": overall,
            "scores": scores,
            "status": "ข้อมูลเพียงพอ" if total >= 5 else "ข้อมูลเบื้องต้น"
        }

    # Build all 77 provinces structure
    all_provinces_list = []
    region_stats = {r: {"total_provinces": len(provs), "scored_provinces": 0, "avg_score": 0.0, "total_news": 0} for r, provs in REGIONS.items()}

    for reg, provs in REGIONS.items():
        reg_scores = []
        for p in provs:
            data = db_provinces.get(p, {
                "total_items": 0,
                "overall_score": 2.50,
                "scores": {"sufficiency": 2.5, "discipline": 2.5, "integrity": 2.5, "public_mind": 2.5, "gratitude": 2.5},
                "status": "ข้อมูลเบื้องต้น"
            })
            
            if data["total_items"] > 0:
                region_stats[reg]["scored_provinces"] += 1
                region_stats[reg]["total_news"] += data["total_items"]
                reg_scores.append(data["overall_score"])

            all_provinces_list.append({
                "province": p,
                "region": reg,
                "overall_score": data["overall_score"],
                "total_items": data["total_items"],
                "scores": data["scores"],
                "status": data["status"]
            })

        if reg_scores:
            region_stats[reg]["avg_score"] = round(sum(reg_scores) / len(reg_scores), 2)
        else:
            region_stats[reg]["avg_score"] = 2.50

    return {
        "regions": region_stats,
        "provinces": all_provinces_list
    }
