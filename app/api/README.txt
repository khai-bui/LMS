Thư mục chứa các router (endpoint) của FastAPI, chia theo chức năng hoặc vai trò người dùng.

Mỗi file định nghĩa các API endpoint riêng biệt:
- routes_manager.py: API cho người quản trị (tạo tài khoản, phân quyền, báo cáo)
- routes_lec.py: API cho giảng viên (quản lý lớp, nhập điểm, điểm danh)
- routes_cs.py: API cho CS (theo dõi học viên, phản hồi ticket)
- routes_tc.py: API cho điều phối viên (mở lớp, phân công, quản lý lịch dạy)
- routes_auth.py: API xác thực đăng nhập/đăng xuất, refresh token
