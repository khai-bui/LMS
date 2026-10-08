from fastapi import APIRouter, Depends  # <<< THÊM VÀO
from sqlalchemy.orm import Session      # <<< THÊM VÀO
from app.db.database import get_db      # <<< THÊM VÀO
from typing import List                 # <<< THÊM VÀO

# <<< SỬA LỖI CHÍNH TẢ: Respone -> Response
from app.schemas.notification_schema import NotificationResponse
from app.services.notification_service import get_all_notifications

router = APIRouter()

@router.get("/notifications", response_model=List[NotificationResponse]) # <<< Sửa tên schema
# <<< THÊM (db: Session = Depends(get_db))
def get_notifications(db: Session = Depends(get_db)):
    # <<< TRUYỀN `db`
    notifications = get_all_notifications(db)
    return notifications