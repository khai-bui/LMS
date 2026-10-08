from fastapi import HTTPException, status as fastapi_status
from sqlalchemy.orm import Session # <<< THÊM VÀO
from datetime import date, datetime # <<< THÊM VÀO datetime
from sqlalchemy import func
from typing import List, Dict # <<< THÊM VÀO

# Import models
from app.models.class_ import Class, ClassStatus
from app.models.grade import Grade
from app.models.attendance import Attendance, AttendanceStatus
from app.models.lecturer import Lecturer
from app.models.role import Role
from app.models.student import Student
from app.models.ticket import Ticket, TicketStatus # <<< THÊM VÀO TicketStatus
from app.models.user import User
from app.models.class_assignment import ClassAssignment
from app.models.lecturers_attendance import LecturersAttendance, LecturerAttendanceStatus # <<< THÊM VÀO LecturerAttendanceStatus

# from app.db.database import SessionLocal # <<< XÓA ĐI

# == Thời khoá biểu
# <<< THÊM (db: Session)
def get_view_schedule_of_lecturer(db: Session, user_id: int):
    # db = SessionLocal() # <<< XÓA
    """Lấy lịch dạy của giảng viên."""
    try:
        lecturer = db.query(Lecturer).filter(Lecturer.user_id == user_id).first()
        if not lecturer:
            raise HTTPException(status_code=404, detail="Lecturer not found for the given user ID")
        
        # Tối ưu: Dùng joinedload để tải trước students nếu cần
        classes_taught = db.query(Class).filter(Class.lecturer_id == lecturer.lecturer_id).all()

        schedule_list = []
        print(f"DEBUG: Found {len(classes_taught)} classes for lecturer_id {lecturer.lecturer_id}") # <-- Thêm dòng này
        for cls in classes_taught:
            print(f"DEBUG: Checking class_id={cls.class_id}, status='{cls.status}'") # <-- Thêm dòng này
            # Giả định status là string 'active'
            if cls.status == ClassStatus.active:
                print(f"DEBUG: Class {cls.class_id} IS active. Querying students...")
                # Query danh sách sinh viên
                students_in_class = db.query(User.name, Student.student_id) \
                                      .join(Student, User.user_id == Student.user_id) \
                                      .join(ClassAssignment, Student.student_id == ClassAssignment.student_id) \
                                      .filter(ClassAssignment.class_id == cls.class_id) \
                                      .all()
                
                student_list_formatted = [
                    {"student_id": s.student_id, "name": s.name}
                    for s in students_in_class
                ]

                schedule_list.append({
                    "class_id": cls.class_id,
                    "class_name": cls.class_name,
                    "schedule": cls.schedule,
                    "place": cls.place,
                    "student_list": student_list_formatted
                })

        print(f"DEBUG: Final schedule_list length: {len(schedule_list)}") # <-- Thêm dòng này
        
        return schedule_list
    
    finally:
        pass # db.close() # <<< XÓA

# == Lớp chưa có giảng viên
# <<< THÊM (db: Session)
def get_view_no_lecturer_schedule(db: Session):
    # db = SessionLocal() # <<< XÓA
    # Giả định status là string 'pending'
    classes_taught = db.query(Class).filter(Class.status == 'pending', Class.lecturer_id == None).all() 

    schedule_list = [
        {
            "class_id": cls.class_id,
            "class_name": cls.class_name,
            "schedule": cls.schedule,
            "place": cls.place
            # Có thể thêm 'place' nếu cần
        }
        for cls in classes_taught
    ]
    # db.close() # <<< XÓA
    return schedule_list

# <<< THÊM (db: Session)
def get_workinghour(db: Session, user_id: int):
    # db = SessionLocal() # <<< XÓA
    try:
        lecturer = db.query(Lecturer).filter(Lecturer.user_id == user_id).first()
        if not lecturer:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Lecturer not found for the given user ID")
        
        # Giả định status là Enum có .value
        attended_sessions_count = db.query(func.count(LecturersAttendance.lecturer_attendance_id)).filter(
            LecturersAttendance.lecturer_id == lecturer.lecturer_id,
            LecturersAttendance.status.in_([LecturerAttendanceStatus.present, LecturerAttendanceStatus.late]) 
        ).scalar() 

        calculated_hours = attended_sessions_count * 2
        
        return {"total_hours": calculated_hours}
    finally:
        pass # db.close() # <<< XÓA


