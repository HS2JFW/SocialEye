import json
import re
import httpx
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.analyzer.provinces import extract_province
from app.analyzer.few_shot import get_dynamic_few_shot_prompt

SYSTEM_PROMPT = """คุณคือ AI Agent ผู้เชี่ยวชาญการวิเคราะห์คุณธรรม 5 ด้านตามกรอบศูนย์คุณธรรม (องค์การมหาชน) ประเทศไทย
คุณธรรม 5 ด้านประกอบด้วย:
1. พอเพียง (sufficiency): พอประมาณ มีเหตุผล มีภูมิคุ้มกัน ไม่โลภ ไม่ฟุ้งเฟ้อ
2. วินัย (discipline): ปฏิบัติตามกฎหมาย กติกา จรรยาบรรณ รับผิดชอบต่อสังคม
3. สุจริต (integrity): ซื่อสัตย์ ยึดมั่นความถูกต้อง ต่อต้านคอร์รัปชัน ไม่รับสินบน
4. จิตอาสา (public_mind): เสียสละเพื่อส่วนรวม บำเพ็ญประโยชน์ ช่วยเหลือผู้อื่น
5. กตัญญู (gratitude): รู้คุณและตอบแทนบุญคุณต่อบิดามารดา ผู้มีพระคุณ ชุมชน และชาติ

ให้ประเมินเนื้อหาข่าว/ข้อความที่ได้รับ และตอบกลับเป็น JSON เท่านั้นในรูปแบบนี้:
{
  "sufficiency": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "discipline": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "integrity": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "public_mind": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "gratitude": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "evidence_quote": "ข้อความสำคัญจากเนื้อหาที่สะท้อนประเด็น",
  "province": "ชื่อจังหวัดที่เกิดเหตุ (ถ้าไม่ระบุให้ตอบ 'ระดับประเทศ')",
  "flags": ["satire", "unverified", "opinion"] // ระบุถ้าเข้าข่าย หรือ [] ถ้าเป็นข่าวปกติ
}

เกณฑ์คะแนน (-2 ถึง +2):
+2: ดีเด่นมาก/เป็นแบบอย่าง
+1: เชิงบวก/ปฏิบัติดี
 0: เป็นกลาง
-1: ฝ่าฝืน/บกพร่อง
-2: ร้ายแรง/สร้างความเสียหายอย่างมากต่อสังคม

กฎกรณีพิเศษ:
- ข่าวจับกุมเจ้าหน้าที่ทุจริต: integrity = -2 (สะท้อนการโกง), discipline = +1 หรือ +2 (สะท้อนการบังคับใช้กฎหมาย)
- ถ้าไม่เกี่ยวกับด้านนั้น ให้ relevant = false และ score = null
"""

async def evaluate_content_with_llm(title: str, text: str, session: Optional[AsyncSession] = None) -> Dict[str, Any]:
    """Calls LiteLLM with dynamic few-shot in-context learning to evaluate content against the 5 moral dimensions."""
    few_shot_block = ""
    if session:
        try:
            few_shot_block = await get_dynamic_few_shot_prompt(session, f"{title} {text}")
        except Exception as e:
            print(f"[Scoring] Few-shot retrieval notice: {e}")

    from app.settings_service import get_llm_config

    llm_cfg = await get_llm_config(session)
    prompt = f"{few_shot_block}\nหัวข้อข่าวที่จะประเมิน: {title}\n\nเนื้อหา:\n{text[:1500]}"
    
    headers = {
        "Authorization": f"Bearer {llm_cfg['api_key']}",
        "Content-Type": "application/json; charset=utf-8"
    }
    
    body = {
        "model": llm_cfg["model"],
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 800
    }

    url = f"{llm_cfg['endpoint']}/chat/completions"

    async with httpx.AsyncClient(timeout=45.0) as client:
        try:
            response = await client.post(url, headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            # Extract JSON block
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(0))
            else:
                parsed = json.loads(content)

            # Fallback province if needed
            if not parsed.get("province") or parsed.get("province") == "ระดับประเทศ":
                parsed["province"] = extract_province(title + " " + text)

            return parsed
        except Exception as e:
            # Fallback heuristic evaluation if LLM fails
            prov = extract_province(title + " " + text)
            return {
                "sufficiency": {"relevant": False, "score": None, "rationale": f"LLM error: {str(e)}"},
                "discipline": {"relevant": False, "score": None, "rationale": ""},
                "integrity": {"relevant": False, "score": None, "rationale": ""},
                "public_mind": {"relevant": False, "score": None, "rationale": ""},
                "gratitude": {"relevant": False, "score": None, "rationale": ""},
                "evidence_quote": title[:100],
                "province": prov,
                "flags": ["unverified"]
            }
