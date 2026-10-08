from fastapi import (
    APIRouter, 
    HTTPException, 
    UploadFile, 
    File, 
    Form, 
    Depends,
    status
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session # <<< THÊM VÀO
from app.db.database import get_db # <<< THÊM VÀO
from typing import List,Optional # <<< THÊM VÀO

# Import các Schemas (Pydantic models)
from app.schemas.file_schemas import TaskResponse, SubmissionResponse

# Import các services
from app.services.files_service import (
    get_file_record_by_saved_name,  
    create_task_for_class,         # (async)
    get_tasks_for_class,
    create_submission,             # (async)
    get_submissions_for_task,
    get_submission_by_student,
    grade_submission,              # (async)
    update_task_file,              # (async)
    delete_graded_file,            # (async)
    delete_task_file               # (async)
)
# Import Enum từ model
from app.models.files import TaskTypeEnum


# Khởi tạo router
router = APIRouter(
    prefix="/files", # <<< Thêm tag
)

# --- API CHO FILES ---

@router.delete("/task/{task_id}/file", response_model=TaskResponse)
# <<< THÊM (db: Session = Depends(get_db))
async def delete_task_file_route(
    task_id: int,
    uploader_user_id: int = Form(...), # user_id của GV (Nên lấy từ auth)
    db: Session = Depends(get_db)
):
    """(Giảng viên) Xóa file đính kèm khỏi một Task."""
    try:
        # <<< TRUYỀN `db`
        updated_task = await delete_task_file(
            db=db, 
            task_id=task_id,
            uploader_user_id=uploader_user_id
        )
        return updated_task
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/submission/{submission_id}/file", response_model=SubmissionResponse)
# <<< THÊM (db: Session = Depends(get_db))
async def delete_graded_file_route(
    submission_id: int,
    uploader_user_id: int = Form(...), # user_id của GV (Nên lấy từ auth)
    db: Session = Depends(get_db)
):
    """(Giảng viên) Xóa file chấm bài khỏi một Submission."""
    try:
        # <<< TRUYỀN `db`
        updated_submission = await delete_graded_file(
            db=db,
            submission_id=submission_id,
            uploader_user_id=uploader_user_id
        )
        return updated_submission
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/task/{task_id}/file", response_model=TaskResponse)
# <<< THÊM (db: Session = Depends(get_db))
async def update_task_file_route(
    task_id: int,
    uploader_user_id: int = Form(...), # Nên lấy từ auth 
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """(Giảng viên) Cập nhật file đính kèm cho một Task."""
    try:
        # <<< TRUYỀN `db`
        updated_task = await update_task_file(
            db=db,
            task_id=task_id,
            uploader_user_id=uploader_user_id,
            file=file
        )
        return updated_task
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download/{saved_filename}")
# <<< THÊM (db: Session = Depends(get_db))
# <<< Đổi thành hàm sync vì service là sync
def download_file(saved_filename: str, db: Session = Depends(get_db)):
    """Tải một file về dựa trên tên đã lưu (UUID)."""
    try:
        # <<< TRUYỀN `db`
        file_record, file_path = get_file_record_by_saved_name(db, saved_filename)
        
        return FileResponse(
            path=file_path,
            filename=file_record.original_filename,
            media_type='application/octet-stream' # Buộc tải xuống
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- API CHO TASKS (Bài giảng / Bài tập) ---

@router.get("/class/{class_id}/tasks", response_model=List[TaskResponse]) # <<< Sửa response_model
# <<< THÊM (db: Session = Depends(get_db))
def get_tasks_route(class_id: int, db: Session = Depends(get_db)):
    """Lấy tất cả Tasks của một lớp học."""
    try:
        # <<< TRUYỀN `db`
        return get_tasks_for_class(db, class_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/class/{class_id}/tasks", response_model=TaskResponse)
# <<< THÊM (db: Session = Depends(get_db))
async def create_task_route(
    class_id: int,
    title: str = Form(...),
    description: Optional[str] = Form(None), # <<< Thêm Optional
    task_type: TaskTypeEnum = Form(...),
    uploader_user_id: int = Form(...), # ID của GV (Nên lấy từ auth)
    due_date: Optional[str] = Form(None), # <<< Thêm Optional
    file: Optional[UploadFile] = File(None), # <<< Thêm Optional
    db: Session = Depends(get_db)
):
    """(Giảng viên) Tạo một Task mới cho lớp."""
    try:
        # <<< TRUYỀN `db`
        new_task = await create_task_for_class(
            db=db,
            class_id=class_id,
            title=title,
            description=description,
            task_type=task_type,
            uploader_user_id=uploader_user_id, 
            due_date=due_date,
            file=file 
        )
        return new_task
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- API CHO SUBMISSIONS (Bài nộp) ---

@router.post("/task/{task_id}/submit", response_model=SubmissionResponse)
# <<< THÊM (db: Session = Depends(get_db))
async def create_submission_route(
    task_id: int,
    uploader_user_id: int = Form(...), # user_id của sinh viên (Nên lấy từ auth)
    file: UploadFile = File(...), # Bài nộp là bắt buộc
    db: Session = Depends(get_db)
):
    """(Sinh viên) Nộp bài cho một Assignment."""
    if not file:
        raise HTTPException(status_code=400, detail="Bắt buộc phải có file bài nộp.")

    try:
        # <<< TRUYỀN `db`
        new_submission = await create_submission(
            db=db,
            task_id=task_id,
            uploader_user_id=uploader_user_id,
            file=file
        )
        return new_submission
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/task/{task_id}/submissions", response_model=List[SubmissionResponse]) # <<< Sửa response_model
# <<< THÊM (db: Session = Depends(get_db))
def get_submissions_for_task_route(task_id: int, db: Session = Depends(get_db)):
    """(Giảng viên) Lấy tất cả bài nộp của một Task."""
    try:
        # <<< TRUYỀN `db`
        return get_submissions_for_task(db, task_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/task/{task_id}/student/{student_id}", response_model=SubmissionResponse)
# <<< THÊM (db: Session = Depends(get_db))
def get_submission_by_student_route(task_id: int, student_id: int, db: Session = Depends(get_db)):
    """(Sinh viên/GV) Lấy bài nộp của 1 SV cho 1 Task."""
    try:
        # <<< TRUYỀN `db`
        return get_submission_by_student(db, task_id, student_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/submission/{submission_id}/grade", response_model=SubmissionResponse)
# <<< THÊM (db: Session = Depends(get_db))
async def grade_submission_route(
    submission_id: int,
    grade: float = Form(...),
    feedback_text: Optional[str] = Form(None), # <<< Thêm Optional
    uploader_user_id: int = Form(...), # user_id của giảng viên (Nên lấy từ auth)
    file: Optional[UploadFile] = File(None), # <<< Thêm Optional
    db: Session = Depends(get_db)
):
    """(Giảng viên) Chấm điểm và trả file feedback."""
    try:
        # <<< TRUYỀN `db`
        updated_submission = await grade_submission(
            db=db,
            submission_id=submission_id,
            grade=grade,
            feedback_text=feedback_text,
            uploader_user_id=uploader_user_id,
            file=file
        )
        return updated_submission
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))