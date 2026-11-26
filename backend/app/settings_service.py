from datetime import datetime
from email.message import EmailMessage
import smtplib
from typing import Any, Dict

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as env_settings
from app.db.models import DataSource, SystemSetting
from app.db.session import AsyncSessionLocal

SECRET_MASK = "••••••••"

DEFAULT_PROMPT_SCORING = (
    "คุณคือผู้เชี่ยวชาญการวิเคราะห์คุณธรรม 5 ด้านตามกรอบศูนย์คุณธรรม (องค์การมหาชน) ประเทศไทย\n"
    "จงประเมินเนื้อหาข่าว/ข้อความที่ได้รับอย่างเป็นกลาง อ้างอิงหลักฐานจากข้อความจริง และปฏิบัติตามเกณฑ์ประเมิน (Moral Rubric) ด้านล่างอย่างเคร่งครัด"
)

DEFAULT_PROMPT_CHAT = (
    'คุณคือผู้ช่วยวิเคราะห์ข้อมูล "SocialEye" ด้านดัชนีคุณธรรม 5 ด้านของประเทศไทย\n'
    "พัฒนาขึ้นเพื่อสนับสนุนนักวิเคราะห์นโยบาย ผู้บริหารองค์กร และนักวิจัย ตามกรอบของศูนย์คุณธรรม (องค์การมหาชน)\n\n"
    "เกณฑ์ดัชนี: สเกล 0.00 ถึง 5.00 โดยมี 2.50 เป็นค่าสมดุลกลาง (Neutral Baseline)\n\n"
    "กฎในการตอบคำถาม:\n"
    "1. ตอบอย่างกระชับ สุภาพ มีแบบแผนชัดเจน ใช้ภาษาทางการที่เข้าใจง่าย\n"
    '2. ตอบโดยอ้างอิงข้อมูลจริงจาก "บริบทข้อมูลที่ค้นพบในระบบ (Retrieved Context)" ที่จัดเตรียมให้เท่านั้น\n'
    "3. ต้องระบุแหล่งที่มาและจังหวัดประกอบการวิเคราะห์เสมอ\n"
    '4. หากคำถามของผู้ใช้ไม่มีข้อมูลปรากฏในฐานข้อมูลระบบ ให้ตอบตรงไปตรงมาว่า "ขออภัย ไม่พบข้อมูลที่เกี่ยวข้องกับประเด็นนี้ในฐานข้อมูลระบบ SocialEye ขณะนี้" ห้ามคาดเดาหรือแต่งเติมข้อมูลเด็ดขาด\n'
    "5. เน้นการวิเคราะห์เชิงลึก เช่น ปัจจัยที่ส่งผลต่อคะแนน เหตุการณ์สำคัญ และข้อสังเกตเชิงนโยบาย"
)

DEFAULT_PROMPT_ADVISOR = (
    'คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์นโยบายคุณธรรมและการขับเคลื่อนสังคมของศูนย์คุณธรรม (องค์การมหาชน)\n'
    'หน้าที่ของคุณคือการร่าง "รายงานสรุปดัชนีคุณธรรมและข้อเสนอแนะเชิงนโยบาย" สำหรับผู้บริหารหน่วยงานภาครัฐและคณะกรรมการส่งเสริมคุณธรรมแห่งชาติ\n'
    "ให้เขียนบทสรุปผู้บริหารอย่างเป็นทางการ ชัดเจน อ้างอิงตัวเลขสถิติและเหตุการณ์จริงในพื้นที่ พร้อมเสนอแนะมาตรการที่นำไปปฏิบัติได้จริง"
)

