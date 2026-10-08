from fastapi import APIRouter, Depends, Query  # <<< THÊM VÀO
from sqlalchemy.orm import Session      # <<< THÊM VÀO
from app.db.database import get_db      # <<< THÊM VÀO
from app.schemas.student_schema import ClassInfo, GradeInfo, AttendanceInfo
from app.services.student_service import ( # (Tổ chức lại import cho dễ đọc)
    get_view_schedule_of_student,
    get_classes_grades_of_student,
    get_classes_attendance_of_student,
    get_total_classes_of_student,
    get_average_grade_of_student,
    get_total_absences_of_student
)

router = APIRouter()

@router.get("/dashboard")
def get_student_dashboard_query(user_id: int = Query(...), db: Session = Depends(get_db)):
    return get_student_dashboard(user_id, db)


@router.get("/dashboard/{user_id}")
# <<< THÊM (db: Session = Depends(get_db))
def get_student_dashboard(user_id: int, db: Session = Depends(get_db)):
    # <<< THÊM `db` vào tất cả các lệnh gọi
    total_class = get_total_classes_of_student(db, user_id)
    avg_grade = get_average_grade_of_student(db, user_id)
    total_absent = get_total_absences_of_student(db, user_id)
    classes = get_view_schedule_of_student(db, user_id)

    return {
        "overview":{
            "total_class": total_class,
            "avg_grade": avg_grade,
            "total_absent": total_absent
        },
        "schedule": classes
    }


@router.get("/class", response_model=list[ClassInfo])
# <<< THÊM (db: Session = Depends(get_db))
def get_classes_for_student(user_id: int, db: Session = Depends(get_db)):
    # <<< THÊM `db`
    classes = get_view_schedule_of_student(db, user_id)
    return classes

@router.get("/class/grade", response_model= list[GradeInfo])
# <<< THÊM (db: Session = Depends(get_db))
def get_classGrade_for_student(class_id: int, user_id: int, db: Session = Depends(get_db)):
    # <<< THÊM `db`
    grade = get_classes_grades_of_student(db, class_id, user_id)
    return grade

@router.get("/class/attendance", response_model= list[AttendanceInfo])
# <<< THÊM (db: Session = Depends(get_db))
def get_classAttendance_for_student(class_id: int, user_id: int, db: Session = Depends(get_db)):
    # <<< THÊM `db`
    attendance = get_classes_attendance_of_student(db, class_id, user_id)
    return attendance