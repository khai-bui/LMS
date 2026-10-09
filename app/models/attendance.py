from sqlalchemy import Column, Integer, Date, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base
import enum

class AttendanceStatus(enum.Enum):
    present = "present"
    absent = "absent"
    late = "late"

class Attendance(Base):
    __tablename__ = "attendances"

    attendance_id = Column(Integer, primary_key=True, autoincrement=True)
    assignment_id = Column(Integer, ForeignKey("class_assignments.assignment_id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(Enum(AttendanceStatus), nullable=False)

    assignment = relationship("ClassAssignment", back_populates="attendance")