DEFAULT_MORAL_RUBRIC: Dict[str, Any] = {
    "dimensions": {
        "sufficiency": "พอประมาณ มีเหตุผล มีภูมิคุ้มกัน ไม่โลภ ไม่ฟุ้งเฟ้อ ไม่เบียดเบียนตนเองและผู้อื่น",
        "discipline": "เคารพกฎหมาย กติกา ระเบียบสังคม จรรยาบรรณ รับผิดชอบต่อหน้าที่และส่วนรวม",
        "integrity": "ซื่อสัตย์สุจริต ยึดมั่นความถูกต้อง โปร่งใส ต่อต้านคอร์รัปชัน ไม่รับสินบน",
        "public_mind": "เสียสละเพื่อส่วนรวม บำเพ็ญสาธารณประโยชน์ ช่วยเหลือผู้ประสบภัยและสังคม",
        "gratitude": "รู้คุณและตอบแทนบุญคุณต่อบิดามารดา ครูอาจารย์ ผู้มีพระคุณ ชุมชน และชาติ",
    },
    "scale": {
        "+2": "ดีเด่นมาก / เป็นแบบอย่างยอดเยี่ยมที่สร้างผลกระทบเชิงบวกกว้างขวาง",
        "+1": "เชิงบวก / ปฏิบัติตามคุณธรรมและบทบาทหน้าที่อย่างเหมาะสม",
        "0": "เป็นกลาง / รายงานข้อเท็จจริงทั่วไปโดยไม่มีนัยยะทางคุณธรรม",
        "-1": "ฝ่าฝืน / บกพร่อง ขัดต่อกฎระเบียบหรือความเหมาะสมระดับทั่วไป",
        "-2": "ร้ายแรง / บั่นทอนคุณธรรมอย่างรุนแรง สร้างความเสียหายต่อสังคม",
    },
    "ambiguity_rules": [
        "ข่าวปราบปรามทุจริต / จับกุมเจ้าหน้าที่รับสินบน: สุจริต (integrity) = -2 หรือ -1 (สะท้อนการทุจริตที่มีอยู่จริง), วินัย (discipline) = +1 หรือ +2 (สะท้อนการบังคับใช้กฎหมายอย่างเข้มงวด)",
        "ข่าวอุบัติเหตุจราจรจากความประมาท / เมาแล้วขับ: วินัย (discipline) = -2",
        "ข่าวระดมทุนช่วยเหลือผู้ประสบภัย / กู้ภัย: จิตอาสา (public_mind) = +2 (หากโปร่งใส)",
        "เนื้อหาเสียดสี (satire) หรือข้อมูลที่ยังไม่ยืนยัน (unverified): ให้ติดธง flags ที่เหมาะสม และถ้าไม่เกี่ยวกับมิตินั้นให้ relevant = false และ score = null",
    ],
}

DEFAULT_SETTINGS: Dict[str, Dict[str, Any]] = {
    "ingest_interval_minutes": {"value": env_settings.INGEST_INTERVAL_MINUTES, "is_secret": False},
    "max_items_per_feed": {"value": env_settings.MAX_ITEMS_PER_FEED, "is_secret": False},
    "daily_budget_thb": {"value": env_settings.DAILY_BUDGET_THB, "is_secret": False},
    "llm_endpoint": {"value": env_settings.LITELLM_ENDPOINT, "is_secret": False},
    "llm_api_key": {"value": env_settings.LITELLM_API_KEY, "is_secret": True},
    "llm_model": {"value": env_settings.LITELLM_MODEL, "is_secret": False},
    "llm_embedding_model": {"value": env_settings.LITELLM_EMBEDDING_MODEL, "is_secret": False},
    "prompt_scoring": {"value": DEFAULT_PROMPT_SCORING, "is_secret": False},
    "prompt_chat": {"value": DEFAULT_PROMPT_CHAT, "is_secret": False},
    "prompt_advisor": {"value": DEFAULT_PROMPT_ADVISOR, "is_secret": False},
    "moral_rubric": {"value": DEFAULT_MORAL_RUBRIC, "is_secret": False},
    "alert_shift_threshold": {"value": 0.30, "is_secret": False},
    "alert_cooldown_hours": {"value": 24, "is_secret": False},
    "alert_email_enabled": {"value": False, "is_secret": False},
    "alert_email_recipients": {"value": "", "is_secret": False},
    "smtp_host": {"value": "", "is_secret": False},
    "smtp_port": {"value": 587, "is_secret": False},
    "smtp_user": {"value": "", "is_secret": False},
    "smtp_password": {"value": "", "is_secret": True},
    "alert_line_enabled": {"value": False, "is_secret": False},
    "line_channel_access_token": {"value": "", "is_secret": True},
    "line_target_id": {"value": "", "is_secret": False},
    "retention_days": {"value": 90, "is_secret": False},
}


async def seed_default_settings_and_sources(session: AsyncSession) -> None:
    """Seeds default system settings and RSS data sources if tables are empty."""
    existing_keys = set((await session.execute(select(SystemSetting.key))).scalars().all())
    added = False
    for key, meta in DEFAULT_SETTINGS.items():
        if key not in existing_keys:
            session.add(
                SystemSetting(
                    key=key,
                    value=meta["value"],
                    is_secret=meta["is_secret"],
                    updated_by="System Default",
                )
            )
            added = True

    source_count = (await session.execute(select(func.count(DataSource.id)))).scalar() or 0
    if source_count == 0:
        from app.ingest.rss import RSS_FEEDS
        for feed in RSS_FEEDS:
            source_type = "google_news" if "news.google.com" in feed["url"] else "rss"
            session.add(
                DataSource(
                    name=feed["source"],
                    source_type=source_type,
                    url=feed["url"],
                    keywords=[],
                    is_enabled=True,
                    created_by="System Default",
                    updated_by="System Default",
                )
            )
        added = True

    if added:
        await session.commit()


