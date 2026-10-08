from typing import Optional, List, Dict
from datetime import datetime, timedelta
from sqlalchemy.orm import Session  # <<< THÊM VÀO
# from app.db.database import SessionLocal # <<< XÓA ĐI
from app.models.report import Report
from app.models.student import Student
from app.models.user import User
from app.models.class_ import Class
from app.models.attendance import Attendance, AttendanceStatus
from app.models.ticket import Ticket, TicketStatus


# <<< THÊM (db: Session)
def get_reports(db: Session, manager_id: Optional[int] = None) -> List[Dict]:
    # db = SessionLocal() # <<< XÓA
    try:
        q = db.query(Report)
        if manager_id:
            q = q.filter(Report.generated_by == manager_id)
        rows = q.order_by(Report.created_at.desc()).all()
        result = []
        for r in rows:
            result.append({
                "report_id": r.report_id,
                "report_type": r.report_type,
                "file_url": r.file_url,
                "generated_by": r.generated_by,
                "created_at": r.created_at,
            })
        return result
    finally:
        pass # db.close() # <<< XÓA (Router sẽ quản lý)


# <<< THÊM (db: Session)
def generate_overview(db: Session, manager_id: Optional[int] = None, days: int = 30) -> Dict:
    """Generate an overview report for managers.
    ... (docstring) ...
    """
    # db = SessionLocal() # <<< XÓA
    try:
        since = datetime.utcnow() - timedelta(days=days)

        # new students: join STUDENTS -> USERS.created_at
        new_students = (
            db.query(Student)
            .join(User, User.user_id == Student.user_id)
            .filter(User.created_at >= since)
            .count()
        )
    
        new_classes = (
            db.query(Class)
            .filter(Class.created_at >= since)
            .count()
        )

        # attendance rate
        total_att = (
            db.query(Attendance)
            .filter(Attendance.date >= since.date())
            .count()
        )
        present_att = (
            db.query(Attendance)
            .filter(Attendance.date >= since.date())
            .filter(Attendance.status == AttendanceStatus.present)
            .count()
        )
        attendance_rate = (present_att / total_att * 100) if total_att > 0 else None

        resolved_tickets = (
            db.query(Ticket)
            .filter(Ticket.status == TicketStatus.resolved)
            .filter(Ticket.resolved_at >= since)
            .count()
        )

        q = db.query(Report)
        if manager_id:
            q = q.filter(Report.generated_by == manager_id)
        total_reports = q.count()

        return {
            "new_students": new_students,
            "new_classes": new_classes,
            "attendance_rate": attendance_rate,
            "resolved_tickets": resolved_tickets,
            "total_reports": total_reports,
            "since": since,
        }
    finally:
        pass # db.close() # <<< XÓA