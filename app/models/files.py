import enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Float, Text, Enum
from sqlalchemy.orm import relationship
from app.db.database import Base

# Giả sử bạn import 'Base' từ file database.py của mình
# from .database import Base
# (Nếu test riêng, dùng: from sqlalchemy.orm import declarative_base; Base = declarative_base())

# ----------------------------------------------------
# BẢNG 1: FILES (Bảng trung tâm lưu mọi file)
# ----------------------------------------------------
class File(Base):
    __tablename__ = "FILES"

    # Cột chính
    file_id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String(255), nullable=False)
    saved_filename = Column(String(255), nullable=False, unique=True, index=True)
    file_size = Column(Integer, nullable=False) # Kích thước file (bytes)
    content_type = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Khóa ngoại: Liên kết với bảng USERS hiện có của bạn
    uploader_user_id = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)

    # --- Mối quan hệ (Relationships) ---
    
    # Cho phép truy cập: file.uploader
    # (Giả sử bạn có model 'User' định nghĩa: 
    #  uploaded_files = relationship("File", back_populates="uploader")
    # )
    uploader = relationship("User", back_populates="uploaded_files")


# ----------------------------------------------------
# BẢNG 2: TASKS (Nhiệm vụ & Tài liệu)
# ----------------------------------------------------

# Định nghĩa ENUM cho Python
class TaskTypeEnum(enum.Enum):
    material = "material"
    assignment = "assignment"

class Task(Base):
    __tablename__ = "TASKS"

    # Cột chính
    task_id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Dùng Enum để lưu 'material' hoặc 'assignment'
    task_type = Column(Enum(TaskTypeEnum), nullable=False)
    
    due_date = Column(DateTime(timezone=True), nullable=True) # Chỉ dùng cho 'assignment'

    # --- Khóa ngoại ---
    # Liên kết với bảng CLASSES hiện có của bạn
    class_id = Column(Integer, ForeignKey("CLASSES.class_id"), nullable=False)
    
    # Liên kết với bảng FILES (file đính kèm: slide.pdf, de_bai.pdf)
    attached_file_id = Column(Integer, ForeignKey("FILES.file_id"), nullable=True)

    # --- Mối quan hệ (Relationships) ---
    
    # Cho phép truy cập: task.class_obj
    # (Giả sử bạn có model 'Class' định nghĩa:
    #  tasks = relationship("Task", back_populates="class_obj")
    # )
    class_obj = relationship("Class", back_populates="tasks")

    # Cho phép truy cập: task.attached_file (lấy thông tin file đính kèm)
    attached_file = relationship("File", foreign_keys=[attached_file_id])

    # Cho phép truy cập: task.submissions (lấy danh sách bài nộp)
    submissions = relationship("Submission", back_populates="task")


# ----------------------------------------------------
# BẢNG 3: SUBMISSIONS (Bài nộp của học sinh)
# ----------------------------------------------------
class Submission(Base):
    __tablename__ = "SUBMISSIONS"

    # Cột chính
    submission_id = Column(Integer, primary_key=True, index=True)
    submission_date = Column(DateTime(timezone=True), server_default=func.now())
    
    # Thông tin chấm điểm
    grade = Column(Float, nullable=True)
    feedback_text = Column(Text, nullable=True)

    # --- Khóa ngoại ---
    # Liên kết với bảng TASKS (bài nộp này cho bài tập nào?)
    task_id = Column(Integer, ForeignKey("TASKS.task_id"), nullable=False)
    
    # Liên kết với bảng STUDENTS hiện có của bạn (ai đã nộp?)
    student_id = Column(Integer, ForeignKey("STUDENTS.student_id"), nullable=False)
    
    # Liên kết với bảng FILES (file bài làm của HS)
    submitted_file_id = Column(Integer, ForeignKey("FILES.file_id"), nullable=False)
    
    # Liên kết với bảng FILES (file GV chấm và trả lại)
    graded_file_id = Column(Integer, ForeignKey("FILES.file_id"), nullable=True, unique=True)

    # --- Mối quan hệ (Relationships) ---

    # Cho phép truy cập: submission.task
    task = relationship("Task", back_populates="submissions")

    # Cho phép truy cập: submission.student
    # (Giả sử bạn có model 'Student' định nghĩa:
    #  submissions = relationship("Submission", back_populates="student")
    # )
    student = relationship("Student", back_populates="submissions")

    # Cho phép truy cập: submission.submitted_file (lấy file HS nộp)
    submitted_file = relationship("File", foreign_keys=[submitted_file_id])
                                          
    # Cho phép truy cập: submission.graded_file (lấy file GV trả)
    graded_file = relationship("File", foreign_keys=[graded_file_id])