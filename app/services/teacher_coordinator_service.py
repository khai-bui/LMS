# --- Đảm bảo có đủ các import này ở đầu file service ---
from fastapi import HTTPException, status as fastapi_status
from sqlalchemy.orm import Session, joinedload # <<< THÊM joinedload
from datetime import datetime, timedelta, timezone, date # <<< THÊM date
from typing import Optional, List, Dict
import re
import json

# Import models (Đảm bảo đường dẫn đúng)
from app.models.class_ import Class
from app.models.grade import Grade
from app.models.attendance import Attendance, AttendanceStatus
from app.models.lecturer import Lecturer
from app.models.student import Student
from app.models.ticket import Ticket, TicketStatus
from sqlalchemy import func
from app.models.lecturers_attendance import LecturersAttendance, LecturerAttendanceStatus
from app.models.class_assignment import ClassAssignment
from app.models.notification import Notification
from app.models.user import User
# --------------------------------------------------------

def get_class_by_id(db: Session, class_id: int):
    """Lấy thông tin một lớp học cụ thể theo ID, cùng tên giảng viên."""
    
    # Query tương tự, nhưng thêm filter theo class_id và dùng .first()
    result = db.query(
        Class,
        User.name
    ).outerjoin(
        Lecturer, Class.lecturer_id == Lecturer.lecturer_id
    ).outerjoin(
        User, Lecturer.user_id == User.user_id
    ).filter(Class.class_id == class_id).first() # <<< Lọc theo ID và lấy 1 kết quả

    # Xử lý nếu không tìm thấy lớp
    if not result:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND, 
            detail=f"Không tìm thấy lớp học với ID {class_id}"
        )

    # Giải nén kết quả
    cls, lecturer_name = result

    # Tạo dictionary trả về
    class_info = {
        "class_id": cls.class_id,
        "lecturer_id": cls.lecturer_id,
        "class_name": cls.class_name,
        "schedule": cls.schedule,
        "lecturer_name": lecturer_name if lecturer_name else "N/A", # Xử lý nếu chưa có GV
        "status": cls.status,
        "place": cls.place 
    }
    return class_info

def add_student_to_class(db: Session, student_id: int, class_id: int):
    """
    Thêm một học viên vào lớp học bằng cách tạo bản ghi trong class_assignments.
    Kiểm tra xem học viên, lớp học có tồn tại không và học viên đã ở trong lớp chưa.
    """
    try:
        # --- 1. KIỂM TRA HỌC VIÊN VÀ LỚP HỌC ---
        student = db.query(Student).filter(Student.student_id == student_id).first()
        if not student:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy học viên với ID {student_id}"
            )

        target_class = db.query(Class).filter(Class.class_id == class_id).first()
        if not target_class:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy lớp học với ID {class_id}"
            )

        # --- 2. KIỂM TRA XEM HỌC VIÊN ĐÃ Ở TRONG LỚP CHƯA ---
        existing_assignment = db.query(ClassAssignment).filter(
            ClassAssignment.class_id == class_id,
            ClassAssignment.student_id == student_id
        ).first()

        if existing_assignment:
            raise HTTPException(
                status_code=fastapi_status.HTTP_409_CONFLICT, # Lỗi Conflict
                detail=f"Học viên ID {student_id} đã được gán vào lớp ID {class_id}."
            )

        # --- 3. TẠO BẢN GHI PHÂN CÔNG MỚI ---
        new_assignment = ClassAssignment(
            class_id=class_id,
            student_id=student_id
        )

        db.add(new_assignment)
        db.commit()
        db.refresh(new_assignment)

        # --- 4. TRẢ VỀ THÔNG BÁO HOẶC OBJECT VỪA TẠO ---
        # Bạn có thể trả về object nếu cần dùng ID mới
        # return new_assignment 
        return {"message": f"Đã thêm thành công học viên ID {student_id} vào lớp ID {class_id}."}

    except HTTPException as http_exc:
        db.rollback() # Hoàn tác nếu có lỗi HTTP đã biết
        raise http_exc
    except Exception as e:
        db.rollback() # Hoàn tác nếu có lỗi bất ngờ
        print(f"ERROR in add_student_to_class: {e}")
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi không xác định khi thêm học viên vào lớp: {e}"
        )


def get_students_not_in_class(db: Session, class_id: int):
    """
    Lấy danh sách các học viên (student_id, name, email) 
    KHÔNG được gán vào lớp học có class_id chỉ định.
    """
    try:
        # --- 1. KIỂM TRA XEM LỚP HỌC CÓ TỒN TẠI KHÔNG ---
        target_class = db.query(Class).filter(Class.class_id == class_id).first()
        if not target_class:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy lớp học với ID {class_id}"
            )

        # --- 2. LẤY DANH SÁCH ID CỦA HỌC VIÊN ĐÃ Ở TRONG LỚP NÀY ---
        # Query bảng class_assignments để lấy student_id của những ai ĐÃ ở trong lớp
        students_in_class_query = db.query(ClassAssignment.student_id).filter(
            ClassAssignment.class_id == class_id
        )
        
        # Lấy danh sách các student_id đó
        student_ids_in_class = [result[0] for result in students_in_class_query.all()]

        # --- 3. LẤY TẤT CẢ HỌC VIÊN NGOẠI TRỪ NHỮNG NGƯỜI TRONG DANH SÁCH TRÊN ---
        # Query bảng students và join với users để lấy thông tin
        # Dùng filter() với .notin_() để loại trừ các ID đã có trong lớp
        query = db.query(
            Student.student_id,
            User.name,
            User.email,
            Student.status # Lấy thêm trạng thái nếu cần
        ).join(
            User, Student.user_id == User.user_id # Join Student với User để lấy tên, email
        ).filter(
            Student.student_id.notin_(student_ids_in_class) # Điều kiện loại trừ
        )

        # Lấy tất cả kết quả
        results = query.all()

        # --- 4. FORMAT KẾT QUẢ TRẢ VỀ ---
        student_list = [
            {
                "student_id": student_id,
                "name": name,
                "email": email,
                "status": student_status 
            }
            for student_id, name, email, student_status in results
        ]
        
        return student_list

    except HTTPException as http_exc:
        # Nếu là lỗi 404 từ kiểm tra lớp, raise lại
        raise http_exc
    except Exception as e:
        # Bắt các lỗi khác (ví dụ: lỗi database) và báo lỗi 500
        print(f"ERROR in get_students_not_in_class: {e}") 
        # (Bạn nên dùng logging thay vì print trong production)
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi không xác định khi lấy danh sách học viên: {e}"
        )

