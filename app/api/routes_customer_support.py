from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from typing import List

# Import các schema từ file schema của bạn
from app.schemas.customer_support_schema import (
    AccountRequestSchema,
    AttendanceRecord,
    PerformanceSummary,
    FeedbackList,
    FeedbackItem,
    StudentInfo,
    AllFeedbackItem,
    StudentBodyPerformanceSchema
)
from app.services import customer_support_service

router = APIRouter(tags=["Customer Support"])

@router.get("/performance/overview", response_model=StudentBodyPerformanceSchema)
def route_get_student_body_performance_overview(db: Session = Depends(get_db)):
    """
    Endpoint để lấy một báo cáo TỔNG HỢP hiệu suất
    của TOÀN BỘ học viên (active).
    """
    performance_data = customer_support_service.get_student_body_performance_overview(db)
    return performance_data

# <<< ROUTE MỚI 1
@router.get("/students/list", response_model=List[StudentInfo])
def get_all_students(db: Session = Depends(get_db)):
    """[CS] Lấy danh sách toàn bộ sinh viên trong hệ thống."""
    return customer_support_service.get_student_list(db)


# <<< ROUTE MỚI 2
@router.get("/feedback/all", response_model=List[AllFeedbackItem])
def get_all_feedback(db: Session = Depends(get_db)):
    """[CS] Lấy danh sách TẤT CẢ feedback từ mọi học viên."""
    return customer_support_service.get_all_student_feedback(db)


@router.post("/request-account", status_code=status.HTTP_201_CREATED)
def create_account_request(
    req: AccountRequestSchema,
    db: Session = Depends(get_db)
):
    """[CS] Tạo ticket 'Account Request' chứa JSON data cho Manager duyệt."""
    
    # Chuyển đổi Pydantic model 'student_data' thành list[dict]
    student_data_dicts = [student.dict() for student in req.student_data]

    created_ticket = customer_support_service.create_account_request_ticket(
        db=db,
        cs_user_id=req.cs_user_id, # Lấy ID từ request body
        title=req.title,
        description_text=req.description_text,
        student_data=student_data_dicts
    )
    return {"message": "Đã tạo ticket yêu cầu thành công", "ticket_info": created_ticket}


@router.get("/attendance", response_model=list[AttendanceRecord])
def attendance(student_id: int, db: Session = Depends(get_db)):
    records = customer_support_service.get_attendance_records(db, student_id)
    return records


@router.get("/performance", response_model=PerformanceSummary)
def performance(student_id: int, db: Session = Depends(get_db)):
    summary = customer_support_service.get_performance_summary(db, student_id)
    return summary


@router.get("/feedback", response_model=list[FeedbackItem])
def feedback(student_id: int, db: Session = Depends(get_db)):
    items = customer_support_service.get_feedback_for_student(db, student_id)
    return items