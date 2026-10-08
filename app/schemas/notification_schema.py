from pydantic import BaseModel
from datetime import datetime

class NotificationResponse(BaseModel):
    notification_id: int
    title: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True