# == Thời khoá biểu
def get_classes(db: Session):
    """Lấy danh sách lớp học cùng tên giảng viên."""
    # Tối ưu: Dùng LEFT JOIN phòng trường hợp lớp chưa có GV
    results = db.query(
        Class,
        User.name
    ).outerjoin( # <<< Dùng outerjoin
        Lecturer, Class.lecturer_id == Lecturer.lecturer_id
    ).outerjoin( # <<< Dùng outerjoin
        User, Lecturer.user_id == User.user_id
    ).all()

    class_list = [
        {
            "class_id": cls.class_id,
            "class_name": cls.class_name,
            "schedule": cls.schedule,
            "lecturer_name": lecturer_name if lecturer_name else "N/A", # Xử lý nếu chưa có GV
            "status": cls.status,
            "place": cls.place # <<< Thêm place nếu cần cho ClassInfo
        }
        for cls, lecturer_name in results
    ]
    return class_list

def extract_datetimes_from_schedule_string(schedule_string: str) -> list[datetime]:
    """
    Trích xuất tất cả các chuỗi ngày/giờ ISO AWARE (có múi giờ)
    """
    # <<< SỬA REGEX: Thêm .+Z để lấy cả múi giờ
    iso_date_strings = re.findall(r"date: ([\d\-T:.+Z]+)\s+status:", schedule_string)
    
    datetimes = []
    for date_str in iso_date_strings:
        try:
            # fromisoformat sẽ đọc +00:00 và tạo ra datetime AWARE
            dt = datetime.fromisoformat(date_str)
            datetimes.append(dt)
        except ValueError:
            pass
    
    return datetimes

# <<< Hàm check conflict giữ nguyên như đã sửa timezone >>>
def check_schedule_conflict_single_column(
    db: Session,
    new_start_time: datetime, # Đây là datetime AWARE (từ make_class)
    place: str,
    current_class_id: int = None
) -> bool:
    
    try:
        # 1. Chuẩn hóa thời gian MỚI (A) về UTC (AWARE)
        new_start_A = new_start_time.astimezone(timezone.utc).replace(second=0, microsecond=0)
        new_end_A = new_start_A + timedelta(hours=2) # Giả định 2h

        # 2. Query TẤT CẢ các lớp ở cùng địa điểm (KHÔNG lọc thời gian)
        query = db.query(Class).filter(Class.place == place)
        if current_class_id:
            query = query.filter(Class.class_id != current_class_id)
        
        potential_classes = query.all()
        if not potential_classes:
            return False 

        # 3. Lặp và so sánh trong Python
        for existing_class in potential_classes:
            schedule_string = existing_class.schedule
            if not schedule_string: continue 

            # Dùng hàm extract đã sửa
            existing_sessions = extract_datetimes_from_schedule_string(schedule_string)

            for existing_start_B in existing_sessions:
                # existing_start_B là datetime AWARE (vì nó có +00:00)
                
                # 4. Chuẩn hóa thời gian CŨ (B) về UTC (AWARE)
                existing_start_B = existing_start_B.astimezone(timezone.utc).replace(second=0, microsecond=0)
                existing_end_B = existing_start_B + timedelta(hours=2)

                # 5. Logic so sánh 2 datetime AWARE (A vs B)
                overlap = (new_start_A < existing_end_B and
                           new_end_A > existing_start_B)
                
                if overlap:
                    print(f"!!! TRÙNG LỊCH PHÒNG HỌC: Lớp mới {new_start_A} trùng với lớp {existing_class.class_id} lúc {existing_start_B}")
                    return True # BÁO TRÙNG
        
        return False
        
    except Exception as e:
       print(f"Lỗi khi kiểm tra trùng lịch phòng học: {e}")
       raise HTTPException(status_code=500, detail=f"Lỗi khi kiểm tra trùng lịch: {e}")

# <<< Hàm check conflict giữ nguyên như đã sửa timezone >>>
def check_lecturer_schedule_conflict(
    db: Session,
    lecturer_id: int,
    new_start_time: datetime, # Đây là datetime AWARE
    current_class_id: int = None
) -> bool:
    
    try:
        # 1. Chuẩn hóa thời gian MỚI (A) về UTC (AWARE)
        new_start_A = new_start_time.astimezone(timezone.utc).replace(second=0, microsecond=0)
        new_end_A = new_start_A + timedelta(hours=2)

        # 2. Query TẤT CẢ các lớp 'active' của giảng viên (KHÔNG lọc thời gian)
        query = db.query(Class).filter(
            Class.lecturer_id == lecturer_id,
            Class.status == 'active'
        )
        if current_class_id:
            query = query.filter(Class.class_id != current_class_id)
        
        existing_classes = query.all()
        if not existing_classes:
            return False 

        # 3. Lặp và so sánh trong Python
        for existing_class in existing_classes:
            schedule_string = existing_class.schedule
            if not schedule_string: continue 

            # Dùng hàm extract đã sửa
            existing_sessions = extract_datetimes_from_schedule_string(schedule_string)

            for existing_start_B in existing_sessions:
                # 4. Chuẩn hóa thời gian CŨ (B) về UTC (AWARE)
                existing_start_B = existing_start_B.astimezone(timezone.utc).replace(second=0, microsecond=0)
                existing_end_B = existing_start_B + timedelta(hours=2)

                # 5. Logic so sánh 2 datetime AWARE (A vs B)
                overlap = (new_start_A < existing_end_B and
                           new_end_A > existing_start_B)
                
                if overlap:
                    print(f"!!! TRÙNG LỊCH GIẢNG VIÊN: Lớp mới {new_start_A} trùng với lớp {existing_class.class_id} lúc {existing_start_B}")
                    return True # BÁO TRÙNG
        
        return False
        
    except Exception as e:
       print(f"Lỗi khi kiểm tra trùng lịch giảng viên: {e}")
       raise HTTPException(status_code=500, detail=f"Lỗi khi kiểm tra trùng lịch giảng viên: {e}")

