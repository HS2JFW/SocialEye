from app.analyzer.provinces import extract_province

THAI_DOMESTIC_MARKERS = (
    "ไทย", "ประเทศไทย", "กทม", "กรุงเทพ", "รัฐบาล", "ครม.", "รัฐสภา", "สภาผู้แทน",
    "นายกฯ", "ตำรวจ", "ศาล", "ป.ป.ช.", "ปปง.", "สตง.", "ดีเอสไอ", "กสทช.", "กกต.",
    "กระทรวง", "อบต.", "อบจ.", "เทศบาล", "ผู้ว่าฯ", "ผู้ว่าราชการ", "คนไทย", "ชาวบ้าน",
    "จังหวัด", "อำเภอ", "ตำบล", "หมู่บ้าน", "บาท", "สน.", "สภ.", "ราชการ", "ศูนย์คุณธรรม",
)

FOREIGN_URL_MARKERS = (
    "/world/", "/inter/", "/international/", "/foreign/", "/global/", "/abroad/",
)

FOREIGN_TEXT_MARKERS = (
    "ต่างประเทศ", "รอบโลก", "สหรัฐฯ", "สหรัฐอเมริกา", "อเมริกา", "วอชิงตัน", "เพนตากอน",
    "โดนัลด์ ทรัมป์", "ทรัมป์", "ไบเดน", "รัสเซีย", "มอสโก", "ปูติน", "ยูเครน", "เคียฟ", "เซเลนสกี",
    "อิสราเอล", "กาซา", "ปาเลสไตน์", "ฮามาส", "อิหร่าน", "เตหะราน", "เลบานอน", "ซีเรีย",
    "สหภาพยุโรป", "ยุโรป", "อังกฤษ", "ลอนดอน", "ฝรั่งเศส", "ปารีส", "เยอรมนี", "เบอร์ลิน",
    "ญี่ปุ่น", "โตเกียว", "เกาหลีเหนือ", "เปียงยาง", "เกาหลีใต้", "โซล", "ไต้หวัน", "ฮ่องกง",
    "อินเดีย", "ออสเตรเลีย", "แคนาดา", "บราซิล", "เม็กซิโก", "สหประชาชาติ", "นาโต", "nato",
)


def is_foreign_only_news(url: str, title: str, text: str = "") -> bool:
    """Returns True when an item clearly covers foreign news with no Thai domestic context."""
    combined = f"{title} {text[:800]}".lower()
    url_lower = (url or "").lower()

    # Any explicit Thai province or domestic marker keeps the article
    if extract_province(f"{title} {text[:400]}") != "ระดับประเทศ":
        return False
    if any(m in combined for m in THAI_DOMESTIC_MARKERS):
        return False

    if any(u in url_lower for u in FOREIGN_URL_MARKERS):
        return True
    if any(f in combined for f in FOREIGN_TEXT_MARKERS):
        return True
    return False
