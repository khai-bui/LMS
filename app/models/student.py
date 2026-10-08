from sqlalchemy import Column, Integer, Date, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base
import enum

class StudentStatus(enum.Enum):
    active = "active"
    inactive = "inactive"

class Student(Base):
    __tablename__ = "STUDENTS"

    student_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    enrollment_date = Column(Date, nullable=False)
    status = Column(Enum(StudentStatus), default=StudentStatus.active, nullable=False)

    # Relationship tới User
    user = relationship("User", back_populates="student")

    # Quan hệ khác
    assignments = relationship("ClassAssignment", back_populates="student")
    submissions = relationship("Submission", back_populates="student")