def make_class(
    db: Session,
    user_id: int,
    class_name: str,
    schedule: datetime, # <<< Đây là buổi học ĐẦU TIÊN
    status: str,
    lecturer_id: Optional[int],
    place: Optional[str]
) -> Dict:
    """
    Tạo lớp học mới.
    Tự động tạo 4 buổi học cách nhau 1 tuần từ ngày bắt đầu.
    Kiểm tra xung đột cho TẤT CẢ 4 buổi học.
    Lưu lịch học dưới dạng String.
    """
    try:
        creator = db.query(User).filter(User.user_id == user_id).first()
        if not creator:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Người tạo không tồn tại.")

        lecturer = None
        lecturer_name = "N/A" # Mặc định
        if lecturer_id is not None:
            lecturer_info = db.query(Lecturer, User.name)\
                              .join(User, Lecturer.user_id == User.user_id)\
                              .filter(Lecturer.lecturer_id == lecturer_id)\
                              .first()
            if not lecturer_info:
                raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail=f"Giảng viên với ID {lecturer_id} không tồn tại.")
            lecturer = lecturer_info[0]
            lecturer_name = lecturer_info[1]

        if status not in ['active', 'archived','pending']:
            raise HTTPException(status_code=fastapi_status.HTTP_400_BAD_REQUEST, detail="Trạng thái không hợp lệ.")

        # --- KIỂM TRA XUNG ĐỘT VÀ TẠO CHUỖI LỊCH HỌC ---
        
        # <<< THAY ĐỔI: Tạo danh sách 4 buổi học >>>
        num_sessions = 4
        schedule_entries = [] # Danh sách chứa các chuỗi lịch học

        for i in range(num_sessions):
            # Tính toán ngày/giờ cho buổi học hiện tại
            current_session_date = schedule + timedelta(weeks=i)
            schedule_str = current_session_date.strftime('%Y-%m-%d %H:%M')
            
            # <<< THAY ĐỔI: Kiểm tra xung đột CHO TỪNG BUỔI HỌC >>>
            if place:
                if check_schedule_conflict_single_column(db, current_session_date, place):
                    raise HTTPException(status_code=fastapi_status.HTTP_409_CONFLICT, detail=f"Trùng lịch phòng học tại '{place}' lúc {schedule_str} (Buổi {i+1}).")
            if lecturer:
                if check_lecturer_schedule_conflict(db, lecturer.lecturer_id, current_session_date):
                      raise HTTPException(status_code=fastapi_status.HTTP_409_CONFLICT, detail=f"Trùng lịch giảng viên (ID: {lecturer_id}) lúc {schedule_str} (Buổi {i+1}).")

            # Thêm buổi học (dưới dạng string) vào danh sách
            # Dùng .isoformat() để có chuỗi chuẩn T
            iso_date_str = current_session_date.isoformat()
            schedule_entries.append(f"{{date: {iso_date_str} status: active}}")

        # <<< THAY ĐỔI: Nối các buổi học thành 1 chuỗi, xuống dòng cho dễ đọc >>>
        final_schedule_string = ",".join(schedule_entries)
        
        # --- KẾT THÚC KIỂM TRA VÀ TẠO CHUỖI ---

        new_class = Class(
            class_name=class_name, 
            schedule=final_schedule_string, # <<< THAY ĐỔI: Lưu chuỗi đã tạo
            status=status,
            created_by=user_id, 
            lecturer_id=lecturer_id, 
            place=place
        )
        db.add(new_class)
        db.commit()
        db.refresh(new_class)

        # Trả về dictionary khớp ClassInfo
        return {
            "class_id": new_class.class_id,
            "class_name": new_class.class_name,
            "schedule": new_class.schedule, # <<< Sẽ trả về chuỗi 4 buổi học
            "lecturer_name": lecturer_name,
            "status": new_class.status.value, # <<< Thêm .value để lấy string từ Enum
            "place": new_class.place
        }

    except HTTPException as http_exc:
         db.rollback()
         raise http_exc
    except Exception as e:
        db.rollback()
        print(f"ERROR in make_class: {e}")
        raise HTTPException(status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi không xác định khi tạo lớp: {e}")

# <<< HÀM 4: ĐÃ SỬA ĐỂ TRẢ VỀ DICTIONARY >>>
def change_class(
    db: Session,
    user_id: int,
    class_id: int,
    class_name: Optional[str] = None,
    schedule: Optional[datetime] = None, # Đây là ngày BẮT ĐẦU MỚI
    status: Optional[str] = None,
    lecturer_id: Optional[int] = None,
    place: Optional[str] = None
) -> Dict:
    """Cập nhật lớp học, kiểm tra xung đột cho TẤT CẢ các buổi học và trả về dict."""
    try:
        class_to_update = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_update:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail=f"Class with ID {class_id} not found.")

        # === BƯỚC 1: XỬ LÝ LỊCH HỌC (SCHEDULE) ===
        
        schedule_datetimes_to_check = []
        final_schedule_string = class_to_update.schedule # Mặc định là lịch cũ

        if schedule is not None:
            # Người dùng muốn CẬP NHẬT lịch học
            # -> Tạo lịch 4 tuần mới
            num_sessions = 4
            schedule_entries_str = []
            
            # Đảm bảo datetime đầu vào là AWARE (gán UTC nếu naive)
            if schedule.tzinfo is None:
                 aware_start_time = schedule.replace(tzinfo=timezone.utc)
            else:
                 aware_start_time = schedule.astimezone(timezone.utc)

            for i in range(num_sessions):
                current_session_date = aware_start_time + timedelta(weeks=i)
                schedule_datetimes_to_check.append(current_session_date) # Thêm datetime AWARE
                
                # Tạo chuỗi để lưu
                iso_str = current_session_date.isoformat()
                schedule_entries_str.append(f"{{date: {iso_str} status: active}}")
            
            final_schedule_string = ",".join(schedule_entries_str)
        else:
            # Người dùng KHÔNG cập nhật lịch
            # -> Phân tích lịch CŨ để kiểm tra xung đột với (có thể) GV/Phòng mới
            schedule_datetimes_to_check = extract_datetimes_from_schedule_string(class_to_update.schedule)

        # === BƯỚC 2: XÁC ĐỊNH GIÁ TRỊ CUỐI CÙNG ĐỂ KIỂM TRA ===
        
        # 'locals()' là cách không an toàn, nhưng nó là cách duy nhất
        # để phân biệt "không truyền" (None) và "truyền None để gỡ"
        # trong cấu trúc hàm của bạn.
        was_lecturer_id_provided = 'lecturer_id' in locals()
        
        final_place = place if place is not None else class_to_update.place
        final_lecturer_id = lecturer_id if was_lecturer_id_provided else class_to_update.lecturer_id

        # === BƯỚC 3: KIỂM TRA XUNG ĐỘT ===
        
        # Chỉ kiểm tra nếu một trong các trường liên quan bị thay đổi
        if schedule is not None or place is not None or was_lecturer_id_provided:
            if not schedule_datetimes_to_check:
                 raise HTTPException(status_code=400, detail="Không thể phân tích lịch học để kiểm tra xung đột.")

            print(f"--- Bắt đầu kiểm tra xung đột cho {len(schedule_datetimes_to_check)} buổi học ---")
            
            for session_time in schedule_datetimes_to_check:
                # session_time là một datetime AWARE
                
                # Kiểm tra phòng học
                if final_place:
                    if check_schedule_conflict_single_column(db, session_time, final_place, current_class_id=class_id):
                        raise HTTPException(status_code=fastapi_status.HTTP_409_CONFLICT, detail=f"Trùng lịch phòng học tại '{final_place}' lúc {session_time.date()}.")
                
                # Kiểm tra giảng viên
                if final_lecturer_id: # Chỉ kiểm tra nếu có GV được gán
                    if check_lecturer_schedule_conflict(db, final_lecturer_id, session_time, current_class_id=class_id):
                        raise HTTPException(status_code=fastapi_status.HTTP_409_CONFLICT, detail=f"Trùng lịch giảng viên (ID: {final_lecturer_id}) lúc {session_time.date()}.")

        # === BƯỚC 4: CẬP NHẬT DỮ LIỆU ===
        
        update_data = {}
        if class_name is not None: update_data['class_name'] = class_name
        if place is not None: update_data['place'] = place
        if schedule is not None: 
            update_data['schedule'] = final_schedule_string # Lưu chuỗi 4 buổi
        
        if status is not None:
            if status not in ['active', 'archived', 'pending']:
                raise HTTPException(status_code=400, detail="Invalid status.")
            update_data['status'] = status
        
        if was_lecturer_id_provided:
            if lecturer_id is not None: # Nếu gán GV mới
                lecturer = db.query(Lecturer).filter(Lecturer.lecturer_id == lecturer_id).first()
                if not lecturer:
                    raise HTTPException(status_code=404, detail=f"Lecturer with ID {lecturer_id} not found.")
            update_data['lecturer_id'] = lecturer_id # Gán ID mới (hoặc None nếu gỡ)

        update_data['created_by'] = user_id # Ghi nhận người sửa cuối

        # Thực hiện cập nhật
        db.query(Class).filter(Class.class_id == class_id).update(update_data)
        db.commit()

        # === BƯỚC 5: TRẢ VỀ DỮ LIỆU MỚI ===
        
        updated_class_info = db.query(
                Class, User.name.label("lecturer_name")
            ).outerjoin(Lecturer, Class.lecturer_id == Lecturer.lecturer_id)\
             .outerjoin(User, Lecturer.user_id == User.user_id)\
             .filter(Class.class_id == class_id).first()

        if not updated_class_info:
             raise HTTPException(status_code=500, detail="Không thể lấy thông tin lớp sau khi cập nhật.")

        updated_class, lecturer_name = updated_class_info

        return {
            "class_id": updated_class.class_id,
            "class_name": updated_class.class_name,
            "schedule": updated_class.schedule,
            "lecturer_name": lecturer_name if lecturer_name else "N/A",
            "status": updated_class.status.value, # Thêm .value
            "place": updated_class.place
        }

    except Exception as e:
        db.rollback()
        print(f"Error changing class {class_id}: {e}")
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Lỗi không xác định khi cập nhật lớp: {e}")