# <<< THÊM (db: Session)
def register_for_class(db: Session, user_id: int, class_id: int):
    # db = SessionLocal() # <<< XÓA
    try:
        lecturer = db.query(Lecturer).filter(Lecturer.user_id == user_id).first()
        if not lecturer:
            raise HTTPException(status_code=404, detail="Lecturer not found.")

        class_to_request = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_request:
            raise HTTPException(status_code=404, detail="Class not found.")

        if class_to_request.lecturer_id is not None:
            raise HTTPException(status_code=409, detail="This class is already assigned.")
            
        # Giả định status là Enum có .value
        existing_ticket = db.query(Ticket).filter(
            Ticket.submitted_by == user_id,
            Ticket.title == f"Class Assignment Request for Class ID: {class_id}",
            Ticket.status.in_([TicketStatus.open, TicketStatus.in_progress]) # Kiểm tra cả 2 trạng thái mở
        ).first()

        if existing_ticket:
            raise HTTPException(status_code=409, detail="You have already submitted an open request for this class.")

        # Tự động tìm Manager để gán (nếu có)
        mgr_role = db.query(Role).filter(Role.role_name.ilike("%manager%")).first() # Cần import Role
        assigned_to_id = None
        if mgr_role:
             mgr_user = db.query(User).filter(User.role_id == mgr_role.role_id).first()
             if mgr_user:
                 assigned_to_id = mgr_user.user_id

        new_ticket = Ticket(
            submitted_by=user_id,
            assigned_to=assigned_to_id, # Gán cho Manager nếu tìm thấy
            issue_type='Class Request',
            title=f"Class Assignment Request for Class ID: {class_id}",
            description=(
                f"Lecturer with user_id {user_id} requested assignment "
                f"to class '{class_to_request.class_name}' (ID: {class_id})."
            ),
            status=TicketStatus.open # Dùng Enum
        )

        db.add(new_ticket)
        db.commit()
        db.refresh(new_ticket)
        return {"message": "Your request has been submitted successfully."}
    except Exception as e:
        db.rollback()
        raise e
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA


# <<< THÊM (db: Session)
def take_attendence(db: Session, user_id: int, class_id: int, student_id: int, status: str):
    # db = SessionLocal() # <<< XÓA
    try:
        lecturer = db.query(Lecturer).filter(Lecturer.user_id == user_id).first()
        if not lecturer:
            raise HTTPException(status_code=404, detail="Lecturer not found.")

        class_to_check = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_check:
            raise HTTPException(status_code=404, detail="Class not found.")

        if class_to_check.lecturer_id != lecturer.lecturer_id:
            raise HTTPException(status_code=403, detail="You are not the lecturer of this class.")

        assignment = db.query(ClassAssignment).filter(
            ClassAssignment.class_id == class_id,
            ClassAssignment.student_id == student_id
        ).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="Student is not enrolled in this class.")

        # Giả định AttendanceStatus là Enum có .value
        valid_statuses = [s.value for s in AttendanceStatus]
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid attendance status. Must be one of: {', '.join(valid_statuses)}")
        
        today = date.today()
        existing_record = db.query(Attendance).filter(
             Attendance.assignment_id == assignment.assignment_id,
             Attendance.date == today
        ).first()

        if existing_record:
             # Cập nhật thay vì báo lỗi
             existing_record.status = status
             db.commit()
             db.refresh(existing_record)
             return {"message": "Attendance updated successfully."}
        else:
             # Tạo mới nếu chưa có
            new_attendance = Attendance(
                assignment_id=assignment.assignment_id,
                date=today,
                status=status # Gán string trực tiếp (vì đã validate)
            )
            db.add(new_attendance)
            db.commit()
            db.refresh(new_attendance)
            return {"message": "Attendance taken successfully."}

    except Exception as e:
        db.rollback()
        raise e
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA
    
