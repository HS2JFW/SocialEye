from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Column, Integer, String, Float, Text, Boolean, DateTime, ForeignKey, Index, JSON
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Content(Base):
    __tablename__ = "contents"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(1024), unique=True, index=True, nullable=False)
    title = Column(String(512), nullable=False)
    text = Column(Text, nullable=False)
    source = Column(String(100), index=True, nullable=False)
    author = Column(String(200), nullable=True)
    published_at = Column(DateTime, default=datetime.utcnow, index=True)
    reach = Column(Integer, default=1000)
    created_at = Column(DateTime, default=datetime.utcnow)

    evaluations = relationship("Evaluation", back_populates="content", cascade="all, delete-orphan")

class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    content_id = Column(Integer, ForeignKey("contents.id", ondelete="CASCADE"), index=True, nullable=False)
    
    # 5 Moral Dimensions (-2.0 to +2.0, None if irrelevant)
    sufficiency_score = Column(Float, nullable=True) # พอเพียง
    discipline_score = Column(Float, nullable=True)  # วินัย
    integrity_score = Column(Float, nullable=True)   # สุจริต
    public_mind_score = Column(Float, nullable=True) # จิตอาสา
    gratitude_score = Column(Float, nullable=True)   # กตัญญู

    confidence = Column(Float, default=1.0)
    rationale = Column(Text, nullable=True)
    evidence_quote = Column(Text, nullable=True)
    province = Column(String(100), default="ระดับประเทศ", index=True)
    flags = Column(JSON, default=list) # e.g. ["satire", "unverified", "opinion"]
    comment_sentiment = Column(Float, nullable=True)

    evaluated_at = Column(DateTime, default=datetime.utcnow)
    
    # Original AI Predictions for benchmark and accuracy comparison
    original_ai_scores = Column(JSON, nullable=True)

    # Entity-Level Scoring & Overall Virtues (v2 Rubric)
    news_summary = Column(Text, nullable=True)
    overall_virtues = Column(JSON, nullable=True)
    entity_evaluations = Column(JSON, nullable=True)
    
    # Human-in-the-loop review
    is_reviewed = Column(Boolean, default=False, index=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewer_notes = Column(Text, nullable=True)

    content = relationship("Content", back_populates="evaluations")

class GoldenSample(Base):
    __tablename__ = "golden_samples"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False)
    text = Column(Text, nullable=False)
    source = Column(String(100), default="Golden Dataset")
    
    sufficiency_score = Column(Float, nullable=True)
    discipline_score = Column(Float, nullable=True)
    integrity_score = Column(Float, nullable=True)
    public_mind_score = Column(Float, nullable=True)
    gratitude_score = Column(Float, nullable=True)

    evidence_quote = Column(Text, nullable=True)
    rationale = Column(Text, nullable=True)
    province = Column(String(100), default="ระดับประเทศ")
    category = Column(String(100), default="general") # e.g. corruption, volunteering, legal, sufficiency
    
    embedding = Column(JSON, nullable=True) # list of floats for cosine similarity search
    created_by = Column(String(100), default="Expert Panel")
    created_at = Column(DateTime, default=datetime.utcnow)

class DailyIndex(Base):
    __tablename__ = "daily_indices"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String(10), index=True, nullable=False)
    dimension = Column(String(50), index=True, nullable=False)
    province = Column(String(100), default="ระดับประเทศ", index=True)
    score_0_to_5 = Column(Float, nullable=False)
    sample_count = Column(Integer, default=0)
    calculated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_daily_dim_date_prov", "date", "dimension", "province"),
    )

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    level = Column(String(20), default="WARNING")
    dimension = Column(String(50), nullable=True)
    triggered_at = Column(DateTime, default=datetime.utcnow, index=True)
    is_resolved = Column(Boolean, default=False)

class PolicyReport(Base):
    __tablename__ = "policy_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String(50), default="weekly", index=True) # weekly | monthly | custom
    title = Column(String(512), nullable=False)
    period_start = Column(String(20), nullable=False) # YYYY-MM-DD
    period_end = Column(String(20), nullable=False)   # YYYY-MM-DD
    
    executive_summary = Column(Text, nullable=False) # บทสรุปผู้บริหาร
    moral_shifts = Column(JSON, nullable=True)       # การเปลี่ยนแปลง 5 มิติ
    recommendations = Column(JSON, nullable=True)    # ข้อเสนอแนะเชิงนโยบายและแคมเปญ
    regional_highlights = Column(JSON, nullable=True)# จุดเด่นรายภูมิภาค
    metrics_summary = Column(JSON, nullable=True)    # สถิติตัวเลขสรุป
    
    status = Column(String(50), default="draft", index=True) # draft | reviewed | published
    reviewed_by = Column(String(100), nullable=True)
    reviewer_notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(JSON, nullable=True)
    is_secret = Column(Boolean, default=False)
    updated_by = Column(String(200), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    source_type = Column(String(50), default="rss", index=True) # rss | google_news
    url = Column(String(1024), nullable=False)
    keywords = Column(JSON, default=list)
    is_enabled = Column(Boolean, default=True, index=True)
    created_by = Column(String(200), nullable=True)
    updated_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_sub = Column(String(200), nullable=True, index=True)
    actor_name = Column(String(200), nullable=True)
    actor_email = Column(String(200), nullable=True)
    actor_role = Column(String(50), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(100), nullable=False, index=True)
    resource_id = Column(String(200), nullable=True)
    summary = Column(Text, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