# <<< HÀM 5: Giữ nguyên vì trả về message >>>
def change_status_class(
    db: Session,
    user_id: int,
    class_id: int,
):
    # ... (code giữ nguyên) ...
    try:
        class_to_toggle = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_toggle:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail=f"Class with ID {class_id} not found.")

        current_status = class_to_toggle.status
        new_status = None
        if current_status == 'active': new_status = 'archived'
        elif current_status == 'archived': new_status = 'active'
        elif current_status == 'pending': new_status = 'active'
        else:
             raise HTTPException(status_code=fastapi_status.HTTP_400_BAD_REQUEST, detail=f"Cannot toggle status for a class that is currently '{current_status}'.")

        class_to_toggle.status = new_status
        db.commit()
        db.refresh(class_to_toggle) # Refresh để lấy status mới nhất (nếu cần)
        return {"message": f"Class status has been changed to '{new_status}'."}
    except Exception as e:
        db.rollback()
        raise e


# <<< HÀM 6: Giữ nguyên vì trả về Notification object >>>
def make_notify(
    db: Session,
    user_id: int,
    title: str,
    message: str,
):
    # ... (code giữ nguyên) ...
    try:
        new_notification = Notification(
                user_id=user_id,
                title=title,
                message=message,
                created_at=datetime.now()
            )
        db.add(new_notification)
        db.commit()
        db.refresh(new_notification)
        return new_notification
    except Exception as e:
        db.rollback()
        raise e


# <<< HÀM 7: Giữ nguyên vì router dùng TicketInfo >>>
def view_tickets(db: Session):
    """
    Lấy tất cả các ticket KHÔNG PHẢI là 'Leave Request',
    sắp xếp theo ngày tạo mới nhất.
    """
    tickets = db.query(Ticket)\
        .filter(Ticket.issue_type != 'Leave Request')\
        .order_by(Ticket.created_at.desc())\
        .all()
    return tickets




def view_leave_request_tickets(db: Session):
    """
    Chỉ lấy các ticket là 'Leave Request',
    sắp xếp theo ngày tạo mới nhất.
    """
    tickets = db.query(Ticket)\
        .filter(Ticket.issue_type == 'Leave Request')\
        .order_by(Ticket.created_at.desc())\
        .all()
    return tickets


