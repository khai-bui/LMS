document.addEventListener('DOMContentLoaded', async () => {

    // --- Khởi tạo Biến Toàn cục (Global/Module Scope) ---
    const user = JSON.parse(sessionStorage.getItem("loggedInUser"));
    const token = sessionStorage.getItem("accessToken");
    const userId = user?.id ?? user?.user_id;
    const lecId = parseInt(userId);

    if (!user || !token || isNaN(lecId)) {
        alert("Phiên đăng nhập hết hạn hoặc không hợp lệ, vui lòng đăng nhập lại!");
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
    // Cập nhật tên giảng viên trong Header
    const userNameSpan = document.getElementById('user-name');
    if (userNameSpan) {
        userNameSpan.innerHTML = `${user.fullName || user.user_name || user.name || user.username || 'User'} (ID: <span id="lec-id-display">${lecId}</span>)`;
    }

    const state = {
        workinghour: 0,
        tickets: [],
        pending_tickets: 0,
        currentWeekOffset: 0, 
    };

    let CURRENT_CLASS_STUDENTS = []; 
    let CURRENT_CLASS_SESSIONS = []; 

    // --- DỮ LIỆU MẪU (MOCK DATA) ---
    const MOCK_DATA = {
        dashboardSummary: { monthlyHoursCompleted: 0, currentClassesCount: 0, pendingTicketsCount: 0 },
        myClasses: [],
        availableClasses: [],
        events: [],
    };

    // 🚩 FETCH WORKING HOUR
    try {
        const respone = await fetch(`/lec/working-hours?user_id=${lecId}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (!respone.ok) {
            console.warn(`Khong load duoc working hour: ${respone.status}`);
        } else {
            const workinghour = await respone.json();
            state.workinghour = workinghour.total_hours;
        }
    } catch (error) {
        console.error("Lỗi khi load giờ làm việc:", error);
    }

    // ==================================================================
    // --- LECTURER DASHBOARD CORE APP ---
    // ==================================================================
    
    window.LecturerDashboardApp = {
        state: state, 

        // --- HÀM HỖ TRỢ ---
        formatDate(dateString) {
            if (!dateString || dateString === 'N/A') return 'N/A';
            try {
                // Xử lý chuỗi YYYY-MM-DD
                let dateToParse = dateString;
                if (dateString.length === 10 && dateString.includes('-')) {
                     dateToParse = dateString + 'T00:00:00'; 
                }
                const date = new Date(dateToParse);
                if (isNaN(date.getTime())) { 
                    return dateString.split('T')[0] || 'N/A'; 
                }
                return date.toLocaleDateString('vi-VN');
            } catch (e) {
                return dateString.split('T')[0] || 'N/A';
            }
        },

        formatFullDate(date) {
            if (!(date instanceof Date)) {
                date = new Date(date);
            }
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        },

        checkIsToday(dateString) {
            const date = new Date(dateString);
            const today = new Date();
            date.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            return date.getTime() === today.getTime();
        },

        checkIsPast(dateString) {
            const date = new Date(dateString);
            const today = new Date();
            date.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            return date.getTime() < today.getTime();
        },

        getStatusTag(status) {
            let text = '', style = '';
            const lowerStatus = String(status).toLowerCase();
            switch (lowerStatus) {
                case 'pending': case 'open':
                    text = 'Chờ xử lý'; style = 'background-color: #fef3c7; color: #d97706;'; break;
                case 'in_progress':
                    text = 'Đang xử lý'; style = 'background-color: #e0f2f1; color: #0f766e;'; break;
                case 'resolved': case 'closed':
                    text = 'Đã xử lý'; style = 'background-color: #dcfce7; color: #16a34a;'; break;
                case 'present':
                    text = 'Có mặt'; style = 'background-color: #dcfce7; color: #16a34a;'; break;
                case 'absent':
                    text = 'Vắng'; style = 'background-color: #fee2e2; color: #dc2626;'; break;
                case 'late':
                    text = 'Trễ'; style = 'background-color: #fff8b3; color: #856404;'; break;
                case 'assignment':
                    text = 'Bài tập'; style = 'background-color: #e0f7fa; color: #00796b;'; break;
                case 'material':
                    text = 'Tài liệu'; style = 'background-color: #f3e5f5; color: #6a1b9a;'; break;
                case 'submitted':
                    text = 'Đã nộp'; style = 'background-color: #dbeafe; color: #1e40af;'; break;
                case 'graded':
                    text = 'Đã chấm'; style = 'background-color: #dcfce7; color: #16a34a;'; break;
                case 'not_submitted':
                    text = 'Chưa nộp'; style = 'background-color: #f1f5f9; color: #64748b;'; break;
                case 'active':
                    text = 'Đang dạy'; style = 'background-color: #dbeafe; color: #1e40af;'; break;
                case 'deactived':
                    text = 'GV Báo Vắng'; style = 'background-color: #fecaca; color: #dc2626;'; break; // Đỏ nhạt
                case 'available':
                    text = 'Có thể nhận'; style = 'background-color: #fef3c7; color: #d97706;'; break;
                default: text = 'Không rõ'; style = 'background-color: #f1f5f9; color: #64748b;';
            }
            return `<span class="status active" style="padding: 2px 8px; border-radius: 999px; font-size: 0.85em; display: inline-block; ${style}">${text}</span>`;
        },

        loadDashboardSummary() {
            if (document.getElementById('monthly-hours')) {
                document.getElementById('monthly-hours').textContent = state.workinghour + ' giờ';
            }
            if (document.getElementById('current-classes-count')) {
                document.getElementById('current-classes-count').textContent = MOCK_DATA.myClasses.length;
            }
            if (document.getElementById('pending-tickets-count')) {
                document.getElementById('pending-tickets-count').textContent = state.pending_tickets;
            }
        },

        // ✅ SỬA LỖI RACE CONDITION: Sắp xếp lại hàm init()
        async init() {
            // 1. Tải Ticket
            await this.TicketManagement.fetchTicketData();
            
            // 2. Tải Lịch & Lớp học TRƯỚC TIÊN và đợi
            await this.Calendar.init(this); 
            
            // 3. Đồng bộ hóa dữ liệu lớp học từ Calendar
            MOCK_DATA.myClasses = this.Calendar.data.myClasses;

            // 4. Tải các module còn lại
            this.loadDashboardSummary();
            this.DashboardUI.init(this);
            this.MyClasses.init(this); 
            this.TicketManagement.init(this);
        },

        // ==================================================================
        // MODULE 1: Dashboard UI (Tabs, Announcements)
        // ==================================================================
        DashboardUI: {
            parent: null,
            init(parent) {
                this.parent = parent;
                this.DOM = {
                    tabs: document.querySelectorAll('.dashboard-tab'),
                    scheduleView: document.getElementById('schedule-view'),
                    announcementsView: document.getElementById('announcements-view'),
                    announcementsList: document.getElementById('announcements-list'),
                };
                if (this.DOM.tabs.length === 0) return;
                this.bindEvents();
                this.loadAnnouncements();
            },

            async loadAnnouncements() {
                const announcementsList = this.DOM.announcementsList;
                if (!announcementsList) return;

                announcementsList.innerHTML = `<p style="padding: 15px; text-align: center; color: gray;">Đang tải thông báo...</p>`;

                try {
                    const response = await fetch("/notify/notifications", {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        throw new Error(`Không thể tải thông báo (HTTP ${response.status})`);
                    }

                    const notifications = await response.json();

                    if (!notifications || notifications.length === 0) {
                        announcementsList.innerHTML = `<p style="padding: 15px; text-align: center;">Hiện chưa có thông báo nào.</p>`;
                        return;
                    }

                    notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                    announcementsList.innerHTML = '';
                    notifications.forEach(noti => {
                        const dateObj = new Date(noti.created_at);
                        const formattedDate = `${dateObj.toLocaleDateString('vi-VN')} ${dateObj.toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit'
                        })}`;

                        const announcementHTML = `
                            <div class="card announcement-card"
                                style="margin-bottom: 15px; border-left: 5px solid #1e40af; padding: 10px 15px;">
                                <h4>${noti.title}</h4>
                                <p style="margin-bottom: 5px;">${noti.message}</p>
                                <small style="color: #6c757d;">
                                    <i class="fas fa-clock"></i> ${formattedDate}
                                </small>
                            </div>
                        `;
                        announcementsList.insertAdjacentHTML('beforeend', announcementHTML);
                    });

                } catch (error) {
                    console.error("Lỗi khi tải thông báo:", error);
                    announcementsList.innerHTML = `
                        <p style="padding: 15px; text-align: center; color: red;">
                            Lỗi khi tải thông báo. Vui lòng thử lại sau.
                        </p>
                    `;
                }
            },

            switchTab(targetTab) {
                this.DOM.tabs.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.tab === targetTab);
                });

                this.DOM.scheduleView.classList.toggle('active', targetTab === 'schedule-view');
                this.DOM.scheduleView.classList.toggle('hidden', targetTab !== 'schedule-view');

                this.DOM.announcementsView.classList.toggle('active', targetTab === 'announcements-view');
                this.DOM.announcementsView.classList.toggle('hidden', targetTab !== 'announcements-view');

                if (targetTab === 'schedule-view') {
                    this.parent.Calendar.render();
                }
            },

            bindEvents() {
                this.DOM.tabs.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        this.switchTab(e.currentTarget.dataset.tab);
                    });
                });
            }
        },

        // ==================================================================
        // MODULE 2: Calendar (Schedule)
        // ==================================================================
        Calendar: {
            parent: null,
            isRegistrationMode: false,
            data: {
                events: [],
                availableClasses: [],
                classSessions: {},
                myClasses: [] 
            },

            async init(parent) {
                this.parent = parent;
                this.DOM = {
                    scheduleBody: document.querySelector('.schedule-body'),
                    weekDisplay: document.getElementById('week-display'),
                    prevWeekBtn: document.getElementById('prev-week'),
                    nextWeekBtn: document.getElementById('next-week'),
                    toggleRegistrationBtn: document.getElementById('toggle-registration-btn'),

                    confirmOverlay: document.getElementById('confirm-modal-overlay'),
                    confirmTitle: document.getElementById('confirm-modal-title'),
                    confirmMessage: document.getElementById('confirm-modal-message'),
                    executeBtn: document.getElementById('execute-confirm-btn'),
                    cancelBtn: document.getElementById('cancel-confirm-btn'),
                    closeBtn: document.getElementById('close-confirm-modal-btn'),

                    dayHeaders: document.querySelectorAll('.schedule-header div[data-day-header]'),
                };

                if (!this.DOM.scheduleBody) return;
                this.bindEvents();
                await this.loadData();
                this.render();
            },

            closeClaimModal() {
                this.DOM.confirmOverlay.classList.add('hidden');
            },

            bindEvents() {
                this.DOM.prevWeekBtn.addEventListener('click', () => {
                    this.parent.state.currentWeekOffset--;
                    this.render();
                });
                this.DOM.nextWeekBtn.addEventListener('click', () => {
                    this.parent.state.currentWeekOffset++;
                    this.render();
                });
                this.DOM.toggleRegistrationBtn.addEventListener('click', () => this.toggleRegistrationMode());

                this.DOM.cancelBtn?.addEventListener('click', () => this.closeClaimModal());
                this.DOM.closeBtn?.addEventListener('click', () => this.closeClaimModal());
                this.DOM.confirmOverlay?.addEventListener('click', (e) => {
                    if (e.target === this.DOM.confirmOverlay) {
                        this.closeClaimModal();
                    }
                });
            },

            // ✨ FIXED: Sử dụng regex để tách các buổi học dựa trên cấu trúc JSON/chuỗi.
            parseSchedule(scheduleString, classId, className, place) {
                if (!scheduleString) return [];
                
                // Regex để tìm tất cả các block {date: ... status: ...}
                // Chuẩn hóa chuỗi bằng cách thêm dấu phẩy nếu thiếu giữa các khối.
                let normalizedSchedule = scheduleString.trim();
                if (!normalizedSchedule.startsWith('{')) {
                    normalizedSchedule = `{${normalizedSchedule}`;
                }
                if (!normalizedSchedule.endsWith('}')) {
                     normalizedSchedule = `${normalizedSchedule}}`;
                }
                // Đảm bảo dấu phẩy tồn tại giữa các khối đóng/mở
                normalizedSchedule = normalizedSchedule.replace(/}\s*\{/g, '},{');
                
                const sessionStrings = normalizedSchedule.match(/\{date:\s*([^}]+)\}/g) || [];
                const sessions = [];
                // Regex chi tiết để lấy date và status bên trong mỗi block
                const innerRegex = /date:\s*([^ ]+)\s*status:\s*([^}]+)/;
                
                sessionStrings.forEach((str, index) => {
                    const match = str.match(innerRegex);
                    
                    if (match && match.length >= 3) {
                         let datePart = match[1].trim(); 
                         const statusPart = match[2].trim();

                         // 1. CHUẨN HÓA CHUỖI ĐẦU VÀO
                         // Loại bỏ múi giờ (+00:00) hoặc (-05:00) để giữ giờ Gốc (08:00)
                         datePart = datePart.replace(/(\+\d{2}:\d{2})$|Z$/i, ''); 
                         
                         // Thay thế khoảng trắng bằng 'T' nếu cần (nếu API trả về YYYY-MM-DD HH:MM:SS)
                         datePart = datePart.replace(' ', 'T'); 

                         // 2. TÁCH THÀNH PHẦN NGÀY/GIỜ
                         const [dateOnly, timeWithSecs] = datePart.split('T');
                         // Cần kiểm tra timeWithSecs để tránh lỗi split
                         if (!timeWithSecs) {
                             console.warn(`[Lịch] Không tìm thấy giờ trong chuỗi: ${datePart}`);
                             return;
                         }

                         const [year, month, day] = dateOnly.split('-');
                         const [hour, minute, second] = (timeWithSecs || '00:00:00').split(':');
                         
                         // 3. TẠO DATE OBJECT BẰNG THAM SỐ (BUỘC DÙNG GIỜ LOCAL)
                         const sessionDate = new Date(year, month - 1, day, hour, minute, second || 0);

                         if (isNaN(sessionDate.getTime())) {
                             console.warn(`[Lịch] Không thể phân tích ngày: ${datePart}`);
                             return; 
                         }
                         
                         const dateOnlyIso = sessionDate.toISOString().split("T")[0];
                         const startTime = this.formatTime(sessionDate);
                         const endTime = this.addHours(sessionDate, 2); 

                         sessions.push({
                             id: `${classId}_${index + 1}`,
                             classId: classId,
                             className: className,
                             date: dateOnlyIso, 
                             startTime: startTime,
                             endTime: endTime,
                             status: statusPart.toLowerCase(), 
                             sessionNumber: index + 1,
                             place: place
                         });
                    }
                });
                return sessions;
            },
            
            // ✅ CẬP NHẬT: loadData dùng hàm parseSchedule mới
            async loadData() {
                this.data.classSessions = {};
                try {
                    const user = JSON.parse(sessionStorage.getItem("loggedInUser"));
                    const token = sessionStorage.getItem("accessToken");
                    if (!user || !token) {
                        return;
                    }

                    const [myClassRes, availableRes] = await Promise.all([
                        fetch(`/lec/schedule?user_id=${userId}`, {
                            headers: { "Authorization": `Bearer ${token}` }
                        }),
                        fetch(`/lec/classes/unassigned`, {
                            headers: { "Authorization": `Bearer ${token}` }
                        })
                    ]);

                    if (!myClassRes.ok || !availableRes.ok)
                        throw new Error("Không thể tải dữ liệu lớp học.");

                    const classes = await myClassRes.json();
                    const availableClasses = await availableRes.json();

                    // Lưu trữ danh sách lớp thô (Dùng để đồng bộ với MOCK_DATA.myClasses)
                    this.data.myClasses = classes;

                    // Tạo event từ mỗi buổi học được định nghĩa trong schedule
                    this.data.events = classes.flatMap(cls => {
                        if (!cls.schedule) return [];
                        
                        const sessions = this.parseSchedule(cls.schedule, cls.class_id, cls.class_name, cls.place);
                        
                        this.data.classSessions[cls.class_id] = sessions;
                        return sessions;
                    });

                    // Xử lý dữ liệu lớp trống
                    this.data.availableClasses = availableClasses.flatMap(cls => {
                        if (!cls.schedule) return [];
                        
                        const sessions = this.parseSchedule(cls.schedule, cls.class_id, cls.class_name, cls.place)
                                             .map(session => ({...session, status: 'available'})); 
                                             
                        return sessions;
                    });

                } catch (error) {
                    console.error("Lỗi khi load dữ liệu lịch:", error);
                }
            },

            // ✅ FIXED: Giờ giấc nhất quán
            formatTime(date) {
                const h = date.getHours().toString().padStart(2, '0');
                const m = date.getMinutes().toString().padStart(2, '0');
                return `${h}:${m}`;
            },
            
            // ✅ FIXED: Giờ giấc nhất quán
            addHours(date, hours) {
                const d = new Date(date);
                d.setHours(d.getHours() + hours);
                return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            },

            // ✅ HÀM XỬ LÝ API XIN NGHỈ (Giữ nguyên)
            async requestLeave(classId, sessionId) {
                const user = JSON.parse(sessionStorage.getItem("loggedInUser"));
                const token = sessionStorage.getItem("accessToken");
                
                if (!user || !token) {
                    alert("Lỗi: Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.");
                    return;
                }

                const numericClassId = Number(classId); 
                // Tìm event trong cả data.events (bao gồm cả active và deactived)
                const sessionToLeave = this.data.events.find(e => 
                    String(e.id) === sessionId && e.classId === numericClassId
                );

                if (!sessionToLeave) {
                    alert("Lỗi: Không tìm thấy thông tin buổi học. Vui lòng thử lại.");
                    return;
                }
                
                const leaveTimestamp = `${sessionToLeave.date}T${sessionToLeave.startTime}:00Z`; 
                
                const reason = prompt(`Xin Nghỉ cho lớp ${sessionToLeave.className}, Buổi ${sessionToLeave.sessionNumber} (${sessionToLeave.date}).\nVui lòng nhập lý do xin nghỉ:`);
                if (!reason) {
                    alert("Yêu cầu xin nghỉ đã bị hủy.");
                    return;
                }

                const payload = {
                    "user_id": userId,
                    "class_id": numericClassId, 
                    "leave_date": leaveTimestamp,
                    "reason": reason
                };
                
                try {
                    const response = await fetch(`/lec/leave-request/lecturer`, {
                        method: 'POST',
                        headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(payload)
                    });

                    const result = await response.json();

                    if (response.ok) {
                        alert(`Xin nghỉ thành công! ${result.detail || 'Lịch đã được cập nhật.'}`);
                        // Tải lại dữ liệu và render lại lịch
                        await this.loadData();
                        this.render();
                    } else {
                        alert(`Lỗi khi xin nghỉ: ${result.detail || JSON.stringify(result)}`);
                    }
                } catch (error) {
                    console.error("Lỗi gọi API xin nghỉ:", error);
                    alert("Có lỗi xảy ra trong quá trình gửi yêu cầu xin nghỉ.");
                }
            },

            toggleRegistrationMode() {
                this.isRegistrationMode = !this.isRegistrationMode;
                const btn = this.DOM.toggleRegistrationBtn;
                if (this.isRegistrationMode) {
                    btn.innerHTML = '<i class="fas fa-times"></i> Hủy chế độ đăng ký';
                    btn.classList.replace('btn-primary', 'btn-danger');
                } else {
                    btn.innerHTML = '<i class="fas fa-plus-circle"></i> Đăng ký Lớp học';
                    btn.classList.replace('btn-danger', 'btn-primary');
                }
                this.render();
            },

            // ✅ HÀM RENDER (Giữ nguyên)
            render() {
                const today = new Date();
                today.setDate(today.getDate() + (this.parent.state.currentWeekOffset * 7));
                const dayOfWeek = today.getDay();
                const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                const monday = new Date(today.setDate(diff));
                const sunday = new Date(new Date(monday).setDate(monday.getDate() + 6));

                const weekDates = Array.from({ length: 7 }).map((_, i) => {
                    const day = new Date(new Date(monday).setDate(monday.getDate() + i));
                    return day.toISOString().split("T")[0];
                });

                const formatDate = (d) =>
                    `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
                        .toString()
                        .padStart(2, '0')}`;

                if (this.DOM.weekDisplay) {
                    this.DOM.weekDisplay.textContent = `${formatDate(monday)} - ${formatDate(sunday)}`;
                }

                const dayNameMap = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

                this.DOM.dayHeaders.forEach((header, index) => {
                    if (header.classList.contains('time-column-header')) return;

                    let dayOffset = index; 
                    
                    const day = new Date(new Date(monday).setDate(monday.getDate() + dayOffset));
                    const dateString = formatDate(day);
                    const dayName = dayNameMap[day.getDay()];

                    header.innerHTML = `
                        <div style="font-weight: bold;">${dayName}</div>
                        <div style="font-weight: bold; font-size: 0.9em; color: #000000; margin-top: 2px;">
                            ${dateString}
                        </div>
                    `;
                });


                this.DOM.scheduleBody.querySelectorAll('.day-column').forEach(col => (col.innerHTML = ''));

                const dataSource = this.isRegistrationMode
                    ? this.data.availableClasses
                    : this.data.events;

                const eventsThisWeek = dataSource.filter(event => weekDates.includes(event.date));
                this.drawEvents(eventsThisWeek, this.isRegistrationMode);
            },

            // ✅ CẬP NHẬT: Thay nút Xin Nghỉ bằng icon
            drawEvents(events, isAvailable = false) {
                const startHour = 7;
                const hourHeight = 38;
                const timeToDecimal = (t) => {
                    const [h, m] = t.split(':');
                    return Number(h) + Number(m) / 60;
                };
                const dayMap = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

                const drawnPositions = {};
                const self = this; 

                events.forEach(event => {
                    const eventDate = new Date(event.date + 'T00:00:00');
                    const dayIndex = eventDate.getDay(); 
                    let dayKey = 'monday'; 
                    if (dayIndex === 0) { 
                        dayKey = 'sunday'; 
                    } else { 
                        dayKey = dayMap[dayIndex - 1]; 
                    }

                    const dayColumn = self.DOM.scheduleBody.querySelector(`.day-column[data-day="${dayKey}"]`);
                    if (!dayColumn) return;

                    const top = (timeToDecimal(event.startTime) - startHour) * hourHeight;
                    const height = (timeToDecimal(event.endTime) - timeToDecimal(event.startTime)) * hourHeight;
                    const classPlace = event.place || 'N/A';

                    // ✅ FIXED: Thêm event.id vào positionKey để tránh ghi đè các buổi học khác nhau
                    const positionKey = `${dayKey}_${event.startTime}_${event.id}`;
                    let eventLeftPercent = 5; 
                    let eventWidthPercent = 90; 

                    // Logic xử lý trùng lặp chỉ còn lại để điều chỉnh vị trí
                    const baseKey = `${dayKey}_${event.startTime}`;
                    if (drawnPositions[baseKey]) {
                        // Nếu có sự kiện trùng giờ, co nhỏ và đẩy sang phải
                        eventLeftPercent = 50; eventWidthPercent = 45; 
                        
                        // Điều chỉnh sự kiện đầu tiên nếu nó đã được vẽ
                        if(drawnPositions[baseKey].element) {
                            drawnPositions[baseKey].element.style.width = '45%';
                            drawnPositions[baseKey].element.style.left = '5%';
                        }
                        drawnPositions[baseKey].count++;
                    } else {
                        drawnPositions[baseKey] = { element: null, event: event, count: 1 };
                    }


                    const eventEl = document.createElement('div');
                    eventEl.style.cssText = `
                        position: absolute; top: ${top}px; height: ${height}px; 
                        left: ${eventLeftPercent}%; width: ${eventWidthPercent}%; 
                        border-radius: 4px; padding: 5px; font-size: 12px; overflow: hidden;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: ${isAvailable ? 'pointer' : 'default'};
                        /* Đảm bảo khối là Flex container, sắp xếp theo cột */
                        display: flex; 
                        flex-direction: column;
                        justify-content: space-between; 
                    `;

                    if (drawnPositions[baseKey].count === 1 && !isAvailable) {
                         // Gán element cho lần đầu tiên vẽ, chỉ khi không phải chế độ đăng ký
                         drawnPositions[baseKey].element = eventEl;
                    }
                    
                    if (isAvailable) {
                        // Logic cho chế độ Đăng ký (Available) - Giữ nguyên
                        eventEl.className = 'schedule-event available-class';
                        eventEl.style.backgroundColor = '#fef3c7';
                        eventEl.style.borderLeft = '3px solid #d97706';
                        eventEl.dataset.classInfo = JSON.stringify(event);
                        eventEl.innerHTML = `
                            <div style="flex-grow: 1; min-height: 0;"> 
                                <strong>${event.className}</strong><br>
                                <small><i class="fas fa-map-marker-alt"></i>Phòng: ${classPlace}</small><br>
                                <span>${event.startTime} - ${event.endTime}</span>
                            </div>
                            
                            <div style="margin-top: auto; padding-top: 3px;">
                                <small style="font-weight:bold;">(Nhấp để Đăng ký)</small>
                            </div>
                        `;
                        eventEl.addEventListener('click', () => {
                            if (window.LecturerDashboardApp.MyClasses?.AvailableClassManagement?.openConfirmModal) {
                                window.LecturerDashboardApp.MyClasses.AvailableClassManagement.openConfirmModal(event.classId, event.className);
                            } else {
                                alert("Chức năng Đăng ký lớp chưa sẵn sàng. Vui lòng thử lại.");
                            }
                        });
                        
                    } else {
                        // Logic cho lịch của GV (My Classes)
                        
                        eventEl.className = `schedule-event ${event.status || ''}`;

                        if (event.status === 'deactived') {
                            // 🚩 BUỔI HỌC DEACTIVED (BỊ BÁO VẮNG)
                            eventEl.style.backgroundColor = '#fecaca'; 
                            eventEl.style.borderLeft = '3px solid #dc2626'; 
                            eventEl.innerHTML = `
                                <strong>${event.className} (Buổi ${event.sessionNumber})</strong><br>
                                <hr style="margin: 3px 0; border-top: 1px dashed #dc2626;">
                                <strong style="color: #dc2626; font-size: 11px;"><i class="fas fa-exclamation-triangle"></i> GV ĐÃ BÁO VẮNG</strong>
                            `;
                        } else {
                            // ✅ Buổi học ACTIVE hoặc trạng thái khác
                            eventEl.style.backgroundColor = '#dbeafe';
                            eventEl.style.borderLeft = '3px solid #1e40af';
                            
                            // 🌟 ĐÃ SỬA: Thay thế button Xin Nghỉ bằng icon
                            eventEl.innerHTML = `
                                <div style="flex-grow: 1; min-height: 0;"> 
                                    <strong>${event.className} (Buổi ${event.sessionNumber})</strong><br>
                                    <small><i class="fas fa-clock"></i> ${event.startTime} - ${event.endTime}</small><br>
                                    <small><i class="fas fa-map-marker-alt"></i> Phòng: ${classPlace}</small>
                                </div>
                                
                                <div style="display: flex; justify-content: flex-end; margin-top: auto; padding-top: 3px;">
                                    <span class="request-leave-icon" 
                                        data-class-id="${event.classId}" 
                                        data-session-id="${event.id}"
                                        title="Yêu cầu Xin Nghỉ Buổi này"
                                        style="cursor: pointer; color: #dc3545; font-size: 1.2em; transition: color 0.2s; background: #dbeafe; padding: 1px 4px; border-radius: 3px;">
                                        <i class="fa-solid fa-arrow-right-from-bracket"></i>
                                    </span>
                                </div>`;
                                
                            // GẮN SỰ KIỆN CHO ICON XIN NGHỈ
                            const leaveIcon = eventEl.querySelector('.request-leave-icon');
                            
                            if (leaveIcon) {
                                // Thêm hiệu ứng hover (tùy chọn)
                                leaveIcon.onmouseover = () => leaveIcon.style.color = '#ff0000';
                                leaveIcon.onmouseout = () => leaveIcon.style.color = '#dc3545';
                                
                                leaveIcon.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const sessionId = e.currentTarget.dataset.sessionId;
                                    const classId = e.currentTarget.dataset.classId;
                                    
                                    self.requestLeave(classId, sessionId); 
                                });
                            }
                        }
                    }

                    dayColumn.appendChild(eventEl);
                });
            }
        },

        // ==================================================================
        // MODULE 3: My Classes
        // ==================================================================
        MyClasses: {
            parent: null,
            myClasses: [],
            currentClassId: null,
            currentTask: null, 

            async init(parent) {
                this.parent = parent;
                this.DOM = {
                    container: document.getElementById('my-classes'),
                    classDetailView: document.querySelector('#my-classes #class-detail-view'),
                };
                if (!this.DOM.container) return;

                // Dữ liệu đã được load bởi Calendar.init()
                this.loadMyClasses(); 
                this.bindEvents();
                this.AvailableClassManagement.init(this);
            },

            getStartDateFromSchedule(scheduleString) {
                if (!scheduleString) return null;
                
                const regex = /date:\s*([^ ]+)/;
                const match = scheduleString.match(regex);
                
                if (match && match.length > 1) {
                    const datePart = match[1].trim();
                    try {
                        // Chuẩn hóa chuỗi (loại bỏ múi giờ nếu có)
                        let dateToParse = datePart.replace(/(\+\d{2}:\d{2})$|Z$/i, ''); 
                        dateToParse = dateToParse.replace(' ', 'T'); 
                        
                        const date = new Date(dateToParse);
                        if (!isNaN(date)) {
                             // Trả về phần ngày (YYYY-MM-DD)
                            return dateToParse.split("T")[0]; 
                        }
                    } catch (e) {
                        console.error("Lỗi parse ngày bắt đầu:", e);
                        return null;
                    }
                }
                return null;
            },

            loadMyClasses() {
                const classListView = this.DOM.container.querySelector('#class-list-view');
                const currentClassContainer = classListView?.querySelector('.card-container');

                if (!currentClassContainer) return;

                // Lấy dữ liệu đã đồng bộ từ Calendar
                if (!MOCK_DATA.myClasses.length) {
                    currentClassContainer.innerHTML = `<p style="font-style:italic; text-align: center;">Chưa có lớp học nào.</p>`;
                    return;
                }

                currentClassContainer.innerHTML = MOCK_DATA.myClasses.map(cls => {
                    
                    const startDateISO = this.getStartDateFromSchedule(cls.schedule);

                    const formattedStartDate = startDateISO 
                        ? window.LecturerDashboardApp.formatDate(startDateISO)
                        : 'Chưa xác định';
                        
                    return `
                        <div class="card class-card">
                            <h3>${cls.class_id} - ${cls.class_name} </h3>
                            <p><i class="fas fa-calendar-alt"></i> Ngày KG: ${formattedStartDate}</p>
                            <p><i class="fas fa-map-marker-alt"></i> Địa điểm: ${cls.place || 'N/A'}</p>
                            <button class="btn btn-primary enter-class-btn"
                                data-class-id="${cls.class_id}"
                                data-class-name="${cls.class_name}">Vào lớp</button>
                        </div>
                    `;
                }).join('');

                this.myClasses = MOCK_DATA.myClasses;
            },

            bindEvents() {
                const classListView = this.DOM.container.querySelector('#class-list-view');
                const classDetailView = this.DOM.container.querySelector('#class-detail-view');
                if (!classListView || !classDetailView) return;

                // Event vào lớp
                classListView.addEventListener('click', async (e) => {
                    const btn = e.target.closest('.enter-class-btn');
                    if (btn) {
                        const classId = btn.dataset.classId;
                        const className = btn.dataset.className;
                        classListView.style.display = 'none';
                        classDetailView.style.display = 'block';

                        this.currentClassId = classId;

                        classDetailView.querySelector('h2').textContent = `Chi tiết lớp học: ${className} (${classId})`;
                        
                        await this.fetchClassStudents(classId);

                        const firstTab = classDetailView.querySelector('.tabs .tab-item');
                        if (firstTab) firstTab.click();
                    }
                });

                // Event quay lại danh sách lớp
                classDetailView.querySelector('#back-to-class-list').addEventListener('click', () => {
                    classListView.style.display = 'block';
                    classDetailView.style.display = 'none';
                    CURRENT_CLASS_STUDENTS = [];
                    CURRENT_CLASS_SESSIONS = [];
                    this.currentClassId = null;
                    this.currentTask = null;
                });

                // Event đổi buổi học trong Attendance tab
                classDetailView.querySelector('#session-selector')?.addEventListener('change', () => {
                    this.renderAttendanceTable();
                });

                // Event chuyển tab chi tiết lớp
                classDetailView.querySelector('.tabs').addEventListener('click', (e) => {
                    const tabItem = e.target.closest('.tab-item');
                    if (tabItem) {
                        const tabId = tabItem.dataset.tab;
                        classDetailView.querySelectorAll('.tab-item').forEach(item => item.classList.remove('active'));
                        tabItem.classList.add('active');
                        classDetailView.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.toggle('active', content.id === tabId);
                            content.classList.toggle('hidden', content.id !== tabId);
                        });

                        if (tabId === 'attendance') this.renderAttendanceTable();
                        if (tabId === 'grades') this.renderGradesTable();
                        if (tabId === 'tasks') this.renderTasksTable();
                    }
                });

                // Bind event cho nút Tạo Task
                this.DOM.classDetailView.querySelector('#create-task-btn')?.addEventListener('click', () => {
                    this.createTask();
                });

                // BIND EVENT cho nút Xem Bài Nộp trong Tasks Table
                this.DOM.classDetailView.querySelector('#tasks-table-body')?.addEventListener('click', (e) => {
                    const viewBtn = e.target.closest('button.view-submissions-btn');
                    if (viewBtn) {
                        const taskId = viewBtn.dataset.taskId;
                        const taskTitle = viewBtn.dataset.taskTitle;
                        const dueDate = viewBtn.dataset.dueDate;
                        this.currentTask = { id: taskId, title: taskTitle, dueDate: dueDate };
                        window.LecturerDashboardApp.ModalHandler.showTaskDetailModal(taskId, taskTitle, dueDate);
                    }
                });

                // Bind Save buttons
                const classId = this.currentClassId;
                const attendanceBtn = classDetailView.querySelector('#save-attendance-btn');
                const gradeBtn = classDetailView.querySelector('#save-grades-btn');
                if (attendanceBtn) attendanceBtn.onclick = () => this.saveAttendance(this.currentClassId);
                if (gradeBtn) gradeBtn.onclick = () => this.saveGrades(this.currentClassId);

            },

            async fetchClassStudents(classId) {
                CURRENT_CLASS_STUDENTS = [];
                const attendanceBody = this.DOM.classDetailView.querySelector('#attendance-table-body');
                const gradesBody = this.DOM.classDetailView.querySelector('#grades-table-body');

                if (attendanceBody) attendanceBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Đang tải danh sách sinh viên...</td></tr>`;
                if (gradesBody) gradesBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Đang tải danh sách sinh viên...</td></tr>`;

                try {
                    const response = await fetch(`/lec/classes/students?class_id=${classId}`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        throw new Error(`Failed to fetch students (HTTP ${response.status}): ${errorData.detail}`);
                    }

                    const classData = await response.json();

                    CURRENT_CLASS_STUDENTS = (classData.students || []).map(s => {
                        const gradeMap = {};
                        const attendanceMap = {};

                        (s.grades || []).forEach(g => {
                            gradeMap[g.grade_type] = g.grade;
                        });

                        (s.attendance || []).forEach(a => {
                            // 🛑 ĐÃ SỬA LỖI: Sử dụng 'a.date' thay vì 'a.schedule_date' và không cần split
                            // BẢN GHI LỖI: {date: "2025-09-05", status: "present"}
                            
                            if (a && typeof a.date === 'string') {
                                // Sử dụng a.date trực tiếp (đã là YYYY-MM-DD)
                                const dateOnly = a.date;
                                attendanceMap[dateOnly] = a.status;
                            } else {
                                // Giữ lại console.warn để báo lỗi dữ liệu API nếu cần
                                console.warn(`[Attendance] Bỏ qua bản ghi lỗi cho SV ${s.student_id}: 'date' bị thiếu hoặc không hợp lệ.`, a);
                            }
                        });

                        return {
                            ...s,
                            gradeMap: gradeMap,
                            attendanceMap: attendanceMap
                        };
                    });
                    
                    // `Calendar.data.classSessions[classId]` chắc chắn đã có dữ liệu
                    CURRENT_CLASS_SESSIONS = window.LecturerDashboardApp.Calendar.data.classSessions[classId] || [];

                    this.renderAttendanceTable();
                    this.renderGradesTable();


                } catch (error) {
                    console.error(`Lỗi khi tải danh sách sinh viên cho lớp ${classId}:`, error);
                    if (attendanceBody) attendanceBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:red;">Lỗi tải dữ liệu sinh viên.</td></tr>`;
                    if (gradesBody) gradesBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Lỗi tải dữ liệu sinh viên.</td></tr>`;
                    CURRENT_CLASS_STUDENTS = [];
                    
                    // Vẫn render buổi học ngay cả khi fetch student lỗi
                    CURRENT_CLASS_SESSIONS = window.LecturerDashboardApp.Calendar.data.classSessions[classId] || [];
                    this.renderAttendanceTable();
                    this.renderGradesTable();
                }
            },

            // ✅ CẢI THIỆN: Logic kiểm tra và hiển thị trạng thái deactived trong dropdown
            renderAttendanceTable() {
                const attendanceTableBody = this.DOM.classDetailView.querySelector('#attendance-table-body');
                const sessionSelector = this.DOM.classDetailView.querySelector('#session-selector');
                const saveBtn = this.DOM.classDetailView.querySelector('#save-attendance-btn');
                
                const sessions = CURRENT_CLASS_SESSIONS; 

                if (!attendanceTableBody || !sessionSelector || !saveBtn) return;

                const selectedSessionId = sessionSelector.value;
                sessionSelector.innerHTML = '<option value="">-- Chọn buổi học --</option>';
                let canSaveAttendance = false;
                let currentSessionDeactived = false;

                if (sessions.length > 0) { 
                    sessions.forEach(session => {
                        const fullDate = window.LecturerDashboardApp.formatFullDate(new Date(session.date));
                        const isToday = window.LecturerDashboardApp.checkIsToday(session.date);
                        const isPast = window.LecturerDashboardApp.checkIsPast(session.date);

                        let disabled = '';
                        let displayStatus = '';
                        const isDeactived = session.status === 'deactived';

                        if (isDeactived) {
                            disabled = 'disabled';
                            displayStatus = ' (GV Báo Vắng)';
                        } else if (isPast && !isToday) {
                            disabled = 'disabled';
                            displayStatus = ' (Đã qua)';
                        } else if (!isToday && !isPast) {
                            disabled = 'disabled';
                            displayStatus = ' (Chưa tới)';
                        } else if (isToday) {
                            displayStatus = ' (Hôm nay)';
                        }
                        
                        // Thêm trạng thái Active vào option nếu cần
                        if (session.status === 'active' && !isDeactived) {
                             displayStatus += ' (Đang Dạy)';
                        }

                        const optionText = `Buổi ${session.sessionNumber} - ${fullDate}${displayStatus}`;
                        const option = new Option(optionText, session.date);
                        option.disabled = disabled === 'disabled';

                        if (session.date === selectedSessionId || (!selectedSessionId && isToday)) {
                            option.selected = true;
                            if (isDeactived) {
                                currentSessionDeactived = true;
                            }
                        }

                        sessionSelector.appendChild(option);
                    });

                    // Tự động chọn buổi hôm nay, nếu không có thì chọn buổi đầu tiên
                    if (!sessionSelector.value && sessions.length > 0) {
                        const todaySession = sessions.find(s => window.LecturerDashboardApp.checkIsToday(s.date) && s.status !== 'deactived');
                        if (todaySession) {
                            sessionSelector.value = todaySession.date;
                        } else {
                            // Chọn buổi gần nhất không bị deactivated (chỉ để hiển thị)
                            const firstAvailableSession = sessions.find(s => s.status !== 'deactived') || sessions[0];
                            if (firstAvailableSession) {
                                sessionSelector.value = firstAvailableSession.date;
                                if (firstAvailableSession.status === 'deactived') {
                                    currentSessionDeactived = true;
                                }
                            }
                        }
                    }
                } else {
                    sessionSelector.innerHTML = '<option value="">-- Không có buổi học nào --</option>';
                }

                const currentSelectedDate = sessionSelector.value;
                canSaveAttendance = window.LecturerDashboardApp.checkIsToday(currentSelectedDate) && !currentSessionDeactived;
                
                saveBtn.disabled = !canSaveAttendance || CURRENT_CLASS_STUDENTS.length === 0;

                if (CURRENT_CLASS_STUDENTS.length === 0) {
                    attendanceTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Không có sinh viên trong lớp.</td></tr>`;
                    return;
                }
                
                // Hiển thị thông báo nếu buổi học đã bị báo vắng
                if (currentSessionDeactived) {
                     attendanceTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: red; font-weight: bold; padding: 15px;">Buổi học này đã được Giảng viên báo vắng và không thể điểm danh.</td></tr>`;
                     return;
                }


                attendanceTableBody.innerHTML = CURRENT_CLASS_STUDENTS.map((s, i) => {
                    const currentStatus = s.attendanceMap[currentSelectedDate] || 'absent';
                    const selectDisabled = canSaveAttendance ? '' : 'disabled';
                    return `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${s.name}</td>
                            <td>
                                <select class="form-control attendance-status-select"
                                         data-student-id="${s.student_id}"
                                         style="width: 150px; height: 35px;" ${selectDisabled}>
                                    <option value="present" ${currentStatus === 'present' ? 'selected' : ''}>Có mặt</option>
                                    <option value="late" ${currentStatus === 'late' ? 'selected' : ''}>Trễ</option>
                                    <option value="absent" ${currentStatus === 'absent' ? 'selected' : ''}>Vắng</option>
                                </select>
                            </td>
                        </tr>
                    `;
                }).join('');
            },

            // ✅ HÀM RENDERGRADESTABLE ĐÃ SỬA LỖI ID
            renderGradesTable() {
                const gradesTableBody = this.DOM.classDetailView.querySelector('#grades-table-body');
                if (!gradesTableBody) return;

                if (CURRENT_CLASS_STUDENTS.length === 0) {
                    gradesTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Không có sinh viên trong lớp.</td></tr>`;
                    return;
                }

                const gradeColumns = [
                    { key: 'process', title: 'Process (40%)', weight: 0.4 },
                    { key: 'project', title: 'Project (60%)', weight: 0.6 }
                ];

                let headerHtml = '<thead><tr><th>STT</th><th>Họ tên học viên</th>';
                gradeColumns.forEach(col => {
                    headerHtml += `<th>${col.title}</th>`;
                });
                headerHtml += `<th>Điểm Tổng kết</th></tr></thead>`;

                const table = this.DOM.classDetailView.querySelector('#grades-table');
                if (table) {
                    const oldTHead = table.querySelector('thead');
                    if (oldTHead) oldTHead.remove();
                    table.insertAdjacentHTML('afterbegin', headerHtml);
                }

                gradesTableBody.innerHTML = CURRENT_CLASS_STUDENTS.map((student, index) => {
                    let cellsHtml = `<td>${index + 1}</td><td>${student.name}</td>`;
                    let finalScore = 0;

                    gradeColumns.forEach(col => {
                        const score = student.gradeMap[col.key] !== undefined ? student.gradeMap[col.key] : '';
                        finalScore += parseFloat(score || 0) * col.weight;
                        cellsHtml += `
                            <td>
                                <input type="number" class="grade-input form-control"
                                        data-student-id="${student.student_id}" 
                                        data-grade-type="${col.key}"
                                        min="0" max="10" step="0.1"
                                        value="${score}" style="width: 80px; height: 35px; text-align: center;">
                            </td>
                        `;
                    });

                    cellsHtml += `
                        <td class="final-score" data-score="${finalScore.toFixed(1)}">
                            <strong>${finalScore.toFixed(1)}</strong>
                        </td>
                    `;

                    return `<tr>${cellsHtml}</tr>`;
                }).join('');

                this.bindGradeCalculationEvents();
            },

async renderTasksTable() {
                const tasksTableBody = this.DOM.classDetailView.querySelector('#tasks-table-body');
                const classId = this.currentClassId;
                if (!tasksTableBody || !classId) return;

                tasksTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Đang tải danh sách tài liệu và bài tập...</td></tr>`;

                try {
                    const response = await fetch(`/tc/files/class/${classId}/tasks`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        throw new Error(`Failed to fetch tasks (HTTP ${response.status}): ${errorData.detail}`);
                    }

                    const tasks = await response.json();
                    tasksTableBody.innerHTML = '';

                    if (tasks.length === 0) {
                        tasksTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Lớp học chưa có Tài liệu/Bài tập nào.</td></tr>`;
                        return;
                    }

                    tasks.sort((a, b) => new Date(b.due_date) - new Date(a.due_date));

                    tasks.forEach(task => {
                        const dueDate = task.due_date ? window.LecturerDashboardApp.formatDate(task.due_date) : 'N/A';
                        const fileName = task.attached_file?.original_filename || task.title;
                        let actionButton = '';
                        
                        // Nút Xóa (dùng chung cho cả hai loại)
                        const deleteButton = `
                            <button class="btn btn-sm btn-danger delete-task-btn"
                                data-task-id="${task.task_id}"
                                data-task-title="${task.title}"
                                data-task-type="${task.task_type}"
                                title="Xóa Task này">
                                <i class="fas fa-trash"></i>
                            </button>`;

                        if (task.task_type === 'assignment') {
                            // Logic cho ASSIGNMENT (Bài nộp + Xóa)
                            actionButton = `
                                <div style="display: flex; gap: 5px;">
                                    <button class="btn btn-sm btn-success view-submissions-btn"
                                                     data-task-id="${task.task_id}"
                                                     data-task-title="${task.title}"
                                                     data-due-date="${task.due_date}"
                                                     title="Xem bài nộp">
                                                     <i class="fas fa-clipboard-list"></i> Bài nộp
                                    </button>
                                    ${deleteButton}
                                </div>`;
                        } 
                        else {
                            // Logic cho MATERIAL (Tài liệu) (Tải + Xóa)
                            const originalFileName = task.attached_file?.original_filename || 'file_tai_lieu.dat';
                            const savedFilename = task.attached_file?.saved_filename;
                            const encodedOriginalFileName = originalFileName.replace(/"/g, '&quot;').replace(/'/g, "\\'");
                            let downloadButton;

                            if (!savedFilename) {
                                downloadButton = `<span class="btn btn-sm btn-primary" disabled title="Lỗi: Không tìm thấy file đính kèm."><i class="fas fa-download"></i> Lỗi File</span>`;
                            } else {
                                downloadButton = `<a href="javascript:void(0);" 
                                                     onclick="window.LecturerDashboardApp.ModalHandler.handleDownloadFile('${savedFilename}', '${encodedOriginalFileName}')" 
                                                     class="btn btn-sm btn-primary"
                                                     title="Tải file đính kèm">
                                                     <i class="fas fa-download"></i> Tải
                                                 </a>`;
                            }
                            actionButton = `<div style="display: flex; gap: 5px;">${downloadButton} ${deleteButton}</div>`;
                        }

                        tasksTableBody.insertAdjacentHTML('beforeend', `
                            <tr>
                                <td>${window.LecturerDashboardApp.getStatusTag(task.task_type)}</td>
                                <td>${task.title}</td>
                                <td>${fileName}</td>
                                <td>${dueDate}</td>
                                <td>${actionButton}</td>
                            </tr>
                        `);
                    });

                    // Gắn sự kiện cho nút xóa (dùng chung cho cả hai loại)
                    this.DOM.classDetailView.querySelector('#tasks-table-body')?.addEventListener('click', (e) => {
                        const deleteBtn = e.target.closest('button.delete-task-btn');
                        if (deleteBtn) {
                            const taskId = deleteBtn.dataset.taskId;
                            const taskTitle = deleteBtn.dataset.taskTitle;
                            const taskType = deleteBtn.dataset.taskType;
                            // Gán classId của lớp hiện tại
                            window.LecturerDashboardApp.ModalHandler.showConfirmDeleteTask(classId, taskId, taskTitle, taskType);
                        }
                    });

                } catch (error) {
                    console.error(`Lỗi khi tải danh sách Task cho lớp ${classId}:`, error);
                    tasksTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Lỗi tải danh sách Task. Vui lòng kiểm tra console.</td></tr>`;
                }
            },

            createTask() {
                window.LecturerDashboardApp.ModalHandler.showCreateTaskModal(this.currentClassId);
            },


            bindGradeCalculationEvents() {
                const table = this.DOM.classDetailView.querySelector('#grades-table');
                if (!table) return;

                const GRADE_WEIGHTS = { process: 0.4, project: 0.6 };

                table.addEventListener('input', (e) => {
                    const input = e.target.closest('.grade-input');
                    if (!input) return;

                    const row = input.closest('tr');
                    let currentFinalScore = 0;

                    row.querySelectorAll('.grade-input').forEach(inputField => {
                        const type = inputField.dataset.gradeType;
                        const score = parseFloat(inputField.value) || 0;
                        const weight = GRADE_WEIGHTS[type] || 0;
                        currentFinalScore += score * weight;
                    });

                    const finalCell = row.querySelector('.final-score strong');
                    if (finalCell) {
                        finalCell.textContent = currentFinalScore.toFixed(1);
                    }
                });
            },

            async saveAttendance(classId) {
                if (!classId) return window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi dữ liệu", "Không tìm thấy ID lớp học.");

                const tableBody = this.DOM.classDetailView.querySelector('#attendance-table-body');
                const sessionSelector = this.DOM.classDetailView.querySelector('#session-selector');
                const sessionDate = sessionSelector.value;

                if (!sessionDate || sessionDate === "") return window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi dữ liệu", "Vui lòng chọn buổi học để lưu điểm danh.");

                // Cần kiểm tra lại trạng thái buổi học (active/deactived) trước khi lưu
                const currentSession = CURRENT_CLASS_SESSIONS.find(s => s.date === sessionDate);

                if (!window.LecturerDashboardApp.checkIsToday(sessionDate)) {
                    window.LecturerDashboardApp.ModalHandler.showErrorModal(
                        "🛑 Lỗi Nghiệp vụ",
                        `Chỉ có thể điểm danh cho buổi học diễn ra trong ngày hôm nay (${window.LecturerDashboardApp.formatDate(new Date())}). Vui lòng chọn buổi học có ghi chú (Hôm nay).`
                    );
                    return;
                }
                
                if (currentSession && currentSession.status === 'deactived') {
                     window.LecturerDashboardApp.ModalHandler.showErrorModal(
                        "🛑 Lỗi Nghiệp vụ",
                        "Buổi học này đã được Giảng viên báo vắng và không thể điểm danh."
                    );
                    return;
                }

                const saveBtn = this.DOM.classDetailView.querySelector('#save-attendance-btn');
                if (saveBtn) saveBtn.disabled = true;

                const attendanceRecords = [];
                tableBody.querySelectorAll('tr').forEach(row => {
                    const select = row.querySelector('.attendance-status-select');
                    if (select) {
                        attendanceRecords.push({
                            student_id: select.dataset.studentId, // Đây là user_id
                            status: select.value
                        });
                    }
                });

                if (attendanceRecords.length === 0) {
                    if (saveBtn) saveBtn.disabled = false;
                    return;
                }

                try {
                    const promises = attendanceRecords.map(record => {
                        const payload = {
                            class_id: parseInt(classId),
                            student_id: parseInt(record.student_id), // Đây là user_id
                            status: record.status
                            // schedule_date: sessionDate // API chỉ cần status, date được lấy từ server
                        };
                        return fetch(`/lec/attendance/take?user_id=${lecId}`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify(payload)
                        }).then(response => {
                            if (!response.ok) {
                                return response.json().then(errorData => {
                                    throw new Error(`HV ${record.student_id}: ${errorData.detail || response.statusText}`);
                                }).catch(() => {
                                    throw new Error(`HV ${record.student_id}: Lỗi mạng hoặc Server không phản hồi.`);
                                });
                            }
                            return true;
                        }).catch(error => {
                            return error;
                        });
                    });

                    const results = await Promise.all(promises);
                    const successfulSubmissions = results.filter(r => r === true).length;
                    const failedSubmissions = results.filter(r => r instanceof Error);

                    if (failedSubmissions.length > 0) {
                        const errorMessages = failedSubmissions.map(err => err.message).join('\n');
                        window.LecturerDashboardApp.ModalHandler.showErrorModal(
                            `⚠️ Hoàn thành ${successfulSubmissions}/${attendanceRecords.length} lượt điểm danh.`,
                            `❌ Lỗi xử lý với các sinh viên sau:\n${errorMessages}`
                        );
                    } else {
                        alert(`✅ Đã lưu điểm danh thành công cho tất cả ${successfulSubmissions} sinh viên.`);
                    }

                    await this.fetchClassStudents(classId); 

                } catch (globalError) {
                    console.error("Lỗi mạng hoặc lỗi không xác định:", globalError);
                    window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi hệ thống", `Lỗi khi gửi điểm danh: ${globalError.message}`);
                } finally {
                    if (saveBtn) saveBtn.disabled = false;
                }
            },

            async saveGrades(classId) {
                if (!classId) return window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi dữ liệu", "Không tìm thấy ID lớp học.");

                const tableBody = this.DOM.classDetailView.querySelector('#grades-table-body');
                const gradeInputs = tableBody.querySelectorAll('input.grade-input');
                const saveBtn = this.DOM.classDetailView.querySelector('#save-grades-btn');

                if (gradeInputs.length === 0) {
                    return;
                }

                if (saveBtn) saveBtn.disabled = true;

                const gradeRecords = [];
                let validationFailed = false;
                gradeInputs.forEach(input => {
                    const studentId = input.dataset.studentId; 
                    const gradeType = input.dataset.gradeType;
                    const score = input.value.trim();

                    if (score > 10 || score < 0) {
                        alert("❌ Không nhập nhiều hơn 10 hoặc ít hơn 0. ❌");
                        validationFailed = true;
                    }

                    if (score !== "") {
                        const remake = score > 5 ? "Tốt" : "Cần luyện tập thêm!";
                        gradeRecords.push({
                            class_id: parseInt(classId),
                            student_id: parseInt(studentId), 
                            grade_type: gradeType,
                            grade_value: score,
                            remarks: remake
                        });
                    }
                });

                if (validationFailed) {
                    if (saveBtn) saveBtn.disabled = false; // Bật lại nút save
                    return; // Dừng hàm saveGrades, không gọi API
                }

                if (gradeRecords.length === 0) {
                    alert("Không có điểm mới nào được nhập để lưu.");
                    if (saveBtn) saveBtn.disabled = false;
                    return;
                }

                try {
                    const promises = gradeRecords.map(payload => {
                        return fetch(`/lec/grades/enter?user_id=${lecId}`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify(payload)
                        }).then(response => {
                            if (!response.ok) {
                                return response.json().then(errorData => {
                                    throw new Error(`${payload.grade_type} for HV ${payload.student_id}: ${errorData.detail || response.statusText}`);
                                }).catch(() => {
                                    throw new Error(`${payload.grade_type} for HV ${payload.student_id}: Lỗi mạng hoặc Server không phản hồi.`);
                                });
                            }
                            return true;
                        }).catch(error => {
                            return error;
                        });
                    });

                    const results = await Promise.all(promises);
                    const successfulSubmissions = results.filter(r => r === true).length;
                    const failedSubmissions = results.filter(r => r instanceof Error);

                    if (failedSubmissions.length > 0) {
                        const errorMessages = failedSubmissions.map(err => err.message).join('\n');
                        window.LecturerDashboardApp.ModalHandler.showErrorModal(
                            `⚠️ Hoàn thành ${successfulSubmissions}/${gradeRecords.length} lượt cập nhật điểm.`,
                            `❌ Lỗi xử lý với các điểm sau:\n${errorMessages}`
                        );
                    } else {
                        alert(`✅ Đã lưu bảng điểm thành công cho tất cả ${successfulSubmissions} điểm.`);
                    }

                    await this.fetchClassStudents(classId);

                } catch (globalError) {
                    console.error("Lỗi mạng hoặc lỗi không xác định:", globalError);
                    window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi hệ thống", `Lỗi khi gửi điểm: ${globalError.message}`);
                } finally {
                    if (saveBtn) saveBtn.disabled = false;
                }
            },

            // --- Sub-module: Quản lý lớp học có thể nhận ---
            AvailableClassManagement: {
                parent: null,
                selectedClassId: null,
                async init(parent) {
                    this.parent = parent;
                    this.DOM = {
                        tableBody: document.getElementById('available-classes-table-body'),
                        confirmOverlay: document.getElementById('confirm-modal-overlay'),
                        executeBtn: document.getElementById('execute-confirm-btn'),
                    };
                    if (!this.DOM.tableBody) return;
                    
                    this.render(window.LecturerDashboardApp.Calendar.data.availableClasses);
                    this.bindEvents();
                },

                render(classes) {
                    // Giải nén data từ format event về format lớp
                    const uniqueClasses = classes.filter(
                        (event, index, self) => 
                            index === self.findIndex((e) => e.classId === event.classId)
                    ).map(event => ({
                        class_id: event.classId,
                        class_name: event.className,
                        max_students: event.max_students || '-', 
                        schedule: event.date, 
                        place: event.place
                    }));


                    this.DOM.tableBody.innerHTML = '';
                    if (uniqueClasses.length === 0) {
                        this.DOM.tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; font-style: italic;">Không còn lớp học nào có thể nhận.</td></tr>`;
                        return;
                    }
                    uniqueClasses.forEach(cls => {
                        const row = this.DOM.tableBody.insertRow();
                        row.innerHTML = `
                            <td>${cls.class_id}</td>
                            <td>${cls.class_name}</td>
                            <td>${cls.max_students || '-'}</td>
                            <td>${window.LecturerDashboardApp.formatDate(cls.schedule)}</td>
                            <td>
                                <button class="btn btn-warning btn-sm assign-class-btn"
                                    data-class-id="${cls.class_id}"
                                    data-class-name="${cls.class_name}">
                                    <i class="fas fa-plus-circle"></i> Nhận lớp
                                </button>
                            </td>`;
                    });
                },

                bindEvents() {
                    this.DOM.tableBody.addEventListener('click', (e) => {
                        const assignBtn = e.target.closest('.assign-class-btn');
                        if (assignBtn) this.openConfirmModal(assignBtn.dataset.classId, assignBtn.dataset.className);
                    });

                    this.DOM.executeBtn.addEventListener('click', () => {
                        if (this.DOM.executeBtn.dataset.action === 'assignClassFromTable') {
                            this.handleConfirmAssign();
                        }
                    });
                },

                openConfirmModal(classId, className) {
                    const modal = window.LecturerDashboardApp.Calendar.DOM;
                    this.selectedClassId = classId;
                    modal.confirmTitle.textContent = 'Xác nhận Nhận lớp';
                    modal.confirmMessage.innerHTML = `Bạn có chắc chắn muốn đăng ký nhận lớp <strong>${className} (${classId})</strong> không?`;
                    modal.executeBtn.textContent = 'Nhận lớp';
                    modal.executeBtn.dataset.action = 'assignClassFromTable';
                    modal.executeBtn.classList.remove('hidden');
                    modal.cancelBtn.textContent = 'Hủy';
                    modal.confirmOverlay.classList.remove('hidden');
                },

                async handleConfirmAssign() {
                    const token = sessionStorage.getItem("accessToken");
                    const user = JSON.parse(sessionStorage.getItem("loggedInUser"));
                    if (!this.selectedClassId || !user || !token) return;

                    const classIdToClaim = this.selectedClassId;
                    window.LecturerDashboardApp.Calendar.DOM.executeBtn.disabled = true;

                    try {
                        const res = await fetch(`/lec/classes/${classIdToClaim}/register?user_id=${userId}`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                        });

                        if (!res.ok) {
                            const errorData = await res.json().catch(() => ({ detail: res.statusText }));
                            throw new Error(`Yêu cầu nhận lớp thất bại: ${errorData.detail}`);
                        }

                        alert(`✅ Đã gửi yêu cầu nhận lớp ${classIdToClaim} thành công! Vui lòng chờ phê duyệt.`);
                        
                        window.location.reload();

                    } catch (err) {
                        console.error("Lỗi khi gửi yêu cầu nhận lớp:", err);
                        window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi Nhận Lớp", `Lỗi khi gửi yêu cầu nhận lớp: ${err.message}!`);
                    } finally {
                        window.LecturerDashboardApp.Calendar.DOM.executeBtn.disabled = false;
                    }
                }
            }
        },

        // ==================================================================
        // MODULE 4: Ticket Management
        // ==================================================================
        TicketManagement: {
            parent: null,
            init(parent) {
                this.parent = parent;
                this.DOM = {
                    form: document.getElementById('create-ticket-form'),
                    titleInput: document.getElementById('ticket-title'),
                    descriptionInput: document.getElementById('ticket-description'),
                    tableBody: document.getElementById('lec-ticket-table-body'),

                    ticketType: document.getElementById('ticket-type'),
                    ticketRelatedId: document.getElementById('lec-ticket-related-id')
                };

                if (this.DOM.ticketType) this.DOM.ticketType.closest('.form-group').style.display = 'none';
                if (this.DOM.ticketRelatedId) this.DOM.ticketRelatedId.closest('.form-group').style.display = 'none';
                if (!this.DOM.tableBody) return;
                
                this.loadTicketData(state.tickets);
                this.bindEvents();
            },

            async fetchTicketData() {
                try {
                    const ticketResponse = await fetch(`/auth/tickets?user_id=${lecId}`, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        }
                    });

                    if (!ticketResponse.ok) {
                        throw new Error(`Không thể tải lịch sử ticket (HTTP ${ticketResponse.status})`);
                    }

                    const data = await ticketResponse.json();
                    state.tickets = data || [];
                    state.pending_tickets = state.tickets.filter(
                        t => t.status === "open" || t.status === "in_progress"
                    ).length;
                } catch (error) {
                    console.error("❌ Lỗi khi tải lịch sử ticket:", error);
                    state.tickets = [];
                }
            },

            loadTicketData(tickets) {
                this.DOM.tableBody.innerHTML = '';
                if (tickets.length === 0) {
                    this.DOM.tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; font-style: italic;">Chưa có ticket nào trong lịch sử.</td></tr>`;
                    return;
                }

                tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                tickets.forEach(ticket => {
                    const dateDisplay = ticket.created_at ? window.LecturerDashboardApp.formatDate(ticket.created_at) : 'N/A';

                    const shortDescription = ticket.description
                        ? ticket.description.substring(0, 50) + (ticket.description.length > 50 ? '...' : '')
                        : 'Không có mô tả';

                    const row = this.DOM.tableBody.insertRow();
                    row.innerHTML = `
                        <td>${ticket.title.substring(0,30) + '...' || 'N/A'}</td>
                        <td>${shortDescription}</td>
                        <td>${dateDisplay}</td>
                        <td>${window.LecturerDashboardApp.getStatusTag(ticket.status)}</td>
                    `;
                });
            },

            bindEvents() {
                if (this.DOM.form) {
                    this.DOM.form.addEventListener('submit', (e) => this.handleSubmit(e));
                }
            },

            async handleSubmit(e) {
                e.preventDefault();
                const title = this.DOM.titleInput.value.trim();
                const description = this.DOM.descriptionInput.value.trim();
                const submitBtn = this.DOM.form.querySelector('button[type="submit"]');

                if (!title || !description) {
                    alert("Vui lòng nhập đầy đủ Tiêu đề và Nội dung chi tiết.");
                    return;
                }

                const requestBody = {
                    "created_at": new Date().toISOString(),
                    "description": description,
                    "issue_type": "GV Issue",
                    "status": "open",
                    "title": title,
                    "user_assigned": 1,
                    "user_id": lecId
                };

                if (submitBtn) submitBtn.disabled = true;

                try {
                    const response = await fetch("/auth/ticket/submit", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        throw new Error(`Lỗi từ Server: ${errorData.detail || response.statusText}`);
                    }

                    alert(`✅ Đã gửi ticket "${title}" thành công!`);
                    this.DOM.form.reset();

                    await this.fetchTicketData();
                    this.loadTicketData(state.tickets);
                    window.LecturerDashboardApp.loadDashboardSummary();

                } catch (error) {
                    console.error("Lỗi khi gửi Ticket:", error);
                    alert(`❌ Lỗi gửi ticket: ${error.message}.`);
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            }
        },

        // ==================================================================
        // MODULE 5: Modal Handler
        // ==================================================================
        ModalHandler: {
            showErrorModal(title, message) {
                const modalOverlay = document.getElementById('confirm-modal-overlay');
                const modalTitle = document.getElementById('confirm-modal-title');
                const modalMessage = document.getElementById('confirm-modal-message');
                const executeBtn = document.getElementById('execute-confirm-btn');
                const cancelBtn = document.getElementById('cancel-confirm-btn');

                if (!modalOverlay) return;

                modalTitle.textContent = title;
                modalMessage.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word; text-align: left; font-size: 0.9em; color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 5px;">${message}</pre>`;

                executeBtn.classList.add('hidden');
                cancelBtn.textContent = 'Đóng';
                cancelBtn.onclick = () => modalOverlay.classList.add('hidden');
                executeBtn.onclick = null;
                modalOverlay.classList.remove('hidden');
            },

            async handleDownloadFile(savedFilename, originalFilename) {
                if (!savedFilename || savedFilename === "undefined") {
                    this.showErrorModal("Lỗi Tải File", "Không tìm thấy tên file (saved_filename) để tải. File có thể đã bị lỗi khi upload.");
                    return;
                }

                const downloadUrl = `/tc/files/download/${savedFilename}`;
                const token = sessionStorage.getItem("accessToken");

                const modalOverlay = document.getElementById('confirm-modal-overlay');
                const modalTitle = document.getElementById('confirm-modal-title');
                const modalMessage = document.getElementById('confirm-modal-message');
                const executeBtn = document.getElementById('execute-confirm-btn');
                const cancelBtn = document.getElementById('cancel-confirm-btn');

                if (!modalOverlay || !modalTitle || !modalMessage || !executeBtn || !cancelBtn) {
                    alert("Lỗi modal. Không thể hiển thị trạng thái tải.");
                    return;
                }

                const oldCancelOnclick = cancelBtn.onclick;

                modalTitle.textContent = "🔄 Đang Tải File";
                modalMessage.innerHTML = `<p style="text-align: center; padding: 15px;">Đang tải file: <strong>${originalFilename || savedFilename}</strong>...<br/>Vui lòng không đóng cửa sổ này.</p>`;
                executeBtn.classList.add('hidden');
                cancelBtn.textContent = 'Đang tải...';
                cancelBtn.disabled = true;
                modalOverlay.classList.remove('hidden');

                try {
                    const response = await fetch(downloadUrl, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `Không thể tải file (HTTP ${response.status})` }));
                        throw new Error(errorData.detail || `Lỗi HTTP ${response.status}`);
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = originalFilename || savedFilename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                    modalOverlay.classList.add('hidden');

                } catch (error) {
                    console.error("Lỗi khi tải file:", error);
                    modalTitle.textContent = "❌ Lỗi Tải File";
                    modalMessage.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word; text-align: left; font-size: 0.9em; color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 5px;">${error.message}</pre>`;
                    cancelBtn.textContent = 'Đóng';
                    cancelBtn.disabled = false;
                    cancelBtn.onclick = () => modalOverlay.classList.add('hidden');
                } finally {
                    if (modalTitle.textContent === "🔄 Đang Tải File") {
                        modalOverlay.classList.add('hidden');
                    }
                    cancelBtn.textContent = 'Đóng';
                    cancelBtn.disabled = false;
                    cancelBtn.onclick = oldCancelOnclick || (() => modalOverlay.classList.add('hidden'));
                }
            },

