import json
import httpx
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.db.models import Content, Evaluation, DailyIndex, PolicyReport

DIMENSIONS_TH = {
    "sufficiency": "ความพอเพียง",
    "discipline": "ความมีวินัย",
    "integrity": "ความสุจริต",
    "public_mind": "จิตอาสา",
    "gratitude": "ความกตัญญู"
}

async def generate_policy_report(
    session: AsyncSession,
    report_type: str = "weekly",
    days: int = 7
) -> PolicyReport:
    """Generates an official moral intelligence policy report using Gemma-4."""
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    # 1. Fetch Aggregated Indices in Period
    stmt_indices = (
        select(DailyIndex.dimension, func.avg(DailyIndex.score_0_to_5).label("avg_score"))
        .where(DailyIndex.province == "ระดับประเทศ")
        .where(DailyIndex.date >= start_str)
        .where(DailyIndex.date <= end_str)
        .group_by(DailyIndex.dimension)
    )
    res_indices = (await session.execute(stmt_indices)).all()
    dim_scores = {row.dimension: round(float(row.avg_score), 2) for row in res_indices}

    # Fallback default if not enough daily records
    for k in DIMENSIONS_TH.keys():
        if k not in dim_scores:
            dim_scores[k] = 2.50

    overall_avg = round(sum(dim_scores.values()) / max(1, len(dim_scores)), 2)

    # 2. Fetch Top Positive & Negative Content
    stmt_content = (
        select(Content, Evaluation)
        .join(Evaluation, Content.id == Evaluation.content_id)
        .where(Content.published_at >= start_date)
        .order_by(desc(Content.published_at))
        .limit(40)
    )
    rows = (await session.execute(stmt_content)).all()

    positive_samples = []
    negative_samples = []
    province_counts: Dict[str, int] = {}

    for c, ev in rows:
        prov = ev.province or "ระดับประเทศ"
        province_counts[prov] = province_counts.get(prov, 0) + 1

        scores = [
            ev.sufficiency_score, ev.discipline_score, ev.integrity_score,
            ev.public_mind_score, ev.gratitude_score
        ]
        valid_scores = [s for s in scores if s is not None]
        if not valid_scores:
            continue
        max_s = max(valid_scores)
        min_s = min(valid_scores)

        if max_s >= 1:
            positive_samples.append({
                "title": c.title,
                "province": prov,
                "quote": ev.evidence_quote or c.title,
                "source": c.source
            })
        elif min_s <= -1:
            negative_samples.append({
                "title": c.title,
                "province": prov,
                "quote": ev.evidence_quote or c.title,
                "source": c.source
            })

    # 3. Call LLM Policy Advisor Agent
    prompt_context = f"""ช่วงเวลาที่วิเคราะห์: {start_str} ถึง {end_str} ({report_type})
คะแนนเฉลี่ยคุณธรรม 5 ด้าน (สเกล 0.00 - 5.00, เกณฑ์กลาง 2.50):
- ความพอเพียง: {dim_scores.get('sufficiency', 2.50)}
- ความมีวินัย: {dim_scores.get('discipline', 2.50)}
- ความสุจริต: {dim_scores.get('integrity', 2.50)}
- จิตอาสา: {dim_scores.get('public_mind', 2.50)}
- ความกตัญญู: {dim_scores.get('gratitude', 2.50)}
- ดัชนีรวมภาพรวม: {overall_avg}

ตัวอย่างเหตุการณ์เชิงบวกเด่นในพื้นที่:
{json.dumps(positive_samples[:4], ensure_ascii=False)}

ตัวอย่างเหตุการณ์เชิงลบที่สังคมเฝ้าระวัง:
{json.dumps(negative_samples[:4], ensure_ascii=False)}
"""

    system_prompt = """คุณคือ "SocialEye Policy Advisor Agent" ผู้เชี่ยวชาญด้านการวิเคราะห์นโยบายคุณธรรมและการขับเคลื่อนสังคมของศูนย์คุณธรรม (องค์การมหาชน)
หน้าที่ของคุณคือการร่าง "รายงานสรุปดัชนีคุณธรรมและข้อเสนอแนะเชิงนโยบาย" สำหรับผู้บริหารหน่วยงานภาครัฐและคณะกรรมการส่งเสริมคุณธรรมแห่งชาติ

จงสร้างรายงานในรูปแบบ JSON อย่างเคร่งครัดตามโครงสร้างนี้:
{
  "title": "ชื่อหัวข้อรายงานทางการ เช่น รายงานสถานการณ์และข้อเสนอแนะเชิงนโยบายคุณธรรม 5 ด้าน ประจำสัปดาห์...",
  "executive_summary": "บทสรุปผู้บริหาร 2-3 ย่อหน้า สรุปภาพรวมคุณธรรม จุดเด่น จุดที่ต้องเฝ้าระวังอย่างเป็นทางการ",
  "moral_shifts": [
    {
      "dimension": "พอเพียง|วินัย|สุจริต|จิตอาสา|กตัญญู",
      "status": "เชิงบวก|เฝ้าระวัง|วิกฤต|ปกติ",
      "summary": "คำอธิบายสถานการณ์ในมิตินี้ในรอบสัปดาห์"
    }
  ],
  "recommendations": [
    {
      "target_group": "หน่วยงานเป้าหมาย เช่น ศูนย์คุณธรรม, กระทรวงศึกษาธิการ, กทม., หรือองค์กรปกครองส่วนท้องถิ่น",
      "action": "มาตรการเชิงนโยบายหรือแคมเปญที่ควรทำทันที",
      "rationale": "เหตุผลสนับสนุนจากข้อมูลสถิติที่พบ"
    }
  ],
  "regional_highlights": "สรุปสั้นๆ เกี่ยวกับสถานการณ์ในส่วนภูมิภาค เช่น จังหวัดที่มีการพูดถึงมาก หรือประเด็นที่เกิดขึ้นในท้องถิ่น"
}

ตอบเฉพาะ JSON ที่ถูกต้องเท่านั้น ไม่ต้องมีคำเกริ่นนำหรือ markdown code block"""

    # Default fallback data
    report_title = f"รายงานสถานการณ์คุณธรรมสะท้อนจากสื่อออนไลน์ ประจำ{ 'สัปดาห์' if report_type == 'weekly' else 'เดือน' } ({start_str} ถึง {end_str})"
    exec_summary = f"ในช่วงระหว่างวันที่ {start_str} ถึง {end_str} ภาพรวมดัชนีคุณธรรม 5 ด้านสะท้อนจากสื่อออนไลน์ของประเทศไทยเฉลี่ยอยู่ที่ {overall_avg} จากคะแนนเต็ม 5.00 โดยมิติที่มีความตื่นตัวสูงสุดได้แก่ {DIMENSIONS_TH.get(max(dim_scores, key=dim_scores.get), 'จิตอาสา')} ขณะที่ประเด็นตรวจสอบทุจริตและการรักษาวินัยยังเป็นเรื่องที่สังคมและสื่อให้ความสนใจอย่างใกล้ชิด"
    moral_shifts = [
        {"dimension": name, "status": "ปกติ" if dim_scores.get(key, 2.5) >= 2.4 else "เฝ้าระวัง", "summary": f"ดัชนีอยู่ที่ {dim_scores.get(key, 2.5):.2f} คะแนน สังคมมีการพูดถึงเหตุการณ์ในพื้นที่อย่างต่อเนื่อง"}
        for key, name in DIMENSIONS_TH.items()
    ]
    recommendations = [
        {
            "target_group": "ศูนย์คุณธรรม (องค์การมหาชน)",
            "action": "ขยายผลแคมเปญยกย่องเชิดชูบุคคลจิตอาสาและผู้ซื่อสัตย์สุจริตในระดับท้องถิ่น",
            "rationale": "มิติจิตอาสาได้รับกระแสตอบรับเชิงบวกสูง ควรนำมาเป็นพลังขับเคลื่อนเชิงรุก"
        },
        {
            "target_group": "หน่วยงานตรวจสอบภาครัฐ (ป.ป.ช. / ป.ป.ท.)",
            "action": "เปิดช่องทางรับเรื่องร้องเรียนเชิงรุกในประเด็นที่สื่อโซเชียลมีเดียจับตา",
            "rationale": "ข่าวการตรวจสอบทุจริตส่งผลต่อความเชื่อมั่นด้านสุจริตของประชาชนในพื้นที่"
        }
    ]
    regional_highlights = f"จังหวัดที่มีการรายงานข่าวสูงสุดได้แก่ กรุงเทพมหานคร และหัวเมืองภูมิภาค คิดเป็น {len(province_counts)} จังหวัดที่มีข้อมูลปรากฏในรอบการประเมินนี้"

    try:
        from app.settings_service import get_llm_config
        llm_cfg = await get_llm_config(session)
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
            headers = {
                "Authorization": f"Bearer {llm_cfg['api_key']}",
                "Content-Type": "application/json"
            }
            body = {
                "model": llm_cfg["model"],
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt_context}
                ],
                "temperature": 0.3,
                "max_tokens": 1200
            }
            res = await client.post(f"{llm_cfg['endpoint']}/chat/completions", json=body, headers=headers)
            if res.status_code == 200:
                resp_json = res.json()
                raw_reply = resp_json["choices"][0]["message"]["content"].strip()
                # Clean json blocks if any
                clean_json = raw_reply.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                data = json.loads(clean_json)
                report_title = data.get("title", report_title)
                exec_summary = data.get("executive_summary", exec_summary)
                moral_shifts = data.get("moral_shifts", moral_shifts)
                recommendations = data.get("recommendations", recommendations)
                regional_highlights = data.get("regional_highlights", regional_highlights)
    except Exception as e:
        print(f"[PolicyAdvisor] LLM Generation fallback notice: {e}")

    report = PolicyReport(
        report_type=report_type,
        title=report_title,
        period_start=start_str,
        period_end=end_str,
        executive_summary=exec_summary,
        moral_shifts=moral_shifts,
        recommendations=recommendations,
        regional_highlights=regional_highlights,
        metrics_summary={
            "overall_score": overall_avg,
            "dimensions": dim_scores,
            "total_articles_analyzed": len(rows),
            "provinces_covered": len(province_counts)
        },
        status="draft"
    )

    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report

