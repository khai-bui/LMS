from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List # <<< Thêm List
from app.models.files import TaskTypeEnum # Import Enum từ model

# --- Cấu hình chung ---
class ConfigBase(BaseModel):
    class Config:
        from_attributes = True # Dùng cho Pydantic v2+

# --- File Schemas ---
class FileResponse(ConfigBase):
    file_id: int
    original_filename: str
    saved_filename: str
    uploader_user_id: int
    content_type: Optional[str] = None # Đổi thành Optional[str]
    file_size: int

# --- Task Schemas ---
class TaskResponse(ConfigBase):
    task_id: int
    class_id: Optional[int] = None
    title: str
    description: Optional[str] = None # Đổi thành Optional[str]
    task_type: TaskTypeEnum
    due_date: Optional[datetime] = None
    
    attached_file: Optional[FileResponse] = None # Đổi thành Optional[FileResponse]

# --- Submission Schemas ---

class UserBasicInfo(ConfigBase): # Schema chỉ lấy 'name' từ User
    name: str

class StudentWithUserInfo(ConfigBase): # Schema cho Student, chứa User lồng nhau
    student_id: int
    user_id: int
    user: UserBasicInfo # Lồng schema User vào đây

class SubmissionResponse(ConfigBase):
    submission_id: int
    task_id: int
    submission_date: datetime
    grade: Optional[float] = None
    feedback_text: Optional[str] = None

    student: StudentWithUserInfo # <<< SỬ DỤNG SCHEMA LỒNG NHAU NÀY

    submitted_file: FileResponse
    graded_file: Optional[FileResponse] = None