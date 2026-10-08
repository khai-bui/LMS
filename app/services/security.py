# đây là service chỉ để bảo mật, mã hóa mật khẩu dùng trong cs_service và manage_account_service
from passlib.context import CryptContext


def _truncate_to_72(password: str) -> str:
    """Ensure password is at most 72 bytes for bcrypt (cut safely by bytes)."""
    if not password:
        return password or ""
    
    # luôn encode để xử lý ký tự đặc biệt
    pw_bytes = password.encode("utf-8")
    if len(pw_bytes) > 72:
        pw_bytes = pw_bytes[:72]
        # giải mã lại, bỏ ký tự lỗi
        password = pw_bytes.decode("utf-8", errors="ignore")
    
    # đảm bảo sau decode, lại kiểm tra lần cuối (đề phòng lỗi byte boundary)
    while len(password.encode("utf-8")) > 72:
        password = password[:-1]
    
    return password

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Hash a password safely (truncate to 72 bytes before bcrypt)."""
    safe_pw = _truncate_to_72(password)
    return pwd_context.hash(safe_pw)