# <<< HÀM 8: Giữ nguyên vì router dùng TicketInfo >>>
def change_status_tickets(db: Session, ticket_id: int, new_status: str):
    # ... (code giữ nguyên) ...
    try:
        valid_statuses = {'open', 'in_progress', 'resolved'}
        if new_status not in valid_statuses:
            raise HTTPException(status_code=fastapi_status.HTTP_400_BAD_REQUEST, detail=f"Invalid status '{new_status}'.")

        ticket_to_update = db.query(Ticket).filter(Ticket.ticket_id == ticket_id).first()
        if not ticket_to_update:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail=f"Ticket with ID {ticket_id} not found.")

        ticket_to_update.status = new_status
        if new_status == 'resolved': ticket_to_update.resolved_at = datetime.now()
        else: ticket_to_update.resolved_at = None

        db.commit()
        db.refresh(ticket_to_update)
        return ticket_to_update
    except Exception as e:
        db.rollback()
        raise e


# <<< HÀM 9: Giữ nguyên vì trả về Dict khớp TeacherPerformance >>>
def view_teacher_performance(db: Session, user_id: int):
    # ... (code giữ nguyên) ...
    lecturer_info = db.query(Lecturer, User.name)\
        .join(User, Lecturer.user_id == User.user_id)\
        .filter(Lecturer.user_id == user_id).first()
    if not lecturer_info:
        raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Lecturer not found")
    lecturer, lecturer_name = lecturer_info

    # ... (code tính toán stats giữ nguyên) ...
    attendance_stats = db.query(LecturersAttendance.status, func.count(LecturersAttendance.status).label("count"))\
        .filter(LecturersAttendance.lecturer_id == lecturer.lecturer_id)\
        .group_by(LecturersAttendance.status).all()
    teaching_attendance = {"present_days": 0, "absent_days": 0, "late_days": 0}
    for stat in attendance_stats:
         # ... (logic gán count) ...
         if stat.status == LecturerAttendanceStatus.present: teaching_attendance["present_days"] = stat.count
         elif stat.status == LecturerAttendanceStatus.absent: teaching_attendance["absent_days"] = stat.count
         elif stat.status == LecturerAttendanceStatus.late: teaching_attendance["late_days"] = stat.count

    active_classes_count = db.query(Class).filter(Class.lecturer_id == lecturer.lecturer_id, Class.status == 'active').count()
    archived_classes_count = db.query(Class).filter(Class.lecturer_id == lecturer.lecturer_id, Class.status == 'archived').count()

    average_grade = db.query(func.avg(Grade.grade))\
        .join(ClassAssignment, Grade.assignment_id == ClassAssignment.assignment_id)\
        .join(Class, ClassAssignment.class_id == Class.class_id)\
        .filter(Class.lecturer_id == lecturer.lecturer_id).scalar()

    return {
        "lecturer_id": lecturer.lecturer_id,
        "lecturer_name": lecturer_name,
        "teaching_attendance": teaching_attendance,
        "class_overview": {"active_classes": active_classes_count, "archived_classes": archived_classes_count},
        "student_performance": {"average_grade_all_classes": round(average_grade, 2) if average_grade else 0.0}
    }


def get_faculty_wide_performance(db: Session):
    """
    Lấy một báo cáo hiệu suất tổng hợp cho TOÀN BỘ giảng viên.
    """
    
    # === 1. Đếm tổng số giảng viên ===
    total_lecturers = db.query(Lecturer).count()

    # === 2. Lấy TỔNG điểm danh (Attendance) ===
    # (Query này giống hệt hàm trước, nhưng chúng ta sẽ dùng nó trực tiếp)
    attendance_stats = db.query(
        LecturersAttendance.status,
        func.count(LecturersAttendance.status).label("count")
    ).group_by(LecturersAttendance.status).all()
    
    # Xử lý thành dict
    total_attendance = {"present_days": 0, "absent_days": 0, "late_days": 0}
    for stat in attendance_stats:
        if stat.status == LecturerAttendanceStatus.present:
            total_attendance["present_days"] = stat.count
        elif stat.status == LecturerAttendanceStatus.absent:
            total_attendance["absent_days"] = stat.count
        elif stat.status == LecturerAttendanceStatus.late:
            total_attendance["late_days"] = stat.count

    # === 3. Lấy TỔNG đếm lớp (Class Counts) ===
    # Đếm tất cả các lớp có giảng viên (lecturer_id != None)
    class_stats = db.query(
        Class.status,
        func.count(Class.class_id).label("count")
    ).filter(
        Class.lecturer_id != None
    ).group_by(Class.status).all()
    
    total_classes = {"active_classes": 0, "archived_classes": 0}
    for stat in class_stats:
        status_str = stat.status.value # Lấy string từ Enum
        if status_str == 'active':
            total_classes["active_classes"] = stat.count
        elif status_str == 'archived':
            total_classes["archived_classes"] = stat.count

    # === 4. Lấy Điểm trung bình CHUNG (Overall Average) ===
    # Lấy điểm TB của tất cả các lớp có giảng viên
    overall_average_grade = db.query(func.avg(Grade.grade))\
        .join(ClassAssignment, Grade.assignment_id == ClassAssignment.assignment_id)\
        .join(Class, ClassAssignment.class_id == Class.class_id)\
        .filter(Class.lecturer_id != None)\
        .scalar() # .scalar() để lấy 1 giá trị duy nhất

    # === 5. Tổng hợp kết quả ===
    
    avg_grade = overall_average_grade if overall_average_grade else 0.0

    return {
        "total_lecturers": total_lecturers,
        "teaching_attendance": total_attendance,
        "class_overview": total_classes,
        "student_performance": {
            "average_grade_all_classes": round(avg_grade, 2)
        }
    }


# <<< HÀM 10: Giữ nguyên vì router dùng UnassignedClassInfo >>>
def get_unassigned_classes(db: Session):
    unassigned_classes = db.query(Class).filter(
        Class.lecturer_id == None,
        Class.status.in_(['active', 'pending'])
    ).all()
    return unassigned_classes


