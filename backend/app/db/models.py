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
    source = Column(String(100), index=True, nullable=False) # e.g. "Thai PBS", "Thairath", "Google News"
    author = Column(String(200), nullable=True)
    published_at = Column(DateTime, default=datetime.utcnow, index=True)
    reach = Column(Integer, default=1000) # Estimated reach / engagement
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
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
    comment_sentiment = Column(Float, nullable=True) # -1.0 to +1.0

    evaluated_at = Column(DateTime, default=datetime.utcnow)
    
    # Human-in-the-loop review
    is_reviewed = Column(Boolean, default=False, index=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewer_notes = Column(Text, nullable=True)

    content = relationship("Content", back_populates="evaluations")

class DailyIndex(Base):
    __tablename__ = "daily_indices"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String(10), index=True, nullable=False) # YYYY-MM-DD
    dimension = Column(String(50), index=True, nullable=False) # sufficiency, discipline, integrity, public_mind, gratitude
    province = Column(String(100), default="ระดับประเทศ", index=True)
    score_0_to_5 = Column(Float, nullable=False) # 0.00 to 5.00
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
    level = Column(String(20), default="WARNING") # INFO, WARNING, CRITICAL
    dimension = Column(String(50), nullable=True)
    triggered_at = Column(DateTime, default=datetime.utcnow, index=True)
    is_resolved = Column(Boolean, default=False)
