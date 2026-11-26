from datetime import datetime, timedelta, date
from email.message import EmailMessage
import smtplib
from typing import List

import httpx
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.analyzer.aggregator import DIMENSIONS, extract_eval_dimension_scores
from app.db.models import Alert, Evaluation, Content, DailyIndex
from app.settings_service import get_all_settings


async def _dispatch_external_alert(session: AsyncSession, alert: Alert) -> None:
    """Sends triggered alert to LINE OA and/or Email SMTP if enabled in Settings."""
    raw = await get_all_settings(session, mask_secrets=False)
    cfg = raw["settings"]
    text_msg = f"[{alert.level}] {alert.title}\n{alert.description}"

    if cfg.get("alert_line_enabled") and cfg.get("line_channel_access_token") and cfg.get("line_target_id"):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    "https://api.line.me/v2/bot/message/push",
                    headers={
                        "Authorization": f"Bearer {cfg['line_channel_access_token']}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "to": cfg["line_target_id"],
                        "messages": [{"type": "text", "text": text_msg[:1800]}],
                    },
                )
        except Exception as exc:
            print(f"[Alert] LINE dispatch notice: {exc}")

    if cfg.get("alert_email_enabled") and cfg.get("smtp_host") and cfg.get("alert_email_recipients"):
        recipients = [r.strip() for r in str(cfg["alert_email_recipients"]).split(",") if r.strip()]
        if recipients:
            try:
                msg = EmailMessage()
                msg["Subject"] = f"[SocialEye {alert.level}] {alert.title}"
                msg["From"] = cfg.get("smtp_user") or "noreply@socialeye.addpay.in.th"
                msg["To"] = ", ".join(recipients)
                msg.set_content(text_msg)
                with smtplib.SMTP(cfg["smtp_host"], int(cfg.get("smtp_port") or 587), timeout=10) as server:
                    server.starttls()
                    if cfg.get("smtp_user") and cfg.get("smtp_password"):
                        server.login(cfg["smtp_user"], cfg["smtp_password"])
                    server.send_message(msg)
            except Exception as exc:
                print(f"[Alert] Email dispatch notice: {exc}")


async def check_for_alerts(session: AsyncSession) -> List[Alert]:
    """
    Checks alert triggers using configured thresholds & cooldown:
    1. Dimension shift > alert_shift_threshold in 24h compared to 7-day average
    2. Severe negative event (polarity = -2 at entity or article level)
    """
    raw = await get_all_settings(session, mask_secrets=False)
    cfg = raw["settings"]
    shift_threshold = float(cfg.get("alert_shift_threshold") or 0.30)
    cooldown_hours = int(cfg.get("alert_cooldown_hours") or 24)
    cooldown_cutoff = datetime.utcnow() - timedelta(hours=cooldown_hours)

    alerts: List[Alert] = []

    # 1. Severe -2 items check (supports Entity-Level + legacy scalar)
    stmt = (
        select(Content, Evaluation)
        .join(Evaluation, Content.id == Evaluation.content_id)
        .where(Evaluation.evaluated_at >= datetime.utcnow() - timedelta(hours=24))
    )
    rows = (await session.execute(stmt)).all()

    for content, evaluation in rows:
        severe_dims = []
        for dim_key, dim_name in DIMENSIONS:
            vals = extract_eval_dimension_scores(evaluation, dim_key)
            if any(v <= -2.0 for v in vals):
                severe_dims.append(dim_name)
        if not severe_dims:
            continue

        alert_title = f"พบเหตุการณ์บั่นทอนคุณธรรมระดับวิกฤต: {content.title[:60]}"
        existing = await session.execute(
            select(Alert).where(and_(Alert.title == alert_title, Alert.triggered_at >= cooldown_cutoff))
        )
        if not existing.scalar_one_or_none():
            alert = Alert(
                title=alert_title,
                description=f"ด้าน: {', '.join(severe_dims)} | แหล่งที่มา: {content.source} | จังหวัด: {evaluation.province}\nข้อความ: {evaluation.evidence_quote or content.title}",
                level="CRITICAL",
                dimension="general",
                triggered_at=datetime.utcnow(),
            )
            session.add(alert)
            alerts.append(alert)

    # 2. 24h Dimension shift vs 7-day average
    today_str = date.today().isoformat()
    week_ago_str = (date.today() - timedelta(days=7)).isoformat()
    for dim_key, dim_name in DIMENSIONS:
        idx_rows = (
            await session.execute(
                select(DailyIndex)
                .where(
                    and_(
                        DailyIndex.province == "ระดับประเทศ",
                        DailyIndex.dimension == dim_key,
                        DailyIndex.date >= week_ago_str,
                    )
                )
                .order_by(desc(DailyIndex.date))
            )
        ).scalars().all()
        if len(idx_rows) >= 2:
            latest_val = idx_rows[0].score_0_to_5
            prev_vals = [r.score_0_to_5 for r in idx_rows[1:]]
            avg_7d = sum(prev_vals) / len(prev_vals)
            diff = round(latest_val - avg_7d, 2)
            if abs(diff) >= shift_threshold:
                direction = "ลดลง" if diff < 0 else "เพิ่มขึ้น"
                alert_title = f"ดัชนีด้าน{dim_name}{direction}ผิดปกติ ({diff:+.2f}) ใน 24 ชม. ({today_str})"
                existing = await session.execute(
                    select(Alert).where(and_(Alert.title == alert_title, Alert.triggered_at >= cooldown_cutoff))
                )
                if not existing.scalar_one_or_none():
                    alert = Alert(
                        title=alert_title,
                        description=f"คะแนนล่าสุด {latest_val:.2f} เทียบค่าเฉลี่ย 7 วัน {avg_7d:.2f} (เกณฑ์แจ้งเตือน ±{shift_threshold:.2f})",
                        level="WARNING" if diff < 0 else "INFO",
                        dimension=dim_key,
                        triggered_at=datetime.utcnow(),
                    )
                    session.add(alert)
                    alerts.append(alert)

    if alerts:
        await session.commit()
        for al in alerts:
            await _dispatch_external_alert(session, al)

    return alerts