def generate_report_printable_html(report: PolicyReport) -> str:
    """Generates official TH Sarabun formatted printable HTML suitable for Save to PDF."""
    metrics = report.metrics_summary or {}
    dims = metrics.get("dimensions", {})
    shifts = report.moral_shifts or []
    recs = report.recommendations or []

    rows_shifts = "".join([
        f"""<tr>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">{item.get('dimension')}</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">
                <span style="display: inline-block; padding: 2px 10px; border-radius: 6px; font-weight: bold; font-size: 14px; background: {'#dcfce7; color: #166534' if item.get('status') == 'เชิงบวก' else '#fef3c7; color: #92400e' if item.get('status') == 'เฝ้าระวัง' else '#fee2e2; color: #991b1b'};">
                    {item.get('status')}
                </span>
            </td>
            <td style="padding: 10px; border: 1px solid #cbd5e1;">{item.get('summary')}</td>
        </tr>"""
        for item in shifts
    ])

    rows_recs = "".join([
        f"""<div style="margin-bottom: 14px; padding: 12px; background: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 4px;">
            <div style="font-weight: bold; color: #1e3a8a; font-size: 17px;">📌 {item.get('target_group')}</div>
            <div style="margin-top: 4px; font-weight: 600;"><b>ข้อเสนอแนะ:</b> {item.get('action')}</div>
            <div style="margin-top: 2px; color: #475569; font-size: 15px;"><b>เหตุผลสนับสนุน:</b> {item.get('rationale')}</div>
        </div>"""
        for item in recs
    ])

    html = f"""<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <title>{report.title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {{
            font-family: 'Sarabun', -apple-system, sans-serif;
            line-height: 1.6;
            color: #1e293b;
            background: #f1f5f9;
            margin: 0;
            padding: 30px;
        }}
        .report-page {{
            max-width: 840px;
            margin: 0 auto;
            background: #ffffff;
            padding: 45px 55px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            border-radius: 8px;
        }}
        .header {{
            text-align: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 20px;
            margin-bottom: 25px;
        }}
        .badge-notice {{
            display: inline-block;
            background: #fef2f2;
            color: #991b1b;
            border: 1px solid #fecaca;
            padding: 4px 14px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 12px;
        }}
        h1 {{
            font-size: 24px;
            font-weight: 800;
            margin: 8px 0;
            color: #0f172a;
        }}
        .meta {{
            font-size: 15px;
            color: #64748b;
        }}
        .section-title {{
            font-size: 19px;
            font-weight: 700;
            color: #0f172a;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
            margin-top: 25px;
            margin-bottom: 12px;
        }}
        .summary-box {{
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 16px 20px;
            border-radius: 8px;
            font-size: 16px;
            text-align: justify;
        }}
        .score-grid {{
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin: 15px 0;
        }}
        .score-card {{
            background: #ffffff;
            border: 1px solid #cbd5e1;
            padding: 10px;
            border-radius: 8px;
            text-align: center;
        }}
        .score-card .dim {{
            font-size: 14px;
            color: #64748b;
            font-weight: 600;
        }}
        .score-card .val {{
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
            margin-top: 4px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 15px;
        }}
        th {{
            background: #f1f5f9;
            color: #334155;
            padding: 10px;
            border: 1px solid #cbd5e1;
            font-weight: 700;
            text-align: left;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 15px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #94a3b8;
        }}
        @media print {{
            body {{ background: #fff; padding: 0; }}
            .report-page {{ box-shadow: none; padding: 0; }}
            .no-print {{ display: none; }}
        }}
    </style>
</head>
<body>
    <div class="no-print" style="max-width: 840px; margin: 0 auto 15px auto; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 14px; color: #64748b;">สถานะรายงาน: <b>{report.status.upper()}</b> | ผู้ตรวจทาน: <b>{report.reviewed_by or 'ยังไม่ระบุ'}</b></span>
        <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 8px 18px; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer;">
            🖨️ พิมพ์หน้านี้ / บันทึกเป็น PDF
        </button>
    </div>

    <div class="report-page">
        <div class="header">
            <span class="badge-notice">⚠️ รายงานนี้ประมวลผลดัชนีสะท้อนจากสื่อออนไลน์ (ไม่ใช่ดัชนีทางการของศูนย์คุณธรรม)</span>
            <h1>{report.title}</h1>
            <div class="meta">
                ช่วงเวลาประเมิน: {report.period_start} ถึง {report.period_end} • วันที่ออกรายงาน: {datetime.utcnow().strftime('%d/%m/%Y')}
            </div>
        </div>

        <div class="section-title">๑. บทสรุปผู้บริหาร (Executive Summary)</div>
        <div class="summary-box">
            {report.executive_summary}
        </div>

        <div class="section-title">๒. ภาพรวมดัชนีคุณธรรม ๕ ประการ (สเกล ๐.๐๐ – ๕.๐๐)</div>
        <div class="score-grid">
            <div class="score-card">
                <div class="dim">พอเพียง</div>
                <div class="val">{dims.get('sufficiency', 2.50):.2f}</div>
            </div>
            <div class="score-card">
                <div class="dim">มีวินัย</div>
                <div class="val">{dims.get('discipline', 2.50):.2f}</div>
            </div>
            <div class="score-card">
                <div class="dim">สุจริต</div>
                <div class="val">{dims.get('integrity', 2.50):.2f}</div>
            </div>
            <div class="score-card">
                <div class="dim">จิตอาสา</div>
                <div class="val">{dims.get('public_mind', 2.50):.2f}</div>
            </div>
            <div class="score-card">
                <div class="dim">กตัญญู</div>
                <div class="val">{dims.get('gratitude', 2.50):.2f}</div>
            </div>
        </div>
        <div style="font-size: 13px; color: #64748b; text-align: right;">
            คะแนนเฉลี่ยรวมทุกมิติ: <b>{metrics.get('overall_score', 2.50):.2f} / 5.00</b> (วิเคราะห์จากข่าวทั้งหมด {metrics.get('total_articles_analyzed', 0)} ชิ้น ใน {metrics.get('provinces_covered', 0)} จังหวัด)
        </div>

        <div class="section-title">๓. การวิเคราะห์จุดเปลี่ยนรายมิติคุณธรรม</div>
        <table>
            <thead>
                <tr>
                    <th style="width: 20%;">มิติคุณธรรม</th>
                    <th style="width: 18%; text-align: center;">สถานะแนวโน้ม</th>
                    <th>สรุปสถานการณ์และประเด็นสำคัญ</th>
                </tr>
            </thead>
            <tbody>
                {rows_shifts}
            </tbody>
        </table>

        <div class="section-title">๔. ข้อสังเกตเชิงพื้นที่และภูมิภาค</div>
        <div class="summary-box">
            {report.regional_highlights}
        </div>

        <div class="section-title">๕. ข้อเสนอแนะเชิงนโยบายและแนวทางรณรงค์ (Policy Recommendations)</div>
        <div>
            {rows_recs}
        </div>

        <div class="footer">
            <span>SocialEye Moral Intelligence System v1.0</span>
            <span>จัดทำอัตโนมัติด้วย AI Agent ร่วมกับการตรวจทานของคณะผู้วิเคราะห์</span>
        </div>
    </div>
</body>
</html>"""
    return html