def assign_teacher_to_class(
    db: Session,
    user_id: int, # ID của giảng viên (bảng Users)
    class_id: int
) -> Dict:
    """Gán GV vào lớp, kiểm tra xung đột cho TẤT CẢ các buổi học và trả về dict."""
    try:
        # 1. Tìm giảng viên
        lecturer_info = db.query(Lecturer, User.name)\
                          .join(User, Lecturer.user_id == User.user_id)\
                          .filter(Lecturer.user_id == user_id)\
                          .first()
        if not lecturer_info:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail=f"Lecturer not found for user ID {user_id}.")
        lecturer, lecturer_name = lecturer_info

        # 2. Tìm lớp
        class_to_assign = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_assign:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail=f"Class with ID {class_id} not found.")
        
        # 3. Kiểm tra đã gán chưa
        if class_to_assign.lecturer_id is not None:
            raise HTTPException(status_code=fastapi_status.HTTP_409_CONFLICT, detail=f"Class already assigned.")

        # === BẮT ĐẦU SỬA LỖI KIỂM TRA XUNG ĐỘT ===
        
        # 4. Lấy chuỗi schedule (str) từ lớp
        schedule_string = class_to_assign.schedule
        if not schedule_string:
            # Nếu lớp không có lịch (lạ), bỏ qua kiểm tra
            pass 
        else:
            # 5. Phân tích (Parse) chuỗi thành danh sách các [datetime, datetime, ...]
            schedule_datetimes = extract_datetimes_from_schedule_string(schedule_string)
            
            if not schedule_datetimes:
                raise HTTPException(status_code=400, detail="Cannot parse schedule string to check for conflicts.")

            # 6. Lặp qua TỪNG buổi học để kiểm tra
            print(f"--- Checking {len(schedule_datetimes)} sessions for conflict ---")
            for session_time in schedule_datetimes:
                # session_time là một datetime AWARE
                is_conflict = check_lecturer_schedule_conflict(
                    db=db,
                    lecturer_id=lecturer.lecturer_id,
                    new_start_time=session_time, # <<< ĐÃ SỬA: Truyền datetime
                    current_class_id=class_id # Bỏ qua chính lớp này
                )
                
                # 7. Nếu MỘT buổi bị trùng -> Dừng
                if is_conflict:
                    raise HTTPException(status_code=fastapi_status.HTTP_409_CONFLICT, detail=f"Lecturer schedule conflict detected around {session_time.date()}.")
        
        # === KẾT THÚC SỬA LỖI ===

        # 8. Gán giảng viên
        class_to_assign.lecturer_id = lecturer.lecturer_id
        db.commit()
        db.refresh(class_to_assign)

        # 9. Trả về dictionary
        return {
            "class_id": class_to_assign.class_id,
            "class_name": class_to_assign.class_name,
            "schedule": class_to_assign.schedule,
            "lecturer_name": lecturer_name,
            "status": class_to_assign.status.value, # <<< Thêm .value
            "place": class_to_assign.place
        }
        
    except Exception as e:
        db.rollback()
        print(f"Error assigning teacher {user_id} to class {class_id}: {e}")
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Lỗi không xác định khi gán giảng viên: {e}")


# <<< HÀM 12: Giữ nguyên vì trả về Dict khớp ClassAssignmentRequestInfo >>>
def get_class_assignment_requests(db: Session):
    # ... (code giữ nguyên) ...
    requests = db.query(Ticket, User.name)\
        .join(User, Ticket.submitted_by == User.user_id)\
        .filter(Ticket.issue_type == 'Class Request', Ticket.status == 'open').all()
    result_list = [{"ticket_id": t.ticket_id, "submitted_by_user_id": t.submitted_by, "submitted_by_name": name,
                    "title": t.title, "description": t.description, "created_at": t.created_at}
                   for t, name in requests]
    return result_list

def _parse_class_id_from_ticket(title: str) -> Optional[int]:
    """
    Trích xuất Class ID từ tiêu đề của ticket.
    Được thiết kế để khớp với title: 
    "Class Assignment Request for Class ID: {class_id}"
    """
    
    # Regex mới: Tìm "Class ID:" theo sau là dấu cách và (\d+)
    match = re.search(r"Class ID:[\s]*(\d+)", title, re.IGNORECASE)
    
    if match:
        try:
            # Lấy nhóm số (\d+) và chuyển thành int
            return int(match.group(1))
        except (ValueError, IndexError):
            return None
            
    # Không tìm thấy
    return None


