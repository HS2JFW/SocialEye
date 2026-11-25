from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from typing import List, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings


class Role(str, Enum):
    VIEWER = "viewer"
    ANALYST = "analyst"
    ADMIN = "admin"


ROLE_LEVEL = {
    Role.VIEWER: 1,
    Role.ANALYST: 2,
    Role.ADMIN: 3,
}

GROUP_TO_ROLE = {
    "socialeye-admins": Role.ADMIN,
    "socialeye-analysts": Role.ANALYST,
    "socialeye-viewers": Role.VIEWER,
}

security = HTTPBearer(auto_error=False)


@dataclass
class UserContext:
    sub: str
    email: str
    name: str
    role: Role
    groups: List[str]

    @property
    def display_identity(self) -> str:
        if self.name and self.email:
            return f"{self.name} ({self.email})"
        return self.name or self.email or self.sub


@lru_cache(maxsize=4)
def _get_jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)


def _resolve_jwks_url() -> str:
    if settings.OIDC_JWKS_URL:
        return settings.OIDC_JWKS_URL
    issuer = settings.OIDC_ISSUER.rstrip("/")
    return f"{issuer}/jwks/"


def _resolve_role_from_groups(groups: List[str]) -> Optional[Role]:
    matched_roles = [GROUP_TO_ROLE[g] for g in groups if g in GROUP_TO_ROLE]
    if not matched_roles:
        return None
    return max(matched_roles, key=lambda r: ROLE_LEVEL[r])


def decode_and_verify_jwt(token: str) -> UserContext:
    jwks_url = _resolve_jwks_url()
    try:
        jwks_client = _get_jwks_client(jwks_url)
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            issuer=settings.OIDC_ISSUER,
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"โทเคนยืนยันตัวตนไม่ถูกต้อง: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify audience or authorized party matches OIDC_CLIENT_ID when configured
    if settings.OIDC_CLIENT_ID:
        aud = payload.get("aud")
        azp = payload.get("azp")
        aud_list = [aud] if isinstance(aud, str) else (aud or [])
        if settings.OIDC_CLIENT_ID not in aud_list and azp != settings.OIDC_CLIENT_ID:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token audience ไม่ตรงกับแอปพลิเคชัน SocialEye",
                headers={"WWW-Authenticate": "Bearer"},
            )

    raw_groups = payload.get("groups") or []
    if isinstance(raw_groups, str):
        raw_groups = [raw_groups]

    role = _resolve_role_from_groups(raw_groups)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="บัญชีของท่านยังไม่ได้รับสิทธิ์เข้าใช้งาน SocialEye (ต้องอยู่ในกลุ่ม socialeye-viewers, socialeye-analysts หรือ socialeye-admins)",
        )

    return UserContext(
        sub=str(payload.get("sub", "")),
        email=str(payload.get("email", "")),
        name=str(payload.get("name") or payload.get("preferred_username") or payload.get("email") or "User"),
        role=role,
        groups=list(raw_groups),
    )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UserContext:
    if not settings.is_auth_enforced:
        dev_role_str = settings.AUTH_DEV_ROLE.lower()
        dev_role = Role(dev_role_str) if dev_role_str in {r.value for r in Role} else Role.ADMIN
        return UserContext(
            sub="dev-local-user",
            email="dev@socialeye.local",
            name="Local Developer",
            role=dev_role,
            groups=[f"socialeye-{dev_role.value}s"],
        )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="กรุณาเข้าสู่ระบบผ่าน Authentik SSO",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return decode_and_verify_jwt(credentials.credentials)


def require_role(min_role: Role):
    async def _role_guard(user: UserContext = Depends(get_current_user)) -> UserContext:
        if ROLE_LEVEL[user.role] < ROLE_LEVEL[min_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"สิทธิ์ของคุณ ({user.role.value}) ไม่เพียงพอสำหรับการใช้งานส่วนนี้ (ต้องใช้สิทธิ์ระดับ {min_role.value} ขึ้นไป)",
            )
        return user

    return _role_guard


require_viewer = require_role(Role.VIEWER)
require_analyst = require_role(Role.ANALYST)
require_admin = require_role(Role.ADMIN)
