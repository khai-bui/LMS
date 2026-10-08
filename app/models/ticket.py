from sqlalchemy import Column, Integer, String, Text, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.db.database import Base
import enum

class TicketStatus(enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"

class Ticket(Base):
    __tablename__ = "TICKETS"

    ticket_id = Column(Integer, primary_key=True, autoincrement=True)
    submitted_by = Column(Integer, ForeignKey("USERS.user_id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("USERS.user_id", onupdate="CASCADE", ondelete="SET NULL"))
    issue_type = Column(String(100), nullable=False)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(Enum(TicketStatus), default=TicketStatus.open, nullable=False)
    created_at = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    resolved_at = Column(DateTime)

    submitter = relationship("User", back_populates="submitted_tickets", foreign_keys=[submitted_by])
    assignee = relationship("User", back_populates="assigned_tickets", foreign_keys=[assigned_to])
