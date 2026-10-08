from fastapi import APIRouter, Depends, Body # <<< THÊM VÀO
from sqlalchemy.orm import Session # <<< THÊM VÀO
from app.db.database import get_db # <<< THÊM VÀO
from typing import List, Optional # <<< THÊM VÀO
from typing import Dict

# --- Import Schemas ---
# (Giả định bạn có các schema này trong app/schemas/lecturer_schema.py)
from app.schemas.lecturer_schema import (
    ClassStudentsResponse,
    LecturerClassInfo, # Schema chi tiết cho lịch dạy (bao gồm ds sinh viên)
    UnassignedClassInfo, # Schema cho lớp chưa có GV
    WorkingHourInfo,
    TakeAttendanceRequest, # Schema cho request body điểm danh
    EnterGradeRequest,
    LeaveRequestCreate # Schema cho request body nhập điểm
)

# --- Import Services ---
# (Đổi tên service file cho nhất quán)
from app.services.lecturer_service import (
    get_students_in_class,
    get_view_schedule_of_lecturer,
    get_workinghour,
    get_view_no_lecturer_schedule,
    register_for_class,
    take_attendence,
    enter_grades
)

from app.services.lecture_service import request_leave_of_absence_lecturer

router = APIRouter(tags=["Lecturer"]) # <<< Đặt tag cho rõ ràng

@router.post("/leave-request/lecturer", response_model=Dict[str, str])
def route_create_lecturer_leave_request(
    request_body: LeaveRequestCreate, # <-- Nhận dữ liệu từ body (đã có user_id)
    # <<< BỎ DÒNG (current_user: User = Depends(get_current_user))
):
    """
    Endpoint cho Giảng viên (Lecturer) tạo một yêu cầu xin nghỉ phép.
    Lấy user_id thủ công từ request body.
    """
    
    # Gọi hàm service và truyền user_id từ request_body
    response_message = request_leave_of_absence_lecturer(
        user_id=request_body.user_id, # <<< SỬA Ở ĐÂY
        class_id=request_body.class_id,
        leave_date=request_body.leave_date,
        reason=request_body.reason,
    )
    
    return response_message

@router.get("/schedule", response_model=List[LecturerClassInfo]) # <<< Sửa route và response_model
# <<< THÊM (db: Session = Depends(get_db))
def get_lecturer_schedule( # <<< Đổi tên hàm
    user_id: int, # Nên lấy từ token
    db: Session = Depends(get_db)
):
    """Lấy lịch dạy chi tiết (bao gồm danh sách sinh viên) của giảng viên."""
    # <<< TRUYỀN `db`
    classes = get_view_schedule_of_lecturer(db, user_id)
    return classes

@router.get("/classes/unassigned", response_model=List[UnassignedClassInfo]) # <<< Sửa route và response_model
# <<< THÊM (db: Session = Depends(get_db))
def get_unassigned_classes_for_lecturer(db: Session = Depends(get_db)): # <<< Đổi tên hàm
    """Lấy danh sách các lớp chưa được phân công giảng viên."""
    # <<< TRUYỀN `db`
    classes = get_view_no_lecturer_schedule(db)
    return classes

@router.get("/working-hours", response_model=WorkingHourInfo) # <<< Sửa route và response_model
# <<< THÊM (db: Session = Depends(get_db))
def get_lecturer_working_hours( # <<< Đổi tên hàm
    user_id: int, # Nên lấy từ token
    db: Session = Depends(get_db)
):
    """Tính tổng số giờ dạy dựa trên điểm danh."""
    # <<< TRUYỀN `db`
    working_hours = get_workinghour(db, user_id)
    return working_hours

@router.get("/classes/students", response_model=ClassStudentsResponse)
def get_students_of_class(
    class_id: int,
    db: Session = Depends(get_db)
):
    """
    Lấy danh sách sinh viên trong một lớp (theo class_id).
    """
    result = get_students_in_class(db, class_id)
    return result


@router.post("/classes/{class_id}/register") # <<< Sửa route (dùng path param)
# <<< THÊM (db: Session = Depends(get_db))
def request_class_assignment( # <<< Đổi tên hàm
    class_id: int,
    db: Session = Depends(get_db),
    user_id: int = 1 # Tạm thời hardcode, nên lấy từ token
):
    """Giảng viên gửi yêu cầu được phân công vào lớp học."""
    # <<< TRUYỀN `db`
    result = register_for_class(db, user_id, class_id)
    return result

@router.post("/attendance/take") # <<< Sửa route
# <<< THÊM (db: Session = Depends(get_db))
# <<< Sử dụng Request Body Schema
def take_student_attendance( # <<< Đổi tên hàm
    req: TakeAttendanceRequest, # Dùng schema
    db: Session = Depends(get_db),
    user_id: int = 1 # Tạm thời hardcode, nên lấy từ token
):
    """Giảng viên điểm danh cho sinh viên."""
    # <<< TRUYỀN `db` và dữ liệu từ req
    result = take_attendence( # Sửa tên hàm service nếu cần (take_attendance)
        db,
        user_id, # ID giảng viên (từ token)
        req.class_id,
        req.student_id,
        req.status
    )
    return result

@router.post("/grades/enter") # <<< Sửa route
# <<< THÊM (db: Session = Depends(get_db))
# <<< Sử dụng Request Body Schema
def enter_student_grades( # <<< Đổi tên hàm
    req: EnterGradeRequest, # Dùng schema
    db: Session = Depends(get_db),
    user_id: int = 1 # Tạm thời hardcode, nên lấy từ token
):
    """Giảng viên nhập/cập nhật điểm cho sinh viên."""
    # <<< TRUYỀN `db` và dữ liệu từ req
    result = enter_grades(
        db,
        user_id, # ID giảng viên (từ token)
        req.class_id,
        req.student_id,
        req.grade_value,
        req.grade_type,
        req.remarks
    )
    return result