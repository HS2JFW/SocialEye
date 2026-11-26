from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog

SENSITIVE_KEYS = ("password", "token", "secret", "api_key")


def _redact_details(details: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(details, dict):
        return details
    cleaned: Dict[str, Any] = {}
    for k, v in details.items():
        if any(s in str(k).lower() for s in SENSITIVE_KEYS):
            cleaned[k] = "••••••••" if v else ""
        elif isinstance(v, dict):
            cleaned[k] = _redact_details(v)
        else:
            cleaned[k] = v
    return cleaned


async def record_audit_log(
    session: AsyncSession,
    user: Any,
    action: str,
    resource_type: str,
    resource_id: str = "",
    summary: str = "",
    details: Optional[Dict[str, Any]] = None,
    dedupe_minutes: int = 0,
) -> None:
    """Persists an immutable audit log entry with automatic secret redaction."""
    try:
        sub = getattr(user, "sub", "system") if user else "system"
        if dedupe_minutes > 0:
            cutoff = datetime.utcnow() - timedelta(minutes=dedupe_minutes)
            existing = (
                await session.execute(
                    select(AuditLog.id)
                    .where(
                        and_(
                            AuditLog.actor_sub == str(sub),
                            AuditLog.action == action,
                            AuditLog.created_at >= cutoff,
                        )
                    )
                    .order_by(desc(AuditLog.id))
                    .limit(1)
                )
            ).scalar_one_or_none()
            if existing:
                return

        role_obj = getattr(user, "role", None)
        role_val = role_obj.value if hasattr(role_obj, "value") else (str(role_obj) if role_obj else "system")

        entry = AuditLog(
            actor_sub=str(sub),
            actor_name=getattr(user, "name", "System") if user else "System",
            actor_email=getattr(user, "email", "") if user else "",
            actor_role=role_val,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id or ""),
            summary=summary,
            details=_redact_details(details),
            created_at=datetime.utcnow(),
        )
        session.add(entry)
        await session.commit()
    except Exception as exc:
        print(f"[AuditLog] Failed to write audit log ({action}): {exc}")


class SystemTaskTracker:
    """Tracks currently running and recently completed background tasks for live UI status."""

    def __init__(self) -> None:
        self._active: Dict[str, Dict[str, Any]] = {}
        self._recent: List[Dict[str, Any]] = []

    def start_task(self, task_type: str, label: str, total: int = 0) -> str:
        task_id = uuid.uuid4().hex[:10]
        self._active[task_id] = {
            "id": task_id,
            "type": task_type,
            "label": label,
            "status": "running",
            "message": label,
            "current": 0,
            "total": total,
            "started_at": datetime.utcnow().isoformat(),
            "finished_at": None,
        }
        return task_id

    def update_task(
        self,
        task_id: str,
        message: Optional[str] = None,
        current: Optional[int] = None,
        total: Optional[int] = None,
    ) -> None:
        task = self._active.get(task_id)
        if not task:
            return
        if message is not None:
            task["message"] = message
        if current is not None:
            task["current"] = current
        if total is not None:
            task["total"] = total

    def finish_task(self, task_id: str, message: str, status: str = "completed") -> None:
        task = self._active.pop(task_id, None)
        if not task:
            return
        task["status"] = status
        task["message"] = message
        task["finished_at"] = datetime.utcnow().isoformat()
        self._recent.insert(0, task)
        self._recent = self._recent[:12]

    def get_status_snapshot(self) -> Dict[str, Any]:
        active_list = list(self._active.values())
        return {
            "is_running": len(active_list) > 0,
            "active_task": active_list[0] if active_list else None,
            "active_count": len(active_list),
            "last_completed": self._recent[0] if self._recent else None,
            "recent_tasks": self._recent[:6],
        }


task_tracker = SystemTaskTracker()
