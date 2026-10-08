from typing import List, Optional, Dict
from sqlalchemy.orm import Session  # <<< THAY ĐỔI: Import Session
# from app.db.database import SessionLocal  # <<< THAY ĐỔI: Xóa import này
from app.models.role import Role
from app.models.user import User, UserStatus
from app.services.user_service import hash_password
from fastapi import HTTPException
from app.models.ticket import Ticket, TicketStatus
from app.models.student import Student, StudentStatus
from app.models.lecturer import Lecturer
from app.models.class_ import Class
from app.models.user import User as _User  # Tránh xung đột tên
import re
import secrets
from datetime import date, datetime
import json

# <<< THAY ĐỔI: Thêm (db: Session)
def list_users(db: Session) -> List[Dict]:
    """Liệt kê toàn bộ người dùng trong hệ thống"""
    # db = SessionLocal() # <<< THAY ĐỔI: Xóa
    users = db.query(User).all()
    result = []
    for u in users:
        result.append({
            "user_id": u.user_id,
            "name": u.name,
            "email": u.email,
            "role": u.role.role_name if u.role else None,
            "status": u.status.value if u.status else None,
            "created_at": u.created_at,
        })
    # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
    return result

# <<< THAY ĐỔI: Thêm (db: Session)
def get_user(db: Session, user_id: int) -> Optional[Dict]:
    """Lấy thông tin chi tiết của người dùng theo ID"""
    # db = SessionLocal() # <<< THAY ĐỔI: Xóa
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
        return None
    # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
    return {
        "user_id": user.user_id,
        "name": user.name,
        "email": user.email,
        "role": user.role.role_name if user.role else None,
        "status": user.status.value if user.status else None,
        "created_at": user.created_at,
    }

# <<< THAY ĐỔI: Thêm (db: Session)
def create_user(db: Session, name: str, email: str, password: str, role_id: int) -> Dict:
    """Tạo mới người dùng"""
    # db = SessionLocal() # <<< THAY ĐỔI: Xóa
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
        raise HTTPException(status_code=400, detail="Email đã tồn tại")

    pwd_hash = hash_password(password)
    new = User(name=name, email=email, password_hash=pwd_hash, role_id=role_id)
    db.add(new)
    db.commit()
    db.refresh(new)
    # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
    return {"user_id": new.user_id, "name": new.name, "email": new.email}

# <<< THAY ĐỔI: Thêm (db: Session)
def update_user(db: Session, user_id: int, **fields) -> Dict:
    """Cập nhật thông tin người dùng (có thể đổi mật khẩu)"""
    # db = SessionLocal() # <<< THAY ĐỔI: Xóa
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    if "password" in fields:
        user.password_hash = hash_password(fields.pop("password"))

    for k, v in fields.items():
        if hasattr(user, k):
            setattr(user, k, v)

    db.add(user)
    db.commit()
    db.refresh(user)
    # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
    return {"user_id": user.user_id, "name": user.name, "email": user.email}

# <<< THAY ĐỔI: Thêm (db: Session)
def deactivate_user(db: Session, user_id: int) -> None:
    """Đánh dấu người dùng là 'deactivated' thay vì xóa khỏi DB"""
    # db = SessionLocal() # <<< THAY ĐỔI: Xóa
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    # Nếu đã bị vô hiệu hóa rồi thì bỏ qua
    if user.status == UserStatus.deactivated:
        # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
        return

    user.status = UserStatus.deactivated
    db.add(user)
    db.commit()
    db.refresh(user)
    # db.close() # <<< THAY ĐỔI: Xóa (nếu có)

# <<< THAY ĐỔI: Thêm (db: Session)
def activate_user(db: Session, user_id: int) -> None:
    """Kích hoạt người dùng"""
    # db = SessionLocal() # <<< THAY ĐỔI: Xóa
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    # Nếu đã active thì không cần làm gì thêm
    if user.status == UserStatus.active:
        # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
        return

    user.status = UserStatus.active
    db.add(user)
    db.commit()
    db.refresh(user)
    # db.close() # <<< THAY ĐỔI: Xóa (nếu có)

# <<< THAY ĐỔI: Thêm (db: Session)
def toggle_user_status(db: Session, user_id: int) -> None:
    """Chuyển đổi trạng thái người dùng giữa Active và Deactivated"""
    # db = SessionLocal() # <<< THAY ĐỔI: Xóa
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        # db.close() # <<< THAY ĐỔI: Xóa (nếu có)
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    if user.status == UserStatus.active:
        user.status = UserStatus.deactivated
    else:
        user.status = UserStatus.active

    db.add(user)
    db.commit()
    db.refresh(user)
    # db.close() # <<< THAY ĐỔI: Xóa (nếu có)

