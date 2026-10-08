from pydantic import BaseModel
from typing import Optional
from typing import List, Optional

class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role_id: int


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[int] = None
    status: Optional[str] = None

class ApproveTicketRequest(BaseModel):
    ticket_ids: List[int]
    activate_student: bool = True


class RejectTicketRequest(BaseModel):
    """
    Schema cho body của request /reject
    (Đơn giản hơn, chỉ cần danh sách ID)
    """
    ticket_ids: List[int]