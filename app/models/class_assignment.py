from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base

class ClassAssignment(Base):
    __tablename__ = "CLASS_ASSIGNMENTS"

    assignment_id = Column(Integer, primary_key=True, autoincrement=True)
    class_id = Column(Integer, ForeignKey("CLASSES.class_id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("STUDENTS.student_id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False)

    __table_args__ = (UniqueConstraint("class_id", "student_id", name="uq_class_student"),)

    class_ = relationship("Class", back_populates="assignments")
    student = relationship("Student", back_populates="assignments")
    attendance = relationship("Attendance", back_populates="assignment")
    grade = relationship("Grade", back_populates="assignment")
