from typing import List, Optional
from pydantic import BaseModel, field_serializer
from datetime import datetime, date # <<< Added date

# --- Existing Schemas ---

class TeachingAttendanceSchema(BaseModel):
    present_days: int
    absent_days: int
    late_days: int

class ClassOverviewSchema(BaseModel):
    active_classes: int
    archived_classes: int

class StudentPerformanceSchema(BaseModel):
    average_grade_all_classes: float

# Model cho phản hồi chính (Main response)
class FacultyPerformanceSchema(BaseModel):
    total_lecturers: int
    teaching_attendance: TeachingAttendanceSchema
    class_overview: ClassOverviewSchema
    student_performance: StudentPerformanceSchema

class ClassInfoSingle(BaseModel):
    class_id: int
    lecturer_id: int
    class_name: str
    schedule: str
    lecturer_name: str
    status: str
    place: str

    class Config:
        from_attributes = True

class ClassInfo(BaseModel):
    class_id: int
    class_name: str
    schedule: str
    lecturer_name: str
    status: str
    place: str

    class Config:
        from_attributes = True

class ClassCreate(BaseModel):
    # user_id should likely come from auth, not the request body
    # user_id: int
    class_name: str
    schedule: datetime
    status: str = 'pending' # Default status
    lecturer_id: Optional[int] = None
    place: Optional[str] = None

class WorkingHourInfo(BaseModel):
    total_hours: int

    class Config:
        from_attributes = True

# --- New Schemas Required by the Updated Router ---

class ClassUpdate(BaseModel):
    """Schema for updating class info (all fields optional)."""
    class_name: Optional[str] = None
    schedule: Optional[datetime] = None
    status: Optional[str] = None
    lecturer_id: Optional[int] = None # Allow None to unassign
    place: Optional[str] = None

class NotificationCreate(BaseModel):
    """Schema for creating a notification."""
    title: str
    message: str

class TicketInfo(BaseModel):
    """Schema for returning ticket details."""
    ticket_id: int
    submitted_by: int
    assigned_to: Optional[int] = None
    issue_type: str
    title: str
    description: Optional[str] = None
    status: str # Assuming status is stored as a string or Enum value
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TicketStatusUpdate(BaseModel):
    """Schema for updating ticket status."""
    status: str # e.g., 'open', 'in_progress', 'resolved'

class TeachingAttendanceOverview(BaseModel):
    """Nested schema for teacher performance."""
    present_days: int
    absent_days: int
    late_days: int

class ClassOverview(BaseModel):
    """Nested schema for teacher performance."""
    active_classes: int
    archived_classes: int

class StudentPerformanceOverview(BaseModel):
    """Nested schema for teacher performance."""
    average_grade_all_classes: float

class TeacherPerformance(BaseModel):
    """Schema for the teacher performance report."""
    lecturer_id: int
    lecturer_name: str
    teaching_attendance: TeachingAttendanceOverview
    class_overview: ClassOverview
    student_performance: StudentPerformanceOverview

    class Config:
        from_attributes = True

class UnassignedClassInfo(BaseModel):
    """Schema for listing unassigned classes."""
    class_id: int
    class_name: str
    schedule: str
    place: Optional[str] = None
    status: str

    class Config:
        from_attributes = True

class AssignTeacherRequest(BaseModel):
    """Schema for assigning a teacher to a class."""
    lecturer_user_id: int # User ID of the lecturer
    class_id: int

class ClassAssignmentRequestInfo(BaseModel):
    """Schema for listing class assignment requests (tickets)."""
    ticket_id: int
    submitted_by_user_id: int
    submitted_by_name: str
    title: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class LecturerAttendanceRequest(BaseModel):
    lecturer_id: int
    class_id: int
    attendance_status: str
    attendance_date: date # <-- Cần có dòng này
    notes: Optional[str] = None

class LecturerInfo(BaseModel):
    """Schema for returning lecturer details."""
    lecturer_id: int
    user_id: int
    name: str
    email: str
    user_status: Optional[str] = None
    # Add other fields here if you included them in the service function

    class Config:
        from_attributes = True # Use from_attributes instead of orm_mode

class StudentBasicInfo(BaseModel):
    """Schema cơ bản trả về thông tin học viên."""
    student_id: int
    name: str
    email: str # Sử dụng EmailStr để validate email tốt hơn
    status: str     # Ví dụ: 'active', 'inactive'

    class Config:
        from_attributes = True # Cho phép tạo schema từ đối tượng ORM


class AddStudentRequest(BaseModel):
    student_id: int