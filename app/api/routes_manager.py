from typing import Optional

# <<< THÊM VÀO: Thêm 'Depends'
from fastapi import APIRouter, HTTPException, Response, status, Depends
# <<< THÊM VÀO: Import 'Session'
from sqlalchemy.orm import Session

# <<< THÊM VÀO: Thêm 'ApproveTicketRequest' vào import
from app.schemas.manager_schema import (
    CreateUserRequest, 
    UpdateUserRequest, 
    ApproveTicketRequest,
    RejectTicketRequest
)
from app.services import manage_account_service
from app.db.database import get_db
from app.services import report_service

router = APIRouter(tags=["Manager"])

@router.get("/ping")
def ping():
    """Simple health endpoint for manager routes."""
    return {"message": "manager routes ok"}

@router.get("/dashboard")
def get_data(db: Session = Depends(get_db)):
    return manage_account_service.get_dashboard_data(db)

@router.get("/users")
# Thêm db: Session = Depends(get_db)
def list_users(db: Session = Depends(get_db)):
    # Truyền `db`
    return manage_account_service.list_users(db)


@router.get("/users/{user_id}")
# Thêm db: Session = Depends(get_db)
def get_user(user_id: int, db: Session = Depends(get_db)):
    # Truyền `db`
    u = manage_account_service.get_user(db, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u


@router.post("/users", status_code=status.HTTP_201_CREATED)
# Thêm db: Session = Depends(get_db)
def create_user(req: CreateUserRequest, db: Session = Depends(get_db)):
    """Create a user. Returns 201 on success or raises HTTPException on failure."""
    # Truyền `db`
    return manage_account_service.create_user(db, req.name, req.email, req.password, req.role_id)


@router.put("/users/{user_id}")
# Thêm db: Session = Depends(get_db)
def update_user(user_id: int, req: UpdateUserRequest, db: Session = Depends(get_db)):
    data = req.dict(exclude_none=True)
    # Truyền `db`
    return manage_account_service.update_user(db, user_id, **data)


@router.post("/users/{user_id}/status", status_code=status.HTTP_204_NO_CONTENT)
# Thêm db: Session = Depends(get_db)
def change_user_status(user_id: int, mode: str = "toggle", db: Session = Depends(get_db)):
    """Change user status.

    Query param `mode` can be one of: 'activate', 'deactivate', 'toggle'. Default is 'toggle'.
    Returns 204 No Content on success.
    """
    mode = (mode or "toggle").lower()
    if mode == "activate":
        manage_account_service.activate_user(db, user_id)
    elif mode == "deactivate":
        manage_account_service.deactivate_user(db, user_id)
    elif mode == "toggle":
        manage_account_service.toggle_user_status(db, user_id)
    else:
        raise HTTPException(status_code=400, detail="Invalid mode. Use 'activate', 'deactivate' or 'toggle'.")

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tickets/pending-student-requests", status_code=status.HTTP_200_OK)
# Thêm db: Session = Depends(get_db)
def list_pending_student_requests(db: Session = Depends(get_db)):
    """Return open tickets requesting student accounts where the student/user is currently deactivated."""
    # Truyền `db`
    return manage_account_service.list_student_from_ticket(db)


@router.get("/reports", status_code=status.HTTP_200_OK)
# Thêm db: Session = Depends(get_db)
def list_reports(manager_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Return generated reports (optionally filtered by manager id)."""
    # Truyền `db` (Giả định report_service cũng được refactor)
    return report_service.get_reports(db, manager_id)


@router.get("/reports/overview", status_code=status.HTTP_200_OK)
# Thêm db: Session = Depends(get_db)
def reports_overview(manager_id: Optional[int] = None, days: int = 30, db: Session = Depends(get_db)):
    """Return a small overview of key metrics for managers."""
    # Truyền `db` (Giả định report_service cũng được refactor)
    return report_service.generate_overview(db, manager_id, days)


@router.post("/tickets/approve", status_code=status.HTTP_200_OK)
# Thêm db: Session và đổi cách nhận tham số
def approve_tickets_and_activate_students(
    req: ApproveTicketRequest, # Nhận list ticket_id từ body
    db: Session = Depends(get_db)
):
    """
    Approve pending student-request tickets by list of ticket_ids.
    
    - Default behavior activates the student.
    - Set `activate_student: false` in the request body to keep students inactive.
    """
    # Truyền `db` và các tham số từ `req`
    return manage_account_service.approve_student_by_ticket(
        db, 
        tickets_ids=req.ticket_ids,  # <-- Sửa 'tickets' thành 'tickets_ids'
        activate=req.activate_student
    )

@router.post("/tickets/reject", status_code=status.HTTP_200_OK)
def reject_student_tickets(
    req: RejectTicketRequest, # Nhận body theo schema Reject
    db: Session = Depends(get_db)
):
    """
    Từ chối (Reject) các ticket 'Account Request' theo danh sách IDs.
    Hành động này CHỈ cập nhật trạng thái ticket thành 'resolved'.
    """
    # Gọi hàm service 'reject_student_by_ticket' bạn đã tạo
    return manage_account_service.reject_student_by_ticket(
        db, 
        tickets_ids=req.ticket_ids
    )