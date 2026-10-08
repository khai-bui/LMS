Thư mục chứa các cấu hình và thành phần cốt lõi của hệ thống LMS.

Bao gồm:
- config.py: đọc biến môi trường (.env), cấu hình hệ thống (DB_URL, SECRET_KEY,...)
- security.py: các hàm xử lý bảo mật, mã hoá mật khẩu, tạo và xác thực JWT token
- dependencies.py: các dependency dùng chung trong API (như get_db, get_current_user,...)
