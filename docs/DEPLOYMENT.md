# คู่มือการติดตั้งและโครงสร้างระบบ SocialEye (Deployment & SSO Summary)

> เอกสารสรุปข้อมูลการติดตั้งโครงสร้างพื้นฐาน, บริการบน Coolify, ระบบยืนยันตัวตน Authentik SSO และสิทธิ์การใช้งาน (RBAC)

---

## 1. ภาพรวมบริการและโดเมน (Services & Domains)

| บริการ | URL / Endpoint | Coolify Project | Coolify UUID | หมายเหตุ |
|---|---|---|---|---|
| **SocialEye Web & API** | https://socialeye.addpay.in.th | `SocialEye` (`wun3dn8as5pvtqgg1durqznq`) | `7kdvt5w0vhoo82trip6mlcmi` | Docker Compose (Frontend Nginx + Backend FastAPI) |
| **Authentik SSO (IdP)** | https://auth.addpay.in.th | `auth` (`o9oc9toekciku8qivynlxyys`) | `gy8j5vlhfxnilmxqgsi0hdkd` | Standalone OIDC Identity Provider + 2FA |
| **LiteLLM Gateway** | https://llm.addpay.in.th/v1 | `llm` (`hr8xu5v0u5tghgngg0nofe0i`) | `smiwcxf3iqfxr8mqc1duyon4` | Model: `gemma-4-31b-it`, Embedding: `embeded` |
| **Coolify Control Plane** | https://coolify.addpay.in.th | — | Server `localhost` (`rkw0sqsanf2uf7j2fhskriqs`) | Auto-deploy จาก GitHub branch `main` |

- **Git Repository**: `https://github.com/HS2JFW/SocialEye.git` (branch `main`)

---

## 2. โครงสร้าง Container ใน SocialEye (`docker-compose.yml`)

| Service | Container Name | Image / Build | หน้าที่ |
|---|---|---|---|
| `frontend` | `socialeye_frontend` | `./frontend/Dockerfile` (Node 20 + Nginx Alpine) | React + Vite SPA, Tailwind CSS, OIDC PKCE Client, Reverse Proxy `/api` → `backend:8000` |
| `backend` | `socialeye_backend` | `./backend/Dockerfile` (Python + FastAPI) | REST API, JWT/JWKS Auth & RBAC, Scoring Pipeline, APScheduler, Policy Advisor |
| `postgres` | `socialeye_postgres` | `pgvector/pgvector:pg16` | ฐานข้อมูลหลัก + Vector Embeddings (`pgdata` volume) |
| `redis` | `socialeye_redis` | `redis:7-alpine` | Cache / Queue (`redisdata` volume) |
| `neo4j` | `socialeye_neo4j` | `neo4j:5-community` | Knowledge Graph (`neo4jdata` volume) |

---

## 3. การตั้งค่า Authentik SSO & OIDC (`https://auth.addpay.in.th`)

### 3.1 โครงสร้าง Container ของ Authentik
- ใช้ Docker Compose บน Coolify (`gy8j5vlhfxnilmxqgsi0hdkd`) ประกอบด้วย `postgresql` (`postgres:16-alpine`), `authentik-worker`, และ `authentik-server` (`ghcr.io/goauthentik/server:2026.5.6`)
- กำหนดให้ `authentik-server` รอ `authentik-worker` (`condition: service_healthy`) ก่อนเริ่มทำงาน เพื่อป้องกันการทำ Database Migration ชนกัน
- บังคับเปิดใช้ **2FA (TOTP / WebAuthn Passkey)** ใน Stage `default-authentication-mfa-validation` (`not_configured_action: configure`)

### 3.2 ข้อมูล OIDC Provider & Application
- **Application Name / Slug**: `SocialEye` / `socialeye`
- **Provider Name**: `SocialEye OIDC` (Public Client + PKCE `S256`)
- **Client ID**: `socialeye-web`
- **Issuer URL**: `https://auth.addpay.in.th/application/o/socialeye/`
- **OIDC Discovery**: `https://auth.addpay.in.th/application/o/socialeye/.well-known/openid-configuration`
- **JWKS URI**: `https://auth.addpay.in.th/application/o/socialeye/jwks/`
- **Token / Session Validity**: Access Token 8 ชั่วโมง, Refresh Token 8 ชั่วโมง
- **Allowed Redirect URIs**:
  - `https://socialeye.addpay.in.th/`
  - `http://localhost:5173/`
  - `http://localhost:3880/`