# <<< THAY ĐỔI: Thêm (db: Session)
def list_student_from_ticket(db: Session) -> List[Dict]:
    """
    [Dành cho Manager] Liệt kê các ticket 'Account Request' đang chờ duyệt.
    Hàm này hiển thị ai đã gửi (CS) và nội dung JSON trong description.
    """
    try:
        tickets = (
            db.query(Ticket)
            .filter(Ticket.status == TicketStatus.open)
            .filter(Ticket.issue_type == "Account Request")
            .order_by(Ticket.created_at.asc())
            .all()
        )

        result = []
        for t in tickets:
            # Tìm CS agent đã gửi
            submitter = None
            if t.submitted_by:
                submitter = db.query(_User).filter(_User.user_id == t.submitted_by).first()

            result.append({
                "ticket_id": t.ticket_id,
                "ticket_title": t.title,
                "ticket_description": t.description, 
                "submitted_by_cs_id": t.submitted_by,
                "submitter_cs_name": submitter.name if submitter else "N/A",

                "created_at": t.created_at,
                "assigned_to": t.assigned_to,
            })

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi liệt kê ticket: {e}")


def approve_student_by_ticket(db: Session, tickets_ids: List[int], activate: bool = True) -> List[Dict]:
    """
    [Dành cho Manager] Duyệt ticket 'Account Request' bằng cách đọc JSON
    từ description (ngay cả khi có văn bản ở trên).

    `tickets_ids`: Danh sách ID của các ticket cần duyệt.
    `activate`: Mặc định là True (kích hoạt).
    """
    results = []

    # 1. Lấy Role ID của "Student" một lần duy nhất (Nên làm bên ngoài vòng lặp)
    student_role = db.query(Role).filter(Role.role_name == "Student").first()
    if not student_role:
        # Lỗi này nghiêm trọng, dừng luôn
        raise HTTPException(status_code=500, detail="Lỗi hệ thống: Không tìm thấy 'Student' Role ID.")

    student_role_id = student_role.role_id

    activation_status = UserStatus.active if activate else UserStatus.deactivated
    student_activation_status = StudentStatus.active if activate else StudentStatus.inactive

    # 2. Duyệt qua từng ticket ID mà Manager chọn
    for tid in tickets_ids:
        # --- Bắt đầu khối try cho TỪNG ticket ---
        try:
            ticket = db.query(Ticket).filter(Ticket.ticket_id == tid).first()

            # 2.1. Kiểm tra ticket cơ bản
            if not ticket:
                results.append({"ticket_id": tid, "status": "error", "detail": "Không tìm thấy ticket"})
                continue # Bỏ qua ticket này, xử lý ticket tiếp theo
            if ticket.issue_type != "Account Request":
                results.append({"ticket_id": tid, "status": "error", "detail": "Không phải ticket 'Account Request'"})
                continue
            # Giả định TicketStatus là Enum
            if ticket.status != TicketStatus.open:
                results.append({"ticket_id": tid, "status": "error", "detail": f"Ticket đã ở trạng thái {ticket.status.value}, không thể duyệt."})
                continue

            processed_students = []

            # 3. Tách phần văn bản và phần JSON
            raw_description = ticket.description or "" # Đảm bảo không phải None
            separator = "---JSON_DATA_START---"
            json_part_index = raw_description.find(separator)
            json_text = ""
            if json_part_index == -1:
                json_text = raw_description
            else:
                json_text = raw_description[json_part_index + len(separator):]

            # 4. Phân tích (Parse) JSON
            student_data_list = json.loads(json_text)
            if not isinstance(student_data_list, list):
                raise ValueError("Nội dung data (sau dấu hiệu) không phải là một danh sách (list) JSON.")

            # 5. Duyệt qua từng sinh viên trong JSON
            for student_info in student_data_list:
                name = student_info.get("name")
                email = student_info.get("email")
                password = student_info.get("password")

                if not name or not email:
                    raise ValueError(f"Một mục trong JSON bị thiếu 'name' hoặc 'email'.")

                # 6. Kiểm tra User đã tồn tại chưa
                existing_user = db.query(User).filter(User.email == email).first()

                if existing_user:
                    # 6.a. NẾU USER TỒN TẠI: Kích hoạt/Cập nhật
                    existing_user.status = activation_status
                    existing_user.name = name
                    db.add(existing_user)

                    student_record = db.query(Student).filter(Student.user_id == existing_user.user_id).first()
                    if student_record:
                        student_record.status = student_activation_status
                        db.add(student_record)
                    else:
                        new_student = Student(user_id=existing_user.user_id, enrollment_date=date.today(), status=student_activation_status)
                        db.add(new_student)

                    processed_students.append({"email": email, "status": "updated/activated", "user_id": existing_user.user_id})

                else:
                    # 6.b. NẾU USER CHƯA TỒN TẠI: Tạo mới
                    if not password:
                        raise ValueError(f"Thiếu 'password' cho tài khoản mới: {email}.")

                    pwd_hash = hash_password(password)
                    new_user = User(
                        name=name,
                        email=email,
                        password_hash=pwd_hash,
                        role_id=student_role_id,
                        status=activation_status
                    )
                    db.add(new_user)
                    db.flush() # Lấy ID của user mới tạo

                    new_student = Student(
                        user_id=new_user.user_id,
                        enrollment_date=date.today(),
                        status=student_activation_status
                    )
                    db.add(new_student)

                    processed_students.append({"email": email, "status": "created", "user_id": new_user.user_id})

            # 7. Nếu mọi thứ thành công CHO TICKET NÀY, đóng ticket
            ticket.status = TicketStatus.resolved # Dùng Enum
            ticket.resolved_at = datetime.utcnow()
            db.add(ticket)

            # 8. Commit giao dịch CHO TICKET NÀY
            db.commit()
            results.append({"ticket_id": tid, "status": "success", "processed_details": processed_students})

        # --- Xử lý lỗi cho TỪNG ticket ---
        except (json.JSONDecodeError, ValueError) as e:
            db.rollback() # Hoàn tác các thay đổi của ticket BỊ LỖI này
            results.append({"ticket_id": tid, "status": "error", "detail": f"Lỗi Dữ liệu JSON hoặc Thiếu thông tin: {str(e)}"})
            continue # Tiếp tục xử lý ticket tiếp theo
        except HTTPException as http_exc: # Bắt lỗi HTTP nếu có (ví dụ từ kiểm tra quyền)
             db.rollback()
             results.append({"ticket_id": tid, "status": "error", "detail": http_exc.detail})
             continue
        except Exception as e:
            db.rollback() # Hoàn tác các thay đổi của ticket BỊ LỖI này
            print(f"ERROR processing ticket {tid}: {e}") # Log lỗi ra console server
            results.append({"ticket_id": tid, "status": "error", "detail": f"Lỗi Hệ thống không xác định: {str(e)}"})
            continue # Tiếp tục xử lý ticket tiếp theo
        # --- Kết thúc khối try cho từng ticket ---

    # <<< KHÔNG CÓ finally db.close() ở đây >>>
    return results # Trả về kết quả xử lý của tất cả các ticket