showConfirmDeleteTask(classId, taskId, taskTitle, taskType) {
                const modalOverlay = document.getElementById('confirm-modal-overlay');
                const modalTitle = document.getElementById('confirm-modal-title');
                const modalMessage = document.getElementById('confirm-modal-message');
                const executeBtn = document.getElementById('execute-confirm-btn');
                const cancelBtn = document.getElementById('cancel-confirm-btn');

                if (!modalOverlay) return;

                modalTitle.textContent = `Xác nhận Xóa ${taskType === 'assignment' ? 'Bài tập' : 'Tài liệu'}`;
                modalMessage.innerHTML = `
                    Bạn có chắc chắn muốn xóa **"${taskTitle}"** (Task ID: ${taskId}) không?
                    <br>
                    <strong style="color: #dc3545;">LƯU Ý: Hành động này không thể hoàn tác!</strong>
                `;
                
                executeBtn.textContent = 'Xác nhận Xóa';
                executeBtn.dataset.action = 'deleteTask';
                executeBtn.dataset.classId = classId;
                executeBtn.dataset.taskId = taskId;
                executeBtn.classList.remove('hidden');
                executeBtn.classList.replace('btn-primary', 'btn-danger'); // Đổi màu nút thành đỏ
                
                cancelBtn.textContent = 'Hủy';
                cancelBtn.onclick = () => {
                    modalOverlay.classList.add('hidden');
                    executeBtn.classList.replace('btn-danger', 'btn-primary'); // Khôi phục màu nút
                    executeBtn.dataset.action = '';
                };
                window.LecturerDashboardApp.Calendar.DOM.closeBtn.onclick = cancelBtn.onclick;

                // Gán trực tiếp hàm deleteTask (đã được định nghĩa) vào onclick
                // Sử dụng this.deleteTask để gọi phương thức của đối tượng ModalHandler
                executeBtn.onclick = () => this.deleteTask(classId, taskId, executeBtn, cancelBtn);

                modalOverlay.classList.remove('hidden');
            },

