from typing import Dict, List
from fastapi import HTTPException
from sqlalchemy.orm import Session  # <<< THÊM VÀO
from app.models.notification import Notification
# from app.db.database import SessionLocal # <<< XÓA ĐI

def get_all_notifications(db: Session) -> List[Dict]: # Thêm type hint cho giá trị trả về
    """Lấy tất cả thông báo, sắp xếp theo ngày tạo mới nhất."""
    # try: # <<< XÓA
    notifications = db.query(Notification).order_by(Notification.created_at.desc()).all()

    # <<< BỎ PHẦN RAISE HTTPEXCEPTION >>>
    # if not notifications:
    #     raise HTTPException(status_code=404, detail="No notifications found")

    # Trả về mảng rỗng nếu không có thông báo
    if not notifications:
        return [] # Trả về list rỗng là đủ

    list_of_notifications = []
    for notification in notifications:
        list_of_notifications.append({
            "notification_id": notification.notification_id,
            "title": notification.title,
            "message": notification.message,
            "created_at": notification.created_at
        })

    return list_of_notifications
    # finally: # <<< XÓA
    #     pass # db.close() # <<< XÓA