from typing import List, Optional
from pydantic import BaseModel
from datetime import date # <<< Thêm date

# === CÁC SCHEMA MỚI CHO QUY TRÌNH JSON ===

class OverallAttendanceSchema(BaseModel):
    present: int
    absent: int
    late: int

class OverallPerformanceSchema(BaseModel):
    average_grade_all_students: float

# Model cho phản hồi chính (Main response)
class StudentBodyPerformanceSchema(BaseModel):
    total_active_students: int
    overall_attendance: OverallAttendanceSchema
    overall_performance: OverallPerformanceSchema

class StudentDataInput(BaseModel):
    """Định nghĩa 1 sinh viên trong danh sách JSON."""
    name: str
    email: str 
    password: Optional[str] = None

class AccountRequestSchema(BaseModel):
    """Request body chính mà CS gửi lên."""
    cs_user_id: int # ID của nhân viên CS
    title: str
    description_text: str
    student_data: List[StudentDataInput]


# === CÁC SCHEMA HIỆN TẠI VẪN SỬ DỤNG ===

class AttendanceRecord(BaseModel):
    class_id: int
    date: str
    status: str

class PerformanceRecord(BaseModel):
    class_id: int
    grade: float
    grade_type: str
    remarks: Optional[str] = None

class PerformanceSummary(BaseModel):
    average: Optional[float]
    records: List[PerformanceRecord]

class FeedbackItem(BaseModel):
    ticket_id: int
    title: str
    description: str
    issue_type: str
    status: str
    created_at: str

class FeedbackList(BaseModel):
    feedbacks: List[FeedbackItem]

class ClassDetail(BaseModel):
    """Schema lồng nhau, chỉ chứa thông tin cơ bản của lớp học."""
    class_id: int
    class_name: str
    
    class Config:
        orm_mode = True # or from_attributes = True

class StudentInfo(BaseModel):
    student_id: int
    user_id: int
    name: str
    email: str
    student_status: Optional[str] = None
    user_status: Optional[str] = None
    class_count: int
    enrollment_date: Optional[date] = None
    
    classes: List[ClassDetail] # <<< THÊM VÀO: Danh sách lớp học chi tiết

    class Config:
        orm_mode = True # or from_attributes = True

# <<< SCHEMA MỚI 2: CHO HÀM GET_ALL_STUDENT_FEEDBACK (GIỮ NGUYÊN)
class AllFeedbackItem(BaseModel):
    ticket_id: int
    title: str
    description: str
    issue_type: str
    status: str
    created_at: Optional[str] = None
    submitted_by_user_id: int
    student_name: str
    student_email: str

    class Config:
        orm_mode = True # or from_attributes = True