async def get_all_settings(session: AsyncSession, mask_secrets: bool = True) -> Dict[str, Any]:
    rows = (await session.execute(select(SystemSetting))).scalars().all()
    values: Dict[str, Any] = {k: m["value"] for k, m in DEFAULT_SETTINGS.items()}
    meta_map: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        val = row.value
        if row.is_secret and mask_secrets:
            val = SECRET_MASK if val else ""
        values[row.key] = val
        meta_map[row.key] = {
            "is_secret": row.is_secret,
            "updated_by": row.updated_by,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    return {"settings": values, "meta": meta_map}


async def get_setting_value(session: AsyncSession, key: str, default: Any = None) -> Any:
    row = (await session.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
    if row is None or row.value is None:
        return DEFAULT_SETTINGS.get(key, {}).get("value", default)
    return row.value


async def update_settings(
    session: AsyncSession,
    updates: Dict[str, Any],
    updated_by: str,
) -> Dict[str, Any]:
    existing_rows = {
        r.key: r for r in (await session.execute(select(SystemSetting))).scalars().all()
    }

    for key, new_val in updates.items():
        if key not in DEFAULT_SETTINGS:
            continue
        is_secret = DEFAULT_SETTINGS[key]["is_secret"]
        # Do not overwrite stored secret with mask placeholder
        if is_secret and new_val == SECRET_MASK:
            continue

        row = existing_rows.get(key)
        if row:
            row.value = new_val
            row.updated_by = updated_by
            row.updated_at = datetime.utcnow()
        else:
            session.add(
                SystemSetting(
                    key=key,
                    value=new_val,
                    is_secret=is_secret,
                    updated_by=updated_by,
                )
            )

    await session.commit()
    return await get_all_settings(session, mask_secrets=True)


async def send_test_notification(session: AsyncSession, channel: str) -> Dict[str, Any]:
    raw = await get_all_settings(session, mask_secrets=False)
    cfg = raw["settings"]

    if channel == "line":
        token = (cfg.get("line_channel_access_token") or "").strip()
        target_id = (cfg.get("line_target_id") or "").strip()
        if not token or not target_id:
            return {"status": "error", "message": "กรุณาระบุ LINE Channel Access Token และ Target ID ให้ครบถ้วน"}

        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                "https://api.line.me/v2/bot/message/push",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={
                    "to": target_id,
                    "messages": [
                        {
                            "type": "text",
                            "text": "[SocialEye] ทดสอบการเชื่อมต่อแจ้งเตือนผ่าน LINE Official Account สำเร็จ",
                        }
                    ],
                },
            )
        if res.status_code >= 400:
            return {"status": "error", "message": f"LINE API ตอบกลับ {res.status_code}: {res.text}"}
        return {"status": "success", "message": "ส่งข้อความทดสอบไปยัง LINE OA สำเร็จ"}

    if channel == "email":
        host = (cfg.get("smtp_host") or "").strip()
        port = int(cfg.get("smtp_port") or 587)
        user = (cfg.get("smtp_user") or "").strip()
        password = cfg.get("smtp_password") or ""
        recipients = [r.strip() for r in (cfg.get("alert_email_recipients") or "").split(",") if r.strip()]

        if not host or not recipients:
            return {"status": "error", "message": "กรุณาระบุ SMTP Host และอีเมลผู้รับให้ครบถ้วน"}

        msg = EmailMessage()
        msg["Subject"] = "[SocialEye] ทดสอบระบบแจ้งเตือนทางอีเมล"
        msg["From"] = user or "noreply@socialeye.addpay.in.th"
        msg["To"] = ", ".join(recipients)
        msg.set_content("ข้อความทดสอบจากระบบ SocialEye: การตั้งค่า SMTP Email Alert ทำงานได้ปกติ")

        try:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.starttls()
                if user and password:
                    server.login(user, password)
                server.send_message(msg)
            return {"status": "success", "message": f"ส่งอีเมลทดสอบไปยัง {', '.join(recipients)} สำเร็จ"}
        except Exception as exc:
            return {"status": "error", "message": f"ส่งอีเมลไม่สำเร็จ: {exc}"}

    return {"status": "error", "message": f"ไม่รองรับช่องทาง: {channel}"}


async def get_llm_config(session: AsyncSession | None = None) -> Dict[str, str]:
    """Resolves live LLM Endpoint, API Key, Chat Model, and Embedding Model from DB with .env fallback."""
    async def _load(s: AsyncSession) -> Dict[str, str]:
        raw = await get_all_settings(s, mask_secrets=False)
        cfg = raw["settings"]
        return {
            "endpoint": (cfg.get("llm_endpoint") or env_settings.LITELLM_ENDPOINT).rstrip("/"),
            "api_key": str(cfg.get("llm_api_key") or env_settings.LITELLM_API_KEY),
            "model": str(cfg.get("llm_model") or env_settings.LITELLM_MODEL),
            "embedding_model": str(cfg.get("llm_embedding_model") or env_settings.LITELLM_EMBEDDING_MODEL),
        }

    try:
        if session is not None:
            return await _load(session)
        async with AsyncSessionLocal() as own_session:
            return await _load(own_session)
    except Exception:
        return {
            "endpoint": env_settings.LITELLM_ENDPOINT.rstrip("/"),
            "api_key": env_settings.LITELLM_API_KEY,
            "model": env_settings.LITELLM_MODEL,
            "embedding_model": env_settings.LITELLM_EMBEDDING_MODEL,
        }


async def test_llm_connection(session: AsyncSession) -> Dict[str, Any]:
    """Tests connectivity to the configured LLM Endpoint and lists available models."""
    cfg = await get_llm_config(session)
    endpoint = cfg["endpoint"]
    api_key = cfg["api_key"]

    if not endpoint:
        return {"status": "error", "message": "กรุณาระบุ API Endpoint URL", "models": []}

    try:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(f"{endpoint}/models", headers=headers)
        if res.status_code >= 400:
            return {
                "status": "error",
                "message": f"Gateway ตอบกลับสถานะ {res.status_code}: {res.text[:200]}",
                "models": [],
            }
        data = res.json()
        models = [m.get("id") for m in data.get("data", []) if m.get("id")]
        return {
            "status": "success",
            "message": f"เชื่อมต่อ {endpoint} สำเร็จ (พบ {len(models)} โมเดล)",
            "models": models,
        }
    except Exception as exc:
        return {"status": "error", "message": f"ไม่สามารถเชื่อมต่อ Gateway ได้: {exc}", "models": []}


async def get_ai_prompts_and_rubric(session: AsyncSession | None = None) -> Dict[str, Any]:
    """Loads live System Prompts and Moral Rubric from DB with default fallback."""
    async def _load(s: AsyncSession) -> Dict[str, Any]:
        raw = await get_all_settings(s, mask_secrets=False)
        cfg = raw["settings"]
        rubric = cfg.get("moral_rubric")
        if not isinstance(rubric, dict):
            rubric = DEFAULT_MORAL_RUBRIC
        return {
            "prompt_scoring": cfg.get("prompt_scoring") or DEFAULT_PROMPT_SCORING,
            "prompt_chat": cfg.get("prompt_chat") or DEFAULT_PROMPT_CHAT,
            "prompt_advisor": cfg.get("prompt_advisor") or DEFAULT_PROMPT_ADVISOR,
            "moral_rubric": rubric,
        }

    try:
        if session is not None:
            return await _load(session)
        async with AsyncSessionLocal() as own_session:
            return await _load(own_session)
    except Exception:
        return {
            "prompt_scoring": DEFAULT_PROMPT_SCORING,
            "prompt_chat": DEFAULT_PROMPT_CHAT,
            "prompt_advisor": DEFAULT_PROMPT_ADVISOR,
            "moral_rubric": DEFAULT_MORAL_RUBRIC,
        }


def format_rubric_text(rubric: Dict[str, Any]) -> str:
    dims = rubric.get("dimensions", {})
    scale = rubric.get("scale", {})
    rules = rubric.get("ambiguity_rules", [])

    dim_names = {
        "sufficiency": "1. พอเพียง (sufficiency)",
        "discipline": "2. วินัย (discipline)",
        "integrity": "3. สุจริต (integrity)",
        "public_mind": "4. จิตอาสา (public_mind)",
        "gratitude": "5. กตัญญู (gratitude)",
    }
    lines = ["คุณธรรม 5 ด้านประกอบด้วย:"]
    for k, label in dim_names.items():
        lines.append(f"{label}: {dims.get(k, '')}")

    lines.append("\nเกณฑ์คะแนน (-2 ถึง +2):")
    for level in ["+2", "+1", "0", "-1", "-2"]:
        lines.append(f"{level}: {scale.get(level, '')}")

    if rules:
        lines.append("\nกฎกรณีพิเศษ / เคสกำกวม:")
        for r in rules:
            if str(r).strip():
                lines.append(f"- {str(r).strip()}")

    return "\n".join(lines)


async def reset_ai_defaults(session: AsyncSession, target: str, updated_by: str) -> Dict[str, Any]:
    """Resets System Prompts and/or Moral Rubric back to defaults."""
    updates: Dict[str, Any] = {}
    if target in ("prompts", "all"):
        updates["prompt_scoring"] = DEFAULT_PROMPT_SCORING
        updates["prompt_chat"] = DEFAULT_PROMPT_CHAT
        updates["prompt_advisor"] = DEFAULT_PROMPT_ADVISOR
    if target in ("rubric", "all"):
        updates["moral_rubric"] = DEFAULT_MORAL_RUBRIC

    if not updates:
        return await get_all_settings(session, mask_secrets=True)
    return await update_settings(session, updates, updated_by=updated_by)
