document.addEventListener('DOMContentLoaded', () => {
    // Lấy thông tin người dùng và token
    const user = JSON.parse(sessionStorage.getItem("loggedInUser"));
    const token = sessionStorage.getItem("accessToken");
    // Lấy ID người dùng (Lecturer ID hoặc TC ID)
    const tcId = user ? (user.user_id || user.id) : null;

    // Kiểm tra đăng nhập
    if (!user || !token || !tcId) {
        console.error("LỖI BẢO MẬT: Người dùng chưa đăng nhập hoặc thiếu token!");
        window.location.href = "/";
        return;
    }

    window.onload = function() {
        if (window.history && window.history.pushState) {
            // Đặt các thuộc tính Cache Control bằng JavaScript
            window.history.pushState('forward', null, window.location.href);
            window.onpageshow = function(evt) {
                if (evt.persisted) {
                    // Nếu trang được load từ cache (Bấm Back/Forward), 
                    // kiểm tra lại session và nếu cần thì chuyển hướng
                    const tokenCheck = sessionStorage.getItem("accessToken");
                    if (!tokenCheck) {
                         window.location.href = "/";
                    }
                }
            };
        }
    }  
    // Cập nhật thông tin người dùng trong Header nếu có
    if (user && tcId) {
        const userId = user.id || user.user_id;
        const userNameSpan = document.getElementById('user-name');
        if (userNameSpan) {
            userNameSpan.innerHTML = `${user.fullName || user.user_name || user.name || user.username || 'User'} (ID: <span id="tc-id-display">${userId}</span>)`;
        }
    }

    // ==================================================================
    // DỮ LIỆU MẪU VÀ DỮ LIỆU API (API Data sẽ được tải vào đây)
    // ==================================================================
    const MOCK_DATA = {
        // ⭐ Cập nhật: Dữ liệu này sẽ được tải từ API tổng quan
        summary: { totalStudents: 0, totalTeachers: 0, activeClasses: 0, pendingTickets: 0, presentDays: 0, absentDays: 0, lateDays: 0, avgGrade: 0 }, 
        classes: [],
        classApprovals: [],
        teachers: [],
        tickets: [],
        announcements: [],
        leaveRequests: [], // ⭐ MỚI: Danh sách yêu cầu xin nghỉ (raw data)
        activeUsers: [
            { user_id: 101, role: 'student' },
            { user_id: 102, role: 'student' },
        ],
    };

    // ===============================================
    // HELPER FUNCTIONS
    // ===============================================

    const Helpers = {
        TC_ID: tcId,

        getToken: () => token,

        getStatusTag(status) {
            let text, style;
            const lowerStatus = String(status).toLowerCase();
            switch (lowerStatus) {
                // Trạng thái Giáo viên (Mới)
                case 'active': text = 'Đang hoạt động'; style = 'background-color: #dcfce7; color: #16a34a; font-weight: 600;'; break;
                case 'deactivated': text = 'Đã vô hiệu hóa'; style = 'background-color: #fef3c7; color: #d97706; font-weight: 600;'; break;
                // Trạng thái Lớp/Ticket/Leave Request
                case 'new': text = 'Sắp KG'; style = 'background-color: #bfdbfe; color: #1e40af;'; break;
                case 'locked': case 'archived': text = 'Đã khóa'; style = 'background-color: #f1f5f9; color: #64748b;'; break;
                case 'pending': case 'open': text = 'Chờ xử lý'; style = 'background-color: #fef3c7; color: #d97706;'; break;
                case 'resolved': case 'closed': text = 'Đã giải quyết'; style = 'background-color: #dcfce7; color: #16a34a;'; break;
                case 'in_progress': text = 'Đang xử lý'; style = 'background-color: #bfdbfe; color: #1e40af;'; break;
                // ⭐ MỚI: TRẠNG THÁI CHO LEAVE REQUEST
                case 'approved': text = 'Đã Duyệt'; style = 'background-color: #dcfce7; color: #16a34a; font-weight: 600;'; break;
                case 'rejected': text = 'Đã Từ chối'; style = 'background-color: #fecaca; color: #dc2626; font-weight: 600;'; break;
                default: text = status; style = 'background-color: #f1f5f9; color: #64748b;';
            }
            // Thêm style cho thẻ trạng thái nổi bật
            return `<span class="status" style="padding: 4px 8px; font-size: 0.85em; display: inline-block; ${style}">${text}</span>`;
        },

        getRoleDisplay(role) {
            const map = { 'lec': 'Giảng viên', 'tc': 'Tư vấn', 'cs': 'Chăm sóc HV', 'manager': 'Quản lý', 'all': 'Tất cả', 'student': 'Học viên' };
            return map[role] || role;
        },

        // FIX: Đảm bảo xử lý chuỗi YYYY-MM-DD chính xác
        formatDate(dateString) {
            if (!dateString || dateString === 'N/A') return 'N/A';
            try {
                let dateToParse = dateString;
                // Nếu chuỗi chỉ là YYYY-MM-DD, thêm T00:00:00 để trình duyệt parse đúng theo UTC
                if (dateString.length >= 10 && dateString.substring(0, 10).includes('-') && !dateString.includes('T')) {
                    dateToParse = dateString.substring(0, 10) + 'T00:00:00';
                } else if (dateString.includes('T')) {
                    // Lấy phần ngày thôi
                    dateToParse = dateString.split('T')[0];
                }

                const date = new Date(dateToParse);
                
                // Kiểm tra nếu parse không thành công
                if (isNaN(date.getTime())) {
                    return dateString.split('T')[0] || 'N/A';
                }
                // Sử dụng toLocaleDateString để định dạng tiếng Việt
                return date.toLocaleDateString('vi-VN');
            } catch (e) {
                return dateString.split('T')[0] || 'N/A';
            }
        },

        getTeachersAsOptions(selectedId = '') {
            let options = MOCK_DATA.teachers.map(t =>
                `<option value="${t.id}" ${t.id == selectedId ? 'selected' : ''}>${t.name} (ID: ${t.id})</option>`
            ).join('');
            return `<option value="">-- Chọn Giảng viên --</option>` + options;
        },

        getClassAsOptions(selectedId = '') {
            let options = MOCK_DATA.classes.map(cls =>
                `<option value="${cls.id}" ${cls.id == selectedId ? 'selected' : ''}>${cls.name} (Mã: ${cls.id})</option>`
            ).join('');
            return `<option value="">-- Chọn Lớp học --</option>` + options;
        },

        showGeneralModal(title, message, isError = false) {
            const modalOverlay = document.getElementById('confirm-modal-overlay');
            const modalTitle = document.getElementById('confirm-modal-title');
            const modalMessage = document.getElementById('confirm-modal-message');
            const executeBtn = document.getElementById('execute-confirm-btn');
            const cancelBtn = document.getElementById('cancel-confirm-btn');

            if (!modalOverlay) {
                return console.error(title + ': ' + message);
            }

            modalTitle.textContent = title;
            modalMessage.innerHTML = isError
                ? `<pre style="white-space: pre-wrap; word-wrap: break-word; text-align: left; font-size: 0.9em; color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 5px;">${message}</pre>`
                : `<p style="font-size: 1rem; color: #374151;">${message}</p>`;

            executeBtn.classList.add('hidden');
            cancelBtn.textContent = 'Đóng';
            cancelBtn.onclick = () => modalOverlay.classList.add('hidden');
            document.getElementById('close-confirm-modal-btn').onclick = () => modalOverlay.classList.add('hidden');

            modalOverlay.style.display = 'flex';
            modalOverlay.classList.remove('hidden');
        },
    };

    // ===============================================
    // MODULE CHÍNH
    // ===============================================

    const TCDashboardApp = {
        async init() {
            // KHỞI TẠO DOM TRƯỚC HẾT
            this.TeacherManagement.initDOM();
            this.ClassManagement.initDOM();
            this.TicketManagement.initDOM();
            this.AnnouncementManagement.init();
            
            // Tải dữ liệu tổng quan và chính
            await this.loadOverviewData(); 
            await this.TeacherManagement.fetchTeachers();
            await this.ClassManagement.fetchClassList(true); 
            await this.TicketManagement.fetchTickets();

            // ⭐ MỚI: Tải yêu cầu xin nghỉ
            await this.TeacherManagement.fetchLeaveRequests(); 

            // Gọi fetchAnnouncements cuối cùng
            await this.AnnouncementManagement.fetchAnnouncements();

            this.loadDashboardSummary();
            this.renderInsightCharts(); 
            
            // Tải form điểm danh lần đầu
            this.TeacherManagement.renderAttendanceForm();
            // ⭐ MỚI: Render yêu cầu xin nghỉ lần đầu
            this.TeacherManagement.renderLeaveRequests(MOCK_DATA.leaveRequests); 
        },

        // HÀM LẤY DỮ LIỆU TỔNG QUAN
        async loadOverviewData() {
            try {
                const token = Helpers.getToken();
                const response = await fetch(`/tc/performance/overview`, {
                    method: "GET",
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (!response.ok) {
                    throw new Error(`Lỗi tải dữ liệu tổng quan: ${response.status}`);
                }
                const data = await response.json();

                // Cập nhật MOCK_DATA.summary bằng dữ liệu API
                MOCK_DATA.summary = {
                    totalStudents: data.total_students || 0, 
                    totalTeachers: data.total_lecturers || 0,
                    activeClasses: data.class_overview?.active_classes || 0,
                    pendingTickets: MOCK_DATA.tickets.filter(t => t.status === 'pending' || t.status === 'open').length, 
                    presentDays: data.teaching_attendance?.present_days || 0,
                    absentDays: data.teaching_attendance?.absent_days || 0,
                    lateDays: data.teaching_attendance?.late_days || 0,
                    avgGrade: data.student_performance?.average_grade_all_classes || 0
                };
            } catch (error) {
                console.error("Lỗi khi tải dữ liệu Tổng quan:", error);
                // Giữ lại các giá trị mock nếu API lỗi
                MOCK_DATA.summary.totalStudents = 120;
                MOCK_DATA.summary.pendingTickets = 8;
            }
        },

        // CẬP NHẬT: Load Dashboard Summary từ dữ liệu đã tải (API)
        loadDashboardSummary() {
            document.getElementById('tc-total-teachers').textContent = MOCK_DATA.summary.totalTeachers || 0;
            document.getElementById('tc-active-classes').textContent = MOCK_DATA.summary.activeClasses || 0;
            // Cập nhật Pending Tickets sau khi fetchTickets xong
            const pendingCount = MOCK_DATA.tickets.filter(t => t.status === 'pending' || t.status === 'open').length;
            document.getElementById('tc-pending-tickets').textContent = pendingCount || MOCK_DATA.summary.pendingTickets;
        },

        // HÀM VẼ BIỂU ĐỒ INSIGHT
        renderInsightCharts() {
            const present = MOCK_DATA.summary.presentDays;
            const absent = MOCK_DATA.summary.absentDays;
            const late = MOCK_DATA.summary.lateDays;
            const avgGrade = MOCK_DATA.summary.avgGrade;

            // Chart 1: Tỷ lệ Điểm danh Giảng viên
            this.TeacherManagement.renderChart(
                'attendance-pie-chart',
                ['Có mặt', 'Vắng mặt', 'Đến trễ'],
                [present, absent, late],
                'Tỷ lệ Điểm danh'
            );

            // Chart 2: Điểm Trung bình Học viên
            this.TeacherManagement.renderChart(
                'grade-bar-chart',
                ['Điểm TB (Toàn bộ lớp)'],
                [avgGrade],
                'Điểm Trung bình'
            );
        },


        // ==================================================================
        // MODULE QUẢN LÝ THÔNG BÁO (KHÔNG THAY ĐỔI)
        // ==================================================================
        AnnouncementManagement: {
            init() {
                this.DOM = {
                    form: document.getElementById('announcement-form'),
                    tableBody: document.getElementById('announcements-table-body'),
                    searchInput: document.getElementById('announcement-history-search'),
                    sortSelect: document.getElementById('announcement-history-sort'),
                };
                if (!this.DOM.form) return;
                this.bindEvents();
            },

            bindEvents() {
                this.DOM.form.addEventListener('submit', (e) => this.handleSubmit(e));
                this.DOM.tableBody.addEventListener('click', (e) => this.handleTableActions(e));

                this.DOM.searchInput?.addEventListener('input', () => this.filterAnnouncements());
                this.DOM.sortSelect?.addEventListener('change', () => this.filterAnnouncements());
            },

            // HÀM LỌC VÀ SẮP XẾP THÔNG BÁO
            filterAnnouncements() {
                const searchTerm = this.DOM.searchInput?.value.toLowerCase() || '';
                const sortBy = this.DOM.sortSelect?.value || 'newest';

                let filtered = MOCK_DATA.announcements.filter(ann =>
                    (ann.title || '').toLowerCase().includes(searchTerm) ||
                    (ann.content || '').toLowerCase().includes(searchTerm)
                );

                // Sắp xếp
                filtered.sort((a, b) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    if (sortBy === 'oldest') {
                        return dateA - dateB;
                    } else {
                        return dateB - dateA;
                    }
                });

                this.renderAnnouncements(filtered);
            },

            async fetchAnnouncements() {
                if (this.DOM && this.DOM.tableBody) {
                    this.DOM.tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:gray;">Đang tải lịch sử thông báo...</td></tr>`;
                }

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // API GET /notify/notifications
                    const response = await fetch(`/notify/notifications`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(`Không thể tải thông báo: ${errorData.detail || response.statusText}`);
                    }

                    const notifications = await response.json() || [];

                    // Ánh xạ dữ liệu API
                    MOCK_DATA.announcements = notifications.map(n => ({
                        id: n.notification_id,
                        title: n.title || 'Không tiêu đề',
                        content: n.message || 'Không nội dung',
                        date: n.created_at,
                        recipient: n.recipient || 'all',
                        sender: 'TC01'
                    }));

                    this.filterAnnouncements(); // Lọc và Render danh sách

                } catch (error) {
                    console.error("Lỗi khi tải Thông báo:", error);
                    if (this.DOM && this.DOM.tableBody) {
                        this.DOM.tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">❌ Lỗi tải thông báo: ${error.message}</td></tr>`;
                    }
                }
            },

            // HÀM RENDER ĐỂ NHẬN DỮ LIỆU ĐÃ LỌC/SẮP XẾP
            renderAnnouncements(announcements = MOCK_DATA.announcements) {
                if (!this.DOM.tableBody) return;

                this.DOM.tableBody.innerHTML = '';

                if (announcements.length === 0) {
                    this.DOM.tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Không tìm thấy thông báo nào.</td></tr>`;
                    return;
                }

                announcements.forEach(ann => {
                    const row = this.DOM.tableBody.insertRow();

                    // Cấu trúc bảng: Tiêu đề | Nội dung (message) | Ngày gửi | Hành động
                    row.innerHTML = `
                        <td>${ann.title}</td>
                        <td>${ann.content.substring(0, 50)}${ann.content.length > 50 ? '...' : ''}</td>
                        <td>${Helpers.formatDate(ann.date)}</td>
                    `;
                });
            },

            // HÀM GỬI THÔNG BÁO
            async handleSubmit(e) {
                e.preventDefault();
                const title = document.getElementById('announcement-title').value.trim();
                const message = document.getElementById('announcement-content').value.trim();

                const submitBtn = document.getElementById('submit-announcement-btn');

                if (!title || !message) {
                    return Helpers.showGeneralModal('⚠️ Lỗi', 'Vui lòng nhập đầy đủ Tiêu đề và Nội dung thông báo.', true);
                }

                const requestBody = {
                    title: title,
                    message: message,
                };

                submitBtn.disabled = true;

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // API POST /tc/notifications/create
                    const apiUrl = `/tc/notifications/create?current_user_id=${Helpers.TC_ID}`;

                    const response = await fetch(apiUrl, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(errorData.detail || response.statusText);
                    }

                    Helpers.showGeneralModal('✅ Thành công', `Đã gửi thông báo "${title}" thành công!`);
                    document.getElementById('announcement-form').reset();
                    await this.fetchAnnouncements(); // Tải lại danh sách sau khi gửi

                } catch (error) {
                    console.error("Lỗi khi gửi thông báo:", error);
                    Helpers.showGeneralModal(`❌ Lỗi Gửi Thông báo`, error.message, true);
                } finally {
                    submitBtn.disabled = false;
                }
            },

            handleTableActions(e) {
                const target = e.target.closest('.delete-btn');
                if (!target) return;
                const annId = target.dataset.id;

                if (confirm(`Bạn có chắc chắn muốn xóa thông báo ID ${annId} không?`)) {
                    // Cần tích hợp API xóa ở đây nếu có. Hiện tại là mock
                    MOCK_DATA.announcements = MOCK_DATA.announcements.filter(a => a.id != annId);
                    this.filterAnnouncements();
                    Helpers.showGeneralModal('✅ Thành công', `Đã xóa thông báo ID ${annId} (Mô phỏng).`);
                }
            }
        },

        // ==================================================================
        // MODULE QUẢN LÝ GIÁO VIÊN
        // ==================================================================
        TeacherManagement: {
            performanceChartInModal: null,

            initDOM() {
                this.DOM = {
                    tabs: document.querySelectorAll('.teacher-management-tab'),
                    performanceView: document.getElementById('teacher-performance'),
                    attendanceView: document.getElementById('teacher-schedule'),
                    // ⭐ MỚI: CẬP NHẬT ID TAB MỚI
                    leaveRequestView: document.getElementById('teacher-leave-request'), 
                    leaveRequestTableBody: document.getElementById('leave-request-table-body'), 
                    performanceBody: document.getElementById('teacher-performance-body'),
                    scheduleTableContainer: document.getElementById('schedule-table-container'),
                    modalOverlay: document.getElementById('teacher-schedule-modal-overlay'),
                    modalBody: document.getElementById('teacher-schedule-modal-body'),
                };
                this.bindEvents();
            },

            bindEvents() {
                this.DOM.tabs.forEach(btn => btn.addEventListener('click', (e) => this.switchTab(e.currentTarget)));
                this.DOM.performanceBody.addEventListener('click', (e) => this.handleTableActions(e));
                
                // Điểm danh
                document.getElementById('att-class-id')?.addEventListener('change', (e) => this.updateAttendanceFormOnClassChange(e));
                document.getElementById('att-schedule')?.addEventListener('change', (e) => this.updateLecturerInfo(e));
                document.getElementById('attendance-form')?.addEventListener('submit', (e) => this.handleAttendanceSubmit(e));
                
                // ⭐ MỚI: Yêu cầu xin nghỉ (Duyệt/Từ chối)
                this.DOM.leaveRequestTableBody?.addEventListener('click', (e) => this.handleLeaveRequestActions(e));

                document.querySelectorAll('#teacher-schedule-modal-overlay .close-modal, #close-teacher-schedule-modal-btn-bottom').forEach(btn => {
                    btn.addEventListener('click', () => this.closeScheduleModal());
                });
            },
            
            handleTableActions(e) {
                 const btn = e.target.closest('.view-performance-btn');
                 if (btn) {
                     const teacherUserId = btn.dataset.id;
                     this.openPerformanceModal(teacherUserId);}
            },

            // ⭐ MỚI: HÀM LẤY DANH SÁCH YÊU CẦU XIN NGHỈ (TINH CHỈNH THEO RESPONSE THỰC TẾ)
            async fetchLeaveRequests(rerender = true) {
                 if (!this.DOM || !this.DOM.leaveRequestTableBody) return;
                 if (rerender) {
                     this.DOM.leaveRequestTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:gray;">Đang tải danh sách yêu cầu xin nghỉ...</td></tr>`;
                 }

                 try {
                     const token = Helpers.getToken();
                     if (!token) throw new Error("Missing access token.");

                     // API GET /tc/leave-requests
                     const response = await fetch(`/tc/leave-requests`, {
                         method: "GET",
                         headers: { "Authorization": `Bearer ${token}` }
                     });

                     if (!response.ok) {
                         const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                         throw new Error(`Không thể tải yêu cầu xin nghỉ: ${errorData.detail || response.statusText}`);
                     }

                     const requests = await response.json() || []; 
                     
                     // Ánh xạ dữ liệu API 
                     MOCK_DATA.leaveRequests = requests.map(req => {
                         let leaveDate = 'N/A';
                         let reasonDetail = req.title || 'Không rõ lý do';
                         
                         // ⭐ LOGIC TRÍCH XUẤT TỪ CHUỖI DESCRIPTION PHỨC TẠP
                         if (req.description) {
                             // 1. Trích xuất Ngày xin nghỉ (Leave Date): Tìm "Date: YYYY-MM-DDTHH:MM:SS"
                             const dateMatch = req.description.match(/Date: (\S+)/); 
                             if (dateMatch && dateMatch[1]) {
                                 // Lấy phần ngày (YYYY-MM-DD)
                                 leaveDate = dateMatch[1].split('T')[0]; 
                             }
                             
                             // 2. Trích xuất Lý do chi tiết (Reason): Tìm "Reason: [Lý do]"
                             const reasonMatch = req.description.match(/Reason: ([^\n]+)/); 
                             if (reasonMatch && reasonMatch[1]) {
                                 reasonDetail = reasonMatch[1].trim(); 
                             } else {
                                 // Nếu không tìm thấy pattern Reason, dùng toàn bộ description trừ phần đầu
                                 const parts = req.description.split('\n');
                                 reasonDetail = parts.length > 0 ? parts[parts.length - 1].trim() : req.title;
                             }
                         }
                         // Trích xuất Giảng viên và Lớp (chỉ để hiển thị cho tiện)
                         const lecturerName = req.lecturer_name || (req.description ? req.description.match(/Lecturer: ([^\s]+)/)?.[1] : 'N/A') || 'N/A'; 
                         const className = req.class_name || (req.description ? req.description.match(/Class: ([^\n]+)/)?.[1]?.replace(/\s*\(ID: \d+\)/, '').trim() : 'N/A') || 'N/A';


                         return {
                            id: req.ticket_id,
                            submitted_by: req.submitted_by, 
                            lecturer_name: lecturerName, 
                            class_name: className,
                            leave_date: leaveDate, 
                            reason: reasonDetail, 
                            status: req.status || 'open', 
                            created_at: req.created_at, 
                         }
                     }).filter(req => req.id);

                     if (rerender) this.renderLeaveRequests(MOCK_DATA.leaveRequests);

                 } catch (error) {
                     console.error("Lỗi khi tải yêu cầu xin nghỉ:", error);
                     const errorMessage = `❌ Lỗi tải yêu cầu xin nghỉ: ${error.message}`;
                     if (rerender) {
                         this.DOM.leaveRequestTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red; padding: 10px;">${errorMessage}</td></tr>`;
                     }
                 }
            },
            
            // ⭐ MỚI: HÀM RENDER DANH SÁCH YÊU CẦU XIN NGHỈ
                renderLeaveRequests(requests) {
                if (!this.DOM.leaveRequestTableBody) return;
                this.DOM.leaveRequestTableBody.innerHTML = '';
                
                const openRequests = requests.filter(req => req.status.toLowerCase() === 'open' || req.status.toLowerCase() === 'pending' || req.status.toLowerCase() === 'resolved');

                if (openRequests.length === 0) {
                     this.DOM.leaveRequestTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Không có yêu cầu xin nghỉ đang chờ xử lý.</td></tr>`;
                     return;
                }
                
                openRequests.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                openRequests.forEach(req => {
                    const row = this.DOM.leaveRequestTableBody.insertRow();
                    
                    // Sử dụng leave_date đã được format thành YYYY-MM-DD
                    const leaveDateDisplay = req.leave_date !== 'N/A' ? Helpers.formatDate(req.leave_date) : 'N/A';
                    
                    // Thêm thông tin Lớp vào tên Giảng viên
                    const lecturerDisplay = `${req.lecturer_name} (${req.class_name})`;

                    // Dữ liệu hiển thị (ID, Giảng viên, Ngày nghỉ, Lý do, Trạng thái)
                    row.innerHTML = `
                        <td>#${req.id}</td>
                        <td>${lecturerDisplay}</td>
                        <td style="font-weight: 600;">${leaveDateDisplay}</td>
                        <td title="${req.reason}">${req.reason.substring(0, 50)}${req.reason.length > 50 ? '...' : ''}</td>
                        <td>${Helpers.getStatusTag(req.status)}</td>
                        <td>
                            <button class="btn btn-primary btn-sm resolve-leave-btn" data-id="${req.id}" data-action="approved" style="width: 70px;">
                                <i class="fas fa-check"></i> Duyệt
                            </button>
                            <button class="btn btn-danger btn-sm resolve-leave-btn ml-2" data-id="${req.id}" data-action="rejected" style="width: 70px;">
                                <i class="fas fa-times"></i> Từ chối
                            </button>
                        </td>
                    `;
                });
            },

            // ⭐ MỚI: HÀM XỬ LÝ DUYỆT/TỪ CHỐI YÊU CẦU XIN NGHỈ
            handleLeaveRequestActions(e) {
                 const btn = e.target.closest('.resolve-leave-btn');
                 if (!btn) return;
                 
                 const requestId = btn.dataset.id;
                 const action = btn.dataset.action; // 'approved' hoặc 'rejected'
                 const actionDisplay = action === 'approved' ? 'DUYỆT' : 'TỪ CHỐI';

                 if (confirm(`Bạn có chắc chắn muốn ${actionDisplay} yêu cầu xin nghỉ #${requestId} không?`)) {
                     this.resolveLeaveRequest(requestId, action);
                 }
            },

            // ⭐ MỚI: HÀM GỌI API DUYỆT YÊU CẦU XIN NGHỈ
            async resolveLeaveRequest(requestId, status) {
                 try {
                     const token = Helpers.getToken();
                     if (!token) throw new Error("Missing access token.");

                     let response;
                     let url;
                     let method; 

                     if (status === 'approved') {
                         // DUYỆT: Gọi API /tc/tickets/{ticket_id}/approve-leave (POST)
                         url = `/tc/${requestId}/approve-leave`;
                         method = "POST";
                         response = await fetch(url, {
                             method: method,
                             headers: { "Authorization": `Bearer ${token}` }
                         });
                         
                     } else if (status === 'rejected') {
                        // TỪ CHỐI: Gọi API /tc/tickets/{ticket_id}/status (PUT)
                        url = `/tc/${requestId}/reject-leave`;
                        method = "POST";
                        response = await fetch(url, {
                            method: method,
                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                            // body: JSON.stringify({ status: 'rejected' }) 
                        });
                    } else {
                         throw new Error("Hành động không hợp lệ: " + status);
                     }

                     if (!response.ok) {
                         // Cố gắng lấy chi tiết lỗi từ body JSON
                         const errorData = await response.json().catch(() => ({ 
                             detail: `HTTP Error ${response.status} (Không có chi tiết JSON)` 
                         })); 

                         // Xử lý lỗi 422 (Unprocessable Entity - Lỗi logic nghiệp vụ)
                         if (response.status === 422 && errorData.detail) {
                              let errorMsg = Array.isArray(errorData.detail) 
                                 ? errorData.detail.map(d => d.msg).join('; ') 
                                 : (errorData.detail || `Lỗi 422: Thông tin request không hợp lệ.`);
                              throw new Error(errorMsg);
                         }

                         // Xử lý lỗi chung khác
                         throw new Error(errorData.detail || `Lỗi ${response.status}: ${response.statusText}`);
                     }

                     Helpers.showGeneralModal('✅ Thành công', `Đã **${status.toUpperCase()}** yêu cầu xin nghỉ #${requestId}.`);
                     await this.fetchLeaveRequests(true); // Tải lại danh sách

                 } catch (error) {
                     console.error(`Lỗi khi xử lý yêu cầu xin nghỉ #${requestId}:`, error);
                     Helpers.showGeneralModal(`❌ Lỗi Xử lý Yêu cầu Xin nghỉ`, error.message, true);
                 }
            },


            async fetchTeachers() {
                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // API GET /tc/teachers/all
                    const response = await fetch(`/tc/teachers/all`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(`Không thể tải danh sách Giáo viên: ${errorData.detail || response.statusText}`);
                    }

                    const teachers = await response.json() || [];

                    // Ánh xạ dữ liệu API và thêm Mock data cho các chỉ số hiệu suất
                    MOCK_DATA.teachers = teachers.map((t, index) => ({
                        id: t.lecturer_id || t.user_id || index + 1,
                        user_id: t.user_id,
                        name: t.name || 'N/A',
                        email: t.email || 'N/A',
                        status: t.user_status,
                        classes: Math.floor(Math.random() * 5 + 1),
                        avgScore: (Math.random() * 1.5 + 8).toFixed(1),
                    })).filter(t => t.user_id);

                    if (this.DOM) this.renderPerformance();
                    TCDashboardApp.loadDashboardSummary();

                } catch (error) {
                    console.error("Lỗi khi tải danh sách Giáo viên:", error);
                    if (this.DOM && this.DOM.performanceBody) {
                        this.DOM.performanceBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">❌ Lỗi tải GV: ${error.message}</td></tr>`;
                    }
                }
            },

            switchTab(clickedButton) {
                const targetTab = clickedButton.dataset.tab;

                this.DOM.tabs.forEach(btn => {
                    btn.classList.toggle('btn-primary', btn === clickedButton);
                    btn.classList.toggle('btn-secondary', btn !== clickedButton);
                    btn.classList.toggle('active', btn === clickedButton);
                });

                this.DOM.performanceView.classList.toggle('active', targetTab === 'performance');
                this.DOM.performanceView.classList.toggle('hidden', targetTab !== 'performance');

                this.DOM.attendanceView.classList.toggle('active', targetTab === 'attendance');
                this.DOM.attendanceView.classList.toggle('hidden', targetTab !== 'attendance');
                
                // ⭐ MỚI: LOGIC HIỂN THỊ TAB MỚI
                this.DOM.leaveRequestView.classList.toggle('active', targetTab === 'leave-request');
                this.DOM.leaveRequestView.classList.toggle('hidden', targetTab !== 'leave-request');
                
                if (targetTab === 'performance') this.renderPerformance();
                if (targetTab === 'attendance') this.renderAttendanceForm();
                // ⭐ MỚI: GỌI fetch/render khi chuyển tab
                if (targetTab === 'leave-request') {
                    this.fetchLeaveRequests(true); 
                }
            },

            renderPerformance() {
                if (!this.DOM || !this.DOM.performanceBody) return;

                this.DOM.performanceBody.innerHTML = '';
                const totalColumns = 5;

                if (MOCK_DATA.teachers.length === 0) {
                    this.DOM.performanceBody.innerHTML = `<tr><td colspan="${totalColumns}" style="text-align:center;">Không tìm thấy Giáo viên nào.</td></tr>`;
                    return;
                }

                MOCK_DATA.teachers.forEach(teacher => {
                    const row = this.DOM.performanceBody.insertRow(); 

                    row.innerHTML = `
                        <td>${teacher.id}</td>
                        <td>${teacher.name}</td>
                        <td>${teacher.email}</td>
                        <td>${Helpers.getStatusTag(teacher.status)}</td>
                        <td>
                            <button class="btn btn-secondary btn-sm view-performance-btn" data-id="${teacher.user_id}"><i class="fas fa-chart-line"></i> Xem hiệu suất</button>
                        </td>
                    `;
                });
            },

            renderAttendanceForm() {
                const classSelect = document.getElementById('att-class-id');
                const scheduleSelect = document.getElementById('att-schedule');
                const lecturerDisplay = document.getElementById('att-lecturer-display');
                const lecturerHiddenId = document.getElementById('att-lecturer-id');
                const attendanceForm = document.getElementById('attendance-form');
                
                if (!classSelect || !attendanceForm) return;

                // 1. Reset Form & Các giá trị
                attendanceForm.reset();
                
                // 2. Cập nhật options cho Select Lớp học
                classSelect.innerHTML = Helpers.getClassAsOptions();

                // 3. Reset Select Buổi học & Giảng viên
                if (scheduleSelect) {
                    scheduleSelect.innerHTML = `<option value="">-- Vui lòng chọn Lớp học trước --</option>`;
                    scheduleSelect.disabled = true;
                }
                
                if (lecturerDisplay) { // Hiển thị tên GV
                    lecturerDisplay.value = `-- Chưa chọn Lớp học --`;
                }
                if (lecturerHiddenId) { // Giá trị ẩn (ID)
                    lecturerHiddenId.value = '';
                }
            },


            async updateAttendanceFormOnClassChange(e) {
                const classId = e.target.value;
                const scheduleSelect = document.getElementById('att-schedule');
                const lecturerDisplay = document.getElementById('att-lecturer-display');
                const lecturerHiddenId = document.getElementById('att-lecturer-id');
                
                if (!scheduleSelect || !lecturerDisplay || !lecturerHiddenId) return;

                // 1. Reset Select Buổi học
                scheduleSelect.innerHTML = `<option value="">-- Vui lòng chọn Lớp học trước --</option>`;
                scheduleSelect.disabled = true;

                // 2. Hiển thị thông tin Giảng viên mặc định
                lecturerDisplay.value = `-- Đang tải... --`;
                lecturerHiddenId.value = '';

                if (classId) {
                    try {
                        const token = Helpers.getToken();
                        if (!token) throw new Error("Missing access token.");

                        // GỌI API CHI TIẾT LỚP (Get Single Class) để lấy thông tin Giảng viên và Lịch học
                        // API GET /tc/classes/{class_id}/get_infor_class
                        const response = await fetch(`/tc/classes/${classId}/get_infor_class`, {
                            method: "GET",
                            headers: { "Authorization": `Bearer ${token}` }
                        });

                        if (!response.ok) {
                            throw new Error(`Lỗi tải thông tin lớp (HTTP ${response.status})`);
                        }

                        const classInfo = await response.json(); 

                        // Trích xuất thông tin
                        const teacherName = classInfo.lecturer_name || 'Chưa phân công'; 
                        const teacherId = classInfo.lecturer_id; 
                        
                        // Kiểm tra ID là số nguyên dương hợp lệ
                        const isValidTeacherId = teacherId && !isNaN(parseInt(teacherId)) && parseInt(teacherId) > 0;

                        // Cập nhật giá trị Giảng viên hiển thị (readonly)
                        lecturerDisplay.value = teacherName;
                        lecturerHiddenId.value = isValidTeacherId ? teacherId : ''; 

                        if (isValidTeacherId) {
                            // Nếu có Giảng viên hợp lệ, tải lịch học bằng cách gọi hàm phân tích dữ liệu
                            this.updateScheduleSelect(classInfo); 
                        } else {
                            // Nếu chưa có giảng viên được gán
                            scheduleSelect.innerHTML = `<option value="">Chưa phân công GV, không thể điểm danh.</option>`;
                            scheduleSelect.disabled = true;
                            lecturerHiddenId.value = '';
                        }
                    } catch (error) {
                         console.error("Lỗi khi tải thông tin lớp:", error);
                         lecturerDisplay.value = `❌ Lỗi tải GV`;
                         scheduleSelect.innerHTML = `<option value="">❌ Lỗi tải lịch: ${error.message}</option>`;
                         scheduleSelect.disabled = true;
                         lecturerHiddenId.value = '';
                    }
                } else {
                     lecturerDisplay.value = `-- Chưa chọn Lớp học --`;
                }
            },

            updateLecturerInfo(e) {
                // Hàm rỗng (không cần xử lý logic phức tạp ở đây)
            },

            updateScheduleSelect(classInfo) {
                const scheduleSelect = document.getElementById('att-schedule');

                if (!scheduleSelect) return;

                // 1. Phân tích Schedule để lấy các buổi học
                let options = '';
                const scheduleStr = classInfo.schedule || ''; 
                
                // SỬA LỖI REGEX: Sử dụng regex để tìm tất cả các block lịch học dạng "{date: ... status: active}"
                if (scheduleStr) {
                    const simpleParts = scheduleStr.split('},{');
                    
                    simpleParts.forEach(block => {
                        
                        // Loại bỏ dấu ngoặc nhọn ở đầu/cuối của từng block
                        let part = block.replace(/^{|}$/g, '').trim();

                        // Trích xuất date và status từ mỗi phần
                        const dateMatch = part.match(/date:\s*([^ ]+)/);
                        const statusMatch = part.match(/status:\s*([^ ]+)/);

                        let fullDateTime = dateMatch ? dateMatch[1] : null;
                        let status = statusMatch ? statusMatch[1] : 'unknown';
                        let place = classInfo.place || 'N/A'; 
                        
                        // Nếu status là 'active', ta hiển thị buổi học này
                        if (fullDateTime && status.toLowerCase() === 'active') {
                            try {
                                // fullDateTime: 2025-10-22T08:00:00+00:00
                                const datePart = fullDateTime.split('T')[0];
                                const timePart = fullDateTime.split('T')[1]?.substring(0, 5) || 'N/A';
                                const displayDate = Helpers.formatDate(datePart); 

                                // Giá trị (value) là ngày (YYYY-MM-DD)
                                options += `<option value="${datePart}">${displayDate} - ${timePart} (${place})</option>`;
                            } catch (e) {
                                console.error("Lỗi parse ngày giờ:", fullDateTime, e);
                            }
                        }
                    });
                }

                // 2. Cập nhật Select Box Buổi học
                if (options === '') {
                    scheduleSelect.innerHTML = `<option value="">Không tìm thấy buổi học nào đang active.</option>`;
                    scheduleSelect.disabled = true;
                } else {
                    scheduleSelect.innerHTML = `<option value="">-- Chọn Buổi học --</option>` + options;
                    scheduleSelect.disabled = false;
                }
            },
            
async handleAttendanceSubmit(e) {
                e.preventDefault();
                const form = e.target;
                const submitBtn = form.querySelector('#submit-attendance-btn');

                const classId = form.querySelector('#att-class-id')?.value;
                const lecturerId = form.querySelector('#att-lecturer-id')?.value; // Lấy từ input ẩn
                const attendanceStatusRaw = form.querySelector('#att-status')?.value;
                const attendanceDate = form.querySelector('#att-schedule')?.value; // Lấy ngày từ Select Buổi học

                // <<< THÊM: Lấy ngày hôm nay theo múi giờ địa phương, định dạng YYYY-MM-DD
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0'); // getMonth() 0-indexed
                const day = String(today.getDate()).padStart(2, '0');
                const todayString = `${year}-${month}-${day}`;

                // <<< THÊM: So sánh ngày được chọn với ngày hôm nay
                if (attendanceDate !== todayString) {
                    return Helpers.showGeneralModal('⚠️ Lỗi Ngày Điểm Danh', 'Bạn chỉ được phép điểm danh cho ngày hôm nay. Không thể điểm danh cho ngày trong quá khứ hoặc tương lai.', true);
                }
                // <<< KẾT THÚC PHẦN THÊM

                const attendanceStatus = attendanceStatusRaw ? attendanceStatusRaw.toLowerCase() : '';

                const requestBody = {
                    lecturer_id: parseInt(lecturerId),
                    class_id: parseInt(classId),
                    attendance_status: attendanceStatus,
                    attendance_date: attendanceDate, // YYYY-MM-DD
                    notes: form.querySelector('#att-notes')?.value || '',
                };

                // Kiểm tra lại các trường bắt buộc
                if (!requestBody.attendance_date || !requestBody.lecturer_id || !requestBody.class_id || isNaN(requestBody.lecturer_id) || isNaN(requestBody.class_id)) {
                    return Helpers.showGeneralModal('⚠️ Lỗi', 'Vui lòng chọn đầy đủ Lớp học và Buổi học. Giảng viên phải được phân công cho lớp.', true);
                }

                submitBtn.disabled = true;

                console.log("Attendance Payload:", requestBody);
                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // API POST /tc/attendance/lecturer
                    const response = await fetch(`/tc/attendance/lecturer`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(errorData.detail || response.statusText);
                    }

                    const teacher = MOCK_DATA.teachers.find(t => t.user_id == requestBody.lecturer_id);
                    const className = MOCK_DATA.classes.find(c => c.id == requestBody.class_id)?.name || `ID ${requestBody.class_id}`;
                    const displayDate = Helpers.formatDate(requestBody.attendance_date);

                    Helpers.showGeneralModal('✅ Thành công', `Đã điểm danh GV **${teacher?.name || 'N/A'}** tại lớp **${className}** vào ngày **${displayDate}** là **${attendanceStatusRaw}**.`);

                    // Reset Form
                    this.renderAttendanceForm(); // Tải lại form điểm danh để reset lịch học

                } catch (error) {
                    console.error("Lỗi khi điểm danh:", error);
                    Helpers.showGeneralModal(`❌ Lỗi Điểm danh GV`, error.message, true);
                } finally {
                    submitBtn.disabled = false;
                }
            },

            renderChart(canvasId, labels, data, chartLabel) {
                const ctx = document.getElementById(canvasId)?.getContext('2d');
                if (!ctx) return;

                let existingChart = Chart.getChart(ctx);
                if (existingChart) {
                    existingChart.destroy();
                }

                // Cập nhật: Nếu vẽ biểu đồ tròn (Attendance), thay đổi type
                const chartType = (canvasId === 'attendance-pie-chart') ? 'pie' : 'bar';

                new Chart(ctx, {
                    type: chartType,
                    data: {
                        labels: labels,
                        datasets: [{
                            label: chartLabel,
                            data: data,
                            backgroundColor: (canvasId === 'attendance-pie-chart') 
                                ? ['#16a34a', '#dc2626', '#f59e0b'] // Present, Absent, Late
                                : ['rgba(74, 108, 247, 0.8)'], // Blue for bar chart
                            borderColor: (canvasId === 'attendance-pie-chart') ? '#fff' : 'rgba(74, 108, 247, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        scales: { 
                            y: { 
                                beginAtZero: true, 
                                max: (chartType === 'bar') ? 10 : undefined, // Max 10 cho điểm TB
                                display: (chartType === 'bar'), // Ẩn trục Y cho Pie Chart
                            },
                            x: {
                                display: (chartType === 'bar'), // Ẩn trục X cho Pie Chart
                            }
                        },
                        plugins: {
                            legend: {
                                display: (chartType === 'pie'), // Hiện Legend cho Pie Chart
                                position: 'right',
                            }
                        }
                    }
                });
            },

            // Hàm mở modal hiệu suất
            async openPerformanceModal(teacherUserId) {
                const teacher = MOCK_DATA.teachers.find(t => t.user_id == teacherUserId);
                if (!teacher) return;

                document.getElementById('teacher-schedule-modal-title').textContent = `Hiệu suất chi tiết: ${teacher.name} (${teacherUserId})`;
                this.DOM.modalBody.innerHTML = `<p style="text-align:center; color:gray;">Đang tải dữ liệu hiệu suất...</p>`;
                this.DOM.modalOverlay.classList.remove('hidden');

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // API GET /tc/teachers/{user_id}/performance
                    const response = await fetch(`/tc/teachers/${teacherUserId}/performance`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(`Lỗi tải dữ liệu: ${errorData.detail || response.statusText}`);
                    }

                    const data = await response.json();

                    const avgGrade = data.student_performance.average_grade_all_classes || 0;
                    const totalClasses = data.class_overview.active_classes || 0;
                    const presentDays = data.teaching_attendance.present_days || 0;
                    const absentDays = data.teaching_attendance.absent_days || 0;
                    const lateDays = data.teaching_attendance.late_days || 0;
                    const totalAttendance = presentDays + absentDays + lateDays;
                    const presentRate = totalAttendance > 0 ? ((presentDays / totalAttendance) * 100).toFixed(1) : 'N/A';

                    this.DOM.modalBody.innerHTML = `
                        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 100px;">
                            <div>
                                <h4>Thông tin cơ bản</h4>
                                <p><strong>Mã GV:</strong> ${teacher.id}</p>
                                <p><strong>Email:</strong> ${teacher.email}</p>
                                <p><strong>Trạng thái:</strong> ${Helpers.getStatusTag(teacher.status)}</p>
                            </div>
                            <div>
                                <h4>Tổng quan Chuyên môn</h4>
                                <p><strong>Số lớp đang dạy:</strong> ${totalClasses}</p>
                                <p><strong>Tỷ lệ đi dạy đúng giờ: ${presentRate}% </strong></p>
                                <p><strong>Dữ liệu điểm danh:</strong> ${presentDays} (Đúng giờ), ${absentDays} (Vắng), ${lateDays} (Trễ)</p>
                                <p><strong>Điểm trung bình (HV đánh giá):</strong> ${avgGrade.toFixed(1)}/10</p>
                            </div>
                        </div>

                        <h4 style="margin-top: 20px;">Biểu đồ Điểm trung bình</h4>
                        <div class="chart-container" style="height: 250px;">
                            <canvas id="performance-modal-chart"></canvas>
                        </div>
                    `;

                    // Vẽ biểu đồ trong modal
                    this.renderPerformanceChartInModal('performance-modal-chart', avgGrade);

                } catch (error) {
                    console.error("Lỗi khi mở modal hiệu suất:", error);
                    this.DOM.modalBody.innerHTML = `<p style="color: red; padding: 10px;">❌ Lỗi tải dữ liệu hiệu suất: ${error.message}</p>`;
                }
            },

            closeScheduleModal() {
                document.getElementById('teacher-schedule-modal-overlay').classList.add('hidden');
            },
            
            // HÀM VẼ BIỂU ĐỒ TRONG MODAL (Giữ lại)
            renderPerformanceChartInModal(canvasId, avgGrade) {
                const ctx = document.getElementById(canvasId)?.getContext('2d');
                if (!ctx) return;

                let existingChart = Chart.getChart(ctx);
                if (existingChart) {
                    existingChart.destroy();
                }

                this.performanceChartInModal = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['Điểm TB'],
                        datasets: [{
                            label: 'Điểm TB chung',
                            data: [avgGrade],
                            backgroundColor: avgGrade >= 8 ? 'rgba(22, 163, 74, 0.8)' : 'rgba(217, 119, 6, 0.8)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, max: 10, ticks: { stepSize: 1 } },
                            x: { grid: { display: false } }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            },
        },

        // ==================================================================
        // MODULE QUẢN LÝ LỚP HỌC (KHÔNG THAY ĐỔI)
        // ==================================================================
        ClassManagement: {

            currentClassId: null,
            availableStudentsData: [], // Dữ liệu học viên không trong lớp (API: students-not-in)

            initDOM() {
                this.DOM = {
                    tabs: document.querySelectorAll('.class-management-tab'),
                    listTab: document.getElementById('class-list'),
                    listTableBody: document.getElementById('class-table-body'),
                    approvalTab: document.getElementById('class-approval'),
                    approvalTableBody: document.getElementById('class-approval-table-body'),
                    search: document.getElementById('class-search-input'),
                    addBtn: document.getElementById('add-class-btn'),
                    modalOverlay: document.getElementById('class-modal-overlay'),
                    form: document.getElementById('class-form'),

                    // DOM mới cho Modal Thêm Học Viên
                    addStudentModalOverlay: document.getElementById('add-student-modal-overlay'),
                    availableStudentsBody: document.getElementById('available-students-table-body'),
                    addStudentSearch: document.getElementById('available-student-search'),
                    addStudentCount: document.getElementById('selected-student-count'),
                    executeAddStudentBtn: document.getElementById('execute-add-student-btn'),
                };
                this.bindEvents();
            },

            bindEvents() {
                this.DOM.tabs.forEach(btn => btn.addEventListener('click', (e) => this.switchTab(e.currentTarget)));
                this.DOM.search.addEventListener('input', () => this.filterClassList(this.DOM.search.value));
                this.DOM.addBtn.addEventListener('click', () => this.openModal('add'));
                this.DOM.listTableBody.addEventListener('click', (e) => this.handleListActions(e));
                this.DOM.approvalTableBody.addEventListener('click', (e) => this.handleApprovalActions(e));
                this.DOM.form.addEventListener('submit', (e) => this.handleSave(e));

                document.getElementById('close-class-modal-btn')?.addEventListener('click', () => this.closeModal());
                document.getElementById('cancel-class-modal-btn')?.addEventListener('click', () => this.closeModal());
                document.getElementById('lock-class-btn')?.addEventListener('click', () => this.handleLockClass());

                // Sự kiện cho Modal Thêm Học Viên
                this.DOM.addStudentSearch?.addEventListener('input', () => this.filterAvailableStudents(this.DOM.addStudentSearch.value));
                this.DOM.availableStudentsBody?.addEventListener('change', () => this.updateSelectedStudentCount());

                document.getElementById('close-add-student-modal-btn')?.addEventListener('click', () => this.closeAddStudentModal());
                document.getElementById('cancel-add-student-btn')?.addEventListener('click', () => this.closeAddStudentModal());

                this.DOM.executeAddStudentBtn?.addEventListener('click', () => this.addStudentToClass());
            },

            switchTab(clickedButton) {
                const targetTab = clickedButton.dataset.tab;

                this.DOM.tabs.forEach(btn => {
                    btn.classList.toggle('btn-primary', btn.dataset.tab === targetTab);
                    btn.classList.toggle('btn-secondary', btn.dataset.tab !== targetTab);
                    btn.classList.toggle('active', btn.dataset.tab === targetTab);
                });

                this.DOM.listTab.classList.toggle('active', targetTab === 'class-list');
                this.DOM.listTab.classList.toggle('hidden', targetTab !== 'class-list');
                this.DOM.approvalTab.classList.toggle('active', targetTab === 'class-approval');
                this.DOM.approvalTab.classList.toggle('hidden', targetTab !== 'class-approval');

                if (targetTab === 'class-approval') {
                    this.fetchApprovalList(true);
                } else {
                    this.fetchClassList(true);
                }
            },

            // LẤY DANH SÁCH YÊU CẦU DUYỆT (API GET)
            async fetchApprovalList(rerender = false) {
                if (rerender && this.DOM.approvalTableBody) {
                    this.DOM.approvalTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:gray;">Đang tải yêu cầu duyệt lớp...</td></tr>`;
                }

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // API GET /tc/requests/class-assignments
                    const response = await fetch(`/tc/requests/class-assignments`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
                        throw new Error(`Không thể tải yêu cầu duyệt (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                    }

                    const approvals = await response.json() || [];

                    // Ánh xạ dữ liệu API sang định dạng hiển thị
                    const formattedApprovals = approvals.map(req => ({
                        reqId: req.ticket_id,
                        className: req.title,
                        teacherId: req.submitted_by_user_id,
                        teacherName: req.submitted_by_name || 'N/A',
                        date: req.created_at ? req.created_at.split('T')[0] : 'N/A',
                        reason: req.description || 'Không có lý do',
                    })).filter(req => req.reqId);

                    MOCK_DATA.classApprovals = formattedApprovals;
                    if (rerender) this.renderApprovalList(formattedApprovals);

                } catch (error) {
                    console.error("Lỗi khi tải yêu cầu duyệt lớp:", error);
                    const errorMessage = `❌ Lỗi tải yêu cầu duyệt: ${error.message}. Vui lòng kiểm tra API server.`;
                    if (rerender && this.DOM.approvalTableBody) {
                        this.DOM.approvalTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red; padding: 10px;">${errorMessage}</td></tr>`;
                    }
                }
            },

            // RENDER DANH SÁCH YÊU CẦU DUYỆT
            renderApprovalList(approvals) {
                if (!this.DOM.approvalTableBody) return;
                const list = approvals || [];
                this.DOM.approvalTableBody.innerHTML = '';
                
                if (list.length === 0) {
                     this.DOM.approvalTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Không có yêu cầu duyệt lớp nào.</td></tr>`;
                     return;
                }
                
                list.forEach(approval => {
                    const row = this.DOM.approvalTableBody.insertRow();
                    row.innerHTML = `
                        <td>REQ${approval.reqId}</td>
                        <td>${approval.className}</td>
                        <td>${approval.teacherName}</td>
                        <td>${Helpers.formatDate(approval.date)}</td>
                        <td>${approval.reason}</td>
                        <td>
                            <button
                                class="btn btn-primary btn-sm approve-btn"
                                data-ticket-id="${approval.reqId}"
                                style="width: 80px; text-align: center; margin-left: 5px;">
                                <i class="fas fa-check"></i> Duyệt
                            </button>
                            <button
                                class="btn btn-danger btn-sm reject-btn"
                                data-ticket-id="${approval.reqId}"
                                style="width: 80px; text-align: center; margin-left: 5px;">
                                <i class="fas fa-times"></i> Từ chối
                            </button>
                        </td>
                    `;
                });
            },

            // DUYỆT YÊU CẦU (API POST)
            async approveAssignment(ticketId) {
                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    const response = await fetch(`/tc/requests/class-assignments/${ticketId}/approve`, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
                        throw new Error(`Duyệt thất bại (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                    }

                    Helpers.showGeneralModal('✅ Thành công', `Đã duyệt và phân công lớp cho yêu cầu #${ticketId}.`);
                    this.fetchApprovalList(true); 
                    this.fetchClassList(); 

                } catch (error) {
                    console.error("Lỗi khi duyệt yêu cầu:", error);
                    Helpers.showGeneralModal(`❌ Lỗi Duyệt Yêu cầu`, error.message, true);
                }
            },

            // XỬ LÝ HÀNH ĐỘNG DUYỆT/TỪ CHỐI
            handleApprovalActions(e) {
                const target = e.target.closest('button');
                if (!target) return;
                const ticketId = target.dataset.ticketId;

                // FIX: Chuyển đổi ticketId thành số để đảm bảo tính an toàn
                const numericTicketId = Number(ticketId);

                if (target.classList.contains('approve-btn')) {
                    if (confirm(`Xác nhận DUYỆT yêu cầu #${ticketId}?`)) {
                        this.approveAssignment(numericTicketId);
                    }
                } else if (target.classList.contains('reject-btn')) {
                    if (confirm(`Xác nhận TỪ CHỐI yêu cầu #${ticketId}? Yêu cầu sẽ được đóng lại.`)) {
                        this.rejectAssignment(numericTicketId);
                    }
                }
            },

            async rejectAssignment(ticketId) {
                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    const response = await fetch(`/tc/requests/class-assignments/${ticketId}/reject`, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json"
                        }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
                        throw new Error(`Từ chối thất bại (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                    }

                    Helpers.showGeneralModal('✅ Thành công', `Đã xử lý (Từ chối) yêu cầu #${ticketId}.`);

                    this.fetchApprovalList(true);
                    this.fetchClassList();

                } catch (error) {
                    console.error("Lỗi khi từ chối yêu cầu:", error);
                    Helpers.showGeneralModal(`❌ Lỗi Từ chối Yêu cầu`, error.message, true);
                }
            },

            async fetchClassList(rerender = true) {
                if (!this.DOM || !this.DOM.listTableBody) return;

                if (rerender) this.DOM.listTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:gray;">Đang tải danh sách lớp...</td></tr>`;

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    const response = await fetch(`/tc/classes/all`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
                        throw new Error(`Không thể tải lớp học (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                    }

                    const classes = await response.json() || [];

                    const formattedClasses = classes.map(cls => {
                        let datePart = 'N/A';
                        let timePart = '00:00';
                        // CẢI THIỆN: Xử lý chuỗi schedule phức tạp hoặc đơn giản
                        if (cls.schedule) {
                            // Kiểm tra xem có chứa pattern của Schedule phức tạp hay không
                           const matches = cls.schedule.match(/date:\s*([^ ]+)/g); 
                           if (matches && matches.length > 0) {
                               // Lấy ngày giờ của buổi đầu tiên
                               const firstMatch = matches[0];
                               const fullDateTime = firstMatch.replace('date: ', '');
                               datePart = fullDateTime.split('T')[0] || 'N/A';
                               timePart = fullDateTime.split('T')[1]?.substring(0, 5) || '00:00';
                           } else if (cls.schedule.includes('T')) {
                               // Xử lý chuỗi ISO DateTime đơn giản
                               const scheduleParts = cls.schedule.split('T');
                               datePart = scheduleParts[0] || 'N/A';
                               timePart = scheduleParts[1]?.substring(0, 5) || '00:00';
                           } else if (cls.schedule.length >= 10 && cls.schedule.includes('-')) {
                               // Chỉ là ngày YYYY-MM-DD
                               datePart = cls.schedule.substring(0, 10);
                           }
                        }

                        // Lấy thông tin Giảng viên từ API
                        const lecturerIdFromApi = cls.lecturer_id || '';
                        const lecturerNameFromApi = cls.lecturer_name || 'Chưa phân công';
                        
                        return {
                            id: cls.class_id || 'N/A',
                            name: cls.class_name || 'N/A',
                            // Dùng ID đã được API trả về
                            teacherId: lecturerIdFromApi, 
                            teacherName: lecturerNameFromApi,
                            students: Math.floor(Math.random() * 30), // Mock
                            startDate: datePart, // YYYY-MM-DD
                            startTime: timePart, // HH:mm
                            status: cls.status ? cls.status.toLowerCase() : 'new',
                            place: cls.place || 'N/A',
                        };
                    }).filter(cls => cls.id);

                    // CẬP NHẬT: Lưu danh sách lớp vào MOCK_DATA.classes (chỉ để dùng cho select box chung)
                    MOCK_DATA.classes = formattedClasses;
                    if (rerender) this.renderClassList(formattedClasses);

                } catch (error) {
                    console.error("Lỗi khi tải danh sách lớp:", error);
                    const errorMessage = `❌ Lỗi tải lớp học: ${error.message}. Vui lòng kiểm tra API server.`;
                    if (rerender && this.DOM.listTableBody) {
                        this.DOM.listTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red; padding: 10px;">${errorMessage}</td></tr>`;
                    }
                }
            },

            renderClassList(classes) {
                if (!this.DOM || !this.DOM.listTableBody) return;

                this.DOM.listTableBody.innerHTML = '';

                if (classes.length === 0) {
                    this.DOM.listTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Không có lớp học nào.</td></tr>`;
                    return;
                }

                classes.forEach(cls => {
                    const row = this.DOM.listTableBody.insertRow(); 

                    // Cấu trúc bảng (7 cột): Mã | Tên | GV | Số HV | Ngày bắt đầu | Trạng thái | Hành động
                    row.insertCell(0).innerHTML = cls.id;
                    row.insertCell(1).innerHTML = cls.name;
                    row.insertCell(2).innerHTML = cls.teacherName;
                    row.insertCell(3).innerHTML = `--`;
                    row.insertCell(4).innerHTML = Helpers.formatDate(cls.startDate);
                    row.insertCell(5).innerHTML = Helpers.getStatusTag(cls.status);

                    // CỘT HÀNH ĐỘNG: Thêm nút Sửa và Thêm Học Sinh
                    row.insertCell(6).innerHTML = `
                        <button class="btn btn-secondary btn-sm edit-btn" data-id="${cls.id}"><i class="fas fa-edit"></i> Sửa</button>
                        <button class="btn btn-primary btn-sm add-student-btn ml-2" data-id="${cls.id}" data-name="${cls.name}">
                            <i class="fas fa-user-plus"></i> Thêm HV
                        </button>
                    `;
                });

                TCDashboardApp.loadDashboardSummary();
            },

            filterClassList(searchTerm) {
                const lowerCaseTerm = searchTerm.toLowerCase();
                const filtered = MOCK_DATA.classes.filter(cls =>
                    String(cls.id).toLowerCase().includes(lowerCaseTerm) ||
                    cls.name.toLowerCase().includes(lowerCaseTerm) ||
                    cls.teacherName.toLowerCase().includes(lowerCaseTerm)
                );
                this.renderClassList(filtered);
            },

            handleLockClass() {
                const classId = this.currentClassId;
                if (classId === null) return;

                if (confirm(`Bạn có chắc chắn muốn KHÓA lớp ${classId} không?`)) {
                    // Cần tích hợp API khóa lớp ở đây
                    const index = MOCK_DATA.classes.findIndex(c => String(c.id) === String(classId));
                    if (index !== -1) {
                        MOCK_DATA.classes[index].status = 'locked';
                        Helpers.showGeneralModal('✅ Thành công', `Đã khóa lớp ${classId} thành công (Mô phỏng).`);
                        this.closeModal();
                        this.fetchClassList();
                    }
                }
            },

            openModal(mode, classData = {}) {
                document.getElementById('class-modal-title').textContent = mode === 'add' ? 'Tạo Lớp học mới' : `Sửa Lớp học ${classData.id}`;
                this.DOM.form.reset();
                this.currentClassId = null;

                // FIX: Sử dụng ID 'teacher-select' như đã sửa
                const teacherSelect = document.getElementById('teacher-select'); 
                if (teacherSelect) {
                    teacherSelect.innerHTML = Helpers.getTeachersAsOptions(classData.teacherId);
                } else {
                    console.error("LỖI DOM: Không tìm thấy phần tử 'teacher-select' trong modal Class.");
                }

                document.getElementById('lock-class-btn').classList.add('hidden');
                document.getElementById('class-place').value = classData.place || '';
                
                // Cập nhật các trường
                const classNameInput = document.getElementById('class-name');
                const classStatusSelect = document.getElementById('class-status');
                const startDateInput = document.getElementById('class-start-date');
                const startTimeInput = document.getElementById('class-start-time');


                if (mode === 'edit') {
                    this.currentClassId = classData.id;
                    classNameInput.value = classData.name;
                    classStatusSelect.value = classData.status;
                    startDateInput.value = classData.startDate;
                    startTimeInput.value = classData.startTime;
                    classStatusSelect.disabled = false;
                } else {
                    classStatusSelect.disabled = true;
                    // classStatusSelect.value = 'Chờ (Pending)';
                    startDateInput.valueAsDate = new Date();
                    startTimeInput.value = '07:00';
                }

                this.DOM.modalOverlay.classList.remove('hidden');
                document.body.classList.add('modal-open'); 
            },

            closeModal() {
                this.DOM.modalOverlay.classList.add('hidden');
                document.body.classList.remove('modal-open'); 
            },

            handleListActions(e) {
                const btn = e.target.closest('button');
                if (!btn) return;
                const classId = btn.dataset.id;
                const className = btn.dataset.name;

                if (btn.classList.contains('edit-btn')) {
                    const classData = MOCK_DATA.classes.find(c => String(c.id) === String(classId));
                    if (classData) this.openModal('edit', classData);
                } else if (btn.classList.contains('add-student-btn')) {
                    // Xử lý nút Thêm Học Sinh
                    this.openAddStudentModal(classId, className);
                }
            },

            async handleSave(e) {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(this.DOM.form).entries());

                const isEditMode = !!this.currentClassId;
                const saveBtn = document.getElementById('save-class-btn');

                if (!data.startDate || !data.startTime) {
                    return Helpers.showGeneralModal('⚠️ Lỗi', 'Vui lòng chọn Ngày và Giờ bắt đầu.', true);
                }

                const lecturerId = parseInt(data.teacherId) || 0;

                const datePart = data.startDate; // YYYY-MM-DD
                const timePart = data.startTime; // HH:mm
                const scheduleISO = `${datePart}T${timePart}:00`;

                const requestBody = {
                    class_name: data.name,
                    schedule: scheduleISO,
                    status: data.status,
                    lecturer_id: lecturerId === 0 ? null : lecturerId,
                    place: data.place
                };

                saveBtn.disabled = true;

                if (isEditMode) {
                    // XỬ LÝ SỬA LỚP (GỌI API PUT)
                    try {
                        const token = Helpers.getToken();
                        if (!token) throw new Error("Missing access token.");

                        const classId = this.currentClassId;
                        const currentUserId = Helpers.TC_ID;

                        const url = `/tc/classes/${classId}/update?current_user_id=${currentUserId}`;

                        const response = await fetch(url, {
                            method: "PUT",
                            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                            body: JSON.stringify(requestBody)
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                            let errorMessage = errorData.detail || response.statusText;
                            if (errorData.detail && Array.isArray(errorData.detail)) {
                                errorMessage = errorData.detail.map(err => `[${err.loc ? err.loc[err.loc.length - 1] : 'Field'}]: ${err.msg}`).join('\n');
                            } else if (typeof errorData.detail === 'string') {
                                errorMessage = errorData.detail;
                            }
                            throw new Error(`(${response.status}) ${errorMessage}`);
                        }

                        Helpers.showGeneralModal('✅ Thành công', `Cập nhật lớp ${classId} thành công!`);
                        this.closeModal();
                        this.fetchClassList(true);

                    } catch (error) {
                        console.error("Lỗi khi cập nhật lớp:", error);
                        Helpers.showGeneralModal(`❌ Lỗi Cập nhật Lớp`, error.message, true);
                    } finally {
                        saveBtn.disabled = false;
                    }
                } else {
                    // XỬ LÝ TẠO LỚP (GỌI API POST)
                    try {
                        const token = Helpers.getToken();
                        if (!token) throw new Error("Missing access token.");

                        const currentUserIdParam = new URLSearchParams({
                            current_user_id: Helpers.TC_ID
                        });

                        const url = `/tc/classes/create?${currentUserIdParam.toString()}`;

                        const response = await fetch(url, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                            body: JSON.stringify(requestBody)
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                            let errorMessage = errorData.detail || response.statusText;
                            if (errorData.detail && Array.isArray(errorData.detail)) {
                                errorMessage = errorData.detail.map(err => `[${err.loc ? err.loc[err.loc.length - 1] : 'Field'}]: ${err.msg}`).join('\n');
                            } else if (typeof errorData.detail === 'string') {
                                errorMessage = errorData.detail;
                            }
                            throw new Error(`(${response.status}) ${errorMessage}`);
                        }

                        const createdData = await response.json();
                        // FIX: Bổ sung logic xử lý thành công cho tạo lớp
                        Helpers.showGeneralModal('✅ Thành công', `Tạo lớp "${createdData.class_name || 'mới'}" thành công!`);
                        this.closeModal();
                        this.fetchClassList(true);

                    } catch (error) {
                        console.error("Lỗi khi tạo lớp học:", error);
                        Helpers.showGeneralModal(`❌ Lỗi tạo lớp`, error.message, true);
                    } finally {
                        saveBtn.disabled = false;
                    }
                }
            },

            // ===============================================
            // HÀM QUẢN LÝ THÊM HỌC VIÊN
            // ===============================================

            async openAddStudentModal(classId, className) {
                const modalTitle = document.getElementById('add-student-modal-title');
                const classInfo = document.getElementById('add-student-class-info');

                this.currentClassId = classId; // Lưu ID lớp hiện tại

                if (!this.DOM.addStudentModalOverlay) return;

                // FIX: Đảm bảo classInfo có tồn tại
                if (classInfo) {
                    modalTitle.textContent = `Thêm Học Viên vào Lớp ${classId}`;
                    classInfo.textContent = `${className} (Mã: ${classId})`;
                } else {
                    modalTitle.textContent = `Thêm Học Viên vào Lớp ${classId}`;
                }


                this.DOM.availableStudentsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">Đang tải danh sách học viên...</td></tr>`;
                this.DOM.addStudentModalOverlay.classList.remove('hidden');
                document.body.classList.add('modal-open');

                // Vô hiệu hóa nút thực hiện cho đến khi có dữ liệu/chọn
                this.DOM.executeAddStudentBtn.disabled = true;
                this.DOM.addStudentCount.textContent = '0';
                this.DOM.addStudentSearch.value = ''; // Reset thanh tìm kiếm
                this.availableStudentsData = []; // Reset dữ liệu

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // GỌI API GET /tc/classes/{class_id}/students-not-in
                    const response = await fetch(`/tc/classes/${classId}/students-not-in`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(`Không thể tải HV: ${errorData.detail || response.statusText}`);
                    }

                    this.availableStudentsData = await response.json() || [];
                    this.renderAvailableStudents(this.availableStudentsData);

                } catch (error) {
                    console.error("Lỗi khi tải danh sách học viên:", error);
                    this.DOM.availableStudentsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red; padding: 20px;">❌ Lỗi tải danh sách: ${error.message}</td></tr>`;
                }
            },

            closeAddStudentModal() {
                this.DOM.addStudentModalOverlay?.classList.add('hidden');
                document.body.classList.remove('modal-open');
                this.availableStudentsData = []; // Dọn dẹp dữ liệu
                this.currentClassId = null;
            },

            renderAvailableStudents(students) {
                if (!this.DOM.availableStudentsBody) return;
                this.DOM.availableStudentsBody.innerHTML = '';

                if (students.length === 0) {
                    this.DOM.availableStudentsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">Không có học viên nào có thể thêm vào lớp này.</td></tr>`;
                    this.updateSelectedStudentCount();
                    return;
                }

                students.forEach(student => {
                    const row = this.DOM.availableStudentsBody.insertRow();
                    row.innerHTML = `
                        <td>${student.student_id}</td>
                        <td>${student.name || 'N/A'}</td>
                        <td>${student.email || 'N/A'}</td>
                        <td style="text-align: center;">
                            <input type="checkbox" class="add-student-checkbox" data-id="${student.student_id}">
                        </td>
                    `;
                });
                this.updateSelectedStudentCount();
            },

            updateSelectedStudentCount() {
                const count = this.DOM.availableStudentsBody?.querySelectorAll('.add-student-checkbox:checked').length || 0;
                this.DOM.addStudentCount.textContent = count;
                this.DOM.executeAddStudentBtn.disabled = count === 0;
            },

            filterAvailableStudents(searchTerm) {
                const lowerCaseTerm = searchTerm.toLowerCase();
                // Lọc trên dữ liệu gốc (availableStudentsData)
                const filtered = this.availableStudentsData.filter(student =>
                    String(student.student_id).toLowerCase().includes(lowerCaseTerm) ||
                    (student.name || '').toLowerCase().includes(lowerCaseTerm) ||
                    (student.email || '').toLowerCase().includes(lowerCaseTerm)
                );
                // Render kết quả đã lọc
                this.renderAvailableStudents(filtered);
            },

            async addStudentToClass() {
                const checkedBoxes = this.DOM.availableStudentsBody?.querySelectorAll('.add-student-checkbox:checked') || [];
                const studentIds = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.id)).filter(id => !isNaN(id));
                const classId = this.currentClassId;

                if (studentIds.length === 0 || !classId) return;

                const executeBtn = this.DOM.executeAddStudentBtn;
                executeBtn.disabled = true;

                let successCount = 0;
                let failureCount = 0;

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // SỬA: LẶP QUA TỪNG STUDENT ID VÀ GỌI API CHO TỪNG ID
                    for (const studentId of studentIds) {

                        // Cấu trúc request body khớp với yêu cầu của API: { "student_id": ID }
                        const requestBody = { student_id: studentId };

                        const response = await fetch(`/tc/classes/${classId}/students`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                            body: JSON.stringify(requestBody)
                        });

                        if (response.ok) {
                            successCount++;
                        } else {
                            failureCount++;
                            const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                            console.error(`Lỗi khi thêm HV ID ${studentId}:`, errorData.detail || response.statusText);
                        }
                    }

                    // Hiển thị thông báo tổng hợp
                    let finalMessage = `Thành công: **${successCount}** học viên. `;
                    if (failureCount > 0) {
                        finalMessage += `Thất bại: **${failureCount}** học viên. Vui lòng kiểm tra console để biết chi tiết lỗi.`;
                    }

                    Helpers.showGeneralModal('✅ Thêm Học Viên Hoàn Tất', finalMessage);
                    this.closeAddStudentModal();
                    this.fetchClassList(true);

                } catch (error) {
                    console.error("Lỗi khi thêm học viên (ngoại lệ):", error);
                    Helpers.showGeneralModal(`❌ Lỗi Thêm Học Viên`, `Lỗi kết nối hoặc token: ${error.message}`, true);
                } finally {
                    executeBtn.disabled = false;
                }
            }
        },

        // ==================================================================
        // MODULE QUẢN LÝ TICKET (KHÔNG THAY ĐỔI)
        // ==================================================================
        TicketManagement: {
            initDOM() {
                this.DOM = {
                    form: document.querySelector('#ticket-management .form-box'),
                    tableBody: document.getElementById('tc-ticket-table-body'),
                    submitBtn: document.getElementById('tc-submit-ticket-btn'),
                };
                this.bindEvents();
                this.renderTickets(MOCK_DATA.tickets);
            },

            bindEvents() {
                this.DOM.submitBtn?.addEventListener('click', (e) => this.handleSubmit(e));
                this.DOM.tableBody?.addEventListener('click', (e) => this.handleTableActions(e));
            },

            async fetchTickets() {
                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    const response = await fetch(`/tc/tickets/all`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (response.status === 404) {
                        MOCK_DATA.tickets = [];
                    } else if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(`Không thể tải Ticket: ${errorData.detail || response.statusText}`);
                    } else {
                        MOCK_DATA.tickets = await response.json() || [];
                        this.renderTickets(MOCK_DATA.tickets);
                    }
                    TCDashboardApp.loadDashboardSummary();

                } catch (error) {
                    console.error("Lỗi khi tải Ticket:", error);
                }
            },

            async resolveTicket(ticketId) {
                // 1. Tìm ticket để lấy ID người gửi
                const ticket = MOCK_DATA.tickets.find(t => String(t.ticket_id) === String(ticketId));

                if (!ticket) {
                    return Helpers.showGeneralModal('⚠️ Lỗi', `Không tìm thấy Ticket #${ticketId}.`, true);
                }

                // KIỂM TRA QUAN TRỌNG: Ngăn TC tự giải quyết ticket của mình
                if (String(ticket.submitted_by) === String(tcId)) {
                    return Helpers.showGeneralModal(
                        '🚫 Cảnh báo',
                        `Bạn không được phép tự giải quyết Ticket #${ticketId} do chính mình gửi lên. Vui lòng để manager xử lý.`,
                        true
                    );
                }

                if (!confirm(`Bạn có chắc chắn muốn GIẢI QUYẾT Ticket #${ticketId} không?`)) return;

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    // API để cập nhật trạng thái Ticket thành resolved
                    const response = await fetch(`/tc/tickets/${ticketId}/status`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                        body: JSON.stringify({ status: "resolved" })
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(`Cập nhật trạng thái thất bại: ${errorData.detail || response.statusText}`);
                    }

                    Helpers.showGeneralModal('✅ Thành công', `Đã đánh dấu Ticket #${ticketId} là **Đã giải quyết**!`);
                    await this.fetchTickets();
                    this.renderTickets(MOCK_DATA.tickets);

                } catch (error) {
                    console.error("Lỗi khi giải quyết Ticket:", error);
                    Helpers.showGeneralModal(`❌ Lỗi Giải quyết Ticket`, error.message, true);
                }
            },

            renderTickets(tickets) {
                if (!this.DOM || !this.DOM.tableBody) return;
                this.DOM.tableBody.innerHTML = '';

                const totalColumns = 5;

                if (tickets.length === 0) {
                    this.DOM.tableBody.innerHTML = `<tr><td colspan="${totalColumns}" style="text-align:center; font-style: italic;">Hiện không có Ticket nào.</td></tr>`;
                    TCDashboardApp.loadDashboardSummary();
                    return;
                }

                const pendingTickets = tickets.filter(t => t.status.toLowerCase() === 'open' || t.status.toLowerCase() === 'pending' || t.status.toLowerCase() === 'resolved');

                pendingTickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                this.DOM.tableBody.innerHTML = pendingTickets.map(ticket => {
                    const isResolved = ticket.status && (ticket.status.toLowerCase() === 'resolved' || ticket.status.toLowerCase() === 'closed');

                    // Cấu trúc: Tiêu đề | Nội dung | Trạng thái | Ngày tạo | Hành động
                    return `
                        <tr>
                            <td>${ticket.title || 'N/A'}</td>
                            <td>${ticket.description || 'N/A'}</td>
                            <td>${Helpers.getStatusTag(ticket.status || 'N/A')}</td>
                            <td>${Helpers.formatDate(ticket.created_at || 'N/A')}</td>
                            <td>
                                ${!isResolved ?
                                    `<button class="btn btn-success btn-sm resolve-btn ml-2" data-id="${ticket.ticket_id}"><i class="fas fa-check"></i> Giải quyết</button>` :
                                    `<button class="btn btn-secondary btn-sm" disabled><i class="fas fa-check-double"></i> Đã xử lý</button>`
                                }
                            </td>
                        </tr>
                    `;
                }).join('');

                TCDashboardApp.loadDashboardSummary();
            },

            handleTableActions(e) {
                const resolveBtn = e.target.closest('.resolve-btn');

                if (resolveBtn) {
                    const ticketId = resolveBtn.dataset.id;
                    this.resolveTicket(ticketId);
                }
                // Logic cho viewBtn đã bị bỏ qua vì không có trong HTML
            },

            async handleSubmit(e) {
                e.preventDefault();
                const title = document.getElementById('tc-ticket-title').value.trim();
                const description = document.getElementById('tc-ticket-description').value.trim();
                // const assignedTo = document.getElementById('ticket-assigned-to')?.value; // Giả sử tồn tại

                if (!title || !description) {
                    return Helpers.showGeneralModal('⚠️ Lỗi', 'Vui lòng nhập Tiêu đề, Nội dung chi tiết và Gán cho người xử lý.', true);
                }

                const requestBody = {
                    title: title,
                    created_at: new Date().toISOString(),
                    description: description,
                    issue_type: 'TC Issue',
                    status: 'open',
                    user_assigned: 1,
                    user_id: Helpers.TC_ID
                };

                this.DOM.submitBtn.disabled = true;

                try {
                    const token = Helpers.getToken();
                    if (!token) throw new Error("Missing access token.");

                    const response = await fetch(`/auth/ticket/submit`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `HTTP Error ${response.status}` }));
                        throw new Error(errorData.detail || response.statusText);
                    }

                    Helpers.showGeneralModal('✅ Thành công', `Tạo Ticket "${title}" thành công!`);
                    document.getElementById('tc-ticket-title').value = '';
                    document.getElementById('tc-ticket-description').value = '';
                    await this.fetchTickets();
                    this.renderTickets(MOCK_DATA.tickets);

                } catch (error) {
                    console.error("Lỗi khi tạo Ticket:", error);
                    Helpers.showGeneralModal(`❌ Lỗi tạo Ticket`, error.message, true);
                } finally {
                    this.DOM.submitBtn.disabled = false;
                }
            }
        }
    };

    // Khởi tạo ứng dụng
    TCDashboardApp.init();
});