- **Admin Console**: https://auth.addpay.in.th/if/admin/ (บัญชีเริ่มต้น: `admin@addpay.in.th` / `akadmin` — โปรดเก็บรหัสผ่านไว้ในระบบจัดการความลับ/Coolify และเปลี่ยนรหัสผ่านพร้อมตั้งค่า 2FA ทันทีหลังเข้าใช้งาน)

---

## 4. การแบ่งสิทธิ์ผู้ใช้งาน (Role Groups & RBAC)

ผู้ใช้ทุกคนต้องสังกัดอย่างน้อย 1 กลุ่มใน Authentik มิฉะนั้นระบบจะปฏิเสธการเข้าใช้งานด้วย `403 Forbidden`:

| Authentik Group | บทบาท (Role) | ขอบเขตสิทธิ์ |
|---|---|---|
| `socialeye-viewers` | **Viewer** | ดู Dashboard ภาพรวม, แผนที่ 77 จังหวัด, ประเด็นร้อน, อ่านรายงานที่ `published` แล้ว, ถาม AI Chat, Export CSV |
| `socialeye-analysts` | **Analyst** | สิทธิ์ Viewer + ติดป้ายแก้ไขคะแนนใน Quality Center, จัดการ Golden Samples, สั่งร่างรายงาน (`draft`), ตรวจทานและอนุมัติเผยแพร่รายงาน (`review`/`publish`) |
| `socialeye-admins` | **Admin** | สิทธิ์ Analyst + สั่งดึงข้อมูล (`ingest` RSS / YouTube / Pantip / Wisesight), โหลด Golden Seed, รัน PDPA Retention 90 วัน, ดูสถานะ Backup |

- ระบบบันทึก **Audit Trail** (`reviewed_by`, `created_by`) จากตัวตนใน JWT Token (`name` และ `email`) โดยอัตโนมัติ
- เอกสารคำศัพท์มาตรฐานและ ADR ที่เกี่ยวข้อง: [GLOSSARY.md](../GLOSSARY.md) และ [0001-authentik-oidc-rbac.md](./adr/0001-authentik-oidc-rbac.md)

---

## 5. ตัวแปรสภาพแวดล้อม (Environment Variables)

ตั้งค่าใน `.env` (สำหรับ Local) และใน Coolify Environment Variables (สำหรับ Production):

```env
APP_ENV=production

# Authentik OIDC (Production บังคับเปิด Auth เสมอ; Local ตั้ง AUTH_ENABLED=false ได้)
AUTH_ENABLED=true
OIDC_ISSUER=https://auth.addpay.in.th/application/o/socialeye/
OIDC_CLIENT_ID=socialeye-web
OIDC_JWKS_URL=
AUTH_DEV_ROLE=admin

# LiteLLM
LITELLM_ENDPOINT=https://llm.addpay.in.th/v1
LITELLM_API_KEY=<set-in-coolify-or-local-env>
LITELLM_MODEL=gemma-4-31b-it
LITELLM_EMBEDDING_MODEL=embeded
```

---

## 6. การเพิ่มผู้ใช้งานใหม่ (Quick Operations)

1. เข้าสู่หน้าผู้ดูแล Authentik ที่ https://auth.addpay.in.th/if/admin/
2. ไปที่ **Directory → Users → Create** เพื่อสร้างบัญชีผู้ใช้ใหม่ (หรือตั้งรหัสผ่าน/ส่งลิงก์เชิญ)
3. ไปที่ **Directory → Groups** เลือกกลุ่ม `socialeye-viewers`, `socialeye-analysts` หรือ `socialeye-admins` แล้วเพิ่มผู้ใช้เข้ากลุ่ม
4. เมื่อผู้ใช้เข้าเว็บ https://socialeye.addpay.in.th ครั้งแรก ระบบจะพาไปหน้า Authentik เพื่อกรอกรหัสผ่านและตั้งค่า 2FA (TOTP หรือ Passkey) จากนั้นจึงเข้าสู่หน้า Dashboard ตามสิทธิ์
