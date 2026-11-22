# SocialEye (ระบบสังเกตการณ์คุณธรรมจากสื่อและโซเชียลมีเดีย)

> ระบบ AI Agent เฝ้าติดตามและวิเคราะห์ข่าวสาร สื่อออนไลน์ และโซเชียลมีเดีย ว่าส่งผลสะท้อนต่อ **ดัชนีคุณธรรม 5 ด้าน** ได้แก่ **พอเพียง, วินัย, สุจริต, จิตอาสา และ กตัญญู**

---

## 📌 คุณลักษณะหลัก (Key Features)

1. **ดัชนีคุณธรรม 5 มิติ (สเกล 0.00 – 5.00)**
   - คำนวณจากคะแนนระดับเนื้อหา (−2 ถึง +2) ถ่วงน้ำหนักด้วย Reach (ยอดการมองเห็น) และ Confidence
   - แปลงสเกลตามสูตรมาตรฐานของศูนย์คุณธรรม โดย **2.50 = ระดับเป็นกลาง (Neutral)**
   - แสดงผลแยกรายวัน ระดับประเทศ และ **คะแนนแยก 77 จังหวัด**
2. **AI Agent ประเมินคุณธรรม (Scoring Agent)**
   - เชื่อมต่อผ่าน **LiteLLM Gateway** (`https://llm.addpay.in.th/v1`)
   - ใช้โมเดล **`gemma-4-31b-it`** และโมเดลฝังข้อความ **`embeded`**
   - ประเมินพร้อมสกัดหลักฐานอ้างอิง (Evidence quote), เหตุผล (Rationale), และตรวจจับธงข้อความ (`satire`, `unverified`, `opinion`)
3. **ระบบดึงข้อมูลอัตโนมัติ (Automated Ingest)**
   - รองรับ RSS Feeds จาก 10 สำนักข่าวชั้นนำ (Thai PBS, ไทยรัฐ, มติชน, ข่าวสด, เดลินิวส์, ประชาชาติ, The Standard, ไทยโพสต์ ฯลฯ)
   - เชื่อมต่อ Google News RSS ค้นหาตามคำสำคัญคุณธรรม
4. **ระบบตรวจทานโดยผู้เชี่ยวชาญ (Human-in-the-loop Labeling)**
   - ผู้เชี่ยวชาญ/นักวิเคราะห์สามารถตรวจสอบและปรับแก้คะแนนได้โดยตรงบนแดชบอร์ด
   - เก็บข้อมูลเป็น Golden Dataset เพื่อใช้วัดความแม่นยำและทำ Dynamic Few-shot ต่อไป
5. **ระบบเตือนภัยความผิดปกติ (Moral Anomaly Alerts)**
   - แจ้งเตือนเมื่อพบเหตุการณ์บั่นทอนคุณธรรมรุนแรง (Polarity −2) ที่มี Reach สูง

---

## 🏗️ สถาปัตยกรรมระบบ (Architecture)

- **Backend**: Python 3.11, FastAPI, SQLAlchemy (Async), APScheduler, PyThaiNLP
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Nginx
- **Database**: PostgreSQL 16 + pgvector, Redis
- **Deployment**: รองรับ **Coolify** (https://coolify.addpay.in.th) ผ่าน Docker Compose

---

## 🚀 การติดตั้งและรันระบบ

### 1. รันด้วย Docker Compose (แนะนำ)
```bash
# คัดลอกไฟล์ Environment
cp .env.example .env
# กรอกค่า LITELLM_API_KEY ในไฟล์ .env

# รันระบบทั้งหมด
docker compose up -d --build
```
- Frontend Dashboard: `http://localhost:3000`
- Backend API Docs: `http://localhost:8000/docs`

---

## 📄 เอกสารอ้างอิง
- [เกณฑ์และรูบริกการประเมินคุณธรรม 5 ด้าน](docs/rubric.md)
- [เอกสารข้อกำหนดการออกแบบ (Design Spec)](docs/design_spec.md)
