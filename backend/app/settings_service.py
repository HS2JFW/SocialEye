from datetime import datetime
from email.message import EmailMessage
import smtplib
from typing import Any, Dict

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as env_settings
from app.db.models import DataSource, SystemSetting
from app.ingest.rss import RSS_FEEDS

SECRET_MASK = "••••••••"

DEFAULT_SETTINGS: Dict[str, Dict[str, Any]] = {
    "ingest_interval_minutes": {"value": env_settings.INGEST_INTERVAL_MINUTES, "is_secret": False},
    "max_items_per_feed": {"value": env_settings.MAX_ITEMS_PER_FEED, "is_secret": False},
    "daily_budget_thb": {"value": env_settings.DAILY_BUDGET_THB, "is_secret": False},
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