async deleteTask(classId, taskId, executeBtn, cancelBtn) {
                executeBtn.disabled = true;
                cancelBtn.disabled = true;
                const modalOverlay = document.getElementById('confirm-modal-overlay');
                
                // 🛑 FIXED: Chuyển sang sử dụng body string application/x-www-form-urlencoded
                const requestBody = `uploader_user_id=${lecId}`;

                try {
                    // API endpoint DELETE /tc/files/task/{task_id}/file
                    const response = await fetch(`/tc/files/task/${taskId}/file`, {
                        method: "DELETE",
                        headers: { 
                            // 🌟 KHAI BÁO CỤ THỂ Content-Type theo yêu cầu của Swagger
                            "Content-Type": "application/x-www-form-urlencoded", 
                            "Authorization": `Bearer ${token}` 
                        },
                        // Gửi chuỗi URL-encoded trong body
                        body: requestBody
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        // Lỗi 422 chi tiết sẽ được hiển thị
                        throw new Error(`Lỗi xóa Task/File (HTTP ${response.status}): ${JSON.stringify(errorData)}`);
                    }

                    alert(`✅ Đã xóa Task/File đính kèm (ID ${taskId}) thành công.`);

                    // 1. Đóng modal
                    modalOverlay.classList.add('hidden');
                    
                    // 2. Tải lại bảng Task
                    await window.LecturerDashboardApp.MyClasses.renderTasksTable();

                } catch (error) {
                    console.error("Lỗi khi xóa Task/File:", error);
                    window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi Xóa Task (422)", `Không thể xóa Task. Lỗi chi tiết:\n${error.message}`);
                } finally {
                    executeBtn.disabled = false;
                    cancelBtn.disabled = false;
                    executeBtn.classList.replace('btn-danger', 'btn-primary');
                }
            },
            showCreateTaskModal(classId) {
                const modalOverlay = document.getElementById('confirm-modal-overlay');
                const modalTitle = document.getElementById('confirm-modal-title');
                const modalBody = document.querySelector('#confirm-modal-overlay .modal-body');
                const executeBtn = document.getElementById('execute-confirm-btn');
                const cancelBtn = document.getElementById('cancel-confirm-btn');

                if (!modalOverlay) return;

                modalTitle.textContent = `Tạo Tài liệu/Bài tập mới cho lớp ${classId}`;
                const originalModalBodyHtml = modalBody.innerHTML;

                modalBody.innerHTML = `
                    <form id="create-task-form">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="task-type">Loại:</label>
                            <select id="task-type" name="task_type" class="form-control" required>
                                <option value="assignment">Bài tập (Assignment)</option>
                                <option value="material">Tài liệu (Material)</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="task-title">Tiêu đề:</label>
                            <input type="text" id="task-title" name="title" class="form-control" placeholder="Ví dụ: Bài tập 1" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="task-description">Mô tả (Tóm tắt):</label>
                            <textarea id="task-description" name="description" class="form-control" rows="3" required></textarea>
                        </div>
                        <div class="form-group" id="due-date-group" style="margin-bottom: 15px;">
                            <label for="task-due-date">Hạn chót (Chỉ cho Bài tập):</label>
                            <input type="date" id="task-due-date" name="due_date" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="task-file">Chọn File (Bắt buộc):</label>
                            <input type="file" id="task-file" name="file" class="form-control" style="height: auto;" required>
                        </div>
                    </form>
                `;

                const taskTypeSelect = document.getElementById('task-type');
                const dueDateGroup = document.getElementById('due-date-group');
                taskTypeSelect.addEventListener('change', () => {
                    dueDateGroup.style.display = (taskTypeSelect.value === 'assignment') ? 'block' : 'none';
                });
                taskTypeSelect.dispatchEvent(new Event('change'));

                executeBtn.textContent = 'Tạo Task';
                executeBtn.dataset.action = 'submitNewTask';
                executeBtn.classList.remove('hidden');
                cancelBtn.textContent = 'Hủy';

                const resetModal = () => {
                    modalBody.innerHTML = originalModalBodyHtml;
                    modalOverlay.classList.add('hidden');
                    window.LecturerDashboardApp.Calendar.DOM.executeBtn.dataset.action = '';
                    window.LecturerDashboardApp.Calendar.DOM.cancelBtn.onclick = () => modalOverlay.classList.add('hidden');
                };
                cancelBtn.onclick = resetModal;
                window.LecturerDashboardApp.Calendar.DOM.closeBtn.onclick = resetModal;


                executeBtn.onclick = async () => {
                    const form = document.getElementById('create-task-form');
                    if (!form.checkValidity()) {
                        alert("Vui lòng điền đầy đủ các trường bắt buộc.");
                        return;
                    }

                    const taskType = form.elements['task_type'].value;
                    const dueDate = form.elements['task-due-date'].value;
                    const file = form.elements['task-file'].files[0];

                    if (taskType === 'assignment') {
                        if (!dueDate) {
                            alert("‼️ Bài tập cần phải có Hạn chót.");
                            return;
                        }
                    
                        const selectedDate = new Date(dueDate);
                        const today = new Date();
                    
                        // Đặt thời gian "today" về 00:00:00 để chỉ so sánh ngày
                        selectedDate.setHours(0, 0, 0, 0);
                        today.setHours(0, 0, 0, 0);
                    
                        if (selectedDate <= today) {
                            alert("‼️ Hạn chót không thể nhỏ hơn ngày hiện tại.");
                            return;
                        }
                    }

                    if (!file) {
                        alert("Vui lòng chọn file đính kèm.");
                        return;
                    }

                    const formData = new FormData(form);
                    formData.set('class_id', classId);
                    formData.append('uploader_user_id', lecId);

                    if (dueDate) {
                        formData.set('due_date', new Date(dueDate).toISOString());
                    } else {
                        formData.delete('due_date');
                    }
                    formData.set('uploader_user_id', lecId.toString());

                    executeBtn.disabled = true;

                    try {
                        const response = await fetch(`/tc/files/class/${classId}/tasks`, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${token}` },
                            body: formData
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ detail: response.statusText || "Lỗi Server không rõ." }));
                            throw new Error(`Tạo Task thất bại (HTTP ${response.status}): ${errorData.detail}`);
                        }

                        const result = await response.json();
                        alert(`✅ Task "${result.title || formData.get('title')}" đã được tạo thành công!`);

                        resetModal();
                        await window.LecturerDashboardApp.MyClasses.renderTasksTable();

                    } catch (error) {
                        console.error("Lỗi khi tạo Task:", error);
                        window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi tạo Task", `Đã xảy ra lỗi khi tạo Task:\n${error.message}`);
                    } finally {
                        executeBtn.disabled = false;
                    }
                };

                modalOverlay.classList.remove('hidden');
            },

            async showTaskDetailModal(taskId, taskTitle, dueDate) {
                const modalOverlay = document.getElementById('confirm-modal-overlay');
                const modalTitle = document.getElementById('confirm-modal-title');
                const modalBody = document.querySelector('#confirm-modal-overlay .modal-body');
                const executeBtn = document.getElementById('execute-confirm-btn');
                const cancelBtn = document.getElementById('cancel-confirm-btn');

                if (!modalOverlay) return;

                modalTitle.textContent = `Bài Tập: ${taskTitle} (ID: ${taskId})`;
                const originalModalBodyHtml = modalBody.innerHTML;

                const resetModal = () => {
                    modalBody.innerHTML = originalModalBodyHtml;
                    modalOverlay.classList.add('hidden');
                    window.LecturerDashboardApp.Calendar.DOM.executeBtn.dataset.action = '';
                    window.LecturerDashboardApp.Calendar.DOM.cancelBtn.onclick = () => modalOverlay.classList.add('hidden');
                };
                cancelBtn.onclick = resetModal;
                window.LecturerDashboardApp.Calendar.DOM.closeBtn.onclick = resetModal;

                executeBtn.classList.add('hidden');
                cancelBtn.textContent = 'Đóng';

                modalBody.innerHTML = `
                    <div style="padding: 10px; border: 1px solid #ccc; border-radius: 5px; margin-bottom: 15px; background-color: #f8f9fa;">
                        <strong>Hạn chót:</strong> <span class="badge bg-danger" style="background-color: #dc3545; color: white; padding: 5px; border-radius: 3px; font-weight: bold;">${window.LecturerDashboardApp.formatDate(dueDate)}</span>
                        <div id="submission-summary" style="margin-top: 5px; font-weight: 500;"></div>
                    </div>
                    <h4 style="margin-bottom: 10px; color: #1e40af;">Danh sách Bài Nộp Sinh Viên</h4>
                    <div class="table-responsive">
                        <table class="table table-hover table-bordered table-striped" style="font-size: 0.9em;">
                            <thead style="background-color: #1e40af; color: white;">
                                <tr>
                                    <th style="width: 7%;">STT</th>
                                    <th style="width: 20%;">Họ tên (ID)</th>
                                    <th style="width: 25%;">File Nộp</th>
                                    <th style="width: 13%;">Trạng thái</th>
                                    <th style="width: 15%;">Ngày nộp</th>
                                    <th style="width: 8%;">Điểm</th>
                                    <th style="width: 10%;">Hành động</th>
                                </tr>
                            </thead>
                            <tbody id="submissions-table-body">
                                <tr><td colspan="7" style="text-align:center;">Đang tải dữ liệu bài nộp...</td></tr>
                            </tbody>
                        </table>
                    </div>
                `;

                modalOverlay.classList.remove('hidden');

                await this.fetchAndRenderSubmissions(taskId, modalBody);

                // Bind events cho table submissions
                document.getElementById('submissions-table-body')?.addEventListener('click', async (e) => {
                    const gradeBtn = e.target.closest('.grade-submission-btn');
                    if (gradeBtn) {
                        const submissionId = gradeBtn.dataset.submissionId;
                        const studentName = gradeBtn.dataset.studentName;
                        const currentGrade = gradeBtn.dataset.currentGrade;
                        const currentFeedback = gradeBtn.dataset.currentFeedback.replace(/&quot;/g, '"');
                        const savedFilename = gradeBtn.dataset.savedFilename;
                        const originalFilename = gradeBtn.dataset.originalFilename.replace(/&quot;/g, '"');

                        const taskModalHtml = modalBody.innerHTML;
                        await this.showGradeModal(
                            submissionId, studentName, taskId,
                            currentGrade, currentFeedback, taskModalHtml,
                            savedFilename, originalFilename
                        );
                    }
                });
            },

            async fetchAndRenderSubmissions(taskId, modalBody) {
                const tableBody = modalBody.querySelector('#submissions-table-body');
                const summaryDiv = modalBody.querySelector('#submission-summary');

                const modal = modalBody.closest('.modal-content') || modalBody.closest('.modal');
                if (modal) {
                    modal.style.maxWidth = '90%';
                    modal.style.width = '820px';
                }

                const modalTable = modalBody.querySelector('table');
                if (modalTable) {
                    modalTable.style.cssText = 'table-layout: fixed; width: 100%; font-size: 1.0rem;';
                    modalBody.querySelectorAll('style').forEach(s => s.remove());
                    const styleTag = document.createElement('style');
                    styleTag.textContent = `
                        .modal-body .table th, .modal-body .table td { 
                            padding: 14px 10px; vertical-align: middle; overflow: hidden; text-overflow: ellipsis;
                        }
                        .modal-body .table th:nth-child(1) { width: 7%; }
                        .modal-body .table th:nth-child(2) { width: 20%; }
                        .modal-body .table th:nth-child(3) { width: 25%; }
                        .modal-body .table th:nth-child(4) { width: 13%; }
                        .modal-body .table th:nth-child(5) { width: 15%; }
                        .modal-body .table th:nth-child(6) { width: 8%; }
                        .modal-body .table th:nth-child(7) { width: 10%; }
                        #submissions-table-body td:nth-child(2) { font-weight: 600; white-space: normal; }
                        #submissions-table-body td:nth-child(7) { text-align: center; } 
                        #submissions-table-body .submission-actions { 
                            display: flex; justify-content: center; align-items: center;
                        }
                        #submissions-table-body .btn-sm { 
                            padding: 6px 8px; font-size: 0.75rem; white-space: nowrap;
                        }
                    `;
                    modalBody.appendChild(styleTag);

                    const thead = modalBody.querySelector('thead tr');
                    if (thead) {
                        thead.innerHTML = `
                            <th>STT</th>
                            <th>Họ tên (ID)</th>
                            <th>File Nộp</th>
                            <th>Trạng thái</th>
                            <th>Ngày nộp</th>
                            <th>Điểm</th>
                            <th>Hành động</th>
                        `;
                    }
                }

                try {
                    const response = await fetch(`/tc/files/task/${taskId}/submissions`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: `Lỗi Server (HTTP ${response.status})` }));
                        throw new Error(`Lỗi tải submissions (HTTP ${response.status}): ${errorData.detail}`);
                    }

                    const submissions = await response.json();
                    const allSubmissionData = [];

                    submissions.forEach(sub => {
                        const studentName = sub.student?.user?.name || sub.student?.name || 'Tên không rõ';
                        const studentId = sub.student?.user_id || sub.student?.student_id || 'N/A';
                        
                        allSubmissionData.push({
                            status: sub.grade !== null ? 'graded' : 'submitted',
                            submission_id: sub.submission_id,
                            student_id: studentId,
                            student_name: studentName,
                            submission_date: sub.submission_date,
                            grade: sub.grade,
                            feedback_text: sub.feedback_text,
                            submitted_file: sub.submitted_file,
                        });
                    });

                    allSubmissionData.sort((a, b) => {
                        if (a.status === 'submitted' && b.status !== 'submitted') return -1;
                        if (b.status === 'submitted' && a.status !== 'submitted') return 1;
                        if (a.submission_date && b.submission_date) {
                            return new Date(b.submission_date) - new Date(a.submission_date);
                        }
                        return 0;
                    });

                    if (allSubmissionData.length === 0) {
                        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; font-style: italic; padding: 20px;">Chưa có bài nộp nào dành cho Task này.</td></tr>`;
                        summaryDiv.innerHTML = `<span class="badge bg-primary px-3 py-1 rounded-full bg-gray-500 text-white font-bold">Tổng Bài Nộp: 0</span>`;
                        return;
                    }

                    tableBody.innerHTML = allSubmissionData.map((data, index) => {
                        const dateDisplay = data.submission_date ? window.LecturerDashboardApp.formatDate(data.submission_date) : 'N/A';
                        let gradeDisplay = (data.grade !== null) ? parseFloat(data.grade).toFixed(1) : '-';

                        const originalFileName = data.submitted_file?.original_filename || 'file_loi.dat';
                        const savedFilename = data.submitted_file?.saved_filename;
                        const encodedOriginalFileNameOnClick = originalFileName.replace(/"/g, '&quot;').replace(/'/g, "\\'");
                        const encodedOriginalFileNameForData = originalFileName.replace(/"/g, '&quot;');
                        const fileName = data.submitted_file?.original_filename || 'File bị lỗi';
                        const displayFileName = fileName.length > 30 ? fileName.substring(0, 27) + '...' : fileName;

                        const currentGradeStr = data.grade !== null ? data.grade.toString() : '';
                        const currentFeedbackStr = data.feedback_text || '';
                        const encodedFeedback = currentFeedbackStr.replace(/"/g, '&quot;'); 
                        
                        const actions = `
                            <div class="submission-actions">
                                <button class="btn btn-sm bg-blue-500 hover:bg-blue-600 text-white download-file-btn" 
                                        onclick="window.LecturerDashboardApp.ModalHandler.handleDownloadFile('${savedFilename}', '${encodedOriginalFileNameOnClick}')"
                                        ${!savedFilename ? 'disabled title="Lỗi file"' : ''}>
                                    <i class="fas fa-download"></i>
                                </button>
                                <button class="btn btn-sm ${data.status === 'graded' ? 'bg-gray-500 hover:bg-gray-600' : 'btn-warning'} grade-submission-btn ml-1"
                                        data-submission-id="${data.submission_id}"
                                        data-student-name="${data.student_name}"
                                        data-current-grade="${currentGradeStr}"
                                        data-current-feedback="${encodedFeedback}"
                                        data-task-id="${taskId}"
                                        data-saved-filename="${savedFilename || ''}"
                                        data-original-filename="${encodedOriginalFileNameForData}">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </div>
                        `;

                        return `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${data.student_name}</td>
                                <td title="${fileName}">${displayFileName}</td>
                                <td>${window.LecturerDashboardApp.getStatusTag(data.status)}</td>
                                <td>${dateDisplay}</td>
                                <td style="font-weight: bold; color: ${data.grade !== null && parseFloat(data.grade) >= 5 ? '#16a34a' : (data.grade !== null ? '#dc2626' : 'inherit')}">${gradeDisplay}</td>
                                <td>${actions}</td>
                            </tr>
                        `;
                    }).join('');

                    const totalSubmissions = allSubmissionData.length;
                    const gradedCount = allSubmissionData.filter(s => s.grade !== null).length;
                    summaryDiv.innerHTML = `
                        <span class="badge bg-primary px-3 py-1 rounded-full bg-blue-700 text-white font-bold">Tổng Bài Nộp: ${totalSubmissions}</span>
                        <span class="badge bg-success px-3 py-1 rounded-full bg-green-600 text-white font-bold ml-3">Đã chấm: ${gradedCount}</span>
                        <span class="badge bg-warning px-3 py-1 rounded-full bg-yellow-600 text-white font-bold ml-3">Chưa chấm: ${totalSubmissions - gradedCount}</span>
                    `;

                } catch (error) {
                    console.error(`Lỗi khi tải bài nộp cho Task ${taskId}:`, error);
                    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red; padding: 20px;">Lỗi tải bài nộp. ${error.message}</td></tr>`;
                    summaryDiv.innerHTML = `<span class="badge bg-danger px-3 py-1 rounded-full bg-red-600 text-white">Lỗi tải dữ liệu.</span>`;
                }
            },


async showGradeModal(submissionId, studentName, taskId, currentGrade, currentFeedback, taskModalHtml, savedFilename, originalFilename) {
                const modalOverlay = document.getElementById('confirm-modal-overlay');
                const modalTitle = document.getElementById('confirm-modal-title');
                const modalBody = document.querySelector('#confirm-modal-overlay .modal-body');
                const executeBtn = document.getElementById('execute-confirm-btn');
                const cancelBtn = document.getElementById('cancel-confirm-btn');


                const resetToTaskDetailModal = () => {
                    modalTitle.textContent = `Bài Tập: ${window.LecturerDashboardApp.MyClasses.currentTask.title} (ID: ${taskId})`;
                    modalBody.innerHTML = taskModalHtml;
                    executeBtn.classList.add('hidden');
                    cancelBtn.textContent = 'Đóng';

                    cancelBtn.onclick = () => modalOverlay.classList.add('hidden');
                    window.LecturerDashboardApp.Calendar.DOM.closeBtn.onclick = () => modalOverlay.classList.add('hidden');

                    // Re-render và re-bind
                    setTimeout(() => {
                        window.LecturerDashboardApp.ModalHandler.fetchAndRenderSubmissions(taskId, modalBody);

                        modalBody.querySelector('#submissions-table-body')?.addEventListener('click', async (e) => {
                            const gradeBtn = e.target.closest('.grade-submission-btn');
                            if (gradeBtn) {
                                const subId = gradeBtn.dataset.submissionId;
                                const sName = gradeBtn.dataset.studentName;
                                const cGrade = gradeBtn.dataset.currentGrade;
                                const cFeedback = gradeBtn.dataset.currentFeedback.replace(/&quot;/g, '"');
                                const sFilename = gradeBtn.dataset.savedFilename;
                                const oFilename = gradeBtn.dataset.originalFilename.replace(/&quot;/g, '"');
                                
                                window.LecturerDashboardApp.ModalHandler.showGradeModal(
                                    subId, sName, taskId, 
                                    cGrade, cFeedback, taskModalHtml, 
                                    sFilename, oFilename
                                );
                            }
                        });
                    }, 0);
                };


                modalTitle.textContent = `Chấm Điểm Bài Nộp của SV: ${studentName}`;
                const encodedOriginalFileNameOnClick = (originalFilename || 'file').replace(/"/g, '&quot;').replace(/'/g, "\\'");

                modalBody.innerHTML = `
                    <form id="grade-form">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="submission-grade">Điểm (0-10):</label>
                            <input type="number" id="submission-grade" name="grade" class="form-control"
                                     min="0" max="10" step="0.1" required
                                     value="${currentGrade || ''}">
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="submission-feedback">Feedback cho Sinh viên:</label>
                            <textarea id="submission-feedback" name="feedback" class="form-control" rows="4">${currentFeedback || ''}</textarea>
                        </div>
                    </form>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                        <button class="btn btn-sm btn-info download-file-btn" 
                                 onclick="window.LecturerDashboardApp.ModalHandler.handleDownloadFile('${savedFilename}', '${encodedOriginalFileNameOnClick}')"
                                 ${!savedFilename ? 'disabled title="Lỗi file"' : ''}>
                            <i class="fas fa-download"></i> Tải File Bài Nộp
                        </button>
                    </div>
                `;

                executeBtn.textContent = 'Lưu Điểm';
                executeBtn.classList.remove('hidden');
                cancelBtn.textContent = 'Quay lại';
                cancelBtn.onclick = resetToTaskDetailModal;

                executeBtn.onclick = async () => {
                    const gradeInput = document.getElementById('submission-grade');
                    const grade = gradeInput.value;
                    const feedback = document.getElementById('submission-feedback').value;

                    if (!grade || parseFloat(grade) < 0 || parseFloat(grade) > 10) {
                        gradeInput.focus();
                        alert("Vui lòng nhập điểm hợp lệ từ 0 đến 10.");
                        return;
                    }

                    executeBtn.disabled = true;

                    // 🛑 ĐÃ SỬA: Chuyển sang sử dụng FormData vì API yêu cầu multipart/form-data
                    const formData = new FormData();
                    formData.append('grade', parseFloat(grade));
                    formData.append('feedback_text', feedback);
                    formData.append('uploader_user_id', lecId);
                    
                    // Thêm trường file rỗng (hoặc null) vì API yêu cầu file trong multipart/form-data
                    // Kiểm tra API Swagger (Hình 3) có ô "Send empty value" cho file.
                    formData.append('file', new Blob([""], { type: 'application/octet-stream' }));
                    
                    // Hoặc đơn giản hơn là không thêm gì nếu file không bắt buộc, 
                    // nhưng để an toàn theo multipart/form-data, ta nên truyền file (dù rỗng) hoặc đảm bảo trường file được chấp nhận là null/empty string
                    // Tùy theo logic API. Tôi sẽ giả định API chấp nhận null/empty string nếu không có file thực sự.

                    try {
                        const response = await fetch(`/tc/files/submission/${submissionId}/grade`, {
                            method: "PUT", // Giữ nguyên PUT đã sửa
                            headers: {
                                // KHÔNG CẦN Content-Type header khi dùng FormData, browser sẽ tự thêm boundary
                                "Authorization": `Bearer ${token}` 
                            },
                            body: formData // Gửi FormData object
                        });

                        if (!response.ok) {
                            // Cố gắng parse lỗi JSON, nếu không được thì trả về lỗi HTTP status
                            const errorData = await response.json().catch(() => ({ 
                                detail: `Lỗi Server (HTTP ${response.status}) hoặc định dạng phản hồi lỗi.`,
                                isJsonError: false
                            }));
                            
                            if (errorData.detail && errorData.isJsonError !== false) {
                                let errorMsg = errorData.detail.map(err => {
                                    // Xử lý lỗi validation chi tiết từ FastAPI/Pydantic (nếu có)
                                    if (err.loc && err.msg) {
                                        return `${err.loc.join(' -> ')}: ${err.msg}`;
                                    }
                                    return JSON.stringify(err);
                                }).join('\n');
                                throw new Error(`Lỗi định dạng dữ liệu (422):\n${errorMsg}`);
                            }

                            throw new Error(`Lỗi khi chấm điểm: ${errorData.detail || response.statusText}`);
                        }

                        alert(`✅ Đã lưu điểm ${grade} và Feedback thành công cho ${studentName}.`);
                        resetToTaskDetailModal();

                    } catch (error) {
                        console.error("Lỗi khi chấm điểm:", error);
                        window.LecturerDashboardApp.ModalHandler.showErrorModal("❌ Lỗi Chấm Điểm", `Đã xảy ra lỗi:\n${error.message}`);
                    } finally {
                        executeBtn.disabled = false;
                    }
                };
                modalOverlay.classList.remove('hidden');
            }
        }
    };

    // Khởi chạy ứng dụng
    window.LecturerDashboardApp.init();
});