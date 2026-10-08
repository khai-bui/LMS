from sqlalchemy import Column, Integer, Float, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.db.database import Base
import enum

class GradeType(enum.Enum):
    process = "process"
    project = "project"

class Grade(Base):
    __tablename__ = "GRADES"

    grade_id = Column(Integer, primary_key=True, autoincrement=True)
    assignment_id = Column(Integer, ForeignKey("CLASS_ASSIGNMENTS.assignment_id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False)
    grade = Column(Float, nullable=False)
    grade_type = Column(Enum(GradeType), nullable=False)
    remarks = Column(Text)

    assignment = relationship("ClassAssignment", back_populates="grade")
