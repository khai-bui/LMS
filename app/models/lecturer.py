from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

class Lecturer(Base):
    __tablename__ = "LECTURERS"

    lecturer_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("USERS.user_id", onupdate="CASCADE", ondelete="CASCADE"), unique=True, nullable=False)
    department = Column(String(100))

    user = relationship("User", back_populates="lecturer")
    classes = relationship("Class", back_populates="lecturer")
    attendances = relationship("LecturersAttendance", back_populates="lecturer")
