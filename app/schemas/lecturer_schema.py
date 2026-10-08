from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, date # <<< Thêm date nếu cần

# === SCHEMAS CHO LỊCH DẠY CỦA GIẢNG VIÊN ===

class StudentInfo(BaseModel):
    """Thông tin cơ bản của sinh viên trong lớp."""
    student_id: int
    name: str

    class Config:
        from_attributes = True

class LeaveRequestCreate(BaseModel):
    user_id: int  # <<< THÊM DÒNG NÀY
    class_id: int
    leave_date: datetime
    reason: str

class LecturerClassInfo(BaseModel):
    """Thông tin chi tiết lớp học dành cho Giảng viên (lịch dạy)."""
    class_id: int
    class_name: str
    schedule: str
    place: Optional[str] = None # Địa điểm, có thể rỗng
    student_list: List[StudentInfo] # Danh sách sinh viên trong lớp

    class Config:
        from_attributes = True

# === SCHEMA CHO LỚP CHƯA CÓ GIẢNG VIÊN ===

class UnassignedClassInfo(BaseModel):
    """Thông tin cơ bản của lớp chưa được phân công."""
    class_id: int
    class_name: str
    schedule: str
    place: Optional[str] = None
    # Không cần status vì hàm service chỉ lấy lớp 'pending'

    class Config:
        from_attributes = True

# === SCHEMA CHO GIỜ LÀM VIỆC ===

class WorkingHourInfo(BaseModel):
    """Tổng số giờ làm việc đã tính."""
    total_hours: int

    class Config:
        from_attributes = True

# === SCHEMAS CHO REQUEST BODY ===

class TakeAttendanceRequest(BaseModel):
    """Dữ liệu gửi lên khi điểm danh."""
    class_id: int
    student_id: int
    status: str # Ví dụ: 'present', 'absent', 'late'

class EnterGradeRequest(BaseModel):
    """Dữ liệu gửi lên khi nhập điểm."""
    class_id: int
    student_id: int
    grade_value: float
    grade_type: str # Ví dụ: 'process', 'project'
    remarks: Optional[str] = None

# === Schema con ===

class AttendanceInfo(BaseModel):
    date: date
    status: str

class GradeInfo(BaseModel):
    grade_type: str
    grade: float
    remarks: Optional[str] = None

# === Schema chính ===

class StudentInfo(BaseModel):
    student_id: int
    user_id: int
    name: str
    attendance: Optional[List[AttendanceInfo]] = None
    grades: Optional[List[GradeInfo]] = None

class ClassStudentsResponse(BaseModel):
    class_id: int
    class_name: str
    students: List[StudentInfo]