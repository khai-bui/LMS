from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime,Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base
from app.models.files import Task  # Đảm bảo import đúng model Task
import enum

class ClassStatus(enum.Enum):
    active = "active"
    archived = "archived"
    pending= "pending"

class Class(Base):
    __tablename__ = "CLASSES"

    class_id = Column(Integer, primary_key=True, autoincrement=True)
    class_name = Column(String(100), nullable=False)
    lecturer_id = Column(Integer, ForeignKey("LECTURERS.lecturer_id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=True)
    schedule = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("USERS.user_id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False)
    status = Column(Enum(ClassStatus), default=ClassStatus.active, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    place = Column(String(255), nullable=False)
    # class_ = relationship("Class")    
    lecturer = relationship("Lecturer", back_populates="classes")
    creator = relationship("User", back_populates="created_classes")
    assignments = relationship("ClassAssignment", back_populates="class_")
    lecturer_attendances = relationship("LecturersAttendance", back_populates="class_")
    tasks = relationship("Task", back_populates="class_obj")
