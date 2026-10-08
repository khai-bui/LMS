from fastapi import HTTPException
from sqlalchemy.orm import Session  # <<< THÊM VÀO
from app.models.class_ import Class, ClassStatus
from app.models.grade import Grade
from app.models.attendance import Attendance, AttendanceStatus
from app.models.student import Student
from app.models.lecturer import Lecturer
from app.models.user import User
from app.models.class_assignment import ClassAssignment
# from app.db.database import SessionLocal # <<< XÓA ĐI

# == Thời khoá biểu
# <<< THÊM (db: Session)
def get_view_schedule_of_student(db: Session, user_id: int):
    
    # Bước 1: Kiểm tra sinh viên có tồn tại không
    # (Giữ nguyên logic của bạn, đây là 1 query)
    student = db.query(Student).filter(Student.user_id == user_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Bước 2: Lấy tất cả lịch học chỉ bằng MỘT query
    # Chúng ta sẽ JOIN từ bảng Class sang các bảng liên quan
    schedules_query = db.query(
        Class.class_id,
        Class.class_name,
        User.name.label("lecturer_name"), # Lấy tên user và đặt nhãn là "lecturer_name"
        Class.place,
        Class.schedule
    ).join(Lecturer, Class.lecturer_id == Lecturer.lecturer_id) \
     .join(User, Lecturer.user_id == User.user_id) \
     .join(ClassAssignment, Class.class_id == ClassAssignment.class_id) \
     .filter(ClassAssignment.student_id == student.student_id, Class.status == ClassStatus.active) # Lọc theo student_id

    # Thực thi query
    results = schedules_query.all()

    # Bước 3: Chuyển đổi kết quả (list of Row) thành list of dict
    # Cách làm này hiệu quả hơn là lặp và query trong vòng lặp
    schedule_list = [
        {
            "class_id": r.class_id,
            "class_name": r.class_name,
            "lecturer_name": r.lecturer_name,
            "place": r.place,
            "schedule": r.schedule
        } for r in results
    ]

    return schedule_list

# == Điểm số theo lớp
# <<< THÊM (db: Session)
def get_classes_grades_of_student(db: Session, class_id: int, user_id: int):
    # try: # <<< XÓA
    #     db = SessionLocal() # <<< XÓA

    student = db.query(Student).filter(Student.user_id == user_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    class_assignments = db.query(ClassAssignment).filter(
        ClassAssignment.class_id == class_id,
        ClassAssignment.student_id == student.student_id
    ).all()

    if not class_assignments:
        raise HTTPException(status_code=404, detail="Class Assignment not found")

    list_grades = []

    for class_assignment in class_assignments: # Sửa lỗi chính tả
        grades = db.query(Grade).filter(Grade.assignment_id == class_assignment.assignment_id).all()

        if not grades:
            # Không nên raise lỗi ở đây, có thể lớp chưa có điểm
            continue 
        
        for grade in grades:
            list_grades.append({
                "grade_type": grade.grade_type,
                "grade": grade.grade,
                "remarks": grade.remarks
            })

    return list_grades
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA

# == Điểm danh theo lớp
# <<< THÊM (db: Session)
def get_classes_attendance_of_student(db: Session, class_id: int, user_id: int):
    # try: # <<< XÓA
    #     db = SessionLocal() # <<< XÓA

    # 1️⃣ Tìm student dựa theo user_id
    student = db.query(Student).filter(Student.user_id == user_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # 2️⃣ Lấy các assignment của học viên trong lớp này
    class_assignments = db.query(ClassAssignment).filter(
        ClassAssignment.class_id == class_id,
        ClassAssignment.student_id == student.student_id
    ).all()

    if not class_assignments:
        raise HTTPException(status_code=404, detail="Class assignments not found")

    # 3️⃣ Duyệt qua từng assignment → lấy các bản ghi điểm danh
    attendance_list = []

    for class_assignment in class_assignments:
        attendances = db.query(Attendance).filter(
            Attendance.assignment_id == class_assignment.assignment_id
        ).all()

        if not attendances:
            continue  # không raise 404, chỉ bỏ qua nếu không có

        for att in attendances:
            attendance_list.append({
                "date": att.date.isoformat() if att.date else None,
                "status": att.status
            })

    # 4️⃣ Trả về danh sách điểm danh
    return attendance_list

    # finally: # <<< XÓA
    #     db.close() # <<< XÓA

# == Tổng số lớp đang học
# <<< THÊM (db: Session)
def get_total_classes_of_student(db: Session, user_id: int):
    # try: # <<< XÓA
    #     db = SessionLocal() # <<< XÓA

    student = db.query(Student).filter(Student.user_id == user_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    classes = db.query(Class).join(ClassAssignment).filter(
        ClassAssignment.student_id == student.student_id,
        Class.status == ClassStatus.active
    ).all()

    total_classes = len(classes)

    return total_classes
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA

# == Điểm trung bình tất cả các lớp (chỉ lớp active)
# <<< THÊM (db: Session)
def get_average_grade_of_student(db: Session, user_id: int):
    # try: # <<< XÓA
    #     db = SessionLocal() # <<< XÓA

    student = db.query(Student).filter(Student.user_id == user_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # <<< SỬA: Lấy các ID của các assignment thuộc lớp "active"
    active_assignment_ids = db.query(ClassAssignment.assignment_id).join(Class).filter(
        ClassAssignment.student_id == student.student_id,
        Class.status == ClassStatus.active
    ).subquery() # <<< Tạo subquery để lọc hiệu quả hơn

    # <<< SỬA: Query tất cả điểm thuộc các assignment "active" đó
    grades_query = db.query(Grade).filter(
        Grade.assignment_id.in_(active_assignment_ids)
    )

    total_grade = 0
    grade_count = 0

    # <<< SỬA: Lặp qua kết quả query đã lọc
    for grade in grades_query.all():
        if isinstance(grade.grade, (int, float)):
            total_grade += grade.grade
            grade_count += 1

    if grade_count == 0:
        return 0.0

    average_grade = total_grade / grade_count

    return average_grade
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA

# == Tổng số buổi vắng (chỉ lớp active)
# <<< THÊM (db: Session)
def get_total_absences_of_student(db: Session, user_id: int):
    # try: # <<< XÓA
    #     db = SessionLocal() # <<< XÓA

    student = db.query(Student).filter(Student.user_id == user_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # <<< SỬA: Lấy các ID của các assignment thuộc lớp "active"
    active_assignment_ids = db.query(ClassAssignment.assignment_id).join(Class).filter(
        ClassAssignment.student_id == student.student_id,
        Class.status == ClassStatus.active
    ).subquery()

    # <<< SỬA: Đếm số buổi vắng thuộc các assignment "active" đó trong 1 query
    total_absences = db.query(Attendance).filter(
        Attendance.assignment_id.in_(active_assignment_ids),
        Attendance.status == AttendanceStatus.absent
    ).count()

    return total_absences
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA