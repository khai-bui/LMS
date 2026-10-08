import os
import uuid
import aiofiles
from datetime import datetime
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload # <<< THÊM Session
# from app.db.database import SessionLocal # <<< XÓA ĐI
from typing import Optional
# Import các models
from app.models.files import File, Task, Submission, TaskTypeEnum
from app.models.class_ import Class
from app.models.student import Student
from app.models.user import User
from app.models.lecturer import Lecturer
from app.models.class_assignment import ClassAssignment

# Thư mục upload (Giữ nguyên)
UPLOAD_DIRECTORY = "./uploads" 

# Hàm này không truy cập DB trực tiếp (Giữ nguyên)
async def save_file_to_disk(file: UploadFile) -> str:
    """
    Lưu file vật lý vào đĩa và trả về tên file đã lưu (UUID).
    """
    try:
        extension = os.path.splitext(file.filename)[1]
        safe_filename = f"{uuid.uuid4()}{extension}"
        file_path = os.path.join(UPLOAD_DIRECTORY, safe_filename)

        async with aiofiles.open(file_path, 'wb') as out_file:
            await file.seek(0)
            while content := await file.read(1024 * 1024):
                await out_file.write(content)
        
        return safe_filename
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể lưu file vào đĩa: {e}"
        )

# Hàm này đã nhận db: Session (Giữ nguyên)
def _create_file_record_in_session(
    db: Session, 
    uploader_user_id: int, 
    file: UploadFile,
    saved_filename: str
) -> File:
    """
    (Hàm nội bộ) Tạo metadata file và ADD vào session.
    Hàm này KHÔNG commit.
    """
    uploader = db.query(User).filter(User.user_id == uploader_user_id).first()
    if not uploader:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User ID (uploader) {uploader_user_id} không tồn tại."
        )

    file_size = file.size
    
    db_file = File(
        uploader_user_id=uploader_user_id,
        original_filename=file.filename,
        saved_filename=saved_filename,
        file_size=file_size, 
        content_type=file.content_type
    )
    db.add(db_file)
    return db_file

# <<< THÊM (db: Session)
def get_file_record_by_saved_name(db: Session, saved_filename: str):
    """
    Lấy thông tin file (metadata) từ DB bằng tên đã lưu (UUID).
    Dùng cho endpoint download.
    """
    # db = SessionLocal() # <<< XÓA
    try:
        if ".." in saved_filename or "/" in saved_filename:
            raise HTTPException(status_code=400, detail="Tên file không hợp lệ.")
            
        file_record = db.query(File).filter(File.saved_filename == saved_filename).first()
        
        if not file_record:
            raise HTTPException(status_code=404, detail="Không tìm thấy file trong database.")
        
        file_path = os.path.join(UPLOAD_DIRECTORY, file_record.saved_filename)
        if not os.path.isfile(file_path):
            # Lỗi này nghiêm trọng hơn, file vật lý bị mất
            raise HTTPException(status_code=500, detail="Lỗi hệ thống: File vật lý không tồn tại.")
            
        return file_record, file_path
        
    finally:
        pass # db.close() # <<< XÓA

# ==================================================
# TASK SERVICES (Bài giảng & Bài tập)
# ==================================================

# <<< THÊM (db: Session)
async def update_task_file(
    db: Session, # <<< THÊM
    task_id: int,
    uploader_user_id: int, # user_id của GV
    file: UploadFile
):
    """
    Cho phép GV cập nhật file đính kèm cho Task.
    """
    if not file:
        raise HTTPException(status_code=400, detail="Bắt buộc phải có file.")

    # db = SessionLocal() # <<< XÓA
    try:
        db_task = db.query(Task).options(
            joinedload(Task.class_obj) 
        ).filter(Task.task_id == task_id).first()
        
        if not db_task:
            raise HTTPException(status_code=404, detail="Bài tập (Task) không tồn tại.")

        lecturer = db.query(Lecturer).filter(Lecturer.user_id == uploader_user_id).first()
        if not lecturer:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hồ sơ giảng viên không tồn tại.")
        
        if not db_task.class_obj or db_task.class_obj.lecturer_id != lecturer.lecturer_id:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền chỉnh sửa Task của lớp này.")

        saved_filename = await save_file_to_disk(file)
        # <<< TRUYỀN db vào hàm helper
        db_file = _create_file_record_in_session(db, uploader_user_id, file, saved_filename)
        db.flush() 

        db_task.attached_file_id = db_file.file_id
        
        db.commit()

        # Query lại để trả về
        final_task = db.query(Task).options(
            joinedload(Task.attached_file) 
        ).filter(Task.task_id == task_id).first()
        
        # Xử lý giá trị datetime zero (nếu có)
        if final_task and final_task.due_date and str(final_task.due_date) == '0000-00-00 00:00:00':
            final_task.due_date = None
            
        return final_task

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Lỗi khi cập nhật file: {e}")
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA

# <<< THÊM (db: Session)
async def create_task_for_class(
    db: Session,
    class_id: int,
    title: str,
    description: Optional[str], # <<< SỬA: Thêm Optional cho description
    task_type: TaskTypeEnum,
    uploader_user_id: int,
    due_date: Optional[datetime] = None, # <<< Giữ Optional[datetime]
    file: Optional[UploadFile] = None
):
    """
    Tạo TASK, tự động xử lý file upload.
    """
    try:
        db_class = db.query(Class).filter(Class.class_id == class_id).first()
        if not db_class:
            raise HTTPException(status_code=404, detail="Lớp học không tồn tại.")

        lecturer = db.query(Lecturer).filter(Lecturer.user_id == uploader_user_id).first()
        if not lecturer:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hồ sơ giảng viên không tồn tại.")

        if db_class.lecturer_id != lecturer.lecturer_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền tạo bài tập cho lớp này.")

        db_file = None
        attached_file_id = None

        if file:
            saved_filename = await save_file_to_disk(file)
            db_file = _create_file_record_in_session(db, uploader_user_id, file, saved_filename)
            db.flush()
            attached_file_id = db_file.file_id

        # --- SỬA LẠI LOGIC XỬ LÝ due_date ---
        parsed_due_date = None # Bắt đầu với giá trị None

        if isinstance(due_date, datetime):
            # Nếu đã là datetime, dùng luôn
            parsed_due_date = due_date
        elif isinstance(due_date, str):
            # Nếu là chuỗi, làm sạch trước
            cleaned_date_str = due_date.strip()

            # Chỉ thử parse nếu chuỗi SAU KHI làm sạch KHÔNG rỗng
            if cleaned_date_str:
                try:
                    # Thử ISO format trước (linh hoạt hơn)
                    parsed_due_date = datetime.fromisoformat(cleaned_date_str.replace("Z", "+00:00"))
                except ValueError:
                    # Nếu thất bại, thử format YYYY-MM-DD HH:MM:SS
                    try:
                        parsed_due_date = datetime.strptime(cleaned_date_str, '%Y-%m-%d %H:%M:%S')
                    except ValueError:
                        # Nếu cả hai format đều thất bại, mới báo lỗi
                        raise HTTPException(status_code=400, detail="Định dạng due_date không hợp lệ. Dùng YYYY-MM-DDTHH:MM:SS hoặc YYYY-MM-DD HH:MM:SS")
            # else: (Nếu cleaned_date_str là rỗng) -> parsed_due_date giữ nguyên là None
        # else: (Nếu due_date ban đầu là None hoặc kiểu khác) -> parsed_due_date giữ nguyên là None
        # --- KẾT THÚC SỬA ---

        db_task = Task(
            class_id=class_id,
            title=title,
            description=description,
            task_type=task_type,
            due_date=parsed_due_date, # Sử dụng giá trị đã xử lý (có thể None)
            attached_file_id=attached_file_id
        )
        db.add(db_task)
        db.commit()

        # Query lại để lấy đối tượng hoàn chỉnh, tránh lỗi DetachedInstanceError
        new_task_id = db_task.task_id
        final_task = db.query(Task).options(
            joinedload(Task.attached_file)
        ).filter(Task.task_id == new_task_id).first()

        # Xử lý trường hợp database trả về '0000-00-00 00:00:00'
        if final_task and final_task.due_date and str(final_task.due_date) == '0000-00-00 00:00:00':
            final_task.due_date = None

        return final_task

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException): raise e
        # Log lỗi chi tiết hơn ở đây nếu cần thiết
        print(f"ERROR in create_task_for_class: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi tạo task: {e}")
    
# <<< THÊM (db: Session)
def get_tasks_for_class(db: Session, class_id: int):
    """Lấy tất cả task cho lớp học, đã Eager Load file."""
    # db = SessionLocal() # <<< XÓA
    try:
        tasks = (
            db.query(Task)
            .options(joinedload(Task.attached_file))
            .filter(Task.class_id == class_id)
            .order_by(Task.task_id.desc())
            .all()
        )
        
        for task in tasks:
            if task.due_date and str(task.due_date) == '0000-00-00 00:00:00':
                task.due_date = None
        return tasks
    finally:
        pass # db.close() # <<< XÓA
        
# ==================================================
# SUBMISSION SERVICES (Bài nộp)
# ==================================================

# <<< THÊM (db: Session)
async def create_submission(
    db: Session, # <<< THÊM
    task_id: int, 
    uploader_user_id: int, # Đây là user_id của SV
    file: UploadFile
):
    """
    Tạo MỚI hoặc CẬP NHẬT (nộp lại) bài nộp.
    """
    # db = SessionLocal() # <<< XÓA
    try:
        db_task = db.query(Task).options(
            joinedload(Task.class_obj) 
        ).filter(Task.task_id == task_id).first()
        
        if not db_task:
            raise HTTPException(status_code=404, detail="Bài tập không tồn tại.")
        if db_task.task_type != TaskTypeEnum.assignment:
             raise HTTPException(status_code=400, detail="Không thể nộp bài cho 'material'.")

        db_student = db.query(Student).filter(Student.user_id == uploader_user_id).first()
        if not db_student:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ sinh viên.")
        
        student_id_found = db_student.student_id

        class_id_of_task = db_task.class_id
        enrollment = db.query(ClassAssignment).filter(
            ClassAssignment.student_id == student_id_found,
            ClassAssignment.class_id == class_id_of_task
        ).first()
        if not enrollment:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sinh viên không thuộc lớp học này.")

        saved_filename = await save_file_to_disk(file)
        # <<< TRUYỀN db
        db_file = _create_file_record_in_session(db, uploader_user_id, file, saved_filename)
        db.flush() 

        existing_submission = db.query(Submission).filter(
            Submission.task_id == task_id,
            Submission.student_id == student_id_found
        ).first()
        
        db_submission = None # Khởi tạo
        if existing_submission:
            existing_submission.submitted_file_id = db_file.file_id
            existing_submission.grade = None
            existing_submission.feedback_text = None
            existing_submission.graded_file_id = None
            existing_submission.submission_date = datetime.utcnow() 
            db.commit() # Commit cập nhật
            db_submission = existing_submission # Gán để query lại
        
        else:
            db_submission = Submission(
                task_id=task_id,
                student_id=student_id_found,
                submitted_file_id=db_file.file_id,
                submission_date=datetime.utcnow() # <<< THÊM: Ghi nhận ngày nộp
            )
            db.add(db_submission)
            db.commit() # Commit tạo mới
        
        # Query lại để lấy đối tượng hoàn chỉnh
        # Đảm bảo db_submission không phải None trước khi lấy ID
        if db_submission:
             final_submission = db.query(Submission).options(
                 joinedload(Submission.submitted_file),
                 joinedload(Submission.graded_file)
             ).filter(Submission.submission_id == db_submission.submission_id).first()
             return final_submission
        else:
             # Trường hợp hiếm gặp nếu commit thất bại mà không báo lỗi
             raise HTTPException(status_code=500, detail="Không thể lấy thông tin bài nộp sau khi tạo/cập nhật.")

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Lỗi khi nộp bài: {e}")
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA

# <<< THÊM (db: Session)
def get_submissions_for_task(db: Session, task_id: int):
    """Lấy tất cả bài nộp của một Task, đã Eager Load."""
    # db = SessionLocal() # <<< XÓA
    try:
        submissions = db.query(Submission).options(
            joinedload(Submission.student).joinedload(Student.user),
            joinedload(Submission.submitted_file),
            joinedload(Submission.graded_file)
        ).filter(Submission.task_id == task_id).all()
        
        return submissions
    finally:
        pass # db.close() # <<< XÓA

# <<< THÊM (db: Session)
def get_submission_by_student(db: Session, task_id: int, student_id: int):
    """Lấy bài nộp của một student_id cụ thể."""
    # db = SessionLocal() # <<< XÓA
    try:
        submission = db.query(Submission).options(
            joinedload(Submission.submitted_file),
            joinedload(Submission.graded_file)
        ).filter(
            Submission.task_id == task_id,
            Submission.student_id == student_id
        ).first()
        
        if not submission:
            raise HTTPException(status_code=404, detail="Không tìm thấy bài nộp của bạn.")
            
        return submission
    finally:
        pass # db.close() # <<< XÓA