def approve_class_assignment_request(
    db: Session,
    ticket_id: int
):
    try:
        # --- 1. KIỂM TRA VÀ LẤY DỮ LIỆU ---
        ticket = db.query(Ticket).filter(Ticket.ticket_id == ticket_id).first()
        if not ticket:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND, 
                detail="Ticket not found"
            )

        if ticket.status != TicketStatus.open: # Giả sử TicketStatus là Enum
            raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                detail=f"Ticket {ticket_id} is not 'open', status is '{ticket.status.value}'"
            )
        
        lecturer_user_id = ticket.submitted_by
        class_id = _parse_class_id_from_ticket(ticket.title) # Giả sử hàm này tồn tại
        if not class_id:
             raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST, 
                detail="Could not parse class_id from ticket title"
            )

        lecturer = db.query(Lecturer).filter(Lecturer.user_id == lecturer_user_id).first()
        if not lecturer:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail=f"Lecturer (user_id {lecturer_user_id}) not found"
            )

        class_to_assign = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_assign:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail=f"Class (class_id {class_id}) not found"
            )

        # --- 2. KIỂM TRA LOGIC NGHIỆP VỤ ---
        if class_to_assign.lecturer_id is not None:
            raise HTTPException(
                status_code=fastapi_status.HTTP_409_CONFLICT,
                detail=f"Class {class_id} is already assigned to lecturer_id {class_to_assign.lecturer_id}"
            )

        # === BẮT ĐẦU SỬA LỖI KIỂM TRA XUNG ĐỘT ===
        
        schedule_string = class_to_assign.schedule
        if not schedule_string:
            # Lớp không có lịch, không thể trùng -> Bỏ qua
            pass
        else:
            # Phân tích chuỗi (str) thành danh sách các [datetime, datetime, ...]
            schedule_datetimes = extract_datetimes_from_schedule_string(schedule_string)
            
            if not schedule_datetimes:
                # Không phân tích được, có thể là lịch cũ. Bỏ qua kiểm tra.
                print(f"WARNING: Could not parse schedule for class {class_id}. Skipping conflict check.")
            else:
                # Lặp qua TỪNG buổi học để kiểm tra
                print(f"--- Checking {len(schedule_datetimes)} sessions for conflict ---")
                for session_time in schedule_datetimes:
                    # session_time là một datetime AWARE
                    is_conflict = check_lecturer_schedule_conflict(
                        db=db,
                        lecturer_id=lecturer.lecturer_id,
                        new_start_time=session_time, # <<< ĐÃ SỬA: Truyền datetime
                        current_class_id=class_id # Bỏ qua chính lớp này
                    )
                    
                    if is_conflict:
                        raise HTTPException(
                            status_code=fastapi_status.HTTP_409_CONFLICT,
                            detail=f"Lecturer {lecturer.lecturer_id} has a schedule conflict with class {class_id} around {session_time.date()}"
                        )
        # === KẾT THÚC SỬA LỖI ===

        # --- 3. THỰC HIỆN HÀNH ĐỘNG (NẾU MỌI THỨ OK) ---
        class_to_assign.lecturer_id = lecturer.lecturer_id
        class_to_assign.status = 'active' # Chuyển lớp sang active khi gán
        ticket.status = 'resolved'
        
        # Sửa: Dùng múi giờ UTC
        ticket.resolved_at = datetime.now(timezone.utc)
        
        db.commit()
        
        db.refresh(ticket)
        db.refresh(class_to_assign)

        return {"message": f"Successfully approved request for ticket {ticket_id}"}

    except HTTPException:
        db.rollback()
        raise
    
    except Exception as e:
        db.rollback()
        print(f"UNEXPECTED Error approving class assignment request: {e}")
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"An unexpected internal error occurred: {e}"
        )

def reject_class_assignment_request(
    db: Session,
    ticket_id: int
):
    """
    Từ chối một yêu cầu phân công lớp học.
    Cập nhật trạng thái ticket thành 'resolved'.
    """
    try:
        # --- 1. KIỂM TRA VÀ LẤY DỮ LIỆU ---
        
        ticket = db.query(Ticket).filter(Ticket.ticket_id == ticket_id).first()
        if not ticket:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND, 
                detail="Ticket not found"
            )

        if ticket.status != TicketStatus.open:
            raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                detail=f"Ticket {ticket_id} is not 'open', status is '{ticket.status.value}'"
            )

        # --- 2. THỰC HIỆN HÀNH ĐỘNG TỪ CHỐI ---
        
        # Cập nhật trạng thái ticket thành 'resolved' (theo yêu cầu)
        ticket.status = TicketStatus.resolved # <-- ĐÃ SỬA
        ticket.resolved_at = datetime.now()
        
        db.commit()
        db.refresh(ticket)

        # Cập nhật thông báo trả về
        return {"message": f"Successfully processed (rejected) request for ticket {ticket_id}"}

    except HTTPException:
        db.rollback()
        raise 
    
    except Exception as e:
        db.rollback()
        print(f"UNEXPECTED Error rejecting class assignment request: {e}")
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"An unexpected internal error occurred: {e}"
        )

def approve_leave_request(
    db: Session,
    ticket_id: int
):
    """
    Phê duyệt ticket "Leave Request".
    Đọc title, tìm ngày nghỉ trong cột 'schedule' của lớp
    và cập nhật status của ngày đó thành 'deactived'.
    """
    try:
        # --- 1. KIỂM TRA VÀ LẤY TICKET ---
        ticket = db.query(Ticket).filter(Ticket.ticket_id == ticket_id).first()
        if not ticket:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND, 
                detail="Ticket not found"
            )

        if ticket.status != TicketStatus.open: # Giả sử TicketStatus là Enum
            raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                detail=f"Ticket {ticket_id} is not 'open', status is '{ticket.status.value}'"
            )
        
        if ticket.issue_type != 'Leave Request':
             raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                detail=f"Ticket {ticket_id} is not a 'Leave Request'"
            )

        # --- 2. PHÂN TÍCH (PARSE) TIÊU ĐỀ TICKET ---
        # Giả định title từ hàm trước: "Leave Request: User {uid} - Class {cid} - Date {date}"
        title_pattern = r"Leave Request: User (\d+) - Class (\d+) - Date ([\d\-]+)"
        match = re.search(title_pattern, ticket.title)
        
        if not match:
            raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST, 
                detail=f"Cannot parse ticket title: '{ticket.title}'"
            )
        
        # Chúng ta lấy ra class_id và ngày nghỉ (dưới dạng chuỗi YYYY-MM-DD)
        lecturer_user_id_str, class_id_str, leave_date_iso = match.groups()
        class_id = int(class_id_str)

        # --- 3. TÌM LỚP VÀ CẬP NHẬT SCHEDULE ---
        class_to_update = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_update:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail=f"Class (class_id {class_id}) from ticket not found"
            )

        schedule_string = class_to_update.schedule
        if not schedule_string:
             raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail=f"Class {class_id} has no schedule to update"
            )

        # --- 4. LOGIC CẬP NHẬT CHUỖI SCHEDULE ---
        
        lines = schedule_string.split(',')
        new_lines = []
        found_and_updated = False

        for line in lines:
            # Tìm ngày/giờ trong dòng
            date_match = re.search(r"date: ([\d\-T:.+Z]+)", line)
            
            if date_match and "status: active" in line:
                full_datetime_str = date_match.group(1)
                try:
                    # Chuyển chuỗi (str) thành đối tượng datetime (AWARE)
                    dt_obj = datetime.fromisoformat(full_datetime_str)
                    
                    # So sánh phần DATE (YYYY-MM-DD) với ngày xin nghỉ
                    if dt_obj.date().isoformat() == leave_date_iso:
                        # Đây chính là dòng cần thay đổi
                        new_line = line.replace("status: active", "status: deactived")
                        new_lines.append(new_line)
                        found_and_updated = True
                    else:
                        new_lines.append(line) # Không phải ngày nghỉ, giữ nguyên
                except ValueError:
                    new_lines.append(line) # Lỗi parse, giữ nguyên
            else:
                new_lines.append(line) # Không phải dòng schedule, giữ nguyên

        if not found_and_updated:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail=f"Could not find an 'active' schedule for date {leave_date_iso} in class {class_id}"
            )
        
        # --- 5. LƯU THAY ĐỔI VÀO DB ---
        
        # Ghi đè schedule cũ bằng schedule mới (đã sửa status)
        class_to_update.schedule = ",".join(new_lines)
        
        # Cập nhật ticket
        ticket.status = TicketStatus.resolved
        ticket.resolved_at = datetime.now(timezone.utc)
        
        db.commit()
        
        db.refresh(ticket)
        db.refresh(class_to_update)

        return {"message": f"Successfully approved leave for ticket {ticket_id}. Class schedule updated."}

    except HTTPException:
        db.rollback()
        raise
    
    except Exception as e:
        db.rollback()
        print(f"UNEXPECTED Error approving leave request: {e}")
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"An unexpected internal error occurred: {e}"
        )
    

