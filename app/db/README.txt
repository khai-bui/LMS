Thư mục quản lý kết nối và khởi tạo cơ sở dữ liệu.

Bao gồm:
- session.py: tạo engine và session kết nối database (SQLAlchemy)
- base.py: định nghĩa Base class dùng cho các model ORM
- init_db.py: khởi tạo dữ liệu mẫu hoặc tài khoản mặc định khi khởi chạy hệ thống

Database Ver1:
    - Thêm cột title vào bảng NOTIFICATIONS (đã sửa code trong Database.txt)
    - Thêm cột title vào bảng TICKET (đã sửa code trong Database.txt)
    - Bỏ bảng TEACHING_MATERIALS (đã sửa code trong Database.txt)
    - Thêm cột user_id vào bảng STUDENTS (đã sửa code trong Database.txt)

Database Ver2:
    - Thêm cột grade_type vào bảng GRADES (đã sửa code trong Database.txt)

Database Ver3:
    - Thêm cột status = 'pending' vào bảng CLASSES (đã sửa code trong Database.txt)
    - Thêm cột place vào CLASSES (đã sửa code trong Database.txt)
    - Sửa cột schedule thành datetime (đã sửa code trong Database.txt)

Database Ver4:
    - Thêm bảng điểm danh giáo viên: (đã sửa code trong Database.txt)
