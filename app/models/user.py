from sqlalchemy import Column, Integer, String, DateTime, Enum as SQLAEnum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base # Giả sử Base được import từ đây
import enum

# --- Import các model có liên quan ---
# (Bạn cần đảm bảo các file này được import đúng)
#
# from .role import Role 
# from .lecturer import Lecturer
# from .class_model import Class  # Tên file có thể khác
# from .ticket import Ticket
# from .report import Report
# from .notification import Notification
#
# === IMPORT MỚI CẦN THIẾT ===
from .files import File  # (Tên file chứa model 'File')


class UserStatus(enum.Enum):
    active = "active"
    deactivated = "deactivated"

class User(Base):
    __tablename__ = "USERS"

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role_id = Column(Integer, ForeignKey("ROLES.role_id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False)
    status = Column(SQLAEnum(UserStatus, native_enum=False), default=UserStatus.active, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # --- Relationships Sẵn Có ---
    role = relationship("Role", back_populates="users")
    lecturer = relationship("Lecturer", back_populates="user", uselist=False)
    created_classes = relationship("Class", back_populates="creator", foreign_keys="[Class.created_by]")
    submitted_tickets = relationship("Ticket", back_populates="submitter", foreign_keys="[Ticket.submitted_by]")
    assigned_tickets = relationship("Ticket", back_populates="assignee", foreign_keys="[Ticket.assigned_to]")
    reports = relationship("Report", back_populates="manager")
    notifications = relationship("Notification", back_populates="user")
    student = relationship("Student", back_populates="user", uselist=False)
    uploaded_files = relationship("File", back_populates="uploader")