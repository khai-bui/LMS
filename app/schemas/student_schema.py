from typing import Optional
from pydantic import BaseModel
from datetime import date, datetime

class ClassInfo(BaseModel):
    class_id: int
    class_name: str
    lecturer_name: str
    place: str
    schedule: str

    class Config:
        from_attributes = True

class GradeInfo(BaseModel):
    grade_type: str
    grade: Optional[float] = None
    remarks: Optional[str] = None

    class Config:
        from_attributes = True

class AttendanceInfo(BaseModel):
    date: date
    status: Optional[str] = None

    class Config:
        from_attributes = True