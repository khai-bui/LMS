from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.notification_schema import NotificationResponse

class LoginRequest(BaseModel):
    username: str = Field(..., example="manager")
    password: str = Field(..., example="123456")

    class Config:
        json_schema_extra = {
            "example": {
                "username": "Manager One",
                "password": "123456"
            }
        }

class TokenResponse(BaseModel):
    access_token: str
    token_type: str 
    user_id: int
    user_name: str
    user_role: str

class UserInfo(BaseModel):
    username: str
    email: str

    class Config:
        from_attributes = True

class TicketCreateRequest(BaseModel):
    user_id: int
    user_assigned: int
    title: str
    issue_type: str
    description: str
    status: Optional[str] = "open"
    created_at: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": 3,
                "user_assigned": 1,
                "title": "Lỗi phân công lớp học",
                "issue_type": "System Bug",
                "description": "Không thể phân công giảng viên cho lớp LEC102.",
                "status": "open",
                "created_at": "2025-10-20T10:30:00Z"
            }
        }

class TicketRespone(BaseModel):
    title: str
    description: str
    created_at: datetime
    status: str

    class Config:
        orm_mode = True  # Cho phép map trực tiếp từ SQLAlchemy model