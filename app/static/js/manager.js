document.addEventListener('DOMContentLoaded', async () => {

    const user = JSON.parse(sessionStorage.getItem("loggedInUser"));
    const token = sessionStorage.getItem("accessToken");
    const currentUserId = user?.id ?? user?.user_id;

    console.log(user);
    console.log(token);

    if (!user || !token) {
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
    // ==================================================================
    // DỮ LIỆU MẪU (Mock Data) - Được sử dụng để lưu trữ dữ liệu API
    // ==================================================================
    let MOCK_DATA = {
        summary: { students: 0, classes: 0, lecturers: 0, tickets: 0 },
        insights: {
            roleCounts: {}, 
            ticketTrend: { labels: [], data: [] } 
        },
        activeUsers: [], 
        // Dữ liệu này sẽ bị ghi đè bởi API
        pendingUsers: [],
        tickets: [], 
        announcements: [], 
        reports: {
            chartLabels: ['7 ngày', '14 ngày', '21 ngày', '28 ngày'],
            chartData: [0, 0, 0, 0] 
        }
    };
    
    // Global chart instances để tránh lỗi "Canvas already in use"
    let ticketTrendChart = null;
    let roleDistributionChart = null;


    // ===============================================
    // HELPER FUNCTIONS
    // ===============================================

    const Helpers = {
        getStatusTag(status) {
            let text, style;
            const lowerStatus = String(status).toLowerCase();
            switch (lowerStatus) {
                case 'active': text = 'Hoạt động'; style = 'background-color: #dcfce7; color: #16a34a;'; break;
                case 'pending': 
                case 'open': text = 'Chờ xử lý'; style = 'background-color: #fef3c7; color: #d97706;'; break;
                case 'in_progress': text = 'Đang xử lý'; style = 'background-color: #e0f2f1; color: #0f766e;'; break;
                case 'resolved': 
                case 'closed': text = 'Đã giải quyết'; style = 'background-color: #bfdbfe; color: #1e40af;'; break;
                case 'deactivated': text = 'Đã khóa'; style = 'background-color: #f1f5f9; color: #64748b;'; break;
                default: text = status; style = 'background-color: #f1f5f9; color: #64748b;';
            }
            return `<span class="status active" style="${style}">${text}</span>`;
        },
        
        getRoleDisplay(role) {
             const map = { 'lec': 'Giảng viên', 'tc': 'Tư vấn', 'cs': 'Chăm sóc HV', 'manager': 'Quản lý', 'student': 'Học viên', 'all': 'Tất cả' };
             return map[role.toLowerCase()] || role;
        },
        
        getRoleValue(roleDisplay) {
             const map = { 'Giảng viên': 'lec', 'Tư vấn': 'tc', 'Chăm sóc HV': 'cs', 'Quản lý': 'manager', 'Học viên': 'student' };
             return map[roleDisplay] || 'student'; 
        },
        
        getRoleId(roleValue) {
             // 1=manager, 2=tc, 3=cs, 4=lec, 5=student
             const map = { 'manager': 1, 'tc': 2, 'cs': 3, 'lec': 4, 'student': 5 };
             return map[roleValue.toLowerCase()] || 5; 
        },

        // HÀM MỚI: Dùng để tách tên và email từ mô tả ticket
parseStudentTicket(description) {
            if (!description) {
                return { name: 'N/A', email: 'N/A' };
            }

            // 1. Cố gắng tìm và parse chuỗi JSON
            const jsonStartMarker = "---JSON_DATA_START---";
            const jsonStartIndex = description.indexOf(jsonStartMarker);

            if (jsonStartIndex !== -1) {
                try {
                    // Cắt lấy phần JSON (bắt đầu sau marker)
                    let jsonString = description.substring(jsonStartIndex + jsonStartMarker.length).trim();
                    
                    // Loại bỏ bất kỳ ký tự không phải JSON nào ở cuối (như các ký tự \n)
                    const firstChar = jsonString.indexOf('[');
                    const lastChar = jsonString.lastIndexOf(']');
                    if(firstChar !== -1 && lastChar !== -1) {
                        jsonString = jsonString.substring(firstChar, lastChar + 1);
                    } else {
                         // Nếu không tìm thấy [ hoặc ] thì đây là lỗi format JSON
                         throw new Error("Missing JSON array markers.");
                    }

                    // Parse JSON: Response cho thấy đây là một MẢNG chứa 1 đối tượng
                    const dataArray = JSON.parse(jsonString);
                    
                    if (dataArray.length > 0) {
                        const studentData = dataArray[0];
                        return { 
                            name: studentData.name || 'N/A', 
                            email: studentData.email || 'N/A',
                            // Có thể cần lấy thêm password để dùng sau này (nếu cần)
                            password: studentData.password 
                        };
                    }
                } catch (e) {
                    console.warn("Lỗi phân tích JSON trong ticket_description. Quay lại phân tích Text.", e);
                }
            }

            // 2. Quay lại phương pháp phân tích Text cũ (nếu JSON thất bại hoặc không tồn tại)
            const nameMatch = description.match(/Họ tên: (.*?)(, Email:|$)/);
            const emailMatch = description.match(/Email: (.*)/);
            
            let name = nameMatch && nameMatch[1] ? nameMatch[1].trim() : 'N/A';
            let email = emailMatch && emailMatch[1] ? emailMatch[1].trim() : 'N/A';
            
            if (email.endsWith('.')) {
                email = email.slice(0, -1);
            }
            return { name, email };
        },

        parseDateForSort(dateString) {
            if (!dateString) return new Date(0);
             const parts = dateString.split(/[\/\-T]/);
             let date;
             if (parts.length >= 3 && parts[0].length === 4) { 
                 date = new Date(dateString);
             } else if (parts.length >= 3) { 
                 date = new Date(parts[2], parts[1] - 1, parts[0]); 
             } else {
                 date = new Date(dateString);
             }
             return isNaN(date) ? new Date(0) : date;
        },
        
        formatDate(dateString) {
             const date = Helpers.parseDateForSort(dateString);
             if (isNaN(date)) return dateString;
             return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        }
    };


    // ===============================================
    // MODULE CHÍNH
    // ===============================================

    const ManagerDashboardApp = {
        async init() {
            // Bước 1: Tải Summary
            await this.loadDashboardSummary();
            // Bước 2: Khởi tạo Module User và fetch users (cần thiết cho Role Chart)
            this.UserManagement.init();
            await this.UserManagement.fetchActiveUsers(); 

            // Bước 3: Khởi tạo Module Ticket và fetch tickets (cần thiết cho Ticket Chart)
            this.TicketManagement.init();
            await this.TicketManagement.fetchTickets();
            
            // Bước 4: Tính toán và vẽ biểu đồ insights
            this.calculateAllInsights();
            this.renderDashboardCharts(); 
            
            // Bước 5: Khởi tạo các module còn lại
            this.AnnouncementManagement.init();
            this.ReportManagement.init();
        },

        // ************** CÁC HÀM NỘI BỘ **************
        async loadDashboardSummary() {
            try {
                 // API GET /manager/dashboard 
                 const response = await fetch(`/manager/dashboard`, {
                     method: "GET",
                     headers: {
                         "Content-Type": "application/json",
                         "Authorization": `Bearer ${token}`
                     }
                 });

                 if (!response.ok) { 
                     throw new Error(`Request failed: ${response.status}`);
                 }

                 const data = await response.json();
                 
                 MOCK_DATA.summary.students = data.student_size || 0; 
                 MOCK_DATA.summary.classes = data.class_size || 0; 
                 MOCK_DATA.summary.lecturers = data.lecturer_size || 0; 
                 MOCK_DATA.summary.tickets = data.ticket_size || 0; 

            } catch (error) {
                 console.error("Lỗi khi tải Dashboard Summary:", error);
            }
            
            // Cập nhật giao diện
            const studentCard = document.querySelector('#dashboard .card-container .card:nth-child(1) h3');
            const classCard = document.querySelector('#dashboard .card-container .card:nth-child(2) h3');
            const lecturerCard = document.querySelector('#dashboard .card-container .card:nth-child(3) h3');
            const ticketCard = document.querySelector('#dashboard .card-container .card:nth-child(4) h3');

            if (studentCard) studentCard.textContent = MOCK_DATA.summary.students;
            if (classCard) classCard.textContent = MOCK_DATA.summary.classes;
            if (lecturerCard) lecturerCard.textContent = MOCK_DATA.summary.lecturers;
            if (ticketCard) ticketCard.textContent = MOCK_DATA.summary.tickets;
        },
        
        calculateAllInsights() {
            // 1. Phân bố Vai trò (Sử dụng dữ liệu từ API Users)
            const roleCounts = { 'Giảng viên': 0, 'Tư vấn': 0, 'Chăm sóc HV': 0, 'Quản lý': 0 };
            MOCK_DATA.activeUsers.forEach(user => {
                const roleDisplay = Helpers.getRoleDisplay(user.role);
                if (roleDisplay in roleCounts) {
                    roleCounts[roleDisplay]++;
                }
            });
            MOCK_DATA.insights.roleCounts = roleCounts;

            // 2. Xu hướng Ticket theo tuần (Sử dụng dữ liệu từ API Tickets)
            const trendData = this.calculateTicketTrend(MOCK_DATA.tickets);
            MOCK_DATA.insights.ticketTrend = trendData;
        },
        
        calculateTicketTrend(tickets) {
            const counts = {}; 
            const now = new Date();
            
            tickets.forEach(ticket => {
                const date = Helpers.parseDateForSort(ticket.created_at);
                if (isNaN(date)) return;
                
                const oneDay = 24 * 60 * 60 * 1000;
                const daysDiff = Math.round((now - date) / oneDay);
                
                let label;
                if (daysDiff <= 7) label = 'Tuần 4'; 
                else if (daysDiff <= 14) label = 'Tuần 3';
                else if (daysDiff <= 21) label = 'Tuần 2';
                else if (daysDiff <= 28) label = 'Tuần 1'; 
                else return; 

                counts[label] = (counts[label] || 0) + 1;
            });
            
            const sortedLabels = ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'];
            const data = sortedLabels.map(label => counts[label] || 0);

            return { labels: sortedLabels, data: data };
        },

        renderDashboardCharts() {
            this.renderTicketTrendChart(MOCK_DATA.insights.ticketTrend);
            this.renderRoleDistributionChart(MOCK_DATA.insights.roleCounts);
        },
        
        renderTicketTrendChart(data) {
            const ctx = document.getElementById('ticket-type-chart')?.getContext('2d');
            if (!ctx) return;
            
            if (ticketTrendChart) {
                ticketTrendChart.destroy();
            }

            ticketTrendChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Ticket được gửi',
                        data: data.data,
                        borderColor: '#4A6CF7',
                        backgroundColor: 'rgba(74, 108, 247, 0.1)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Số lượng'
                            },
                             ticks: {
                                precision: 0 
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: false,
                        }
                    }
                }
            });
        },
        
        renderRoleDistributionChart(data) {
            const ctx = document.getElementById('role-distribution-chart')?.getContext('2d');
            if (!ctx) return;
            
            if (roleDistributionChart) {
                roleDistributionChart.destroy();
            }

            const roles = ['Giảng viên', 'Tư vấn', 'Chăm sóc HV'];
            const counts = roles.map(role => data[role] || 0);

            roleDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: roles,
                    datasets: [{
                        label: 'Số lượng nhân sự',
                        data: counts,
                        backgroundColor: ['#4A6CF7', '#9B59B6', '#3498DB'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0 
                            },
                            title: {
                                display: true,
                                text: 'Số lượng'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: false,
                        }
                    }
                }
            });
        },
        // *******************************************


        // ==================================================================
        // MODULE QUẢN LÝ NGƯỜI DÙNG 
        // ==================================================================
        UserManagement: {
            isBatchMode: false,
            
            init() {
                this.DOM = {
                    tabs: document.querySelectorAll('.user-tab'),
                    activeUsersView: document.getElementById('active-users-view'),
                    pendingUsersView: document.getElementById('pending-users-view'),
                    activeTableBody: document.getElementById('users-table-body'),
                    pendingTableBody: document.getElementById('pending-users-table-body'),
                    searchActive: document.getElementById('user-search-input'), 
                    searchPending: document.getElementById('pending-user-search-input'), 
                    addBtn: document.getElementById('add-user-btn'),
                    
                    // Batch Mode DOM elements
                    batchToggleBtn: document.getElementById('batch-approve-toggle-btn'),
                    batchActionFooter: document.getElementById('batch-action-footer'),
                    cancelBatchBtn: document.getElementById('cancel-batch-btn'),
                    confirmBatchApproveBtn: document.getElementById('confirm-batch-approve-btn'),
                    pendingActionHeader: document.getElementById('pending-action-header'),
                    
                    // Modal Xác nhận
                    confirmModalOverlay: document.getElementById('batch-approve-confirm-modal-overlay'),
                    closeConfirmModalBtn: document.getElementById('close-batch-modal-btn'),
                    cancelConfirmBtn: document.getElementById('cancel-batch-confirm-btn'),
                    finalBatchApproveBtn: document.getElementById('final-batch-approve-btn'),
                    batchUsersList: document.getElementById('batch-users-list'),
                    
                    // Modal Sửa/Tạo
                    modalOverlay: document.getElementById('user-modal-overlay'),
                    modalTitle: document.getElementById('user-modal-title'),
                    saveBtn: document.getElementById('save-user-btn'),
                    form: document.getElementById('user-form'),
                    
                    // Các trường form
                    userIdInput: document.getElementById('user-id'),
                    userFullnameInput: document.getElementById('user-fullname'),
                    userEmailInput: document.getElementById('user-email'),
                    userRoleSelect: document.getElementById('user-role'),
                    userPasswordInput: document.getElementById('user-password'),
                };
                
                this.bindEvents();
                // Render lần đầu với dữ liệu đã được fetch/khởi tạo
                this.renderActiveUsers(MOCK_DATA.activeUsers); 
                
                // THAY ĐỔI: Gọi API mới ngay khi tải
                this.fetchPendingStudentRequests();
            },

            async fetchActiveUsers() {
                 if (this.DOM.activeTableBody) { 
                     this.DOM.activeTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Đang tải danh sách người dùng...</td></tr>`;
                 }
                
                try {
                    const response = await fetch(`/manager/users`, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`Không thể tải người dùng (HTTP ${response.status})`);
                    }

                    const users = await response.json();
                    
                    MOCK_DATA.activeUsers = users || []; 
                    
                    // SỬA LỖI: Gọi qua đối tượng chính ManagerDashboardApp
                    ManagerDashboardApp.calculateAllInsights();
                    ManagerDashboardApp.renderDashboardCharts();
                    
                    if (this.DOM.activeTableBody) {
                        this.renderActiveUsers(MOCK_DATA.activeUsers);
                    }
                    return users; 

                } catch (error) {
                    console.error("Lỗi khi tải người dùng đang hoạt động:", error);
                    if (this.DOM.activeTableBody) {
                        this.DOM.activeTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Lỗi tải dữ liệu người dùng.</td></tr>`;
                    }
                    MOCK_DATA.activeUsers = []; 
                    return [];
                }
            },

            // HÀM MỚI: Để gọi API lấy danh sách chờ duyệt
