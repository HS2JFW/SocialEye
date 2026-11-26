import json
import re
import httpx
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.analyzer.provinces import extract_province
from app.analyzer.few_shot import get_dynamic_few_shot_prompt

SCORING_JSON_SCHEMA = """ให้ประเมินเนื้อหาข่าว/ข้อความที่ได้รับ และตอบกลับเป็น JSON เท่านั้นในรูปแบบนี้:
{
  "sufficiency": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "discipline": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "integrity": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "public_mind": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "gratitude": {"relevant": true/false, "score": -2 ถึง +2 หรือ null, "rationale": "เหตุผลสั้นๆ"},
  "evidence_quote": "ข้อความสำคัญจากเนื้อหาที่สะท้อนประเด็น",
  "province": "ชื่อจังหวัดที่เกิดเหตุ (ถ้าไม่ระบุให้ตอบ 'ระดับประเทศ')",
  "flags": ["satire", "unverified", "opinion"] // ระบุถ้าเข้าข่าย หรือ [] ถ้าเป็นข่าวปกติ
}"""

async def evaluate_content_with_llm(title: str, text: str, session: Optional[AsyncSession] = None) -> Dict[str, Any]:
    """Calls LiteLLM with dynamic few-shot in-context learning to evaluate content against the 5 moral dimensions."""
    few_shot_block = ""
    if session:
        try:
            few_shot_block = await get_dynamic_few_shot_prompt(session, f"{title} {text}")
        except Exception as e:
            print(f"[Scoring] Few-shot retrieval notice: {e}")

    from app.settings_service import get_llm_config, get_ai_prompts_and_rubric, format_rubric_text

    llm_cfg = await get_llm_config(session)
    ai_cfg = await get_ai_prompts_and_rubric(session)
    system_prompt = (
        f"{ai_cfg['prompt_scoring']}\n\n"
        f"{format_rubric_text(ai_cfg['moral_rubric'])}\n\n"
        f"{SCORING_JSON_SCHEMA}"
    )
    prompt = f"{few_shot_block}\nหัวข้อข่าวที่จะประเมิน: {title}\n\nเนื้อหา:\n{text[:1500]}"
    
    headers = {
        "Authorization": f"Bearer {llm_cfg['api_key']}",
        "Content-Type": "application/json; charset=utf-8"
    }
    
    body = {
        "model": llm_cfg["model"],
        "messages": [
            {"role": "system", "content": system_prompt},
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
