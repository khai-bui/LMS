import hashlib
from fastapi import HTTPException
from app.models.ticket import Ticket
from app.models.user import User, UserStatus
from sqlalchemy.orm import Session  # <<< THÊM VÀO
# from app.db.database import SessionLocal # <<< XÓA ĐI
from app.core.config import settings
from jose import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- CÁC HÀM KHÔNG TRUY CẬP DB (GIỮ NGUYÊN) ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    sha256_pw = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    return pwd_context.verify(sha256_pw, hashed_password)

def hash_password(plain_password: str) -> str:
    sha256_pw = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    return pwd_context.hash(sha256_pw)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt

# --- CÁC HÀM TRUY CẬP DB (ĐÃ SỬA) ---

# <<< THÊM (db: Session)
def authenticate_user(db: Session, username: str, password: str):
    try:
        # db = SessionLocal() # <<< XÓA
        user = db.query(User).filter(User.name == username).first()

        if not user:
            raise HTTPException(status_code=401, detail="Invalid Username")

        if not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid Password")

        if user.status != UserStatus.active:
            raise HTTPException(status_code=403, detail="User is deactivated")
        
        return {
            "user_id": user.user_id,
            "username": user.name,
            "password_hash": user.password_hash,
            "role": user.role.role_name if user.role else None
        }
    finally:
        pass # db.close() # <<< XÓA

# <<< THÊM (db: Session)
def get_info_from_user_id(db: Session, user_id: int):
    # db = SessionLocal() # <<< XÓA

    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=4404, detail="User not found")
    
    return user

# <<< THÊM (db: Session)
def submit_ticket(db: Session, user_id: int, user_assigned: int, title: str, issue_type: str, description: str, status: str = "open", created_at: datetime = None):
    try:
        if created_at is None:
            created_at = datetime.now()

        # db = SessionLocal() # <<< XÓA
        new_ticket = Ticket(
            submitted_by=user_id,
            assigned_to=user_assigned,
            title=title,
            issue_type=issue_type,
            description=description,
            status=status,
            created_at=created_at
        )
        db.add(new_ticket)
        db.commit()
        db.refresh(new_ticket)

        return new_ticket
    finally:
        pass # db.close() # <<< XÓA

def get_tickets_by_user_id(user_id: int, db = Session):
    # db =SessionLocal()
    try:
        tickets = db.query(Ticket).filter(Ticket.submitted_by == user_id).all()

        if not tickets:
            raise HTTPException(status_code=404, detail="Tickets not found")

        ticket_list = []

        for ticket in tickets:
            ticket_list.append({
                "title": ticket.title,
                "description": ticket.description,
                "created_at": ticket.created_at,
                "status": ticket.status
            })

        return ticket_list
    finally:
        # db.close()
        pass

def update_password(user_id: int, new_password: str, db = Session):
    """
    Finds a user by user_id, hashes their new password,
    and updates it in the database.
    """
    try:
        # db = SessionLocal() # <<< XÓA

        # 1. Find the user
        user = db.query(User).filter(User.user_id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # 2. Hash the new password using your existing function
        new_hashed_password = hash_password(new_password)

        # 3. Update the user's password_hash field
        user.password_hash = new_hashed_password

        # 4. Commit the changes
        db.commit()
        db.refresh(user)

        return user
    except Exception as e:
        db.rollback() # Rollback on error
        raise HTTPException(status_code=500, detail=f"Error updating password: {e}")
    finally:
        pass # db.close() # <<< XÓA