async fetchPendingStudentRequests() {
                if (this.DOM.pendingTableBody) {
                    this.DOM.pendingTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Đang tải danh sách chờ duyệt...</td></tr>`;
                }
                
                try {
                    // Endpoint API GET /manager/tickets/pending-student-requests
                    const response = await fetch(`/manager/tickets/pending-student-requests`, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        throw new Error(`Không thể tải danh sách chờ (HTTP ${response.status}): ${errorData.detail}`);
                    }

                    const tickets = await response.json();
                    
                    // PHẦN QUAN TRỌNG: Chuyển đổi dữ liệu ticket sang dạng user
                    const pendingUsers = tickets.map(ticket => {
                        // Sử dụng helper đã cập nhật, nhận cả password
                        const { name, email, password } = Helpers.parseStudentTicket(ticket.ticket_description || "");
                        
                        // ID thực chất là ticket_id, nhưng cần thiết cho việc Duyệt
                        return {
                            id: ticket.ticket_id, 
                            name: name,
                            email: email,
                            password: password, // Lưu trữ mật khẩu tạm thời
                            role: 'student', 
                            dateCreated: Helpers.formatDate(ticket.created_at)
                        };
                    });

                    MOCK_DATA.pendingUsers = pendingUsers; 
                    this.renderPendingUsers(MOCK_DATA.pendingUsers); 

                } catch (error) {
                    console.error("Lỗi khi tải danh sách chờ duyệt:", error);
                    if (this.DOM.pendingTableBody) {
                        this.DOM.pendingTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
                    }
                    MOCK_DATA.pendingUsers = [];
                }
            },
            
            bindEvents() {
                this.DOM.tabs.forEach(btn => btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab)));
                this.DOM.searchActive?.addEventListener('input', () => this.filterActiveUsers(this.DOM.searchActive.value));
                this.DOM.searchPending?.addEventListener('input', () => this.filterPendingUsers(this.DOM.searchPending.value));
                this.DOM.addBtn?.addEventListener('click', () => this.openModal('add'));
                this.DOM.activeTableBody?.addEventListener('click', (e) => this.handleTableActions(e));
                
                // Sự kiện Batch Approval
                this.DOM.batchToggleBtn?.addEventListener('click', () => this.toggleBatchMode());
                this.DOM.cancelBatchBtn?.addEventListener('click', () => this.toggleBatchMode(false));
                this.DOM.confirmBatchApproveBtn?.addEventListener('click', () => this.openBatchConfirmModal());
                this.DOM.finalBatchApproveBtn?.addEventListener('click', () => this.executeBatchApproval());
                this.DOM.cancelConfirmBtn?.addEventListener('click', () => this.closeBatchConfirmModal());
                this.DOM.closeConfirmModalBtn?.addEventListener('click', () => this.closeBatchConfirmModal());
                this.DOM.pendingTableBody?.addEventListener('click', (e) => this.handlePendingTableActions(e));
                
                // Sự kiện Modal Sửa/Tạo
                this.DOM.form?.addEventListener('submit', (e) => this.handleSave(e));
                document.getElementById('close-user-modal-btn')?.addEventListener('click', () => this.closeModal());
                document.getElementById('cancel-user-modal-btn')?.addEventListener('click', () => this.closeModal());
            },

            toggleBatchMode(force = null) {
                this.isBatchMode = force === null ? !this.isBatchMode : force;
                
                if (this.DOM.pendingActionHeader && this.DOM.batchToggleBtn && this.DOM.batchActionFooter) {
                    if (this.isBatchMode) {
                        this.DOM.pendingActionHeader.innerHTML = '<input type="checkbox" id="select-all-pending">';
                        this.DOM.batchToggleBtn.classList.remove('btn-warning');
                        this.DOM.batchToggleBtn.classList.add('btn-secondary');
                        this.DOM.batchToggleBtn.innerHTML = '<i class="fas fa-times"></i> Hủy duyệt hàng loạt';
                        this.DOM.batchActionFooter.classList.remove('hidden');
                        const selectAll = document.getElementById('select-all-pending');
                        if (selectAll) selectAll.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
                    } else {
                        this.DOM.pendingActionHeader.textContent = 'Hành động';
                        this.DOM.batchToggleBtn.classList.remove('btn-secondary');
                        this.DOM.batchToggleBtn.classList.add('btn-warning');
                        this.DOM.batchToggleBtn.innerHTML = '<i class="fas fa-list-check"></i> Duyệt hàng loạt';
                        this.DOM.batchActionFooter.classList.add('hidden');
                    }
                }
                this.renderPendingUsers(MOCK_DATA.pendingUsers); 
                this.updateBatchCount();
            },
            
            toggleSelectAll(checked) {
                this.DOM.pendingTableBody?.querySelectorAll('.user-checkbox').forEach(cb => {
                    cb.checked = checked;
                });
                this.updateBatchCount();
            },
            
            updateBatchCount() {
                const count = this.DOM.pendingTableBody?.querySelectorAll('.user-checkbox:checked').length || 0;
                if (this.DOM.confirmBatchApproveBtn) {
                   this.DOM.confirmBatchApproveBtn.innerHTML = `<i class="fas fa-check-double"></i> Duyệt (${count}) tài khoản đã chọn`;
                   this.DOM.confirmBatchApproveBtn.disabled = count === 0;
                }
            },

            openBatchConfirmModal() {
                const checkedBoxes = this.DOM.pendingTableBody?.querySelectorAll('.user-checkbox:checked') || [];
                const selectedUserIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);

                if (selectedUserIds.length === 0) {
                    alert('Vui lòng chọn ít nhất một tài khoản để duyệt.');
                    return;
                }

                const selectedUsers = MOCK_DATA.pendingUsers.filter(u => selectedUserIds.includes(String(u.id)));
                
                if (this.DOM.batchUsersList) {
                    this.DOM.batchUsersList.innerHTML = '';
                    selectedUsers.forEach(user => {
                        const listItem = document.createElement('li');
                        listItem.textContent = `${user.name} (${user.id}) - Vai trò: ${Helpers.getRoleDisplay(user.role)}`;
                        this.DOM.batchUsersList.appendChild(listItem);
                    });
                }

                if (this.DOM.finalBatchApproveBtn && this.DOM.confirmModalOverlay) {
                    this.DOM.finalBatchApproveBtn.dataset.ids = selectedUserIds.join(',');
                    this.DOM.confirmModalOverlay.classList.remove('hidden');
                }
            },
            
            closeBatchConfirmModal() {
                this.DOM.confirmModalOverlay?.classList.add('hidden');
            },
            
async executeBatchApproval() {
                const idsToApprove = this.DOM.finalBatchApproveBtn.dataset.ids.split(',');
                if (idsToApprove.length === 0) return;

                this.closeBatchConfirmModal();

                // Chuyển mảng string IDs sang mảng integer IDs
                const ticketIdsAsInt = idsToApprove.map(id => parseInt(id));

                try {
                    // MỚI: Gọi API một lần duy nhất
                    const apiUrl = `/manager/tickets/approve`;
                    const requestBody = {
                        ticket_ids: ticketIdsAsInt,
                        activate_student: true
                    };
                    
                    const response = await fetch(apiUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        throw new Error(`Lỗi Server (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                    }

                    // API thành công cho tất cả
                    alert(`✅ Đã duyệt thành công ${ticketIdsAsInt.length} tài khoản!`);

                } catch (error) {
                    // API thất bại
                    console.error("Lỗi khi duyệt hàng loạt:", error);
                    alert(`❌ Lỗi duyệt hàng loạt: ${error.message}.`);
                } finally {
                    // Luôn luôn tải lại dữ liệu bất kể thành công hay thất bại
                    this.toggleBatchMode(false);
                    this.fetchPendingStudentRequests(); // Tải lại danh sách chờ
                    this.fetchActiveUsers(); // Tải lại danh sách active
                    ManagerDashboardApp.loadDashboardSummary(); // Cập nhật summary
                }
            },
            
            switchTab(targetTab) {
                this.isBatchMode = false;
                this.DOM.batchActionFooter?.classList.add('hidden');
                if (this.DOM.pendingActionHeader) {
                    this.DOM.pendingActionHeader.textContent = 'Hành động';
                }
                if (this.DOM.batchToggleBtn) {
                    this.DOM.batchToggleBtn.classList.remove('btn-secondary');
                    this.DOM.batchToggleBtn.classList.add('btn-warning');
                    this.DOM.batchToggleBtn.innerHTML = '<i class="fas fa-list-check"></i> Duyệt hàng loạt';
                }
                
                this.DOM.tabs.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === targetTab));
                this.DOM.activeUsersView?.classList.toggle('active', targetTab === 'active-users-view');
                this.DOM.activeUsersView?.classList.toggle('hidden', targetTab !== 'active-users-view');
                this.DOM.pendingUsersView?.classList.toggle('active', targetTab === 'pending-users-view');
                this.DOM.pendingUsersView?.classList.toggle('hidden', targetTab !== 'pending-users-view');
                
                // Khi chuyển tab, fetch lại dữ liệu mới nhất
                if (targetTab === 'pending-users-view') {
                    if (this.DOM.searchPending) this.DOM.searchPending.value = '';
                    // GỌI API ĐỂ REFRESH
                    this.fetchPendingStudentRequests(); 
                } else if (targetTab === 'active-users-view') {
                    if (this.DOM.searchActive) this.DOM.searchActive.value = '';
                    this.fetchActiveUsers(); // Bắt đầu fetch khi chuyển sang tab Active
                }
            },
            
            renderActiveUsers(users) {
                if (!this.DOM.activeTableBody) return;

                this.DOM.activeTableBody.innerHTML = '';
                
                if (!users || users.length === 0) {
                     this.DOM.activeTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Không có người dùng đang hoạt động nào.</td></tr>`;
                    return;
                }

                users.forEach(user => {
                    const row = this.DOM.activeTableBody.insertRow();
                    
                    const isLocked = user.status && user.status.toLowerCase() === 'deactivated';
                    
                    let lockUnlockButton;
                    if (isLocked) {
                        lockUnlockButton = `<button class="btn btn-success btn-sm unlock-btn" data-id="${user.user_id}"><i class="fas fa-lock-open"></i> Mở khóa</button>`;
                    } else {
                        lockUnlockButton = `<button class="btn btn-warning btn-sm lock-btn" data-id="${user.user_id}"><i class="fas fa-lock"></i> Khóa</button>`;
                    }
                    
                    row.innerHTML = `
                        <td>${user.user_id}</td>
                        <td>${user.name}</td>
                        <td>${user.email}</td>
                        <td>${Helpers.getRoleDisplay(user.role)}</td>
                        <td>${Helpers.getStatusTag(user.status)}</td>
                        <td>
                            ${lockUnlockButton}
                            <button class="btn btn-secondary btn-sm edit-btn" data-id="${user.user_id}"><i class="fas fa-edit"></i> Sửa</button>
                        </td>
                    `;
                });
            },

renderPendingUsers(users) {
                if (!this.DOM.pendingTableBody) return;
                
                this.DOM.pendingTableBody.innerHTML = '';
                if (users.length === 0) {
                    this.DOM.pendingTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Không có tài khoản nào đang chờ duyệt.</td></tr>`;
                    return;
                }
                users.forEach(user => {
                    const row = this.DOM.pendingTableBody.insertRow();
                    
                    // NỘI DUNG CỦA CỘT HÀNH ĐỘNG (Bây giờ nó là cột CUỐI CÙNG)
                    const actionCellContent = this.isBatchMode 
                        ? `<input type="checkbox" class="user-checkbox" data-id="${user.id}" data-name="${user.name}">`
                        : `
                              <button class="btn btn-primary btn-sm approve-btn" data-id="${user.id}"><i class="fas fa-check"></i> Duyệt</button>
                              <button class="btn btn-danger btn-sm reject-btn" data-id="${user.id}"><i class="fas fa-times"></i> Từ chối</button>
                            `;
                            
                    // SỬA: Đã sắp xếp lại các ô trong hàng (Action chuyển ra cuối)
                    row.innerHTML = `
                        <td>${user.id}</td>
                        <td>${user.name}</td>
                        <td>${user.email}</td>
                        <td>${Helpers.getRoleDisplay(user.role)}</td>
                        <td>${user.dateCreated}</td>
                        <td class="action-cell">${actionCellContent}</td> 
                    `;
                });
                
                // Cập nhật lại số lượng nếu đang ở chế độ Batch Mode
                if (this.isBatchMode) {
                    this.updateBatchCount();
                }
            },

            filterActiveUsers(searchTerm) {
                const lowerCaseTerm = searchTerm.toLowerCase();
                const filtered = MOCK_DATA.activeUsers.filter(user => 
                    (user.name && user.name.toLowerCase().includes(lowerCaseTerm)) || 
                    (user.email && user.email.toLowerCase().includes(lowerCaseTerm))
                );
                this.renderActiveUsers(filtered);
            },
            
            filterPendingUsers(searchTerm) {
                const lowerCaseTerm = searchTerm.toLowerCase();
                const filtered = MOCK_DATA.pendingUsers.filter(user => 
                    user.name.toLowerCase().includes(lowerCaseTerm) || 
                    user.email.toLowerCase().includes(lowerCaseTerm)
                );
                this.renderPendingUsers(filtered);
            },
            
            handlePendingTableActions(e) {
                const target = e.target;
                
                if (this.isBatchMode && target.classList.contains('user-checkbox')) {
                    this.updateBatchCount();
                    return;
                }
                
                const button = target.closest('button');
                if (!button || this.isBatchMode) return;
                
                const userId = button.dataset.id;
                
                if (button.classList.contains('approve-btn')) {
                    this.approveUser(userId);
                } else if (button.classList.contains('reject-btn')) {
                    this.rejectUser(userId);
                }
            },
            
