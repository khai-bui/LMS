from sqlalchemy import Column, Integer, String, Date, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.schema import UniqueConstraint
from app.db.database import Base
import enum

class LecturerAttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"
    late = "late"

class LecturersAttendance(Base):
    __tablename__ = "LECTURERS_ATTENDANCE"

    lecturer_attendance_id = Column(Integer, primary_key=True, autoincrement=True)
    
    # SỬA LỖI: Phải viết hoa "LECTURERS" và "CLASSES" để khớp với __tablename__
    lecturer_id = Column(Integer, ForeignKey("LECTURERS.lecturer_id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    class_id = Column(Integer, ForeignKey("CLASSES.class_id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    
    attendance_date = Column(Date, nullable=False)
    status = Column(Enum(LecturerAttendanceStatus, name='lecturer_attendance_status_enum'), nullable=False)
    notes = Column(String(255), nullable=True)

    # SỬA LỖI: Xóa các dòng 'relationship' bị trùng lặp
    lecturer = relationship("Lecturer", back_populates="attendances")
    class_ = relationship("Class", back_populates="lecturer_attendances")

    __table_args__ = (
        UniqueConstraint('lecturer_id', 'class_id', 'attendance_date', name='uq_lecturer_class_date'),
    )