def reject_leave_request(
    db: Session,
    ticket_id: int
):
    """
    Từ chối (reject) ticket "Leave Request".
    Chỉ cập nhật trạng thái của ticket thành 'resolved'
    mà không thay đổi schedule của lớp.
    """
    try:
        # --- 1. KIỂM TRA VÀ LẤY TICKET ---
        ticket = db.query(Ticket).filter(Ticket.ticket_id == ticket_id).first()
        if not ticket:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND, 
                detail="Ticket not found"
            )

        if ticket.status != TicketStatus.open: # Giả sử TicketStatus là Enum
            raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                detail=f"Ticket {ticket_id} is not 'open', status is '{ticket.status.value}'"
            )
        
        if ticket.issue_type != 'Leave Request':
             raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                detail=f"Ticket {ticket_id} is not a 'Leave Request'"
            )

        # --- 2. THỰC HIỆN HÀNH ĐỘNG ---
        # Chỉ cập nhật ticket, không làm gì khác
        ticket.status = TicketStatus.resolved
        ticket.resolved_at = datetime.now(timezone.utc)
        
        db.commit()
        
        db.refresh(ticket)

        return {"message": f"Successfully rejected leave for ticket {ticket_id}."}

    except HTTPException:
        db.rollback()
        raise
    
    except Exception as e:
        db.rollback()
        print(f"UNEXPECTED Error rejecting leave request: {e}")
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"An unexpected internal error occurred: {e}"
        )

def take_lecturer_attendance(
    db: Session,
    lecturer_id: int,
    class_id: int,
    attendance_status: str, 
    attendance_date: date, # <-- SỬA 1: Thêm tham số date
    notes: Optional[str] = None
):
    try:
        # XÓA: today = date.today() 
        # (Chúng ta sẽ dùng 'attendance_date' được truyền vào)

        # 1. Kiểm tra trạng thái hợp lệ
        valid_statuses = [s.value for s in LecturerAttendanceStatus]
        if attendance_status not in valid_statuses:
            raise HTTPException(status_code=fastapi_status.HTTP_400_BAD_REQUEST, detail=f"Trạng thái không hợp lệ. Phải là một trong: {', '.join(valid_statuses)}")

        # 2. Kiểm tra Giảng viên và Lớp học
        lecturer = db.query(Lecturer).filter(Lecturer.lecturer_id == lecturer_id).first()
        if not lecturer:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail=f"Không tìm thấy giảng viên ID {lecturer_id}.")

        class_to_attend = db.query(Class).filter(Class.class_id == class_id).first()
        if not class_to_attend:
            raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail=f"Không tìm thấy lớp học ID {class_id}.")

        # 3. Kiểm tra giảng viên có dạy lớp này không
        if class_to_attend.lecturer_id != lecturer.lecturer_id:
            raise HTTPException(status_code=fastapi_status.HTTP_403_FORBIDDEN, detail=f"Giảng viên (ID: {lecturer_id}) không dạy lớp này.")

        # 4. Kiểm tra xem đã điểm danh ngày đó chưa
        existing_record = db.query(LecturersAttendance).filter(
            LecturersAttendance.lecturer_id == lecturer_id,
            LecturersAttendance.class_id == class_id,
            LecturersAttendance.attendance_date == attendance_date # <-- SỬA 2: Dùng tham số date
        ).first()

        # 5. Xử lý nếu đã điểm danh
        if existing_record:
            # (Bạn có thể bỏ comment phần code bên dưới nếu muốn cho phép CẬP NHẬT)
            
            # existing_record.status = attendance_status
            # existing_record.notes = notes
            # db.commit()
            # db.refresh(existing_record)
            # return existing_record
            
            # Hoặc báo lỗi (như hiện tại):
            raise HTTPException(
                status_code=fastapi_status.HTTP_409_CONFLICT, 
                detail=f"Đã điểm danh cho giảng viên/lớp này vào ngày {attendance_date}." # <-- SỬA 3
            )

        # 6. Nếu chưa điểm danh -> Tạo mới
        new_attendance_record = LecturersAttendance(
            lecturer_id=lecturer_id,
            class_id=class_id,
            attendance_date=attendance_date, # <-- SỬA 4: Dùng tham số date
            status=attendance_status,
            notes=notes
        )

        db.add(new_attendance_record)
        db.commit()
        db.refresh(new_attendance_record)
        return new_attendance_record

    except HTTPException as http_exc:
        db.rollback()
        raise http_exc
    except Exception as e:
        db.rollback()
        print(f"ERROR in take_lecturer_attendance: {e}")
        raise HTTPException(status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi không xác định khi điểm danh giảng viên: {e}")


# <<< HÀM 15: Giữ nguyên vì trả về Dict khớp LecturerInfo >>>
def get_lecturer_list(db: Session) -> List[Dict]:
    # ... (code giữ nguyên) ...
    try:
        lecturers_info = db.query(Lecturer, User)\
            .join(User, Lecturer.user_id == User.user_id).all()
        result = [{"lecturer_id": l.lecturer_id, "user_id": l.user_id, "name": u.name, "email": u.email,
                   "user_status": u.status.value if u.status else None}
                  for l, u in lecturers_info]
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi lấy danh sách giảng viên: {e}")