async approveUser(ticketId) {
                // ID bây giờ là ticketId
                if (!confirm(`Bạn có chắc chắn muốn DUYỆT yêu cầu ID ${ticketId} không?`)) {
                    return;
                }

                try {
                    // MỚI: API và body
                    const apiUrl = `/manager/tickets/approve`;
                    const requestBody = {
                        ticket_ids: [parseInt(ticketId)], // Gửi ID trong một mảng
                        activate_student: true           // Kích hoạt học sinh
                    };
                    
                    const response = await fetch(apiUrl, {
                        method: "POST", // Method là POST
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify(requestBody) // Gửi body
                    });

                    if (!response.ok) { 
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        throw new Error(`Lỗi Server (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                    }
                    
                    alert(`✅ Đã duyệt thành công yêu cầu ${ticketId}.`);
                    this.fetchPendingStudentRequests(); // Tải lại danh sách chờ
                    this.fetchActiveUsers(); // Tải lại danh sách active
                    ManagerDashboardApp.loadDashboardSummary(); 

                } catch (error) {
                    console.error("Lỗi khi duyệt yêu cầu:", error);
                    alert(`❌ Lỗi duyệt yêu cầu: ${error.message}.`);
                }
            },

async rejectUser(ticketId) {
                if (!confirm(`Bạn có chắc chắn muốn TỪ CHỐI yêu cầu ID ${ticketId} không?`)) {
                    return;
                }

                try {
                    // 1. Sửa URL endpoint theo API trong ảnh
                    const apiUrl = `/manager/tickets/reject`;
                    
                    // 2. Chuẩn bị dữ liệu body theo yêu cầu của API (ảnh)
                    // API yêu cầu một object với key "ticket_ids" là một mảng (array)
                    const requestBody = {
                        "ticket_ids": [ticketId] 
                    };

                    const response = await fetch(apiUrl, {
                        method: "POST", // Giữ nguyên method POST
                        headers: { 
                            "Authorization": `Bearer ${token}`,
                            // 3. Thêm header Content-Type vì ta gửi JSON body
                            "Content-Type": "application/json"
                        },
                        // 4. Gửi dữ liệu trong body (đã được JSON.stringify)
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        // Cố gắng đọc chi tiết lỗi từ server (nếu có)
                        let errorDetails = `Lỗi Server (HTTP ${response.status})`;
                        try {
                            const errorData = await response.json();
                            // Thường lỗi sẽ nằm trong key 'detail' của FastAPI
                            errorDetails = errorData.detail || JSON.stringify(errorData); 
                        } catch (e) {
                            // Nếu server không trả về JSON, đọc text
                            errorDetails = await response.text();
                        }
                        throw new Error(errorDetails);
                    }
                    
                    alert(`Đã từ chối yêu cầu ${ticketId}.`);
                    this.fetchPendingStudentRequests(); // Tải lại danh sách

                } catch (error) {
                    console.error("Lỗi khi từ chối yêu cầu:", error);
                    // Hiển thị thông báo lỗi chi tiết hơn
                    alert(`❌ Lỗi từ chối yêu cầu: ${error.message}.`);
                }
            },
            
            handleTableActions(e) {
                const target = e.target.closest('button');
                if (!target) return;
                const userId = target.dataset.id; 
                
                if (target.classList.contains('edit-btn')) {
                    const user = MOCK_DATA.activeUsers.find(u => String(u.user_id) === String(userId));
                    console.log(user);
                    if (user) this.openModal('edit', user);
                } else if (target.classList.contains('delete-btn')) {
                    if (confirm(`Bạn có chắc chắn muốn xóa người dùng ID ${userId} không?`)) {
                        // 💡 CẦN GỌI API DELETE Ở ĐÂY
                        MOCK_DATA.activeUsers = MOCK_DATA.activeUsers.filter(u => String(u.user_id) !== String(userId));
                        this.renderActiveUsers(MOCK_DATA.activeUsers);
                        alert(`Đã xóa người dùng ${userId}.`);
                    }
                } else if (target.classList.contains('unlock-btn')) {
                    this.changeUserStatus(userId, 'activate');
                } else if (target.classList.contains('lock-btn')) {
                    this.changeUserStatus(userId, 'deactivate');
                }
            },
            
            async changeUserStatus(userId, mode) {
                const actionText = mode === 'activate' ? 'MỞ KHÓA' : 'KHÓA';
                if (!confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản ID ${userId} không?`)) {
                    return;
                }
                
                try {
                    // API POST /manager/users/{user_id}/deactive?mode={activate/deactivate}
                    const response = await fetch(`/manager/users/${userId}/status?mode=${mode}`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        }
                    });

                    if (response.status !== 204) {
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        throw new Error(`Lỗi Server (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                    }
                    
                    alert(`✅ ${actionText} tài khoản ${userId} thành công!`);
                    this.fetchActiveUsers(); 
                    // SỬA LỖI: Gọi qua đối tượng chính ManagerDashboardApp
                    ManagerDashboardApp.calculateAllInsights();
                    ManagerDashboardApp.renderDashboardCharts();

                } catch (error) {
                    console.error(`Lỗi khi ${actionText} người dùng:`, error);
                    alert(`❌ Lỗi ${actionText} người dùng: ${error.message}.`);
                }
            },
            
            openModal(mode, user = {}) {
                if (!this.DOM.modalTitle || !this.DOM.form || !this.DOM.saveBtn || !this.DOM.modalOverlay) return;

                this.DOM.modalTitle.textContent = mode === 'add' ? 'Thêm người dùng mới' : `Sửa người dùng ${user.user_id || user.id}`;
                this.DOM.form.reset();
                
                if (mode === 'edit') {
                    console.log(user.name);
                    if (this.DOM.userIdInput) this.DOM.userIdInput.value = user.user_id;
                    if (this.DOM.userFullnameInput) this.DOM.userFullnameInput.value = user.name;
                    if (this.DOM.userEmailInput) this.DOM.userEmailInput.value = user.email; this.DOM.userEmailInput.readOnly = true;
                    
                    const roleValue = Helpers.getRoleValue(user.role); 
                    if (this.DOM.userRoleSelect) this.DOM.userRoleSelect.value = roleValue || user.role; 
                    if (this.DOM.userPasswordInput) this.DOM.userPasswordInput.placeholder = 'Để trống nếu không muốn thay đổi';
                    
                    this.DOM.form.dataset.userStatus = user.status;
                    this.DOM.form.dataset.originalRole = user.role; 
                    
                } else {
                    if (this.DOM.userEmailInput) {
                        this.DOM.userEmailInput.readOnly = false;
                    }
                    
                    if (this.DOM.userIdInput) this.DOM.userIdInput.value = '';
                    if (this.DOM.userPasswordInput) this.DOM.userPasswordInput.placeholder = 'Nhập mật khẩu';
                }
                
                this.DOM.saveBtn.textContent = mode === 'add' ? 'Tạo tài khoản' : 'Lưu thay đổi';
                this.DOM.modalOverlay.classList.remove('hidden');
            },
            
            closeModal() {
                this.DOM.modalOverlay?.classList.add('hidden');
            },
            
            async handleSave(e) {
                e.preventDefault();
                if (!this.DOM.form || !this.DOM.saveBtn) return;
                
                const formData = new FormData(this.DOM.form);
                const data = Object.fromEntries(formData.entries());
                const mode = data.id ? 'edit' : 'add';

                this.DOM.saveBtn.disabled = true;
                console.log(data);

                if (mode === 'add') {
                    // API TẠO USER (POST /manager/users)

                    try {
                        const newPassword = data.password.trim();
                        const newRoleValue = data.role || '';

                        if (newRoleValue === '') {
                            alert("Vui lòng chọn vai trò khi tạo người dùng mới.");
                            this.DOM.saveBtn.disabled = false;
                            return;
                        }
                        
                        if (!newPassword) {
                            alert("Vui lòng nhập mật khẩu khi tạo người dùng mới.");
                            this.DOM.saveBtn.disabled = false;
                            return;
                        }
                        
                        
                        const requestBody = {
                            name: data.name.trim(),
                            email: data.email.trim(),
                            password: newPassword,
                            role_id: Helpers.getRoleId(newRoleValue) 
                        };
                        

                        const response = await fetch(`/manager/users`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify(requestBody)
                        });

                        if (response.status !== 201) {
                            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                            throw new Error(`Lỗi từ Server khi tạo (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                        }
                        
                        alert(`✅ Tạo người dùng ${requestBody.name} thành công!`);
                        this.fetchActiveUsers(); 

                    } catch (error) {
                        console.error("Lỗi khi tạo người dùng:", error);
                        alert(`❌ Lỗi tạo người dùng: ${error.message}.`);
                    } finally {
                        this.DOM.saveBtn.disabled = false;
                        this.closeModal();
                    }
                    
                } else {
                    // API SỬA USER (PUT /manager/users/{user_id})
                    const userId = parseInt(data.id); 
                    
                    try {
                        const newPassword = data.password.trim();
                        const originalStatus = this.DOM.form.dataset.userStatus || 'active'; 
                        const newRoleValue = data.role || ''; 
                        
                        if (userId === 1 && newRoleValue !== 'manager') {
                            alert("❌ Bạn không thể thay đổi vai trò của mình. ❌");
                            this.DOM.saveBtn.disabled = false;
                            return;
                        }

                        if (newRoleValue === '') {
                            alert("Vui lòng chọn vai trò khi tạo người dùng mới.");
                            this.DOM.saveBtn.disabled = false;
                            return;
                        }
                                                
                        const requestBody = {
                            name: data.name ? data.name.trim() : '', 
                            email: data.email,
                            role_id: Helpers.getRoleId(newRoleValue), 
                            status: originalStatus
                        };
                        
                        if (newPassword) {
                            requestBody.password = newPassword;
                        }

                        const response = await fetch(`/manager/users/${userId}`, {
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify(requestBody)
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                            throw new Error(`Lỗi từ Server khi cập nhật (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                        }
                        
                        alert(`✅ Cập nhật người dùng ${userId} thành công!`);
                        
                        this.fetchActiveUsers(); 

                    } catch (error) {
                        console.error("Lỗi khi cập nhật người dùng:", error);
                        alert(`❌ Lỗi cập nhật người dùng: ${error.message}.`);
                    } finally {
                        this.DOM.saveBtn.disabled = false;
                        this.closeModal();
                    }
                }
                
                if (document.querySelector('.user-tab[data-tab="pending-users-view"]')?.classList.contains('active')) {
                     this.renderPendingUsers(MOCK_DATA.pendingUsers);
                }
            }
        },

        // ==================================================================
        // MODULE QUẢN LÝ TICKET 
        // ==================================================================
        TicketManagement: {
            init() {
                this.DOM = {
                    tableBody: document.getElementById('manager-ticket-table-body'),
                    filterStatus: document.getElementById('ticket-filter-status'),
                    filterType: document.getElementById('ticket-filter-type'),
                    // BỔ SUNG DOM ELEMENT MỚI
                    filterSort: document.getElementById('ticket-sort-date'), 
                    modalOverlay: document.getElementById('ticket-detail-modal-overlay'),
                    closeModalBtn: document.getElementById('close-ticket-detail-modal-btn'),
                    resolveBtn: document.getElementById('resolve-ticket-btn'),
                    closeBtn: document.getElementById('close-ticket-btn'),
                };
                this.bindEvents();
                // fetchTickets đã được gọi trong ManagerDashboardApp.init()
            },
            
            async fetchTickets() {
                if (this.DOM.tableBody) {
                     this.DOM.tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Đang tải danh sách Ticket...</td></tr>`;
                }

                try {
                     // API GET /tc/get_tickets
                     const response = await fetch(`/tc/tickets/all`, {
                         method: "GET",
                         headers: { "Authorization": `Bearer ${token}` }
                     });
                     
                     if (!response.ok) {
                         const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                         throw new Error(`Failed to fetch tickets (HTTP ${response.status}): ${errorData.detail}`);
                     }

                     const data = await response.json();
                     MOCK_DATA.tickets = data || [];
                     
                     ManagerDashboardApp.loadDashboardSummary();
                     ManagerDashboardApp.calculateAllInsights();
                     ManagerDashboardApp.renderDashboardCharts();

                 } catch (error) {
                     console.error("Lỗi khi tải Ticket:", error);
                     if (this.DOM.tableBody) {
                         this.DOM.tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">Lỗi tải dữ liệu Ticket: ${error.message}.</td></tr>`;
                     }
                     MOCK_DATA.tickets = [];
                 }
                 
                 this.renderTickets();
            },

            bindEvents() {
                this.DOM.filterStatus?.addEventListener('change', () => this.renderTickets());
                this.DOM.filterType?.addEventListener('change', () => this.renderTickets());
                // THÊM: Lắng nghe sự kiện đổi giá trị Sắp xếp
                this.DOM.filterSort?.addEventListener('change', () => this.renderTickets());
                
                this.DOM.tableBody?.addEventListener('click', (e) => this.handleTableActions(e));
                this.DOM.closeModalBtn?.addEventListener('click', () => this.closeModal());
                this.DOM.closeBtn?.addEventListener('click', () => this.closeModal());
                this.DOM.resolveBtn?.addEventListener('click', () => this.resolveTicket());
            },

            renderTickets() {
                if (!this.DOM.tableBody) return;
                
                this.DOM.tableBody.innerHTML = '';
                const selectedStatus = this.DOM.filterStatus?.value || 'all';
                const selectedType = this.DOM.filterType?.value || 'all';
                const selectedSort = this.DOM.filterSort?.value || 'newest'; // Lấy giá trị sắp xếp

                let filteredTickets = MOCK_DATA.tickets;    
                
                // 1. Lọc theo Trạng thái (đã sửa lỗi an toàn)
                if (selectedStatus !== 'all') {
                    const lowerSelectedStatus = selectedStatus.toLowerCase();
                    filteredTickets = filteredTickets.filter(t => 
                        (String(t.status || '')).toLowerCase() === lowerSelectedStatus
                    );
                }
                
                // 2. Lọc theo Loại Ticket
                if (selectedType !== 'all') {
                    const lowerSelectedType = selectedType.replace('_', ' ').toLowerCase();
                    filteredTickets = filteredTickets.filter(t => 
                        (String(t.issue_type || '')).toLowerCase().includes(lowerSelectedType)
                    );
                }
                
                // 3. Sắp xếp theo Ngày tạo
                filteredTickets.sort((a, b) => {
                    const dateA = Helpers.parseDateForSort(a.created_at);
                    const dateB = Helpers.parseDateForSort(b.created_at);
                    
                    if (selectedSort === 'oldest') {
                        return dateA - dateB; // Cũ nhất lên trước
                    } else { // 'newest'
                        return dateB - dateA; // Mới nhất lên trước
                    }
                });

                if (filteredTickets.length === 0) {
                     this.DOM.tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Không tìm thấy ticket nào.</td></tr>`;
                     return;
                }

                // 4. Render
                filteredTickets.forEach(ticket => {
                    const row = this.DOM.tableBody.insertRow();
                    row.innerHTML = `
                        <td>${ticket.issue_type || 'N/A'}</td>
                        <td>${ticket.title || 'N/A'}</td>

                        <td>${Helpers.getStatusTag(ticket.status)}</td>
                        <td>${Helpers.formatDate(ticket.created_at)}</td>
                        <td>
                            <button class="btn btn-primary btn-sm view-detail-btn" data-id="${ticket.ticket_id}"><i class="fas fa-eye"></i> Xem</button>
                        </td>
                    `;
                });
            },

            handleTableActions(e) {
                const btn = e.target.closest('.view-detail-btn');
                if (btn) {
                    const ticketId = parseInt(btn.dataset.id);
                    const ticket = MOCK_DATA.tickets.find(t => t.ticket_id === ticketId);
                    if (ticket) this.openModal(ticket);
                }
            },

            openModal(ticket) {
                if (!this.DOM.resolveBtn || !this.DOM.modalOverlay) return;

                document.getElementById('detail-ticket-id').textContent = ticket.ticket_id;
                document.getElementById('detail-ticket-title').textContent = ticket.title || 'N/A';
                document.getElementById('detail-ticket-type').textContent = ticket.issue_type || 'N/A';
                document.getElementById('detail-ticket-status').innerHTML = Helpers.getStatusTag(ticket.status);
                document.getElementById('detail-ticket-sender').textContent = ticket.submitted_by || 'N/A';
                document.getElementById('detail-ticket-cs').textContent = ticket.assigned_to || 'N/A';
                document.getElementById('detail-ticket-description').value = ticket.description || '';
                
                const resolutionTextarea = document.getElementById('manager-resolution');
                if (resolutionTextarea) {
                     resolutionTextarea.value = ticket.resolution || ''; 
                     resolutionTextarea.readOnly = ticket.status && ticket.status.toLowerCase() === 'resolved';
                }

                this.DOM.resolveBtn.dataset.id = ticket.ticket_id;
                this.DOM.resolveBtn.style.display = ticket.status && ticket.status.toLowerCase() !== 'resolved' ? 'inline-block' : 'none';
                
                this.DOM.modalOverlay.classList.remove('hidden');
            },

            closeModal() {
                this.DOM.modalOverlay?.classList.add('hidden');
            },

            async resolveTicket() {
                if (!this.DOM.resolveBtn) return;
                const ticketId = parseInt(this.DOM.resolveBtn.dataset.id);
                const resolutionText = document.getElementById('manager-resolution')?.value.trim();

                if (!resolutionText) {
                    alert("Vui lòng nhập tóm tắt giải quyết trước khi đóng ticket.");
                    return;
                }
                
                if (!confirm(`Bạn có chắc chắn muốn giải quyết Ticket ID ${ticketId} không?`)) {
                    return;
                }

                // Dữ liệu cần gửi đi
                const payload = {
                    status: "resolved" // Sử dụng key 'status' (hoặc key mà API của bạn mong đợi)
                };

                try {
                    // API POST /tc/resovle_tickets
                    const apiUrl = `/tc/tickets/${ticketId}/status`;
                    
                    const response = await fetch(apiUrl, {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                        throw new Error(`Lỗi Server (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                    }
                    
                    alert(`✅ Đã giải quyết Ticket ${ticketId} thành công.`);
                    this.closeModal();
                    this.fetchTickets(); // Tải lại danh sách

                } catch (error) {
                    console.error("Lỗi khi giải quyết Ticket:", error);
                    alert(`❌ Lỗi giải quyết Ticket: ${error.message}.`);
                }
            }
        },
        // ==================================================================
        // MODULE THÔNG BÁO 
        // ==================================================================
        AnnouncementManagement: {
            init() {
                this.DOM = {
                    form: document.getElementById('announcement-form'),
                    tableBody: document.getElementById('announcements-table-body'),
                    search: document.getElementById('announcement-history-search'),
                    sort: document.getElementById('announcement-history-sort'),
                    submitBtn: document.getElementById('submit-announcement-btn'),
                };
                this.bindEvents();
                this.renderAnnouncements();
            },

            bindEvents() {
                this.DOM.form?.addEventListener('submit', (e) => this.handleSubmit(e));
                this.DOM.tableBody?.addEventListener('click', (e) => this.handleTableActions(e));
                
                this.DOM.search?.addEventListener('input', () => this.renderAnnouncements());
                this.DOM.sort?.addEventListener('change', () => this.renderAnnouncements());
            },
            
            async fetchAnnouncements() {
                 if (this.DOM.tableBody && this.DOM.tableBody.innerHTML.indexOf("Đang tải") === -1) {
                     this.DOM.tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Đang tải danh sách thông báo...</td></tr>`;
                 }
                 
                 try {
                     // API GET /notify/notifications 
                     const response = await fetch(`/notify/notifications`, {
                         method: "GET",
                         headers: { "Authorization": `Bearer ${token}` }
                     });
                     
                     if (!response.ok) {
                         throw new Error(`Failed to fetch notifications (HTTP ${response.status})`);
                     }
                     
                     const data = await response.json();
                     MOCK_DATA.announcements = data || [];

                 } catch (error) {
                     console.error("Lỗi khi tải thông báo:", error);
                     if (this.DOM.tableBody) {
                         this.DOM.tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Lỗi tải dữ liệu thông báo.</td></tr>`;
                     }
                     MOCK_DATA.announcements = [];
                 }
            },

            async renderAnnouncements() {
                await this.fetchAnnouncements();
                
                if (!this.DOM.tableBody) return;
                this.DOM.tableBody.innerHTML = '';
                
                const searchTerm = this.DOM.search ? this.DOM.search.value.toLowerCase().trim() : '';
                const sortBy = this.DOM.sort ? this.DOM.sort.value : 'newest';
                
                let filteredAnnouncements = [...MOCK_DATA.announcements];
                
                // 1. Lọc theo Tiêu đề/Nội dung
                if (searchTerm) {
                    filteredAnnouncements = filteredAnnouncements.filter(ann => 
                        ann.title?.toLowerCase().includes(searchTerm) ||
                        ann.message?.toLowerCase().includes(searchTerm)
                    );
                }

                // 2. Sắp xếp theo Ngày tạo (created_at)
                filteredAnnouncements.sort((a, b) => {
                    const dateA = Helpers.parseDateForSort(a.created_at);
                    const dateB = Helpers.parseDateForSort(b.created_at);
                    return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
                });
                
                if (filteredAnnouncements.length === 0) {
                     this.DOM.tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Không tìm thấy thông báo nào.</td></tr>`;
                     return;
                }

                // 3. Render (Chỉ 3 cột: Tiêu đề, Nội dung tóm tắt, Ngày tạo + Hành động)
                filteredAnnouncements.forEach(ann => {
                    const row = this.DOM.tableBody.insertRow();
                    row.innerHTML = `
                        <td>${ann.title}</td>
                        <td>${ann.message ? ann.message : 'N/A'}</td>
                        <td>${Helpers.formatDate(ann.created_at)}</td>
                    `;
                });
            },

            async handleSubmit(e) {
                e.preventDefault();
                const title = document.getElementById('announcement-title').value.trim();
                const content = document.getElementById('announcement-content').value.trim();

                if (!title || !content) {
                     alert("Vui lòng nhập đầy đủ Tiêu đề và Nội dung.");
                     return;
                }
                
                const submitBtn = this.DOM.submitBtn;
                if (!submitBtn) return;

                submitBtn.disabled = true;

                try {
                     // API POST /tc/new_notification
                     const payload = {
                        title: title,
                        message: content                        
                    };
                    
                    console.log("Gửi payload thông báo:", payload);
                    const response = await fetch(`/tc/notifications/create?user_id=${currentUserId}`, {
                        method: "POST",
                        headers: { 
                            "Content-Type": "application/json", // RẤT QUAN TRỌNG
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify(payload) // Gửi dữ liệu dưới dạng JSON
                    });
                     
                     if (!response.ok) {
                         const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                         throw new Error(`Lỗi Server: ${errorData.detail || response.statusText}`);
                     }

                     alert(`✅ Đã gửi thông báo "${title}" thành công!`);
                     await this.renderAnnouncements();
                     this.DOM.form?.reset();

                 } catch (error) {
                     console.error("Lỗi khi gửi thông báo:", error);
                     alert(`❌ Lỗi gửi thông báo: ${error.message}.`);
                 } finally {
                     submitBtn.disabled = false;
                 }
            },
            
            handleTableActions(e) {
                const target = e.target.closest('.delete-btn');
                if (!target) return;
                const annId = parseInt(target.dataset.id);

                if (confirm(`Bạn có chắc chắn muốn xóa thông báo ID ${annId} không?`)) {
                    // MOCK: Giả định xóa thành công (Do chưa có API Delete)
                    MOCK_DATA.announcements = MOCK_DATA.announcements.filter(a => String(a.notification_id) !== String(annId));
                    this.renderAnnouncements();
                    alert(`Đã xóa thông báo ID ${annId}.`);
                }
            }
        },

        // ==================================================================
        // MODULE BÁO CÁO 
        // ==================================================================
        ReportManagement: {
            chart: null,

            init() {
                this.DOM = {
                    generateBtn: document.getElementById('generate-report-btn'),
                    resultsContainer: document.getElementById('report-results-container'),
                    reportNewStudents: document.getElementById('report-new-students'),
                    reportNewClasses: document.getElementById('report-new-classes'),
                    reportAttendanceRate: document.getElementById('report-attendance-rate'),
                    reportResolvedTickets: document.getElementById('report-resolved-tickets'),
                    dateRangeSelect: document.getElementById('date-range'),
                };
                this.bindEvents();
                // Khởi tạo chart trống
                const ctx = document.getElementById('report-chart')?.getContext('2d');
                if (ctx) this.renderBarChart([], 30);
            },

            bindEvents() {
                this.DOM.generateBtn?.addEventListener('click', () => this.generateReport());
            },
            
            getDaysFromDateRange(rangeValue) {
                switch (rangeValue) {
                    case 'last_7_days': return 7;
                    case 'last_30_days': return 30;
                    case 'this-month': return 30; 
                    case 'last-month': return 30; 
                    case 'all-time': return 3650; 
                    default: return 30;
                }
            },
            
            async fetchReportData(managerId, days) {
                 try {
                     // API GET /manager/reports/overview?manager_id={manager_id}&days={days}
                     const url = `/manager/reports/overview?manager_id=${managerId}&days=${days}`;
                     
                     const response = await fetch(url, {
                         method: "GET",
                         headers: {
                             "Content-Type": "application/json",
                             "Authorization": `Bearer ${token}`
                         }
                     });
                     
                     if (!response.ok) {
                         const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                         throw new Error(`Lỗi tải báo cáo (HTTP ${response.status}): ${errorData.detail || response.statusText}`);
                     }
                     
                     const reportData = await response.json();
                     return reportData;

                 } catch (error) {
                     console.error("Lỗi khi fetch báo cáo:", error);
                     return null;
                 }
            },

            async generateReport() {
                this.DOM.resultsContainer?.classList.add('hidden');
                
                const managerId = currentUserId || 1; 
                if (!this.DOM.dateRangeSelect) return;

                const days = this.getDaysFromDateRange(this.DOM.dateRangeSelect.value);
                const overviewData = await this.fetchReportData(managerId, days);
                
                if (!overviewData) {
                    this.DOM.resultsContainer?.classList.remove('hidden');
                    alert('❌ Không thể tạo báo cáo. Vui lòng kiểm tra console để biết thêm chi tiết.');
                    return;
                }

                if (this.DOM.reportNewStudents) this.DOM.reportNewStudents.textContent = overviewData.new_students || 0;
                if (this.DOM.reportNewClasses) this.DOM.reportNewClasses.textContent = overviewData.new_classes || 0;
                
                const rate = overviewData.attendance_rate;
                let attendanceDisplay;
                if (rate === null || rate === undefined || isNaN(rate)) {
                    attendanceDisplay = 'N/A';
                } else {
                    attendanceDisplay = parseFloat(rate).toFixed(1); 
                }
                if (this.DOM.reportAttendanceRate) this.DOM.reportAttendanceRate.textContent = `${attendanceDisplay}%`;
                
                if (this.DOM.reportResolvedTickets) this.DOM.reportResolvedTickets.textContent = overviewData.resolved_tickets || 0;
                
                const barChartData = [
                    overviewData.new_students || 0,
                    overviewData.new_classes || 0,
                    overviewData.resolved_tickets || 0
                ];
                
                this.renderBarChart(barChartData, days);
                
                this.DOM.resultsContainer?.classList.remove('hidden');
                alert('✅ Báo cáo đã được tạo thành công!');
            },
            
            renderBarChart(data, days) {
                const ctx = document.getElementById('report-chart')?.getContext('2d');
                if (!ctx) return;
                
                if (this.chart) {
                    this.chart.destroy();
                }

                this.chart = new Chart(ctx, {
                    type: 'bar', 
                    data: {
                        labels: ['Học viên mới', 'Lớp học mới', 'Ticket đã GQ'],
                        datasets: [{
                            label: `So sánh KPI (${days === 3650 ? 'toàn bộ thời gian' : days + ' ngày qua'})`,
                            data: data,
                            backgroundColor: ['#4A6CF7', '#FBBF24', '#10B981'],
                            borderColor: ['#4A6CF7', '#FBBF24', '#10B981'],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Số lượng'
                                },
                                ticks: {
                                    callback: function(value) {if (value % 1 === 0) {return value;}}
                                }
                            }
                        },
                        plugins: {
                            title: {
                                display: true,
                                text: `So sánh các chỉ số đếm được trong ${days === 3650 ? 'toàn bộ thời gian' : days + ` ngày qua`} `
                            }
                        }
                    }
                });
            }
        }
    };

    ManagerDashboardApp.init();
});