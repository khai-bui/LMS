Thư mục chứa các lớp/hàm xử lý logic nghiệp vụ (business logic).

Service là lớp trung gian giữa tầng API (routes) và tầng Database (models),
giúp tách biệt rõ ràng vai trò từng phần.

Ví dụ:
- user_service.py: xử lý đăng ký, phân quyền, xác thực người dùng
- class_service.py: mở lớp, phân công giáo viên, cập nhật lịch học
- ticket_service.py: xử lý tạo và phản hồi ticket
- attendance_service.py: điểm danh học viên, thống kê buổi học