def reject_student_by_ticket(db: Session, tickets_ids: List[int]) -> List[Dict]:
    """
    [Dành cho Manager] Từ chối (Reject) ticket 'Account Request'.
    Hàm này chỉ thay đổi trạng thái ticket thành 'resolved' và không 
    đọc hay xử lý bất kỳ dữ liệu nào trong description.

    `tickets_ids`: Danh sách ID của các ticket cần từ chối.
    """
    results = []

    # 1. Duyệt qua từng ticket ID mà Manager chọn
    for tid in tickets_ids:
        # --- Bắt đầu khối try cho TỪNG ticket ---
        try:
            # Dùng .with_for_update() để khóa hàng (row) lại, 
            # tránh trường hợp hai admin cùng duyệt 1 ticket
            ticket = db.query(Ticket).filter(Ticket.ticket_id == tid).with_for_update().first()

            # 1.1. Kiểm tra ticket cơ bản
            if not ticket:
                results.append({"ticket_id": tid, "status": "error", "detail": "Không tìm thấy ticket"})
                continue # Bỏ qua ticket này, xử lý ticket tiếp theo
            
            if ticket.issue_type != "Account Request":
                results.append({"ticket_id": tid, "status": "error", "detail": "Không phải ticket 'Account Request'"})
                continue
            
            # Giả định TicketStatus là Enum
            if ticket.status != TicketStatus.open:
                results.append({"ticket_id": tid, "status": "error", "detail": f"Ticket đã ở trạng thái {ticket.status.value}, không thể từ chối."})
                continue

            # --- 2. THỰC HIỆN HÀNH ĐỘNG (CHỈ CẬP NHẬT TICKET) ---
            
            ticket.status = TicketStatus.resolved # Đánh dấu là đã xử lý
            ticket.resolved_at = datetime.utcnow() # Dùng UTC
            db.add(ticket)

            # --- 3. Commit giao dịch CHO TICKET NÀY ---
            db.commit()
            results.append({"ticket_id": tid, "status": "success", "detail": "Đã từ chối thành công."})

        # --- Xử lý lỗi cho TỪNG ticket ---
        except HTTPException as http_exc: # Bắt lỗi HTTP nếu có
            db.rollback()
            results.append({"ticket_id": tid, "status": "error", "detail": http_exc.detail})
            continue
        except Exception as e:
            db.rollback() # Hoàn tác các thay đổi của ticket BỊ LỖI này
            print(f"ERROR processing ticket {tid}: {e}") # Log lỗi ra console server
            results.append({"ticket_id": tid, "status": "error", "detail": f"Lỗi Hệ thống không xác định: {str(e)}"})
            continue
        # --- Kết thúc khối try cho từng ticket ---

    return results # Trả về kết quả xử lý của tất cả các ticket

def get_dashboard_data(db: Session):
    try:
        students = db.query(Student).all()
        class_ = db.query(Class).all()
        lecturers = db.query(Lecturer).all()
        tickets = db.query(Ticket).all()

        if not students or not lecturers or not tickets:
            raise HTTPException(status_code=404, detail="Khong co data")
        
        return{
            "student_size": len(students),
            "class_size": len(class_),
            "lecturer_size": len(lecturers),
            "ticket_size": len(tickets)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Khong server tim thay data")
 
