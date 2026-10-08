from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base

class Report(Base):
    __tablename__ = "REPORTS"

    report_id = Column(Integer, primary_key=True, autoincrement=True)
    generated_by = Column(Integer, ForeignKey("USERS.user_id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False)
    report_type = Column(String(100), nullable=False)
    file_url = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    manager = relationship("User", back_populates="reports")