# <<< THÊM (db: Session)
async def grade_submission(
    db: Session, # <<< THÊM
    submission_id: int, 
    grade: float, 
    feedback_text: str,
    uploader_user_id: int, # Đây là user_id của GV
    file: Optional[UploadFile] = None # <<< Sửa type hint
):
    """
    Chấm điểm. Kiểm tra quyền GV.
    """
    # db = SessionLocal() # <<< XÓA
    try:
        db_submission = db.query(Submission).options(
            joinedload(Submission.task).joinedload(Task.class_obj) 
        ).filter(Submission.submission_id == submission_id).first()
        
        if not db_submission:
            raise HTTPException(status_code=404, detail="Bài nộp không tồn tại.")
        
        lecturer = db.query(Lecturer).filter(Lecturer.user_id == uploader_user_id).first()
        if not lecturer:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hồ sơ giảng viên không tồn tại.")

        if not db_submission.task or not db_submission.task.class_obj:
             raise HTTPException(status_code=500, detail="Lỗi dữ liệu: Không thể xác định lớp học của bài nộp.")

        class_lecturer_id = db_submission.task.class_obj.lecturer_id
        
        if class_lecturer_id != lecturer.lecturer_id:
           raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền chấm bài này.")

        graded_file_id = None
        if file:
            saved_filename = await save_file_to_disk(file)
            # <<< TRUYỀN db
            db_file = _create_file_record_in_session(db, uploader_user_id, file, saved_filename)
            db.flush()
            graded_file_id = db_file.file_id

        db_submission.grade = grade
        db_submission.feedback_text = feedback_text
        if graded_file_id:
            db_submission.graded_file_id = graded_file_id
            
        db.commit()
        
        final_submission = db.query(Submission).options(
            joinedload(Submission.graded_file),
            joinedload(Submission.submitted_file)
        ).filter(Submission.submission_id == submission_id).first()

        return final_submission
        
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException): raise e # Ném lại lỗi HTTP đã biết
        # Log lỗi chi tiết ở đây
        print(f"Unexpected error in grade_submission: {e}") 
        raise HTTPException(status_code=500, detail=f"Lỗi khi chấm điểm: {e}")
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA


# <<< THÊM (db: Session)
async def delete_task_file(
    db: Session, # <<< THÊM
    task_id: int,
    uploader_user_id: int # user_id của GV
):
    """
    Cho phép GV xóa file đính kèm khỏi Task.
    """
    # db = SessionLocal() # <<< XÓA
    try:
        db_task = db.query(Task).options(
            joinedload(Task.class_obj) 
        ).filter(Task.task_id == task_id).first()
        
        if not db_task:
            raise HTTPException(status_code=404, detail="Bài tập (Task) không tồn tại.")

        lecturer = db.query(Lecturer).filter(Lecturer.user_id == uploader_user_id).first()
        if not lecturer:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hồ sơ giảng viên không tồn tại.")
        
        if not db_task.class_obj or db_task.class_obj.lecturer_id != lecturer.lecturer_id:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền chỉnh sửa Task của lớp này.")
            
        if not db_task.attached_file_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task này không có file đính kèm để xóa.")

        db_task.attached_file_id = None
        db_task.class_id = None
        db.commit()

        final_task = db.query(Task).options(
            joinedload(Task.attached_file) 
        ).filter(Task.task_id == task_id).first()
        
        if final_task and final_task.due_date and str(final_task.due_date) == '0000-00-00 00:00:00':
            final_task.due_date = None
            
        return final_task

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Lỗi khi xóa file khỏi task: {e}")
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA

# <<< THÊM (db: Session)
async def delete_graded_file(
    db: Session, # <<< THÊM
    submission_id: int, 
    uploader_user_id: int # Đây là user_id của GV
):
    """
    Cho phép GV xóa file chấm bài khỏi Submission.
    """
    # db = SessionLocal() # <<< XÓA
    try:
        db_submission = db.query(Submission).options(
            joinedload(Submission.task).joinedload(Task.class_obj) 
        ).filter(Submission.submission_id == submission_id).first()
        
        if not db_submission:
            raise HTTPException(status_code=404, detail="Bài nộp không tồn tại.")
        
        lecturer = db.query(Lecturer).filter(Lecturer.user_id == uploader_user_id).first()
        if not lecturer:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hồ sơ giảng viên không tồn tại.")

        if not db_submission.task or not db_submission.task.class_obj:
             raise HTTPException(status_code=500, detail="Lỗi dữ liệu: Không thể xác định lớp học của bài nộp.")

        class_lecturer_id = db_submission.task.class_obj.lecturer_id
        
        if class_lecturer_id != lecturer.lecturer_id:
           raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền chỉnh sửa bài nộp này.")

        if not db_submission.graded_file_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bài nộp này không có file chấm bài để xóa.")
            
        db_submission.graded_file_id = None
            
        db.commit()
        
        final_submission = db.query(Submission).options(
            joinedload(Submission.graded_file),
            joinedload(Submission.submitted_file)
        ).filter(Submission.submission_id == submission_id).first()

        return final_submission
        
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Lỗi khi xóa file chấm bài: {e}")
    # finally: # <<< XÓA
    #     db.close() # <<< XÓA