# <<< THÊM (db: Session)
def enter_grades(db: Session, user_id: int, class_id: int, student_id: int, grade_value: float, grade_type: str, remarks: str = None):
    # db = SessionLocal() # <<< XÓA
    try:
        lecturer = db.query(Lecturer).filter(Lecturer.user_id == user_id).first()
        if not lecturer:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Lecturer not found.")

        class_to_grade = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_grade:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Class not found.")

        if class_to_grade.lecturer_id != lecturer.lecturer_id:
            raise HTTPException(status_code=fastapi_status.HTTP_403_FORBIDDEN, detail="You are not the lecturer of this class.")

        assignment = db.query(ClassAssignment).filter(
            ClassAssignment.class_id == class_id,
            ClassAssignment.student_id == student_id
        ).first()
        if not assignment:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Student is not enrolled in this class.")

        if not (0 <= grade_value <= 10):
            raise HTTPException(status_code=fastapi_status.HTTP_400_BAD_REQUEST, detail="Grade value must be between 0 and 10.")
        
        # Giả định grade_type là string 'process', 'project'
        valid_grade_types = ['process', 'project'] 
        if grade_type not in valid_grade_types:
            raise HTTPException(status_code=fastapi_status.HTTP_400_BAD_REQUEST, detail="Invalid grade type. Must be 'process' or 'project'.")
        
        existing_grade = db.query(Grade).filter(
            Grade.assignment_id == assignment.assignment_id,
            Grade.grade_type == grade_type
        ).first()
        
        if existing_grade:
            existing_grade.grade = grade_value
            if remarks is not None:
                existing_grade.remarks = remarks
            message = "Grade updated successfully."
        else:
            new_grade = Grade(
                assignment_id=assignment.assignment_id,
                grade=grade_value,
                grade_type=grade_type,
                remarks=remarks
            )
            db.add(new_grade)
            message = "Grade entered successfully."
        
        db.commit()
        return {"message": message}
    except Exception as e:
        db.rollback()
        raise e
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA

def get_students_in_class(db: Session, class_id: int):
    """
    Lấy danh sách sinh viên của lớp cùng với điểm danh và điểm (nếu có).
    """
    try:
        # Kiểm tra lớp có tồn tại không
        class_obj = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_obj:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail="Class not found."
            )

        # Lấy danh sách sinh viên trong lớp
        students_in_class = (
            db.query(User.name, Student.student_id, User.user_id, ClassAssignment.assignment_id)
            .join(Student, User.user_id == Student.user_id)
            .join(ClassAssignment, Student.student_id == ClassAssignment.student_id)
            .filter(ClassAssignment.class_id == class_id)
            .all()
        )

        if not students_in_class:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail="No students found for this class."
            )

        student_list_formatted = []
        for s in students_in_class:
            # === Lấy dữ liệu điểm danh (Attendance) ===
            attendances = db.query(Attendance).filter(
                Attendance.assignment_id == s.assignment_id
            ).all()

            if attendances:
                attendance_data = [
                    {
                        "date": att.date,
                        "status": att.status
                    }
                    for att in attendances
                ]
            else:
                attendance_data = None  # Không có dữ liệu điểm danh

            # === Lấy dữ liệu điểm (Grade) ===
            grades = db.query(Grade).filter(
                Grade.assignment_id == s.assignment_id
            ).all()

            if grades:
                grade_data = [
                    {
                        "grade_type": g.grade_type,
                        "grade": g.grade,
                        "remarks": g.remarks
                    }
                    for g in grades
                ]
            else:
                grade_data = None  # Không có điểm nào

            # === Gộp dữ liệu lại ===
            student_list_formatted.append({
                "student_id": s.student_id,
                "user_id": s.user_id,
                "name": s.name,
                "attendance": attendance_data,
                "grades": grade_data
            })

        return {
            "class_id": class_id,
            "class_name": class_obj.class_name,
            "students": student_list_formatted
        }

    except Exception as e:
        db.rollback()
        raise e
