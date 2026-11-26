import json
import re
import httpx
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.analyzer.provinces import extract_province
from app.analyzer.few_shot import get_dynamic_few_shot_prompt

SCORING_JSON_SCHEMA = """# Output JSON Schema
ตอบกลับเป็น JSON ที่ถูกต้องตาม Schema ด้านล่างเท่านั้น ห้ามมีข้อความอธิบายอื่นนอกเหนือจาก JSON:
{
  "news_summary": "สรุปใจความสำคัญของข่าวสั้นๆ 1-2 ประโยค",
  "province": "ชื่อจังหวัดที่เกิดเหตุ (ถ้าไม่ระบุให้ตอบ 'ระดับประเทศ')",
  "flags": ["satire", "unverified", "opinion"],
  "overall_virtues": {
    "sufficiency": { "has_positive": false, "has_negative": false, "max_positive": 0, "min_negative": 0 },
    "discipline": { "has_positive": false, "has_negative": false, "max_positive": 0, "min_negative": 0 },
    "integrity": { "has_positive": false, "has_negative": false, "max_positive": 0, "min_negative": 0 },
    "public_mind": { "has_positive": false, "has_negative": false, "max_positive": 0, "min_negative": 0 },
    "gratitude": { "has_positive": false, "has_negative": false, "max_positive": 0, "min_negative": 0 }
  },
  "entity_evaluations": [
    {
      "entity_name": "ชื่อบุคคล กลุ่มคน หรือองค์กรที่กระทำการในข่าว",
      "role_in_news": "บทบาทในข่าว เช่น ผู้ต้องหา, พลเมืองดี, เจ้าหน้าที่รัฐ, บริษัทเอกชน",
      "scores": {
        "sufficiency": { "score": 0, "evidence": null, "reasoning": null },
        "discipline": { "score": 0, "evidence": null, "reasoning": null },
        "integrity": { "score": 0, "evidence": null, "reasoning": null },
        "public_mind": { "score": 0, "evidence": null, "reasoning": null },
        "gratitude": { "score": 0, "evidence": null, "reasoning": null }
      }
    }
  ]
}"""

DIMENSIONS_KEYS = ("sufficiency", "discipline", "integrity", "public_mind", "gratitude")


def _normalize_entity_scoring(parsed: Dict[str, Any], title: str, text: str) -> Dict[str, Any]:
    """Ensures backward-compatible scalar summary fields alongside Entity-Level outputs."""
    entities = parsed.get("entity_evaluations") or []
    overall = parsed.get("overall_virtues") or {}
    first_evidence = None

    for dim in DIMENSIONS_KEYS:
        entity_scores = []
        entity_reasons = []
        for ent in entities:
            sc_obj = (ent.get("scores") or {}).get(dim) or {}
            val = sc_obj.get("score")
            if isinstance(val, (int, float)) and val != 0:
                entity_scores.append(int(val))
                ev = sc_obj.get("evidence")
                rs = sc_obj.get("reasoning")
                if ev and not first_evidence:
                    first_evidence = ev
                if rs:
                    entity_reasons.append(f"{ent.get('entity_name', 'ผู้เกี่ยวข้อง')}: {rs}")

        ov_dim = overall.get(dim) or {}
        if not entity_scores:
            # Fallback to overall_virtues if entity list omitted a dimension
            pos = ov_dim.get("max_positive") or 0
            neg = ov_dim.get("min_negative") or 0
            if neg < 0:
                entity_scores.append(int(neg))
            if pos > 0:
                entity_scores.append(int(pos))

        if entity_scores:
            # Summary scalar on Evaluation row: average non-zero entity scores rounded, preserving negative signal
            avg_val = round(sum(entity_scores) / len(entity_scores))
            if avg_val == 0 and any(v < 0 for v in entity_scores):
                avg_val = min(entity_scores)
            parsed[dim] = {
                "relevant": True,
                "score": avg_val,
                "rationale": " | ".join(entity_reasons[:2]),
            }
        else:
            parsed[dim] = {"relevant": False, "score": None, "rationale": ""}

    if not parsed.get("evidence_quote"):
        parsed["evidence_quote"] = first_evidence or parsed.get("news_summary") or title[:120]
    if not parsed.get("province") or parsed.get("province") == "ระดับประเทศ":
        parsed["province"] = extract_province(title + " " + text)
    if not isinstance(parsed.get("flags"), list):
        parsed["flags"] = []
    return parsed

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

            if "entity_evaluations" in parsed or "overall_virtues" in parsed:
                return _normalize_entity_scoring(parsed, title, text)

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
